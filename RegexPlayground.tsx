// Regex Playground
//
// Live match highlighting against a test string, a list of named capture
// groups per match, and a plain-English breakdown of the pattern itself
// (built by walking the pattern text, not by asking a regex engine to
// explain itself — it doesn't have that API).
//
// Usage:
//   <RegexPlayground initialPattern="(?<year>\d{4})-(?<month>\d{2})" initialFlags="g" />
//
// Default export is a self-contained demo seeded with a date pattern.

import { useMemo, useState } from 'react';

// ---- Plain-English breakdown -------------------------------------------

const QUANTIFIER_RE = /^(\*|\+|\?|\{\d+(?:,\d*)?\})(\??)/;

function describeQuantifier(q: string, lazy: boolean): string {
  const suffix = lazy ? ' (lazy)' : '';
  if (q === '*') return `, zero or more times${suffix}`;
  if (q === '+') return `, one or more times${suffix}`;
  if (q === '?') return `, optionally${suffix}`;
  const m = /^\{(\d+)(?:,(\d*))?\}$/.exec(q);
  if (m) {
    const [, min, max] = m;
    if (max === undefined) return `, exactly ${min} time${min === '1' ? '' : 's'}${suffix}`;
    if (max === '') return `, ${min} or more times${suffix}`;
    return `, between ${min} and ${max} times${suffix}`;
  }
  return '';
}

const CLASS_NAMES: Record<string, string> = {
  d: 'a digit', D: 'a non-digit', w: 'a word character', W: 'a non-word character',
  s: 'whitespace', S: 'non-whitespace character',
};

function findMatchingBracket(pattern: string, open: number, openCh: string, closeCh: string): number {
  let depth = 1;
  let i = open + 1;
  while (i < pattern.length && depth > 0) {
    if (pattern[i] === '\\') { i += 2; continue; }
    if (pattern[i] === openCh) depth++;
    else if (pattern[i] === closeCh) depth--;
    if (depth === 0) return i;
    i++;
  }
  return pattern.length - 1;
}

function describeCharClass(body: string): string {
  const negated = body.startsWith('^');
  const content = negated ? body.slice(1) : body;
  return `${negated ? 'none of' : 'any of'}: ${content || '(empty)'}`;
}

// Describes one '|'-separated alternative, starting at index i, stopping at
// an unescaped '|' or ')' or the end of the string. Returns the joined
// sentence plus the index just past what it consumed.
function describeAlternative(pattern: string, i: number): { text: string; i: number } {
  const parts: string[] = [];
  while (i < pattern.length && pattern[i] !== '|' && pattern[i] !== ')') {
    let atom = '';
    const ch = pattern[i];

    if (ch === '^') { atom = 'start of string'; i++; }
    else if (ch === '$') { atom = 'end of string'; i++; }
    else if (ch === '.') { atom = 'any character'; i++; }
    else if (ch === '\\') {
      const next = pattern[i + 1];
      if (next === 'b') { atom = 'a word boundary'; i += 2; }
      else if (next === 'B') { atom = 'a non-word-boundary'; i += 2; }
      else if (CLASS_NAMES[next]) { atom = CLASS_NAMES[next]; i += 2; }
      else { atom = `the literal "${next}"`; i += 2; }
    } else if (ch === '[') {
      const close = findMatchingBracket(pattern, i, '[', ']');
      atom = describeCharClass(pattern.slice(i + 1, close));
      i = close + 1;
    } else if (ch === '(') {
      const close = findMatchingBracket(pattern, i, '(', ')');
      let inner = pattern.slice(i + 1, close);
      let prefix = 'a group containing';
      const named = /^\?<([^>]+)>/.exec(inner);
      if (named) { prefix = `a capture group named "${named[1]}" containing`; inner = inner.slice(named[0].length); }
      else if (inner.startsWith('?:')) { prefix = 'a non-capturing group containing'; inner = inner.slice(2); }
      else if (inner.startsWith('?=')) { prefix = 'a lookahead requiring'; inner = inner.slice(2); }
      else if (inner.startsWith('?!')) { prefix = 'a negative lookahead ruling out'; inner = inner.slice(2); }
      else { prefix = 'a capture group containing'; }
      atom = `${prefix} (${describeAlternatives(inner)})`;
      i = close + 1;
    } else if (/[a-zA-Z]/.test(ch)) {
      atom = `the letter "${ch}"`;
      i++;
    } else if (/[0-9]/.test(ch)) {
      atom = `the digit "${ch}"`;
      i++;
    } else {
      atom = `the character "${ch}"`;
      i++;
    }

    const qm = QUANTIFIER_RE.exec(pattern.slice(i));
    if (qm) {
      atom += describeQuantifier(qm[1], qm[2] === '?');
      i += qm[0].length;
    }
    parts.push(atom);
  }
  return { text: parts.join(', then '), i };
}

function describeAlternatives(pattern: string): string {
  const branches: string[] = [];
  let i = 0;
  while (i <= pattern.length) {
    const { text, i: next } = describeAlternative(pattern, i);
    branches.push(text || '(nothing)');
    if (pattern[next] === '|') { i = next + 1; } else { break; }
  }
  return branches.join(' OR ');
}

// ---- Matching -------------------------------------------------------------

interface MatchInfo {
  text: string;
  index: number;
  groups: Record<string, string> | undefined;
}

function runMatches(pattern: string, flags: string, input: string): { matches: MatchInfo[]; error: string | null } {
  try {
    if (flags.includes('g')) {
      const re = new RegExp(pattern, flags);
      const matches: MatchInfo[] = [];
      for (const m of input.matchAll(re)) {
        matches.push({ text: m[0], index: m.index ?? 0, groups: m.groups });
        if (m[0] === '') re.lastIndex++; // avoid infinite loop on zero-length matches
      }
      return { matches, error: null };
    }
    const re = new RegExp(pattern, flags);
    const m = re.exec(input);
    return { matches: m ? [{ text: m[0], index: m.index, groups: m.groups }] : [], error: null };
  } catch (e) {
    return { matches: [], error: (e as Error).message };
  }
}

function highlightSegments(input: string, matches: MatchInfo[]): { text: string; matched: boolean }[] {
  if (matches.length === 0) return [{ text: input, matched: false }];
  const segments: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.index > cursor) segments.push({ text: input.slice(cursor, m.index), matched: false });
    if (m.text.length > 0) segments.push({ text: m.text, matched: true });
    cursor = m.index + m.text.length;
  }
  if (cursor < input.length) segments.push({ text: input.slice(cursor), matched: false });
  return segments;
}

const FLAG_OPTIONS = [
  { flag: 'g', label: 'g (global)' },
  { flag: 'i', label: 'i (case-insensitive)' },
  { flag: 'm', label: 'm (multiline)' },
  { flag: 's', label: 's (dotall)' },
] as const;

export function RegexPlayground({
  initialPattern = '',
  initialFlags = 'g',
  initialInput = '',
}: {
  initialPattern?: string;
  initialFlags?: string;
  initialInput?: string;
}) {
  const [pattern, setPattern] = useState(initialPattern);
  const [flags, setFlags] = useState(initialFlags);
  const [input, setInput] = useState(initialInput);

  const { matches, error } = useMemo(() => runMatches(pattern, flags, input), [pattern, flags, input]);
  const segments = useMemo(() => highlightSegments(input, matches), [input, matches]);
  const breakdown = useMemo(() => {
    if (!pattern) return '';
    try {
      return describeAlternatives(pattern);
    } catch {
      return 'Could not describe this pattern.';
    }
  }, [pattern]);

  function toggleFlag(f: string) {
    setFlags((cur) => (cur.includes(f) ? cur.replace(f, '') : cur + f));
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, padding: 16 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontFamily: 'monospace', fontSize: 15 }}>
        <span>/</span>
        <input
          aria-label="Pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 15, padding: 4 }}
        />
        <span>/{flags}</span>
      </div>

      <div style={{ display: 'flex', gap: 12, margin: '8px 0', fontSize: 12 }}>
        {FLAG_OPTIONS.map(({ flag, label }) => (
          <label key={flag}>
            <input type="checkbox" checked={flags.includes(flag)} onChange={() => toggleFlag(flag)} /> {label}
          </label>
        ))}
      </div>

      {error && (
        <p data-testid="regex-error" style={{ color: '#ef4444', fontSize: 13 }}>
          Invalid pattern: {error}
        </p>
      )}

      <textarea
        aria-label="Test string"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 14, padding: 8, marginTop: 4 }}
      />

      <div
        data-testid="highlighted-output"
        style={{ fontFamily: 'monospace', fontSize: 14, whiteSpace: 'pre-wrap', padding: 8, border: '1px solid #333', marginTop: 8 }}
      >
        {segments.map((s, i) =>
          s.matched ? (
            <mark key={i} data-testid="match-highlight" style={{ background: '#facc15', color: '#111' }}>
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>

      <p data-testid="match-count" style={{ fontSize: 12, opacity: 0.8 }}>
        {matches.length} match{matches.length === 1 ? '' : 'es'}
      </p>

      {matches.some((m) => m.groups) && (
        <ul data-testid="groups-list" style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
          {matches.flatMap((m, mi) =>
            m.groups
              ? Object.entries(m.groups).map(([name, val]) => (
                  <li key={`${mi}-${name}`}>
                    <code>{name}</code> = "{val}"
                  </li>
                ))
              : [],
          )}
        </ul>
      )}

      {pattern && !error && (
        <p data-testid="breakdown" style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
          {breakdown}
        </p>
      )}
    </div>
  );
}

export default function Demo() {
  return (
    <RegexPlayground
      initialPattern={'(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})'}
      initialFlags="g"
      initialInput={'Shipped on 2026-08-26. Renewed 2027-01-15.'}
    />
  );
}
