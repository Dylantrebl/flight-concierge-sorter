/**
 * Flight Concierge Sorter - Custom Apify Actor
 * Sorts flight offers by price, duration, stops, departure time, or preference score.
 * Input: flightOffers (array), sortBy (string).
 * Output: same items in sorted order in the default dataset.
 */

const { Actor } = require('apify');

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
        Actor.log.info('No flight offers to sort.');
        return;
    }

    const validSort = Object.values(SORT_OPTIONS).includes(sortBy) ? sortBy : SORT_OPTIONS.price_asc;
    const sorted = [...flightOffers].sort((a, b) => compare(validSort, a, b));

    for (const item of sorted) {
        await Actor.pushData(item);
    }
    Actor.log.info(`Sorted ${sorted.length} flight offers by: ${validSort}`);
});
