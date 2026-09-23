# Patna GIS Map 🗺️

Interactive GIS web app for **Patna district, Bihar** — roads, malls, apartments, open/vacant lands, hospitals, schools and supermarkets within a **15 km radius** of Patna Junction (expanded from 5 km + 10 km extra), plus a practical guide to checking **Bihar land records (khata / khesra / new PID)** on official government portals.

Live demo: open `index.html` in a browser (or serve the folder with any static server).

## Features

- 🛣️ **Road network** — all OSM roads in 15 km, styled by class (highway → street), with total road km
- 🏬 **Malls**, 🏢 **apartment complexes**, 🌳 **open/vacant land**, 🏥🏫 **hospitals & schools**, 🛒 **supermarkets** — toggleable layers
- 📊 **Highway accessibility zones** — 286-zone color-coded grid (high/moderate/low) from open Patna corridor research
- 🏥 **Roadside facilities (280)** — hospitals, fuel pumps, police stations, colleges with highway-distance info
- 🔀 **Highway intersections (12)** — named major junctions with intersecting roads
- 🏷️ **Sample property listings** — 7 demo listings with plot polygons & prices (clearly marked as demo data)
- 🗺️ **Patna district boundary** overlay + **15 km radius** circle around Patna Junction (25.5941° N, 85.1376° E)
- 🔍 **Place search with autocomplete** — built-in Patna locality gazetteer (e.g. Anandpuri) answers instantly, Nominatim backs up everything else, with fly-to
- 📋 **Plot Lookup assistant** — enter anchal → mauza → khata/khesra to get a personalized step-by-step checklist for the official portals (Jamabandi on Bihar Bhumi, plot maps on Bhu Naksha), find the mauza on the map, and jump to the portal
- 🏘️ **Property Listings tab** — pin your own For Sale / For Rent / For Lease listings on the map (pick on map or geocode the locality), with quick links to 99acres, MagicBricks and Housing.com. ✅ appears only when a RERA number is entered (verify at rera.bihar.gov.in); everything else is marked ⚠️ unverified. Saved in your browser only.
- 📍 **5 km radius circle** around Patna Junction (25.5941° N, 85.1376° E)
- 🗂️ **Land Records tab** — khata/khesra/mauza/jamabandi/PID explained, step-by-step official lookup, disputed-land verification checklist
- 🌙 Dark UI, mobile-friendly with collapsible panel, 24-hour local data cache

## Base map comparison

All built-in base maps are **free with no API key**. Google Maps is listed for reference only.

| Base map | Cost | Key needed | Satellite | Topo / terrain | Dark mode | Best for |
|---|---|---|---|---|---|---|
| OpenStreetMap Standard | Free | No | — | — | — | Default street detail, richest POI labels |
| CARTO Light (Positron) | Free | No | — | — | — | Clean minimal backdrop for data overlays |
| CARTO Dark Matter | Free | No | — | — | ✅ | Matches this app's dark UI |
| Esri World Imagery | Free | No | ✅ | — | — | **Best free satellite** — inspect plots, vacant land |
| Esri World Street Map | Free | No | — | — | — | Polished street cartography |
| Esri World Topo Map | Free | No | — | ✅ | — | Elevation, terrain context (flood analysis) |
| OpenTopoMap | Free | No | — | ✅ | — | Contour lines, hiking-style detail (zoom ≤ 17) |
| Google Maps / Satellite | Paid (billing) | Yes | ✅ | ✅ | — | Only if you specifically need Google's data |

**Verdict:** Esri World Imagery wins for free satellite (no key, global coverage); OpenStreetMap Standard wins for street/POI detail; Esri Topo wins for terrain. Switch between all of them from the layer control (top-right).

## Data sources

| What | Source |
|---|---|
| Map tiles, roads, POIs | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), queried live via [Overpass API](https://overpass-api.de/) |
| Free satellite imagery | [Esri World Imagery](https://www.esri.com/) — no API key or billing needed |
| Patna district boundary | Bundled `data/patna_boundary.geojson`, from the [Patna-Flood-WebGIS](https://github.com/vibhalakra04-dev/Patna-Flood-WebGIS) project |
| Highway accessibility grid, roadside facilities, intersections | Bundled `data/analysis/`, from [gis-highway-accessibility-patna](https://github.com/Lakshyaitis/gis-highway-accessibility-patna) (highway network & accessibility analysis, Patna corridor) |
| Sample property listings (demo) | Bundled `data/sample_listings.geojson`, adapted from [patnapropertyhub](https://github.com/abhishekkumarai/patnapropertyhub) (broker contact details removed) |
| RoR field reference (khata/khasra) | Field dictionary from [ror_bihar_2022](https://github.com/in-rolls/ror_bihar_2022); record data itself is restricted to researchers, so only the field reference is used |
| Place search | Built-in Patna locality gazetteer (`data/patna_localities.json`, hand-compiled, approx. locations marked) + [Nominatim](https://nominatim.openstreetmap.org/) |
| Plot Lookup assistant | Guided form (20 Patna anchals) linking out to [Bihar Bhumi](http://biharbhumi.bihar.gov.in/) (Jamabandi) and [Bhu Naksha](https://bhunaksha.bihar.gov.in/) (cadastral plot maps); no record data is fetched — portals require their own security code |
| User property listings | Entered by the visitor in the Listings tab; stored in browser localStorage only, never uploaded |
| Property portals | Linked, not scraped: [99acres](https://www.99acres.com/), [MagicBricks](https://www.magicbricks.com/), [Housing.com](https://housing.com/) (they block automated copying) |
| ✅ verified tick | Shown only when a RERA registration number is entered; verify at [rera.bihar.gov.in](https://rera.bihar.gov.in/) — listings without one are marked ⚠️ unverified |
| Land records | Govt. of Bihar portals — **linked, never scraped**: [Bhulekh](http://biharbhumi.bihar.gov.in/), [Nibandhan](https://nibandhan.bihar.gov.in), [Land Records](https://landrecords.bihar.gov.in) |

## Optional: Google Maps base layers (paid)

Free satellite is already built in via Esri World Imagery — no key needed. Only add a Google key if you specifically want Google's roadmap/satellite:

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
