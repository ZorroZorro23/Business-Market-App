let markerByPlaceId = new Map()
let focusActive = false
let focusedPlaceId = null
let focusedMarker = null

let map, circle, service, directionsService, directionsRenderer
let miniStreetView
let markers = []
let userPos = { lat: 44.4268, lng: 26.1025 }

const PAGE_SIZE = 20
const MAX_API_PAGES_PER_KEYWORD = 3
let scanPages = []
let scanTotalCount = 0
let currentPageIndex = 0

let currentSelectedDest = null
let currentSelectedMsgId = null

const LS_FAVS = "atlasgo_favs_v2"
const LS_HISTORY_RESULTS = "atlasgo_results_history_v1"
const LS_STATE = "atlasgo_last_state_v2"

const REVIEWS_PAGE_SIZE = 4

let reviewsState = {
  placeId: "",
  name: "",
  rating: null,
  total: null,
  url: "",
  address: "",
  reviews: [],
  pageIndex: 0
}

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

function escapeHtml(s) {
  const str = String(s == null ? "" : s)
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
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
      rating: Number(placeObj.rating) || 0,
      reviews_total: Number(placeObj.reviews_total) || 0,
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
      const dest = { lat: f.lat, lng: f.lng }
      currentSelectedDest = dest
      currentSelectedMsgId = "route-msg-fav"
      enterFocusModeForArbitraryLocation(dest)
      calculateAndDisplayRoute(dest, "route-msg-fav")
      map.setCenter(dest)
      map.setZoom(16)
    }

    const thumb = f.photo ? f.photo : NOIMG_DATA_URL

    const ratingNum = Number(f.rating) || 0
    const ratingTxt = ratingNum ? ratingNum.toFixed(1) : "-"
    const totalTxt = Number(f.reviews_total) > 0 ? ` (${Number(f.reviews_total)})` : ""

    card.innerHTML = `
      <img src="${thumb}" class="place-img">
      <div class="place-info">
        <b>${escapeHtml(f.name)}</b><br>
        <span style="color:#f1c40f">${escapeHtml(ratingTxt)} ★${escapeHtml(totalTxt)}</span> |
        <span style="color:#aaa; font-size:11px">${escapeHtml(String(f.dist || 0))}m</span>
        <div class="mini-muted" style="margin-top:4px;">${escapeHtml(f.vicinity || "")}</div>
      </div>
      <div class="action-col" aria-label="Acțiuni">
        <button type="button" class="action-btn review-action" title="Recenzii">💬</button>
        <button type="button" class="action-btn sv-action" title="Street View">👁️</button>
        <button type="button" class="action-btn del-action" title="Șterge din favorite">🗑</button>
      </div>
    `

    const reviewBtn = card.querySelector(".review-action")
    reviewBtn.onclick = (ev) => {
      ev.stopPropagation()
      if (!f.place_id) {
        alert("Acest favorit nu are place_id salvat.")
        return
      }
      openReviewsForPlaceId(f.place_id, f.name || "Recenzii")
    }

    const svBtn = card.querySelector(".sv-action")
    svBtn.onclick = (ev) => {
      ev.stopPropagation()
      if (f.lat == null || f.lng == null) return
      openStreetViewAt({ lat: f.lat, lng: f.lng })
      map.setCenter({ lat: f.lat, lng: f.lng })
      map.setZoom(16)
    }

    const delBtn = card.querySelector(".del-action")
    delBtn.onclick = (ev) => {
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
  const u = getAuthUser()
  if (!u) return

  const arr = readResultsHistory()
  const key = historyKey(payload)

  const filtered = arr.filter(x => historyKey(x) !== key)
  filtered.unshift(payload)
  writeResultsHistory(filtered.slice(0, 30))
  renderHistory()
}

function renderHistory() {
  const list = byId("historyList")
  if (!list) return

  const u = getAuthUser()
  if (!u) {
    list.innerHTML = '<div class="hint">Autentifică-te ca să vezi istoricul scanărilor.</div>'
    return
  }

  const arr = readResultsHistory()
  if (!arr.length) {
    list.innerHTML = '<div class="hint">Nu ai istoric. Apasă Scan ca să salvezi o sesiune.</div>'
    return
  }

  list.innerHTML = ""
  arr.forEach((entry) => {
    const card = document.createElement("div")
    card.className = "card"
    card.style.cursor = "default"

    const when = new Date(entry.ts || Date.now()).toLocaleString()
    const label = escapeHtml(entry.catLabel || entry.cat || "Categorie")
    const city = escapeHtml(entry.city || "")
    const rad = Number(entry.rad || 0)
    const count = Number(entry.count || 0)
    const mode = escapeHtml(entry.mode || "")

    card.innerHTML = `
      <div class="place-info" style="padding-right:0">
        <b>${label}</b> <span style="color:#888; font-size:11px">• ${rad}m • ${mode}</span><br>
        <span style="color:#aaa; font-size:11px">${city ? city + " • " : ""}${count} rezultate • ${when}</span>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button type="button" style="width:auto; padding:6px 10px; border-radius:8px; background:#2b2b2b; border:1px solid #444; text-transform:none;">Reîncarcă</button>
        </div>
      </div>
    `

    const btn = card.querySelector("button")
    btn.onclick = () => replayHistory(entry)

    list.appendChild(card)
  })
}

function loadState() {
  const s = safeParseJSON(localStorage.getItem(LS_STATE), null)
  if (!s) return

  if (s.city != null && byId("city")) byId("city").value = s.city
  if (s.cat != null && byId("cat")) byId("cat").value = s.cat
  if (s.mode != null && byId("travelMode")) byId("travelMode").value = s.mode
  if (s.sort != null && byId("sort")) byId("sort").value = s.sort
  if (s.rad != null && byId("rad")) byId("rad").value = s.rad

  if (s.center && s.center.lat != null && s.center.lng != null) {
    userPos = { lat: s.center.lat, lng: s.center.lng }
  }
}

function saveState() {
  const payload = {
    city: byId("city") ? byId("city").value : "",
    cat: byId("cat") ? byId("cat").value : "",
    mode: byId("travelMode") ? byId("travelMode").value : "TRANSIT",
    sort: byId("sort") ? byId("sort").value : "dist",
    rad: byId("rad") ? byId("rad").value : "1500",
    center: userPos ? { lat: userPos.lat, lng: userPos.lng } : null
  }
  localStorage.setItem(LS_STATE, JSON.stringify(payload))
}

function labelForCategoryValue(val) {
  const sel = byId("cat")
  if (!sel) return val
  const opt = Array.from(sel.options).find(o => o.value === val)
  return opt ? (opt.textContent || val) : val
}

function getCategoryKeywords(rawVal) {
  const v = String(rawVal || "").trim()
  if (!v) return []
  return v.split("|").map(x => x.trim()).filter(Boolean)
}

function iconForMode(m) {
  if (m === "DRIVING") return "🚗"
  if (m === "WALKING") return "🚶"
  if (m === "BICYCLING") return "🚲"
  return "🚌"
}

function directionsRequest(origin, dest, mode) {
  return {
    origin: origin,
    destination: dest,
    travelMode: google.maps.TravelMode[mode]
  }
}

function setGrabEnabled(v) {
  const btn = byId("grabBtn")
  if (btn) btn.classList.toggle("active", Boolean(v))
  map.setOptions({ gestureHandling: v ? "greedy" : "cooperative" })
  localStorage.setItem("atlasgo_grab_enabled", v ? "1" : "0")
}

function showExitFocusButton(show) {
  const b = byId("exitFocusBtn")
  if (!b) return
  b.style.display = show ? "block" : "none"
}

function enterFocusModeByPlaceId(placeId) {
  if (!placeId) return
  const mk = markerByPlaceId.get(placeId)
  if (!mk) return

  focusActive = true
  focusedPlaceId = placeId
  focusedMarker = mk

  markers.forEach(m => m.setVisible(false))
  mk.setVisible(true)

  showExitFocusButton(true)
}

function enterFocusModeForArbitraryLocation(dest) {
  focusActive = false
  focusedPlaceId = null
  focusedMarker = null
  markers.forEach(m => m.setVisible(true))
  showExitFocusButton(false)

  if (!dest || dest.lat == null || dest.lng == null) return

  showExitFocusButton(false)
}

function exitFocusMode() {
  focusActive = false
  focusedPlaceId = null
  focusedMarker = null

  markers.forEach(m => m.setVisible(true))
  showExitFocusButton(false)
}

function openOverlay(overlayId) {
  const o = byId(overlayId)
  if (!o) return

  if (overlayId !== "reviewsOverlay") closeOverlay("reviewsOverlay")
  if (overlayId !== "helpOverlay") closeOverlay("helpOverlay")

  o.style.display = "flex"
  o.setAttribute("aria-hidden", "false")
}

function closeOverlay(overlayId) {
  const o = byId(overlayId)
  if (!o) return
  o.style.display = "none"
  o.setAttribute("aria-hidden", "true")
}

function setupOverlays() {
  const reviewsClose = byId("reviewsClose")
  if (reviewsClose) reviewsClose.addEventListener("click", () => closeOverlay("reviewsOverlay"))

  const helpClose = byId("helpClose")
  if (helpClose) helpClose.addEventListener("click", () => closeOverlay("helpOverlay"))

  const reviewsOverlay = byId("reviewsOverlay")
  if (reviewsOverlay) {
    reviewsOverlay.addEventListener("click", (ev) => {
      if (ev.target === reviewsOverlay) closeOverlay("reviewsOverlay")
    })
  }

  const helpOverlay = byId("helpOverlay")
  if (helpOverlay) {
    helpOverlay.addEventListener("click", (ev) => {
      if (ev.target === helpOverlay) closeOverlay("helpOverlay")
    })
  }

  const helpBtn = byId("helpBtn")
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      closeOverlay("reviewsOverlay")
      openOverlay("helpOverlay")
    })
  }
}

function openStreetViewAt(dest) {
  if (!dest || dest.lat == null || dest.lng == null) return

  const panel = byId("sv-panel")
  if (panel) panel.style.display = "block"
  if (miniStreetView) miniStreetView.setPosition(dest)

  const svService = new google.maps.StreetViewService()
  svService.getPanorama({ location: dest, radius: 50 }, (data, status) => {
    if (status !== "OK" && panel) panel.style.display = "none"
  })
}

function reviewPageCount() {
  const total = Array.isArray(reviewsState.reviews) ? reviewsState.reviews.length : 0
  return Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE))
}

function clamp(n, lo, hi) {
  const x = Number(n)
  if (!Number.isFinite(x)) return lo
  return Math.min(hi, Math.max(lo, x))
}

function buildPagerModel(current, total) {
  const cur = clamp(current, 0, Math.max(0, total - 1))
  const out = []

  if (total <= 7) {
    for (let i = 0; i < total; i++) out.push(i)
    return out
  }

  const push = (v) => out.push(v)

  push(0)

  const left = cur - 1
  const right = cur + 1

  if (left > 2) push("...")

  const start = Math.max(1, cur - 1)
  const end = Math.min(total - 2, cur + 1)

  for (let i = start; i <= end; i++) {
    if (i !== 0 && i !== total - 1) push(i)
  }

  if (right < total - 3) push("...")

  push(total - 1)

  const cleaned = []
  let last = null
  for (const item of out) {
    if (item === "..." && last === "...") continue
    cleaned.push(item)
    last = item
  }

  return cleaned
}

function renderReviewsPager() {
  const pager = byId("reviewsPager")
  if (!pager) return

  const totalReviews = Array.isArray(reviewsState.reviews) ? reviewsState.reviews.length : 0
  if (!totalReviews) {
    pager.style.display = "none"
    pager.innerHTML = ""
    return
  }

  const totalPages = reviewPageCount()
  const cur = clamp(reviewsState.pageIndex, 0, totalPages - 1)
  reviewsState.pageIndex = cur

  pager.style.display = totalPages > 1 ? "flex" : "none"
  pager.innerHTML = ""

  const prevBtn = document.createElement("button")
  prevBtn.type = "button"
  prevBtn.textContent = "◀"
  prevBtn.disabled = cur <= 0
  prevBtn.onclick = () => { reviewsState.pageIndex = cur - 1; renderReviewsOverlay() }
  pager.appendChild(prevBtn)

  const model = buildPagerModel(cur, totalPages)
  model.forEach((item) => {
    if (item === "...") {
      const span = document.createElement("span")
      span.className = "pg-ellipsis"
      span.textContent = "…"
      pager.appendChild(span)
      return
    }

    const b = document.createElement("button")
    b.type = "button"
    b.textContent = String(Number(item) + 1)
    if (item === cur) b.classList.add("pg-active")
    b.onclick = () => { reviewsState.pageIndex = Number(item); renderReviewsOverlay() }
    pager.appendChild(b)
  })

  const nextBtn = document.createElement("button")
  nextBtn.type = "button"
  nextBtn.textContent = "▶"
  nextBtn.disabled = cur >= totalPages - 1
  nextBtn.onclick = () => { reviewsState.pageIndex = cur + 1; renderReviewsOverlay() }
  pager.appendChild(nextBtn)

  const lbl = document.createElement("div")
  lbl.className = "pg-label"
  lbl.textContent = `Pagina ${cur + 1} / ${totalPages}`
  pager.appendChild(lbl)
}

function renderReviewsOverlay() {
  const titleEl = byId("reviewsTitle")
  const metaEl = byId("reviewsMeta")
  const bodyEl = byId("reviewsBody")

  if (titleEl) titleEl.textContent = reviewsState.name ? `Recenzii • ${reviewsState.name}` : "Recenzii"

  const ratingTxt = (reviewsState.rating != null) ? String(Number(reviewsState.rating).toFixed(1)) : "-"
  const totalTxt = (reviewsState.total != null) ? String(Number(reviewsState.total)) : "-"

  const addressTxt = reviewsState.address ? ` • ${reviewsState.address}` : ""
  const urlTxt = reviewsState.url ? ' • <a href="' + escapeHtml(reviewsState.url) + '" target="_blank" rel="noopener noreferrer" style="color:#8ab4f8;">Deschide în Google</a>' : ""

  if (metaEl) metaEl.innerHTML = `Rating: <b>${escapeHtml(ratingTxt)}</b> ★ (${escapeHtml(totalTxt)})${escapeHtml(addressTxt)}${urlTxt}`

  if (!bodyEl) return

  const reviews = Array.isArray(reviewsState.reviews) ? reviewsState.reviews : []
  if (!reviews.length) {
    bodyEl.innerHTML = '<div class="hint">Nu există recenzii disponibile pentru această locație (sau Google nu le-a furnizat).</div>'
    renderReviewsPager()
    return
  }

  const totalPages = reviewPageCount()
  const cur = clamp(reviewsState.pageIndex, 0, totalPages - 1)
  reviewsState.pageIndex = cur

  const start = cur * REVIEWS_PAGE_SIZE
  const end = start + REVIEWS_PAGE_SIZE
  const page = reviews.slice(start, end)

  let html = ""
  page.forEach((r) => {
    const author = escapeHtml(r.author_name || "Utilizator")
    const time = escapeHtml(r.relative_time_description || "")
    const text = escapeHtml(r.text || "")
    const stars = Number(r.rating) ? Number(r.rating).toFixed(1) : "-"
    const avatar = r.profile_photo_url ? escapeHtml(r.profile_photo_url) : ""

    html += `
      <div class="review-item">
        <img class="review-avatar" src="${avatar || NOIMG_DATA_URL}" onerror="this.src='${NOIMG_DATA_URL}'" />
        <div class="review-main">
          <div class="review-headline">
            <div class="review-author">${author}</div>
            <div class="review-time">${time}</div>
          </div>
          <div class="review-rating">${escapeHtml(stars)} ★</div>
          <div class="review-text">${text || "(fără text)"}</div>
        </div>
      </div>
    `
  })

  bodyEl.innerHTML = html
  renderReviewsPager()
}

function openReviewsForPlaceId(placeId, fallbackName) {
  if (!service) return
  if (!placeId) return

  closeOverlay("helpOverlay")
  openOverlay("reviewsOverlay")

  reviewsState = {
    placeId: placeId,
    name: fallbackName || "",
    rating: null,
    total: null,
    url: "",
    address: "",
    reviews: [],
    pageIndex: 0
  }

  const titleEl = byId("reviewsTitle")
  const metaEl = byId("reviewsMeta")
  const bodyEl = byId("reviewsBody")

  if (titleEl) titleEl.textContent = fallbackName ? `Recenzii • ${fallbackName}` : "Recenzii"
  if (metaEl) metaEl.textContent = "Se încarcă recenziile..."
  if (bodyEl) bodyEl.innerHTML = '<div class="hint">Se încarcă...</div>'

  const req = {
    placeId: placeId,
    fields: [
      "name",
      "rating",
      "user_ratings_total",
      "url",
      "reviews",
      "formatted_address",
      "vicinity"
    ]
  }

  service.getDetails(req, (place, status) => {
    if (status !== "OK" || !place) {
      if (metaEl) metaEl.textContent = "Nu pot încărca recenziile (Google Places)."
      if (bodyEl) bodyEl.innerHTML = '<div class="hint">Încearcă din nou sau verifică setările cheii API.</div>'
      const pager = byId("reviewsPager")
      if (pager) { pager.style.display = "none"; pager.innerHTML = "" }
      return
    }

    const addr = place.formatted_address || place.vicinity || ""
    const reviews = Array.isArray(place.reviews) ? place.reviews.slice() : []

    reviews.sort((a, b) => {
      const ta = Number(a.time) || 0
      const tb = Number(b.time) || 0
      return tb - ta
    })

    reviewsState.placeId = placeId
    reviewsState.name = place.name || fallbackName || ""
    reviewsState.rating = place.rating != null ? Number(place.rating) : null
    reviewsState.total = place.user_ratings_total != null ? Number(place.user_ratings_total) : null
    reviewsState.url = place.url || ""
    reviewsState.address = addr
    reviewsState.reviews = reviews
    reviewsState.pageIndex = 0

    renderReviewsOverlay()
  })
}

function initMap() {
  loadState()

  map = new google.maps.Map(byId("map"), {
    center: userPos,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy"
  })

  updateAuthButton()

  const grabEnabled = localStorage.getItem("atlasgo_grab_enabled") !== "0"
  const controlDiv = document.createElement("div")
  controlDiv.className = "grab-control"
  const button = document.createElement("button")
  button.id = "grabBtn"
  button.className = "grab-btn"
  button.title = "Grab (1 deget pe telefon)"
  button.innerText = "🖐️"
  button.addEventListener("click", () => setGrabEnabled(!button.classList.contains("active")))
  controlDiv.appendChild(button)
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(controlDiv)
  setGrabEnabled(grabEnabled)

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

  circle.addListener("center_changed", () => { userPos = circle.getCenter(); saveState() })
  circle.addListener("radius_changed", () => { saveState() })

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

  const prevBtn = byId("prevPageBtn")
  if (prevBtn) prevBtn.addEventListener("click", () => goToPage(currentPageIndex - 1))

  const nextBtn = byId("nextPageBtn")
  if (nextBtn) nextBtn.addEventListener("click", () => goToPage(currentPageIndex + 1))

  const exitBtn = byId("exitFocusBtn")
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      exitFocusMode()
    })
  }
  showExitFocusButton(false)

  setupOverlays()

  setPaginationBarState()
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
  saveState()
}

function updateRouteMode() {
  saveState()
  if (currentSelectedDest && currentSelectedMsgId) {
    calculateAndDisplayRoute(currentSelectedDest, currentSelectedMsgId)
  }
}

function chunkIntoPages(items, pageSize) {
  const out = []
  const size = Math.max(1, Number(pageSize) || 1)
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function setPaginationBarState() {
  const label = byId("pageLabel")
  const prevBtn = byId("prevPageBtn")
  const nextBtn = byId("nextPageBtn")

  const totalPages = scanPages.length || 0
  const pageNo = totalPages ? (currentPageIndex + 1) : 0

  if (label) label.innerText = totalPages ? `Pagina ${pageNo} / ${totalPages}` : "Pagina 0 / 0"

  if (prevBtn) {
    prevBtn.disabled = currentPageIndex <= 0
    prevBtn.style.opacity = prevBtn.disabled ? "0.35" : "1"
    prevBtn.style.cursor = prevBtn.disabled ? "not-allowed" : "pointer"
  }

  if (nextBtn) {
    nextBtn.disabled = currentPageIndex >= totalPages - 1
    nextBtn.style.opacity = nextBtn.disabled ? "0.35" : "1"
    nextBtn.style.cursor = nextBtn.disabled ? "not-allowed" : "pointer"
  }
}

function renderCurrentPage() {
  const page = scanPages[currentPageIndex] || []
  renderResultsFromPlaces(page, scanTotalCount)
  setPaginationBarState()
}

function setResultsPaged(allCompactResults) {
  const arr = Array.isArray(allCompactResults) ? allCompactResults : []
  scanTotalCount = arr.length
  scanPages = chunkIntoPages(arr, PAGE_SIZE)
  currentPageIndex = 0
  renderCurrentPage()
}

function goToPage(index) {
  const i = Number(index)
  if (!Number.isFinite(i)) return
  const total = scanPages.length
  if (!total) return
  if (i < 0 || i >= total) return
  currentPageIndex = i
  renderCurrentPage()
}

function nearbySearchPagedAsync(req, maxPages) {
  const pagesLimit = Math.max(1, Number(maxPages) || 1)

  return new Promise((resolve) => {
    const out = []
    let pagesFetched = 0

    const handle = (res, status, pagination) => {
      if (status === "OK" && Array.isArray(res)) out.push(...res)
      pagesFetched += 1

      if (pagination && pagination.hasNextPage && pagesFetched < pagesLimit) {
        setTimeout(() => pagination.nextPage(), 1400)
        return
      }

      resolve(out)
    }

    service.nearbySearch(req, handle)
  })
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null))
  markers = []
}

function renderResultsFromPlaces(places, totalCount) {
  const list = byId("resultsList")
  if (!list) return
  list.innerHTML = ""

  exitFocusMode()
  markerByPlaceId = new Map()
  clearMarkers()

  if (!places || !places.length) {
    list.innerHTML = '<div class="hint">Niciun rezultat.</div>'
    byId("count").innerText = "0"
    return
  }

  const c = (totalCount != null) ? Number(totalCount) : places.length
  byId("count").innerText = String(Number.isFinite(c) ? c : places.length)

  places.forEach((p, idx) => {
    if (p.lat != null && p.lng != null) {
      const pos = { lat: p.lat, lng: p.lng }

      const mk = new google.maps.Marker({
        map: map,
        position: pos,
        title: p.name || ""
      })

      markers.push(mk)

      if (p.place_id) {
        markerByPlaceId.set(p.place_id, mk)
        mk.addListener("click", () => {
          enterFocusModeByPlaceId(p.place_id)
        })
      }
    }

    const badge = idx === 0 ? '<div class="best-badge">BEST</div>' : ""
    const thumbUrl = p.photo ? p.photo : NOIMG_DATA_URL

    const favSymbol = (p.place_id && isFav(p.place_id)) ? "★" : "☆"
    const safePlaceId = (p.place_id || "").replace(/'/g, "")

    const ratingVal = p.rating != null && p.rating !== "-" ? Number(p.rating) : null
    const ratingTxt = ratingVal != null && Number.isFinite(ratingVal) ? ratingVal.toFixed(1) : "-"
    const totalTxt = Number(p.reviews_total) > 0 ? ` (${Number(p.reviews_total)})` : ""

    const card = document.createElement("div")
    card.className = "card"
    card.onclick = () => {
      if (p.lat == null || p.lng == null) return
      const dest = { lat: p.lat, lng: p.lng }
      currentSelectedDest = dest
      currentSelectedMsgId = "route-msg-" + idx

      if (p.place_id) {
        enterFocusModeByPlaceId(p.place_id)
      }

      calculateAndDisplayRoute(dest, currentSelectedMsgId)
      map.setCenter(dest)
      map.setZoom(16)
    }

    card.innerHTML = `
      ${badge}
      <img src="${thumbUrl}" class="place-img">
      <div class="place-info">
        <b>${escapeHtml(p.name || "")}</b><br>
        <span style="color:#f1c40f">${escapeHtml(String(ratingTxt))} ★${escapeHtml(totalTxt)}</span> |
        <span style="color:#aaa; font-size:11px">${escapeHtml(String(p.dist || 0))}m</span>
        <div class="mini-muted" style="margin-top:4px;">${escapeHtml(p.vicinity || "")}</div>
        <div id="route-msg-${idx}" class="route-info"></div>
        <div id="steps-${idx}" class="transit-steps"></div>
      </div>
      <div class="action-col" aria-label="Acțiuni">
        <button type="button" class="action-btn fav-action" data-fav-id="${safePlaceId}" title="Favorite">${favSymbol}</button>
        <button type="button" class="action-btn review-action" title="Recenzii">💬</button>
        <button type="button" class="action-btn sv-action" title="Street View">👁️</button>
      </div>
    `

    const favBtn = card.querySelector(".fav-action")
    favBtn.onclick = (ev) => {
      ev.stopPropagation()
      toggleFav({
        place_id: p.place_id,
        name: p.name,
        vicinity: p.vicinity,
        rating: Number(p.rating) || 0,
        reviews_total: Number(p.reviews_total) || 0,
        realDist: Number(p.dist) || 0,
        geometry: { location: new google.maps.LatLng(p.lat, p.lng) },
        photos: p.photo ? [{ getUrl: () => p.photo }] : []
      })
    }

    const reviewBtn = card.querySelector(".review-action")
    reviewBtn.onclick = (ev) => {
      ev.stopPropagation()
      if (!p.place_id) {
        alert("Nu există place_id pentru acest rezultat.")
        return
      }
      openReviewsForPlaceId(p.place_id, p.name || "Recenzii")
    }

    const svBtn = card.querySelector(".sv-action")
    svBtn.onclick = (ev) => {
      ev.stopPropagation()
      if (p.lat == null || p.lng == null) return
      const dest = { lat: p.lat, lng: p.lng }

      if (p.place_id) {
        enterFocusModeByPlaceId(p.place_id)
      }

      openStreetViewAt(dest)
      map.setCenter(dest)
      map.setZoom(16)
    }

    list.appendChild(card)
  })
}

function replayHistory(entry) {
  const u = requireLoginOrWarn()
  if (!u) return

  if (byId("city")) byId("city").value = entry.city || ""
  if (byId("cat")) byId("cat").value = entry.cat || ""
  if (byId("travelMode")) byId("travelMode").value = entry.mode || "TRANSIT"
  if (byId("sort")) byId("sort").value = entry.sort || "dist"
  if (byId("rad")) byId("rad").value = String(entry.rad || 1500)

  saveState()

  directionsRenderer.setDirections({ routes: [] })
  const svPanel = byId("sv-panel")
  if (svPanel) svPanel.style.display = "none"
  currentSelectedDest = null
  currentSelectedMsgId = null

  setResultsPaged(entry.results)

  if (entry.center && entry.center.lat != null && entry.center.lng != null) {
    const center = { lat: entry.center.lat, lng: entry.center.lng }
    map.setCenter(center)
    map.setZoom(14)
    circle.setCenter(center)
    circle.setRadius(entry.rad || circle.getRadius())
  }
}

async function runScan() {
  const r = parseInt(byId("rad").value, 10)
  const cRaw = byId("cat").value
  const s = byId("sort").value
  const mode = byId("travelMode").value
  const cityText = byId("city").value || ""

  circle.setRadius(r)
  directionsRenderer.setDirections({ routes: [] })
  const svPanel = byId("sv-panel")
  if (svPanel) svPanel.style.display = "none"
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
    const res = await nearbySearchPagedAsync(req, MAX_API_PAGES_PER_KEYWORD)
    res.forEach(p => { if (p.place_id && !all.has(p.place_id)) all.set(p.place_id, p) })
  }

  let res = Array.from(all.values())
  res.forEach(p => p.realDist = google.maps.geometry.spherical.computeDistanceBetween(center, p.geometry.location))
  res = res.filter(p => p.realDist <= r)

  if (s === "dist") res.sort((a, b) => a.realDist - b.realDist)
  else if (s === "rate") res.sort((a, b) => (b.rating || 0) - (a.rating || 0))
  else res.sort((a, b) => ((b.rating || 0) * 1000 - b.realDist) - ((a.rating || 0) * 1000 - a.realDist))

  const compactAll = res.slice(0, 80).map(p => {
    const photo = (p.photos && p.photos.length) ? p.photos[0].getUrl({ maxWidth: 120 }) : ""
    const total = p.user_ratings_total != null ? Number(p.user_ratings_total) : 0
    return {
      place_id: p.place_id || "",
      name: p.name || "",
      vicinity: p.vicinity || "",
      rating: p.rating || "-",
      reviews_total: Number.isFinite(total) ? total : 0,
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
    results: compactAll
  }

  saveResultsToHistory(payload)
  setResultsPaged(compactAll)
}

function calculateAndDisplayRoute(dest, msgId) {
  const mode = byId("travelMode").value

  document.querySelectorAll(".route-info").forEach(e => e.style.display = "none")
  document.querySelectorAll(".transit-steps").forEach(e => e.innerHTML = "")

  const div = msgId ? byId(msgId) : null
  const stepsDiv = msgId ? byId(msgId.replace("route-msg-", "steps-")) : null

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
              stepSummary += `<span class="step-badge" style="background:#2980b9">${escapeHtml(vehicle)} ${escapeHtml(line || "")}</span> `
            } else if (step.travel_mode === "WALKING") {
              stepSummary += `<span class="step-badge">🚶 ${escapeHtml(step.duration.text)}</span> `
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
window.openReviewsForPlaceId = openReviewsForPlaceId
