// Undo/Redo History Store
//
// A command-pattern store: every dispatch appends a labeled snapshot to a
// history list rather than mutating state directly. Undo/redo just move a
// pointer through that list, and the history panel makes the pointer
// visible — click any past entry to time-travel straight to it. Dispatching
// a new command while the pointer sits behind the tip truncates the
// abandoned "future" branch, exactly like a real editor's undo stack.
//
// Usage:
//   const store = useHistoryStore<string[]>([]);
//   store.dispatch('Add "milk"', (list) => [...list, 'milk']);
//   store.undo(); store.redo(); store.jumpTo(0);
//
// Default export is a self-contained shopping-list demo.

import { useCallback, useState } from 'react';

interface HistoryEntry<T> {
  label: string;
  state: T;
}

export function useHistoryStore<T>(initial: T) {
  const [entries, setEntries] = useState<HistoryEntry<T>[]>([{ label: 'Initial state', state: initial }]);
  const [pointer, setPointer] = useState(0);

  const dispatch = useCallback(
    (label: string, updater: T | ((state: T) => T)) => {
      setEntries((prev) => {
        const current = prev[pointer].state;
        const nextState = typeof updater === 'function' ? (updater as (s: T) => T)(current) : updater;
        const truncated = prev.slice(0, pointer + 1);
        return [...truncated, { label, state: nextState }];
      });
      setPointer((p) => p + 1);
    },
    [pointer],
  );

  const canUndo = pointer > 0;
  const canRedo = pointer < entries.length - 1;
  const undo = useCallback(() => setPointer((p) => Math.max(0, p - 1)), []);
  const redo = useCallback(() => setPointer((p) => p + 1), []);
  const jumpTo = useCallback(
    (i: number) => setPointer(Math.max(0, Math.min(i, entries.length - 1))),
    [entries.length],
  );

  return { state: entries[pointer].state, entries, pointer, dispatch, undo, redo, jumpTo, canUndo, canRedo };
}

export default function Demo() {
  const store = useHistoryStore<string[]>([]);
  const [draft, setDraft] = useState('');

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    store.dispatch(`Add "${text}"`, (list) => [...list, text]);
    setDraft('');
  }

  function removeItem(item: string) {
    store.dispatch(`Remove "${item}"`, (list) => list.filter((i) => i !== item));
  }

  function clearAll() {
    store.dispatch('Clear all', () => []);
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', gap: 24, padding: 16 }}>
      <div style={{ width: 240 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <input
            aria-label="New item"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="New item…"
            style={{ flex: 1 }}
          />
          <button onClick={addItem}>Add</button>
        </div>

        <ul data-testid="item-list" style={{ listStyle: 'none', padding: 0, margin: 0, minHeight: 20 }}>
          {store.state.map((item) => (
            <li key={item} data-testid="item-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              {item}
              <button aria-label={`Remove ${item}`} onClick={() => removeItem(item)}>
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <button onClick={store.undo} disabled={!store.canUndo} data-testid="undo">
            ↶ Undo
          </button>
          <button onClick={store.redo} disabled={!store.canRedo} data-testid="redo">
            ↷ Redo
          </button>
          <button onClick={clearAll}>Clear all</button>
        </div>
      </div>

      <div style={{ width: 220 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>History</div>
        <ol data-testid="history-list" style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
          {store.entries.map((entry, i) => (
            <li key={i}>
              <button
                data-testid="history-entry"
                data-index={i}
                data-current={i === store.pointer}
                onClick={() => store.jumpTo(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: '2px 4px',
                  fontWeight: i === store.pointer ? 700 : 400,
                  textDecoration: i === store.pointer ? 'underline' : 'none',
                  color: i > store.pointer ? '#9ca3af' : 'inherit',
                }}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
