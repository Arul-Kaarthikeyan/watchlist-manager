// ---------- Imports ----------
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const admin = require("firebase-admin");

// ---------- Express setup + middleware ----------
const app = express();
app.use(cors());
app.use(express.json());

// ---------- MongoDB connection ----------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err.message));

// ---------- Movie schema ----------
const movieSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, index: true }, // Firebase user id
    title: { type: String, required: true, trim: true },
    tmdbId: Number,
    year: String,
    poster: String,                                      // full poster URL from TMDB
    status: { type: String, enum: ["Yet to watch", "Watched"], default: "Yet to watch" },
    rating: { type: Number, min: 0, max: 10, default: 0 },
  },
  { timestamps: true }
);
const Movie = mongoose.model("Movie", movieSchema);

// ---------- Firebase auth middleware ----------
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)   // hosted
  : require(process.env.FIREBASE_KEY_PATH);            // local

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.uid = (await admin.auth().verifyIdToken(token)).uid;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- TMDB search (proxied so the API key stays on the server) ----------
app.get("/api/search", auth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(q)}`;
    const data = await (await fetch(url)).json();
    res.json(
      (data.results || []).slice(0, 8).map((m) => ({
        tmdbId: m.id,
        title: m.title,
        year: (m.release_date || "").slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : "",
      }))
    );
  } catch {
    res.status(502).json({ error: "Movie search failed" });
  }
});

// ---------- REST routes (CRUD) ----------
app.post("/api/movies", auth, async (req, res) => {
  if (!req.body.title) return res.status(400).json({ error: "Title is required" });
  const movie = await Movie.create({ ...req.body, uid: req.uid });
  res.status(201).json(movie);
});

app.get("/api/movies", auth, async (req, res) => {
  res.json(await Movie.find({ uid: req.uid }).sort({ createdAt: -1 }));
});

app.get("/api/movies/:id", auth, async (req, res) => {
  const movie = await Movie.findOne({ _id: req.params.id, uid: req.uid });
  movie ? res.json(movie) : res.status(404).json({ error: "Not found" });
});

app.put("/api/movies/:id", auth, async (req, res) => {
  const { status, rating } = req.body; // only these two are editable
  const movie = await Movie.findOneAndUpdate(
    { _id: req.params.id, uid: req.uid },
    { status, rating },
    { new: true, runValidators: true }
  );
  movie ? res.json(movie) : res.status(404).json({ error: "Not found" });
});

app.delete("/api/movies/:id", auth, async (req, res) => {
  const movie = await Movie.findOneAndDelete({ _id: req.params.id, uid: req.uid });
  movie ? res.json({ deleted: true }) : res.status(404).json({ error: "Not found" });
});

// ---------- Start ----------
app.listen(process.env.PORT || 5000, () => console.log("API running"));
