# Patna GIS Map 🗺️

Interactive GIS web app for **Patna, Bihar** — roads, malls, apartments, open/vacant lands, hospitals, schools and supermarkets within a **5 km radius**, plus a practical guide to checking **Bihar land records (khata / khesra / new PID)** on official government portals.

Live demo: open `index.html` in a browser (or serve the folder with any static server).

## Features

- 🛣️ **Road network** — all OSM roads in 5 km, styled by class (highway → street), with total road km
- 🏬 **Malls**, 🏢 **apartment complexes**, 🌳 **open/vacant land**, 🏥🏫 **hospitals & schools**, 🛒 **supermarkets** — toggleable layers
- 🔍 **Place search** — Nominatim search biased to the Patna area with fly-to
- 📍 **5 km radius circle** around Patna Junction (25.5941° N, 85.1376° E)
- 🗂️ **Land Records tab** — khata/khesra/mauza/jamabandi/PID explained, step-by-step official lookup, disputed-land verification checklist
- 🌙 Dark UI, mobile-friendly with collapsible panel, 24-hour local data cache

## Data sources

| What | Source |
|---|---|
| Map tiles, roads, POIs | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), queried live via [Overpass API](https://overpass-api.de/) |
| Place search | [Nominatim](https://nominatim.openstreetmap.org/) |
| Land records | Govt. of Bihar portals — **linked, never scraped**: [Bhulekh](http://biharbhumi.bihar.gov.in/), [Nibandhan](https://nibandhan.bihar.gov.in), [Land Records](https://landrecords.bihar.gov.in) |

## Optional: Google Maps base layers

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the Maps JavaScript API** (billing required).
2. Create an API key (restrict it to your domain).
3. Paste it into `js/config.js` → `googleMapsApiKey: "YOUR_KEY"`.
4. Reload — Google Roadmap / Satellite / Hybrid appear in the layer control.

## Run locally

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

## Important notes / limitations

- **OpenStreetMap is community data** — coverage of Patna (especially vacant plots) may be incomplete. You can improve it at openstreetmap.org.
- **No bulk land-record extraction is performed.** Bihar's record portals use CAPTCHAs and session controls; bulk scraping would violate their terms. Ownership, khata/khesra and dispute status must be checked per-plot on the official portals.
- **There is no public dataset of "disputed lands."** The app includes a verification checklist instead — always confirm with revenue/court records and a local property lawyer before any transaction.

## License

MIT — see [LICENSE](LICENSE).
