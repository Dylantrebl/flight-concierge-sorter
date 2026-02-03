/**
 * Flight Concierge Sorter - Custom Apify Actor
 * Filters and sorts flight offers using the same criteria as Flight Concierge:
 * maxPrice, minPrice, maxStops, directOnly, includeAirlines, excludeAirlines + sortBy.
 * Output: filtered and sorted items in the default dataset.
 */

const { Actor } = require('apify');

// Same OTA/airline domains as backend DirectOnlyFilterService
const OTA_DOMAINS = new Set([
    'expedia.com', 'booking.com', 'priceline.com', 'kayak.com',
    'orbitz.com', 'travelocity.com', 'cheaptickets.com',
    'hotwire.com', 'agoda.com', 'hotels.com'
]);
const AIRLINE_DOMAINS = new Set([
    'united.com', 'aa.com', 'delta.com', 'southwest.com',
    'jetblue.com', 'alaskaair.com', 'britishairways.com',
    'lufthansa.com', 'airfrance.com', 'klm.com',
    'virgin-atlantic.com', 'qantas.com', 'emirates.com'
]);

const SORT_OPTIONS = {
    price_asc: 'price_asc',
    price_desc: 'price_desc',
    duration_asc: 'duration_asc',
    duration_desc: 'duration_desc',
    stops_asc: 'stops_asc',
    stops_desc: 'stops_desc',
    departure_asc: 'departure_asc',
    departure_desc: 'departure_desc',
    score_desc: 'score_desc',
};

function getPrice(item) {
    const p = item.price;
    if (p == null) return null;
    if (typeof p === 'number') return p;
    if (typeof p.amount === 'number') return p.amount;
    if (typeof p.total === 'number') return p.total;
    return null;
}

function getDurationMinutes(item) {
    if (typeof item.totalDurationMinutes === 'number') return item.totalDurationMinutes;
    if (typeof item.duration === 'number') return item.duration;
    if (typeof item.durationMinutes === 'number') return item.durationMinutes;
    return null;
}

function getStops(item) {
    if (typeof item.stops === 'number') return item.stops;
    const legs = item.legs || item.segments || item.flights;
    if (Array.isArray(legs)) return Math.max(0, legs.length - 1);
    return null;
}

function getDepartureTime(item) {
    const legs = item.legs || item.segments || item.flights;
    if (!Array.isArray(legs) || legs.length === 0) return null;
    const first = legs[0];
    const dep = first.departure || first.departure_airport;
    if (!dep) return null;
    const t = dep.time || dep.date;
    if (typeof t === 'string') return new Date(t).getTime();
    return null;
}

function getPreferenceScore(item) {
    const s = item.preferenceScore;
    if (typeof s === 'number') return s;
    return null;
}

function getCarriers(item) {
    const legs = item.legs || item.segments || item.flights;
    if (!Array.isArray(legs)) return [];
    return legs.map(leg => leg.carrier || leg.airline).filter(Boolean);
}

function extractDomain(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    try {
        const u = new URL(url.startsWith('http') ? url : 'https://' + url);
        const host = u.hostname.toLowerCase();
        return host.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function isDirectAirline(item) {
    if (item.isDirectAirline === true) return true;
    const url = item.bookingUrl || item.bookingLink || item.url || '';
    if (!url || !url.trim()) return false;
    const domain = extractDomain(url);
    if (!domain) return false;
    if (AIRLINE_DOMAINS.has(domain)) return true;
    if (OTA_DOMAINS.has(domain)) return false;
    const legs = item.legs || item.segments || item.flights;
    const carrier = Array.isArray(legs) && legs[0] ? (legs[0].carrier || legs[0].airline) : null;
    if (carrier && domain.includes(carrier.toLowerCase())) return true;
    return false;
}

function applyFilters(offers, input) {
    let out = [...offers];
    const maxPrice = input.maxPrice != null ? Number(input.maxPrice) : null;
    const minPrice = input.minPrice != null ? Number(input.minPrice) : null;
    const maxStops = input.maxStops != null ? Number(input.maxStops) : null;
    const directOnly = input.directOnly === true;
    const includeAirlines = Array.isArray(input.includeAirlines) ? input.includeAirlines.map(String) : [];
    const excludeAirlines = Array.isArray(input.excludeAirlines) ? input.excludeAirlines.map(String) : [];

    if (minPrice != null && !Number.isNaN(minPrice)) {
        out = out.filter(o => (getPrice(o) ?? 0) >= minPrice);
    }
    if (maxPrice != null && !Number.isNaN(maxPrice)) {
        out = out.filter(o => (getPrice(o) ?? Infinity) <= maxPrice);
    }
    if (maxStops != null && !Number.isNaN(maxStops)) {
        out = out.filter(o => (getStops(o) ?? Infinity) <= maxStops);
    }
    if (directOnly) {
        out = out.filter(o => isDirectAirline(o));
    }
    if (includeAirlines.length > 0) {
        const set = new Set(includeAirlines.map(s => s.toUpperCase()));
        out = out.filter(o => getCarriers(o).some(c => set.has(String(c).toUpperCase())));
    }
    if (excludeAirlines.length > 0) {
        const set = new Set(excludeAirlines.map(s => s.toUpperCase()));
        out = out.filter(o => !getCarriers(o).some(c => set.has(String(c).toUpperCase())));
    }
    return out;
}

function compare(sortBy, a, b) {
    switch (sortBy) {
        case SORT_OPTIONS.price_asc: {
            const pa = getPrice(a) ?? Infinity;
            const pb = getPrice(b) ?? Infinity;
            return pa - pb;
        }
        case SORT_OPTIONS.price_desc: {
            const pa = getPrice(a) ?? -Infinity;
            const pb = getPrice(b) ?? -Infinity;
            return pb - pa;
        }
        case SORT_OPTIONS.duration_asc: {
            const da = getDurationMinutes(a) ?? Infinity;
            const db = getDurationMinutes(b) ?? Infinity;
            return da - db;
        }
        case SORT_OPTIONS.duration_desc: {
            const da = getDurationMinutes(a) ?? -Infinity;
            const db = getDurationMinutes(b) ?? -Infinity;
            return db - da;
        }
        case SORT_OPTIONS.stops_asc: {
            const sa = getStops(a) ?? Infinity;
            const sb = getStops(b) ?? Infinity;
            return sa - sb;
        }
        case SORT_OPTIONS.stops_desc: {
            const sa = getStops(a) ?? -Infinity;
            const sb = getStops(b) ?? -Infinity;
            return sb - sa;
        }
        case SORT_OPTIONS.departure_asc: {
            const ta = getDepartureTime(a) ?? Infinity;
            const tb = getDepartureTime(b) ?? Infinity;
            return ta - tb;
        }
        case SORT_OPTIONS.departure_desc: {
            const ta = getDepartureTime(a) ?? -Infinity;
            const tb = getDepartureTime(b) ?? -Infinity;
            return tb - ta;
        }
        case SORT_OPTIONS.score_desc: {
            const sa = getPreferenceScore(a) ?? -Infinity;
            const sb = getPreferenceScore(b) ?? -Infinity;
            return sb - sa;
        }
        default:
            return 0;
    }
}

Actor.main(async () => {
    const input = await Actor.getInput();
    const { flightOffers = [], sortBy = SORT_OPTIONS.price_asc } = input;

    if (!Array.isArray(flightOffers) || flightOffers.length === 0) {
        Actor.log.info('No flight offers to process.');
        return;
    }

    const filtered = applyFilters(flightOffers, input);
    Actor.log.info(`Filtered: ${flightOffers.length} -> ${filtered.length} offers`);

    const validSort = Object.values(SORT_OPTIONS).includes(sortBy) ? sortBy : SORT_OPTIONS.price_asc;
    const sorted = [...filtered].sort((a, b) => compare(validSort, a, b));

    for (const item of sorted) {
        await Actor.pushData(item);
    }
    Actor.log.info(`Filtered and sorted ${sorted.length} flight offers by: ${validSort}`);
});
