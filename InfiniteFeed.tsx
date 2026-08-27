// Infinite Scroll Feed
//
// An IntersectionObserver watches a sentinel element after the last item;
// when it enters the scroll container's viewport, the next page loads,
// with skeleton placeholders shown while it's in flight. Leaving the feed
// (the demo's "view details" toggle stands in for a route change) and
// coming back restores both the scroll position AND the loaded items —
// restoring scroll onto an empty, freshly-reset list wouldn't look like
// anything, so the loaded pages are cached alongside the scroll offset,
// keyed the same way a router's scroll-restoration cache would key it.
//
// Usage:
//   <InfiniteFeed />
//
// The observer callback reads current loading/done/page state through a
// ref rather than through the closure the effect was created with, so the
// observer only needs to be set up once instead of being torn down and
// recreated on every page load.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Item {
  id: number;
  title: string;
}

const PAGE_SIZE = 10;
const MAX_PAGES = 4;

async function fetchPage(page: number): Promise<Item[]> {
  await new Promise((r) => setTimeout(r, 350));
  return Array.from({ length: PAGE_SIZE }, (_, i) => {
    const id = page * PAGE_SIZE + i;
    return { id, title: `Item #${id}` };
  });
}

interface FeedCache {
  items: Item[];
  page: number;
  done: boolean;
  scrollTop: number;
}
let feedCache: FeedCache | null = null;

function Skeleton() {
  return (
    <div
      data-testid="skeleton"
      style={{ height: 40, background: '#1f2937', borderRadius: 4, marginBottom: 6, opacity: 0.6 }}
    />
  );
}

export function InfiniteFeed() {
  const [items, setItems] = useState<Item[]>(() => feedCache?.items ?? []);
  const [page, setPage] = useState(() => feedCache?.page ?? 0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(() => feedCache?.done ?? false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(feedCache?.scrollTop ?? 0);
  const stateRef = useRef({ loading, done, page, items });
  useEffect(() => {
    stateRef.current = { loading, done, page, items };
  });

  async function loadNextPage() {
    const { loading: isLoading, done: isDone, page: currentPage } = stateRef.current;
    if (isLoading || isDone) return;
    setLoading(true);
    const newItems = await fetchPage(currentPage);
    setItems((prev) => [...prev, ...newItems]);
    const nextPage = currentPage + 1;
    setPage(nextPage);
    setLoading(false);
    if (nextPage >= MAX_PAGES) setDone(true);
  }

  // Restore scroll position synchronously before paint, so there's no
  // visible jump from "top" to "restored position".
  useLayoutEffect(() => {
    if (containerRef.current && feedCache) {
      containerRef.current.scrollTop = feedCache.scrollTop;
    }
  }, []);

  useEffect(() => {
    if (items.length === 0 && !feedCache) void loadNextPage();
    // Cache current state on unmount so returning to the feed restores it.
    // Read everything through refs, not the closed-over state variables
    // above -- this cleanup closure is created once, at mount, so `items`
    // itself would still be the FIRST render's value (usually []) by the
    // time the component actually unmounts, well after pages have loaded.
    // scrollTop specifically MUST come from scrollTopRef, not
    // containerRef.current.scrollTop: React detaches DOM refs synchronously
    // during commit, before passive-effect cleanups run, so by the time
    // this runs containerRef.current is already null.
    return () => {
      feedCache = {
        items: stateRef.current.items,
        page: stateRef.current.page,
        done: stateRef.current.done,
        scrollTop: scrollTopRef.current,
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadNextPage();
      },
      { root, rootMargin: '80px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="feed-container"
      onScroll={() => {
        if (containerRef.current) scrollTopRef.current = containerRef.current.scrollTop;
      }}
      style={{ height: 260, overflowY: 'auto', border: '1px solid #333', padding: 8, fontFamily: 'system-ui, sans-serif' }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          data-testid="feed-item"
          data-id={item.id}
          style={{ padding: '10px 12px', marginBottom: 6, background: '#161b22', borderRadius: 4, fontSize: 13 }}
        >
          {item.title}
        </div>
      ))}
      {loading && (
        <>
          <Skeleton />
          <Skeleton />
        </>
      )}
      {done && (
        <div data-testid="end-of-feed" style={{ textAlign: 'center', fontSize: 12, opacity: 0.6, padding: 12 }}>
          You've reached the end.
        </div>
      )}
      {!done && <div ref={sentinelRef} data-testid="sentinel" style={{ height: 1 }} />}
    </div>
  );
}

export default function Demo() {
  const [showFeed, setShowFeed] = useState(true);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, width: 320 }}>
      <button data-testid="toggle-view" onClick={() => setShowFeed((v) => !v)} style={{ marginBottom: 8 }}>
        {showFeed ? 'View details (leave feed)' : 'Back to feed'}
      </button>
      {showFeed ? <InfiniteFeed /> : <div data-testid="details-view">Item detail placeholder.</div>}
    </div>
  );
}
