let map
let circle
let placesService
let markers = []
let streetView

let userPos = { lat: 44.4268, lng: 26.1025 }
let circleCenter = null
let circleRadius = 1500

let lastResults = []
let favorites = []
let history = []

let activeTab = "results"

const LS_KEY = "atlasgo_state_v5"

const NOIMG_DATA_URL = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">' +
  '<rect width="100%" height="100%" fill="#2b2b2b"/>' +
  '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a9a9a" font-family="Arial" font-size="10">' +
  "no image" +
  "</text></svg>"
)

const CATEGORY_PRESETS = {
  convenience_store: { label: "Magazine / Minimarket", types: ["convenience_store", "grocery_or_supermarket", "supermarket"] },
  gas_station: { label: "Benzinarii", types: ["gas_station"] },
  restaurant_cafe: { label: "Restaurante", types: ["restaurant", "cafe"] },
  tourist_attraction: { label: "Turism", types: ["tourist_attraction", "museum", "point_of_interest"] },
  spa_park: { label: "Relaxare", types: ["spa", "park"] },
  pharmacy: { label: "Farmacii", types: ["pharmacy"] },
  gym: { label: "Sala Fitness", types: ["gym"] }
}

function byId(id) { return document.getElementById(id) }

function safeParseJSON(s, fallback) {
  try { return JSON.parse(s) } catch { return fallback }
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)) }

function nowIso() { return new Date().toISOString() }

function fmtMeters(m) {
  if (!Number.isFinite(m)) return "-"
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

function fmtRating(r) {
  if (!Number.isFinite(r)) return "-"
  return r.toFixed(1)
}

function loadState() {
  const data = safeParseJSON(localStorage.getItem(LS_KEY), null)
  if (!data) return

  if (data.userPos && Number.isFinite(data.userPos.lat) && Number.isFinite(data.userPos.lng)) userPos = data.userPos
  if (data.circleCenter && Number.isFinite(data.circleCenter.lat) && Number.isFinite(data.circleCenter.lng)) circleCenter = data.circleCenter
  if (Number.isFinite(data.circleRadius)) circleRadius = clamp(Number(data.circleRadius), 200, 20000)

  if (Array.isArray(data.favorites)) favorites = data.favorites
  if (Array.isArray(data.history)) history = data.history

  if (typeof data.activeTab === "string") activeTab = data.activeTab

  const ui = data.ui || {}
  if (byId("cat") && typeof ui.cat === "string") byId("cat").value = ui.cat
  if (byId("sort") && typeof ui.sort === "string") byId("sort").value = ui.sort
  if (byId("travelMode") && typeof ui.travelMode === "string") byId("travelMode").value = ui.travelMode
  if (byId("city") && typeof ui.city === "string") byId("city").value = ui.city
}

function saveState() {
  const ui = {
    cat: byId("cat") ? byId("cat").value : null,
    sort: byId("sort") ? byId("sort").value : null,
    travelMode: byId("travelMode") ? byId("travelMode").value : null,
    city: byId("city") ? byId("city").value : null
  }

  const data = {
    userPos,
    circleCenter,
    circleRadius,
    favorites,
    history,
    activeTab,
    ui
  }

  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function setCount(n) {
  const el = byId("count")
  if (el) el.textContent = String(n)
}

function setRadiusUI(meters) {
  const rVal = byId("rVal")
  if (rVal) rVal.textContent = String(Math.round(meters))
  const rad = byId("rad")
  if (rad) rad.value = String(Math.round(meters))
}

function setActiveTabUI(tab) {
  activeTab = tab
  const tabResults = byId("tabResults")
  const tabHistory = byId("tabHistory")
  const tabFavs = byId("tabFavs")
  const panelResults = byId("panelResults")
  const panelHistory = byId("panelHistory")
  const panelFavs = byId("panelFavs")

  if (tabResults) tabResults.classList.toggle("active", tab === "results")
  if (tabHistory) tabHistory.classList.toggle("active", tab === "history")
  if (tabFavs) tabFavs.classList.toggle("active", tab === "favorites")

  if (panelResults) panelResults.classList.toggle("active", tab === "results")
  if (panelHistory) panelHistory.classList.toggle("active", tab === "history")
  if (panelFavs) panelFavs.classList.toggle("active", tab === "favorites")
  saveState()
}

function initTabs() {
  const tabResults = byId("tabResults")
  const tabHistory = byId("tabHistory")
  const tabFavs = byId("tabFavs")
  if (tabResults) tabResults.onclick = () => { setActiveTabUI("results"); renderActiveTab() }
  if (tabHistory) tabHistory.onclick = () => { setActiveTabUI("history"); renderActiveTab() }
  if (tabFavs) tabFavs.onclick = () => { setActiveTabUI("favorites"); renderActiveTab() }
  setActiveTabUI(activeTab === "favorites" ? "favorites" : (activeTab === "history" ? "history" : "results"))
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null))
  markers = []
}

function focusOn(lat, lng, zoom) {
  if (!map) return
  map.panTo({ lat, lng })
  if (Number.isFinite(zoom)) map.setZoom(zoom)
}

function openStreetView(lat, lng) {
  const panel = byId("sv-panel")
  const container = byId("sv-container")
  if (!panel || !container) return

  if (!streetView) {
    streetView = new google.maps.StreetViewPanorama(container, {
      position: { lat, lng },
      pov: { heading: 0, pitch: 0 },
      visible: true,
      fullscreenControl: false,
      addressControl: true,
      motionTracking: false,
      motionTrackingControl: false
    })
  }

  panel.style.display = "block"
  streetView.setPosition({ lat, lng })
  streetView.setVisible(true)
}

function ensureCloseStreetViewWiring() {
  const closeBtn = byId("sv-close")
  if (!closeBtn) return
  closeBtn.onclick = () => {
    const panel = byId("sv-panel")
    if (panel) panel.style.display = "none"
    if (streetView) streetView.setVisible(false)
  }
}

function getSelectedTravelMode() {
  const el = byId("travelMode")
  if (!el) return "TRANSIT"
  const v = String(el.value || "TRANSIT").toUpperCase()
  if (v === "DRIVING" || v === "WALKING" || v === "BICYCLING" || v === "TRANSIT") return v
  return "TRANSIT"
}

function getSelectedSortMode() {
  const el = byId("sort")
  const v = el ? String(el.value || "dist") : "dist"
  if (v === "rate" || v === "best" || v === "dist") return v
  return "dist"
}

function getSelectedCategoryTypes() {
  const el = byId("cat")
  const raw = el ? String(el.value || "convenience_store") : "convenience_store"
  if (raw.includes("|")) return raw.split("|").map(x => x.trim()).filter(Boolean)
  const presetKey = raw
  if (CATEGORY_PRESETS[presetKey]) return CATEGORY_PRESETS[presetKey].types
  return [raw]
}

function computeDistanceMeters(a, b) {
  try {
    const p1 = new google.maps.LatLng(a.lat, a.lng)
    const p2 = new google.maps.LatLng(b.lat, b.lng)
    return google.maps.geometry.spherical.computeDistanceBetween(p1, p2)
  } catch {
    return Infinity
  }
}

function scoreBestMatch(p) {
  const r = Number.isFinite(p.rating) ? p.rating : 0
  const d = Number.isFinite(p.distance_m) ? p.distance_m : 999999
  const dScore = 1 / (1 + d / 250)
  const rScore = Math.min(5, Math.max(0, r)) / 5
  return (0.55 * rScore) + (0.45 * dScore)
}

function normalizePlace(p) {
  const loc = p.geometry && p.geometry.location
  const lat = loc ? (typeof loc.lat === "function" ? loc.lat() : loc.lat) : null
  const lng = loc ? (typeof loc.lng === "function" ? loc.lng() : loc.lng) : null
  return {
    place_id: p.place_id,
    name: p.name || "",
    rating: Number(p.rating || 0),
    user_ratings_total: Number(p.user_ratings_total || 0),
    vicinity: p.vicinity || "",
    types: Array.isArray(p.types) ? p.types : [],
    lat,
    lng,
    photos: Array.isArray(p.photos) ? p.photos.map(ph => {
      try { return ph.getUrl({ maxWidth: 300, maxHeight: 200 }) } catch { return NOIMG_DATA_URL }
    }) : []
  }
}

function isFavorite(placeId) {
  return favorites.some(x => x && x.place_id === placeId)
}

function toggleFavorite(p) {
  const idx = favorites.findIndex(x => x && x.place_id === p.place_id)
  if (idx >= 0) favorites.splice(idx, 1)
  else favorites.unshift({ ...p, savedAt: nowIso() })
  saveState()
  renderActiveTab()
}

function renderCard(p) {
  const card = document.createElement("div")
  card.className = "card"

  const img = document.createElement("img")
  img.className = "place-img"
  img.src = (p.photos && p.photos[0]) ? p.photos[0] : NOIMG_DATA_URL
  img.alt = p.name || "place"
  card.appendChild(img)

  const info = document.createElement("div")
  info.className = "place-info"

  const title = document.createElement("div")
  title.style.fontWeight = "700"
  title.style.fontSize = "13px"
  title.textContent = p.name || "Loc fără nume"
  info.appendChild(title)

  const meta = document.createElement("div")
  meta.style.fontSize = "11px"
  meta.style.color = "#aaa"
  meta.style.marginTop = "3px"
  meta.textContent = p.vicinity || ""
  info.appendChild(meta)

  const line = document.createElement("div")
  line.style.display = "flex"
  line.style.justifyContent = "space-between"
  line.style.gap = "8px"
  line.style.marginTop = "6px"
  line.style.fontSize = "11px"

  const left = document.createElement("div")
  left.textContent = `${fmtRating(p.rating)} ★`
  const right = document.createElement("div")
  right.textContent = fmtMeters(p.distance_m)
  line.appendChild(left)
  line.appendChild(right)
  info.appendChild(line)

  card.appendChild(info)

  const favBtn = document.createElement("div")
  favBtn.className = "fav-btn"
  favBtn.textContent = isFavorite(p.place_id) ? "★" : "☆"
  favBtn.onclick = (e) => {
    e.stopPropagation()
    toggleFavorite(p)
  }
  card.appendChild(favBtn)

  const svBtn = document.createElement("div")
  svBtn.className = "mini-action"
  svBtn.textContent = "👁️"
  svBtn.title = "Street View"
  svBtn.onclick = (e) => {
    e.stopPropagation()
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) openStreetView(p.lat, p.lng)
  }
  card.appendChild(svBtn)

  card.onclick = () => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      focusOn(p.lat, p.lng, 15)
    }
  }

  return card
}

function renderResultsList(listEl, places) {
  if (!listEl) return
  listEl.innerHTML = ""
  places.forEach((p, idx) => {
    const card = renderCard(p)
    if (idx === 0) {
      const badge = document.createElement("div")
      badge.className = "best-badge"
      badge.textContent = "BEST"
      card.appendChild(badge)
    }
    listEl.appendChild(card)
  })
}

function renderFavorites() {
  const list = byId("favList")
  if (!list) return
  renderResultsList(list, favorites.map(x => ({ ...x })))
}

function renderHistory() {
  const list = byId("historyList")
  if (!list) return
  list.innerHTML = ""

  history.forEach(h => {
    const div = document.createElement("div")
    div.className = "card"
    div.style.cursor = "default"

    const info = document.createElement("div")
    info.className = "place-info"
    info.style.paddingRight = "0px"

    const title = document.createElement("div")
    title.style.fontWeight = "700"
    title.style.fontSize = "12px"

    const catLabel = (() => {
      const raw = String(h.catRaw || "")
      if (CATEGORY_PRESETS[raw]) return CATEGORY_PRESETS[raw].label
      if (raw.includes("|")) return "Categorie mixtă"
      return raw || "Categorie"
    })()

    title.textContent = `${catLabel} • ${fmtMeters(h.radius)} • ${h.travelMode || "TRANSIT"}`
    info.appendChild(title)

    const meta = document.createElement("div")
    meta.style.fontSize = "11px"
    meta.style.color = "#aaa"
    meta.style.marginTop = "4px"
    meta.textContent = `${h.count || 0} rezultate • ${new Date(h.createdAt).toLocaleString()}`
    info.appendChild(meta)

    const btn = document.createElement("button")
    btn.textContent = "Reia"
    btn.style.marginTop = "8px"
    btn.style.width = "120px"
    btn.style.padding = "6px 10px"
    btn.style.borderRadius = "8px"
    btn.style.border = "1px solid #3b82f6"
    btn.style.background = "transparent"
    btn.style.color = "#3b82f6"
    btn.style.cursor = "pointer"

    btn.onclick = () => {
      if (byId("cat") && typeof h.catRaw === "string") byId("cat").value = h.catRaw
      if (byId("sort") && typeof h.sortMode === "string") byId("sort").value = h.sortMode
      if (byId("travelMode") && typeof h.travelMode === "string") byId("travelMode").value = h.travelMode
      circleRadius = clamp(Number(h.radius || circleRadius), 200, 20000)
      setRadiusUI(circleRadius)
      if (circle) circle.setRadius(circleRadius)

      if (h.center && Number.isFinite(h.center.lat) && Number.isFinite(h.center.lng)) {
        userPos = { ...h.center }
        circleCenter = { ...h.center }
        if (circle) circle.setCenter(circleCenter)
        focusOn(circleCenter.lat, circleCenter.lng, 13)
      }

      saveState()
      setActiveTabUI("results")
      runScan()
    }

    info.appendChild(btn)
    div.appendChild(info)
    list.appendChild(div)
  })
}

function renderActiveTab() {
  if (activeTab === "favorites") renderFavorites()
  else if (activeTab === "history") renderHistory()
}

function pushHistoryEntry(entry) {
  history.unshift(entry)
  history = history.slice(0, 50)
  saveState()
}

async function geocodeCityIfNeeded() {
  const input = byId("city")
  if (!input) return
  const q = String(input.value || "").trim()
  if (!q) return

  const geocoder = new google.maps.Geocoder()
  const res = await new Promise(resolve => {
    geocoder.geocode({ address: q }, (results, status) => {
      if (status === "OK" && results && results[0] && results[0].geometry && results[0].geometry.location) {
        resolve(results[0].geometry.location)
      } else resolve(null)
    })
  })

  if (!res) return
  const lat = res.lat()
  const lng = res.lng()
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

  userPos = { lat, lng }
  circleCenter = { lat, lng }
  if (circle) circle.setCenter(circleCenter)
  focusOn(lat, lng, 13)
  saveState()
}

function locateUser() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      if (map) focusOn(userPos.lat, userPos.lng, 13)
      if (circle) circle.setCenter(userPos)
      circleCenter = { ...userPos }
      saveState()
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000 }
  )
}

function updateRouteMode() {
  saveState()
}

function buildNearbyRequest() {
  const center = circle ? circle.getCenter() : new google.maps.LatLng(userPos.lat, userPos.lng)
  const radius = circle ? circle.getRadius() : circleRadius
  const types = getSelectedCategoryTypes()
  return { center, radius, types }
}

function nearbySearchOneType(type, center, radius) {
  if (!placesService) placesService = new google.maps.places.PlacesService(map)
  const req = { location: center, radius, type }
  return new Promise(resolve => {
    placesService.nearbySearch(req, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && Array.isArray(results)) resolve(results)
      else resolve([])
    })
  })
}

async function fetchPlacesMultiType(center, radius, types) {
  const all = []
  for (const t of types) {
    const res = await nearbySearchOneType(t, center, radius)
    res.forEach(x => all.push(x))
  }
  const seen = new Set()
  const dedup = []
  all.forEach(p => {
    if (!p || !p.place_id) return
    if (seen.has(p.place_id)) return
    seen.add(p.place_id)
    dedup.push(p)
  })
  return dedup
}

async function runScan() {
  if (!map || !circle) return

  await geocodeCityIfNeeded()

  const { center, radius, types } = buildNearbyRequest()
  const sortMode = getSelectedSortMode()
  const travelMode = getSelectedTravelMode()
  const catRaw = byId("cat") ? String(byId("cat").value) : "convenience_store"

  const results = await fetchPlacesMultiType(center, radius, types)
  const compact = results.map(normalizePlace)

  const c = { lat: center.lat(), lng: center.lng() }
  compact.forEach(p => {
    p.distance_m = (Number.isFinite(p.lat) && Number.isFinite(p.lng)) ? computeDistanceMeters(c, p) : Infinity
    p.__bestScore = scoreBestMatch(p)
  })

  if (sortMode === "rate") {
    compact.sort((a, b) => (b.rating - a.rating) || (a.distance_m - b.distance_m))
  } else if (sortMode === "best") {
    compact.sort((a, b) => (b.__bestScore - a.__bestScore) || (a.distance_m - b.distance_m))
  } else {
    compact.sort((a, b) => (a.distance_m - b.distance_m) || (b.rating - a.rating))
  }

  lastResults = compact
  setCount(compact.length)

  const list = byId("resultsList")
  renderResultsList(list, compact)

  clearMarkers()
  compact.forEach(p => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return
    const marker = new google.maps.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.name })
    marker.addListener("click", () => {
      focusOn(p.lat, p.lng, 15)
      openStreetView(p.lat, p.lng)
    })
    markers.push(marker)
  })

  pushHistoryEntry({
    createdAt: nowIso(),
    center: { lat: c.lat, lng: c.lng },
    radius: Number(radius),
    catRaw,
    travelMode,
    sortMode,
    count: compact.length
  })

  saveState()
}

function initMobileZoomControls() {
  const zIn = byId("zoomInBtn")
  const zOut = byId("zoomOutBtn")
  const grabBtn = byId("grabBtn")
  if (zIn) zIn.onclick = () => { if (map) map.setZoom((map.getZoom() || 13) + 1) }
  if (zOut) zOut.onclick = () => { if (map) map.setZoom((map.getZoom() || 13) - 1) }

  let grab = true
  function apply() {
    if (!map) return
    map.setOptions({
      gestureHandling: grab ? "greedy" : "cooperative",
      scrollwheel: true
    })
    if (grabBtn) grabBtn.classList.toggle("active", grab)
  }

  if (grabBtn) {
    grabBtn.onclick = () => {
      grab = !grab
      apply()
      saveState()
    }
  }
  apply()
}

function initRadiusControl() {
  const rad = byId("rad")
  if (rad) {
    rad.value = String(circleRadius)
    rad.oninput = () => {
      const v = clamp(Number(rad.value), 200, 20000)
      circleRadius = v
      setRadiusUI(v)
      if (circle) circle.setRadius(v)
      saveState()
    }
  }
  setRadiusUI(circleRadius)
}

function initCircle() {
  const center = circleCenter ? circleCenter : userPos
  circle = new google.maps.Circle({
    map,
    center,
    radius: circleRadius,
    fillColor: "#2a6cff",
    fillOpacity: 0.15,
    strokeColor: "#2a6cff",
    strokeOpacity: 0.9,
    strokeWeight: 2,
    draggable: true,
    editable: true
  })

  circle.addListener("center_changed", () => {
    const c = circle.getCenter()
    if (!c) return
    circleCenter = { lat: c.lat(), lng: c.lng() }
    saveState()
  })

  circle.addListener("radius_changed", () => {
    const r = clamp(Number(circle.getRadius()), 200, 20000)
    circleRadius = r
    setRadiusUI(r)
    saveState()
  })
}

function initAuthButton() {
  const btn = byId("authBtn")
  if (!btn) return
  btn.onclick = () => {
    location.href = "./login.html"
  }
}

function initMap() {
  loadState()

  const isMobile = window.matchMedia("(max-width: 768px)").matches
  map = new google.maps.Map(byId("map"), {
    center: circleCenter ? circleCenter : userPos,
    zoom: 13,
    disableDefaultUI: false,
    zoomControl: !isMobile,
    streetViewControl: !isMobile,
    mapTypeControl: false,
    gestureHandling: "greedy",
    scrollwheel: true
  })

  initMobileZoomControls()
  initRadiusControl()
  initCircle()
  initTabs()
  initAuthButton()
  ensureCloseStreetViewWiring()

  if (circleCenter) {
    userPos = { ...circleCenter }
  }

  const city = byId("city")
  if (city) {
    city.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runScan()
    })
    city.addEventListener("change", () => saveState())
  }

  const sort = byId("sort")
  if (sort) sort.onchange = () => { saveState(); if (lastResults.length) runScan() }
  const cat = byId("cat")
  if (cat) cat.onchange = () => saveState()
  const travelMode = byId("travelMode")
  if (travelMode) travelMode.onchange = () => updateRouteMode()

  renderActiveTab()

  if (!circleCenter && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        circleCenter = { ...userPos }
        if (circle) circle.setCenter(userPos)
        focusOn(userPos.lat, userPos.lng, 13)
        saveState()
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }
}

window.initMap = initMap
window.runScan = runScan
window.locateUser = locateUser
window.updateRouteMode = updateRouteMode
