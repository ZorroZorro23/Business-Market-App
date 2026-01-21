import { DEFAULT_CENTER, DEFAULT_RADIUS } from "./config.js"
import { state } from "./state.js"
import { initMap, addMarkers } from "./map.js"
import { fetchNearbyPlaces } from "./places.js"
import { getUI, renderResults } from "./ui.js"

async function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(DEFAULT_CENTER)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(DEFAULT_CENTER)
    )
  })
}

async function start() {
  const ui = getUI()
  state.center = await getLocation()

  initMap(document.getElementById("map"), state.center)

  ui.scanBtn.addEventListener("click", async () => {
    const radius = Number(ui.radius.value) || DEFAULT_RADIUS
    const type = ui.type.value

    const places = await fetchNearbyPlaces({
      map: state.map,
      radius,
      type
    })

    state.places = places
    addMarkers(places)
    renderResults(ui.results, places)
  })
}

window.addEventListener("DOMContentLoaded", start)
