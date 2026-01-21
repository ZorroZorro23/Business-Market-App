export async function fetchNearbyPlaces({ map, radius, type }) {
  const service = new google.maps.places.PlacesService(map)

  const request = {
    location: map.getCenter(),
    radius,
    type: type || undefined
  }

  return new Promise((resolve) => {
    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        resolve(results)
      } else {
        resolve([])
      }
    })
  })
}
