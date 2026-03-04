"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const [formattedDates, setFormattedDates] = useState<Record<string, string>>({});

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
    const imdbPattern = /^tt\d{7,}$/;
    if (!trimmed) {
      setFormError("Please enter an IMDb ID (e.g., tt0133093).");
      return;
    }
    if (!imdbPattern.test(trimmed)) {
      setFormError("Invalid IMDb ID format. Expected tt followed by at least 7 digits (e.g., tt0133093).");
      return;
    }

    setLoading(true);
    try {
      const movieRes = await fetch(`/api/movie?imdbID=${encodeURIComponent(trimmed)}`, {
        cache: "no-store"
      });
      if (!movieRes.ok) {
        const err = await movieRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch movie details.");
      }
      const movieJson = (await movieRes.json()) as MovieResponse;
      setMovie(movieJson);

      const sentRes = await fetch(`/api/sentiment?imdbID=${encodeURIComponent(trimmed)}`, {
        cache: "no-store"
      });
      if (!sentRes.ok) {
        const err = await sentRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch and summarize audience sentiment.");
      }
      const sentJson = (await sentRes.json()) as SentimentResponse;
      setSentiment(sentJson);

      const reviewsRes = await fetch(`/api/reviews?imdbID=${encodeURIComponent(trimmed)}`, {
        cache: "no-store"
      });
      if (!reviewsRes.ok) {
        const err = await reviewsRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch reviews.");
      }
      const reviewsJson = await reviewsRes.json();
      setReviews(reviewsJson.reviews ?? []);

      const summaryRes = await fetch(`/api/summary`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imdbID: trimmed, reviews: reviewsJson.reviews ?? [] })
      });
      if (!summaryRes.ok) {
        const err = await summaryRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to generate AI summary.");
      }
      const summaryJson = await summaryRes.json();
      setAiSummary(summaryJson.summary ?? null);

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

  const sentimentBreakdown = useMemo(() => {
    const score = sentiment?.sentiment.score ?? 0; // -1 to 1
    // Map score to approximate shares; keep totals ~100.
    const positive = Math.min(100, Math.max(0, Math.round((score + 1) * 45))); // 0..90
    const negative = Math.min(100, Math.max(0, Math.round((1 - score) * 20))); // 0..40
    const mixed = Math.max(0, 100 - positive - negative);
    return { positive, mixed, negative };
  }, [sentiment]);

  // Ensure date formatting happens only in the browser (client timezone) to avoid hydration mismatch.
  useEffect(() => {
    const next: Record<string, string> = {};
    reviews.forEach((r) => {
      if (!r.date) return;
      const d = new Date(r.date);
      next[r.id] = d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric"
      });
    });
    setFormattedDates(next);
  }, [reviews]);

  const heroBackgroundStyle = useMemo(() => {
    if (movie?.poster && movie.poster !== "N/A") {
      return {
        backgroundImage: `linear-gradient(115deg, rgba(10,16,36,0.92) 0%, rgba(13,26,64,0.85) 55%, rgba(12,14,30,0.78) 100%), url(${movie.poster})`
      };
    }
    return {
      backgroundImage:
        "linear-gradient(115deg, rgba(10,16,36,0.95) 0%, rgba(16,36,94,0.82) 55%, rgba(12,14,30,0.78) 100%)"
    };
  }, [movie?.poster]);

  const primaryGenre = movie?.genre?.split(",")[0]?.trim();

  return (
    <div className="layout">
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Movie Analysis</div>
            <div className="topbar-sub">AI-powered insights engine</div>
          </div>

          <div className="topbar-actions">
            <div className="search">
              <span>🔍</span>
              <input placeholder="Search for movies..." />
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
              <div className={`input-shell ${formError ? "invalid" : ""}`}>
                <span className="input-prefix">ID:</span>
                <input
                  value={imdbID}
                  onChange={(e) => {
                    const next = e.target.value;
                    setImdbID(next);
                    // Clear error live once input matches the expected pattern.
                    if (formError && /^tt\d{7,}$/.test(next.trim())) {
                      setFormError(null);
                    }
                  }}
                  placeholder="tt0133093"
                  aria-invalid={!!formError}
                  aria-describedby={formError ? "imdb-error" : undefined}
                />
              </div>
              <button className="primary-btn" disabled={loading} type="submit">
                {loading ? "Generating..." : "Generate Report"}
              </button>
            </form>
            {formError && (
              <div id="imdb-error" className="error">
                {formError}
              </div>
            )}
          </div>
        </section>

        <section className="hero-card" style={heroBackgroundStyle}>
          <div className="hero-overlay">
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
                {primaryGenre && <span className="pill outline">{primaryGenre}</span>}
              </div>

              <div className="hero-title">{movie?.title || "Awaiting selection"}</div>
              <div className="hero-sub">
                {movie
                  ? movie.plot && movie.plot !== "N/A"
                    ? movie.plot
                    : `${movie.genre} • ${movie.director || "Unknown"}`
                  : "Pick a movie to see AI insights"}
              </div>

              <div className="hero-stats">
                <div className="stat-chip">
                  <span className="icon">⭐</span>
                  <div>
                    <div className="stat-value">{movie?.imdbRating || "8.7"}</div>
                    <div className="stat-label">IMDb rating</div>
                  </div>
                </div>
                <div className="stat-chip">
                  <span className="icon">🔥</span>
                  <div>
                    <div className="stat-value">{movie?.imdbVotes || "96%"}</div>
                    <div className="stat-label">Popularity</div>
                  </div>
                </div>
              </div>

              <div className="hero-actions">
                <button className="primary-btn solid">▶ Watch Trailer</button>
                <button className="ghost-btn dark">Share</button>
              </div>
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
                <div className="card-title">AI Sentiment Analysis</div>
                <div className="card-sub">
                  Based on audience reviews & critic comments (Gemini-powered)
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
              <div className="stat-card">
                <div className="stat-label">POSITIVE SENTIMENT</div>
                <div className="stat-value">{sentimentBreakdown.positive}%</div>
                <div className="stat-delta pos">↑ 2.1%</div>
                <div className="stat-bar">
                  <span className="fill positive" style={{ width: `${Math.min(sentimentBreakdown.positive, 100)}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">MIXED REACTIONS</div>
                <div className="stat-value">{sentimentBreakdown.mixed}%</div>
                <div className="stat-delta muted">—</div>
                <div className="stat-bar">
                  <span className="fill mixed" style={{ width: `${Math.min(sentimentBreakdown.mixed, 100)}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">NEGATIVE SENTIMENT</div>
                <div className="stat-value">{sentimentBreakdown.negative}%</div>
                <div className="stat-delta neg">↓ 0.5%</div>
                <div className="stat-bar">
                  <span className="fill negative" style={{ width: `${Math.min(sentimentBreakdown.negative, 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="consensus-card">
              <div className="consensus-icon">🤖</div>
              <div>
                <div className="consensus-title">
                  Audience Consensus Summary <span className="pill tiny">Gemini</span>
                </div>
                <p className="consensus-text">
                  {aiSummary ||
                    "Run an analysis to generate a concise AI summary based on the latest audience reviews."}
                </p>
              </div>
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
                {topicStats.map((t) => (
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
            <span>Review</span>
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

                  <div className="cell phrases" style={{ alignItems: "flex-start" }}>
                    <div
                      style={{
                        maxHeight: expandedReviews[r.id] ? "none" : "96px",
                        overflow: "hidden",
                        lineHeight: "1.4",
                        width: "100%"
                      }}
                    >
                      {r.content || <span className="muted">No review text</span>}
                    </div>
                    {r.content && r.content.length > 180 && (
                      <button
                        className="ghost-btn"
                        style={{ marginTop: "0.25rem", padding: "0 0.5rem", fontSize: "0.85rem" }}
                        onClick={() =>
                          setExpandedReviews((prev) => ({
                            ...prev,
                            [r.id]: !prev[r.id]
                          }))
                        }
                        type="button"
                      >
                        {expandedReviews[r.id] ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>

                  <div className="cell date">
                    {r.date ? formattedDates[r.id] ?? "—" : "—"}
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
