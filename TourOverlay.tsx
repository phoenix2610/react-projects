// Onboarding Tour Overlay
//
// A "spotlight" is just a div positioned exactly over the target element,
// with a `box-shadow: 0 0 0 9999px <dim color>` — cheaper and simpler than
// an SVG mask, and it's just as much of a real cutout since the spotlight
// div itself is transparent. The popover picks whichever side (top/bottom/
// left/right) actually has room in the viewport, falling back sensibly
// when the target sits near an edge. Progress (which step you're on, or
// that you finished) is saved to localStorage after every step, so
// dismissing mid-tour and coming back resumes instead of restarting.
//
// Usage:
//   <TourOverlay tourId="main-tour" steps={steps} />
//
// Default export wires up a small demo page with three targets, one of
// them deliberately placed near the viewport's bottom edge to exercise the
// placement fallback.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface TourStep {
  id: string;
  target: string; // CSS selector
  title: string;
  content: string;
}

type Placement = 'top' | 'bottom' | 'left' | 'right';

export function choosePlacement(
  targetRect: { top: number; bottom: number; left: number; right: number },
  popoverSize: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 12,
): Placement {
  const spaceBelow = viewport.height - targetRect.bottom;
  const spaceAbove = targetRect.top;
  const spaceRight = viewport.width - targetRect.right;
  const spaceLeft = targetRect.left;

  if (spaceBelow >= popoverSize.height + gap) return 'bottom';
  if (spaceAbove >= popoverSize.height + gap) return 'top';
  if (spaceRight >= popoverSize.width + gap) return 'right';
  if (spaceLeft >= popoverSize.width + gap) return 'left';
  return 'bottom';
}

function popoverPosition(
  placement: Placement,
  targetRect: DOMRect,
  popoverSize: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 12,
  edgeMargin = 8,
): { top: number; left: number } {
  const centerX = targetRect.left + targetRect.width / 2 - popoverSize.width / 2;
  const centerY = targetRect.top + targetRect.height / 2 - popoverSize.height / 2;
  // Picking the SIDE only guarantees room along that one axis -- a target
  // near the left/right edge still needs the cross-axis position clamped,
  // or centering it on the target pushes it straight off-screen.
  const clampX = (x: number) => Math.min(Math.max(x, edgeMargin), viewport.width - popoverSize.width - edgeMargin);
  const clampY = (y: number) => Math.min(Math.max(y, edgeMargin), viewport.height - popoverSize.height - edgeMargin);

  switch (placement) {
    case 'bottom':
      return { top: targetRect.bottom + gap, left: clampX(centerX) };
    case 'top':
      return { top: targetRect.top - popoverSize.height - gap, left: clampX(centerX) };
    case 'right':
      return { top: clampY(centerY), left: targetRect.right + gap };
    case 'left':
      return { top: clampY(centerY), left: targetRect.left - popoverSize.width - gap };
  }
}

interface Progress {
  stepIndex: number;
  completed: boolean;
}

const STORAGE_PREFIX = 'tour-progress:';

function loadProgress(tourId: string): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tourId);
    return raw ? (JSON.parse(raw) as Progress) : { stepIndex: 0, completed: false };
  } catch {
    return { stepIndex: 0, completed: false };
  }
}

function saveProgress(tourId: string, progress: Progress) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tourId, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

const POPOVER_SIZE = { width: 220, height: 110 };

export function TourOverlay({ tourId, steps }: { tourId: string; steps: TourStep[] }) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress(tourId));
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const step = progress.completed ? null : steps[progress.stepIndex];

  useLayoutEffect(() => {
    if (!step) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  function commit(next: Progress) {
    setProgress(next);
    saveProgress(tourId, next);
  }

  function next() {
    if (progress.stepIndex + 1 >= steps.length) {
      commit({ stepIndex: progress.stepIndex, completed: true });
    } else {
      commit({ stepIndex: progress.stepIndex + 1, completed: false });
    }
  }

  function skip() {
    // Skipping still records where you left off -- it's a pause, not a reset.
    saveProgress(tourId, progress);
    setProgress({ ...progress, completed: true }); // hide immediately; stored progress keeps stepIndex for resume
  }

  function restart() {
    commit({ stepIndex: 0, completed: false });
  }

  if (!step || !targetRect) {
    return (
      <button
        data-testid="restart-tour"
        onClick={restart}
        style={{ position: 'fixed', top: 100, left: 20, zIndex: 1002, fontFamily: 'system-ui, sans-serif', fontSize: 12 }}
      >
        {progress.completed && progress.stepIndex === steps.length - 1 ? 'Restart tour' : 'Resume tour'}
      </button>
    );
  }

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const placement = choosePlacement(targetRect, POPOVER_SIZE, viewport);
  const pos = popoverPosition(placement, targetRect, POPOVER_SIZE, viewport);

  return (
    <>
      <div
        data-testid="spotlight"
        data-placement={placement}
        style={{
          position: 'fixed',
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          borderRadius: 6,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
          pointerEvents: 'none',
          zIndex: 1000,
          transition: 'top 200ms, left 200ms, width 200ms, height 200ms',
        }}
      />
      <div
        ref={popoverRef}
        data-testid="popover"
        data-step-id={step.id}
        data-placement={placement}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: POPOVER_SIZE.width,
          background: '#1f2937',
          color: 'white',
          borderRadius: 8,
          padding: 12,
          fontFamily: 'system-ui, sans-serif',
          zIndex: 1001,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{step.title}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>{step.content}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {progress.stepIndex + 1} / {steps.length}
          </span>
          <div>
            <button data-testid="skip-btn" onClick={skip} style={{ marginRight: 6, fontSize: 12 }}>
              Skip
            </button>
            <button data-testid="next-btn" onClick={next} style={{ fontSize: 12 }}>
              {progress.stepIndex + 1 >= steps.length ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const STEPS: TourStep[] = [
  { id: 'new-feature', target: '#new-feature-btn', title: 'Try the new feature', content: 'This button showed up recently — give it a look.' },
  { id: 'settings', target: '#settings-icon', title: 'Settings', content: 'Adjust your preferences here at any time.' },
  { id: 'footer-link', target: '#footer-link', title: 'Need help?', content: "This link is near the bottom edge, so the popover should flip above it." },
];

export default function Demo() {
  const [remountKey, setRemountKey] = useState(0);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', height: 460, position: 'relative', padding: 16 }}>
      <button id="new-feature-btn" style={{ position: 'absolute', top: 20, left: 20 }}>
        New Feature
      </button>
      <button id="settings-icon" style={{ position: 'absolute', top: 20, right: 20 }}>
        ⚙ Settings
      </button>
      <button id="footer-link" style={{ position: 'absolute', bottom: 10, left: 20 }}>
        Help
      </button>

      <button
        data-testid="simulate-reload"
        onClick={() => setRemountKey((k) => k + 1)}
        style={{ position: 'absolute', top: 200, left: 20, fontSize: 12 }}
      >
        Simulate reload (remount)
      </button>

      <TourOverlay key={remountKey} tourId="demo-tour" steps={STEPS} />
    </div>
  );
}
