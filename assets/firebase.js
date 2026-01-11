// Firebase tracking + Auth gate (index -> login, login -> index)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Config-ul tău EXACT
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

// Session ID (ca înainte)
function getSessionId() {
  const k = "atlasgo_session_id";
  let sid = localStorage.getItem(k);
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(16).slice(2));
    localStorage.setItem(k, sid);
  }
  return sid;
}

// Tracking
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
    console.warn("Analytics error (check Firestore rules):", e);
  }
}

window.__trackEvent = trackEvent;
window.__db = db;
window.__auth = auth;
window.__authUser = null;

// Optional: logout helper
window.logout = async () => {
  try {
    await signOut(auth);
    await trackEvent("logout", {});
  } catch (e) {
    console.warn("logout error:", e);
  } finally {
    // după logout, trimite la login
    location.href = "./login.html";
  }
};

function pageName() {
  const p = (location.pathname.split("/").pop() || "").toLowerCase();
  // dacă e pe github pages / root, poate fi "" -> index
  if (!p || p === "index.html") return "index";
  if (p === "login.html") return "login";
  return p;
}

const current = pageName();
trackEvent("page_view", { page: current });

// Auth gate
onAuthStateChanged(auth, (user) => {
  window.__authUser = user || null;

  // Dacă ești pe index și nu ești logat -> login
  if ((current === "index") && !user) {
    // mic delay doar ca să nu fie glitch
    setTimeout(() => {
      location.href = "./login.html";
    }, 50);
    return;
  }

  // Dacă ești pe login și ești logat -> index
  if ((current === "login") && user) {
    setTimeout(() => {
      location.href = "./index.html";
    }, 50);
    return;
  }

  // Event optional
  if (user) trackEvent("auth_state", { state: "signed_in" });
  else trackEvent("auth_state", { state: "signed_out" });

  window.dispatchEvent(new CustomEvent("auth-changed", { detail: { user } }));
});
