import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
      lang: navigator.language || ""
    });
  } catch (e) {
    console.warn("Analytics error:", e);
  }
}

const $ = (id) => document.getElementById(id);

let mode = "login";

function setMode(m) {
  mode = m;

  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabRegister").classList.toggle("active", mode === "register");

  $("btnSubmit").textContent = mode === "login" ? "Intră în cont" : "Creează cont";
  $("pass").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");

  $("forgotLink").style.display = (mode === "login") ? "inline" : "none";

  setStatus(mode === "login" ? "—" : "Creează un cont nou.", "muted");
}

function setStatus(msg, kind = "muted") {
  const el = $("status");
  el.textContent = msg;

  if (kind === "ok") el.style.color = "#27ae60";
  else if (kind === "bad") el.style.color = "#e74c3c";
  else el.style.color = "#9aa0a6";
}

function friendlyAuthError(e) {
  const code = (e && e.code) ? String(e.code) : "unknown";

  if (code.includes("auth/unauthorized-domain")) {
    return "Domeniu neautorizat în Firebase (Authorized domains).";
  }
  if (code.includes("auth/operation-not-allowed")) {
    return "Email/Password nu este activat în Firebase Authentication.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "Eroare de rețea (internet/adblock). Încearcă din nou.";
  }
  if (code.includes("auth/invalid-email")) {
    return "Email invalid.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "Email deja înregistrat. Folosește Login.";
  }
  if (code.includes("auth/weak-password")) {
    return "Parolă prea slabă (minim 6 caractere).";
  }
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "Email sau parolă greșită.";
  }
  if (code.includes("auth/user-not-found")) {
    return "Nu există cont cu acest email.";
  }

  return `Eroare la autentificare. (${code})`;
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
  } catch (e) {
    console.warn("AUTH ERROR:", e);
    setStatus(friendlyAuthError(e), "bad");
  } finally {
    $("btnSubmit").disabled = false;
  }
}

async function forgotPassword() {
  const email = $("email").value.trim();

  if (!email) {
    setStatus("Scrie email-ul întâi.", "bad");
    return;
  }

  $("btnSubmit").disabled = true;
  setStatus("Se trimit instrucțiunile...", "muted");

  try {
    const continueUrl = new URL("./login.html", window.location.href).toString();

    await sendPasswordResetEmail(auth, email, {
      url: continueUrl
    });

    await trackEvent("password_reset_request", { email });

    setStatus("Instrucțiunile pentru resetarea parolei au fost trimise către email. Verifică și Spam.", "ok");
  } catch (e) {
    console.warn("RESET ERROR:", e);

    const code = (e && e.code) ? String(e.code) : "";
    if (code.includes("auth/unauthorized-domain")) {
      setStatus("Resetarea nu poate trimite email: domeniu neautorizat în Firebase (Authorized domains).", "bad");
    } else if (code.includes("auth/operation-not-allowed")) {
      setStatus("Resetarea nu merge: Email/Password nu este activat în Firebase Authentication.", "bad");
    } else if (code.includes("auth/invalid-email")) {
      setStatus("Email invalid.", "bad");
    } else {
      setStatus("Dacă există un cont cu acest email, instrucțiunile pentru resetarea parolei au fost trimise. Verifică inbox/spam.", "ok");
    }
  } finally {
    $("btnSubmit").disabled = false;
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    setStatus("Autentificat ✅ Redirecționare...", "ok");
    setTimeout(() => {
      location.href = "./index.html";
    }, 250);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  setMode("login");
  await trackEvent("page_view", { page: "login" });

  $("tabLogin").addEventListener("click", () => setMode("login"));
  $("tabRegister").addEventListener("click", () => setMode("register"));
  $("btnSubmit").addEventListener("click", submit);

  $("forgotLink").addEventListener("click", (e) => {
    e.preventDefault();
    forgotPassword();
  });

  $("pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  $("email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
});
