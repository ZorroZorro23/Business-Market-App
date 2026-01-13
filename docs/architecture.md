# System Architecture — AtlasGo Market Scanner

## Problem Definition
Users often need to identify the best nearby services (e.g., minimarkets, pharmacies, gyms, restaurants) within a selected radius and travel mode. Standard map browsing is slow for comparing multiple candidates, so AtlasGo provides a “scan an area” workflow with sorting and route context.

## Target Users
- Residents and students searching for nearby services quickly
- People relying on public transport and needing travel-time context
- Users exploring new neighborhoods and comparing places by distance and rating

## Key Features
- Interactive map with draggable/editable search radius circle
- Category-based nearby scan (Google Places keyword search)
- Sorting by distance, rating, or balanced best match
- Travel mode routing (driving, transit, walking, bicycling)
- Mini Street View preview for selected places
- Favorites and scan history (enabled when authenticated)
- CSV export of scan results
- Analytics event logging for usage measurement

## Components
### Frontend (Browser)
- Pages: `index.html`, `login.html`
- Styling: `assets/styles.css`, `assets/login.css`
- App logic: `assets/app.js`
- Auth logic: `assets/login.js`
- Local persistence: localStorage for:
  - last state (radius/category/sort/mode)
  - favorites
  - scan history snapshots

### Third-Party APIs (Google Maps Platform)
- Maps JavaScript API: map rendering
- Places library: nearby search and city autocomplete
- Directions service: route computation
- Street View service: mini panorama
- Geometry library: distance computation and filtering

### Backend-as-a-Service (Firebase)
- Firebase Authentication: user sessions (email/password and Google sign-in)
- Firestore: analytics storage (`events` collection)

### Hosting
- Vercel: public deployment for evaluators

## High-Level Diagram (Text)
Browser (Vercel-hosted static site)
  ├─ UI (HTML/CSS)
  ├─ App JS (scan, sort, route, street view)
  ├─ LocalStorage (state, favorites, history)
  ├─ Google Maps APIs (Places, Directions, Street View)
  └─ Firebase SDK
       ├─ Auth (login state)
       └─ Firestore (events analytics)

## Data Flow (Core User Journey)
1. User selects a location (city autocomplete) or uses GPS.
2. User sets radius, category, sorting, and travel mode.
3. App performs one or more Places nearby searches per keyword and de-duplicates by `place_id`.
4. App computes distance to the scan center, filters results to the chosen radius, and sorts them.
5. User selects a place:
   - App requests a route from Directions service and displays time/distance
   - App shows a mini Street View panel (when available)
6. App logs analytics events to Firestore (page_view, scan, select_place, route_ok/route_fail).

## Stack Justification
- Static frontend: low operational overhead and fast iteration.
- Google Maps Platform: accurate geo search and routing, with transit support.
- Firebase Auth: avoids maintaining a custom auth backend.
- Firestore: simple and scalable event logging for analytics.
- Vercel: straightforward deployment and public access for evaluation.

## Future Improvements
- Persist favorites and history per user in Firestore for multi-device sync
- Add Cloud Functions for server-side aggregation (more efficient analytics)
- Add rate limiting/caching strategy for Places queries
- Add role-based access for admin/analytics pages
