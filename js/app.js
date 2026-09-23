/* ============================================================
   Patna GIS Map — live OpenStreetMap data via Overpass API
   Layers: roads, malls, apartments, open lands, amenities, shops
   ============================================================ */
(function () {
  "use strict";
  const cfg = window.PATNA_CONFIG;
  const [CLAT, CLON] = cfg.center;
  const R = cfg.radiusMeters;

  /* ---------- map ---------- */
  const map = L.map("map", { zoomControl: true }).setView(cfg.center, cfg.defaultZoom);

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const cartoDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
  });

  const baseLayers = { "OpenStreetMap": osm, "Dark": cartoDark };

  // Free base maps — no API key or billing needed for any of these
  const cartoLight = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
  });
  const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
  });
  const esriStreet = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, OpenStreetMap contributors'
  });
  const esriTopo = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, OpenStreetMap contributors, GIS user community'
  });
  const openTopo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | style &copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA)'
  });
  baseLayers["Light"] = cartoLight;
  baseLayers["Satellite (Esri, free)"] = esriSat;
  baseLayers["Streets (Esri, free)"] = esriStreet;
  baseLayers["Topo (Esri, free)"] = esriTopo;
  baseLayers["Topo (OpenTopoMap)"] = openTopo;

  /* ---------- radius circle ---------- */
  const radiusCircle = L.circle(cfg.center, {
    radius: R, color: "#38bdf8", weight: 2, dashArray: "8 6",
    fillColor: "#38bdf8", fillOpacity: 0.04
  }).addTo(map).bindTooltip("15 km radius", { sticky: true });

  /* ---------- Patna district boundary (bundled free GeoJSON) ---------- */
  const boundaryLayer = L.layerGroup().addTo(map);
  fetch("data/patna_boundary.geojson")
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(gj => {
      L.geoJSON(gj, { style: { color: "#38bdf8", weight: 2.5, dashArray: "6 4", fill: false } })
        .bindTooltip("Patna district boundary")
        .addTo(boundaryLayer);
    })
    .catch(e => console.warn("boundary load failed:", e));

  /* ---------- feature layers ---------- */
  const LAYERS = {
    roads:      { label: "Roads",            color: "#e2e8f0", group: L.layerGroup().addTo(map) },
    malls:      { label: "Malls",            color: "#f472b6", group: L.layerGroup().addTo(map), icon: "🏬" },
    apartments: { label: "Apartments",       color: "#fb923c", group: L.layerGroup().addTo(map) },
    openland:   { label: "Open / vacant land", color: "#4ade80", group: L.layerGroup().addTo(map) },
    amenities:  { label: "Hospitals & schools", color: "#60a5fa", group: L.layerGroup().addTo(map) },
    shops:      { label: "Supermarkets",     color: "#c084fc", group: L.layerGroup().addTo(map), icon: "🛒" }
  };
  const counts = { roads: 0, malls: 0, apartments: 0, openland: 0, amenities: 0, shops: 0 };
  let roadKm = 0;

  const ROAD_STYLE = {
    motorway:    { color: "#ef4444", weight: 5 },
    trunk:       { color: "#ef4444", weight: 4 },
    primary:     { color: "#f59e0b", weight: 4 },
    secondary:   { color: "#facc15", weight: 3 },
    tertiary:    { color: "#e2e8f0", weight: 2.5 },
    residential: { color: "#94a3b8", weight: 1.6 },
    unclassified:{ color: "#94a3b8", weight: 1.6 },
    service:     { color: "#64748b", weight: 1.2 }
  };

  /* ---------- optional Google Maps base layers ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true; s.defer = true;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  async function initGoogleLayers() {
    if (!cfg.googleMapsApiKey) return;
    try {
      await loadScript("https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(cfg.googleMapsApiKey));
      await loadScript("https://unpkg.com/leaflet.gridlayer.googlemutant@0.14.0/Leaflet.GoogleMutant.js");
      if (typeof L.gridLayer.googleMutant !== "function") throw new Error("plugin missing");
      layerControl.addBaseLayer(L.gridLayer.googleMutant({ type: "roadmap" }), "Google Maps");
      layerControl.addBaseLayer(L.gridLayer.googleMutant({ type: "satellite" }), "Google Satellite");
      layerControl.addBaseLayer(L.gridLayer.googleMutant({ type: "hybrid" }), "Google Hybrid");
      toast("Google Maps layers enabled.", false);
    } catch (e) {
      console.warn("Google layers unavailable:", e);
    }
  }

  const overlayMaps = {};
  Object.keys(LAYERS).forEach(k => { overlayMaps[LAYERS[k].label] = LAYERS[k].group; });
  const layerControl = L.control.layers(baseLayers, overlayMaps, { collapsed: false }).addTo(map);
  layerControl.remove(); // we use our own sidebar toggles; keep control for base layers only
  L.control.layers(baseLayers, null, { position: "topright" }).addTo(map);
  initGoogleLayers();

  /* ---------- helpers ---------- */
  function el(name) { return document.getElementById(name); }
  function toast(msg, isError) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    t.style.background = isError ? "#7f1d1d" : "#14532d";
    t.style.borderColor = isError ? "#ef4444" : "#22c55e";
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add("hidden"), 5000);
  }
  function geomToLatLngs(g) { return g.map(p => [p.lat, p.lon]); }
  function isClosed(latlngs) {
    if (latlngs.length < 4) return false;
    const a = latlngs[0], b = latlngs[latlngs.length - 1];
    return a[0] === b[0] && a[1] === b[1];
  }
  function segKm(latlngs) {
    // equirectangular approximation, good enough for a 5 km area
    let km = 0;
    const kx = 111.32 * Math.cos(CLAT * Math.PI / 180), ky = 110.57;
    for (let i = 1; i < latlngs.length; i++) {
      const dx = (latlngs[i][1] - latlngs[i - 1][1]) * kx;
      const dy = (latlngs[i][0] - latlngs[i - 1][0]) * ky;
      km += Math.sqrt(dx * dx + dy * dy);
    }
    return km;
  }
  function popupHtml(kind, tags, osmType, osmId) {
    const name = tags.name || tags["name:en"] || "(unnamed)";
    let extra = "";
    if (kind === "road" && tags.highway) extra = "<br>Type: " + tags.highway;
    if (tags["addr:full"]) extra += "<br>" + tags["addr:full"];
    return "<b>" + name + "</b>" + extra +
      '<br><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/' +
      osmType + "/" + osmId + '">View on OpenStreetMap ↗</a>';
  }
  function poiIcon(emoji) {
    return L.divIcon({ className: "", html: '<div class="poi-label">' + emoji + '</div>', iconSize: null });
  }

  /* ---------- render one Overpass element ---------- */
  function renderElement(e) {
    const t = e.tags || {};
    try {
      if (t.highway && e.type === "way" && e.geometry) {
        const ll = geomToLatLngs(e.geometry);
        const st = ROAD_STYLE[t.highway] || { color: "#94a3b8", weight: 1.4 };
        L.polyline(ll, { color: st.color, weight: st.weight, opacity: 0.9 })
          .bindPopup(popupHtml("road", t, e.type, e.id))
          .addTo(LAYERS.roads.group);
        counts.roads++; roadKm += segKm(ll);
        return;
      }
      if (t.shop === "mall") return addPoi(e, "malls", "🏬", "Mall");
      if (t.building === "apartments" && e.type === "way" && e.geometry)
        return addPoly(e, "apartments", "Apartment complex");
      if (t.landuse || t.leisure === "park" || t.leisure === "garden")
        return e.type === "way" && e.geometry ? addPoly(e, "openland", "Open land") : null;
      if (t.amenity && /^(hospital|school|college|university)$/.test(t.amenity))
        return addPoi(e, "amenities", t.amenity === "hospital" ? "🏥" : "🏫", t.amenity);
      if (t.shop && /^(supermarket|department_store)$/.test(t.shop))
        return addPoi(e, "shops", "🛒", "Supermarket");
    } catch (err) { console.warn("render failed", err); }
  }

  function centroid(e) {
    if (e.type === "node") return [e.lat, e.lon];
    const g = geomToLatLngs(e.geometry);
    let la = 0, lo = 0;
    g.forEach(p => { la += p[0]; lo += p[1]; });
    return [la / g.length, lo / g.length];
  }
  function addPoi(e, layerKey, emoji, kind) {
    const c = centroid(e);
    L.marker(c, { icon: poiIcon(emoji) })
      .bindPopup(popupHtml(kind, e.tags || {}, e.type, e.id))
      .addTo(LAYERS[layerKey].group);
    counts[layerKey]++;
  }
  function addPoly(e, layerKey, kind) {
    const ll = geomToLatLngs(e.geometry);
    const col = LAYERS[layerKey].color;
    const shape = isClosed(ll)
      ? L.polygon(ll, { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.35 })
      : L.polyline(ll, { color: col, weight: 3 });
    shape.bindPopup(popupHtml(kind, e.tags || {}, e.type, e.id)).addTo(LAYERS[layerKey].group);
    counts[layerKey]++;
  }

  /* ---------- Overpass loading (with 24 h cache) ---------- */
  function buildQuery() {
    const a = "(around:" + R + "," + CLAT + "," + CLON + ")";
    return "[out:json][timeout:180];(" +
      'way["highway"]' + a + ";" +
      'nwr["shop"="mall"]' + a + ";" +
      'nwr["building"="apartments"]' + a + ";" +
      'nwr["landuse"~"^(grass|meadow|greenfield|brownfield|farmland)$"]' + a + ";" +
      'nwr["leisure"~"^(park|garden)$"]' + a + ";" +
      'nwr["amenity"~"^(hospital|school|college|university)$"]' + a + ";" +
      'nwr["shop"~"^(supermarket|department_store)$"]' + a + ";" +
      ");out geom;";
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(cfg.cacheKey);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.ts > cfg.cacheTtlMs) return null;
      return c.data;
    } catch (e) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(cfg.cacheKey, JSON.stringify({ ts: Date.now(), data })); }
    catch (e) { /* storage full / private mode — ignore */ }
  }

  async function fetchOverpass(url, query) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function loadData(force) {
    el("loading").classList.remove("hidden");
    Object.keys(LAYERS).forEach(k => { LAYERS[k].group.clearLayers(); counts[k] = 0; });
    roadKm = 0;
    try {
      let data = (!force) ? readCache() : null;
      if (!data) {
        const q = buildQuery();
        try { data = await fetchOverpass(cfg.overpassUrl, q); }
        catch (e1) {
          console.warn("primary Overpass failed, trying fallback", e1);
          data = await fetchOverpass(cfg.overpassFallbackUrl, q);
        }
        writeCache(data);
      }
      (data.elements || []).forEach(renderElement);
      updateStats();
      toast("Loaded live data: " + (data.elements || []).length + " features.", false);
    } catch (e) {
      console.error(e);
      el("stats").innerHTML = '<p class="hint">⚠️ Could not reach the Overpass API. Check your connection and press Reload.</p>';
      toast("Failed to load map data. Please retry.", true);
    } finally {
      el("loading").classList.add("hidden");
    }
  }

  function updateStats() {
    el("stats").innerHTML =
      "🛣️ Road segments: <b>" + counts.roads + "</b> (~" + roadKm.toFixed(1) + " km)<br>" +
      "🏬 Malls: <b>" + counts.malls + "</b><br>" +
      "🏢 Apartment complexes: <b>" + counts.apartments + "</b><br>" +
      "🌳 Open / vacant land patches: <b>" + counts.openland + "</b><br>" +
      "🏥🏫 Hospitals & schools: <b>" + counts.amenities + "</b><br>" +
      "🛒 Supermarkets: <b>" + counts.shops + "</b>";
    document.querySelectorAll("#layerToggles .count").forEach(s => {
      s.textContent = counts[s.dataset.key] || 0;
    });
  }

  /* ---------- sidebar layer toggles ---------- */
  function buildToggles() {
    const wrap = el("layerToggles");
    Object.keys(LAYERS).forEach(k => {
      const L_ = LAYERS[k];
      const row = document.createElement("label");
      row.className = "toggle-row";
      row.innerHTML = '<input type="checkbox" checked />' +
        '<span class="dot" style="background:' + L_.color + '"></span>' +
        "<span>" + L_.label + "</span>" +
        '<span class="count" data-key="' + k + '">0</span>';
      row.querySelector("input").addEventListener("change", ev => {
        if (ev.target.checked) map.addLayer(L_.group); else map.removeLayer(L_.group);
      });
      wrap.appendChild(row);
    });
    el("radiusToggle").addEventListener("change", ev => {
      if (ev.target.checked) map.addLayer(radiusCircle); else map.removeLayer(radiusCircle);
    });
    const brow = document.createElement("label");
    brow.className = "toggle-row";
    brow.innerHTML = '<input type="checkbox" checked />' +
      '<span class="dot" style="background:#38bdf8"></span>' +
      "<span>Patna district boundary</span>";
    brow.querySelector("input").addEventListener("change", ev => {
      if (ev.target.checked) map.addLayer(boundaryLayer); else map.removeLayer(boundaryLayer);
    });
    wrap.appendChild(brow);
    const rhead = document.createElement("div");
    rhead.innerHTML = '<h2 style="margin:14px 0 4px">Research overlays</h2><p class="hint">Open Patna research data. Accessibility &amp; facilities load on demand.</p>';
    wrap.appendChild(rhead);
    Object.keys(EXTRA).forEach(k => {
      const E = EXTRA[k];
      const on = (k === "junct" || k === "listings");
      const row = document.createElement("label");
      row.className = "toggle-row";
      row.innerHTML = '<input type="checkbox"' + (on ? " checked" : "") + " />" + "<span>" + E.label + "</span>";
      row.querySelector("input").addEventListener("change", ev => loadExtra(k, ev.target.checked));
      wrap.appendChild(row);
    });
  }

  /* ---------- legend ---------- */
  el("legend").innerHTML = "<b>Legend</b><br>" +
    '<span class="sw" style="background:#ef4444"></span>Major roads<br>' +
    '<span class="sw" style="background:#facc15"></span>Secondary roads<br>' +
    '<span class="sw" style="background:#94a3b8"></span>Streets<br>' +
    '<span class="swp" style="background:#f472b6"></span>Malls<br>' +
    '<span class="swp" style="background:#fb923c"></span>Apartments<br>' +
    '<span class="swp" style="background:#4ade80"></span>Open land<br>' +
    '<span class="sw" style="background:#38bdf8"></span>15 km radius<br>' +
    '<span class="sw" style="background:#38bdf8;opacity:.6"></span>District boundary';

  /* ---------- research overlays (open GitHub data on Patna) ---------- */
  const EXTRA = {
    access:   { label: "Highway accessibility zones", file: "data/analysis/patna_accessibility_grid.geojson", group: L.layerGroup(), loaded: false },
    hfac:     { label: "Roadside facilities (280)", file: "data/analysis/patna_facilities.geojson", group: L.layerGroup(), loaded: false },
    junct:    { label: "Highway intersections (12)", file: "data/analysis/patna_intersections.geojson", group: L.layerGroup(), loaded: false },
    listings: { label: "Sample property listings (demo)", file: "data/sample_listings.geojson", group: L.layerGroup(), loaded: false }
  };

  function renderAnalysis(key, gj) {
    const E = EXTRA[key];
    if (key === "access") {
      L.geoJSON(gj, {
        style: f => { const c = f.properties.color || "#999999"; return { color: c, weight: 0.6, fillColor: c, fillOpacity: 0.38 }; },
        onEachFeature: (f, l) => {
          const p = f.properties;
          l.bindPopup("<b>" + p.accessibility_class + "</b> (" + p.zone_id + ")<br>Score: " + p.score +
            "<br>To highway: " + Math.round(p.dist_to_highway_m) + " m<br>To facility: " + Math.round(p.dist_to_vital_facility_m) +
            " m<br><i>" + p.engineering_implication + "</i>");
        }
      }).addTo(E.group);
    } else if (key === "hfac") {
      const cols = { "Hospital / Healthcare": "#ef4444", "Fuel / Petrol Pump": "#f59e0b", "Police Station / Emergency": "#3b82f6", "College / University": "#8b5cf6" };
      L.geoJSON(gj, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: cols[f.properties.facility_type] || "#999999", weight: 1.5, fillOpacity: 0.85 }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          l.bindPopup("<b>" + p.facility_name + "</b><br>" + p.facility_type + "<br>Near: " + p.nearest_major_road + " (" + p.buffer_zone + ")");
        }
      }).addTo(E.group);
    } else if (key === "junct") {
      L.geoJSON(gj, {
        pointToLayer: (f, ll) => L.marker(ll, { icon: poiIcon("🔀") }),
        onEachFeature: (f, l) => {
          const p = f.properties;
          l.bindPopup("<b>" + p.junction_name + "</b><br>" + p.junction_type + "<br>" + p.intersecting_roads + "<br><i>" + p.significance + "</i>");
        }
      }).addTo(E.group);
    } else if (key === "listings") {
      const zc = { Residential: "#4ade80", Commercial: "#f472b6", Agricultural: "#facc15", Industrial: "#94a3b8" };
      L.geoJSON(gj, {
        style: f => { const c = zc[f.properties.zone] || "#999999"; return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.35 }; },
        onEachFeature: (f, l) => {
          const p = f.properties;
          l.bindPopup("<b>" + p.title + "</b><br>📍 " + p.locality + " · " + p.zone + "<br>💰 ₹" + p.price_lakh + " Lakh · " + p.size +
            "<br>⚠️ <i>Sample demo data — not a real listing.</i>");
        }
      }).addTo(E.group);
    }
  }

  function loadExtra(key, show) {
    const E = EXTRA[key];
    if (show && !E.loaded) {
      E.loaded = true; // prevent double fetch
      el("loading").classList.remove("hidden");
      fetch(E.file)
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(gj => { renderAnalysis(key, gj); map.addLayer(E.group); })
        .catch(e => { E.loaded = false; console.warn(key, "load failed:", e); toast("Could not load " + E.label + ".", true); })
        .finally(() => el("loading").classList.add("hidden"));
    } else if (show) { map.addLayer(E.group); }
    else { map.removeLayer(E.group); }
  }

  /* ---------- place search: Patna locality gazetteer + Nominatim autocomplete ---------- */
  let localities = [];
  let searchMarker = null;
  let suggestTimer = null;
  let currentSuggestions = [];

  fetch("data/patna_localities.json")
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(j => { localities = j; })
    .catch(e => console.warn("localities load failed:", e));

  function flyToPlace(lat, lon, label) {
    if (searchMarker) map.removeLayer(searchMarker);
    map.flyTo([lat, lon], 15, { duration: 1.2 });
    searchMarker = L.marker([lat, lon]).addTo(map).bindPopup("<b>" + label + "</b>").openPopup();
  }
  function shortName(display) { return display.split(",").slice(0, 3).join(",").trim(); }

  function renderSuggestions() {
    const box = el("searchResults");
    box.innerHTML = "";
    if (!currentSuggestions.length) { box.classList.add("hidden"); return; }
    currentSuggestions.forEach(s => {
      const d = document.createElement("div");
      d.className = "sr-item";
      d.innerHTML = (s.kind === "locality" ? "🏘️" : "🔍") + " <span>" + s.label + "</span>" +
        '<span class="tag">' + (s.kind === "locality" ? "Patna locality" : "map search") + "</span>";
      d.addEventListener("mousedown", ev => {
        ev.preventDefault();
        box.classList.add("hidden");
        el("searchInput").value = s.label;
        flyToPlace(s.lat, s.lon, s.label);
      });
      box.appendChild(d);
    });
    box.classList.remove("hidden");
  }

  async function suggest() {
    const q = el("searchInput").value.trim();
    if (q.length < 2) { el("searchResults").classList.add("hidden"); currentSuggestions = []; return; }
    const ql = q.toLowerCase();
    const out = localities
      .filter(p => p.name.toLowerCase().includes(ql))
      .slice(0, 6)
      .map(p => ({ kind: "locality", label: p.name + (p.approx ? " (approx.)" : ""), lat: p.lat, lon: p.lon }));
    try {
      const d = 0.16;
      const params = new URLSearchParams({
        format: "json", q: q, limit: "4",
        viewbox: (CLON - d) + "," + (CLAT + d) + "," + (CLON + d) + "," + (CLAT - d),
        bounded: "1"
      });
      const res = await fetch(cfg.nominatimUrl + "?" + params.toString(), { headers: { "Accept": "application/json" } });
      const arr = await res.json();
      const seen = out.map(s => s.label.toLowerCase().replace(" (approx.)", ""));
      arr.forEach(r => {
        const label = shortName(r.display_name);
        if (!seen.some(n => label.toLowerCase().includes(n))) {
          out.push({ kind: "remote", label: label, lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
        }
      });
    } catch (e) { /* offline — local results still show */ }
    currentSuggestions = out;
    renderSuggestions();
  }

  async function searchPlace() {
    const box = el("searchResults");
    if (currentSuggestions.length && !box.classList.contains("hidden")) {
      const s = currentSuggestions[0];
      box.classList.add("hidden");
      el("searchInput").value = s.label;
      flyToPlace(s.lat, s.lon, s.label);
      return;
    }
    const q = el("searchInput").value.trim();
    if (!q) return;
    const d = 0.16; // ~16 km box
    const params = new URLSearchParams({
      format: "json", q: q, limit: "5",
      viewbox: (CLON - d) + "," + (CLAT + d) + "," + (CLON + d) + "," + (CLAT - d),
      bounded: "1"
    });
    try {
      const res = await fetch(cfg.nominatimUrl + "?" + params.toString(), {
        headers: { "Accept": "application/json" }
      });
      const arr = await res.json();
      if (!arr.length) { toast("No results in Patna for '" + q + "'.", true); return; }
      const p = arr[0];
      flyToPlace(parseFloat(p.lat), parseFloat(p.lon), shortName(p.display_name));
    } catch (e) { toast("Search failed. Try again.", true); }
  }
  el("searchBtn").addEventListener("click", searchPlace);
  el("searchInput").addEventListener("input", () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(suggest, 350);
  });
  el("searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { clearTimeout(suggestTimer); searchPlace(); }
    if (e.key === "Escape") { el("searchResults").classList.add("hidden"); }
  });
  el("searchInput").addEventListener("blur", () => {
    setTimeout(() => el("searchResults").classList.add("hidden"), 200);
  });

  /* ---------- Plot Lookup: guided land-record search assistant ---------- */
  const PATNA_ANCHALS = ["Patna Sadar","Danapur","Bihta","Naubatpur","Bikram","Paliganj","Dulhin Bazar",
    "Masaurhi","Dhanarua","Punpun","Fatuha","Daniyawan","Khusrupur","Bakhtiyarpur","Barh",
    "Athmalgola","Mokama","Ghoswari","Pandarak","Belchhi"];
  const anchalSel = el("lkAnchal");
  if (anchalSel) PATNA_ANCHALS.forEach(a => {
    const o = document.createElement("option"); o.value = a; o.textContent = a; anchalSel.appendChild(o);
  });

  let lkService = "jamabandi";
  document.querySelectorAll('input[name="lkService"]').forEach(r => {
    r.addEventListener("change", () => { lkService = r.value; renderLkSteps(); });
  });

  function lkVal(id) { return (el(id).value || "").trim(); }

  function renderLkSteps() {
    const box = el("lkSteps");
    if (!box) return;
    const anchal = lkVal("lkAnchal") || "— select —";
    const mauza = lkVal("lkMauza") || "—";
    const khata = lkVal("lkKhata") || "—";
    const khesra = lkVal("lkKhesra") || "—";
    let steps;
    if (lkService === "jamabandi") {
      steps = [
        "Open the Bihar Bhumi portal (button below) → <b>अपना खाता देखें</b> (View Your Account).",
        "Select <b>District: Patna</b> → <b>Anchal: " + anchal + "</b> → <b>Mauza: " + mauza + "</b>.",
        "Search by <b>Khata " + khata + "</b> or <b>Khesra " + khesra + "</b> (or by raiyat name).",
        "Enter the on-screen security code and click Search, then the View icon.",
        "The Jamabandi Register-II opens — download or print it for your records."
      ];
    } else {
      steps = [
        "Open the Bhu Naksha portal (button below) → <b>View Map</b>.",
        "Select <b>District: Patna</b> → <b>Circle: " + anchal + "</b> → <b>Mauza: " + mauza + "</b>.",
        "Type plot no. <b>" + khesra + "</b> in the portal's top search bar and hit Search.",
        "Click the highlighted plot to see owner, area and classification; use the <b>LPM</b> tab for the PDF report."
      ];
    }
    box.innerHTML = "<b>Your lookup checklist:</b><ol>" + steps.map(s => "<li>" + s + "</li>").join("") + "</ol>" +
      "<p class='note'>Records open on the official portal (it uses a security code), so keep this checklist handy while you search there.</p>";
  }
  ["lkAnchal","lkMauza","lkKhata","lkKhesra"].forEach(id => {
    const n = el(id); if (n) n.addEventListener("input", renderLkSteps);
  });

  const lkOpen = el("lkOpen");
  if (lkOpen) lkOpen.addEventListener("click", () => {
    const url = lkService === "jamabandi" ? cfg.portals.biharbhumi : cfg.portals.bhunaksha;
    window.open(url, "_blank", "noopener");
  });

  const lkMap = el("lkFindMauza");
  if (lkMap) lkMap.addEventListener("click", async () => {
    const mauza = lkVal("lkMauza");
    if (!mauza) { toast("Enter a mauza / village name first.", true); return; }
    toast("Locating '" + mauza + "'…");
    try {
      const d = 0.35;
      const params = new URLSearchParams({
        format: "json", q: mauza + ", Patna, Bihar", limit: "3",
        viewbox: (CLON - d) + "," + (CLAT + d) + "," + (CLON + d) + "," + (CLAT - d),
        bounded: "1"
      });
      const res = await fetch(cfg.nominatimUrl + "?" + params.toString(), { headers: { "Accept": "application/json" } });
      const arr = await res.json();
      if (!arr.length) { toast("Mauza not found on the map — check the spelling.", true); return; }
      flyToPlace(parseFloat(arr[0].lat), parseFloat(arr[0].lon), mauza + " (mauza)");
    } catch (e) { toast("Map lookup failed. Try again.", true); }
  });
  renderLkSteps();

  /* ---------- tabs & mobile sidebar ---------- */
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      el("panel-" + btn.dataset.tab).classList.add("active");
    });
  });
  el("sidebarToggle").addEventListener("click", () => el("sidebar").classList.toggle("open"));

  el("reloadBtn").addEventListener("click", () => loadData(true));

  /* ---------- go ---------- */
  buildToggles();
  loadExtra("junct", true);
  loadExtra("listings", true);
  loadData(false);
})();
