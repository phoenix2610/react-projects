// Audio Waveform Trimmer
//
// No audio file to upload here — a short tone is synthesized as raw PCM,
// encoded into a real WAV container, and then decoded back out through
// `AudioContext.decodeAudioData`, so the "decode with Web Audio" step is
// exercised against real encoded bytes rather than a hand-built
// AudioBuffer. Peaks are computed by taking the min/max sample in each
// pixel-column's bucket of the decoded channel data and drawn to canvas.
// Trimming builds a new PCM slice from the selected range and re-encodes
// it as its own WAV blob — since WAV is uncompressed, the exported byte
// size is exactly `44 + samples * bytesPerSample`, a precise, checkable
// relationship rather than an approximation.
//
// Usage:
//   <WaveformTrimmer />

import { useEffect, useRef, useState } from 'react';

function encodePcmToWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function synthesizeTone(duration: number, sampleRate: number): Float32Array {
  const length = Math.floor(duration * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const freq = 220 + 440 * (t / duration); // sweep 220Hz -> 660Hz
    const envelope = 0.5 + 0.5 * Math.sin((Math.PI * t) / duration); // gentle amplitude swell
    samples[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.8;
  }
  return samples;
}

function computePeaks(channelData: Float32Array, buckets: number): { min: number; max: number }[] {
  const bucketSize = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: { min: number; max: number }[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSize;
    const end = Math.min(channelData.length, start + bucketSize);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = channelData[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push({ min, max });
  }
  return peaks;
}

const SAMPLE_RATE = 44100;
const DURATION = 2; // seconds
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 120;

export default function WaveformTrimmer() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [trimStart, setTrimStart] = useState(0.4);
  const [trimEnd, setTrimEnd] = useState(1.5);
  const [exportInfo, setExportInfo] = useState<{ duration: number; bytes: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  useEffect(() => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const wav = encodePcmToWav(synthesizeTone(DURATION, SAMPLE_RATE), SAMPLE_RATE);
    wav.arrayBuffer().then((arr) => {
      ctx.decodeAudioData(arr.slice(0), (decoded) => setBuffer(decoded));
    });
    return () => {
      void ctx.close();
    };
  }, []);

  useEffect(() => {
    if (!buffer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const peaks = computePeaks(buffer.getChannelData(0), CANVAS_WIDTH);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const midY = CANVAS_HEIGHT / 2;
    for (let x = 0; x < peaks.length; x++) {
      const t = (x / CANVAS_WIDTH) * buffer.duration;
      const inTrim = t >= trimStart && t <= trimEnd;
      ctx.strokeStyle = inTrim ? '#3b82f6' : '#4b5563';
      ctx.beginPath();
      ctx.moveTo(x, midY + peaks[x].min * midY);
      ctx.lineTo(x, midY + peaks[x].max * midY);
      ctx.stroke();
    }

    const startX = (trimStart / buffer.duration) * CANVAS_WIDTH;
    const endX = (trimEnd / buffer.duration) * CANVAS_WIDTH;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(startX - 1, 0, 2, CANVAS_HEIGHT);
    ctx.fillRect(endX - 1, 0, 2, CANVAS_HEIGHT);
  }, [buffer, trimStart, trimEnd]);

  function xToTime(clientX: number): number {
    if (!buffer || !canvasRef.current) return 0;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(CANVAS_WIDTH, clientX - rect.left));
    return (x / CANVAS_WIDTH) * buffer.duration;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!buffer) return;
    const t = xToTime(e.clientX);
    dragging.current = Math.abs(t - trimStart) < Math.abs(t - trimEnd) ? 'start' : 'end';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !buffer) return;
    const t = xToTime(e.clientX);
    if (dragging.current === 'start') setTrimStart(Math.min(t, trimEnd - 0.05));
    else setTrimEnd(Math.max(t, trimStart + 0.05));
  }

  function exportClip() {
    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const startIdx = Math.floor(trimStart * buffer.sampleRate);
    const endIdx = Math.floor(trimEnd * buffer.sampleRate);
    const slice = data.slice(startIdx, endIdx);
    const blob = encodePcmToWav(slice, buffer.sampleRate);
    setExportInfo({ duration: slice.length / buffer.sampleRate, bytes: blob.size });
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, width: CANVAS_WIDTH }}>
      {!buffer ? (
        <div data-testid="loading">Decoding audio…</div>
      ) : (
        <>
          <div data-testid="duration" style={{ fontSize: 12, marginBottom: 4 }}>
            Duration: {buffer.duration.toFixed(2)}s
          </div>
          <canvas
            ref={canvasRef}
            data-testid="waveform-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragging.current = null)}
            style={{ touchAction: 'none', cursor: 'ew-resize' }}
          />
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 8 }}>
            <label>
              Start:{' '}
              <input
                data-testid="trim-start-input"
                type="number"
                step={0.05}
                value={trimStart.toFixed(2)}
                onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.05))}
                style={{ width: 60 }}
              />
            </label>
            <label>
              End:{' '}
              <input
                data-testid="trim-end-input"
                type="number"
                step={0.05}
                value={trimEnd.toFixed(2)}
                onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.05))}
                style={{ width: 60 }}
              />
            </label>
          </div>
          <button data-testid="export-btn" onClick={exportClip} style={{ marginTop: 8 }}>
            Export trimmed clip
          </button>
          {exportInfo && (
            <div data-testid="export-info" style={{ fontSize: 12, marginTop: 6 }}>
              Exported {exportInfo.duration.toFixed(2)}s, {exportInfo.bytes.toLocaleString()} bytes
            </div>
          )}
        </>
      )}
    </div>
  );
}
