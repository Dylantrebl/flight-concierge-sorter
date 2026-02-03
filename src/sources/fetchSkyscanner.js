/**
 * Fetch flight offers from Skyscanner using Hybrid Interception.
 * No HTML parsing – intercept internal JSON API responses (poll / itineraries / live).
 * Uses residential proxy and closes the browser immediately after capturing JSON.
 */

const { chromium } = require('playwright');
const { Actor } = require('apify');

const BASE = 'https://www.skyscanner.com';
const INTERCEPT_TIMEOUT_MS = 45000;

// URL patterns that indicate flight results API (web app uses various hosts)
const RESULT_URL_PATTERNS = [
    '/poll',
    '/itineraries',
    '/flights/live',
    '/v3/flights/live',
    'live/search/poll'
];

function buildSearchUrl(origin, destination, departDate, returnDate, adults = 1) {
    const o = (origin || '').toLowerCase().replace(/\s/g, '');
    const d = (destination || '').toLowerCase().replace(/\s/g, '');
    if (!o || !d || !departDate) return null;
    let path = `/transport/flights-from/${o}/to/${d}/${departDate}/`;
    if (returnDate) path += returnDate + '/';
    return BASE + path;
}

function isResultsApiUrl(url) {
    const u = (url || '').toLowerCase();
    return RESULT_URL_PATTERNS.some(p => u.includes(p));
}

function hasFlightData(body) {
    if (!body || typeof body !== 'object') return false;
    const itineraries = body.itineraries || body.content?.results?.itineraries || body.results?.itineraries;
    if (Array.isArray(itineraries) && itineraries.length > 0) return true;
    const options = body.pricing?.options || body.options;
    if (Array.isArray(options) && options.length > 0) return true;
    if (body.status === 'RESULT_STATUS_COMPLETE' && (body.itineraries?.length || body.content?.results?.itineraries?.length)) return true;
    return false;
}

/**
 * Normalize Skyscanner API response to our flight-offer shape.
 */
function normalizeBodyToOffers(body, log) {
    const offers = [];
    const itineraries = body.itineraries || body.content?.results?.itineraries || body.results?.itineraries || [];
    if (!Array.isArray(itineraries)) return offers;

    for (const it of itineraries) {
        try {
            const priceObj = it.pricing?.options?.[0] || it.price || it.pricing;
            const amount = priceObj?.price?.amount ?? priceObj?.amount ?? it.minPrice ?? 0;
            const currency = priceObj?.price?.currency || priceObj?.currency || body.currency || 'USD';
            const legs = it.legs || it.slices || it.segments || it.flights || [];
            const totalDuration = it.duration ?? legs.reduce((s, l) => s + (l.duration || l.durationMinutes || 0), 0);

            offers.push({
                price: { amount: Number(amount), currency },
                totalDurationMinutes: totalDuration,
                stops: Math.max(0, (legs.length || 1) - 1),
                legs: legs.map(leg => ({
                    carrier: leg.carrier?.id || leg.marketingCarrier?.id || leg.carrierId,
                    departure: leg.departure ? {
                        airport: leg.departure.origin?.id || leg.departure.from?.id || leg.departure.airport,
                        time: leg.departure.time || leg.departure.dateTime || leg.departure.datetime
                    } : undefined,
                    arrival: leg.arrival ? {
                        airport: leg.arrival.destination?.id || leg.arrival.to?.id || leg.arrival.airport,
                        time: leg.arrival.time || leg.arrival.dateTime || leg.arrival.datetime
                    } : undefined,
                    durationMinutes: leg.duration ?? leg.durationMinutes
                })),
                bookingUrl: it.bookingUrl || it.deeplink || it.booking_details?.deeplink || 'https://www.skyscanner.com/booking'
            });
        } catch (e) {
            log.debug?.('Skyscanner: skip one itinerary parse error', e?.message);
        }
    }
    return offers;
}

/**
 * Fetch from Skyscanner via Hybrid Interception: goto page, wait for results API JSON, normalize, close browser.
 *
 * @param {{ origin: string, destination: string, departDate: string, returnDate?: string, adults?: number }} input
 * @param {{ info: Function, warn: Function, debug?: Function }} log
 * @returns {Promise<Array<object>>}
 */
async function fetchFromSkyscanner(input, log) {
    const url = buildSearchUrl(
        input.origin,
        input.destination,
        input.departDate,
        input.returnDate,
        input.adults ?? 1
    );
    if (!url) {
        log.warn('Skyscanner: missing origin, destination or departDate');
        return [];
    }
    log.info('Skyscanner: fetching ' + url + ' (intercepting API response)');

    let browser;
    try {
        let launchOptions = { headless: true };
        try {
            const proxyConfiguration = await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'] });
            if (proxyConfiguration) {
                const proxyUrl = await proxyConfiguration.newUrl();
                if (proxyUrl) {
                    launchOptions.proxy = { server: proxyUrl };
                    log.info('Skyscanner: using residential proxy');
                }
            }
        } catch (proxyErr) {
            log.warn('Skyscanner: proxy config failed, continuing without proxy', proxyErr?.message);
        }

        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage();

        const responsePromise = page
            .waitForResponse(
                (resp) => {
                    if (!resp.ok()) return false;
                    if (!isResultsApiUrl(resp.url())) return false;
                    const ct = (resp.headers()['content-type'] || '').toLowerCase();
                    return ct.includes('application/json');
                },
                { timeout: INTERCEPT_TIMEOUT_MS }
            )
            .catch((err) => {
                log.warn('Skyscanner fetch failed (returning 0 offers): ' + (err?.message));
                return null;
            });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const response = await responsePromise;
        if (response === null) {
            await browser.close().catch(() => {});
            return [];
        }
        const body = await response.json();

        if (!hasFlightData(body)) {
            await browser.close().catch(() => {});
            log.warn('Skyscanner: No flight data in intercepted response.');
            return [];
        }

        const offers = normalizeBodyToOffers(body, log);
        log.info('Data captured. Closing browser...');
        await browser.close().catch(() => {});

        log.info('Skyscanner: intercepted and normalized ' + offers.length + ' offers');
        return offers;
    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        log.warn('Skyscanner fetch failed (returning 0 offers): ' + (e && e.message));
        return [];
    }
}

module.exports = { fetchFromSkyscanner, buildSearchUrl };
