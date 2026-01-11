import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7a_97XoJn58dXB2c2wdez_MkBy9X50f8",
  authDomain: "atlas-e5b69.firebaseapp.com",
  projectId: "atlas-e5b69",
  storageBucket: "atlas-e5b69.firebasestorage.app",
  messagingSenderId: "880434544456",
  appId: "1:880434544456:web:caa2718bb344a1bb3a3d7d",
  measurementId: "G-NQJTWMJCZJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function getSessionId() {
  const k = "atlasgo_session_id";
  let sid = localStorage.getItem(k);
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(16).slice(2));
    localStorage.setItem(k, sid);
  }
  return sid;
}

async function trackEvent(type, payload = {}) {
  try {
    await addDoc(collection(db, "events"), {
      type,
      payload,
      sessionId: getSessionId(),
      ts: serverTimestamp(),
      ua: navigator.userAgent || "",
      lang: navigator.language || "",
    });
  } catch (e) {
    console.warn("Analytics error:", e);
  }
}

window.__trackEvent = trackEvent;
window.__db = db;
window.__auth = auth;
window.__authUser = null;

window.logout = async () => {
  try {
    await signOut(auth);
    await trackEvent("logout", {});
  } catch (e) {
    console.warn("logout error:", e);
  } finally {
    location.href = "./login.html";
  }
};

function pageName() {
  const p = (location.pathname.split("/").pop() || "").toLowerCase();
  if (!p || p === "index.html") return "index";
  if (p === "login.html") return "login";
  return p;
}

const current = pageName();
trackEvent("page_view", { page: current });

onAuthStateChanged(auth, (user) => {
  window.__authUser = user || null;

  // Doar login -> index (dacă e deja logat)
  if (current === "login" && user) {
    setTimeout(() => { location.href = "./index.html"; }, 50);
    return;
  }

  window.dispatchEvent(new CustomEvent("auth-changed", { detail: { user } }));
});
