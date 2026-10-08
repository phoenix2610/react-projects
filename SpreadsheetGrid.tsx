// Spreadsheet Formula Grid
//
// A grid of cells where any cell can hold a literal or a formula
// (`=A1+B2*2`, `=SUM(A1:A3)`, `=AVERAGE(B1,B2,B3)`). Every edit re-parses
// and re-evaluates the whole grid; each cell's formula is parsed into an
// AST and its cell references collected into a real dependency list (used
// both to evaluate in the right order via memoized recursion, and to
// highlight what a selected cell depends on / is depended on by). A cell
// that references itself, directly or through a chain, resolves to
// #CIRCULAR instead of hanging.
//
// Usage:
//   <SpreadsheetGrid initialCells={{ A1: '10', B1: '=A1*2' }} />
//
// Default export seeds a small worked example.

import { useMemo, useState } from 'react';

// ---- Tokenizer / parser ---------------------------------------------------

type Token =
  | { type: 'NUM'; value: string }
  | { type: 'CELL'; value: string }
  | { type: 'IDENT'; value: string }
  | { type: 'OP'; value: string }
  | { type: 'LP' | 'RP' | 'COMMA' | 'COLON'; value: string };

function tokenize(src: string): Token[] {
  const re = /\s+|(\d+\.\d+|\d+)|([A-Za-z]+\d+)|([A-Za-z]+)|([+\-*/])|(\()|(\))|(,)|(:)/g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) tokens.push({ type: 'NUM', value: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: 'CELL', value: m[2].toUpperCase() });
    else if (m[3] !== undefined) tokens.push({ type: 'IDENT', value: m[3].toUpperCase() });
    else if (m[4] !== undefined) tokens.push({ type: 'OP', value: m[4] });
    else if (m[5] !== undefined) tokens.push({ type: 'LP', value: '(' });
    else if (m[6] !== undefined) tokens.push({ type: 'RP', value: ')' });
    else if (m[7] !== undefined) tokens.push({ type: 'COMMA', value: ',' });
    else if (m[8] !== undefined) tokens.push({ type: 'COLON', value: ':' });
  }
  return tokens;
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'cell'; id: string }
  | { kind: 'neg'; value: Node }
  | { kind: 'bin'; op: string; left: Node; right: Node }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'call'; name: string; args: Node[] };

class Parser {
  pos = 0;
  deps = new Set<string>();
  constructor(private tokens: Token[]) {}
  private peek() {
    return this.tokens[this.pos];
  }
  private next() {
    return this.tokens[this.pos++];
  }
  private expect(type: Token['type']) {
    const t = this.next();
    if (!t || t.type !== type) throw new Error(`Expected ${type}`);
  }
  parseExpr(): Node {
    let node = this.parseTerm();
    while (this.peek()?.type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      node = { kind: 'bin', op, left: node, right: this.parseTerm() };
    }
    return node;
  }
  private parseTerm(): Node {
    let node = this.parseFactor();
    while (this.peek()?.type === 'OP' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value;
      node = { kind: 'bin', op, left: node, right: this.parseFactor() };
    }
    return node;
  }
  private parseFactor(): Node {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of formula');
    if (t.type === 'OP' && t.value === '-') {
      this.next();
      return { kind: 'neg', value: this.parseFactor() };
    }
    if (t.type === 'NUM') {
      this.next();
      return { kind: 'num', value: parseFloat(t.value) };
    }
    if (t.type === 'CELL') {
      this.next();
      this.deps.add(t.value);
      return { kind: 'cell', id: t.value };
    }
    if (t.type === 'LP') {
      this.next();
      const node = this.parseExpr();
      this.expect('RP');
      return node;
    }
    if (t.type === 'IDENT') {
      this.next();
      this.expect('LP');
      const args: Node[] = [];
      if (this.peek()?.type !== 'RP') {
        args.push(this.parseArg());
        while (this.peek()?.type === 'COMMA') {
          this.next();
          args.push(this.parseArg());
        }
      }
      this.expect('RP');
      return { kind: 'call', name: t.value, args };
    }
    throw new Error(`Unexpected token "${t.value}"`);
  }
  private parseArg(): Node {
    if (this.peek()?.type === 'CELL' && this.tokens[this.pos + 1]?.type === 'COLON' && this.tokens[this.pos + 2]?.type === 'CELL') {
      const from = this.next().value;
      this.next();
      const to = this.next().value;
      this.deps.add(from);
      this.deps.add(to);
      for (const id of expandRange(from, to)) this.deps.add(id);
      return { kind: 'range', from, to };
    }
    return this.parseExpr();
  }
}

function parseCellId(id: string): { col: number; row: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(id);
  if (!m) throw new Error(`Bad cell id "${id}"`);
  return { col: m[1].toUpperCase().charCodeAt(0) - 65, row: parseInt(m[2], 10) };
}

function expandRange(from: string, to: string): string[] {
  const a = parseCellId(from);
  const b = parseCellId(to);
  const minCol = Math.min(a.col, b.col);
  const maxCol = Math.max(a.col, b.col);
  const minRow = Math.min(a.row, b.row);
  const maxRow = Math.max(a.row, b.row);
  const ids: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      ids.push(`${String.fromCharCode(65 + c)}${r}`);
    }
  }
  return ids;
}

// ---- Evaluation -------------------------------------------------------------

type ErrorCode = 'CIRCULAR' | 'ERROR';
class EvalError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

export interface CellResult {
  value: number | string;
  error?: ErrorCode;
  deps: string[];
}

function evalNode(node: Node, resolve: (id: string) => CellResult): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'neg':
      return -evalNode(node.value, resolve);
    case 'cell': {
      const r = resolve(node.id);
      if (r.error) throw new EvalError(r.error);
      if (typeof r.value !== 'number') throw new EvalError('ERROR');
      return r.value;
    }
    case 'bin': {
      const l = evalNode(node.left, resolve);
      const rr = evalNode(node.right, resolve);
      if (node.op === '+') return l + rr;
      if (node.op === '-') return l - rr;
      if (node.op === '*') return l * rr;
      if (node.op === '/') {
        if (rr === 0) throw new EvalError('ERROR');
        return l / rr;
      }
      throw new EvalError('ERROR');
    }
    case 'range':
      throw new EvalError('ERROR'); // a bare range only makes sense inside SUM/AVERAGE
    case 'call': {
      const collected: number[] = [];
      const collect = (id: string) => {
        const r = resolve(id);
        if (r.error) throw new EvalError(r.error);
        if (typeof r.value === 'number') collected.push(r.value);
      };
      for (const arg of node.args) {
        if (arg.kind === 'range') expandRange(arg.from, arg.to).forEach(collect);
        else collected.push(evalNode(arg, resolve));
      }
      if (node.name === 'SUM') return collected.reduce((a, b) => a + b, 0);
      if (node.name === 'AVERAGE' || node.name === 'AVG') {
        return collected.length ? collected.reduce((a, b) => a + b, 0) / collected.length : 0;
      }
      throw new EvalError('ERROR');
    }
  }
}

export function evaluateGrid(cells: Record<string, string>): Record<string, CellResult> {
  const cache = new Map<string, CellResult>();
  const inProgress = new Set<string>();

  function resolve(id: string): CellResult {
    if (cache.has(id)) return cache.get(id)!;
    if (inProgress.has(id)) return { value: NaN, error: 'CIRCULAR', deps: [] };

    const raw = (cells[id] ?? '').trim();
    if (raw === '') {
      const r: CellResult = { value: 0, deps: [] };
      cache.set(id, r);
      return r;
    }
    if (!raw.startsWith('=')) {
      const num = Number(raw);
      const r: CellResult = Number.isNaN(num) ? { value: raw, deps: [] } : { value: num, deps: [] };
      cache.set(id, r);
      return r;
    }

    inProgress.add(id);
    let deps: string[] = [];
    let result: CellResult;
    try {
      const tokens = tokenize(raw.slice(1));
      const parser = new Parser(tokens);
      const ast = parser.parseExpr();
      if (parser.pos < tokens.length) throw new Error('trailing tokens');
      deps = [...parser.deps];
      result = { value: evalNode(ast, resolve), deps };
    } catch (e) {
      const code = e instanceof EvalError ? e.code : 'ERROR';
      result = { value: `#${code}`, error: code, deps };
    }
    inProgress.delete(id);
    cache.set(id, result);
    return result;
  }

  for (const id of Object.keys(cells)) resolve(id);
  return Object.fromEntries(cache);
}

// ---- UI ---------------------------------------------------------------------

const COLS = ['A', 'B', 'C', 'D', 'E'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8];

function formatValue(v: number | string): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v;
}

export function SpreadsheetGrid({ initialCells = {} as Record<string, string> }) {
  const [cells, setCells] = useState<Record<string, string>>(initialCells);
  const [selected, setSelected] = useState<string>('A1');
  const [draft, setDraft] = useState<string>(initialCells['A1'] ?? '');

  const results = useMemo(() => evaluateGrid(cells), [cells]);

  const dependents = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [id, r] of Object.entries(results)) {
      for (const dep of r.deps) {
        (map[dep] ??= []).push(id);
      }
    }
    return map;
  }, [results]);

  const selectedDeps = new Set(results[selected]?.deps ?? []);
  const selectedDependents = new Set(dependents[selected] ?? []);

  function select(id: string) {
    setSelected(id);
    setDraft(cells[id] ?? '');
  }

  function commit() {
    setCells((prev) => ({ ...prev, [selected]: draft }));
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 600 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, width: 30 }}>{selected}</span>
        <input
          aria-label="Formula bar"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setDraft(cells[selected] ?? '');
          }}
          onBlur={commit}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, padding: 4 }}
        />
      </div>

      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 28 }} />
            {COLS.map((c) => (
              <th key={c} style={{ padding: 4, border: '1px solid #333', fontWeight: 600 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row}>
              <th style={{ padding: 4, border: '1px solid #333', fontWeight: 600 }}>{row}</th>
              {COLS.map((col) => {
                const id = `${col}${row}`;
                const result = results[id];
                const isSelected = id === selected;
                const isDep = selectedDeps.has(id);
                const isDependent = selectedDependents.has(id);
                return (
                  <td
                    key={id}
                    data-testid="cell"
                    data-cell-id={id}
                    data-value={result ? String(result.value) : ''}
                    data-error={result?.error ?? ''}
                    onClick={() => select(id)}
                    style={{
                      border: isSelected ? '2px solid #3b82f6' : '1px solid #333',
                      padding: '4px 8px',
                      minWidth: 70,
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      background: isSelected
                        ? 'transparent'
                        : isDep
                          ? 'rgba(59,130,246,0.2)'
                          : isDependent
                            ? 'rgba(34,197,94,0.15)'
                            : 'transparent',
                      color: result?.error ? '#ef4444' : 'inherit',
                    }}
                  >
                    {result ? formatValue(result.value) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Demo() {
  return (
    <SpreadsheetGrid
      initialCells={{
        A1: '10',
        A2: '20',
        A3: '30',
        A4: '=SUM(A1:A3)',
        B1: '=A4*2',
        B2: '=AVERAGE(A1:A3)',
      }}
    />
  );
}
