let map, circle, service, directionsService, directionsRenderer
let miniStreetView
let markers = []
let userPos = { lat: 44.4268, lng: 26.1025 }

let currentSelectedDest = null
let currentSelectedMsgId = null

const LS_FAVS = "atlasgo_favs_v2"
const LS_HISTORY_RESULTS = "atlasgo_results_history_v1"
const LS_STATE = "atlasgo_last_state_v2"

const NOIMG_DATA_URL = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">' +
  '<rect width="100%" height="100%" fill="#2b2b2b"/>' +
  '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a9a9a" font-family="Arial" font-size="10">NoImg</text>' +
  "</svg>"
)

function byId(id) { return document.getElementById(id) }

function safeParseJSON(s, fallback) {
  try { return JSON.parse(s) } catch { return fallback }
}

function getAuthUser() {
  return window.__authUser || null
}

function requireLoginOrWarn() {
  const u = getAuthUser()
  if (!u) {
    alert("Trebuie să fii autentificat ca să folosești Favorite și Istoric.")
    return null
  }
  return u
}

function updateAuthButton() {
  const btn = byId("authBtn")
  if (!btn) return
  const u = getAuthUser()
  if (u) {
    btn.textContent = "Logout"
    btn.onclick = () => {
      if (window.logout) window.logout()
      else location.href = "./login.html"
    }
  } else {
    btn.textContent = "Login"
    btn.onclick = () => { location.href = "./login.html" }
  }
}

window.addEventListener("auth-changed", () => {
  updateAuthButton()
  renderFavs()
  renderHistory()
})

function setTab(name) {
  const tabs = [
    { btn: "tabResults", panel: "panelResults", name: "results" },
    { btn: "tabHistory", panel: "panelHistory", name: "history" },
    { btn: "tabFavs", panel: "panelFavs", name: "favs" }
  ]

  tabs.forEach(t => {
    const b = byId(t.btn)
    const p = byId(t.panel)
    if (b) b.classList.toggle("active", t.name === name)
    if (p) p.classList.toggle("active", t.name === name)
  })
}

function readFavs() {
  const f = safeParseJSON(localStorage.getItem(LS_FAVS), {})
  return f && typeof f === "object" ? f : {}
}

function writeFavs(obj) {
  const safeObj = obj && typeof obj === "object" ? obj : {}
  localStorage.setItem(LS_FAVS, JSON.stringify(safeObj))
}

function isFav(placeId) {
  const favs = readFavs()
  return Boolean(favs[placeId])
}

function toggleFav(placeObj) {
  const u = requireLoginOrWarn()
  if (!u) return
  const placeId = placeObj.place_id
  if (!placeId) return

  const favs = readFavs()
  if (favs[placeId]) {
    delete favs[placeId]
  } else {
    favs[placeId] = {
      place_id: placeId,
      name: placeObj.name || "",
      vicinity: placeObj.vicinity || "",
      rating: placeObj.rating || 0,
      dist: Math.round(placeObj.realDist || 0),
      lat: placeObj.geometry && placeObj.geometry.location ? placeObj.geometry.location.lat() : null,
      lng: placeObj.geometry && placeObj.geometry.location ? placeObj.geometry.location.lng() : null,
      photo: (placeObj.photos && placeObj.photos.length) ? placeObj.photos[0].getUrl({ maxWidth: 120 }) : "",
      ts: Date.now()
    }
  }

  writeFavs(favs)
  const btn = document.querySelector(`[data-fav-id="${placeId}"]`)
  if (btn) btn.textContent = favs[placeId] ? "★" : "☆"
  renderFavs()
}

function removeFavById(placeId) {
  const u = requireLoginOrWarn()
  if (!u) return
  const favs = readFavs()
  if (!favs[placeId]) return
  delete favs[placeId]
  writeFavs(favs)
  renderFavs()
  const btn = document.querySelector(`[data-fav-id="${placeId}"]`)
  if (btn) btn.textContent = "☆"
}

function renderFavs() {
  const list = byId("favList")
  if (!list) return

  const u = getAuthUser()
  if (!u) {
    list.innerHTML = '<div class="hint">Autentifică-te ca să vezi lista de favorite.</div>'
    return
  }

  const favs = readFavs()
  const arr = Object.values(favs).sort((a, b) => (b.ts || 0) - (a.ts || 0))

  if (!arr.length) {
    list.innerHTML = '<div class="hint">Nu ai favorite încă. Apasă pe ★ la un rezultat ca să îl salvezi.</div>'
    return
  }

  list.innerHTML = ""
  arr.forEach((f) => {
    const card = document.createElement("div")
    card.className = "card"
    card.onclick = () => {
      if (f.lat == null || f.lng == null) return
      selectSavedPlace(f)
      setTab("results")
    }

    const thumb = f.photo ? f.photo : NOIMG_DATA_URL
    card.innerHTML = `
      <img src="${thumb}" class="place-img">
      <div class="place-info">
        <div style="position:absolute; right:10px; top:8px; font-size:11px; color:#f1c40f;">★</div>
        <b>${escapeHtml(f.name)}</b><br>
        <span style="color:#f1c40f">${(f.rating || 0).toFixed ? (f.rating || 0).toFixed(1) : (f.rating || 0)} ★</span> |
        <span style="color:#aaa; font-size:11px">${f.dist || 0}m</span>
        <div class="mini-muted" style="margin-top:4px;">${escapeHtml(f.vicinity || "")}</div>
      </div>
      <div class="mini-action" title="Șterge">🗑</div>
    `

    const del = card.querySelector(".mini-action")
    del.onclick = (ev) => {
      ev.stopPropagation()
      removeFavById(f.place_id)
    }

    list.appendChild(card)
  })
}

function readResultsHistory() {
  const h = safeParseJSON(localStorage.getItem(LS_HISTORY_RESULTS), [])
  return Array.isArray(h) ? h : []
}

function writeResultsHistory(arr) {
  const safeArr = Array.isArray(arr) ? arr : []
  localStorage.setItem(LS_HISTORY_RESULTS, JSON.stringify(safeArr))
}

function historyKey(entry) {
  const city = (entry.city || "").trim().toLowerCase()
  return [
    city,
    entry.cat || "",
    String(entry.rad || ""),
    entry.sort || "",
    entry.mode || ""
  ].join("|")
}

function saveResultsToHistory(payload) {
  const u = requireLoginOrWarn()
  if (!u) return

  const arr = readResultsHistory()
  const key = historyKey(payload)
  const filtered = arr.filter(x => historyKey(x) !== key)
  filtered.unshift(payload)
  writeResultsHistory(filtered.slice(0, 12))
  renderHistory()
}

function renderHistory() {
  const list = byId("historyList")
  if (!list) return

  const u = getAuthUser()
  if (!u) {
    list.innerHTML = '<div class="hint">Autentifică-te ca să vezi istoricul de rezultate.</div>'
    return
  }

  const arr = readResultsHistory()
  if (!arr.length) {
    list.innerHTML = '<div class="hint">Nu ai istoric încă. Fă o scanare și îl salvez automat aici.</div>'
    return
  }

  list.innerHTML = ""
  arr.forEach((h) => {
    const card = document.createElement("div")
    card.className = "card"
    card.style.cursor = "pointer"

    const title = h.city && String(h.city).trim() ? h.city : "Zona curentă"
    const subtitle = `${escapeHtml(h.catLabel)} • ${h.count || 0} rezultate`
    const time = h.ts ? new Date(h.ts).toLocaleString() : ""

    card.innerHTML = `
      <div class="place-info" style="padding-right:10px;">
        <b>${escapeHtml(title)}</b><br>
        <span style="color:#aaa; font-size:11px">${subtitle}</span>
        <div class="mini-muted" style="margin-top:6px;">${escapeHtml(time)}</div>
      </div>
    `

    card.onclick = () => {
      showSavedResults(h)
      setTab("results")
    }

    list.appendChild(card)
  })
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function labelForCategoryValue(v) {
  const sel = byId("cat")
  if (!sel) return v
  const opt = sel.querySelector(`option[value="${v}"]`)
  return opt ? (opt.textContent || v) : v
}

function getCategoryKeywords(raw) {
  return String(raw).split("|").map(s => s.trim()).filter(Boolean)
}

function iconForMode(mode) {
  if (mode === "TRANSIT") return "🚌"
  if (mode === "WALKING") return "🚶"
  if (mode === "BICYCLING") return "🚴"
  return "🚗"
}

function directionsRequest(origin, dest, mode) {
  return {
    origin: origin,
    destination: dest,
    travelMode: google.maps.TravelMode[mode],
    provideRouteAlternatives: true
  }
}

function saveState() {
  const st = {
    city: byId("city") ? (byId("city").value || "") : "",
    cat: byId("cat") ? byId("cat").value : "convenience_store",
    mode: byId("travelMode") ? byId("travelMode").value : "TRANSIT",
    sort: byId("sort") ? byId("sort").value : "dist",
    rad: byId("rad") ? parseInt(byId("rad").value, 10) : 1500
  }
  localStorage.setItem(LS_STATE, JSON.stringify(st))
}

function loadState() {
  const st = safeParseJSON(localStorage.getItem(LS_STATE), null)
  if (!st) return
  if (byId("city") && typeof st.city === "string") byId("city").value = st.city
  if (byId("cat") && typeof st.cat === "string") byId("cat").value = st.cat
  if (byId("travelMode") && typeof st.mode === "string") {
    const m = st.mode === "BICYCLING" ? "WALKING" : st.mode
    byId("travelMode").value = m
  }
  if (byId("sort") && typeof st.sort === "string") byId("sort").value = st.sort
  if (byId("rad") && typeof st.rad === "number") byId("rad").value = String(st.rad)
  if (byId("rVal") && typeof st.rad === "number") byId("rVal").innerText = String(st.rad)
}

function initTabs() {
  const a = byId("tabResults")
  const b = byId("tabHistory")
  const c = byId("tabFavs")
  if (a) a.onclick = () => setTab("results")
  if (b) b.onclick = () => { setTab("history"); renderHistory() }
  if (c) c.onclick = () => { setTab("favs"); renderFavs() }
}

function initMobileZoomButtons() {
  const zin = byId("zoomInBtn")
  const zout = byId("zoomOutBtn")
  if (!zin || !zout) return

  zin.onclick = () => {
    if (!map) return
    const z = map.getZoom()
    if (typeof z !== "number") return
    map.setZoom(z + 1)
  }

  zout.onclick = () => {
    if (!map) return
    const z = map.getZoom()
    if (typeof z !== "number") return
    map.setZoom(z - 1)
  }
}

function initMap() {
  loadState()
  initTabs()
  updateAuthButton()
  renderFavs()
  renderHistory()

  map = new google.maps.Map(byId("map"), {
    center: userPos,
    zoom: 13,
    disableDefaultUI: false,
    streetViewControl: true,
    mapTypeControl: false,
    gestureHandling: "cooperative"
  })

  initMobileZoomButtons()

  let grabEnabled = false

  function setGrabEnabled(on) {
    grabEnabled = !!on
    map.setOptions({ gestureHandling: grabEnabled ? "greedy" : "cooperative" })
    const btn = byId("grabBtn")
    if (btn) btn.classList.toggle("active", grabEnabled)
  }

  function addGrabControl() {
    const controlDiv = document.createElement("div")
    controlDiv.className = "grab-control"

    const button = document.createElement("button")
    button.type = "button"
    button.id = "grabBtn"
    button.className = "grab-btn"
    button.title = "Grab (1 deget pe telefon)"
    button.innerText = "🖐️"
    button.addEventListener("click", () => setGrabEnabled(!grabEnabled))

    controlDiv.appendChild(button)
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(controlDiv)
  }

  addGrabControl()

  new google.maps.TransitLayer().setMap(map)

  directionsService = new google.maps.DirectionsService()
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 6, strokeOpacity: 0.7 }
  })

  miniStreetView = new google.maps.StreetViewPanorama(
    byId("sv-container"),
    {
      position: userPos,
      pov: { heading: 34, pitch: 10 },
      visible: true,
      disableDefaultUI: false,
      zoomControl: true,
      panControl: true
    }
  )

  const radius = byId("rad") ? parseInt(byId("rad").value, 10) : 1500

  circle = new google.maps.Circle({
    map: map,
    center: userPos,
    radius: radius || 1500,
    fillColor: "#3b82f6",
    fillOpacity: 0.1,
    strokeColor: "#3b82f6",
    strokeWeight: 2,
    editable: true,
    draggable: true
  })

  circle.addListener("center_changed", () => { userPos = circle.getCenter() })

  service = new google.maps.places.PlacesService(map)

  const cityInput = byId("city")
  if (cityInput) {
    const ac = new google.maps.places.Autocomplete(cityInput)
    ac.bindTo("bounds", map)
    ac.addListener("place_changed", () => {
      const p = ac.getPlace()
      if (p.geometry) {
        userPos = p.geometry.location
        updateMapCenter()
      }
    })
  }

  const elements = ["city", "cat", "travelMode", "sort", "rad"]
  elements.forEach((id) => {
    const el = byId(id)
    if (!el) return
    el.addEventListener("change", saveState)
    el.addEventListener("input", saveState)
  })
}

window.initMap = initMap

function locateUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        userPos = { lat: p.coords.latitude, lng: p.coords.longitude }
        updateMapCenter()
      },
      () => { alert("Eroare GPS.") }
    )
  } else {
    alert("Fara suport GPS.")
  }
}

function updateMapCenter() {
  if (!map || !circle) return
  map.setCenter(userPos)
  map.setZoom(15)
  circle.setCenter(userPos)
}

function updateRouteMode() {
  saveState()
  if (currentSelectedDest && currentSelectedMsgId) {
    calculateAndDisplayRoute(currentSelectedDest, currentSelectedMsgId)
  }
}

function nearbySearchAsync(req) {
  return new Promise((resolve) => {
    service.nearbySearch(req, (res, status) => {
      if (status === "OK" && res) resolve(res)
      else resolve([])
    })
  })
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null))
  markers = []
}

function renderResultsFromPlaces(places) {
  const list = byId("resultsList")
  if (!list) return
  list.innerHTML = ""

  clearMarkers()

  if (!places || !places.length) {
    list.innerHTML = '<div class="hint">Niciun rezultat.</div>'
    byId("count").innerText = "0"
    return
  }

  byId("count").innerText = String(places.length)

  places.forEach((p, idx) => {
    if (p.lat != null && p.lng != null) {
      const pos = { lat: p.lat, lng: p.lng }
      markers.push(new google.maps.Marker({ map: map, position: pos, title: p.name || "" }))
    }

    const badge = idx === 0 ? '<div class="best-badge">BEST</div>' : ""
    const thumbUrl = p.photo ? p.photo : NOIMG_DATA_URL
    const favSymbol = (p.place_id && isFav(p.place_id)) ? "★" : "☆"
    const safePlaceId = (p.place_id || "").replace(/'/g, "")

    const card = document.createElement("div")
    card.className = "card"
    card.onclick = () => {
      if (p.lat == null || p.lng == null) return
      const dest = { lat: p.lat, lng: p.lng }
      currentSelectedDest = dest
      currentSelectedMsgId = "route-msg-" + idx

      const panel = byId("sv-panel")
      if (panel) panel.style.display = "block"
      if (miniStreetView) miniStreetView.setPosition(dest)

      const svService = new google.maps.StreetViewService()
      svService.getPanorama({ location: dest, radius: 50 }, (data, status) => {
        if (status !== "OK" && panel) panel.style.display = "none"
      })

      calculateAndDisplayRoute(dest, currentSelectedMsgId)
      map.setCenter(dest)
      map.setZoom(16)
    }

    card.innerHTML = `
      <img src="${thumbUrl}" class="place-img">
      <div class="place-info">
        ${badge}
        <b>${escapeHtml(p.name || "")}</b><br>
        <span style="color:#f1c40f">${p.rating || "-"} ★</span> |
        <span style="color:#aaa; font-size:11px">${p.dist || 0}m</span>
        <div id="route-msg-${idx}" class="route-info">...</div>
        <div id="steps-${idx}" class="transit-steps"></div>
      </div>
      <div class="fav-btn" data-fav-id="${safePlaceId}">${favSymbol}</div>
    `

    const favBtn = card.querySelector(".fav-btn")
    favBtn.onclick = (ev) => {
      ev.stopPropagation()
      const fake = {
        place_id: p.place_id,
        name: p.name,
        vicinity: p.vicinity,
        rating: p.rating,
        realDist: p.dist,
        geometry: { location: { lat: () => p.lat, lng: () => p.lng } },
        photos: p.photo ? [{ getUrl: () => p.photo }] : []
      }
      toggleFav(fake)
    }

    list.appendChild(card)
  })
}

function showSavedResults(entry) {
  if (!entry || !entry.results) return
  directionsRenderer.setDirections({ routes: [] })
  byId("sv-panel").style.display = "none"
  currentSelectedDest = null
  currentSelectedMsgId = null

  renderResultsFromPlaces(entry.results)

  if (entry.center && entry.center.lat != null && entry.center.lng != null) {
    const center = { lat: entry.center.lat, lng: entry.center.lng }
    map.setCenter(center)
    map.setZoom(14)
    circle.setCenter(center)
    circle.setRadius(entry.rad || circle.getRadius())
  }
}

function selectSavedPlace(f) {
  if (f.lat == null || f.lng == null) return
  const dest = { lat: f.lat, lng: f.lng }
  currentSelectedDest = dest
  currentSelectedMsgId = "route-msg-fav"

  directionsRenderer.setDirections({ routes: [] })
  byId("sv-panel").style.display = "block"
  miniStreetView.setPosition(dest)

  const svService = new google.maps.StreetViewService()
  svService.getPanorama({ location: dest, radius: 50 }, (data, status) => {
    if (status !== "OK") byId("sv-panel").style.display = "none"
  })

  calculateAndDisplayRoute(dest, currentSelectedMsgId)
  map.setCenter(dest)
  map.setZoom(16)
}

async function runScan() {
  const r = parseInt(byId("rad").value, 10)
  const cRaw = byId("cat").value
  const s = byId("sort").value
  const mode = byId("travelMode").value
  const cityText = byId("city").value || ""

  circle.setRadius(r)
  directionsRenderer.setDirections({ routes: [] })
  byId("sv-panel").style.display = "none"
  currentSelectedDest = null
  currentSelectedMsgId = null

  const center = circle.getCenter()
  const cats = getCategoryKeywords(cRaw)

  setTab("results")
  const list = byId("resultsList")
  list.innerHTML = '<div class="hint">Caut...</div>'

  const all = new Map()
  for (const kw of cats) {
    const req = { location: center, radius: r, keyword: kw }
    const res = await nearbySearchAsync(req)
    res.forEach(p => { if (p.place_id && !all.has(p.place_id)) all.set(p.place_id, p) })
  }

  let res = Array.from(all.values())
  res.forEach(p => p.realDist = google.maps.geometry.spherical.computeDistanceBetween(center, p.geometry.location))
  res = res.filter(p => p.realDist <= r)

  if (s === "dist") res.sort((a, b) => a.realDist - b.realDist)
  else if (s === "rate") res.sort((a, b) => (b.rating || 0) - (a.rating || 0))
  else res.sort((a, b) => ((b.rating || 0) * 1000 - b.realDist) - ((a.rating || 0) * 1000 - a.realDist))

  const compact = res.slice(0, 25).map(p => {
    const photo = (p.photos && p.photos.length) ? p.photos[0].getUrl({ maxWidth: 120 }) : ""
    return {
      place_id: p.place_id || "",
      name: p.name || "",
      vicinity: p.vicinity || "",
      rating: p.rating || "-",
      dist: Math.round(p.realDist || 0),
      lat: p.geometry && p.geometry.location ? p.geometry.location.lat() : null,
      lng: p.geometry && p.geometry.location ? p.geometry.location.lng() : null,
      photo: photo
    }
  })

  const payload = {
    ts: Date.now(),
    city: cityText,
    cat: cRaw,
    catLabel: labelForCategoryValue(cRaw),
    rad: r,
    sort: s,
    mode: mode,
    count: res.length,
    center: { lat: center.lat(), lng: center.lng() },
    results: compact
  }

  saveResultsToHistory(payload)
  renderResultsFromPlaces(compact)
}

function calculateAndDisplayRoute(dest, msgId) {
  const mode = byId("travelMode").value

  document.querySelectorAll(".route-info").forEach(e => e.style.display = "none")
  document.querySelectorAll(".transit-steps").forEach(e => e.innerHTML = "")

  const div = byId(msgId)
  const stepsDiv = byId(msgId.replace("route-msg-", "steps-"))

  if (div) {
    div.style.display = "block"
    div.innerText = "Calculare..."
  }

  const tryMode = (m, fallbackNote) => {
    directionsService.route(directionsRequest(userPos, dest, m), (res, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(res)
        const leg = res.routes[0].legs[0]
        if (div) div.innerHTML = `${iconForMode(m)} ${leg.duration.text} (${leg.distance.text})`

        if (m === "TRANSIT" && stepsDiv) {
          let stepSummary = ""
          leg.steps.forEach(step => {
            if (step.travel_mode === "TRANSIT" && step.transit) {
              const line = step.transit.line.short_name || step.transit.line.name
              const vehicle = (step.transit.line.vehicle && step.transit.line.vehicle.name) ? step.transit.line.vehicle.name : "Transit"
              stepSummary += `<span class="step-badge" style="background:#2980b9">${vehicle} ${line}</span> `
            } else if (step.travel_mode === "WALKING") {
              stepSummary += `<span class="step-badge">🚶 ${step.duration.text}</span> `
            }
          })
          stepsDiv.innerHTML = stepSummary ? ("Traseu: " + stepSummary) : "Doar mers pe jos (prea aproape)."
        } else if (stepsDiv) {
          stepsDiv.innerHTML = fallbackNote ? `<span class="mini-muted">${escapeHtml(fallbackNote)}</span>` : ""
        }
      } else {
        if (m === "BICYCLING") {
          tryMode("WALKING", "Bicicletă nu are rută disponibilă aici. Am afișat mers pe jos.")
          return
        }
        if (div) div.innerText = "Nu exista ruta."
      }
    })
  }

  if (mode === "BICYCLING") {
    tryMode("BICYCLING", "")
    return
  }

  tryMode(mode, "")
}

byId("tabResults")?.addEventListener("click", () => setTab("results"))
byId("tabHistory")?.addEventListener("click", () => { setTab("history"); renderHistory() })
byId("tabFavs")?.addEventListener("click", () => { setTab("favs"); renderFavs() })

window.runScan = runScan
window.locateUser = locateUser
window.updateRouteMode = updateRouteMode
