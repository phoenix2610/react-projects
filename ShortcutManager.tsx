// Keyboard Shortcut Manager
//
// Capture chords by pressing them (not typing them), detect conflicts as
// soon as two actions share a chord, and render a printable shortcut sheet
// (the controls are hidden under @media print, so the printout is just a
// clean description/chord table).
//
// Usage:
//   <ShortcutManager actions={[{ id: 'save', description: 'Save file', chord: 'Ctrl+S' }]} />
//
// Default export is a self-contained demo with a handful of seeded actions.

import { useCallback, useEffect, useMemo, useState } from 'react';

interface ActionDef {
  id: string;
  description: string;
  chord: string | null;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

// Normalize a KeyboardEvent into a stable "Ctrl+Shift+K" style string.
// Modifier order is fixed so "Shift+Ctrl+K" and "Ctrl+Shift+K" compare equal.
function chordFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null; // wait for a non-modifier key
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  const main = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(main);
  return parts.join('+');
}

function normalize(chord: string): string {
  return chord
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .sort()
    .join('+');
}

const DEFAULT_ACTIONS: ActionDef[] = [
  { id: 'save', description: 'Save file', chord: 'Ctrl+S' },
  { id: 'find', description: 'Find in file', chord: 'Ctrl+F' },
  { id: 'new-tab', description: 'New tab', chord: 'Ctrl+T' },
  { id: 'close-tab', description: 'Close tab', chord: 'Ctrl+W' },
  { id: 'command-palette', description: 'Open command palette', chord: null },
  { id: 'toggle-sidebar', description: 'Toggle sidebar', chord: null },
];

export function ShortcutManager({ actions: initial = DEFAULT_ACTIONS }: { actions?: ActionDef[] }) {
  const [actions, setActions] = useState<ActionDef[]>(initial);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const conflicts = useMemo(() => {
    const byChord = new Map<string, string[]>();
    for (const a of actions) {
      if (!a.chord) continue;
      const key = normalize(a.chord);
      const list = byChord.get(key) ?? [];
      list.push(a.id);
      byChord.set(key, list);
    }
    const conflictIds = new Set<string>();
    for (const ids of byChord.values()) {
      if (ids.length > 1) ids.forEach((id) => conflictIds.add(id));
    }
    return conflictIds;
  }, [actions]);

  const stopRecording = useCallback(() => setRecordingId(null), []);

  useEffect(() => {
    if (!recordingId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopRecording();
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      e.preventDefault();
      setActions((prev) => prev.map((a) => (a.id === recordingId ? { ...a, chord } : a)));
      stopRecording();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recordingId, stopRecording]);

  function conflictPartners(id: string): string[] {
    const chord = actions.find((a) => a.id === id)?.chord;
    if (!chord) return [];
    const key = normalize(chord);
    return actions
      .filter((a) => a.id !== id && a.chord && normalize(a.chord) === key)
      .map((a) => a.description);
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, padding: 16 }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #999; padding: 6px; }
        }
      `}</style>
      <div className="no-print" style={{ marginBottom: 8 }}>
        <button onClick={() => window.print()}>Print shortcut sheet</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 4 }}>Action</th>
            <th style={{ textAlign: 'left', padding: 4 }}>Shortcut</th>
            <th className="no-print" style={{ padding: 4 }} />
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => {
            const isConflict = conflicts.has(a.id);
            const isRecording = recordingId === a.id;
            return (
              <tr
                key={a.id}
                data-testid="shortcut-row"
                data-action-id={a.id}
                data-conflict={isConflict}
                style={{ background: isConflict ? 'rgba(239,68,68,0.15)' : 'transparent' }}
              >
                <td style={{ padding: 4 }}>{a.description}</td>
                <td style={{ padding: 4 }}>
                  {isRecording ? (
                    <em data-testid="recording-indicator">Press keys… (Esc to cancel)</em>
                  ) : (
                    <>
                      <kbd data-testid="chord-display">{a.chord ?? 'Unassigned'}</kbd>
                      {isConflict && (
                        <div data-testid="conflict-message" style={{ color: '#ef4444', fontSize: 11 }}>
                          Conflicts with: {conflictPartners(a.id).join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="no-print" style={{ padding: 4 }}>
                  <button
                    data-testid="record-button"
                    onClick={() => setRecordingId(isRecording ? null : a.id)}
                  >
                    {isRecording ? 'Cancel' : 'Record'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Demo() {
  return <ShortcutManager />;
}
