/* ---- Patna GIS Map : configuration ----
   Put your Google Maps JavaScript API key below to enable
   Google Roadmap / Satellite / Hybrid base layers.
   (Google Cloud Console -> enable "Maps JavaScript API" -> billing -> copy key)
*/
window.PATNA_CONFIG = {
  center: [25.5941, 85.1376],          // Patna Junction
  centerLabel: "Patna Junction, Patna, Bihar",
  radiusMeters: 15000,                  // 15 km coverage (5 km + extra 10 km)
  defaultZoom: 13,

  googleMapsApiKey: "",                // <-- paste key here, e.g. "AIzaSy..."

  overpassUrl: "https://overpass-api.de/api/interpreter",
  overpassFallbackUrl: "https://overpass.kumi.systems/api/interpreter",
  nominatimUrl: "https://nominatim.openstreetmap.org/search",

  cacheKey: "patna-gis-overpass-v2",
  cacheTtlMs: 24 * 3600 * 1000,        // 24 hours

  portals: {
    bhulekh: "http://biharbhumi.bihar.gov.in/",
    biharbhumi: "http://biharbhumi.bihar.gov.in/",
    bhunaksha: "https://bhunaksha.bihar.gov.in/",
    nibandhan: "https://nibandhan.bihar.gov.in",
    landrecords: "https://landrecords.bihar.gov.in"
  }
};
