// Virtualized Table Renderer
//
// Windows a 100k-row dataset down to only the rows near the viewport, using
// a fixed row height so each row's position is a direct multiply (no
// measuring pass needed). A sticky header stays put while the body scrolls,
// and full keyboard navigation (arrows, PageUp/Down, Home/End) moves a
// focused row and scrolls it into view even when it isn't currently
// rendered.
//
// Usage:
//   <VirtualizedTable rows={data} rowHeight={28} height={400} />
//
// Default export seeds 100,000 synthetic rows for the demo.

import { useMemo, useRef, useState } from 'react';

export interface Row {
  id: number;
  name: string;
  value: number;
}

const OVERSCAN = 6;

export function VirtualizedTable({
  rows,
  rowHeight = 28,
  height = 400,
}: {
  rows: Row[];
  rowHeight?: number;
  height?: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleCount = Math.ceil(height / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endIndex = Math.min(rows.length, startIndex + visibleCount + OVERSCAN * 2);

  const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

  function scrollIndexIntoView(index: number) {
    const el = containerRef.current;
    if (!el) return;
    const rowTop = index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (rowTop < el.scrollTop) {
      el.scrollTop = rowTop;
    } else if (rowBottom > el.scrollTop + height) {
      el.scrollTop = rowBottom - height;
    }
  }

  function moveTo(index: number) {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    setActiveIndex(clamped);
    scrollIndexIntoView(clamped);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveTo(activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveTo(activeIndex - 1);
        break;
      case 'PageDown':
        e.preventDefault();
        moveTo(activeIndex + visibleCount);
        break;
      case 'PageUp':
        e.preventDefault();
        moveTo(activeIndex - visibleCount);
        break;
      case 'Home':
        e.preventDefault();
        moveTo(0);
        break;
      case 'End':
        e.preventDefault();
        moveTo(rows.length - 1);
        break;
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={rows.length}
        data-testid="table-container"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onKeyDown}
        style={{ height, overflowY: 'auto', border: '1px solid #333', outline: 'none' }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', background: '#161b22', borderBottom: '1px solid #333' }}>
          <div style={{ width: 80, padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>ID</div>
          <div style={{ flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>Name</div>
          <div style={{ width: 100, padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>Value</div>
        </div>

        <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
          {visibleRows.map((row, i) => {
            const index = startIndex + i;
            return (
              <div
                key={row.id}
                data-testid="row"
                data-index={index}
                data-active={index === activeIndex}
                onClick={() => setActiveIndex(index)}
                style={{
                  position: 'absolute',
                  top: index * rowHeight,
                  left: 0,
                  right: 0,
                  height: rowHeight,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 13,
                  background: index === activeIndex ? '#1e3a5f' : index % 2 === 0 ? '#0d1117' : '#0a0e13',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 80, padding: '0 8px' }}>{row.id}</div>
                <div style={{ flex: 1, padding: '0 8px' }}>{row.name}</div>
                <div style={{ width: 100, padding: '0 8px' }}>{row.value}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div data-testid="render-stats" style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
        Rendering {visibleRows.length} of {rows.length.toLocaleString()} rows (indices {startIndex}–{endIndex - 1})
      </div>
    </div>
  );
}

function generateRows(count: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: i, name: `Row ${i}`, value: Math.floor(Math.sin(i) * 1000) });
  }
  return rows;
}

export default function Demo() {
  const rows = useMemo(() => generateRows(100_000), []);
  return <VirtualizedTable rows={rows} rowHeight={28} height={400} />;
}
