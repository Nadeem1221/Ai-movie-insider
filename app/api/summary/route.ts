import { NextResponse } from "next/server";

type Review = {
  rating: number | null;
  content: string;
  phrases?: string[];
};

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GOOGLE_GEMINI_MODEL?.trim();
const GEMINI_VERSION = process.env.GOOGLE_GEMINI_VERSION?.trim() || "v1beta";
const GEMINI_ENDPOINT =
  GEMINI_MODEL && GEMINI_MODEL.length
    ? `https://generativelanguage.googleapis.com/${GEMINI_VERSION}/models/${GEMINI_MODEL}:generateContent`
    : null;

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
    let items = Array.isArray(reviews) ? reviews.slice(0, 8) : [];
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
    const text =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return NextResponse.json({
      imdbID,
      summary: text || "No summary was returned.",
      reviewsUsed: items.length
    });
  } catch (err) {
    console.error("Gemini summary error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Unexpected error from Gemini."
      },
      { status: 500 }
    );
  }
}
