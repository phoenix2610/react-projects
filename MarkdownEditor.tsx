// Markdown Live Editor
//
// A split pane: source on the left, rendered preview on the right. The
// preview re-renders `debounceMs` after typing stops, not on every
// keystroke — the markdown parser re-runs on the whole document, so
// debouncing keeps large documents from re-parsing 60 times a second while
// you type. Scrolling either pane moves the other by the same scroll
// *percentage* (not pixel-for-pixel, since the two panes are rarely the
// same height), guarded against feedback loops with a syncing flag.
//
// Usage:
//   <MarkdownEditor initialValue={'# Hello\n\nSome *text*.'} debounceMs={250} />
//
// The markdown support is intentionally small: headings, bold/italic,
// inline code, links, fenced code blocks, blockquotes and `- `/`* ` lists.

import { useEffect, useMemo, useRef, useState } from 'react';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

export function markdownToHtml(src: string): string {
  const lines = src.split('\n');
  const html: string[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      html.push('<ul>' + listBuffer.map((li) => `<li>${renderInline(li)}</li>`).join('') + '</ul>');
      listBuffer = [];
    }
  };
  const flushPara = () => {
    if (paraBuffer.length) {
      html.push(`<p>${renderInline(paraBuffer.join(' '))}</p>`);
      paraBuffer = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushList();
      flushPara();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushPara();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushPara();
      listBuffer.push(line.replace(/^[-*]\s+/, ''));
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushList();
      flushPara();
      html.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`);
      i++;
      continue;
    }

    if (line.trim() === '') {
      flushList();
      flushPara();
      i++;
      continue;
    }

    flushList();
    paraBuffer.push(line);
    i++;
  }
  flushList();
  flushPara();
  return html.join('\n');
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function MarkdownEditor({ initialValue = '', debounceMs = 250 }: { initialValue?: string; debounceMs?: number }) {
  const [source, setSource] = useState(initialValue);
  const debouncedSource = useDebouncedValue(source, debounceMs);
  const html = useMemo(() => markdownToHtml(debouncedSource), [debouncedSource]);

  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  function syncScroll(from: HTMLElement, to: HTMLElement) {
    if (syncing.current) return;
    syncing.current = true;
    const scrollable = from.scrollHeight - from.clientHeight;
    const ratio = scrollable > 0 ? from.scrollTop / scrollable : 0;
    to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', gap: 1, height: 260, border: '1px solid #333' }}>
      <textarea
        ref={sourceRef}
        data-testid="source-input"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onScroll={() => {
          if (sourceRef.current && previewRef.current) syncScroll(sourceRef.current, previewRef.current);
        }}
        style={{ flex: 1, resize: 'none', fontFamily: 'monospace', fontSize: 13, padding: 8, border: 'none' }}
      />
      <div
        ref={previewRef}
        data-testid="preview"
        onScroll={() => {
          if (sourceRef.current && previewRef.current) syncScroll(previewRef.current, sourceRef.current);
        }}
        style={{ flex: 1, overflowY: 'auto', padding: 8, fontSize: 14, borderLeft: '1px solid #333' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

const SAMPLE = `# Markdown Live Editor

Type on the left, see it rendered on the right after a short pause.

## Features

- Headings, **bold**, *italic*, \`inline code\`
- [Links](https://example.com)
- Fenced code blocks

\`\`\`
const x = 1;
\`\`\`

> A blockquote, for good measure.

${Array.from({ length: 20 }, (_, i) => `Padding line ${i + 1} to make this pane tall enough to scroll.`).join('\n\n')}
`;

export default function Demo() {
  return <MarkdownEditor initialValue={SAMPLE} debounceMs={250} />;
}
