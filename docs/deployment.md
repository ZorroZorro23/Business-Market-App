# Deployment Plan (Vercel) — AtlasGo Market Scanner

## Overview
AtlasGo is a static web application (HTML/CSS/JavaScript) hosted on Vercel. It integrates:
- Google Maps JavaScript API (Maps, Places, Directions, Street View, Geometry)
- Firebase Authentication (email/password and Google sign-in)
- Firebase Firestore (analytics events)

## Live Deployment
- Hosting platform: Vercel
- Live URL: <PASTE_YOUR_VERCEL_LINK_HERE>

## Deploy Steps (Vercel)
1. Push the latest code to GitHub (main branch).
2. In Vercel, select “New Project” and import the GitHub repository.
3. Configure the project as a static site:
   - Framework Preset: Other / Static
   - Build Command: none
   - Output Directory: root
4. Deploy.

## Post-Deployment Configuration (Required)
### Fix Firebase Auth error: auth/unauthorized-domain
Firebase Authentication only allows sign-in from approved domains.
1. Firebase Console → Authentication → Settings → Authorized domains
2. Add:
   - <YOUR_PROJECT>.vercel.app
   - (and any custom domain if used)

### Google Sign-In (if enabled)
If Google sign-in is enabled, ensure OAuth settings allow the deployed origin:
- Google Cloud Console → APIs & Services → Credentials
- OAuth Client ID (Web):
  - Authorized JavaScript origins: https://<YOUR_PROJECT>.vercel.app
  - Authorized redirect URIs: add any Firebase-required redirect URLs if prompted

## API Key Security
### Google Maps API Key restrictions
Because the Google Maps key is used in the client, it must be restricted:
1. Google Cloud Console → Credentials → API Key
2. Application restrictions: HTTP referrers
3. Allowed referrers:
   - https://<YOUR_PROJECT>.vercel.app/*
   - (and custom domain if used)
4. API restrictions: only enable required APIs:
   - Maps JavaScript API
   - Places API
   - Directions API

## Verification Checklist
After deployment, verify:
- Map loads and can be moved/zoomed
- City autocomplete works
- Nearby scan returns results
- Route calculation works (Driving/Transit/Walking/Bicycling)
- Login works (email/password + Google if enabled)
- Firestore receives analytics events in the `events` collection

## Troubleshooting
### auth/unauthorized-domain
Cause: domain not whitelisted in Firebase Auth.
Fix: add the Vercel domain in Authorized domains (see above).
