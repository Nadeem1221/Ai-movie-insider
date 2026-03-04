import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

type TMDBReview = {
  id: string;
  author: string;
  author_details?: {
    username?: string;
    avatar_path?: string;
    rating?: number | null;
  };
  content: string;
  updated_at?: string;
  created_at?: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 15000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

const stopWords = new Set([
  "the","a","an","and","or","but","if","to","of","in","on","for","with","at","by",
  "from","up","down","out","over","under","again","further","then","once","here",
  "there","all","any","both","each","few","more","most","other","some","such",
  "no","nor","not","only","own","same","so","than","too","very","can","will",
  "just","don","should","now","is","am","are","was","were","be","been","being",
  "this","that","these","those","it","its","as"
]);

function extractKeyPhrases(text: string, max = 3): string[] {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  const counts: Record<string, number> = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

export async function GET(req: NextRequest) {
  const imdbID = req.nextUrl.searchParams.get("imdbID");

  if (!imdbID) {
    return NextResponse.json({ error: "Missing imdbID" }, { status: 400 });
  }

  const imdbIdPattern = /^tt\d{7,}$/;
  if (!imdbIdPattern.test(imdbID)) {
    return NextResponse.json(
      { error: "Invalid imdbID format. Expected pattern tt followed by digits." },
      { status: 400 }
    );
  }

  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY missing on server" },
      { status: 500 }
    );
  }

  try {
    // Get TMDB ID from IMDb ID
    const findRes = await fetchWithTimeout(
      `${TMDB_BASE}/find/${encodeURIComponent(imdbID)}?api_key=${apiKey}&external_source=imdb_id`,
      { next: { revalidate: 60 }, timeoutMs: 8000 }
    );

    if (!findRes.ok) throw new Error("Failed to resolve TMDB ID");

    const findJson = await findRes.json();
    const tmdbId = findJson?.movie_results?.[0]?.id;

    if (!tmdbId) throw new Error("No TMDB match for that IMDb ID");

    // Fetch multiple pages of reviews
    const allReviews: TMDBReview[] = [];

    for (let page = 1; page <= 3; page++) {
      const reviewsRes = await fetchWithTimeout(
        `${TMDB_BASE}/movie/${tmdbId}/reviews?api_key=${apiKey}&language=en-US&page=${page}`,
        { next: { revalidate: 60 }, timeoutMs: 8000 }
      );

      if (!reviewsRes.ok) break;

      const reviewsJson = await reviewsRes.json();
      const pageReviews = reviewsJson.results as TMDBReview[];

      if (!pageReviews || pageReviews.length === 0) break;

      allReviews.push(...pageReviews);

      if (allReviews.length >= 10) break;
    }

    let reviews = allReviews.slice(0, 10).map((r) => ({
      id: r.id,
      author: r.author,
      role: r.author_details?.username ? "Verified User" : "Contributor",
      avatar: r.author_details?.avatar_path
        ? `https://image.tmdb.org/t/p/w185${r.author_details.avatar_path}`
        : "https://i.pravatar.cc/80?u=" + r.author,
      rating: r.author_details?.rating ?? null,
      content: r.content,
      date: r.updated_at || r.created_at,
      phrases: extractKeyPhrases(r.content || "", 3)
    }));

    // Fallback if no reviews exist
    if (reviews.length === 0) {
      reviews = [
        {
          id: "fallback-review",
          author: "Audience",
          role: "Movie Viewer",
          avatar: "https://i.pravatar.cc/80",
          rating: null,
          content:
            "No user reviews are available for this movie yet. Be the first to share your thoughts about it!",
          date: "",
          phrases: []
        }
      ];
    }

    return NextResponse.json({ tmdbId, reviews });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json(
      { tmdbId: null, reviews: [], warning: message },
      { status: 200, headers: { "x-warning": message } }
    );
  }
}