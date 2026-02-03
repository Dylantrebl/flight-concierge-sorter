# Flight Concierge Sorter – Custom Apify Actor

**No third-party actors.** This actor (1) **fetches** flight data from Skyscanner and Kayak itself (Playwright), then (2) **filters and sorts** using the same criteria as Flight Concierge. You can also use it in **sort-only mode** by passing `flightOffers` from any source.

## Filter options (same as Flight Concierge)

| Input | Description |
|-------|-------------|
| `maxPrice` | Only offers at or below this price |
| `minPrice` | Only offers at or above this price |
| `maxStops` | Only offers with at most this many stops (0 = direct only) |
| `directOnly` | If true, only keep direct airline booking URLs (exclude OTAs like Kayak/Expedia) |
| `includeAirlines` | Only offers that have at least one leg with these carrier codes (e.g. `["AA", "UA"]`) |
| `excludeAirlines` | Exclude offers that have any leg with these carrier codes |

All filter fields are optional. Filters are applied first, then sort.

## Sort options

| `sortBy`         | Description              |
|------------------|--------------------------|
| `price_asc`      | Price low → high         |
| `price_desc`     | Price high → low         |
| `duration_asc`   | Shortest duration first  |
| `duration_desc`  | Longest duration first   |
| `stops_asc`      | Fewest stops first       |
| `stops_desc`     | Most stops first         |
| `departure_asc`  | Earliest departure first |
| `departure_desc` | Latest departure first   |
| `score_desc`     | Best preference score first |

## Two modes

### Search mode (actor fetches from Skyscanner + Kayak)

Send **origin**, **destination**, **departDate** (and optionally returnDate, adults, currency, cabinClass). Leave **flightOffers** empty or omit it. The actor will:

1. Open Skyscanner and Kayak with Playwright and run the search.
2. Combine results, then apply filters and sort.
3. Push filtered+sorted offers to the dataset.

No third-party Apify actors are used; all scraping runs inside this actor.

### Sort-only mode

Send **flightOffers** (array of offer objects) plus **sortBy** and optional filters. The actor only filters and sorts; it does not fetch. Use this when you have offers from another source (API, file, etc.).

## Input (search mode)

- **origin**, **destination** (IATA, e.g. JFK, LAX), **departDate** (YYYY-MM-DD), **returnDate** (optional), **adults**, **currency**, **cabinClass**.
- **sortBy** and filter options (same as below).

## Input (sort-only mode)

- **flightOffers** (array): Each item can have `price`, `totalDurationMinutes`, `stops`, `legs`/`segments`, `bookingUrl`, `preferenceScore`.
- **sortBy** (string): One of the sort options above (default: `price_asc`).
- **maxPrice**, **minPrice**, **maxStops**, **directOnly**, **includeAirlines**, **excludeAirlines**: optional filters.

Output is filtered then sorted, one item per dataset row.

## Run locally

1. Install [Apify CLI](https://docs.apify.com/cli/docs/installation): `npm i -g apify`
2. From this folder:
   ```bash
   cd apify-actor
   npm install
   apify run
   ```
3. Optional: put test input in `storage/key_value_stores/default/INPUT.json` (see `.actor/input_schema.json` for shape).

## Deploy to Apify

```bash
apify login
apify push
```

Then run the actor from the Apify Console or API with your `flightOffers` and `sortBy`.

## Use from Flight Concierge backend

With **providers disabled** (default), the backend calls this actor in **search mode**: it sends `origin`, `destination`, `departDate`, etc., and the actor fetches from Skyscanner and Kayak itself, then returns filtered+sorted offers. No other Apify actors are used. Set `APIFY_API_KEY` and optionally `APIFY_SORTER_ACTOR_ID` (default: `copilotapp/flight-concierge-sorter`).
