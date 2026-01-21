require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { admin } = require("./firebaseAdmin");

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

async function authMiddleware(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const m = hdr.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: "Missing Bearer token" });

    const idToken = m[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/history/save", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const payload = req.body && req.body.history ? req.body.history : req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Missing history payload" });
    }

    const db = admin.firestore();
    const ref = db.collection("users").doc(uid).collection("history").doc();

    await ref.set({
      ...payload,
      uid,
      createdAt: nowTs()
    });

    res.json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ error: "Failed to save history" });
  }
});

app.get("/api/history", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();

    const snap = await db
      .collection("users").doc(uid).collection("history")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, history });
  } catch (e) {
    res.status(500).json({ error: "Failed to load history" });
  }
});

app.post("/api/favorites/save", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const fav = req.body && req.body.favorite ? req.body.favorite : req.body;

    if (!fav || typeof fav !== "object") {
      return res.status(400).json({ error: "Missing favorite payload" });
    }

    const placeId = String(fav.place_id || fav.placeId || "").trim();
    if (!placeId) return res.status(400).json({ error: "Missing place_id" });

    const db = admin.firestore();
    const ref = db.collection("users").doc(uid).collection("favorites").doc(placeId);

    const shouldDelete = Boolean(fav._delete === true);

    if (shouldDelete) {
      await ref.delete();
      return res.json({ ok: true, deleted: true, id: placeId });
    }

    await ref.set(
      {
        ...fav,
        place_id: placeId,
        uid,
        updatedAt: nowTs()
      },
      { merge: true }
    );

    res.json({ ok: true, id: placeId });
  } catch (e) {
    res.status(500).json({ error: "Failed to save favorite" });
  }
});

app.get("/api/favorites", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();

    const snap = await db
      .collection("users").doc(uid).collection("favorites")
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();

    const favorites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, favorites });
  } catch (e) {
    res.status(500).json({ error: "Failed to load favorites" });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`AtlasGo backend running on http://localhost:${port}`);
});
