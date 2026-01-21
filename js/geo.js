import { DEFAULT_CENTER } from "./config.js"

export function getUserLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(DEFAULT_CENTER)
      return
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      }),
      () => resolve(DEFAULT_CENTER),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}
