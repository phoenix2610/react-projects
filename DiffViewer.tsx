// Diff Viewer Component
//
// Side-by-side and inline diffs with word-level highlighting on modified
// lines, and unchanged runs longer than a few lines collapsed behind a
// "N unchanged lines" toggle. The diff itself is a plain LCS (longest
// common subsequence) over lines, then the same LCS run again over tokens
// within each remove/add pair that lines up 1:1 — no diff library involved.
//
// Usage:
//   <DiffViewer before={oldText} after={newText} />
//
// Default export is a self-contained demo with a sample before/after.

import { useState } from 'react';

type LineOp = { type: 'equal' | 'remove' | 'add'; text: string };

function diffTokens(a: string[], b: string[]): LineOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'remove', text: a[i++] });
  while (j < m) ops.push({ type: 'add', text: b[j++] });
  return ops;
}

function diffWords(a: string, b: string): LineOp[] {
  const tokenize = (s: string) => s.match(/\S+|\s+/g) ?? [];
  return diffTokens(tokenize(a), tokenize(b));
}

// Group consecutive same-type line ops, then merge an adjacent
// remove-run + add-run into a single "modify" block so the two sides can
// be paired up for word-level highlighting.
type Block =
  | { kind: 'equal'; lines: string[] }
  | { kind: 'remove'; lines: string[] }
  | { kind: 'add'; lines: string[] }
  | { kind: 'modify'; removed: string[]; added: string[] };

function buildBlocks(ops: LineOp[]): Block[] {
  const runs: { type: LineOp['type']; lines: string[] }[] = [];
  for (const op of ops) {
    const last = runs[runs.length - 1];
    if (last && last.type === op.type) last.lines.push(op.text);
    else runs.push({ type: op.type, lines: [op.text] });
  }
  const blocks: Block[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const next = runs[i + 1];
    // Only pair remove+add into a word-diffed "modify" block when both sides
    // have the same number of lines — a 1-line removal next to a 5-line
    // addition is a removal plus an insertion, not five modified lines.
    if (run.type === 'remove' && next && next.type === 'add' && run.lines.length === next.lines.length) {
      blocks.push({ kind: 'modify', removed: run.lines, added: next.lines });
      i++;
    } else {
      blocks.push({ kind: run.type, lines: run.lines } as Block);
    }
  }
  return blocks;
}

const CONTEXT = 2; // lines of context kept visible around a collapsed hunk
const COLLAPSE_THRESHOLD = CONTEXT * 2 + 2;

function WordDiffLine({ text, ops, side }: { text: string; ops: LineOp[]; side: 'remove' | 'add' }) {
  const keep: LineOp['type'][] = side === 'remove' ? ['equal', 'remove'] : ['equal', 'add'];
  return (
    <>
      {ops
        .filter((o) => keep.includes(o.type))
        .map((o, i) =>
          o.type === 'equal' ? (
            <span key={i}>{o.text}</span>
          ) : (
            <mark
              key={i}
              style={{
                background: side === 'remove' ? '#7f1d1d' : '#14532d',
                color: 'inherit',
              }}
            >
              {o.text}
            </mark>
          ),
        )}
    </>
  );
}

function CollapseToggle({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      data-testid="expand-hunk"
      onClick={onExpand}
      style={{
        width: '100%',
        textAlign: 'left',
        background: '#1f2937',
        border: 'none',
        color: '#9ca3af',
        fontSize: 12,
        padding: '2px 8px',
        cursor: 'pointer',
        fontFamily: 'monospace',
      }}
    >
      ⋯ {count} unchanged line{count === 1 ? '' : 's'} ⋯ (click to expand)
    </button>
  );
}

function visibleEqualSegments(lines: string[], expanded: boolean): { lines: string[]; collapsedCount: number }[] {
  if (expanded || lines.length <= COLLAPSE_THRESHOLD) return [{ lines, collapsedCount: 0 }];
  return [
    { lines: lines.slice(0, CONTEXT), collapsedCount: 0 },
    { lines: [], collapsedCount: lines.length - CONTEXT * 2 },
    { lines: lines.slice(lines.length - CONTEXT), collapsedCount: 0 },
  ];
}

export function DiffViewer({ before, after }: { before: string; after: string }) {
  const [mode, setMode] = useState<'side-by-side' | 'inline'>('side-by-side');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const blocks = buildBlocks(diffTokens(before.split('\n'), after.split('\n')));

  function expand(blockIndex: number) {
    setExpanded((prev) => new Set(prev).add(blockIndex));
  }

  const rowStyle = { fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre' as const, padding: '0 8px' };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <div style={{ marginBottom: 8 }}>
        <button
          data-testid="mode-side-by-side"
          onClick={() => setMode('side-by-side')}
          style={{ fontWeight: mode === 'side-by-side' ? 700 : 400 }}
        >
          Side by side
        </button>
        <button
          data-testid="mode-inline"
          onClick={() => setMode('inline')}
          style={{ fontWeight: mode === 'inline' ? 700 : 400, marginLeft: 4 }}
        >
          Inline
        </button>
      </div>

      {mode === 'side-by-side' ? (
        <div data-testid="diff-output" style={{ border: '1px solid #333' }}>
          {blocks.map((block, bi) => {
            if (block.kind === 'equal') {
              const segments = visibleEqualSegments(block.lines, expanded.has(bi));
              return (
                <div key={bi}>
                  {segments.map((seg, si) =>
                    seg.collapsedCount > 0 ? (
                      <CollapseToggle key={si} count={seg.collapsedCount} onExpand={() => expand(bi)} />
                    ) : (
                      seg.lines.map((line, li) => (
                        <div key={li} style={{ display: 'flex' }}>
                          <div style={{ ...rowStyle, flex: 1 }}>{line}</div>
                          <div style={{ ...rowStyle, flex: 1, borderLeft: '1px solid #333' }}>{line}</div>
                        </div>
                      ))
                    ),
                  )}
                </div>
              );
            }
            if (block.kind === 'remove') {
              return block.lines.map((line, li) => (
                <div key={`${bi}-${li}`} data-testid="diff-row" data-row-type="remove" style={{ display: 'flex' }}>
                  <div style={{ ...rowStyle, flex: 1, background: '#3f1414' }}>{line}</div>
                  <div style={{ ...rowStyle, flex: 1, borderLeft: '1px solid #333' }} />
                </div>
              ));
            }
            if (block.kind === 'add') {
              return block.lines.map((line, li) => (
                <div key={`${bi}-${li}`} data-testid="diff-row" data-row-type="add" style={{ display: 'flex' }}>
                  <div style={{ ...rowStyle, flex: 1 }} />
                  <div style={{ ...rowStyle, flex: 1, background: '#123a1e', borderLeft: '1px solid #333' }}>
                    {line}
                  </div>
                </div>
              ));
            }
            // modify: pair rows up to the longer side
            const max = Math.max(block.removed.length, block.added.length);
            return Array.from({ length: max }).map((_, ri) => {
              const removedLine = block.removed[ri];
              const addedLine = block.added[ri];
              const wordOps = removedLine !== undefined && addedLine !== undefined ? diffWords(removedLine, addedLine) : null;
              return (
                <div key={`${bi}-${ri}`} data-testid="diff-row" data-row-type="modify" style={{ display: 'flex' }}>
                  <div style={{ ...rowStyle, flex: 1, background: removedLine !== undefined ? '#3f1414' : 'transparent' }}>
                    {removedLine !== undefined && (wordOps ? <WordDiffLine text={removedLine} ops={wordOps} side="remove" /> : removedLine)}
                  </div>
                  <div style={{ ...rowStyle, flex: 1, borderLeft: '1px solid #333', background: addedLine !== undefined ? '#123a1e' : 'transparent' }}>
                    {addedLine !== undefined && (wordOps ? <WordDiffLine text={addedLine} ops={wordOps} side="add" /> : addedLine)}
                  </div>
                </div>
              );
            });
          })}
        </div>
      ) : (
        <div data-testid="diff-output" style={{ border: '1px solid #333' }}>
          {blocks.map((block, bi) => {
            if (block.kind === 'equal') {
              const segments = visibleEqualSegments(block.lines, expanded.has(bi));
              return (
                <div key={bi}>
                  {segments.map((seg, si) =>
                    seg.collapsedCount > 0 ? (
                      <CollapseToggle key={si} count={seg.collapsedCount} onExpand={() => expand(bi)} />
                    ) : (
                      seg.lines.map((line, li) => (
                        <div key={li} style={rowStyle}>
                          {'  '}
                          {line}
                        </div>
                      ))
                    ),
                  )}
                </div>
              );
            }
            if (block.kind === 'remove') {
              return block.lines.map((line, li) => (
                <div key={`${bi}-${li}`} data-testid="diff-row" data-row-type="remove" style={{ ...rowStyle, background: '#3f1414' }}>
                  - {line}
                </div>
              ));
            }
            if (block.kind === 'add') {
              return block.lines.map((line, li) => (
                <div key={`${bi}-${li}`} data-testid="diff-row" data-row-type="add" style={{ ...rowStyle, background: '#123a1e' }}>
                  + {line}
                </div>
              ));
            }
            const max = Math.max(block.removed.length, block.added.length);
            return Array.from({ length: max }).flatMap((_, ri) => {
              const removedLine = block.removed[ri];
              const addedLine = block.added[ri];
              const wordOps = removedLine !== undefined && addedLine !== undefined ? diffWords(removedLine, addedLine) : null;
              const rows = [];
              if (removedLine !== undefined) {
                rows.push(
                  <div key={`${bi}-${ri}-r`} data-testid="diff-row" data-row-type="modify" style={{ ...rowStyle, background: '#3f1414' }}>
                    - {wordOps ? <WordDiffLine text={removedLine} ops={wordOps} side="remove" /> : removedLine}
                  </div>,
                );
              }
              if (addedLine !== undefined) {
                rows.push(
                  <div key={`${bi}-${ri}-a`} data-testid="diff-row" data-row-type="modify" style={{ ...rowStyle, background: '#123a1e' }}>
                    + {wordOps ? <WordDiffLine text={addedLine} ops={wordOps} side="add" /> : addedLine}
                  </div>,
                );
              }
              return rows;
            });
          })}
        </div>
      )}
    </div>
  );
}

const SAMPLE_BEFORE = `function greet(name) {
  console.log("Hello " + name);
}

const CONFIG = {
  retries: 3,
  timeout: 1000,
};

function loadData() {
  return fetch("/api/data").then((r) => r.json());
}

function formatDate(d) {
  return d.toISOString();
}

module.exports = { greet, loadData };`;

const SAMPLE_AFTER = `function greet(name) {
  console.log(\`Hello \${name}!\`);
}

const CONFIG = {
  retries: 5,
  timeout: 1000,
};

function loadData() {
  return fetch("/api/data").then((r) => r.json());
}

function formatDate(d) {
  return d.toISOString();
}

function parseDate(s) {
  return new Date(s);
}

module.exports = { greet, loadData, parseDate };`;

export default function Demo() {
  return <DiffViewer before={SAMPLE_BEFORE} after={SAMPLE_AFTER} />;
}
