// Toast Notification System
//
// A queue with stacking, priorities, pause-on-hover and auto-dismiss timers.
// Only `maxVisible` toasts show at once; anything past that waits in a queue
// and slides in as slots free up. Hovering a toast pauses its countdown —
// the remaining time is preserved, not reset, so a near-expired toast
// doesn't get a full new duration when you mouse away.
//
// Usage:
//   const { toasts, queued, addToast, dismiss, pause, resume } = useToastQueue();
//   <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
//   addToast({ message: 'Saved', type: 'success', priority: 'normal' });
//
// Default export is a self-contained demo with trigger buttons.

import { useCallback, useEffect, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'error' | 'warning';
type Priority = 'low' | 'normal' | 'high';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  priority: Priority;
  duration: number;
}

interface NewToast {
  message: string;
  type?: ToastType;
  priority?: Priority;
  duration?: number;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

function sortByPriority(items: ToastItem[]): ToastItem[] {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

interface TimerState {
  timeoutId: ReturnType<typeof setTimeout>;
  remaining: number;
  startedAt: number;
}

export function useToastQueue(maxVisible = 3) {
  const [visible, setVisible] = useState<ToastItem[]>([]);
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, TimerState>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t.timeoutId);
      timers.current.delete(id);
    }
    setVisible((v) => v.filter((toast) => toast.id !== id));
  }, []);

  const startTimer = useCallback(
    (id: number, remaining: number) => {
      const startedAt = Date.now();
      const timeoutId = setTimeout(() => dismiss(id), remaining);
      timers.current.set(id, { timeoutId, remaining, startedAt });
    },
    [dismiss],
  );

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t) return;
    clearTimeout(t.timeoutId);
    const elapsed = Date.now() - t.startedAt;
    t.remaining = Math.max(0, t.remaining - elapsed);
  }, []);

  const resume = useCallback(
    (id: number) => {
      const t = timers.current.get(id);
      if (!t) return;
      startTimer(id, t.remaining);
    },
    [startTimer],
  );

  const addToast = useCallback((partial: NewToast) => {
    const toast: ToastItem = {
      id: nextId.current++,
      message: partial.message,
      type: partial.type ?? 'info',
      priority: partial.priority ?? 'normal',
      duration: partial.duration ?? 4000,
    };
    setVisible((v) => {
      if (v.length < maxVisible) return sortByPriority([...v, toast]);
      setQueue((q) => sortByPriority([...q, toast]));
      return v;
    });
  }, [maxVisible]);

  // Start a timer for any visible toast that doesn't have one yet.
  useEffect(() => {
    for (const t of visible) {
      if (!timers.current.has(t.id)) startTimer(t.id, t.duration);
    }
  }, [visible, startTimer]);

  // Promote from the queue whenever a slot opens up.
  useEffect(() => {
    if (visible.length < maxVisible && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setVisible((v) => sortByPriority([...v, next]));
    }
  }, [visible.length, queue.length, queue, maxVisible]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t.timeoutId);
      map.clear();
    };
  }, []);

  return { toasts: visible, queued: queue.length, addToast, dismiss, pause, resume };
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string }> = {
  info: { bg: '#1e3a5f', border: '#3b82f6' },
  success: { bg: '#14532d', border: '#22c55e' },
  error: { bg: '#5f1e1e', border: '#ef4444' },
  warning: { bg: '#5f4a1e', border: '#f59e0b' },
};

export function ToastViewport({
  toasts,
  queued,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: ToastItem[];
  queued: number;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 280,
        fontFamily: 'system-ui, sans-serif',
        zIndex: 1000,
      }}
    >
      {toasts.map((t) => {
        const style = TYPE_STYLES[t.type];
        return (
          <div
            key={t.id}
            data-testid="toast"
            data-toast-id={t.id}
            data-priority={t.priority}
            onMouseEnter={() => onPause(t.id)}
            onMouseLeave={() => onResume(t.id)}
            style={{
              background: style.bg,
              borderLeft: `4px solid ${style.border}`,
              color: 'white',
              padding: '10px 12px',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <span>
              {t.priority === 'high' ? '⚠ ' : ''}
              {t.message}
            </span>
            <button
              aria-label={`Dismiss: ${t.message}`}
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 14,
                opacity: 0.8,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
      {queued > 0 && (
        <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'right' }}>+{queued} more waiting</div>
      )}
    </div>
  );
}

export default function Demo() {
  const { toasts, queued, addToast, dismiss, pause, resume } = useToastQueue(3);
  let counter = 0;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
      <button onClick={() => addToast({ message: `Info toast ${++counter}`, type: 'info', duration: 1200 })}>
        Add info
      </button>
      <button onClick={() => addToast({ message: `Saved ${++counter}`, type: 'success', duration: 1200 })}>
        Add success
      </button>
      <button
        onClick={() =>
          addToast({ message: `Critical failure ${++counter}`, type: 'error', priority: 'high', duration: 1200 })
        }
      >
        Add high-priority error
      </button>
      <button
        onClick={() => {
          for (let i = 0; i < 5; i++) {
            addToast({ message: `Batch item ${i + 1}`, type: 'warning', duration: 1500 });
          }
        }}
      >
        Add 5 at once (tests queue)
      </button>
      <ToastViewport toasts={toasts} queued={queued} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </div>
  );
}
