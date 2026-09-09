// Image Crop and Compress Tool
//
// A crop box over a canvas, resized by dragging one of four corner
// handles. Each handle drag is computed relative to the OPPOSITE corner
// (the anchor), which stays fixed — that's what makes resizing from any
// corner behave correctly instead of only working from one. With an
// aspect ratio locked, height is derived from the dragged width rather
// than letting both float independently. The byte-size readout is real:
// every crop or quality change re-draws the selected region onto an
// off-screen canvas and calls `toBlob(..., 'image/jpeg', quality)`,
// so a lower quality slider or a smaller crop genuinely produces a
// smaller encoded file, not a simulated number.
//
// Usage:
//   <ImageCropTool />
//
// The source image is generated procedurally (deterministic pseudo-noise,
// not Math.random) so the tool works offline and the byte-size behavior
// is reproducible.

import { useEffect, useRef, useState } from 'react';

const SRC_WIDTH = 300;
const SRC_HEIGHT = 200;

function noiseColor(x: number, y: number): [number, number, number] {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const n = v - Math.floor(v);
  return [Math.floor(n * 255), Math.floor(((n * 7) % 1) * 255), Math.floor(((n * 13) % 1) * 255)];
}

function drawSourceImage(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const block = 4;
  for (let y = 0; y < SRC_HEIGHT; y += block) {
    for (let x = 0; x < SRC_WIDTH; x += block) {
      const [r, g, b] = noiseColor(x, y);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, block, block);
    }
  }
}

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Handle = 'nw' | 'ne' | 'sw' | 'se';

const MIN_SIZE = 20;

function resizeFromAnchor(anchor: { x: number; y: number }, pointer: { x: number; y: number }, aspectRatio: number | null): Crop {
  const dirX = pointer.x >= anchor.x ? 1 : -1;
  const dirY = pointer.y >= anchor.y ? 1 : -1;
  // The most either dimension could ever be, given the anchor is fixed and
  // the box can't cross the canvas edge -- computed independently of the
  // aspect ratio so clamping and ratio-fitting don't fight each other.
  const maxW = dirX === 1 ? SRC_WIDTH - anchor.x : anchor.x;
  const maxH = dirY === 1 ? SRC_HEIGHT - anchor.y : anchor.y;

  let w = Math.max(MIN_SIZE, Math.min(maxW, Math.abs(pointer.x - anchor.x)));
  let h = Math.max(MIN_SIZE, Math.min(maxH, Math.abs(pointer.y - anchor.y)));

  if (aspectRatio) {
    h = w / aspectRatio;
    if (h > maxH) {
      // Height was the binding constraint (e.g. anchor near the top/bottom
      // edge) -- shrink width to match rather than letting height clamp
      // alone and silently break the ratio.
      h = maxH;
      w = h * aspectRatio;
    }
    if (w > maxW) {
      w = maxW;
      h = w / aspectRatio;
    }
  }

  const x = dirX === 1 ? anchor.x : anchor.x - w;
  const y = dirY === 1 ? anchor.y : anchor.y - h;
  return { x, y, w, h };
}

const ANCHOR_FOR_HANDLE: Record<Handle, (c: Crop) => { x: number; y: number }> = {
  nw: (c) => ({ x: c.x + c.w, y: c.y + c.h }),
  ne: (c) => ({ x: c.x, y: c.y + c.h }),
  sw: (c) => ({ x: c.x + c.w, y: c.y }),
  se: (c) => ({ x: c.x, y: c.y }),
};

const ASPECT_OPTIONS: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:3', ratio: 4 / 3 },
];

export default function ImageCropTool() {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>({ x: 50, y: 40, w: 150, h: 100 });
  const [aspect, setAspect] = useState<number | null>(null);
  const [quality, setQuality] = useState(0.8);
  const [byteSize, setByteSize] = useState<number | null>(null);
  const dragState = useRef<{ mode: 'move'; offsetX: number; offsetY: number } | { mode: 'resize'; handle: Handle; anchor: { x: number; y: number } } | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (sourceRef.current) drawSourceImage(sourceRef.current);
  }, []);

  useEffect(() => {
    if (!sourceRef.current) return;
    const myId = ++requestId.current;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.max(1, Math.round(crop.w));
    cropCanvas.height = Math.max(1, Math.round(crop.h));
    const ctx = cropCanvas.getContext('2d')!;
    ctx.drawImage(sourceRef.current, crop.x, crop.y, crop.w, crop.h, 0, 0, cropCanvas.width, cropCanvas.height);
    cropCanvas.toBlob(
      (blob) => {
        if (requestId.current !== myId) return; // a newer request superseded this one
        setByteSize(blob ? blob.size : null);
      },
      'image/jpeg',
      quality,
    );
  }, [crop.x, crop.y, crop.w, crop.h, quality]);

  function pointerPos(e: React.PointerEvent): { x: number; y: number } {
    const rect = (e.currentTarget.closest('[data-testid="crop-stage"]') as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startMove(e: React.PointerEvent) {
    const p = pointerPos(e);
    dragState.current = { mode: 'move', offsetX: p.x - crop.x, offsetY: p.y - crop.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function startResize(e: React.PointerEvent, handle: Handle) {
    e.stopPropagation();
    dragState.current = { mode: 'resize', handle, anchor: ANCHOR_FOR_HANDLE[handle](crop) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const p = pointerPos(e);
    if (drag.mode === 'move') {
      const x = Math.max(0, Math.min(p.x - drag.offsetX, SRC_WIDTH - crop.w));
      const y = Math.max(0, Math.min(p.y - drag.offsetY, SRC_HEIGHT - crop.h));
      setCrop((c) => ({ ...c, x, y }));
    } else {
      setCrop(resizeFromAnchor(drag.anchor, p, aspect));
    }
  }

  function endDrag() {
    dragState.current = null;
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <div
        data-testid="crop-stage"
        style={{ position: 'relative', width: SRC_WIDTH, height: SRC_HEIGHT }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
      >
        <canvas ref={sourceRef} data-testid="source-canvas" width={SRC_WIDTH} height={SRC_HEIGHT} />
        <div
          data-testid="crop-box"
          data-x={Math.round(crop.x)}
          data-y={Math.round(crop.y)}
          data-w={Math.round(crop.w)}
          data-h={Math.round(crop.h)}
          onPointerDown={startMove}
          style={{
            position: 'absolute',
            left: crop.x,
            top: crop.y,
            width: crop.w,
            height: crop.h,
            border: '2px solid #facc15',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            cursor: 'move',
            touchAction: 'none',
          }}
        >
          {(['nw', 'ne', 'sw', 'se'] as Handle[]).map((handle) => (
            <div
              key={handle}
              data-testid="resize-handle"
              data-handle={handle}
              onPointerDown={(e) => startResize(e, handle)}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                background: '#facc15',
                top: handle.includes('n') ? -5 : undefined,
                bottom: handle.includes('s') ? -5 : undefined,
                left: handle.includes('w') ? -5 : undefined,
                right: handle.includes('e') ? -5 : undefined,
                cursor: `${handle}-resize`,
                touchAction: 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6, width: SRC_WIDTH }}>
        <label>
          Aspect:{' '}
          <select
            data-testid="aspect-select"
            value={ASPECT_OPTIONS.findIndex((o) => o.ratio === aspect)}
            onChange={(e) => setAspect(ASPECT_OPTIONS[Number(e.target.value)].ratio)}
          >
            {ASPECT_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quality: {quality.toFixed(2)}
          <input
            data-testid="quality-slider"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <div data-testid="byte-size">{byteSize !== null ? `${byteSize.toLocaleString()} bytes` : 'Encoding…'}</div>
      </div>
    </div>
  );
}
