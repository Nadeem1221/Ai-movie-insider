import { NextResponse } from "next/server";

type Review = {
  rating: number | null;
  content: string;
  phrases?: string[];
};

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GOOGLE_GEMINI_MODEL?.trim();
// Gemini 2.5 models live under v1; allow override via env.
const GEMINI_VERSION = process.env.GOOGLE_GEMINI_VERSION?.trim() || "v1";
const GEMINI_ENDPOINT =
  GEMINI_MODEL && GEMINI_MODEL.length
    ? `https://generativelanguage.googleapis.com/${GEMINI_VERSION}/models/${GEMINI_MODEL}:generateContent`
    : null;

function buildFallbackSummary(items: Review[]): string {
  if (!items.length) {
    return "No audience reviews are available yet, so we couldn't generate an AI summary.";
  }

  const ratings = items
    .map((r) => (typeof r.rating === "number" ? r.rating : null))
    .filter((n): n is number => n !== null);
  const avgRating = ratings.length
    ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
    : null;
  const tone =
    avgRating === null
      ? "mixed"
      : avgRating >= 7
      ? "positive"
      : avgRating <= 4
      ? "negative"
      : "mixed";

  const phrases = items
    .flatMap((r) => r.phrases || [])
    .map((p) => p.trim())
    .filter(Boolean);
  const counts: Record<string, number> = {};
  for (const p of phrases) counts[p.toLowerCase()] = (counts[p.toLowerCase()] || 0) + 1;
  const topPhrases = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([p]) => p);

  const snippets = items
    .map((r) => String(r.content || "").trim())
    .filter((t) => t.length > 0);
  const snippet = snippets[0]?.slice(0, 180) || "";

  const lines = [
    `Overall audience tone appears ${tone}${avgRating ? ` (avg rating ~${avgRating}/10)` : ""} based on ${items.length} reviews.`,
    topPhrases.length ? `Common themes: ${topPhrases.join(", ")}.` : "",
    snippet ? `Representative comment: "${snippet}${snippet.length >= 180 ? "..." : ""}".` : ""
  ].filter(Boolean);

  return lines.join(" ");
}

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_GEMINI_API_KEY not configured on server." },
      { status: 500 }
    );
  }
  if (!GEMINI_MODEL) {
    return NextResponse.json(
      { error: "GOOGLE_GEMINI_MODEL not configured on server." },
      { status: 500 }
    );
  }
  if (!GEMINI_ENDPOINT) {
    return NextResponse.json(
      { error: "Gemini endpoint could not be built from env vars." },
      { status: 500 }
    );
  }

  let items: Review[] = [];

  try {
    const body = await req.json().catch(() => ({}));
    const { imdbID, reviews } = body as { imdbID?: string; reviews?: Review[] };

    if (!imdbID) {
      return NextResponse.json(
        { error: "Missing imdbID in request body." },
        { status: 400 }
      );
    }

    // If no reviews supplied, pull them from TMDB-backed reviews API (no caching).
    items = Array.isArray(reviews) ? reviews.slice(0, 8) : [];
    if (!items.length) {
      const origin = new URL(req.url).origin;
      try {
        const revRes = await fetch(
          `${origin}/api/reviews?imdbID=${encodeURIComponent(imdbID)}`,
          { cache: "no-store" }
        );
        if (revRes.ok) {
          const revJson = await revRes.json();
          const fetched = Array.isArray(revJson.reviews) ? revJson.reviews : [];
          items = fetched.slice(0, 8);
        }
      } catch (err) {
        // swallow and rely on fallbacks below
        console.error("Summary route could not fetch /api/reviews:", err);
      }
    }

    const reviewText =
      items.length > 0
        ? items
            .map(
              (r, i) =>
                `${i + 1}. Rating: ${
                  r.rating ?? "N/A"
                }, Excerpt: ${String(r.content || "").slice(0, 320)}`
            )
            .join("\n")
        : "No review texts supplied.";

    const prompt = [
      "You are an analyst summarizing audience sentiment for a film based on several short reviews.",
      "Write 3 concise bullet sentences highlighting overall tone, common praise/complaints, and notable keywords.",
      "Be neutral and avoid spoilers.",
      `IMDb ID: ${imdbID}`,
      "Reviews:",
      reviewText
    ].join("\n");

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      // 404 likely means model/version mismatch; no fallback caching here.
      throw new Error(
        `Gemini API error ${res.status}: ${err.slice(0, 400)} (endpoint: ${GEMINI_ENDPOINT})`
      );
    }

    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() ?? "";
    const fallback = buildFallbackSummary(items);
    const finalSummary = text && text.length > 10 ? text : fallback;

    return NextResponse.json({
      imdbID,
      summary: finalSummary,
      reviewsUsed: items.length
    });
  } catch (err) {
    console.error("Gemini summary error:", err);
    const fallback = buildFallbackSummary(items);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Unexpected error from Gemini.",
        summary: fallback,
        reviewsUsed: items.length,
        source: "fallback"
      },
      { status: 200, headers: { "x-warning": "gemini-fallback" } }
    );
  }
}
