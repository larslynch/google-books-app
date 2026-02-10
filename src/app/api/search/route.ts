import { NextRequest, NextResponse } from "next/server";

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const RESULTS_PER_PAGE = 10;

/** Builds the full Google Books API URL, optionally adding API key from env */
function buildBooksUrl(params: URLSearchParams): string {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (key) params.set("key", key);
  return `${GOOGLE_BOOKS_API}?${params}`;
}
/** Cap on items fetched when computing author/date stats (avoids excessive API calls) */
const MAX_RESULTS_FOR_STATS = 200;

type VolumeInfo = {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  description?: string;
  [key: string]: unknown;
};

type VolumeItem = {
  id: string;
  volumeInfo?: VolumeInfo;
};

type GoogleBooksResponse = {
  totalItems: number;
  items?: VolumeItem[];
};

/** Extracts the 4-digit year from a date string (e.g. "2020-01-15" → 2020) */
function parseYear(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

/** Joins author names or returns "Unknown author" if none */
function formatAuthors(authors: string[] | undefined): string {
  if (!authors?.length) return "Unknown author";
  return authors.join(", ");
}

/** Builds display label: "Author1, Author2 - Title" */
function formatResultLabel(item: VolumeItem): string {
  const authors = item.volumeInfo?.authors;
  const title = item.volumeInfo?.title ?? "Untitled";
  const authorStr = formatAuthors(authors);
  return `${authorStr} - ${title}`;
}

/** GET /api/search?q=...&page=... — Proxies to Google Books API and returns formatted results with stats */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  // Parse query and page; default page to 1
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  if (!q) {
    return NextResponse.json(
      { error: "Missing search query (q)" },
      { status: 400 }
    );
  }

  const startIndex = (page - 1) * RESULTS_PER_PAGE;
  // Build params for the Google Books volumes API
  const params = new URLSearchParams({
    q,
    maxResults: String(RESULTS_PER_PAGE),
    startIndex: String(startIndex),
  });

  try {
    const res = await fetch(buildBooksUrl(params));
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Google Books API error: ${res.status}`, details: text },
        { status: 502 }
      );
    }

    const data: GoogleBooksResponse = await res.json();
    const totalItems = data.totalItems ?? 0;
    const items = data.items ?? [];

    // Map API response to our SearchItem shape
    const formattedItems = items.map((item) => ({
      id: item.id,
      label: formatResultLabel(item),
      authors: item.volumeInfo?.authors ?? [],
      title: item.volumeInfo?.title ?? "Untitled",
      description: item.volumeInfo?.description ?? null,
      publishedDate: item.volumeInfo?.publishedDate ?? null,
    }));

    // Compute aggregate stats: most common author, earliest/latest publication year
    const authorCounts = new Map<string, number>();
    let earliestYear: number | null = null;
    let latestYear: number | null = null;

    /** Fetches a chunk of results for stats computation */
    const fetchChunk = async (start: number, maxResults: number) => {
      const p = new URLSearchParams({ q, maxResults: String(maxResults), startIndex: String(start) });
      const r = await fetch(buildBooksUrl(p));
      if (!r.ok) return { items: [] };
      const d: GoogleBooksResponse = await r.json();
      return { items: d.items ?? [] };
    };

    const toFetch = Math.min(totalItems, MAX_RESULTS_FOR_STATS);
    let fetched = 0;
    const chunkSize = 40;

    while (fetched < toFetch) {
      const chunk = await fetchChunk(fetched, chunkSize);
      const chunkItems = chunk.items;
      if (chunkItems.length === 0) break;

      for (const item of chunkItems) {
        const authors = item.volumeInfo?.authors ?? [];
        for (const a of authors) {
          authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1);
        }
        const y = parseYear(item.volumeInfo?.publishedDate);
        if (y != null) {
          earliestYear = earliestYear == null ? y : Math.min(earliestYear, y);
          latestYear = latestYear == null ? y : Math.max(latestYear, y);
        }
      }
      fetched += chunkItems.length;
      if (chunkItems.length < chunkSize) break;
    }

    // Find author with highest count across all fetched chunks
    let mostCommonAuthor: string | null = null;
    let maxCount = 0;
    for (const [author, count] of authorCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonAuthor = author;
      }
    }

    const responseTimeMs = Date.now() - startTime;

    return NextResponse.json({
      items: formattedItems,
      totalItems,
      mostCommonAuthor,
      earliestPublicationYear: earliestYear,
      latestPublicationYear: latestYear,
      responseTimeMs,
    });
  } catch (err) {
    const responseTimeMs = Date.now() - startTime;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Search failed",
        responseTimeMs,
      },
      { status: 500 }
    );
  }
}
