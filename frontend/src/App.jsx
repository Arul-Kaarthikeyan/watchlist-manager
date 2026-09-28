import { useEffect, useState } from "react";
import axios from "axios";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, provider } from "./firebase";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });
api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const TO_WATCH = "Yet to watch";
const WATCHED = "Watched";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [movies, setMovies] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );
  useEffect(() => {
    if (user) load();
    else setMovies([]);
  }, [user]);

  // search TMDB as the user types (400ms debounce)
  useEffect(() => {
    if (!user || !query.trim()) return setResults([]);
    const t = setTimeout(async () => {
      try {
        setResults(
          (await api.get("/api/search", { params: { q: query } })).data,
        );
        setError("");
      } catch {
        setError("Movie search failed. Check your TMDB key in backend/.env.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query, user]);

  const load = async () => {
    try {
      setMovies((await api.get("/api/movies")).data);
    } catch {
      setError("Could not load your list. Is the backend running?");
    }
  };

  const add = async (m) => {
    await api.post("/api/movies", { ...m, status: TO_WATCH });
    setQuery("");
    setResults([]);
    load();
  };
  const update = async (m, patch) => {
    await api.put(`/api/movies/${m._id}`, {
      status: m.status,
      rating: m.rating,
      ...patch,
    });
    load();
  };
  const remove = async (id) => {
    await api.delete(`/api/movies/${id}`);
    load();
  };

  const added = new Set(movies.map((m) => m.tmdbId));
  const shown =
    filter === "All" ? movies : movies.filter((m) => m.status === filter);

  if (!ready) return null;

  return (
    <>
      <header className="nav">
        <strong className="logo">Watchlist</strong>
        {user && (
          <div className="nav-right">
            <span>{user.displayName}</span>
            <button className="ghost" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </div>
        )}
      </header>

      <main>
        <h1>Everything on My Watchlist</h1>

        {!user ? (
          <button
            className="cta"
            onClick={() => signInWithPopup(auth, provider)}
          >
            Sign in with Google
          </button>
        ) : (
          <>
            <div className="search">
              <input
                placeholder="Search a movie to add"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="results">
                  {results.map((r) => (
                    <li key={r.tmdbId}>
                      {r.poster ? (
                        <img src={r.poster} alt="" />
                      ) : (
                        <span className="noimg" />
                      )}
                      <div>
                        <b>{r.title}</b>
                        <small>{r.year}</small>
                      </div>
                      <button
                        className="cta"
                        disabled={added.has(r.tmdbId)}
                        onClick={() => add(r)}
                      >
                        {added.has(r.tmdbId) ? "Added" : "Add"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {error && <p className="error">{error}</p>}

            <nav className="tabs">
              {["All", TO_WATCH, WATCHED].map((s) => (
                <button
                  key={s}
                  className={filter === s ? "tab on" : "tab"}
                  onClick={() => setFilter(s)}
                >
                  {s}
                </button>
              ))}
            </nav>

            {shown.length === 0 ? (
              <p className="empty">
                Nothing here yet. Search for a movie above to add it.
              </p>
            ) : (
              <section className="grid">
                {shown.map((m) => (
                  <article className="card" key={m._id}>
                    <div className="poster">
                      {m.poster ? (
                        <img src={m.poster} alt={m.title} />
                      ) : (
                        <h3>{m.title}</h3>
                      )}
                      <span
                        className={
                          m.status === WATCHED ? "badge done" : "badge"
                        }
                      >
                        {m.status}
                      </span>
                    </div>
                    <div className="meta">
                      <span title={m.title}>
                        {m.title} {m.year && `(${m.year})`}
                      </span>
                    </div>
                    <div className="actions">
                      <button
                        className="ghost"
                        onClick={() =>
                          update(m, {
                            status: m.status === WATCHED ? TO_WATCH : WATCHED,
                          })
                        }
                      >
                        {m.status === WATCHED
                          ? "Move to yet to watch"
                          : "Mark watched"}
                      </button>
                      <button className="ghost" onClick={() => remove(m._id)}>
                        Delete
                      </button>
                    </div>
                    {m.status === WATCHED && (
                      <select
                        value={m.rating}
                        onChange={(e) =>
                          update(m, { rating: Number(e.target.value) })
                        }
                      >
                        <option value={0}>Rate this movie</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <option key={n} value={n}>
                            {n}/10
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
