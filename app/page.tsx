"use client";

import { FormEvent, useMemo, useState } from "react";

interface MovieResponse {
  imdbID: string;
  title: string;
  year: string;
  rated: string;
  runtime: string;
  genre: string;
  director: string;
  writer: string;
  cast: string;
  plot: string;
  language: string;
  country: string;
  awards: string;
  poster: string;
  imdbRating: string;
  imdbVotes: string;
  type: string;
}

interface SentimentResponse {
  imdbID: string;
  sentiment: {
    label: "positive" | "negative" | "mixed";
    score: number;
    summary: string;
  };
  sampleReviews: string[];
}

interface Review {
  id: string;
  author: string;
  role: string;
  avatar: string;
  rating: number | null;
  content: string;
  date: string;
  phrases: string[];
}

const sentimentPalette = {
  positive: { label: "Overwhelmingly Positive", color: "#22c55e", bg: "#dcfce7" },
  negative: { label: "Negative", color: "#ef4444", bg: "#fee2e2" },
  mixed: { label: "Mixed", color: "#f59e0b", bg: "#fef3c7" }
};

const recentSamples = [
  { title: "Inception", status: "Positive", ago: "2m ago", poster: "https://image.tmdb.org/t/p/w200/qmDpIHrmpJINaRKAfWQfftjCdyi.jpg" },
  { title: "The Shawshank Redemption", status: "Positive", ago: "1h ago", poster: "https://image.tmdb.org/t/p/w200/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg" }
];

const analyzedReviewsFallback: Review[] = [];

export default function HomePage() {
  const [imdbID, setImdbID] = useState("");
  const [movie, setMovie] = useState<MovieResponse | null>(null);
  const [sentiment, setSentiment] = useState<SentimentResponse | null>(null);
  const [reviews, setReviews] = useState<Review[]>(analyzedReviewsFallback);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [recent, setRecent] = useState(
    recentSamples.map((r) => ({ ...r, imdbID: "" }))
  );

  const topicStats = useMemo(() => {
    const counts: Record<string, number> = {};
    reviews.forEach((r) => {
      r.phrases.forEach((p) => {
        const key = p.trim().toLowerCase();
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
    });

    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    if (!entries.length) {
      return [
        { label: "Visual Effects", value: 26.5, color: "#60a5fa" },
        { label: "Acting", value: 23, color: "#38bdf8" },
        { label: "Action", value: 23.7, color: "#ec4899" },
        { label: "Philosophy", value: 24.9, color: "#8b5cf6" }
      ];
    }

    const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
    const palette = ["#60a5fa", "#8b5cf6", "#ec4899", "#38bdf8"];

    return entries.map(([label, v], i) => ({
      label,
      value: Number(((v / total) * 100).toFixed(1)),
      color: palette[i % palette.length]
    }));
  }, [reviews]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setApiError(null);
    setMovie(null);
    setSentiment(null);
    setReviews([]);
    setAiSummary(null);

    const trimmed = imdbID.trim();
    if (!trimmed) {
      setFormError("Please enter an IMDb ID (e.g., tt0133093).");
      return;
    }
    if (!/^tt\d+$/.test(trimmed)) {
      setFormError("Invalid IMDb ID format. It should look like tt followed by digits.");
      return;
    }

    setLoading(true);
    try {
      const movieRes = await fetch(`/api/movie?imdbID=${encodeURIComponent(trimmed)}`);
      if (!movieRes.ok) {
        const err = await movieRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch movie details.");
      }
      const movieJson = (await movieRes.json()) as MovieResponse;
      setMovie(movieJson);

      const sentRes = await fetch(`/api/sentiment?imdbID=${encodeURIComponent(trimmed)}`);
      if (!sentRes.ok) {
        const err = await sentRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch and summarize audience sentiment.");
      }
      const sentJson = (await sentRes.json()) as SentimentResponse;
      setSentiment(sentJson);

      const reviewsRes = await fetch(`/api/reviews?imdbID=${encodeURIComponent(trimmed)}`);
      if (!reviewsRes.ok) {
        const err = await reviewsRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch reviews.");
      }
      const reviewsJson = await reviewsRes.json();
      setReviews(reviewsJson.reviews ?? []);

      const summaryRes = await fetch(`/api/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imdbID: trimmed, reviews: reviewsJson.reviews ?? [] })
      });
      if (!summaryRes.ok) {
        const err = await summaryRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to generate AI summary.");
      }
      const summaryJson = await summaryRes.json();
      setAiSummary(summaryJson.summary ?? null);

      // Update recent analysis list (dedupe, keep latest first, max 5)
      const statusLabel = sentimentPalette[sentJson.sentiment.label].label;
      setRecent((prev) => {
        const filtered = prev.filter((item) => item.imdbID !== trimmed);
        const poster =
          movieJson.poster && movieJson.poster !== "N/A"
            ? movieJson.poster
            : "https://via.placeholder.com/80x120?text=Poster";
        const next = [
          {
            imdbID: trimmed,
            title: movieJson.title || trimmed,
            status: statusLabel,
            ago: "just now",
            poster
          },
          ...filtered
        ];
        return next.slice(0, 2);
      });
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  const sentimentMeta = useMemo(
    () => (sentiment ? sentimentPalette[sentiment.sentiment.label] : null),
    [sentiment]
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">🎬</div>
          <div>
            <div className="brand-name">CineSight</div>
            <div className="brand-sub">AI</div>
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-label">Main Menu</div>
          <button className="nav-item active">🎯 Movie Analysis</button>
          <button className="nav-item">📈 Trending Insights</button>
          <button className="nav-item">⚖️ Comparison Tool</button>
          <button className="nav-item">🕑 History</button>
        </div>

        <div className="nav-group">
          <div className="nav-label">Library</div>
          <button className="nav-item">💾 Saved Reports</button>
          <button className="nav-item">⭐ Favorites</button>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-top">
            <div className="pill purple">PRO</div>
            <div className="sidebar-card-title">Upgrade Plan</div>
            <div className="sidebar-card-sub">Get unlimited AI analysis</div>
          </div>
          <button className="upgrade-btn">Upgrade Now</button>
        </div>

        <div className="user-tile">
          <div className="avatar">A</div>
          <div>
            <div className="user-name">Alex Morgan</div>
            <div className="user-email">alex@example.com</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">Movie Analysis</div>
            <div className="topbar-sub">AI-powered insights engine</div>
          </div>

          <div className="topbar-actions">
            <div className="search">
              <span>🔍</span>
              <input placeholder="Search for movies..." />
              <span className="kbd">⌘K</span>
            </div>
            <button className="notif">🔔</button>
            <button className="notif">🧊</button>
            <div className="status-chip">
              <span className="dot live" /> Connected
            </div>
          </div>
        </header>

        <section className="analysis-card">
          <div>
            <div className="analysis-title">Analyze Movie Sentiment</div>
            <div className="analysis-sub">
              Enter an IMDb ID to generate a comprehensive AI report.
            </div>
            <form className="analysis-form" onSubmit={handleSubmit} noValidate>
              <div className="input-shell">
                <span className="input-prefix">ID:</span>
                <input
                  value={imdbID}
                  onChange={(e) => setImdbID(e.target.value)}
                  placeholder="tt0133093"
                />
              </div>
              <button className="primary-btn" disabled={loading} type="submit">
                {loading ? "Generating..." : "Generate Report"}
              </button>
            </form>
            {formError && <div className="error">{formError}</div>}
            {apiError && <div className="error">{apiError}</div>}
          </div>

          <div className="recent">
            <div className="recent-title">Recent Analysis</div>
            <div className="recent-list">
              {recent.map((item) => (
                <div key={`${item.imdbID}-${item.title}`} className="recent-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.poster} alt={item.title} />
                  <div>
                    <div className="recent-name">{item.title}</div>
                    <div className="recent-meta">
                      <span className="pill positive">{item.status}</span>
                      <span className="ago">{item.ago}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hero-card">
          <div className="hero-art">
            {movie?.poster && movie.poster !== "N/A" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={movie.poster} alt={`${movie.title} poster`} />
            ) : (
              <div className="hero-placeholder">Poster</div>
            )}
          </div>
          <div className="hero-body">
            <div className="hero-meta">
              <span className="pill dark">{movie?.rated || "PG"}</span>
              <span className="pill outline">{movie?.year || "1999"}</span>
              <span className="pill outline">{movie?.runtime || "2h 16m"}</span>
              <span className="pill outline">{movie?.genre || "Sci-fi"}</span>
            </div>
            <div className="hero-title">{movie?.title || "Awaiting selection"}</div>
            <div className="hero-sub">
              {movie
                ? `${movie.genre} • ${movie.director || "Unknown"}`
                : "Pick a movie to see AI insights"}
            </div>
            <div className="hero-actions">
              <button className="secondary-btn">▶ Watch Trailer</button>
              <button className="ghost-btn">Share</button>
            </div>
          </div>
        </section>

        <section className="grid">
          <div className="card-block">
            <div className="card-head">
              <div className="card-title">Plot Summary</div>
            </div>
            <div className="card-body">
              {loading && <div className="skeleton" />}
              {!loading && movie?.plot && movie.plot !== "N/A"
                ? movie.plot
                : !loading && "Enter an IMDb ID to see the plot overview."}
            </div>
          </div>

          <div className="card-block">
            <div className="card-head">
              <div className="card-title">Top Cast</div>
            </div>
            <div className="cast-wrap">
              {loading && <div className="skeleton" />}
              {!loading && movie?.cast
                ? movie.cast.split(",").slice(0, 6).map((name) => (
                    <div key={name} className="cast-item">
                      <div className="avatar small">{name.trim()[0]}</div>
                      <div className="cast-name">{name.trim()}</div>
                    </div>
                  ))
                : !loading && "Cast appears here after a lookup."}
            </div>
          </div>
        </section>

        <section className="grid wide">

           <div className="card-block sentiment">
            <div className="card-head sentiment-head">
              <div>
                <div className="card-title">Audience sentiment analysis </div>
                <div className="card-sub">
                  Based on  audience reviews & critic comments
                </div>
              </div>
              {sentimentMeta && (
                <span
                  className="pill soft sentiment-pill"
                  style={{ color: sentimentMeta.color, background: sentimentMeta.bg }}
                >
                  {sentimentMeta.label}
                </span>
              )}
            </div>

            <div className="sentiment-grid stat-row">
              {[
                { key: "positive", label: "Positive Sentiment", fallback: "89%", delta: "+2.1%" },
                { key: "mixed", label: "Mixed Reactions", fallback: "8%", delta: "–" },
                { key: "negative", label: "Negative Sentiment", fallback: "3%", delta: "-0.5%" }
              ].map((item) => (
                <div key={item.key} className="stat-card">
                  <div className="stat-label">{item.label.toUpperCase()}</div>
                  <div className="stat-value">
                    {sentiment && item.key === sentiment.sentiment.label
                      ? `${Math.round(sentiment.sentiment.score * 100)}%`
                      : sentiment
                      ? "—"
                      : item.fallback}
                  </div>
                  <div
                    className={`stat-delta ${
                      item.delta.startsWith("-") ? "neg" : item.delta === "–" ? "muted" : "pos"
                    }`}
                  >
                    {item.delta}
                  </div>
                  <div className="stat-bar">
                    <span className={`fill ${item.key}`} />
                  </div>
                </div>
              ))}
            </div>

          </div>


          <div className="card-block topics">
            <div className="card-head">
              <div className="card-title">Key Topics</div>
            </div>
            <div className="topics-body">
              <div
                className="donut"
                style={{
                  background: `conic-gradient(${topicStats
                    .map((t, i) => {
                      const start =
                        topicStats.slice(0, i).reduce((sum, item) => sum + item.value, 0);
                      const end = start + t.value;
                      return `${t.color} ${start}% ${end}%`;
                    })
                    .join(", ")})`
                }}
              >
                <div className="donut-inner">Topics</div>
              </div>
              <div className="topic-list">
                {topicStats.map((t, i) => (
                  <div key={t.label} className="topic-row">
                    <span
                      className="dot"
                      style={{ background: t.color }}
                    />
                    <span className="topic-name">{t.label}</span>
                    <span className="topic-share">{t.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        <section className="card-block">
          <div className="card-head">
            <div className="card-title">AI summary of audience sentiment </div>
          </div>
          <div className="card-body">
            {loading && <div className="skeleton" />}
            {!loading && aiSummary && <div>{aiSummary}</div>}
            {!loading && !aiSummary && (
              <div className="muted">
                Run an analysis to generate a concise AI summary based on audience reviews.
              </div>
            )}
            {apiError && !loading && (
              <div className="error" style={{ marginTop: "0.5rem" }}>
                {apiError}
              </div>
            )}
          </div>
        </section>






        <section className="card-block reviews-table">
          <div className="reviews-top">
            <div>
              <div className="card-title">Analyzed Reviews</div>
              <div className="card-sub">Recent high-impact reviews processed by AI</div>
            </div>
            <div className="table-actions">
              <button className="selector">Most Helpful ▾</button>
              <button className="icon-btn" aria-label="Filter">⏷</button>
              <button className="icon-btn" aria-label="Download">⬇</button>
            </div>
          </div>

          <div className="table-head">
            <span>Reviewer</span>
            <span>Rating</span>
            <span>Sentiment Score</span>
            <span>Key Phrase Extraction</span>
            <span>Date</span>
          </div>

          <div className="table-body">
            {reviews.length === 0 && (
              <div className="table-row muted">No reviews yet for this title.</div>
            )}
            {reviews.map((r) => {
              const stars = r.rating ? Math.round(r.rating / 2) : 0; // TMDB rating 0-10 → 0-5 stars
              const tone = r.rating !== null && r.rating >= 7 ? "positive" : r.rating !== null && r.rating <= 4 ? "negative" : "mixed";
              return (
                <div key={r.id} className="table-row">
                  <div className="cell reviewer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.avatar} alt={r.author} />
                    <div>
                      <div className="name">{r.author}</div>
                      <div className="muted">{r.role}</div>
                    </div>
                  </div>

                  <div className="cell rating">
                    <div className="stars" aria-hidden>
                      {"★".repeat(stars) + "☆".repeat(5 - stars)}
                    </div>
                    <div className="muted">{r.rating !== null ? `${r.rating}/10` : "—"}</div>
                  </div>

                  <div className="cell sentiment-cell">
                    <span className={`pill sentiment-pill ${tone}`}>
                      {tone === "positive" ? "Positive" : tone === "negative" ? "Negative" : "Mixed"}{" "}
                      ({r.rating !== null ? (r.rating / 10).toFixed(2) : "—"})
                    </span>
                  </div>

                  <div className="cell phrases">
                    {r.phrases.length
                      ? r.phrases.map((p) => (
                          <span key={p} className="phrase-chip">
                            {p}
                          </span>
                        ))
                      : <span className="muted">No key phrases</span>}
                  </div>

                  <div className="cell date">
                    {r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="table-footer">
            <span className="muted">
              Showing {reviews.length ? `1 to ${reviews.length}` : 0} of {reviews.length || "—"} results
            </span>
            <div className="pager">
              <button className="ghost-btn" disabled>Previous</button>
              <button className="ghost-btn" disabled>Next</button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
