import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
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

const $ = (id) => document.getElementById(id);

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
  } catch (e) {}
}

function setStatus(msg, kind = "muted") {
  const el = $("status");
  el.textContent = msg;

  if (kind === "ok") el.style.color = "#27ae60";
  else if (kind === "bad") el.style.color = "#e74c3c";
  else el.style.color = "#9aa0a6";
}

function codeOf(e) {
  return (e && e.code) ? String(e.code) : "unknown";
}

function prettyError(e) {
  const c = codeOf(e);

  if (c === "auth/unauthorized-domain") return "Domeniu neautorizat în Firebase (Authorized domains).";
  if (c === "auth/operation-not-allowed") return "Provider neactiv în Firebase Authentication.";
  if (c === "auth/network-request-failed") return "Eroare de rețea sau extensie (adblock).";
  if (c === "auth/invalid-email") return "Email invalid.";
  if (c === "auth/user-not-found") return "Nu există cont cu acest email.";
  if (c === "auth/wrong-password") return "Parolă greșită.";
  if (c === "auth/invalid-credential") return "Date de autentificare invalide.";
  if (c === "auth/too-many-requests") return "Prea multe încercări. Încearcă mai târziu.";
  if (c === "auth/popup-blocked") return "Popup blocat de browser.";
  if (c === "auth/popup-closed-by-user") return "Ai închis fereastra Google.";
  if (c === "auth/cancelled-popup-request") return "Cerere anulată.";

  return "Eroare necunoscută.";
}

function lockUI(v) {
  $("btnSubmit").disabled = v;
  const g = document.getElementById("btnGoogle");
  if (g) g.disabled = v;
  $("tabLogin").disabled = v;
  $("tabRegister").disabled = v;
  $("email").disabled = v;
  $("pass").disabled = v;
}

let mode = "login";
let userAlreadyLoggedUIReady = false;

function ensureLoggedInActionsRow() {
  if (userAlreadyLoggedUIReady) return;
  userAlreadyLoggedUIReady = true;

  const hint = document.querySelector(".hint");
  if (!hint) return;

  const row = document.createElement("div");
  row.style.marginTop = "10px";
  row.style.display = "flex";
  row.style.gap = "10px";

  const btnContinue = document.createElement("button");
  btnContinue.type = "button";
  btnContinue.className = "btn primary";
  btnContinue.textContent = "Continuă la hartă";
  btnContinue.style.flex = "1";
  btnContinue.addEventListener("click", () => { location.href = "./index.html"; });

  const btnLogout = document.createElement("button");
  btnLogout.type = "button";
  btnLogout.className = "btn";
  btnLogout.textContent = "Logout";
  btnLogout.style.flex = "1";
  btnLogout.style.background = "#222";
  btnLogout.style.border = "1px solid #333";
  btnLogout.addEventListener("click", async () => {
    lockUI(true);
    setStatus("Se deloghează...", "muted");
    try {
      await signOut(auth);
      await trackEvent("logout", {});
      setStatus("Delogat. Poți intra cu alt cont.", "ok");
    } catch (e) {
      setStatus(`${prettyError(e)} (${codeOf(e)})`, "bad");
    } finally {
      lockUI(false);
    }
  });

  row.appendChild(btnContinue);
  row.appendChild(btnLogout);
  hint.parentElement.insertBefore(row, hint.nextSibling);
}

function setMode(m) {
  mode = m;

  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabRegister").classList.toggle("active", mode === "register");

  $("btnSubmit").textContent = mode === "login" ? "Intră în cont" : "Creează cont";
  $("pass").setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");

  const f = document.getElementById("forgotLink");
  if (f) f.style.display = (mode === "login") ? "inline" : "none";

  setStatus(mode === "login" ? "—" : "Creează un cont nou.", "muted");
}

async function submitEmailPassword() {
  const email = $("email").value.trim();
  const pass = $("pass").value;

  if (!email || !pass) {
    setStatus("Completează email + parolă.", "bad");
    return;
  }

  lockUI(true);
  setStatus("Se procesează...", "muted");

  try {
    if (mode === "login") {
      await signInWithEmailAndPassword(auth, email, pass);
      await trackEvent("login_email", { email });
      location.href = "./index.html";
    } else {
      await createUserWithEmailAndPassword(auth, email, pass);
      await trackEvent("signup_email", { email });
      location.href = "./index.html";
    }
  } catch (e) {
    const c = codeOf(e);
    setStatus(`${prettyError(e)} (${c})`, "bad");
  } finally {
    lockUI(false);
  }
}

async function forgotPassword() {
  const email = $("email").value.trim();

  if (!email) {
    setStatus("Scrie email-ul întâi.", "bad");
    return;
  }

  lockUI(true);
  setStatus("Se trimit instrucțiunile...", "muted");

  try {
    const continueUrl = new URL("./login.html", window.location.href).toString();
    const settings = { url: continueUrl, handleCodeInApp: false };

    await sendPasswordResetEmail(auth, email, settings);
    await trackEvent("password_reset_request", { email });

    setStatus("Instrucțiunile pentru resetarea parolei au fost trimise către email. Verifică și Spam.", "ok");
  } catch (e) {
    const c = codeOf(e);
    setStatus(`${prettyError(e)} (${c})`, "bad");
  } finally {
    lockUI(false);
  }
}

async function signInWithGoogle() {
  lockUI(true);
  setStatus("Se deschide Google...", "muted");

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await signInWithPopup(auth, provider);
    await trackEvent("login_google", { email: cred.user?.email || "" });
    location.href = "./index.html";
  } catch (e) {
    const c = codeOf(e);
    setStatus(`${prettyError(e)} (${c})`, "bad");
  } finally {
    lockUI(false);
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    setStatus("Ești deja autentificat. Poți continua la hartă sau să faci logout.", "ok");
    ensureLoggedInActionsRow();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  setMode("login");
  await trackEvent("page_view", { page: "login" });

  $("tabLogin").addEventListener("click", () => setMode("login"));
  $("tabRegister").addEventListener("click", () => setMode("register"));

  $("btnSubmit").addEventListener("click", submitEmailPassword);

  const googleBtn = document.getElementById("btnGoogle");
  if (googleBtn) googleBtn.addEventListener("click", signInWithGoogle);

  const forgot = document.getElementById("forgotLink");
  if (forgot) {
    forgot.addEventListener("click", (e) => {
      e.preventDefault();
      forgotPassword();
    });
  }

  $("pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitEmailPassword();
  });

  $("email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitEmailPassword();
  });
});
