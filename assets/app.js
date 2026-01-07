let map, circle, service, directionsService, directionsRenderer;
let miniStreetView;
let markers = [];
let exportData = [];
let userPos = { lat: 44.4268, lng: 26.1025 };

let currentSelectedDest = null;
let currentSelectedMsgId = null;

function getCategoryKeywords(raw) {
  return raw.split("|").map(s => s.trim()).filter(Boolean);
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: userPos, zoom: 13,
    disableDefaultUI: false, streetViewControl: true, mapTypeControl: false
  });

  new google.maps.TransitLayer().setMap(map);

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map, suppressMarkers: true,
    polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 6, strokeOpacity: 0.7 }
  });

  miniStreetView = new google.maps.StreetViewPanorama(
    document.getElementById("sv-container"), {
      position: userPos, pov: { heading: 34, pitch: 10 },
      visible: true, disableDefaultUI: false, zoomControl: true, panControl: true
    }
  );

  circle = new google.maps.Circle({
    map, center: userPos, radius: 1500,
    fillColor: '#3b82f6', fillOpacity: 0.1, strokeColor: '#3b82f6', strokeWeight: 2,
    editable: true, draggable: true
  });
  circle.addListener('center_changed', () => { userPos = circle.getCenter(); });

  service = new google.maps.places.PlacesService(map);

  const ac = new google.maps.places.Autocomplete(document.getElementById('city'));
  ac.bindTo('bounds', map);
  ac.addListener('place_changed', () => {
    const p = ac.getPlace();
    if (p.geometry) {
      userPos = p.geometry.location;
      updateMapCenter();
      if (window.__trackEvent) window.__trackEvent("city_change", { hasGeometry: true });
    }
  });

  if (window.__trackEvent) window.__trackEvent("map_ready", {});
}

function locateUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        updateMapCenter();
        if (window.__trackEvent) window.__trackEvent("gps_success", {});
      },
      () => {
        alert("Eroare GPS.");
        if (window.__trackEvent) window.__trackEvent("gps_error", {});
      }
    );
  } else { alert("Fara suport GPS."); }
}

function updateMapCenter() {
  map.setCenter(userPos); map.setZoom(15); circle.setCenter(userPos);
}

function updateRouteMode() {
  if (currentSelectedDest && currentSelectedMsgId) {
    calculateAndDisplayRoute(currentSelectedDest, currentSelectedMsgId);
    if (window.__trackEvent) window.__trackEvent("travel_mode_change", { mode: document.getElementById('travelMode').value });
  }
}

function nearbySearchAsync(req) {
  return new Promise((resolve) => {
    service.nearbySearch(req, (res, status) => {
      if (status === 'OK' && res) resolve(res);
      else resolve([]);
    });
  });
}

async function runScan() {
  const r = parseInt(document.getElementById('rad').value, 10);
  const cRaw = document.getElementById('cat').value;
  const s = document.getElementById('sort').value;

  circle.setRadius(r);
  directionsRenderer.setDirections({ routes: [] });
  document.getElementById('sv-panel').style.display = 'none';
  currentSelectedDest = null;

  const center = circle.getCenter();
  const cats = getCategoryKeywords(cRaw);
  const list = document.getElementById('results');
  list.innerHTML = '<div style="padding:10px; color:#777">Caut...</div>';

  if (window.__trackEvent) window.__trackEvent("scan", { radius: r, category: cRaw, sort: s });

  const all = new Map();
  for (const kw of cats) {
    const req = { location: center, radius: r, keyword: kw };
    const res = await nearbySearchAsync(req);
    res.forEach(p => { if (p.place_id && !all.has(p.place_id)) all.set(p.place_id, p); });
  }
  const res = Array.from(all.values());

  list.innerHTML = '';
  markers.forEach(m => m.setMap(null));
  markers = [];
  exportData = [];

  if (res.length) {
    res.forEach(p => p.realDist = google.maps.geometry.spherical.computeDistanceBetween(center, p.geometry.location));
    const filtered = res.filter(p => p.realDist <= r);
    document.getElementById('count').innerText = filtered.length;

    if (s === 'dist') filtered.sort((a, b) => a.realDist - b.realDist);
    else if (s === 'rate') filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else filtered.sort((a, b) => ((b.rating || 0) * 1000 - b.realDist) - ((a.rating || 0) * 1000 - a.realDist));

    if (window.__trackEvent) window.__trackEvent("scan_results", { count: filtered.length });

    filtered.forEach((p, idx) => {
      exportData.push(p);
      markers.push(new google.maps.Marker({ map, position: p.geometry.location, title: p.name }));
      let badge = idx === 0 ? '<div class="best-badge">BEST</div>' : '';
      let thumbUrl = (p.photos && p.photos.length) ? p.photos[0].getUrl({ maxWidth: 100 }) : "https://via.placeholder.com/60?text=NoImg";

      list.innerHTML += `
        <div class="card" onclick="selectLocation(${p.geometry.location.lat()}, ${p.geometry.location.lng()}, 'route-msg-${idx}', '${(p.place_id || '').replace(/'/g, "")}')">
          <img src="${thumbUrl}" class="place-img">
          <div class="place-info">
            ${badge}
            <b>${p.name}</b><br>
            <span style="color:#f1c40f">${p.rating || '-'} ★</span> |
            <span style="color:#aaa; font-size:11px">${Math.round(p.realDist)}m</span>
            <div id="route-msg-${idx}" class="route-info">...</div>
            <div id="steps-${idx}" class="transit-steps"></div>
          </div>
        </div>`;
    });
  } else {
    list.innerHTML = '<div style="padding:10px; color:#777">Niciun rezultat.</div>';
    document.getElementById('count').innerText = "0";
  }
}

function selectLocation(lat, lng, msgId, placeId) {
  const dest = { lat: lat, lng: lng };
  currentSelectedDest = dest;
  currentSelectedMsgId = msgId;

  if (window.__trackEvent) window.__trackEvent("select_place", { placeId: placeId, mode: document.getElementById('travelMode').value });

  const panel = document.getElementById('sv-panel');
  panel.style.display = 'block';
  miniStreetView.setPosition(dest);

  const svService = new google.maps.StreetViewService();
  svService.getPanorama({ location: dest, radius: 50 }, (data, status) => {
    if (status !== 'OK') panel.style.display = 'none';
  });

  calculateAndDisplayRoute(dest, msgId);
}

function calculateAndDisplayRoute(dest, msgId) {
  const mode = document.getElementById('travelMode').value;
  const req = { origin: userPos, destination: dest, travelMode: google.maps.TravelMode[mode], provideRouteAlternatives: true };

  document.querySelectorAll('.route-info').forEach(e => e.style.display = 'none');
  document.querySelectorAll('.transit-steps').forEach(e => e.innerHTML = '');
  const div = document.getElementById(msgId);
  const stepsDiv = document.getElementById(msgId.replace('route-msg-', 'steps-'));

  div.style.display = 'block';
  div.innerText = "Calculare...";

  directionsService.route(req, (res, status) => {
    if (status == 'OK') {
      directionsRenderer.setDirections(res);
      const leg = res.routes[0].legs[0];

      let icon = "🚗";
      if (mode === "TRANSIT") icon = "🚌";
      if (mode === "WALKING") icon = "🚶";
      if (mode === "BICYCLING") icon = "🚴";

      let stepSummary = "";
      if (mode === "TRANSIT") {
        leg.steps.forEach(step => {
          if (step.travel_mode === "TRANSIT" && step.transit) {
            let line = step.transit.line.short_name || step.transit.line.name;
            let vehicle = (step.transit.line.vehicle && step.transit.line.vehicle.name) ? step.transit.line.vehicle.name : "Transit";
            stepSummary += `<span class="step-badge" style="background:#2980b9">${vehicle} ${line}</span> `;
          } else if (step.travel_mode === "WALKING") {
            stepSummary += `<span class="step-badge">🚶 ${step.duration.text}</span> `;
          }
        });
      }

      div.innerHTML = `${icon} ${leg.duration.text} (${leg.distance.text})`;
      if (stepSummary) stepsDiv.innerHTML = "Traseu: " + stepSummary;
      else if (mode === "TRANSIT") stepsDiv.innerHTML = "Doar mers pe jos (prea aproape).";

      if (window.__trackEvent) window.__trackEvent("route_ok", { mode });
    } else {
      div.innerText = "Nu exista ruta.";
      if (window.__trackEvent) window.__trackEvent("route_fail", { mode, status });
    }
  });
}

function getCSV() {
  if (!exportData.length) return alert("Scaneaza intai o zona!");
  let csv = "Nume,Rating,Distanta(m),Adresa\n";
  exportData.forEach(p => {
    let n = (p.name || "").replace(/,/g, '');
    let a = (p.vicinity || '').replace(/,/g, '');
    csv += `${n},${p.rating || 0},${Math.round(p.realDist || 0)},${a}\n`;
  });
  if (window.__trackEvent) window.__trackEvent("export_csv", { rows: exportData.length });
  const b = new Blob([csv], { type: 'text/csv' });
  const l = document.createElement('a');
  l.href = URL.createObjectURL(b);
  l.download = 'analiza_piata.csv';
  l.click();
}
