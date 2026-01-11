// Login/Register page logic + Firebase Auth
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// EXACT config-ul tău
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
const auth = getAuth(app);
const db = getFirestore(app);

// session id (same idea as before)
function getSessionId() {
  const k = "atlasgo_session_id";
  let sid = localStorage.getItem(k);
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(16).slice(2));
    localStorage.setItem(k, sid);
  }
  return sid;
}

// track to Firestore (events)
async function trackEvent(type, payload = {}) {
  try {
    await addDoc(collection(db, "events"), {
      type,
      payload,
      sessionId: getSessionId(),
      ts: serverTimestamp(),
      ua: navigator.userAgent || "",
      lang: navigator.language || ""
    });
  } catch (e) {
    console.warn("Analytics error:", e);
  }
}

const $ = (id) => document.getElementById(id);

let mode = "login"; // or "register"

function setMode(m) {
  mode = m;

  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabRegister").classList.toggle("active", mode === "register");

  $("btnSubmit").textContent = mode === "login" ? "Intră în cont" : "Creează cont";
  $("pass").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  $("status").textContent = mode === "login" ? "—" : "Creează un cont nou.";
}

function setStatus(msg, kind = "muted") {
  const el = $("status");
  el.textContent = msg;

  // color quick mapping
  if (kind === "ok") el.style.color = "#27ae60";
  else if (kind === "bad") el.style.color = "#e74c3c";
  else el.style.color = "#9aa0a6";
}

async function submit() {
  const email = $("email").value.trim();
  const pass = $("pass").value;

  if (!email || !pass) {
    setStatus("Completează email + parolă.", "bad");
    return;
  }

  $("btnSubmit").disabled = true;
  setStatus("Se procesează...", "muted");

  try {
    if (mode === "login") {
      await signInWithEmailAndPassword(auth, email, pass);
      await trackEvent("login", { email });
    } else {
      await createUserWithEmailAndPassword(auth, email, pass);
      await trackEvent("signup", { email });
    }
    // redirect handled by auth listener
  } catch (e) {
    // simple friendly messages
    const code = (e && e.code) ? e.code : "";
    if (code.includes("auth/invalid-email")) setStatus("Email invalid.", "bad");
    else if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) setStatus("Email sau parolă greșită.", "bad");
    else if (code.includes("auth/email-already-in-use")) setStatus("Email deja folosit. Încearcă Login.", "bad");
    else if (code.includes("auth/weak-password")) setStatus("Parolă prea slabă (minim 6 caractere).", "bad");
    else setStatus("Eroare la autentificare. Încearcă din nou.", "bad");

    console.warn(e);
  } finally {
    $("btnSubmit").disabled = false;
  }
}

// If already logged in -> go to index
onAuthStateChanged(auth, (user) => {
  if (user) {
    setStatus("Autentificat ✅ Redirecționare...", "ok");
    setTimeout(() => {
      location.href = "./index.html";
    }, 300);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  setMode("login");
  await trackEvent("page_view", { page: "login" });

  $("tabLogin").addEventListener("click", () => setMode("login"));
  $("tabRegister").addEventListener("click", () => setMode("register"));
  $("btnSubmit").addEventListener("click", submit);

  $("pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  $("email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
});
