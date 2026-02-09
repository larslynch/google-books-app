import { NextRequest, NextResponse } from "next/server";

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const RESULTS_PER_PAGE = 10;

function buildBooksUrl(params: URLSearchParams): string {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (key) params.set("key", key);
  return `${GOOGLE_BOOKS_API}?${params}`;
}
const MAX_RESULTS_FOR_STATS = 200; // cap how many we fetch to compute author/date stats

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

function parseYear(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function formatAuthors(authors: string[] | undefined): string {
  if (!authors?.length) return "Unknown author";
  return authors.join(", ");
}

function formatResultLabel(item: VolumeItem): string {
  const authors = item.volumeInfo?.authors;
  const title = item.volumeInfo?.title ?? "Untitled";
  const authorStr = formatAuthors(authors);
  return `${authorStr} - ${title}`;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  if (!q) {
    return NextResponse.json(
      { error: "Missing search query (q)" },
      { status: 400 }
    );
  }

  const startIndex = (page - 1) * RESULTS_PER_PAGE;
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

    const formattedItems = items.map((item) => ({
      id: item.id,
      label: formatResultLabel(item),
      authors: item.volumeInfo?.authors ?? [],
      title: item.volumeInfo?.title ?? "Untitled",
      description: item.volumeInfo?.description ?? null,
      publishedDate: item.volumeInfo?.publishedDate ?? null,
    }));

    // Compute stats over the full result set (cap at MAX_RESULTS_FOR_STATS)
    const authorCounts = new Map<string, number>();
    let earliestYear: number | null = null;
    let latestYear: number | null = null;

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
