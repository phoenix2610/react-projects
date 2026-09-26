// Optimistic Todo Sync
//
// Every mutation (add, toggle, delete) applies to local state immediately,
// before the "network" call resolves — the todo shows a pending spinner
// dot rather than waiting for a round trip. If the call rejects, the exact
// pre-mutation state is restored (a deleted item reappears in its original
// position, a toggle flips back) and an error banner names what failed.
//
// Usage:
//   <OptimisticTodos api={myRealApi} />
//
// Default export wires up a fake in-memory API with a "simulate failures"
// switch so the rollback path is demonstrable without a real backend.

import { useState } from 'react';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface TodosApi {
  addTodo: (text: string) => Promise<Todo>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

function createFakeApi(): TodosApi & { shouldFail: boolean; delay: number } {
  const api = {
    shouldFail: false,
    delay: 250,
    async addTodo(text: string): Promise<Todo> {
      await new Promise((r) => setTimeout(r, api.delay));
      if (api.shouldFail) throw new Error('Network error');
      return { id: `srv-${Math.random().toString(36).slice(2, 9)}`, text, done: false };
    },
    async toggleTodo(_id: string): Promise<void> {
      await new Promise((r) => setTimeout(r, api.delay));
      if (api.shouldFail) throw new Error('Network error');
    },
    async deleteTodo(_id: string): Promise<void> {
      await new Promise((r) => setTimeout(r, api.delay));
      if (api.shouldFail) throw new Error('Network error');
    },
  };
  return api;
}

interface LocalTodo extends Todo {
  pending?: boolean;
}

export function OptimisticTodos({ api }: { api: TodosApi }) {
  const [todos, setTodos] = useState<LocalTodo[]>([
    { id: 'seed-1', text: 'Write the proposal', done: false },
    { id: 'seed-2', text: 'Review PR #42', done: true },
  ]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setError(null);
    const tempId = `temp-${Math.random().toString(36).slice(2, 9)}`;
    setTodos((prev) => [...prev, { id: tempId, text, done: false, pending: true }]);
    try {
      const saved = await api.addTodo(text);
      setTodos((prev) => prev.map((t) => (t.id === tempId ? { ...saved, pending: false } : t)));
    } catch {
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
      setError(`Couldn't add "${text}" — try again.`);
    }
  }

  async function handleToggle(id: string) {
    setError(null);
    const snapshot = todos;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done, pending: true } : t)));
    try {
      await api.toggleTodo(id);
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, pending: false } : t)));
    } catch {
      setTodos(snapshot);
      setError("Couldn't update that item — reverted.");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const snapshot = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.deleteTodo(id);
    } catch {
      setTodos(snapshot);
      setError("Couldn't delete that item — restored.");
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 360, padding: 16 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <input
          aria-label="New todo"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New todo…"
          style={{ flex: 1, padding: 6 }}
        />
        <button data-testid="add-button" onClick={handleAdd}>
          Add
        </button>
      </div>

      {error && (
        <div data-testid="error-banner" style={{ background: '#3f1414', color: '#fca5a5', padding: '6px 8px', fontSize: 13, borderRadius: 4, marginBottom: 8 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, fontSize: 12 }}>
            Dismiss
          </button>
        </div>
      )}

      <ul data-testid="todo-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map((t) => (
          <li
            key={t.id}
            data-testid="todo-item"
            data-id={t.id}
            data-done={t.done}
            data-pending={!!t.pending}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', opacity: t.pending ? 0.6 : 1 }}
          >
            <input type="checkbox" checked={t.done} onChange={() => handleToggle(t.id)} disabled={t.pending} />
            <span style={{ flex: 1, textDecoration: t.done ? 'line-through' : 'none', fontSize: 14 }}>{t.text}</span>
            {t.pending && <span data-testid="pending-dot" style={{ fontSize: 10 }}>●</span>}
            <button aria-label={`Delete ${t.text}`} onClick={() => handleDelete(t.id)} disabled={t.pending}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Demo() {
  const [api] = useState(() => createFakeApi());
  const [simulateFailures, setSimulateFailures] = useState(false);

  return (
    <div>
      <label style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13, display: 'block', padding: '8px 16px 0' }}>
        <input
          type="checkbox"
          data-testid="fail-toggle"
          checked={simulateFailures}
          onChange={(e) => {
            api.shouldFail = e.target.checked;
            setSimulateFailures(e.target.checked);
          }}
        />{' '}
        Simulate network failures
      </label>
      <OptimisticTodos api={api} />
    </div>
  );
}
