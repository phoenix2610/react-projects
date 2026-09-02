// Emoji Picker with Search
//
// Fuzzy search over name + keywords, skin-tone variants for the emoji that
// support them, a "Recently used" row backed by localStorage, and full
// keyboard control: type to search, arrow keys to move through the grid,
// Enter to pick, Escape to clear the query.
//
// Usage:
//   <EmojiPicker onSelect={(emoji) => insertAtCursor(emoji)} />
//
// Default export below is a self-contained demo: it renders the picker plus
// a readout of the last emoji you picked, so it works standalone in the
// harness with no other wiring.

import { useEffect, useMemo, useRef, useState } from 'react';

interface EmojiEntry {
  emoji: string;
  name: string;
  keywords: string[];
  skinTonable?: boolean;
}

const SKIN_TONES = [
  { label: 'Default', modifier: '' },
  { label: 'Light', modifier: '\u{1F3FB}' },
  { label: 'Medium-Light', modifier: '\u{1F3FC}' },
  { label: 'Medium', modifier: '\u{1F3FD}' },
  { label: 'Medium-Dark', modifier: '\u{1F3FE}' },
  { label: 'Dark', modifier: '\u{1F3FF}' },
] as const;

const EMOJI: EmojiEntry[] = [
  { emoji: '😀', name: 'grinning face', keywords: ['happy', 'smile', 'joy'] },
  { emoji: '😂', name: 'face with tears of joy', keywords: ['laugh', 'lol', 'funny'] },
  { emoji: '😍', name: 'heart eyes', keywords: ['love', 'crush', 'adore'] },
  { emoji: '🤔', name: 'thinking face', keywords: ['hmm', 'consider', 'ponder'] },
  { emoji: '😢', name: 'crying face', keywords: ['sad', 'tear', 'upset'] },
  { emoji: '😎', name: 'smiling face with sunglasses', keywords: ['cool', 'summer'] },
  { emoji: '🥳', name: 'partying face', keywords: ['party', 'celebrate', 'birthday'] },
  { emoji: '😴', name: 'sleeping face', keywords: ['sleep', 'tired', 'zzz'] },
  { emoji: '🤯', name: 'exploding head', keywords: ['mind blown', 'shock'] },
  { emoji: '😡', name: 'angry face', keywords: ['mad', 'rage', 'furious'] },
  { emoji: '👍', name: 'thumbs up', keywords: ['like', 'approve', 'yes'], skinTonable: true },
  { emoji: '👎', name: 'thumbs down', keywords: ['dislike', 'no'], skinTonable: true },
  { emoji: '👏', name: 'clapping hands', keywords: ['applause', 'bravo', 'congrats'], skinTonable: true },
  { emoji: '🙌', name: 'raising hands', keywords: ['celebrate', 'yay', 'praise'], skinTonable: true },
  { emoji: '🙏', name: 'folded hands', keywords: ['please', 'thanks', 'pray'], skinTonable: true },
  { emoji: '👋', name: 'waving hand', keywords: ['hello', 'bye', 'wave'], skinTonable: true },
  { emoji: '✋', name: 'raised hand', keywords: ['stop', 'high five'], skinTonable: true },
  { emoji: '👊', name: 'oncoming fist', keywords: ['fist bump', 'punch'], skinTonable: true },
  { emoji: '💪', name: 'flexed biceps', keywords: ['strong', 'muscle', 'gym'], skinTonable: true },
  { emoji: '🤝', name: 'handshake', keywords: ['deal', 'agreement'], skinTonable: true },
  { emoji: '❤️', name: 'red heart', keywords: ['love', 'heart'] },
  { emoji: '🔥', name: 'fire', keywords: ['lit', 'hot', 'flame'] },
  { emoji: '✨', name: 'sparkles', keywords: ['shiny', 'magic', 'new'] },
  { emoji: '🎉', name: 'party popper', keywords: ['celebrate', 'confetti'] },
  { emoji: '💯', name: 'hundred points', keywords: ['100', 'perfect', 'score'] },
  { emoji: '🚀', name: 'rocket', keywords: ['launch', 'ship', 'fast'] },
  { emoji: '🐛', name: 'bug', keywords: ['insect', 'debug'] },
  { emoji: '☕', name: 'hot beverage', keywords: ['coffee', 'tea'] },
  { emoji: '🍕', name: 'pizza', keywords: ['food', 'slice'] },
  { emoji: '🌮', name: 'taco', keywords: ['food', 'mexican'] },
  { emoji: '🎸', name: 'guitar', keywords: ['music', 'rock'] },
  { emoji: '⚽', name: 'soccer ball', keywords: ['football', 'sport'] },
  { emoji: '📚', name: 'books', keywords: ['read', 'study'] },
  { emoji: '💡', name: 'light bulb', keywords: ['idea', 'bright'] },
  { emoji: '🐶', name: 'dog face', keywords: ['puppy', 'pet'] },
  { emoji: '🐱', name: 'cat face', keywords: ['kitten', 'pet'] },
  { emoji: '🌈', name: 'rainbow', keywords: ['colorful', 'pride'] },
  { emoji: '⭐', name: 'star', keywords: ['favorite', 'rating'] },
  { emoji: '🎯', name: 'direct hit', keywords: ['target', 'goal', 'bullseye'] },
  { emoji: '🧠', name: 'brain', keywords: ['smart', 'mind'] },
];

const RECENTS_KEY = 'emoji-picker-recents';
const MAX_RECENTS = 8;
const COLUMNS = 8;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecents(recents: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    // localStorage unavailable (private mode, etc.) — recents just won't persist.
  }
}

// Subsequence fuzzy match: every character of `query` must appear in order
// somewhere in `text`. Score rewards contiguous runs and early matches so
// "thmb" ranks "thumbs up" above a coincidental scattered hit.
function fuzzyScore(query: string, text: string): number {
  if (query.length === 0) return 0;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      streak += 1;
      score += streak;
      if (ti === 0 || (qi === 0 && ti > 0)) score += 2;
      qi += 1;
    } else {
      streak = 0;
    }
  }
  return qi === query.length ? score : -1;
}

function matchEntry(entry: EmojiEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const haystacks = [entry.name, ...entry.keywords];
  let best = -1;
  for (const h of haystacks) {
    const s = fuzzyScore(q, h.toLowerCase());
    if (s > best) best = s;
  }
  return best;
}

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [skinTone, setSkinTone] = useState<(typeof SKIN_TONES)[number]>(SKIN_TONES[0]);
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return EMOJI;
    return EMOJI.map((entry) => ({ entry, score: matchEntry(entry, query) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry);
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const cell = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-index="${activeIndex}"]`,
    );
    cell?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function displayEmoji(entry: EmojiEntry): string {
    return entry.skinTonable && skinTone.modifier ? entry.emoji + skinTone.modifier : entry.emoji;
  }

  function pick(entry: EmojiEntry) {
    const chosen = displayEmoji(entry);
    onSelect(chosen);
    const next = [chosen, ...recents.filter((r) => r !== chosen)].slice(0, MAX_RECENTS);
    setRecents(next);
    saveRecents(next);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + COLUMNS, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - COLUMNS, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[activeIndex];
      if (entry) pick(entry);
    }
  }

  return (
    <div
      style={{
        width: 320,
        border: '1px solid #333',
        borderRadius: 8,
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 8, display: 'flex', gap: 6, borderBottom: '1px solid #333' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search emoji…"
          aria-label="Search emoji"
          style={{ flex: 1, padding: '6px 8px', fontSize: 14 }}
        />
        <select
          aria-label="Skin tone"
          value={skinTone.label}
          onChange={(e) =>
            setSkinTone(SKIN_TONES.find((t) => t.label === e.target.value) ?? SKIN_TONES[0])
          }
        >
          {SKIN_TONES.map((tone) => (
            <option key={tone.label} value={tone.label}>
              {tone.modifier || '◯'} {tone.label}
            </option>
          ))}
        </select>
      </div>

      {recents.length > 0 && !query && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid #333' }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Recently used</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {recents.map((r, i) => (
              <button
                key={`recent-${i}`}
                onClick={() => {
                  onSelect(r);
                  const next = [r, ...recents.filter((x) => x !== r)].slice(0, MAX_RECENTS);
                  setRecents(next);
                  saveRecents(next);
                }}
                style={{ fontSize: 18, border: 'none', background: 'none', cursor: 'pointer' }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={gridRef}
        role="listbox"
        aria-label="Emoji results"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          maxHeight: 200,
          overflowY: 'auto',
          padding: 4,
        }}
      >
        {results.length === 0 && (
          <div style={{ gridColumn: `span ${COLUMNS}`, padding: 12, fontSize: 13, opacity: 0.6 }}>
            No matches for "{query}"
          </div>
        )}
        {results.map((entry, i) => (
          <button
            key={entry.name}
            data-index={i}
            role="option"
            aria-selected={i === activeIndex}
            title={entry.name}
            onClick={() => pick(entry)}
            onMouseEnter={() => setActiveIndex(i)}
            style={{
              fontSize: 20,
              padding: 4,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              background: i === activeIndex ? 'rgba(127,127,127,0.3)' : 'transparent',
            }}
          >
            {displayEmoji(entry)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Demo() {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 14, marginBottom: 12 }}>
        Picked so far: <span style={{ fontSize: 20 }}>{picked.join(' ') || '(none yet)'}</span>
      </p>
      <EmojiPicker onSelect={(emoji) => setPicked((p) => [...p, emoji])} />
    </div>
  );
}
