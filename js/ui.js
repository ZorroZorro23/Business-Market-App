export function getUI() {
  return {
    radius: document.getElementById("radiusInput"),
    type: document.getElementById("typeSelect"),
    scanBtn: document.getElementById("scanBtn"),
    gpsBtn: document.getElementById("gpsBtn"),
    results: document.getElementById("resultsList")
  }
}

export function renderResults(list, places) {
  list.innerHTML = ""
  places.forEach(p => {
    const li = document.createElement("li")
    li.textContent = p.name || "Loc fără nume"
    list.appendChild(li)
  })
}
