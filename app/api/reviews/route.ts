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

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY missing on server" }, { status: 500 });
  }

  try {
    const findRes = await fetch(
      `${TMDB_BASE}/find/${encodeURIComponent(imdbID)}?api_key=${apiKey}&external_source=imdb_id`,
      { next: { revalidate: 60 } }
    );
    if (!findRes.ok) throw new Error("Failed to resolve TMDB ID");
    const findJson = await findRes.json();
    const tmdbId = findJson?.movie_results?.[0]?.id;
    if (!tmdbId) throw new Error("No TMDB match for that IMDb ID");

    const reviewsRes = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}/reviews?api_key=${apiKey}&language=en-US&page=1`,
      { next: { revalidate: 60 } }
    );
    if (!reviewsRes.ok) throw new Error("Failed to fetch reviews");
    const reviewsJson = await reviewsRes.json();

    const reviews = (reviewsJson.results as TMDBReview[] | undefined ?? []).slice(0, 6).map((r) => ({
      id: r.id,
      author: r.author,
      role: r.author_details?.username ? "Verified User" : "Contributor",
      avatar:
        r.author_details?.avatar_path
          ? `https://image.tmdb.org/t/p/w185${r.author_details.avatar_path}`
          : "https://i.pravatar.cc/80?u=" + r.author,
      rating: r.author_details?.rating ?? null,
      content: r.content,
      date: r.updated_at || r.created_at,
      phrases: extractKeyPhrases(r.content || "", 3)
    }));

    return NextResponse.json({ tmdbId, reviews });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
