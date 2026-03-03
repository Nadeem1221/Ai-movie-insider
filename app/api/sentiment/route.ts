import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { analyzeSentiment } from "@/lib/sentiment";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imdbID = searchParams.get("imdbID");

  if (!imdbID) {
    return NextResponse.json(
      { error: "Missing imdbID parameter" },
      { status: 400 }
    );
  }

  if (!/^tt\d+$/.test(imdbID)) {
    return NextResponse.json(
      { error: "Invalid IMDb ID format. Expected like tt0133093." },
      { status: 400 }
    );
  }

  const reviewsUrl = `https://www.imdb.com/title/${encodeURIComponent(
    imdbID
  )}/reviews`;

  try {
    const res = await fetch(reviewsUrl, {
      headers: {
        // Basic header to look like a browser request
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      },
      cache: "no-store"
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch IMDb reviews." },
        { status: 502 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // IMDb may change DOM; this selector works for many pages but is not guaranteed.
    const texts: string[] = [];
    $(".review-container .text, .review-container .content .text").each(
      (_i, el) => {
        const t = $(el).text().trim();
        if (t && texts.length < 20) {
          texts.push(t);
        }
      }
    );

    const sentiment = analyzeSentiment(texts);

    return NextResponse.json({
      imdbID,
      sentiment,
      sampleReviews: texts.slice(0, 8)
    });
  } catch (err) {
    // Offline / timeout fallback for common demo titles.
    if (imdbID === "tt0133093") {
      const fallbackTexts = [
        "Mind-blowing sci-fi classic that still holds up. Bullet time is iconic.",
        "Great blend of philosophy and action, though some effects feel dated now.",
        "Keanu Reeves is perfect as Neo; the world-building is fantastic.",
        "Pacing dips in the middle, but the finale is incredible."
      ];
      const sentiment = analyzeSentiment(fallbackTexts);
      return NextResponse.json(
        { imdbID, sentiment, sampleReviews: fallbackTexts, source: "fallback" },
        { status: 200, headers: { "x-source": "fallback" } }
      );
    }

    console.error("Sentiment scrape error:", err);
    return NextResponse.json(
      { error: "Unexpected error while analyzing sentiment." },
      { status: 500 }
    );
  }
}
