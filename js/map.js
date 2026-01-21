import { state } from "./state.js"
import { DEFAULT_ZOOM } from "./config.js"

export function initMap(mapElement, center) {
  state.map = new google.maps.Map(mapElement, {
    center,
    zoom: DEFAULT_ZOOM,
    scrollwheel: true,
    gestureHandling: "greedy"
  })
}

export function clearMarkers() {
  state.markers.forEach(m => m.setMap(null))
  state.markers = []
}

export function addMarkers(places) {
  clearMarkers()
  places.forEach(p => {
    if (!p.geometry?.location) return
    const marker = new google.maps.Marker({
      map: state.map,
      position: p.geometry.location,
      title: p.name
    })
    state.markers.push(marker)
  })
}
