// Drag-and-Drop Kanban Board
//
// Pointer-events drag (not the native HTML5 DnD API — it doesn't fire
// synthetic events cleanly and is a pain to test), with a placeholder gap
// showing where the card will land, drop targets between cards and at
// column ends, and cross-column moves. Board state is written to
// localStorage on every change and read back on mount, so the layout
// survives a reload instead of resetting to the seed data.
//
// Usage:
//   <KanbanBoard />
//
// Default export is the same component — this one has no meaningful props
// to seed from outside, so there's no separate Demo wrapper.

import { useEffect, useRef, useState } from 'react';

interface Card {
  id: string;
  columnId: string;
  text: string;
}

interface Column {
  id: string;
  title: string;
}

const COLUMNS: Column[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

const INITIAL_CARDS: Card[] = [
  { id: 'c1', columnId: 'todo', text: 'Design the API' },
  { id: 'c2', columnId: 'todo', text: 'Write migration script' },
  { id: 'c3', columnId: 'doing', text: 'Build the login form' },
  { id: 'c4', columnId: 'doing', text: 'Set up CI' },
  { id: 'c5', columnId: 'done', text: 'Pick a project name' },
];

interface DropTarget {
  columnId: string;
  beforeCardId: string | null; // null = end of column
}

const STORAGE_KEY = 'kanban-board-cards';

function loadCards(): Card[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Card[]) : INITIAL_CARDS;
  } catch {
    return INITIAL_CARDS;
  }
}

export default function KanbanBoard() {
  const [cards, setCards] = useState<Card[]>(loadCards);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch {
      // ignore (private mode, quota, etc.)
    }
  }, [cards]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const columnRefs = useRef(new Map<string, HTMLDivElement>());
  const dragOffset = useRef({ x: 0, y: 0 });

  function cardsFor(columnId: string) {
    return cards.filter((c) => c.columnId === columnId);
  }

  function startDrag(e: React.PointerEvent, card: Card) {
    if (e.button !== 0) return;
    const el = cardRefs.current.get(card.id);
    const rect = el?.getBoundingClientRect();
    dragOffset.current = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
    setDragId(card.id);
    setGhostPos({ x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragId) return;
    setGhostPos({ x: e.clientX, y: e.clientY });

    let hoveredColumn: string | null = null;
    for (const [colId, el] of columnRefs.current) {
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        hoveredColumn = colId;
        break;
      }
    }
    if (!hoveredColumn) {
      setDropTarget(null);
      return;
    }

    const siblings = cardsFor(hoveredColumn).filter((c) => c.id !== dragId);
    let beforeCardId: string | null = null;
    for (const sib of siblings) {
      const el = cardRefs.current.get(sib.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const midpoint = r.top + r.height / 2;
      if (e.clientY < midpoint) {
        beforeCardId = sib.id;
        break;
      }
    }
    setDropTarget({ columnId: hoveredColumn, beforeCardId });
  }

  function endDrag() {
    if (dragId && dropTarget) {
      setCards((prev) => {
        const dragged = prev.find((c) => c.id === dragId);
        if (!dragged) return prev;
        const withoutDragged = prev.filter((c) => c.id !== dragId);
        const moved: Card = { ...dragged, columnId: dropTarget.columnId };
        if (dropTarget.beforeCardId === null) {
          // Insert after the last card currently in that column.
          let insertAt = withoutDragged.length;
          for (let i = withoutDragged.length - 1; i >= 0; i--) {
            if (withoutDragged[i].columnId === dropTarget.columnId) {
              insertAt = i + 1;
              break;
            }
          }
          return [...withoutDragged.slice(0, insertAt), moved, ...withoutDragged.slice(insertAt)];
        }
        const insertAt = withoutDragged.findIndex((c) => c.id === dropTarget.beforeCardId);
        return [...withoutDragged.slice(0, insertAt), moved, ...withoutDragged.slice(insertAt)];
      });
    }
    setDragId(null);
    setGhostPos(null);
    setDropTarget(null);
  }

  const draggedCard = cards.find((c) => c.id === dragId);

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', gap: 12, padding: 16, userSelect: dragId ? 'none' : 'auto' }}
    >
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          data-testid="column"
          data-column-id={col.id}
          ref={(el) => {
            if (el) columnRefs.current.set(col.id, el);
            else columnRefs.current.delete(col.id);
          }}
          style={{
            width: 200,
            minHeight: 300,
            background: dropTarget?.columnId === col.id ? '#1e2937' : '#161b22',
            border: '1px solid #333',
            borderRadius: 6,
            padding: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, opacity: 0.8 }}>
            {col.title} ({cardsFor(col.id).length})
          </div>
          {cardsFor(col.id).map((card) => (
            <div key={card.id}>
              {dropTarget?.columnId === col.id && dropTarget.beforeCardId === card.id && (
                <div data-testid="drop-indicator" style={{ height: 4, background: '#3b82f6', borderRadius: 2, marginBottom: 4 }} />
              )}
              <div
                data-testid="card"
                data-card-id={card.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(card.id, el);
                  else cardRefs.current.delete(card.id);
                }}
                onPointerDown={(e) => startDrag(e, card)}
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: 4,
                  padding: '8px 10px',
                  marginBottom: 6,
                  fontSize: 13,
                  cursor: 'grab',
                  opacity: dragId === card.id ? 0.3 : 1,
                  touchAction: 'none',
                }}
              >
                {card.text}
              </div>
            </div>
          ))}
          {dropTarget?.columnId === col.id && dropTarget.beforeCardId === null && (
            <div data-testid="drop-indicator" style={{ height: 4, background: '#3b82f6', borderRadius: 2 }} />
          )}
        </div>
      ))}

      {draggedCard && ghostPos && (
        <div
          data-testid="drag-ghost"
          style={{
            position: 'fixed',
            left: ghostPos.x - dragOffset.current.x,
            top: ghostPos.y - dragOffset.current.y,
            width: 184,
            background: '#21262d',
            border: '1px solid #3b82f6',
            borderRadius: 4,
            padding: '8px 10px',
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {draggedCard.text}
        </div>
      )}
    </div>
  );
}
