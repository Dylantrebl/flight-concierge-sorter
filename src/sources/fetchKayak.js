/**
 * Fetch flight offers from Kayak using Hybrid Interception.
 * No HTML parsing – intercept the internal JSON API response (/s/horizon/flights/results/Poll).
 * Uses residential proxy and closes the browser immediately after capturing JSON.
 */

const { chromium } = require('playwright');
const { Actor } = require('apify');

const BASE = 'https://www.kayak.com';
// Match Poll endpoint (path can vary: /s/horizon/flights/results/Poll or similar)
function isPollUrl(url) {
    const u = (url || '').toLowerCase();
    return u.includes('flights') && u.includes('results') && u.includes('poll');
}
const INTERCEPT_TIMEOUT_MS = 45000;

function buildSearchUrl(origin, destination, departDate, returnDate, adults = 1, cabinClass = 'economy') {
    const o = (origin || '').toUpperCase().replace(/\s/g, '');
    const d = (destination || '').toUpperCase().replace(/\s/g, '');
    if (!o || !d || !departDate) return null;
    let path = `/flights/${o}-${d}/${departDate}`;
    if (returnDate) path += `/${returnDate}`;
    path += '?sort=bestflight_a';
    if (adults > 1) path += '&adults=' + adults;
    if (cabinClass && cabinClass !== 'economy') path += '&cabin=' + cabinClass;
    return BASE + path;
}

/**
 * Check if the intercepted JSON contains actual flight data (itineraryId or itineraries).
 */
function hasFlightData(body) {
    if (!body || typeof body !== 'object') return false;
    if (body.itineraryId != null) return true;
    const itineraries = body.itineraries || body.results?.itineraries || body.data?.itineraries;
    if (Array.isArray(itineraries) && itineraries.length > 0) return true;
    const listings = body.listings || body.results?.listings || body.data?.listings;
    if (Array.isArray(listings) && listings.length > 0) return true;
    return false;
}

/**
 * Normalize Kayak Poll response to our flight-offer shape.
 * Handles common internal shapes (itineraries, listings, legs, segments).
 */
function normalizePollBodyToOffers(body, log) {
    const offers = [];
    const itineraries = body.itineraries || body.results?.itineraries || body.data?.itineraries
        || body.listings || body.results?.listings || body.data?.listings || [];
    if (!Array.isArray(itineraries)) return offers;

    for (const it of itineraries) {
        try {
            const priceObj = it.price || it.totalPrice || it.pricing?.options?.[0];
            const amount = priceObj?.value ?? priceObj?.amount ?? it.amount ?? 0;
            const currency = priceObj?.currency || it.currency || body.currency || 'USD';
            const segments = it.segments || it.legs || it.slices || it.flights || [];
            const totalDuration = it.duration ?? it.totalDuration ?? segments.reduce((s, seg) => s + (seg.duration || seg.durationMinutes || 0), 0);

            offers.push({
                price: { amount: Number(amount), currency },
                totalDurationMinutes: totalDuration,
                stops: Math.max(0, (segments.length || 1) - 1),
                legs: segments.map(seg => ({
                    carrier: seg.carrier?.code || seg.operatingCarrier?.code || seg.marketingCarrier?.code || seg.carrierId,
                    departure: seg.departure ? {
                        airport: seg.departure.airport?.code || seg.departure.origin?.code || seg.origin,
                        time: seg.departure.time || seg.departure.dateTime || seg.departure.datetime
                    } : undefined,
                    arrival: seg.arrival ? {
                        airport: seg.arrival.airport?.code || seg.arrival.destination?.code || seg.destination,
                        time: seg.arrival.time || seg.arrival.dateTime || seg.arrival.datetime
                    } : undefined,
                    durationMinutes: seg.duration ?? seg.durationMinutes
                })),
                bookingUrl: it.bookingUrl || it.deeplink || it.url || 'https://www.kayak.com/flights',
                rawItineraryId: it.itineraryId || it.id
            });
        } catch (e) {
            log.debug('Kayak: skip one itinerary parse error', e?.message);
        }
    }
    return offers;
}

/**
 * Fetch from Kayak via Hybrid Interception: goto page, wait for Poll JSON, normalize, close browser.
 * Uses residential proxy when running on Apify. On timeout or no flight data, returns [] so the run can complete with other sources.
 *
 * @param {{ origin: string, destination: string, departDate: string, returnDate?: string, adults?: number, cabinClass?: string }} input
 * @param {{ info: Function, warn: Function, debug?: Function }} log
 * @returns {Promise<Array<object>>}
 */
async function fetchFromKayak(input, log) {
    const url = buildSearchUrl(
        input.origin,
        input.destination,
        input.departDate,
        input.returnDate,
        input.adults ?? 1,
        input.cabinClass ?? 'economy'
    );
    if (!url) {
        log.warn('Kayak: missing origin, destination or departDate');
        return [];
    }
    log.info('Kayak: fetching ' + url + ' (intercepting Poll response)');

    let browser;
    try {
        let launchOptions = { headless: true };
        try {
            const proxyConfiguration = await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'] });
            if (proxyConfiguration) {
                const proxyUrl = await proxyConfiguration.newUrl();
                if (proxyUrl) {
                    launchOptions.proxy = { server: proxyUrl };
                    log.info('Kayak: using residential proxy');
                }
            }
        } catch (proxyErr) {
            log.warn('Kayak: proxy config failed, continuing without proxy', proxyErr?.message);
        }

        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage();

        const responsePromise = page
            .waitForResponse(
                (resp) => isPollUrl(resp.url()) && resp.ok(),
                { timeout: INTERCEPT_TIMEOUT_MS }
            )
            .catch((err) => {
                log.warn('Kayak fetch failed (returning 0 offers): ' + (err?.message));
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
            log.warn('Kayak: No flight data in Poll response (missing itineraryId/itineraries).');
            return [];
        }

        const offers = normalizePollBodyToOffers(body, log);
        log.info('Data captured. Closing browser...');
        await browser.close().catch(() => {});

        log.info('Kayak: intercepted and normalized ' + offers.length + ' offers');
        return offers;
    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        log.warn('Kayak fetch failed (returning 0 offers): ' + (e && e.message));
        return [];
    }
}

module.exports = { fetchFromKayak, buildSearchUrl };
