let map, circle, service, directionsService, directionsRenderer
let placesMarkers = []
let lastResults = []
let favorites = []
let history = []
let activeTab = "results"
let userPos = { lat: 44.4268, lng: 26.1025 }
let circleCenter = null
let circleRadius = 1500
let categoryKey = "grocery_or_supermarket"
let travelMode = "TRANSIT"
let sortMode = "distance"
let lastScanPayload = null
let isMobile = false
let currentUser = null

const LS_KEY = "atlasgo_last_state_v2"

const NOIMG_DATA_URL = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">' +
  '<rect width="100%" height="100%" fill="#2b2b2b"/>' +
  '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a9a9a" font-family="Arial" font-size="10">' +
  "no image" +
  "</text></svg>"
)

const CATEGORY_MAP = {
  grocery_or_supermarket: { label: "Magazine / Minimarket", placeTypes: ["grocery_or_supermarket", "supermarket", "convenience_store"] },
  restaurant: { label: "Restaurante", placeTypes: ["restaurant"] },
  cafe: { label: "Cafenele", placeTypes: ["cafe"] },
  pharmacy: { label: "Farmacii", placeTypes: ["pharmacy"] },
  atm: { label: "ATM", placeTypes: ["atm"] },
  hospital: { label: "Spitale", placeTypes: ["hospital"] },
  gas_station: { label: "Benzinării", placeTypes: ["gas_station"] },
  bank: { label: "Bănci", placeTypes: ["bank"] },
  shopping_mall: { label: "Mall", placeTypes: ["shopping_mall"] },
  gym: { label: "Sală / Fitness", placeTypes: ["gym"] }
}

const TRAVEL_MODE_LABEL = {
  DRIVING: "Mașină",
  WALKING: "Pietonal",
  BICYCLING: "Bicicletă",
  TRANSIT: "Autobuz/Metrou"
}

function byId(id) { return document.getElementById(id) }

function safeParseJSON(s, fallback) {
  try { return JSON.parse(s) } catch { return fallback }
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)) }

function fmtMeters(m) {
  if (!Number.isFinite(m)) return "-"
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

function fmtRating(r) {
  if (!Number.isFinite(r)) return "-"
  return r.toFixed(1)
}

function nowIso() { return new Date().toISOString() }

function saveState() {
  const data = {
    circleCenter,
    circleRadius,
    categoryKey,
    travelMode,
    sortMode,
    favorites,
    history
  }
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function loadState() {
  const data = safeParseJSON(localStorage.getItem(LS_KEY), null)
  if (!data) return
  if (data.circleCenter && Number.isFinite(data.circleCenter.lat) && Number.isFinite(data.circleCenter.lng)) {
    circleCenter = data.circleCenter
  }
  if (Number.isFinite(data.circleRadius)) circleRadius = clamp(Number(data.circleRadius), 200, 20000)
  if (typeof data.categoryKey === "string" && CATEGORY_MAP[data.categoryKey]) categoryKey = data.categoryKey
  if (typeof data.travelMode === "string" && TRAVEL_MODE_LABEL[data.travelMode]) travelMode = data.travelMode
  if (typeof data.sortMode === "string") sortMode = data.sortMode
  if (Array.isArray(data.favorites)) favorites = data.favorites
  if (Array.isArray(data.history)) history = data.history
}

function setActiveTab(tab) {
  activeTab = tab
  const tabResults = byId("tabResults")
  const tabHistory = byId("tabHistory")
  const tabFavorites = byId("tabFavorites")
  const panelResults = byId("panelResults")
  const panelHistory = byId("panelHistory")
  const panelFavorites = byId("panelFavorites")

  if (tabResults) tabResults.classList.toggle("active", tab === "results")
  if (tabHistory) tabHistory.classList.toggle("active", tab === "history")
  if (tabFavorites) tabFavorites.classList.toggle("active", tab === "favorites")

  if (panelResults) panelResults.style.display = tab === "results" ? "block" : "none"
  if (panelHistory) panelHistory.style.display = tab === "history" ? "block" : "none"
  if (panelFavorites) panelFavorites.style.display = tab === "favorites" ? "block" : "none"
}

function initTabs() {
  const tabResults = byId("tabResults")
  const tabHistory = byId("tabHistory")
  const tabFavorites = byId("tabFavorites")
  if (tabResults) tabResults.onclick = () => { setActiveTab("results"); renderActiveTab() }
  if (tabHistory) tabHistory.onclick = () => { setActiveTab("history"); renderActiveTab() }
  if (tabFavorites) tabFavorites.onclick = () => { setActiveTab("favorites"); renderActiveTab() }
  setActiveTab(activeTab)
}

function updateAuthUI() {
  const logoutBtn = byId("logoutBtn")
  if (logoutBtn) logoutBtn.style.display = currentUser ? "inline-flex" : "none"
}

function setResultsCount(n) {
  const el = byId("resultsCount")
  if (el) el.textContent = String(n)
}

function setRadiusLabel(m) {
  const el = byId("radiusLabel")
  if (el) el.textContent = `RAZĂ: ${fmtMeters(m)}`
}

function setCategoryUI() {
  const select = byId("categorySelect")
  if (!select) return
  select.value = categoryKey
}

function setTravelModeUI() {
  const select = byId("travelModeSelect")
  if (!select) return
  select.value = travelMode
}

function setSortUI() {
  const select = byId("sortSelect")
  if (!select) return
  select.value = sortMode
}

function buildCategoryOptions() {
  const select = byId("categorySelect")
  if (!select) return
  select.innerHTML = ""
  Object.entries(CATEGORY_MAP).forEach(([k, v]) => {
    const opt = document.createElement("option")
    opt.value = k
    opt.textContent = v.label
    select.appendChild(opt)
  })
}

function buildTravelModeOptions() {
  const select = byId("travelModeSelect")
  if (!select) return
  select.innerHTML = ""
  Object.entries(TRAVEL_MODE_LABEL).forEach(([k, v]) => {
    const opt = document.createElement("option")
    opt.value = k
    opt.textContent = v
    select.appendChild(opt)
  })
}

function initControls() {
  const gpsBtn = byId("gpsBtn")
  const scanBtn = byId("scanBtn")
  const radiusSlider = byId("radiusSlider")
  const categorySelect = byId("categorySelect")
  const travelModeSelect = byId("travelModeSelect")
  const sortSelect = byId("sortSelect")
  const cityInput = byId("cityInput")

  if (gpsBtn) gpsBtn.onclick = () => locateMe()
  if (scanBtn) scanBtn.onclick = () => runScan()

  if (radiusSlider) {
    radiusSlider.value = String(circleRadius)
    setRadiusLabel(circleRadius)
    radiusSlider.oninput = () => {
      circleRadius = clamp(Number(radiusSlider.value), 200, 20000)
      setRadiusLabel(circleRadius)
      if (circle) circle.setRadius(circleRadius)
      saveState()
    }
  }

  if (categorySelect) {
    categorySelect.onchange = () => {
      categoryKey = categorySelect.value
      saveState()
    }
  }

  if (travelModeSelect) {
    travelModeSelect.onchange = () => {
      travelMode = travelModeSelect.value
      saveState()
    }
  }

  if (sortSelect) {
    sortSelect.onchange = () => {
      sortMode = sortSelect.value
      if (lastScanPayload) {
        renderResultsFromPlaces(lastResults)
      }
      saveState()
    }
  }

  if (cityInput) {
    cityInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        geocodeCity(cityInput.value)
      }
    }
  }
}

function initMobileControls(mapRef) {
  const grabBtn = byId("grabBtn")
  const mobileBar = byId("mobileBar")
  const isMobileNow = window.matchMedia("(max-width: 768px)").matches
  if (mobileBar) mobileBar.style.display = isMobileNow ? "flex" : "none"
  return { grabBtn }
}

function locateMe() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      if (map) map.panTo(userPos)
      if (circle) circle.setCenter(userPos)
      circleCenter = { ...userPos }
      saveState()
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000 }
  )
}

function geocodeCity(city) {
  const q = (city || "").trim()
  if (!q) return
  const geocoder = new google.maps.Geocoder()
  geocoder.geocode({ address: q }, (results, status) => {
    if (status !== "OK" || !results || !results[0]) return
    const loc = results[0].geometry.location
    userPos = { lat: loc.lat(), lng: loc.lng() }
    if (map) map.panTo(userPos)
    if (circle) circle.setCenter(userPos)
    circleCenter = { ...userPos }
    saveState()
  })
}

function clearMarkers() {
  placesMarkers.forEach(m => m.setMap(null))
  placesMarkers = []
}

function setMapOverlayActive(isActive) {
  const overlay = byId("mapOverlay")
  if (!overlay) return
  overlay.style.display = isActive ? "block" : "none"
}

function buildPlaceRequest() {
  const center = circle ? circle.getCenter() : new google.maps.LatLng(userPos.lat, userPos.lng)
  const radius = circle ? circle.getRadius() : circleRadius
  const cat = CATEGORY_MAP[categoryKey] ? CATEGORY_MAP[categoryKey].placeTypes : ["grocery_or_supermarket"]
  return { center, radius, cat }
}

function placeToCompact(p) {
  const loc = p.geometry && p.geometry.location
  const lat = loc ? (typeof loc.lat === "function" ? loc.lat() : loc.lat) : null
  const lng = loc ? (typeof loc.lng === "function" ? loc.lng() : loc.lng) : null
  return {
    place_id: p.place_id,
    name: p.name || "",
    rating: Number(p.rating || 0),
    user_ratings_total: Number(p.user_ratings_total || 0),
    vicinity: p.vicinity || "",
    types: p.types || [],
    lat,
    lng,
    photos: p.photos ? p.photos.map(ph => {
      try { return ph.getUrl({ maxWidth: 300, maxHeight: 200 }) } catch { return NOIMG_DATA_URL }
    }) : []
  }
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

function sortPlaces(compact) {
  const center = circle ? circle.getCenter() : new google.maps.LatLng(userPos.lat, userPos.lng)
  const c = { lat: center.lat(), lng: center.lng() }
  const withDist = compact.map(p => ({
    ...p,
    distance_m: Number.isFinite(p.lat) && Number.isFinite(p.lng) ? computeDistanceMeters(c, p) : Infinity
  }))

  if (sortMode === "rating") {
    withDist.sort((x, y) => (y.rating - x.rating) || (x.distance_m - y.distance_m))
  } else {
    withDist.sort((x, y) => (x.distance_m - y.distance_m) || (y.rating - x.rating))
  }
  return withDist
}

function markerForPlace(p) {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
  const marker = new google.maps.Marker({
    map,
    position: { lat: p.lat, lng: p.lng },
    title: p.name
  })
  return marker
}

function computeTravelTimeSeconds(origin, dest, mode) {
  return new Promise(resolve => {
    const matrix = new google.maps.DistanceMatrixService()
    matrix.getDistanceMatrix({
      origins: [origin],
      destinations: [dest],
      travelMode: mode,
      unitSystem: google.maps.UnitSystem.METRIC
    }, (resp, status) => {
      if (status !== "OK" || !resp || !resp.rows || !resp.rows[0] || !resp.rows[0].elements || !resp.rows[0].elements[0]) {
        resolve(null)
        return
      }
      const el = resp.rows[0].elements[0]
      if (!el.duration || !Number.isFinite(el.duration.value)) {
        resolve(null)
        return
      }
      resolve(el.duration.value)
    })
  })
}

function attachRouteOnClick(marker, p) {
  if (!marker) return
  marker.addListener("click", () => {
    focusPlace(p)
  })
}

function focusPlace(p) {
  if (!map) return
  if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    map.panTo({ lat: p.lat, lng: p.lng })
    map.setZoom(15)
  }
}

function isFavorite(placeId) {
  return favorites.some(f => f.place_id === placeId)
}

function toggleFavorite(p) {
  const idx = favorites.findIndex(f => f.place_id === p.place_id)
  if (idx >= 0) favorites.splice(idx, 1)
  else favorites.unshift({ ...p, savedAt: nowIso() })
  saveState()
  renderActiveTab()
}

function addToHistory(payload) {
  history.unshift(payload)
  history = history.slice(0, 50)
  saveState()
}

function saveResultsToHistory(payload) {
  addToHistory(payload)
}

function renderResultCard(p) {
  const div = document.createElement("div")
  div.className = "placeCard"

  const img = document.createElement("img")
  img.className = "placeImg"
  img.src = (p.photos && p.photos[0]) ? p.photos[0] : NOIMG_DATA_URL
  img.alt = p.name || "place"
  div.appendChild(img)

  const body = document.createElement("div")
  body.className = "placeBody"

  const row1 = document.createElement("div")
  row1.className = "placeRow"

  const name = document.createElement("div")
  name.className = "placeName"
  name.textContent = p.name || "Loc fără nume"
  row1.appendChild(name)

  const badge = document.createElement("div")
  badge.className = "placeBadge"
  if (p.__best) {
    badge.textContent = "BEST"
    badge.classList.add("best")
  } else {
    badge.textContent = ""
  }
  row1.appendChild(badge)

  body.appendChild(row1)

  const row2 = document.createElement("div")
  row2.className = "placeRow"

  const rating = document.createElement("div")
  rating.className = "placeRating"
  rating.textContent = `${fmtRating(p.rating)} ★`
  row2.appendChild(rating)

  const dist = document.createElement("div")
  dist.className = "placeDistance"
  dist.textContent = fmtMeters(p.distance_m)
  row2.appendChild(dist)

  body.appendChild(row2)

  const row3 = document.createElement("div")
  row3.className = "placeRow"

  const addr = document.createElement("div")
  addr.className = "placeAddr"
  addr.textContent = p.vicinity || ""
  row3.appendChild(addr)

  const favBtn = document.createElement("button")
  favBtn.className = "favBtn"
  favBtn.textContent = isFavorite(p.place_id) ? "★" : "☆"
  favBtn.onclick = () => toggleFavorite(p)
  row3.appendChild(favBtn)

  body.appendChild(row3)

  div.appendChild(body)

  div.onclick = (e) => {
    const t = e.target
    if (t && t.classList && t.classList.contains("favBtn")) return
    focusPlace(p)
  }

  return div
}

function renderResultsFromPlaces(compactPlaces) {
  const list = byId("resultsList")
  if (!list) return
  list.innerHTML = ""

  const sorted = sortPlaces(compactPlaces)
  if (sorted.length > 0) sorted[0].__best = true

  sorted.forEach(p => {
    const card = renderResultCard(p)
    list.appendChild(card)
  })

  setResultsCount(sorted.length)

  clearMarkers()
  sorted.forEach(p => {
    const marker = markerForPlace(p)
    if (marker) {
      placesMarkers.push(marker)
      attachRouteOnClick(marker, p)
    }
  })
}

function renderFavorites() {
  const list = byId("favoritesList")
  if (!list) return
  list.innerHTML = ""
  favorites.forEach(p => {
    const card = renderResultCard(p)
    list.appendChild(card)
  })
}

function renderHistory() {
  const list = byId("historyList")
  if (!list) return
  list.innerHTML = ""
  history.forEach(h => {
    const div = document.createElement("div")
    div.className = "historyCard"
    const title = document.createElement("div")
    title.className = "historyTitle"
    const catLabel = CATEGORY_MAP[h.categoryKey] ? CATEGORY_MAP[h.categoryKey].label : h.categoryKey
    title.textContent = `${catLabel} • ${fmtMeters(h.radius)} • ${TRAVEL_MODE_LABEL[h.travelMode] || h.travelMode}`
    div.appendChild(title)

    const meta = document.createElement("div")
    meta.className = "historyMeta"
    meta.textContent = `${h.count} rezultate • ${new Date(h.createdAt).toLocaleString()}`
    div.appendChild(meta)

    const btn = document.createElement("button")
    btn.className = "historyBtn"
    btn.textContent = "Reia"
    btn.onclick = () => {
      categoryKey = h.categoryKey
      travelMode = h.travelMode
      sortMode = h.sortMode || sortMode
      circleRadius = h.radius
      if (h.center && Number.isFinite(h.center.lat) && Number.isFinite(h.center.lng)) {
        userPos = { ...h.center }
        if (map) map.panTo(userPos)
        if (circle) circle.setCenter(userPos)
      }
      if (circle) circle.setRadius(circleRadius)
      setCategoryUI()
      setTravelModeUI()
      setSortUI()
      const radiusSlider = byId("radiusSlider")
      if (radiusSlider) radiusSlider.value = String(circleRadius)
      setRadiusLabel(circleRadius)
      saveState()
      runScan()
      setActiveTab("results")
      renderActiveTab()
    }
    div.appendChild(btn)

    list.appendChild(div)
  })
}

function renderActiveTab() {
  if (activeTab === "favorites") renderFavorites()
  else if (activeTab === "history") renderHistory()
}

function runScan() {
  if (!map || !circle) return
  setMapOverlayActive(true)

  const { center, radius, cat } = buildPlaceRequest()
  const req = {
    location: center,
    radius: radius,
    type: cat[0]
  }

  if (!service) service = new google.maps.places.PlacesService(map)

  service.nearbySearch(req, (results, status) => {
    setMapOverlayActive(false)
    if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
      lastResults = []
      renderResultsFromPlaces([])
      return
    }

    const compact = results.map(placeToCompact)
    lastResults = compact

    const payload = {
      createdAt: nowIso(),
      center: { lat: center.lat(), lng: center.lng() },
      radius: radius,
      categoryKey,
      travelMode,
      sortMode,
      count: compact.length
    }

    lastScanPayload = payload
    saveResultsToHistory(payload)
    renderResultsFromPlaces(compact)
    saveState()
  })
}

function initDirections() {
  directionsService = new google.maps.DirectionsService()
  directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers: true })
  directionsRenderer.setMap(map)
}

function initCircle() {
  const center = circleCenter ? circleCenter : userPos
  circle = new google.maps.Circle({
    map: map,
    center: center,
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
    circleCenter = { lat: c.lat(), lng: c.lng() }
    saveState()
  })

  circle.addListener("radius_changed", () => {
    circleRadius = clamp(circle.getRadius(), 200, 20000)
    const radiusSlider = byId("radiusSlider")
    if (radiusSlider) radiusSlider.value = String(circleRadius)
    setRadiusLabel(circleRadius)
    saveState()
  })
}

function wireLogout() {
  const logoutBtn = byId("logoutBtn")
  if (!logoutBtn) return
  logoutBtn.onclick = () => {
    if (window.firebaseAuth && window.firebaseAuth.signOut) {
      window.firebaseAuth.signOut()
    } else {
      location.href = "./login.html"
    }
  }
}

function initMap() {
  loadState()
  initTabs()
  updateAuthUI()
  isMobile = window.matchMedia("(max-width: 768px)").matches

  map = new google.maps.Map(byId("map"), {
    center: userPos,
    zoom: 13,
    disableDefaultUI: false,
    zoomControl: !isMobile,
    streetViewControl: !isMobile,
    mapTypeControl: false,
    gestureHandling: "greedy",
    scrollwheel: true
  })

  const controls = initMobileControls(map)

  let grabEnabled = false

  function setGrabEnabled(on) {
    grabEnabled = !!on
    map.setOptions({ gestureHandling: "greedy", scrollwheel: true })
    const btn = byId("grabBtn")
    if (btn) btn.classList.toggle("active", grabEnabled)
  }

  if (controls.grabBtn) {
    controls.grabBtn.onclick = () => setGrabEnabled(!grabEnabled)
  }

  if (circleCenter) {
    userPos = { ...circleCenter }
  }

  map.panTo(userPos)

  initDirections()
  initCircle()
  buildCategoryOptions()
  buildTravelModeOptions()
  setCategoryUI()
  setTravelModeUI()
  setSortUI()
  initControls()
  wireLogout()

  const radiusSlider = byId("radiusSlider")
  if (radiusSlider) radiusSlider.value = String(circleRadius)
  setRadiusLabel(circleRadius)

  if (!circleCenter && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        map.panTo(userPos)
        circle.setCenter(userPos)
        circleCenter = { ...userPos }
        saveState()
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  renderActiveTab()
}

window.initMap = initMap
