// Color Contrast Auditor
//
// Paste a palette (hex colors, one per line or comma/space separated), get
// every pair's WCAG contrast ratio and which pairs fail AA / AAA for normal
// and large text. Pure client-side math against the WCAG 2.x formula —
// relative luminance with sRGB gamma correction, then (L1+0.05)/(L2+0.05).
//
// Usage:
//   <ContrastAuditor initialPalette={['#1a1a1a', '#ffffff', '#3b82f6']} />
//
// Default export is a self-contained demo seeded with a sample palette.

import { useMemo, useState } from 'react';

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim();
  const m = HEX_RE.exec(trimmed);
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  return '#' + hex;
}

function parsePalette(input: string): { valid: string[]; invalid: string[] } {
  const tokens = input.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const norm = normalizeHex(t);
    if (norm) {
      if (!seen.has(norm)) {
        seen.add(norm);
        valid.push(norm);
      }
    } else {
      invalid.push(t);
    }
  }
  return { valid, invalid };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

interface PairResult {
  a: string;
  b: string;
  ratio: number;
  aaNormal: boolean;
  aaaNormal: boolean;
  aaLarge: boolean;
  aaaLarge: boolean;
}

function auditPairs(colors: string[]): PairResult[] {
  const results: PairResult[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ratio = contrastRatio(colors[i], colors[j]);
      results.push({
        a: colors[i],
        b: colors[j],
        ratio,
        aaNormal: ratio >= 4.5,
        aaaNormal: ratio >= 7,
        aaLarge: ratio >= 3,
        aaaLarge: ratio >= 4.5,
      });
    }
  }
  return results.sort((x, y) => x.ratio - y.ratio);
}

export function ContrastAuditor({ initialPalette = [] as string[] }) {
  const [text, setText] = useState(initialPalette.join('\n'));
  const { valid, invalid } = useMemo(() => parsePalette(text), [text]);
  const pairs = useMemo(() => auditPairs(valid), [valid]);
  const failingCount = pairs.filter((p) => !p.aaNormal).length;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, padding: 16 }}>
      <textarea
        aria-label="Palette input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 8 }}
        placeholder="#111827, #f9fafb, #3b82f6 ..."
      />

      {invalid.length > 0 && (
        <p data-testid="invalid-tokens" style={{ color: '#ef4444', fontSize: 12 }}>
          Couldn't parse: {invalid.join(', ')}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        {valid.map((c) => (
          <div
            key={c}
            title={c}
            style={{ width: 28, height: 28, background: c, border: '1px solid #444', borderRadius: 4 }}
          />
        ))}
      </div>

      {valid.length < 2 ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>Add at least two colors to compare.</p>
      ) : (
        <>
          <p data-testid="summary" style={{ fontSize: 13 }}>
            {pairs.length} pair{pairs.length === 1 ? '' : 's'} · {failingCount} fail
            {failingCount === 1 ? 's' : ''} AA (normal text)
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 4 }}>Pair</th>
                <th style={{ textAlign: 'right', padding: 4 }}>Ratio</th>
                <th style={{ padding: 4 }}>AA (4.5)</th>
                <th style={{ padding: 4 }}>AAA (7)</th>
                <th style={{ padding: 4 }}>AA Large (3)</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={p.a + p.b} data-testid="pair-row" data-pass-aa={p.aaNormal}>
                  <td style={{ padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: p.a,
                        color: p.b,
                        borderRadius: 3,
                        border: '1px solid #444',
                      }}
                    >
                      Aa
                    </span>
                    <code>{p.a}</code> / <code>{p.b}</code>
                  </td>
                  <td style={{ textAlign: 'right', padding: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {p.ratio.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', padding: 4 }}>{p.aaNormal ? '✓' : '✗'}</td>
                  <td style={{ textAlign: 'center', padding: 4 }}>{p.aaaNormal ? '✓' : '✗'}</td>
                  <td style={{ textAlign: 'center', padding: 4 }}>{p.aaLarge ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function Demo() {
  return <ContrastAuditor initialPalette={['#1a1a1a', '#ffffff', '#3b82f6', '#f9fa8c', '#7a7a7a']} />;
}
