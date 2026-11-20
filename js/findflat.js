/* ============================================================
   Patna GIS Map — "Find a Flat" tab
   Clean-room reimplementation of Flat Finder FEATURES for Patna.
   No Flat Finder code is used here (that repo has no licence, so its
   code is all-rights-reserved); this file is original, Leaflet-based,
   written for this site. Feature inspiration is credited in About.
   Data: data/patna_properties.json (DEMO DATA) + the user's own
   listings from localStorage (Listings tab). No scraping, no keys.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- small utils ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg, isError) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    t.style.background = isError ? "#7f1d1d" : "#14532d";
    t.style.borderColor = isError ? "#ef4444" : "#22c55e";
    clearTimeout(t._ff);
    t._ff = setTimeout(function () { t.classList.add("hidden"); }, 5000);
  }
  function fmtLakh(lakh) {
    // Indian formatting: ₹85 L / ₹1.25 Cr / ₹45,000
    if (lakh == null || !isFinite(lakh)) return "—";
    if (lakh >= 100) return "₹" + (lakh / 100).toFixed(lakh % 100 === 0 ? 0 : 2).replace(/\.?0+$/, "") + " Cr";
    return "₹" + Math.round(lakh) + " L";
  }
  function fmtMoney(lakh, estimated) {
    return (estimated ? "~" : "") + fmtLakh(lakh);
  }
  function fmtRent(n, estimated) {
    if (n == null || !isFinite(n)) return "—";
    return (estimated ? "~" : "") + "₹" + Math.round(n).toLocaleString("en-IN") + "/mo";
  }
  function fmtPsf(n) {
    if (n == null || !isFinite(n)) return "—";
    return "₹" + Math.round(n).toLocaleString("en-IN") + "/sq ft";
  }
  function fmtDist(m) {
    if (m == null || !isFinite(m)) return "—";
    return m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";
  }
  function fmtSqft(n) { return n == null ? "—" : Math.round(n).toLocaleString("en-IN") + " sq ft"; }
  function sqftToGaj(n) { return n == null ? null : n / 9; }
  function fmtArea(n) { // sq ft + gaj tooltip text
    if (n == null) return "—";
    return fmtSqft(n) + " (" + sqftToGaj(n).toFixed(0) + " gaj)";
  }
  function median(nums) {
    if (!nums.length) return null;
    const s = nums.slice().sort(function (a, b) { return a - b; });
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function downloadCSV(filename, rows) {
    const q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    const csv = rows.map(function (r) { return r.map(q).join(","); }).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ---------- constants ---------- */
  var CORE_AMEN = ["Lift", "Power Backup", "Security", "Parking", "Park", "Gym", "Swimming Pool", "Club House"];
  var ALL_AMEN = CORE_AMEN.concat(["Community Hall", "Jogging Track", "Kids Play Area",
    "Rainwater Harvesting", "Visitor Parking", "EV Charging", "Solar Power", "Temple"]);
  var NEARBY = [
    { key: "park", label: "Park", max: 500, unit: "500 m" },
    { key: "metro", label: "Metro / rail station", max: 1500, unit: "1.5 km" },
    { key: "school", label: "School", max: 1000, unit: "1 km" },
    { key: "hospital", label: "Hospital", max: 2000, unit: "2 km" },
    { key: "mall", label: "Mall / supermarket", max: 1500, unit: "1.5 km" }
  ];
  var TYPE_LABEL = { apartment: "Apartments", "builder-floor": "Builder floors", villa: "Villas", plot: "Plots", user: "Your listing" };
  var CONF_LABEL = { verified: "Verified (RERA no. given)", listed: "Listed", likely: "Probably fits (estimated)", unchecked: "Not checked yet" };
  var CONF_ORDER = ["verified", "listed", "likely", "unchecked"];
  var CONF_COLOR = { verified: "#2563eb", listed: "#2563eb", likely: "#f59e0b", unchecked: "#9ca3af", nomatch: "#334155" };
  var LS_MYLIST = "patna-gis-ff-mylist-v1";
  var LS_GUIDE = "patna-gis-ff-guide-seen-v1";
  var LS_USER = "patna-gis-user-listings-v1"; // same key as app.js Listings tab
  var RERA_URL = "https://rera.bihar.gov.in/";

  /* ---------- state ---------- */
  var S = {
    mode: "buy",               // 'buy' | 'rent'
    types: new Set(),          // property types
    bhks: new Set(),           // numbers; 5 means 5+
    amenities: new Set(),
    bedMode: "any",            // 'any' | 'area'
    bedUnit: "sqft",           // 'sqft' | 'gaj'
    bedAreaSqft: 0,            // min bedroom area in sq ft (when bedMode=area)
    sizeMin: 0, sizeMax: 8000,
    budgetMin: 0, budgetMax: 2000,   // lakh; 2000 = ₹20 Cr
    rentMax: 100000,           // ₹/month
    nearby: new Set(),         // keys of NEARBY
    readyOnly: false,
    includeLikely: true,
    myListOnly: false,
    sort: "best",
    searchQuery: "",           // from header search chip
    showPerGroup: {},          // group -> visible count
    lightTheme: false,
    glow: false,
    boundaries: false,
    names: false,
    tourOn: false
  };
  var DATA = [];               // all properties (demo + user)
  var myList = [];
  try { myList = JSON.parse(localStorage.getItem(LS_MYLIST) || "[]"); } catch (e) { myList = []; }
  function saveMyList() {
    try { localStorage.setItem(LS_MYLIST, JSON.stringify(myList)); } catch (e) { toast("Could not save My List.", true); }
  }
  function inMyList(id) { return myList.indexOf(id) !== -1; }
  function toggleMyList(id) {
    const i = myList.indexOf(id);
    if (i === -1) { myList.push(id); toast("Added to My List."); }
    else { myList.splice(i, 1); toast("Removed from My List."); }
    saveMyList();
    renderResults(); renderMarkers(); updateSearchStars();
  }

  /* ---------- user listings (Listings tab) -> Find-a-Flat shape ---------- */
  function userListingsAsProps() {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(LS_USER) || "[]"); } catch (e) { raw = []; }
    return raw.map(function (l, i) {
      const bhkM = /(\d)\s*bhk/i.exec(l.title || "");
      const bhk = bhkM ? parseInt(bhkM[1], 10) : null;
      // price strings like "₹85 L", "₹1.2 Cr", "₹15,000", "8500000"
      let priceLakh = null, rentMonthly = null;
      const p = (l.price || "").replace(/,/g, "");
      let m = /([\d.]+)\s*(cr|crore)/i.exec(p);
      if (m) priceLakh = parseFloat(m[1]) * 100;
      else if (/([\d.]+)\s*l/i.test(p)) priceLakh = parseFloat(/([\d.]+)\s*l/i.exec(p)[1]);
      else if (/(\d{5,})/.test(p)) priceLakh = parseFloat(/(\d{5,})/.exec(p)[1]) / 100000;
      if (l.type === "rent" && priceLakh != null) { rentMonthly = Math.round(priceLakh * 100000 / 12); priceLakh = null; }
      return {
        id: "user-" + i,
        name: l.title, developer: null, locality: l.locality || "",
        lat: l.lat, lng: l.lon, type: "user",
        offerType: l.type, towers: 0, totalUnits: 0, acres: null,
        possession: "Ready to move", rera: l.rera || null, source: "added by you",
        amenities: [], nearby: { park: null, metro: null, school: null, hospital: null, mall: null },
        ratings: null, reviews: [],
        bhkOptions: bhk ? [{
          bhk: bhk, sizeSqft: null, bedrooms: [], minBedFt: null,
          priceLakhMin: priceLakh, priceLakhMax: priceLakh, priceEstimated: false,
          rentMonthly: rentMonthly, rentEstimated: false, psf: null, source: "added by you"
        }] : [],
        priceLakhMin: priceLakh, priceLakhMax: priceLakh, priceEstimated: false,
        rentMonthly: rentMonthly, rentEstimated: false,
        sizeSqft: null, sizeText: null, zone: null,
        link: l.link || null, contact: l.contact || null,
        added: l.created || ""
      };
    });
  }

  /* ---------- scoring (Flat Finder formula, adapted) ---------- */
  // residents 50% + nearby 30% + amenities 20%. Residents part is "—" when
  // no ratings exist (never invented). Without residents, the total is
  // renormalised over nearby + amenities and labelled as such.
  function scoreOf(p) {
    let near = 0;
    NEARBY.forEach(function (n) {
      const d = p.nearby ? p.nearby[n.key] : null;
      if (d != null && d <= n.max) near += 2;
    });
    const nearScore = near; // 0..10
    const amenScore = Math.round((CORE_AMEN.filter(function (a) { return (p.amenities || []).indexOf(a) !== -1; }).length / CORE_AMEN.length) * 10 * 10) / 10;
    let resScore = null;
    if (p.ratings && typeof p.ratings.overall === "number") resScore = p.ratings.overall;
    let total, basis;
    if (resScore != null) {
      total = 0.5 * resScore + 0.3 * nearScore + 0.2 * amenScore;
      basis = "residents + nearby + amenities";
    } else {
      total = (0.3 * nearScore + 0.2 * amenScore) / 0.5;
      basis = "nearby + amenities only (no resident ratings yet)";
    }
    return { total: Math.round(total * 10) / 10, residents: resScore, nearby: nearScore, amenities: amenScore, basis: basis };
  }

  /* ---------- matching ---------- */
  function optionPasses(o, p) {
    // BHK
    if (S.bhks.size) {
      const ok = Array.from(S.bhks).some(function (b) { return b === 5 ? o.bhk >= 5 : o.bhk === b; });
      if (!ok) return false;
    }
    // home size (sq ft)
    if (o.sizeSqft != null && (o.sizeSqft < S.sizeMin || o.sizeSqft > S.sizeMax)) return false;
    // budget / rent
    if (S.mode === "buy") {
      if (o.priceLakhMin == null) return false;
      if (o.priceLakhMax < S.budgetMin || o.priceLakhMin > S.budgetMax) return false;
    } else {
      if (o.rentMonthly == null) return false;
      if (o.rentMonthly > S.rentMax) return false;
    }
    // smallest bedroom area
    if (S.bedMode === "area" && S.bedAreaSqft > 0) {
      if (!o.minBedFt) return "nocheck";
      const area = o.minBedFt[0] * o.minBedFt[1];
      if (area < S.bedAreaSqft) return false;
    }
    return true;
  }
  function matchProperty(p) {
    // type
    if (S.types.size && !S.types.has(p.type)) return null;
    // my list only
    if (S.myListOnly && !inMyList(p.id)) return null;
    // header search filter
    if (S.searchQuery) {
      const q = S.searchQuery.toLowerCase();
      const hay = ((p.name || "") + " " + (p.developer || "") + " " + (p.locality || "")).toLowerCase();
      if (hay.indexOf(q) === -1) return null;
    }
    // ready to move
    if (S.readyOnly && p.possession !== "Ready to move") return null;
    // amenities (all must be present)
    const missing = Array.from(S.amenities).some(function (a) { return (p.amenities || []).indexOf(a) === -1; });
    if (missing) return null;
    // nearby (all checked must be within range)
    const nearFail = Array.from(S.nearby).some(function (k) {
      const n = NEARBY.find(function (x) { return x.key === k; });
      const d = p.nearby ? p.nearby[k] : null;
      return d == null || d > n.max;
    });
    if (nearFail) return null;

    const hasBedData = (p.bhkOptions || []).some(function (o) { return !!o.minBedFt; });
    let matched = [];
    let noCheck = false;
    if (p.type === "plot") {
      // plots: no BHK/bedrooms; size + budget/rent only
      if (S.bhks.size) return null; // plots have no BHK
      if (p.sizeSqft != null && (p.sizeSqft < S.sizeMin || p.sizeSqft > S.sizeMax)) return null;
      if (S.mode === "buy") {
        if (p.priceLakhMin == null) return null;
        if (p.priceLakhMax < S.budgetMin || p.priceLakhMin > S.budgetMax) return null;
      } else return null; // plots have no rent
      return { p: p, options: [], confidence: "unchecked", estimated: false };
    }
    (p.bhkOptions || []).forEach(function (o) {
      const r = optionPasses(o, p);
      if (r === true) matched.push(o);
      else if (r === "nocheck") noCheck = true;
    });
    if (!matched.length) {
      // no option passed: either a real fail, or "not checked yet"
      if (noCheck || !hasBedData) {
        // only "not checked" if the property passes everything except the bedroom check
        const savedBed = S.bedMode; S.bedMode = "any";
        const recheck = (p.bhkOptions || []).some(function (o) { return optionPasses(o, p) === true; });
        S.bedMode = savedBed;
        if (recheck || !hasBedData) {
          if (!S.includeLikely && false) return null;
          return { p: p, options: [], confidence: "unchecked", estimated: false };
        }
      }
      return null;
    }
    // confidence
    let estimated = matched.some(function (o) {
      return S.mode === "rent" ? o.rentEstimated : o.priceEstimated;
    });
    const allEstimated = matched.every(function (o) {
      return S.mode === "rent" ? o.rentEstimated : o.priceEstimated;
    });
    let conf = "listed";
    if (p.rera) conf = "verified";
    else if (allEstimated && estimated) conf = "likely";
    else if (!hasBedData) conf = "unchecked";
    if (conf === "likely" && !S.includeLikely) return null;
    return { p: p, options: matched, confidence: conf, estimated: estimated };
  }
  function applyFilters() {
    const out = [];
    DATA.forEach(function (p) {
      const m = matchProperty(p);
      if (m) out.push(m);
    });
    return out;
  }
  function sortMatches(list) {
    const rank = { verified: 0, listed: 1, likely: 2, unchecked: 3 };
    const priceOf = function (m) {
      if (m.p.type === "plot") return S.mode === "buy" ? m.p.priceLakhMin : null;
      const vals = m.options.map(function (o) {
        return S.mode === "buy" ? (o.priceLakhMin + o.priceLakhMax) / 2 : o.rentMonthly;
      }).filter(function (v) { return v != null; });
      return median(vals);
    };
    const arr = list.slice();
    if (S.sort === "price-asc") arr.sort(function (a, b) { return (priceOf(a) || 1e12) - (priceOf(b) || 1e12); });
    else if (S.sort === "price-desc") arr.sort(function (a, b) { return (priceOf(b) || -1) - (priceOf(a) || -1); });
    else if (S.sort === "bedrooms") arr.sort(function (a, b) {
      const mb = function (m) { return Math.max.apply(null, m.options.map(function (o) { return o.bhk; }).concat([0])); };
      return mb(b) - mb(a);
    });
    else if (S.sort === "newest") arr.sort(function (a, b) { return String(b.p.added || "").localeCompare(String(a.p.added || "")); });
    else arr.sort(function (a, b) {
      const r = rank[a.confidence] - rank[b.confidence];
      if (r) return r;
      return scoreOf(b.p).total - scoreOf(a.p).total;
    });
    return arr;
  }
  function medianPrice(m) {
    if (m.p.type === "plot") return { value: m.p.priceLakhMin, estimated: !!m.p.priceEstimated, kind: "price" };
    const vals = m.options.map(function (o) {
      return S.mode === "buy" ? (o.priceLakhMin + o.priceLakhMax) / 2 : o.rentMonthly;
    }).filter(function (v) { return v != null; });
    const est = m.options.some(function (o) { return S.mode === "buy" ? o.priceEstimated : o.rentEstimated; });
    return { value: median(vals), estimated: est, kind: S.mode === "buy" ? "price" : "rent" };
  }

  /* ---------- results rendering ---------- */
  var ffLayer = null, ffHalo = null, ffMarkers = {};
  var currentMatches = [];

  function cardHtml(m) {
    const p = m.p, sc = scoreOf(p), med = medianPrice(m);
    const star = inMyList(p.id) ? "★" : "☆";
    const priceTxt = med.kind === "rent"
      ? fmtRent(med.value, med.estimated)
      : fmtMoney(med.value, med.estimated);
    const bhkTxt = p.type === "plot"
      ? esc(p.sizeText || "") + (p.zone ? " · " + esc(p.zone) : "")
      : (m.options.length ? m.options.map(function (o) { return o.bhk + " BHK"; }).join(" · ") : "—");
    const srcTag = p.source === "added by you"
      ? '<span class="ff-tag ff-tag-you">added by you</span>'
      : '<span class="ff-tag ff-tag-demo">DEMO DATA</span>';
    const reraTag = p.rera ? ' <span class="ff-tag ff-tag-rera">✅ RERA</span>' : "";
    return '<div class="ff-card" data-id="' + esc(p.id) + '">' +
      '<button class="ff-star" data-star="' + esc(p.id) + '" title="My List">' + star + "</button>" +
      "<div class='ff-card-main'><b>" + esc(p.name) + "</b>" + srcTag + reraTag +
      "<br><span class='muted'>" + esc(p.locality || "") + " · " + esc(TYPE_LABEL[p.type] || p.type) + " · " + esc(bhkTxt) + "</span>" +
      "<br><b>" + esc(priceTxt) + "</b> <span class='muted'>· score " + sc.total.toFixed(1) + "/10</span></div></div>";
  }
  function renderResults() {
    const box = $("ffResults");
    if (!box) return;
    const list = sortMatches(applyFilters());
    currentMatches = list;
    // summary counts
    const cnt = { verified: 0, listed: 0, likely: 0, unchecked: 0 };
    list.forEach(function (m) { cnt[m.confidence]++; });
    const sum = $("ffSummary");
    if (sum) {
      sum.innerHTML = "<b>MATCHING PROPERTIES " + list.length + "</b> — " +
        cnt.verified + " RERA-verified · " + cnt.listed + " listed · " +
        cnt.likely + " probably fit · " + cnt.unchecked + " not checked yet";
    }
    // search chip
    const chip = $("ffSearchChip");
    if (chip) {
      if (S.searchQuery) {
        chip.classList.remove("hidden");
        $("ffSearchChipText").textContent = "Showing “" + S.searchQuery + "” — " + list.length + " matching on the map";
      } else chip.classList.add("hidden");
    }
    // groups
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = '<p class="hint">No properties match these filters yet. Loosen the budget, size or bedroom filters — or tick “Include \'probably fits\'”.</p>';
    }
    CONF_ORDER.forEach(function (g) {
      const items = list.filter(function (m) { return m.confidence === g; });
      if (!items.length) return;
      const showN = S.showPerGroup[g] || 5;
      const h = document.createElement("h3");
      h.textContent = CONF_LABEL[g] + " — " + items.length;
      box.appendChild(h);
      items.slice(0, showN).forEach(function (m) {
        const d = document.createElement("div");
        d.innerHTML = cardHtml(m);
        box.appendChild(d.firstChild);
      });
      if (items.length > showN) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn ff-more";
        b.textContent = "Show more (" + (items.length - showN) + " left)";
        b.addEventListener("click", function () { S.showPerGroup[g] = showN + 10; renderResults(); });
        box.appendChild(b);
      }
    });
    box.querySelectorAll(".ff-card").forEach(function (c) {
      c.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-star]")) return;
        openDetail(c.dataset.id);
      });
    });
    box.querySelectorAll("[data-star]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        toggleMyList(b.dataset.star);
      });
    });
    renderMarkers();
  }

  /* ---------- map markers ---------- */
  function markerColor(m) {
    return m ? CONF_COLOR[m.confidence] : CONF_COLOR.nomatch;
  }
  function renderMarkers() {
    const map = window.PATNA_MAP;
    if (!map || !ffLayer) return;
    ffLayer.clearLayers();
    if (ffHalo) ffHalo.clearLayers();
    ffMarkers = {};
    const matchById = {};
    currentMatches.forEach(function (m) { matchById[m.p.id] = m; });
    DATA.forEach(function (p) {
      if (p.lat == null || p.lng == null) return;
      const m = matchById[p.id] || null;
      const col = markerColor(m);
      const mk = L.circleMarker([p.lat, p.lng], {
        radius: m ? 9 : 7, color: col, weight: 2,
        fillColor: col, fillOpacity: m ? 0.85 : 0.45
      });
      mk.bindTooltip(esc(p.name) + (m ? " — " + CONF_LABEL[m.confidence] : " — no match"), { direction: "top" });
      mk.on("click", function () { openDetail(p.id); });
      mk.addTo(ffLayer);
      ffMarkers[p.id] = mk;
      if (S.glow && m && ffHalo) {
        L.circleMarker([p.lat, p.lng], {
          radius: 15, color: col, weight: 1, fillColor: col, fillOpacity: 0.18
        }).addTo(ffHalo);
      }
    });
  }

  /* ---------- filter wiring ---------- */
  function setChip(btn, on) { btn.classList.toggle("ff-on", !!on); }
  function wireFilters() {
    // mode toggle
    const mb = $("ffModeBuy"), mr = $("ffModeRent");
    function setMode(mode) {
      S.mode = mode;
      mb.classList.toggle("ff-on", mode === "buy");
      mr.classList.toggle("ff-on", mode === "rent");
      $("ffBuyFilters").classList.toggle("hidden", mode !== "buy");
      $("ffRentFilters").classList.toggle("hidden", mode !== "rent");
      renderResults();
    }
    mb.addEventListener("click", function () { setMode("buy"); });
    mr.addEventListener("click", function () { setMode("rent"); });

    // preset
    $("ffPresetBtn").addEventListener("click", function () {
      setMode("buy");
      S.types = new Set(["apartment"]);
      S.bhks = new Set([3]);
      S.bedMode = "area"; S.bedUnit = "sqft"; S.bedAreaSqft = 120;
      S.sizeMin = 1200; S.sizeMax = 8000;
      S.budgetMin = 0; S.budgetMax = 2000;
      syncFilterUI(); renderResults();
      toast("Example search loaded: Apartments · 3 BHK · smallest bedroom ≥ 10'×12' · from 1,200 sq ft.");
    });

    // type chips
    document.querySelectorAll("#panel-findflat [data-type]").forEach(function (b) {
      b.addEventListener("click", function () {
        const t = b.dataset.type;
        if (S.types.has(t)) S.types.delete(t); else S.types.add(t);
        setChip(b, S.types.has(t));
        renderResults();
      });
    });
    // BHK toggles
    document.querySelectorAll("#panel-findflat [data-bhk]").forEach(function (b) {
      b.addEventListener("click", function () {
        const n = parseInt(b.dataset.bhk, 10);
        if (S.bhks.has(n)) S.bhks.delete(n); else S.bhks.add(n);
        setChip(b, S.bhks.has(n));
        renderResults();
      });
    });
    // smallest bedroom
    $("ffBedAny").addEventListener("click", function () { S.bedMode = "any"; syncBedUI(); renderResults(); });
    $("ffBedArea").addEventListener("click", function () { S.bedMode = "area"; syncBedUI(); renderResults(); });
    $("ffBedUnitSqft").addEventListener("click", function () { S.bedUnit = "sqft"; syncBedUI(); });
    $("ffBedUnitGaj").addEventListener("click", function () { S.bedUnit = "gaj"; syncBedUI(); });
    $("ffBedSlider").addEventListener("input", function () {
      const v = parseFloat($("ffBedSlider").value);
      S.bedAreaSqft = S.bedUnit === "gaj" ? v * 9 : v;
      syncBedUI(); renderResults();
    });
    // size sliders
    $("ffSizeMin").addEventListener("input", function () {
      S.sizeMin = parseInt($("ffSizeMin").value, 10);
      if (S.sizeMin > S.sizeMax) { S.sizeMax = S.sizeMin; $("ffSizeMax").value = S.sizeMax; }
      syncSizeUI(); renderResults();
    });
    $("ffSizeMax").addEventListener("input", function () {
      S.sizeMax = parseInt($("ffSizeMax").value, 10);
      if (S.sizeMax < S.sizeMin) { S.sizeMin = S.sizeMax; $("ffSizeMin").value = S.sizeMin; }
      syncSizeUI(); renderResults();
    });
    // budget sliders (lakh; 2000 = ₹20 Cr)
    $("ffBudgetMin").addEventListener("input", function () {
      S.budgetMin = parseInt($("ffBudgetMin").value, 10);
      if (S.budgetMin > S.budgetMax) { S.budgetMax = S.budgetMin; $("ffBudgetMax").value = S.budgetMax; }
      syncBudgetUI(); renderResults();
    });
    $("ffBudgetMax").addEventListener("input", function () {
      S.budgetMax = parseInt($("ffBudgetMax").value, 10);
      if (S.budgetMax < S.budgetMin) { S.budgetMin = S.budgetMax; $("ffBudgetMin").value = S.budgetMin; }
      syncBudgetUI(); renderResults();
    });
    // rent slider
    $("ffRentMax").addEventListener("input", function () {
      S.rentMax = parseInt($("ffRentMax").value, 10);
      syncRentUI(); renderResults();
    });
    // amenity quick chips
    document.querySelectorAll("#panel-findflat [data-amen]").forEach(function (b) {
      b.addEventListener("click", function () {
        const a = b.dataset.amen;
        if (S.amenities.has(a)) S.amenities.delete(a); else S.amenities.add(a);
        setChip(b, S.amenities.has(a));
        syncAmenMore(); renderResults();
      });
    });
    // amenity more / fewer
    $("ffAmenMoreBtn").addEventListener("click", function () {
      $("ffAmenMore").classList.remove("hidden");
      $("ffAmenMoreBtn").classList.add("hidden");
      $("ffAmenFewerBtn").classList.remove("hidden");
      buildAmenMore();
    });
    $("ffAmenFewerBtn").addEventListener("click", function () {
      $("ffAmenMore").classList.add("hidden");
      $("ffAmenFewerBtn").classList.add("hidden");
      $("ffAmenMoreBtn").classList.remove("hidden");
    });
    $("ffAmenSearch").addEventListener("input", buildAmenMore);
    // nearby
    NEARBY.forEach(function (n) {
      const cb = $("ffNear" + n.key.charAt(0).toUpperCase() + n.key.slice(1));
      if (!cb) return;
      cb.addEventListener("change", function () {
        if (cb.checked) S.nearby.add(n.key); else S.nearby.delete(n.key);
        renderResults();
      });
    });
    // ready / likely / my list
    $("ffReadyOnly").addEventListener("change", function (e) { S.readyOnly = e.target.checked; renderResults(); });
    $("ffIncludeLikely").addEventListener("change", function (e) { S.includeLikely = e.target.checked; renderResults(); });
    $("ffMyListOnly").addEventListener("change", function (e) { S.myListOnly = e.target.checked; renderResults(); });
    // sort
    $("ffSort").addEventListener("change", function (e) { S.sort = e.target.value; renderResults(); });
    // search chip clear
    $("ffSearchChipClear").addEventListener("click", function () {
      S.searchQuery = ""; renderResults();
    });
  }

  function syncBedUI() {
    $("ffBedAny").classList.toggle("ff-on", S.bedMode === "any");
    $("ffBedArea").classList.toggle("ff-on", S.bedMode === "area");
    $("ffBedUnitSqft").classList.toggle("ff-on", S.bedUnit === "sqft");
    $("ffBedUnitGaj").classList.toggle("ff-on", S.bedUnit === "gaj");
    const sl = $("ffBedSlider");
    sl.disabled = S.bedMode !== "area";
    if (S.bedUnit === "gaj") { sl.min = 0; sl.max = 22; sl.step = 1; sl.value = Math.round(S.bedAreaSqft / 9); }
    else { sl.min = 0; sl.max = 200; sl.step = 5; sl.value = S.bedAreaSqft; }
    $("ffBedLabel").textContent = S.bedMode === "any"
      ? "Any bedroom size"
      : "Every bedroom ≥ " + (S.bedUnit === "gaj"
          ? Math.round(S.bedAreaSqft / 9) + " gaj (" + Math.round(S.bedAreaSqft) + " sq ft)"
          : Math.round(S.bedAreaSqft) + " sq ft (" + (S.bedAreaSqft / 9).toFixed(1) + " gaj)");
  }
  function syncSizeUI() {
    $("ffSizeMinLabel").textContent = fmtArea(S.sizeMin);
    $("ffSizeMaxLabel").textContent = fmtArea(S.sizeMax);
  }
  function syncBudgetUI() {
    $("ffBudgetMinLabel").textContent = fmtLakh(S.budgetMin);
    $("ffBudgetMaxLabel").textContent = fmtLakh(S.budgetMax);
  }
  function syncRentUI() {
    $("ffRentMaxLabel").textContent = "up to ₹" + S.rentMax.toLocaleString("en-IN") + "/month";
  }
  function syncFilterUI() {
    document.querySelectorAll("#panel-findflat [data-type]").forEach(function (b) { setChip(b, S.types.has(b.dataset.type)); });
    document.querySelectorAll("#panel-findflat [data-bhk]").forEach(function (b) { setChip(b, S.bhks.has(parseInt(b.dataset.bhk, 10))); });
    document.querySelectorAll("#panel-findflat [data-amen]").forEach(function (b) { setChip(b, S.amenities.has(b.dataset.amen)); });
    $("ffSizeMin").value = S.sizeMin; $("ffSizeMax").value = S.sizeMax;
    $("ffBudgetMin").value = S.budgetMin; $("ffBudgetMax").value = S.budgetMax;
    $("ffRentMax").value = S.rentMax;
    $("ffReadyOnly").checked = S.readyOnly;
    $("ffIncludeLikely").checked = S.includeLikely;
    $("ffMyListOnly").checked = S.myListOnly;
    syncBedUI(); syncSizeUI(); syncBudgetUI(); syncRentUI(); syncAmenMore();
  }
  function syncAmenMore() {
    document.querySelectorAll("#ffAmenMore input[type=checkbox]").forEach(function (cb) {
      cb.checked = S.amenities.has(cb.value);
    });
  }
  function buildAmenMore() {
    const q = ($("ffAmenSearch").value || "").trim().toLowerCase();
    const wrap = $("ffAmenList");
    wrap.innerHTML = "";
    ALL_AMEN.forEach(function (a) {
      if (q && a.toLowerCase().indexOf(q) === -1) return;
      const n = DATA.filter(function (p) { return (p.amenities || []).indexOf(a) !== -1; }).length;
      const lab = document.createElement("label");
      lab.className = "ff-amen-row";
      lab.innerHTML = '<input type="checkbox" value="' + esc(a) + '"' + (S.amenities.has(a) ? " checked" : "") + "> " +
        esc(a) + ' <span class="muted">(' + n + ")</span>";
      lab.querySelector("input").addEventListener("change", function (e) {
        if (e.target.checked) S.amenities.add(a); else S.amenities.delete(a);
        document.querySelectorAll("#panel-findflat [data-amen]").forEach(function (b) { setChip(b, S.amenities.has(b.dataset.amen)); });
        renderResults();
      });
      wrap.appendChild(lab);
    });
    if (!wrap.children.length) wrap.innerHTML = '<p class="hint">No amenity matches that search.</p>';
  }

  /* ---------- detail panel ---------- */
  var detailId = null;
  function portalLinks(p) {
    const rent = S.mode === "rent";
    const q = encodeURIComponent((p.name || "") + " Patna");
    return '<a class="btn" target="_blank" rel="noopener" href="https://www.99acres.com/search/property/' + (rent ? "rent" : "buy") + '/patna">99acres ↗</a>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://www.magicbricks.com/property-for-' + (rent ? "rent" : "sale") + '-in-patna">MagicBricks ↗</a>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://housing.com/in/' + (rent ? "rent" : "buy") + '/patna">Housing.com ↗</a>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + q + '">🔍 Search this name ↗</a>';
  }
  function openDetail(id) {
    const p = DATA.find(function (x) { return x.id === id; });
    if (!p) return;
    detailId = id;
    const m = currentMatches.find(function (x) { return x.p.id === id; }) || null;
    const sc = scoreOf(p);
    const body = $("ffDetailBody");
    const badges = [];
    if (m) badges.push('<span class="ff-badge ff-badge-match">MATCHES YOUR SEARCH</span>');
    if (p.rera) badges.push('<span class="ff-badge ff-badge-rera">✅ RERA VERIFIED</span>');
    else badges.push('<span class="ff-badge ff-badge-unver">⚠️ UNVERIFIED</span>');
    if (p.source === "added by you") badges.push('<span class="ff-badge ff-badge-you">added by you</span>');
    else badges.push('<span class="ff-badge ff-badge-demo">DEMO DATA</span>');
    let h = "<div class='ff-badges'>" + badges.join(" ") + "</div>";
    h += "<h2>" + esc(p.name) + "</h2>";
    h += "<p class='hint'>" + (p.developer ? esc(p.developer) + " · " : "") + esc(p.locality || "") + ", Patna, Bihar</p>";
    if (p.type === "plot") {
      h += "<p><b>" + esc(p.sizeText || "") + "</b>" + (p.zone ? " · " + esc(p.zone) + " zone" : "") +
        " · <b>" + esc(fmtMoney(p.priceLakhMin, p.priceEstimated)) + "</b></p>";
      h += "<p class='hint'>Plots have no bedrooms — they appear under “Not checked yet” when a bedroom filter is set.</p>";
    } else {
      h += "<p>" + (p.towers ? p.towers + " towers · " : "") + (p.totalUnits ? p.totalUnits + " units · " : "") +
        (p.acres ? p.acres + " acres · " : "") + "Possession: <b>" + esc(p.possession || "—") + "</b></p>";
    }
    // score box
    h += "<div class='ff-scorebox'><b>Score " + sc.total.toFixed(1) + "/10</b> <span class='muted'>(" + esc(sc.basis) + ")</span><br>" +
      "Residents’ rating (50%): <b>" + (sc.residents == null ? "—" : sc.residents.toFixed(1) + "/10") + "</b><br>" +
      "Nearby (30%): <b>" + sc.nearby.toFixed(1) + "/10</b> · Amenities (20%): <b>" + sc.amenities.toFixed(1) + "/10</b></div>";
    // buy and rent table
    if (p.type !== "plot" && (p.bhkOptions || []).length) {
      h += "<h3>Buy and rent — per BHK</h3><table class='ff-table'><tr><th>BHK</th><th>Size</th><th>₹/sq ft</th><th>Price</th><th>Rent</th><th>Listings</th></tr>";
      p.bhkOptions.forEach(function (o) {
        const isMatch = m && m.options.indexOf(o) !== -1;
        h += "<tr" + (isMatch ? " class='ff-row-match'" : "") + "><td>" + o.bhk + " BHK</td><td>" + fmtSqft(o.sizeSqft) + "</td>" +
          "<td>" + fmtPsf(o.psf) + "</td>" +
          "<td>" + fmtMoney((o.priceLakhMin + o.priceLakhMax) / 2, o.priceEstimated) +
          "<br><span class='muted'>" + fmtMoney(o.priceLakhMin, o.priceEstimated) + " – " + fmtMoney(o.priceLakhMax, o.priceEstimated) + "</span></td>" +
          "<td>" + fmtRent(o.rentMonthly, o.rentEstimated) + "</td>" +
          "<td>" + (p.source === "added by you" ? "1" : "—") + "</td></tr>";
      });
      h += "</table><p class='hint'>“—” under Listings means no live listing count is held here — counts live on the portals (links below). “~” means the value is an estimate: rent ≈ 2.5% of price per year; price from size × ₹/sq ft.</p>";
      // bedrooms table
      h += "<h3>Bedrooms</h3><table class='ff-table'><tr><th>Unit</th><th>Bedroom sizes</th><th>Smallest bedroom</th><th>Match</th><th>Source</th></tr>";
      p.bhkOptions.forEach(function (o) {
        const area = o.minBedFt ? Math.round(o.minBedFt[0] * o.minBedFt[1]) : null;
        const matchTxt = (S.bedMode === "area" && S.bedAreaSqft > 0)
          ? (area != null && area >= S.bedAreaSqft ? "✅ MATCH" : "❌ too small")
          : "—";
        h += "<tr><td>" + o.bhk + " BHK</td><td>" + (o.bedrooms || []).map(esc).join("<br>") + "</td>" +
          "<td>" + (area != null ? area + " sq ft" : "—") + "</td><td>" + matchTxt + "</td><td>" + esc(o.source || p.source) + "</td></tr>";
      });
      h += "</table>";
    }
    // nearby
    h += "<h3>Nearby</h3><ul class='terms'>";
    NEARBY.forEach(function (n) {
      const d = p.nearby ? p.nearby[n.key] : null;
      const ok = d != null && d <= n.max;
      h += "<li>" + esc(n.label) + ": <b>" + fmtDist(d) + "</b>" + (d != null ? (ok ? " ✅ within " + n.unit : " · beyond " + n.unit) : "") + "</li>";
    });
    h += "</ul>";
    // ratings / reviews
    h += "<h3>Resident ratings</h3>";
    if (p.ratings && p.ratings.categories) {
      Object.keys(p.ratings.categories).forEach(function (k) {
        h += "<p>" + esc(k) + ": <b>" + p.ratings.categories[k] + "/10</b></p>";
      });
    } else {
      h += "<p class='hint'>No resident reviews yet — ratings are never invented here.</p>";
    }
    if ((p.reviews || []).length) {
      p.reviews.forEach(function (r) {
        h += "<blockquote class='ff-quote'>“" + esc(r.text) + "” — " + esc(r.by || "resident") + "</blockquote>";
      });
    }
    // amenities
    h += "<h3>Amenities</h3>";
    h += (p.amenities && p.amenities.length)
      ? "<p>" + p.amenities.map(function (a) { return '<span class="ff-amen-chip">' + esc(a) + "</span>"; }).join(" ") + "</p>"
      : "<p class='hint'>No amenities recorded for this property.</p>";
    // about (collapsible)
    h += "<details class='ff-about'><summary>About this property</summary>" +
      "<p class='hint'>Source: <b>" + esc(p.source) + "</b>. " +
      (p.source === "demo sample"
        ? "This is DEMO DATA — sample values for trying the filters, not live market prices. Live prices live on the portals below."
        : "This listing was added by you in this browser (Listings tab).") +
      (p.rera ? " RERA no. <b>" + esc(p.rera) + "</b> — verify it at rera.bihar.gov.in." : " No RERA number is recorded for this property — it is marked ⚠️ unverified.") +
      (p.sampleChecked ? " Sample listing checked against the patnapropertyhub sample set." : "") +
      "</p></details>";
    // links
    h += "<h3>Links</h3><div class='portal-links'>" +
      '<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + p.lat + "," + p.lng + '">📍 Google Maps ↗</a>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + "," + p.lng + '">🧭 Directions ↗</a>' +
      portalLinks(p);
    if (p.rera) h += '<a class="btn" target="_blank" rel="noopener" href="' + RERA_URL + '">✅ Verify RERA no. ' + esc(p.rera) + " ↗</a>";
    else h += '<a class="btn" target="_blank" rel="noopener" href="' + RERA_URL + '">🏛️ RERA Bihar — verify a number ↗</a>';
    if (p.link) h += '<a class="btn" target="_blank" rel="noopener" href="' + esc(p.link) + '">🔗 Source link ↗</a>';
    h += "</div>";
    if (p.contact) h += "<p class='hint'>Contact: " + esc(p.contact) + "</p>";
    body.innerHTML = h;
    $("ffDetailStar").textContent = inMyList(p.id) ? "★ In My List" : "☆ Add to My List";
    $("ffDetail").classList.remove("hidden");
    document.body.classList.remove("ff-panels-hidden");
    $("ffHidePanels").textContent = "Hide panels";
    renderLog("property", p);
    const map = window.PATNA_MAP;
    if (map && p.lat != null) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }
  function closeDetail() {
    detailId = null;
    $("ffDetail").classList.add("hidden");
    renderLog("dataset", null);
  }

  /* ---------- guide modal ---------- */
  var GUIDE_STEPS = [
    { t: "1 · Pick size, bedroom and budget", b: "Set the smallest bedroom you can live with, the home size, BHK, amenities and budget. Everything updates live — the map and the list move together." },
    { t: "2 · Watch the map light up", b: "Blue markers match your search. Amber means “probably fits” (an estimated price or rent). Grey means not checked yet — no bedroom sizes on file. Dark markers do not match." },
    { t: "3 · Click a property", b: "See prices and rents per BHK, bedroom sizes with a MATCH verdict, nearby distances, and the score — residents 50%, nearby 30%, amenities 20%." },
    { t: "4 · Every number shows its source", b: "DEMO DATA tags mean sample values, not live market prices — live prices live on the portals. The CSV downloads and the Research Log show how every answer was found." }
  ];
  var guideStep = 0;
  function showGuide(step) {
    guideStep = step;
    const g = GUIDE_STEPS[step];
    $("ffGuideTitle").textContent = g.t;
    $("ffGuideBody").textContent = g.b;
    $("ffGuideNext").textContent = step >= GUIDE_STEPS.length - 1 ? "Start exploring" : "Next →";
    $("ffGuide").classList.remove("hidden");
  }
  function hideGuide() { $("ffGuide").classList.add("hidden"); }
  function wireGuide() {
    $("ffGuideBtn").addEventListener("click", function () { showGuide(0); });
    $("ffGuideSkip").addEventListener("click", function () {
      try { localStorage.setItem(LS_GUIDE, "1"); } catch (e) {}
      hideGuide();
    });
    $("ffGuideNext").addEventListener("click", function () {
      if (guideStep >= GUIDE_STEPS.length - 1) {
        try { localStorage.setItem(LS_GUIDE, "1"); } catch (e) {}
        hideGuide();
      } else showGuide(guideStep + 1);
    });
  }

  /* ---------- My List: paste / share ---------- */
  function wireMyList() {
    $("ffPasteBtn").addEventListener("click", function () { $("ffPasteModal").classList.remove("hidden"); });
    $("ffPasteClose").addEventListener("click", function () { $("ffPasteModal").classList.add("hidden"); });
    $("ffPasteClear").addEventListener("click", function () {
      if (!myList.length) { toast("My List is already empty."); return; }
      if (!window.confirm("Clear your whole My List?")) return;
      myList = []; saveMyList(); renderResults();
      toast("My List cleared.");
    });
    $("ffPasteAdd").addEventListener("click", function () {
      const lines = $("ffPasteText").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!lines.length) { toast("Paste one property name per line first.", true); return; }
      let added = 0, missed = [];
      lines.forEach(function (name) {
        const hit = DATA.find(function (p) { return p.name.toLowerCase().indexOf(name.toLowerCase()) !== -1; });
        if (hit && !inMyList(hit.id)) { myList.push(hit.id); added++; }
        else if (!hit) missed.push(name);
      });
      saveMyList(); renderResults();
      toast("Added " + added + " to My List." + (missed.length ? " Not found: " + missed.join(", ") : ""));
      $("ffPasteModal").classList.add("hidden");
    });
    $("ffShareBtn").addEventListener("click", function () {
      if (!myList.length) { toast("My List is empty — star some properties first.", true); return; }
      const url = location.origin + location.pathname + "?list=" + myList.map(encodeURIComponent).join(",");
      function done() { toast("List link copied — share it to open the same My List."); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
      } else { fallbackCopy(url); done(); }
    });
    $("ffDetailStar").addEventListener("click", function () {
      if (detailId) toggleMyList(detailId);
      if (detailId) $("ffDetailStar").textContent = inMyList(detailId) ? "★ In My List" : "☆ Add to My List";
    });
    $("ffDetailClose").addEventListener("click", closeDetail);
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  /* ---------- downloads ---------- */
  function propRow(p, m) {
    const med = m ? medianPrice(m) : { value: null, estimated: false, kind: "price" };
    const sc = scoreOf(p);
    return [
      p.id, p.name, p.developer || "", p.locality || "", TYPE_LABEL[p.type] || p.type,
      p.lat, p.lng, p.possession || "",
      med.kind === "rent" ? "" : (med.value == null ? "" : Math.round(med.value * 100000)),
      med.kind === "rent" ? (med.value == null ? "" : Math.round(med.value)) : "",
      sc.total.toFixed(1), m ? m.confidence : "not matched",
      p.rera || "", (p.amenities || []).join("; "), p.source
    ];
  }
  function wireDownloads() {
    $("ffDlResults").addEventListener("click", function () {
      const rows = [["id", "name", "developer", "locality", "type", "lat", "lng", "possession",
        "median price (Rs)", "median rent (Rs/month)", "score /10", "confidence", "RERA no.", "amenities", "source"]];
      sortMatches(applyFilters()).forEach(function (m) { rows.push(propRow(m.p, m)); });
      if (rows.length < 2) { toast("No matching properties to download.", true); return; }
      downloadCSV("patna-find-a-flat-results-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
      toast("Downloaded " + (rows.length - 1) + " matching properties.");
    });
    $("ffDlAll").addEventListener("click", function () {
      const rows = [["id", "name", "developer", "locality", "type", "lat", "lng", "possession",
        "median price (Rs)", "median rent (Rs/month)", "score /10", "confidence", "RERA no.", "amenities", "source"]];
      DATA.forEach(function (p) { rows.push(propRow(p, null)); });
      downloadCSV("patna-find-a-flat-all-properties-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
      toast("Downloaded all " + DATA.length + " properties.");
    });
    $("ffDlUnits").addEventListener("click", function () {
      const rows = [["property id", "property", "locality", "BHK", "size (sq ft)", "bedrooms",
        "smallest bedroom (sq ft)", "price min (Rs)", "price max (Rs)", "price estimated?",
        "rent (Rs/month)", "rent estimated?", "price per sq ft (Rs)", "source"]];
      DATA.forEach(function (p) {
        (p.bhkOptions || []).forEach(function (o) {
          const area = o.minBedFt ? Math.round(o.minBedFt[0] * o.minBedFt[1]) : "";
          rows.push([p.id, p.name, p.locality || "", o.bhk, o.sizeSqft == null ? "" : o.sizeSqft,
            (o.bedrooms || []).join("; "), area,
            o.priceLakhMin == null ? "" : Math.round(o.priceLakhMin * 100000),
            o.priceLakhMax == null ? "" : Math.round(o.priceLakhMax * 100000),
            o.priceEstimated ? "yes" : "no",
            o.rentMonthly == null ? "" : o.rentMonthly,
            o.rentEstimated ? "yes" : "no",
            o.psf == null ? "" : o.psf, o.source || p.source]);
        });
        if (p.type === "plot") {
          rows.push([p.id, p.name, p.locality || "", "", p.sizeSqft == null ? "" : p.sizeSqft, "", "",
            p.priceLakhMin == null ? "" : Math.round(p.priceLakhMin * 100000),
            p.priceLakhMax == null ? "" : Math.round(p.priceLakhMax * 100000),
            p.priceEstimated ? "yes" : "no", "", "", "", p.source]);
        }
      });
      downloadCSV("patna-find-a-flat-unit-types-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
      toast("Downloaded unit types and bedrooms.");
    });
  }

  /* ---------- Research Log ---------- */
  var LOG_DATASET = [
    ["2026-11-21", "Dataset seeded: 24 demo societies + 7 sample plots from the patnapropertyhub sample set (data/sample_listings.geojson) = 31 properties across 25 Patna localities."],
    ["2026-11-21", "Every seeded entry carries source “demo sample” and renders a DEMO DATA tag. Prices are sample values, not live market prices — live prices live on the portals."],
    ["2026-11-21", "No RERA numbers are recorded in the demo data. A ✅ RERA tick appears only when a real registration number is added (your own listings, Listings tab) — verify it at rera.bihar.gov.in."],
    ["2026-11-21", "Rent estimates use ~2.5% of price per year (rent ≈ price × 0.025 ÷ 12), marked “~”. Prices marked “~” are estimated from size × ₹/sq ft."],
    ["2026-11-21", "Typo-flag rule: a price or rent that looks like a typo (far outside the locality's range) is flagged and not used for filtering. No demo values were flagged."],
    ["2026-11-21", "Bedroom sizes are demo values. A property with no bedroom sizes on file is “Not checked yet” — neither a pass nor a fail."],
    ["2026-11-21", "Score = residents’ rating 50% + nearby 30% + amenities 20%. No resident ratings exist in the demo data, so scores here use nearby + amenities only and say so. Ratings are never invented."]
  ];
  function renderLog(mode, p) {
    const box = $("ffLogBody"), title = $("ffLogTitle");
    if (!box) return;
    let html = "";
    if (mode === "property" && p) {
      title.textContent = "Research Log — this property";
      html += "<p><b>" + esc(p.name) + "</b> · " + esc(p.locality || "") + ", Patna (" + p.lat + ", " + p.lng + ")</p>";
      html += "<ul class='terms'>";
      html += "<li>Source: <b>" + esc(p.source) + "</b>" + (p.source === "demo sample" ? " — DEMO DATA, not a live price." : "") + "</li>";
      if (p.type === "plot" && p.sampleChecked) html += "<li>Sample listing from patnapropertyhub (checked sample set).</li>";
      if (p.rera) html += "<li>RERA no. recorded — verify at rera.bihar.gov.in.</li>";
      else html += "<li>No RERA number recorded for this property — marked ⚠️ unverified.</li>";
      if ((p.bhkOptions || []).length) html += "<li>" + p.bhkOptions.length + " unit type(s) with bedroom sizes on file.</li>";
      else html += "<li>No bedroom sizes on file — “Not checked yet”.</li>";
      const est = (p.bhkOptions || []).some(function (o) { return o.rentEstimated || o.priceEstimated; });
      if (est) html += "<li>Contains “~” estimated values (rent ≈ 2.5% of price/year, or price from size × ₹/sq ft).</li>";
      html += "</ul>";
    } else {
      title.textContent = "Research Log — the dataset";
      html += "<ul class='terms'>" + LOG_DATASET.map(function (e) {
        return "<li><b>" + esc(e[0]) + "</b> — " + esc(e[1]) + "</li>";
      }).join("") + "</ul>";
    }
    box.innerHTML = html;
  }

  /* ---------- map controls: theme / boundaries / names / glow / tour ---------- */
  var currentBaseName = "OpenStreetMap";
  var ffBoundaryLayer = null, ffBoundaryLoaded = false;
  var ffNamesLayer = null, ffNamesLoaded = false;
  var tourTimer = null, tourIdx = 0;

  function setLight(on) {
    S.lightTheme = on;
    document.body.classList.toggle("ff-light", on);
    $("ffThemeBtn").textContent = on ? "☀️ Light theme" : "🌙 Dark theme";
    const map = window.PATNA_MAP;
    const bases = window.PATNA_BASELAYERS;
    if (map && bases) {
      const want = on ? "Light" : "OpenStreetMap";
      if (bases[want] && currentBaseName !== want) {
        if (bases[currentBaseName]) map.removeLayer(bases[currentBaseName]);
        map.addLayer(bases[want]);
        currentBaseName = want;
      }
    }
  }
  function wireMapControls() {
    const map = window.PATNA_MAP;
    if (map) {
      map.on("baselayerchange", function (e) { currentBaseName = e.name; });
    }
    $("ffThemeBtn").addEventListener("click", function () { setLight(!S.lightTheme); });
    $("ffGlow").addEventListener("change", function (e) { S.glow = e.target.checked; renderMarkers(); });
    $("ffBoundaries").addEventListener("change", function (e) {
      S.boundaries = e.target.checked;
      if (!map) return;
      if (S.boundaries) {
        if (!ffBoundaryLoaded) {
          ffBoundaryLoaded = true;
          fetch("data/patna_boundary.geojson")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(function (gj) {
              ffBoundaryLayer = L.geoJSON(gj, { style: { color: "#38bdf8", weight: 2.5, dashArray: "6 4", fill: false } })
                .bindTooltip("Patna district boundary");
              ffBoundaryLayer.addTo(map);
            })
            .catch(function (err) { console.warn("findflat boundary load failed:", err); toast("Could not load the district boundary.", true); });
        } else if (ffBoundaryLayer) map.addLayer(ffBoundaryLayer);
      } else if (ffBoundaryLayer) map.removeLayer(ffBoundaryLayer);
    });
    $("ffNames").addEventListener("change", function (e) {
      S.names = e.target.checked;
      if (!map) return;
      if (S.names) {
        if (!ffNamesLoaded) {
          ffNamesLoaded = true;
          fetch("data/patna_localities.json")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(function (locs) {
              ffNamesLayer = L.layerGroup();
              locs.filter(function (p) { return p.name.indexOf("(") === -1; }).forEach(function (p) {
                L.marker([p.lat, p.lon], {
                  icon: L.divIcon({ className: "", html: '<div class="ff-name-label">' + esc(p.name) + "</div>", iconSize: null }),
                  interactive: false
                }).addTo(ffNamesLayer);
              });
              ffNamesLayer.addTo(map);
            })
            .catch(function (err) { console.warn("findflat names load failed:", err); });
        } else if (ffNamesLayer) map.addLayer(ffNamesLayer);
      } else if (ffNamesLayer) map.removeLayer(ffNamesLayer);
    });
    $("ffWholeCity").addEventListener("click", function () {
      if (!map || !DATA.length) return;
      const b = L.latLngBounds(DATA.filter(function (p) { return p.lat != null; }).map(function (p) { return [p.lat, p.lng]; }));
      if (b.isValid()) map.flyToBounds(b.pad(0.25), { duration: 1 });
    });
    $("ffMyLoc").addEventListener("click", function () {
      if (!map) return;
      if (!navigator.geolocation) { toast("Geolocation is not supported by this browser.", true); return; }
      toast("Locating you…");
      navigator.geolocation.getCurrentPosition(function (pos) {
        const ll = [pos.coords.latitude, pos.coords.longitude];
        L.marker(ll).addTo(map).bindPopup("<b>You are here</b>").openPopup();
        map.flyTo(ll, 15, { duration: 1 });
      }, function () {
        toast("Could not get your location — check the browser location permission.", true);
      }, { timeout: 10000 });
    });
    $("ffTourBtn").addEventListener("click", function () {
      if (S.tourOn) { stopTour(); return; }
      const list = currentMatches.slice(0, 12);
      if (!list.length) { toast("No matching properties to tour — loosen the filters.", true); return; }
      S.tourOn = true;
      $("ffTourBtn").textContent = "⏹ Stop tour";
      tourIdx = 0;
      const step = function () {
        if (!S.tourOn) return;
        if (tourIdx >= list.length) { stopTour(); toast("Tour finished."); return; }
        const p = list[tourIdx].p;
        if (map && p.lat != null) map.flyTo([p.lat, p.lng], 15, { duration: 1.2 });
        openDetail(p.id);
        tourIdx++;
        tourTimer = setTimeout(step, 2600);
      };
      step();
    });
    $("ffReplayBtn").addEventListener("click", function () {
      if (!map) return;
      closeDetail();
      map.flyTo([25.5941, 85.1376], 11, { duration: 1.4 });
    });
  }
  function stopTour() {
    S.tourOn = false;
    clearTimeout(tourTimer);
    const b = $("ffTourBtn");
    if (b) b.textContent = "▶ Fly through the matches";
  }

  /* ---------- hide / show panels ---------- */
  function wirePanels() {
    $("ffHidePanels").addEventListener("click", function () {
      const hidden = document.body.classList.toggle("ff-panels-hidden");
      $("ffHidePanels").textContent = hidden ? "Show panels" : "Hide panels";
    });
    $("ffShowPanels").addEventListener("click", function () {
      document.body.classList.remove("ff-panels-hidden");
      $("ffHidePanels").textContent = "Hide panels";
    });
    $("ffLogToggle").addEventListener("click", function () {
      const log = $("ffLog");
      const hidden = log.classList.toggle("hidden");
      $("ffLogToggle").textContent = hidden ? "📋 Show Research Log" : "📋 Hide Research Log";
    });
  }

  /* ---------- header search extension ---------- */
  var searchTimer = null;
  function updateSearchStars() {
    document.querySelectorAll("#searchResults [data-star]").forEach(function (b) {
      b.textContent = inMyList(b.dataset.star) ? "★" : "☆";
    });
  }
  function wireSearch() {
    const input = $("searchInput"), box = $("searchResults");
    if (!input || !box) return;
    input.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        // app.js renders its own suggestions ~350 ms after input; append
        // property rows afterwards so they are not wiped.
        const q = input.value.trim().toLowerCase();
        box.querySelectorAll(".ff-sr").forEach(function (n) { n.remove(); });
        if (q.length < 2) return;
        const hits = DATA.filter(function (p) {
          const hay = ((p.name || "") + " " + (p.developer || "") + " " + (p.locality || "")).toLowerCase();
          return hay.indexOf(q) !== -1;
        }).slice(0, 5);
        hits.forEach(function (p) {
          const d = document.createElement("div");
          d.className = "sr-item ff-sr";
          d.innerHTML = "🏠 <span>" + esc(p.name) + "</span>" +
            '<span class="tag">' + esc(p.locality || "") + " · Find a Flat</span>" +
            '<button class="ff-star ff-star-sr" data-star="' + esc(p.id) + '" title="My List">' + (inMyList(p.id) ? "★" : "☆") + "</button>";
          d.addEventListener("mousedown", function (ev) {
            if (ev.target.closest("[data-star]")) return;
            ev.preventDefault();
            box.classList.add("hidden");
            input.value = p.name;
            document.querySelector('[data-tab="findflat"]').click();
            openDetail(p.id);
          });
          box.appendChild(d);
        });
        if (hits.length) {
          const chip = document.createElement("div");
          chip.className = "sr-item ff-sr ff-sr-chip";
          chip.innerHTML = "🗺️ <span>Show all " + hits.length + " matching on the map →</span>";
          chip.addEventListener("mousedown", function (ev) {
            ev.preventDefault();
            box.classList.add("hidden");
            S.searchQuery = input.value.trim();
            document.querySelector('[data-tab="findflat"]').click();
            renderResults();
          });
          box.appendChild(chip);
        }
        box.querySelectorAll(".ff-sr [data-star]").forEach(function (b) {
          b.addEventListener("mousedown", function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            toggleMyList(b.dataset.star);
          });
        });
      }, 600);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  /* ---------- tab activation + URL params ---------- */
  var demoProps = [];
  function refreshUserListings() {
    DATA = demoProps.concat(userListingsAsProps());
  }
  function applyPreset() { $("ffPresetBtn").click(); }
  function applyUrlParams() {
    const q = new URLSearchParams(location.search);
    if (q.get("map") === "light") setLight(true);
    if (q.get("list")) {
      myList = q.get("list").split(",").map(function (s) { return decodeURIComponent(s); }).filter(Boolean);
      saveMyList();
      S.myListOnly = true;
      const cb = $("ffMyListOnly"); if (cb) cb.checked = true;
    }
    if (q.get("preset") === "example") {
      document.querySelector('[data-tab="findflat"]').click();
      applyPreset();
    }
    if (q.get("open")) {
      document.querySelector('[data-tab="findflat"]').click();
      openDetail(q.get("open"));
    }
  }
  function wireTab() {
    const tab = document.querySelector('.tab[data-tab="findflat"]');
    if (!tab) return;
    tab.addEventListener("click", function () {
      refreshUserListings();
      renderResults();
      let seen = false;
      try { seen = localStorage.getItem(LS_GUIDE) === "1"; } catch (e) {}
      if (!seen) showGuide(0);
    });
  }

  /* ---------- data load + init ---------- */
  function loadData() {
    return fetch("data/patna_properties.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        demoProps = (j.properties || []).filter(function (p) { return p.lat != null && p.lng != null; });
      })
      .catch(function (err) {
        console.warn("findflat data load failed:", err);
        toast("Could not load the demo property data — your own listings still work.", true);
        demoProps = [];
      })
      .then(function () { refreshUserListings(); });
  }
  var initTries = 0;
  function init() {
    if (!window.PATNA_MAP || typeof L === "undefined") {
      if (++initTries < 30) { setTimeout(init, 100); return; }
      console.warn("findflat: map not available");
      return;
    }
    const map = window.PATNA_MAP;
    ffLayer = L.layerGroup().addTo(map);
    ffHalo = L.layerGroup().addTo(map);
    wireFilters(); wireGuide(); wireMyList(); wireDownloads();
    wireMapControls(); wirePanels(); wireSearch(); wireTab();
    syncFilterUI();
    renderLog("dataset", null);
    loadData().then(function () {
      applyUrlParams();
      renderResults();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
