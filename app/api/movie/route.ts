import { NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

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

  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: "TMDB API key not configured on server." },
      { status: 500 }
    );
  }

  try {
    // Step 1: Resolve IMDb → TMDB ID
    const findRes = await fetch(
      `${TMDB_BASE}/find/${encodeURIComponent(
        imdbID
      )}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      { next: { revalidate: 300 } }
    );

    if (!findRes.ok) {
      throw new Error(`TMDB find failed with ${findRes.status}`);
    }

    const findJson = await findRes.json();
    const movieMatch = findJson.movie_results?.[0];
    const tvMatch = findJson.tv_results?.[0];
    const match = movieMatch || tvMatch;

    if (!match?.id) {
      return NextResponse.json(
        { error: "No TMDB match found for that IMDb ID." },
        { status: 404 }
      );
    }

    const isTv = Boolean(tvMatch);
    const detailsEndpoint = isTv ? "tv" : "movie";

    // Step 2: Fetch full details (including credits for cast/crew)
    const detailsRes = await fetch(
      `${TMDB_BASE}/${detailsEndpoint}/${match.id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits`,
      { next: { revalidate: 300 } }
    );

    if (!detailsRes.ok) {
      throw new Error(`TMDB details failed with ${detailsRes.status}`);
    }

    const details = await detailsRes.json();

    const credits = details.credits ?? {};
    const directors =
      credits.crew
        ?.filter((c: { job?: string }) => c.job === "Director")
        .map((c: { name?: string }) => c.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") || "";

    const writers =
      credits.crew
        ?.filter((c: { job?: string }) =>
          ["Writer", "Screenplay", "Story", "Author"].includes(c.job ?? "")
        )
        .map((c: { name?: string }) => c.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") || "";

    const cast =
      credits.cast
        ?.slice(0, 10)
        .map((c: { name?: string }) => c.name)
        .filter(Boolean)
        .join(", ") || "";

    return NextResponse.json({
      imdbID,
      title: details.title || details.name || "Unknown title",
      year:
        (details.release_date || details.first_air_date || "").slice(0, 4) ||
        "N/A",
      rated: details.adult ? "R" : "PG-13",
      runtime: details.runtime ? `${details.runtime} min` : "N/A",
      genre:
        details.genres?.map((g: { name: string }) => g.name).join(", ") || "N/A",
      director: directors || "Unknown",
      writer: writers || "Unknown",
      cast: cast || "N/A",
      plot: details.overview || "No plot summary available.",
      language: (details.original_language || "N/A").toUpperCase(),
      country:
        details.production_countries
          ?.map((c: { name: string }) => c.name)
          .join(", ") || "N/A",
      awards: "—",
      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : "N/A",
      imdbRating: details.vote_average
        ? Number(details.vote_average).toFixed(1)
        : "N/A",
      imdbVotes: details.vote_count
        ? Number(details.vote_count).toLocaleString("en-US")
        : "N/A",
      type: isTv ? "series" : "movie"
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
      { status: 500 }
    );
  }
}
