import { useCallback, useEffect, useRef, useState } from "react";

export const PAGE_SIZE = 10;

// Offset pagination against an endpoint answering { items, page, pageCount, total, exact }.
// Twilio's own API is cursor-based and reports no total, so the server keeps a cached
// window of history and pages out of it — that's what lets the picker list every page up
// front instead of revealing them one step at a time.
//
// `resetKey` is whatever the feed is scoped by — the active line. When it changes the
// page snaps back to 1, because page 7 of the old line means nothing on the new one.
export function usePaged(fetchPage, { pageSize = PAGE_SIZE, resetKey } = {}) {
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState(resetKey);
  const [nonce, setNonce] = useState(0);
  const [items, setItems] = useState([]);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [exact, setExact] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fresh = useRef(false); // set by reload()/reset() — bypasses the server's cache

  // Adjusted during render rather than in an effect: by the time the fetch below runs,
  // the page is already 1, so switching line costs one request instead of two.
  if (scope !== resetKey) {
    setScope(resetKey);
    setPage(1);
  }

  const run = useCallback(() => {
    let stale = false;
    const bypass = fresh.current;
    fresh.current = false;
    setLoading(true);
    fetchPage({ page, pageSize, fresh: bypass })
      .then((res) => {
        if (stale) return;
        setItems(res.items || []);
        setPageCount(Math.max(1, res.pageCount || 1));
        setTotal(res.total || 0);
        setExact(res.exact !== false);
        setError(null);
        // The server clamps an out-of-range page; follow it so the picker agrees.
        if (res.page && res.page !== page) setPage(res.page);
      })
      .catch((e) => {
        if (!stale) setError(e.message || "Could not load.");
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    // A page change mid-flight must not be overwritten by the older response.
    return () => {
      stale = true;
    };
  }, [fetchPage, pageSize, page, nonce]);

  useEffect(run, [run]);

  return {
    items,
    loading,
    error,
    page,
    pageCount,
    total,
    exact,
    hasPrev: page > 1,
    hasNext: page < pageCount,
    goto: (p) => setPage(Math.min(Math.max(1, p), pageCount)),
    prev: () => setPage((p) => Math.max(1, p - 1)),
    next: () => setPage((p) => Math.min(pageCount, p + 1)),
    reload: () => {
      fresh.current = true;
      setNonce((n) => n + 1);
    },
    // Back to page 1 with a forced refetch — for when we've just added a row.
    reset: () => {
      fresh.current = true;
      setPage(1);
      setNonce((n) => n + 1);
    },
  };
}
