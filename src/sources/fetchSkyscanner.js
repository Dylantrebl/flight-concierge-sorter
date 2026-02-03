/**
 * Fetch flight offers from Skyscanner by scraping the website.
 * No third-party Apify actors – uses Playwright in this actor.
 */

const { chromium } = require('playwright');

const BASE = 'https://www.skyscanner.com';

function buildSearchUrl(origin, destination, departDate, returnDate, adults = 1, currency = 'USD') {
    const o = (origin || '').toLowerCase().replace(/\s/g, '');
    const d = (destination || '').toLowerCase().replace(/\s/g, '');
    if (!o || !d || !departDate) return null;
    let path = `/transport/flights-from/${o}/to/${d}/${departDate}/`;
    if (returnDate) path += returnDate + '/';
    return BASE + path;
}

/**
 * Extract offer-like objects from the page. Skyscanner renders client-side; we try common data shapes.
 */
async function extractOffers(page) {
    return page.evaluate(() => {
        const offers = [];
        try {
            // Try __NEXT_DATA__ (Next.js) or similar
            const nextData = document.getElementById('__NEXT_DATA__');
            if (nextData && nextData.textContent) {
                const data = JSON.parse(nextData.textContent);
                const props = data.props?.pageProps || data.props || {};
                const itineraries = props.initialState?.results?.itineraries || props.itineraries || props.results?.itineraries || [];
                if (Array.isArray(itineraries) && itineraries.length > 0) {
                    itineraries.slice(0, 50).forEach((it, i) => {
                        const price = it.pricing?.options?.[0]?.price?.amount ?? it.price?.amount ?? it.minPrice ?? 0;
                        const legs = it.legs || it.slices || it.segments || [];
                        offers.push({
                            price: { amount: Number(price), currency: 'USD' },
                            totalDurationMinutes: it.duration || (legs.reduce((s, l) => s + (l.duration || 0), 0)),
                            stops: Math.max(0, (legs.length || 1) - 1),
                            legs: legs.map(l => ({
                                carrier: l.carrier?.id || l.marketingCarrier?.id,
                                departure: l.departure ? { airport: l.departure.origin?.id || l.departure.from, time: l.departure.time || l.departure.dateTime } : undefined,
                                arrival: l.arrival ? { airport: l.arrival.destination?.id || l.arrival.to, time: l.arrival.time || l.arrival.dateTime } : undefined,
                                durationMinutes: l.duration
                            })),
                            bookingUrl: it.bookingUrl || it.deeplink || 'https://www.skyscanner.com/booking'
                        });
                    });
                    if (offers.length > 0) return offers;
                }
            }
            // Fallback: look for data in window
            const w = window;
            if (w.__INITIAL_STATE__?.results?.itineraries) {
                w.__INITIAL_STATE__.results.itineraries.slice(0, 50).forEach(it => {
                    offers.push({
                        price: { amount: it.price?.amount ?? it.minPrice ?? 0, currency: 'USD' },
                        totalDurationMinutes: it.duration || 0,
                        stops: Math.max(0, (it.legs?.length || 1) - 1),
                        legs: (it.legs || []).map(l => ({ carrier: l.carrier?.id, departure: l.departure, arrival: l.arrival, durationMinutes: l.duration })),
                        bookingUrl: it.bookingUrl || 'https://www.skyscanner.com/booking'
                    });
                });
            }
        } catch (e) {
            console.warn('Extract error', e);
        }
        return offers;
    });
}

/**
 * Fetch offers from Skyscanner for the given search params.
 * @param {{ origin: string, destination: string, departDate: string, returnDate?: string, adults?: number, currency?: string }} input
 * @returns {Promise<Array<object>>}
 */
async function fetchFromSkyscanner(input, log) {
    const url = buildSearchUrl(
        input.origin,
        input.destination,
        input.departDate,
        input.returnDate,
        input.adults ?? 1,
        input.currency ?? 'USD'
    );
    if (!url) {
        log.warn('Skyscanner: missing origin, destination or departDate');
        return [];
    }
    log.info('Skyscanner: fetching ' + url);
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(8000);
        const offers = await extractOffers(page);
        await browser.close().catch(() => {});
        log.info('Skyscanner: extracted ' + offers.length + ' offers');
        return offers;
    } catch (e) {
        log.warn('Skyscanner fetch failed: ' + (e && e.message));
        if (browser) await browser.close().catch(() => {});
        return [];
    }
}

module.exports = { fetchFromSkyscanner, buildSearchUrl };
