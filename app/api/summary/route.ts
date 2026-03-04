import { NextResponse } from "next/server";

type Review = {
  rating: number | null;
  content: string;
  phrases?: string[];
};

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GOOGLE_GEMINI_MODEL ;
const GEMINI_VERSION = "v1beta" ;

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/${GEMINI_VERSION}/models/${GEMINI_MODEL}:generateContent`;

console.log("MODEL:", GEMINI_MODEL);
console.log("ENDPOINT:", GEMINI_ENDPOINT);

function buildFallbackSummary(items: Review[]): string {
  if (!items.length) {
    return "No audience reviews available to generate an AI summary.";
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

  const snippets = items
    .map((r) => String(r.content || "").trim())
    .filter((t) => t.length > 0);

  const snippet = snippets[0]?.slice(0, 180) || "";

  return `Audience sentiment appears ${tone}${
    avgRating ? ` (average rating ~${avgRating}/10)` : ""
  }. Example comment: "${snippet}${snippet.length >= 180 ? "..." : ""}"`;
}

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_GEMINI_API_KEY not configured." },
      { status: 500 }
    );
  }

  let items: Review[] = [];

  try {
    const body = await req.json().catch(() => ({}));
    const { imdbID, reviews } = body as {
      imdbID?: string;
      reviews?: Review[];
    };

    if (!imdbID) {
      return NextResponse.json(
        { error: "Missing imdbID in request." },
        { status: 400 }
      );
    }

    // Use provided reviews
    items = Array.isArray(reviews) ? reviews.slice(0, 8) : [];

    // If no reviews, fetch them
    if (!items.length) {
      try {
        const origin = new URL(req.url).origin;

        const revRes = await fetch(
          `${origin}/api/reviews?imdbID=${encodeURIComponent(imdbID)}`,
          { cache: "no-store" }
        );

        if (revRes.ok) {
          const revJson = await revRes.json();
          const fetched = Array.isArray(revJson.reviews)
            ? revJson.reviews
            : [];
          items = fetched.slice(0, 8);
        }
      } catch (err) {
        console.error("Could not fetch reviews:", err);
      }
    }

    const reviewText =
      items.length > 0
        ? items
            .map(
              (r, i) =>
                `${i + 1}. Rating: ${
                  r.rating ?? "N/A"
                } | Review: ${String(r.content).slice(0, 300)}`
            )
            .join("\n")
        : "No reviews available.";

    const prompt = `
You are an AI movie critic.

Analyze the following audience reviews and generate a short summary.

Rules:
- Write exactly 3 bullet points
- Mention overall audience sentiment
- Mention common praise or complaints
- Mention recurring themes or keywords
- Avoid spoilers

Movie IMDb ID: ${imdbID}

Reviews:
${reviewText}
`;

    console.log("Sending reviews to Gemini:", items.length);

    const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(
        `Gemini API error ${geminiRes.status}: ${errText.slice(0, 300)}`
      );
    }

    const data = await geminiRes.json();

    console.log("Gemini response:", JSON.stringify(data, null, 2));

    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || "";

    const fallback = buildFallbackSummary(items);

    const finalSummary = aiText.length > 10 ? aiText : fallback;

    return NextResponse.json({
      imdbID,
      summary: finalSummary,
      reviewsUsed: items.length,
      source: aiText ? "gemini" : "fallback",
    });
  } catch (error) {
    console.error("AI summary error:", error);

    const fallback = buildFallbackSummary(items);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected AI error",
        summary: fallback,
        reviewsUsed: items.length,
        source: "fallback",
      },
      { status: 200 }
    );
  }
}