"use client";

import { useState, useCallback } from "react";

type SearchItem = {
  id: string;
  label: string;
  authors: string[];
  title: string;
  description: string | null;
  publishedDate: string | null;
};

type SearchResult = {
  items: SearchItem[];
  totalItems: number;
  mostCommonAuthor: string | null;
  earliestPublicationYear: number | null;
  latestPublicationYear: number | null;
  responseTimeMs: number;
};

const NO_DESCRIPTION = "No description available for this book.";

export default function Home() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [prefetched, setPrefetched] = useState<{
    query: string;
    page: number;
    data: SearchResult;
  } | null>(null);

  const search = useCallback(
    async (q: string, p: number) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      setPrefetched(null);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q.trim())}&page=${p}`
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Search failed");
          setData(null);
          return;
        }
        setData(json);
        setExpandedId(null);
        const totalPages = Math.max(1, Math.ceil((json.totalItems ?? 0) / 10));
        if (p < totalPages) {
          prefetchPage(q.trim(), p + 1);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const prefetchPage = useCallback(async (q: string, p: number) => {
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&page=${p}`
      );
      const json = await res.json();
      if (res.ok && json.items) {
        setPrefetched({ query: q, page: p, data: json });
      }
    } catch {
      // ignore prefetch errors
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setPrefetched(null);
    search(query, 1);
  };

  const goToPage = useCallback(
    (nextPage: number) => {
      const q = query.trim();
      if (prefetched && prefetched.query === q && prefetched.page === nextPage) {
        setData(prefetched.data);
        setPage(nextPage);
        setExpandedId(null);
        setPrefetched(null);
        const totalPages = Math.max(
          1,
          Math.ceil(prefetched.data.totalItems / 10)
        );
        if (nextPage < totalPages) {
          prefetchPage(q, nextPage + 1);
        }
      } else {
        setPage(nextPage);
        search(query, nextPage);
      }
    },
    [query, prefetched, search, prefetchPage]
  );

  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalItems / 10))
    : 0;
  const hasResults = data && data.items.length > 0;
  const pagination =
    totalPages > 1 ? (
      <nav
        className="mt-6 flex items-center justify-center gap-2"
        aria-label="Pagination"
      >
        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1 || loading}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-50 hover:bg-stone-50"
        >
          Previous
        </button>
        <span className="px-3 text-sm text-stone-600">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages || loading}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-50 hover:bg-stone-50"
        >
          Next
        </button>
      </nav>
    ) : null;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight">
          Google Books Search
        </h1>

        <form onSubmit={handleSubmit} className="mb-8 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books..."
            className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-black placeholder-stone-500 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
            aria-label="Search query"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-amber-600 px-5 py-2.5 font-medium text-black transition-colors hover:bg-amber-700 disabled:opacity-60"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-red-100 px-4 py-3 text-red-800">
            {error}
          </p>
        )}

        {data && (
          <>
            <section
              className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
              aria-label="Search summary"
            >
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
                Summary
              </h2>
              <ul className="grid gap-2 text-sm">
                <li>
                  <span className="font-medium text-stone-700">
                    Total results:
                  </span>{" "}
                  {data.totalItems.toLocaleString()}
                </li>
                <li>
                  <span className="font-medium text-stone-700">
                    Most common author:
                  </span>{" "}
                  {data.mostCommonAuthor ?? "—"}
                </li>
                <li>
                  <span className="font-medium text-stone-700">
                    Publication years:
                  </span>{" "}
                  {data.earliestPublicationYear != null &&
                  data.latestPublicationYear != null
                    ? `${data.earliestPublicationYear} – ${data.latestPublicationYear}`
                    : "—"}
                </li>
                <li>
                  <span className="font-medium text-stone-700">
                    Server response time:
                  </span>{" "}
                  {data.responseTimeMs} ms
                </li>
              </ul>
            </section>

            {hasResults ? (
              <>
                {pagination}
                <ul className="space-y-1" role="list">
                  {data.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-stone-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((id) => (id === item.id ? null : item.id))
                        }
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-stone-50"
                        aria-expanded={expandedId === item.id}
                        aria-controls={`desc-${item.id}`}
                        id={`result-${item.id}`}
                      >
                        <span className="font-medium text-stone-900">
                          {item.label}
                        </span>
                        <span
                          className="shrink-0 text-stone-400"
                          aria-hidden
                        >
                          {expandedId === item.id ? "−" : "+"}
                        </span>
                      </button>
                      <div
                        id={`desc-${item.id}`}
                        role="region"
                        aria-labelledby={`result-${item.id}`}
                        className={
                          expandedId === item.id
                            ? "border-t border-stone-200 px-4 py-3"
                            : "hidden"
                        }
                      >
                        <p className="text-sm text-stone-600">
                          {item.description?.trim()
                            ? item.description
                            : NO_DESCRIPTION}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {pagination}
              </>
            ) : (
              <p className="rounded-lg border border-stone-200 bg-white px-4 py-6 text-center text-stone-500">
                No results. Try another search.
              </p>
            )}
          </>
        )}

        {!data && !loading && !error && (
          <p className="text-center text-stone-500">
            Enter a search term and click Search.
          </p>
        )}
      </main>
    </div>
  );
}
