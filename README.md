# Flight Concierge Sorter – Custom Apify Actor

Our own Apify actor that **sorts flight offers** by price, duration, stops, departure time, or preference score. Use it standalone or chain it after other actors (e.g. Skyscanner/Kayak scrapers).

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

- **flightOffers** (array): Flight offer objects. Each item can have:
  - `price` (number or `{ amount, currency }`)
  - `totalDurationMinutes` / `duration` / `durationMinutes`
  - `stops` or derived from `legs`/`segments`
  - `legs[].departure.time` (or `date`) for departure sort
  - `preferenceScore` for score sort
- **sortBy** (string): One of the options above (default: `price_asc`).

Output is the same array, in sorted order, in the run’s default dataset.

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
