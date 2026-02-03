# Flight Concierge Sorter – Custom Apify Actor

Our own Apify actor that **filters and sorts** flight offers using the **same criteria and settings as Flight Concierge**: max price, min price, max stops, direct-airline-only, include/exclude airlines, then sort by price, duration, stops, departure, or score.

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

## Input

- **flightOffers** (array): Flight offer objects (e.g. from Skyscanner/Kayak actors). Each item can have:
  - `price` (number or `{ amount, currency }`)
  - `totalDurationMinutes`, `stops`, `legs`/`segments` (with `carrier`, `departure.time`)
  - `bookingUrl` (used for direct-only filter)
  - `preferenceScore` for score sort
- **sortBy** (string): One of the sort options above (default: `price_asc`).
- **maxPrice**, **minPrice**, **maxStops**, **directOnly**, **includeAirlines**, **excludeAirlines**: optional filters (see table above).

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

You can call this actor from the Java backend after fetching from Skyscanner/Kayak:

1. Deploy the actor and note its actor ID (e.g. `YOUR_USERNAME/flight-concierge-sorter`).
2. In `application.yml`, add:
   - `api.apify.flight-concierge-sorter-actor-id: YOUR_USERNAME/flight-concierge-sorter`
3. In `ApifyService`, add a method that:
   - Builds input `{ "flightOffers": list, "sortBy": "price_asc" }`
   - Runs this actor (same run + poll + dataset flow as Skyscanner/Kayak)
   - Reads sorted items from the dataset.

Alternatively, sort in the backend (e.g. in `FlightSearchService` or in the chatbot’s sort handler) and use this actor only when you want sorting to happen on Apify (e.g. for scheduled jobs or external API consumers).
