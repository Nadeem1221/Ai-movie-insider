import { NextResponse } from "next/server";

const OMDB_API_KEY = process.env.OMDB_API_KEY;

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

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

  if (!OMDB_API_KEY) {
    return NextResponse.json(
      { error: "OMDB API key not configured on server." },
      { status: 500 }
    );
  }

  try {
    const res = await fetchWithTimeout(
      `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(
        imdbID
      )}&plot=short`,
      { timeoutMs: 8000 }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `OMDb request failed with status ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.Response === "False") {
      return NextResponse.json(
        { error: data.Error ?? "Movie not found for given IMDb ID." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      imdbID,
      title: data.Title,
      year: data.Year,
      rated: data.Rated,
      runtime: data.Runtime,
      genre: data.Genre,
      director: data.Director,
      writer: data.Writer,
      cast: data.Actors,
      plot: data.Plot,
      language: data.Language,
      country: data.Country,
      awards: data.Awards,
      poster: data.Poster,
      imdbRating: data.imdbRating,
      imdbVotes: data.imdbVotes,
      type: data.Type
    });
  } catch (err) {
    console.error("Movie lookup error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unexpected server error while fetching movie metadata."
      },
      { status: 502 }
    );
  }
}
