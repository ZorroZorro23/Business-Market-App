# Security Considerations — AtlasGo Market Scanner

## Firebase Authentication
### Authorized Domains (required)
Firebase Authentication blocks sign-in from unknown domains. After deployment:
- Firebase Console → Authentication → Settings → Authorized domains
- Add:
  - <YOUR_PROJECT>.vercel.app
  - (and any custom domain if used)

This prevents `auth/unauthorized-domain` errors and reduces domain abuse.

## Firestore Security Rules
AtlasGo writes analytics events to the `events` collection in Firestore. To prevent open writes, use restrictive rules.

Suggested baseline rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{docId} {
      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(['type','payload','sessionId','ts','ua','lang'])
        && request.resource.data.type is string
        && request.resource.data.sessionId is string;

      allow read: if request.auth != null;

      allow update, delete: if false;
    }
  }
}
```

Notes:
- If anonymous analytics is required, use stricter controls (Cloud Functions, rate limiting, or validation) to prevent spam writes.
- For this project, authenticated-only analytics is simpler and safer.

## Google Maps API Key Restrictions
The Google Maps API key is client-side, so it must be restricted:
1. Google Cloud Console → Credentials → API key
2. Application restrictions: HTTP referrers
3. Allowed referrers:
   - https://<YOUR_PROJECT>.vercel.app/*
   - (and custom domain if used)
4. API restrictions: enable only required APIs (Maps JavaScript API, Places API, Directions API)

## Data Collection and Privacy
Analytics events stored in Firestore include:
- event type (page_view, scan, select_place, route_ok, route_fail)
- sessionId (random ID stored in localStorage)
- server timestamp
- user agent and language

No sensitive personal data is required for analytics. Favorites and scan history are stored locally (localStorage) and are only available when the user is authenticated.
