/**
 * Fetch flight offers from Kayak by scraping the website.
 * No third-party Apify actors – uses Playwright in this actor.
 */

const { chromium } = require('playwright');

const BASE = 'https://www.kayak.com';

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

async function extractOffers(page) {
    return page.evaluate(() => {
        const offers = [];
        try {
            const scripts = document.querySelectorAll('script#__NEXT_DATA__, script[type="application/json"]');
            for (const el of scripts) {
                if (!el.textContent) continue;
                try {
                    const data = JSON.parse(el.textContent);
                    const props = data.props?.pageProps || data.props || {};
                    const searchResults = props.searchResults || props.results || props.data?.searchResults;
                    const listings = searchResults?.listings || searchResults?.flights || searchResults?.itineraries || [];
                    if (Array.isArray(listings) && listings.length > 0) {
                        listings.slice(0, 50).forEach(it => {
                            const price = it.price?.value ?? it.totalPrice?.amount ?? it.amount ?? 0;
                            const segments = it.segments || it.legs || it.slices || [];
                            offers.push({
                                price: { amount: Number(price), currency: it.price?.currency || it.currency || 'USD' },
                                totalDurationMinutes: it.duration || it.totalDuration || segments.reduce((s, seg) => s + (seg.duration || 0), 0),
                                stops: Math.max(0, (segments.length || 1) - 1),
                                legs: segments.map(seg => ({
                                    carrier: seg.carrier?.code || seg.operatingCarrier?.code || seg.marketingCarrier?.code,
                                    departure: seg.departure ? { airport: seg.departure.airport?.code || seg.origin, time: seg.departure.time || seg.departure.dateTime } : undefined,
                                    arrival: seg.arrival ? { airport: seg.arrival.airport?.code || seg.destination, time: seg.arrival.time || seg.arrival.dateTime } : undefined,
                                    durationMinutes: seg.duration
                                })),
                                bookingUrl: it.bookingUrl || it.deeplink || it.url || 'https://www.kayak.com/flights'
                            });
                        });
                        if (offers.length > 0) return offers;
                    }
                } catch (_) {}
            }
            if (window.__INITIAL_STATE__?.search?.results?.listings) {
                window.__INITIAL_STATE__.search.results.listings.slice(0, 50).forEach(it => {
                    offers.push({
                        price: { amount: it.price?.value ?? 0, currency: 'USD' },
                        totalDurationMinutes: it.duration || 0,
                        stops: Math.max(0, (it.segments?.length || 1) - 1),
                        legs: (it.segments || []).map(s => ({ carrier: s.carrier?.code, departure: s.departure, arrival: s.arrival, durationMinutes: s.duration })),
                        bookingUrl: it.bookingUrl || 'https://www.kayak.com/flights'
                    });
                });
            }
        } catch (e) {
            console.warn('Kayak extract error', e);
        }
        return offers;
    });
}

/**
 * @param {{ origin: string, destination: string, departDate: string, returnDate?: string, adults?: number, currency?: string, cabinClass?: string }} input
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
    log.info('Kayak: fetching ' + url);
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(10000);
        const offers = await extractOffers(page);
        await browser.close().catch(() => {});
        log.info('Kayak: extracted ' + offers.length + ' offers');
        return offers;
    } catch (e) {
        log.warn('Kayak fetch failed: ' + (e && e.message));
        if (browser) await browser.close().catch(() => {});
        return [];
    }
}

module.exports = { fetchFromKayak, buildSearchUrl };
