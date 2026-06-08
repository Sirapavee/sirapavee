import { useEffect, useRef, useState } from 'react';

interface FPSMonitorProps {
  /** Show graph history alongside the number. Default true. */
  graph?: boolean;
  /** Number of frames to keep in history. Default 60. */
  historyFrames?: number;
  /** Update the displayed number every N ms. Default 250. */
  updateIntervalMs?: number;
}

export const FPSMonitor = ({
  graph = true,
  historyFrames = 60,
  updateIntervalMs = 250,
}: FPSMonitorProps) => {
  const [fps, setFps] = useState(0);
  const [avg, setAvg] = useState(0);
  const [min, setMin] = useState(0);

  // Per-frame state lives in refs so the rAF loop never triggers re-renders.
  // React state updates only happen on the throttled interval below.
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameRef = useRef<number>(performance.now());
  const lastUpdateRef = useRef<number>(performance.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;

    const tick = (now: number) => {
      const delta = now - lastFrameRef.current;
      lastFrameRef.current = now;

      // Skip absurdly long deltas — they happen on tab refocus, alt-tab, etc.
      // and would tank the average for several seconds.
      if (delta < 500) {
        const arr = frameTimesRef.current;
        arr.push(delta);
        if (arr.length > historyFrames) arr.shift();
      }

      // Throttled state update — the rAF runs at native refresh rate, but we
      // only re-render the React tree a few times per second.
      if (now - lastUpdateRef.current >= updateIntervalMs) {
        const arr = frameTimesRef.current;
        if (arr.length > 0) {
          const sum = arr.reduce((s, d) => s + d, 0);
          const avgDelta = sum / arr.length;
          const maxDelta = Math.max(...arr);

          setFps(Math.round(1000 / delta));
          setAvg(Math.round(1000 / avgDelta));
          setMin(Math.round(1000 / maxDelta));
        }
        lastUpdateRef.current = now;

        // Paint the graph on the same throttled cadence — no need to
        // redraw 120× per second for a 60-sample sparkline.
        if (graph) drawGraph(canvasRef.current, frameTimesRef.current);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [graph, historyFrames, updateIntervalMs]);

  // Color codes the headline number against common refresh-rate targets.
  const fpsColor =
    fps >= 110
      ? '#7CFFB2' // 120Hz target
      : fps >= 55
        ? '#FFD27C' // 60Hz target
        : '#FF7C7C'; // struggling

  return (
    <div
      className='pointer-events-none fixed top-1/2 right-4 z-50 -translate-y-1/2 select-none'
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
    >
      <div
        className='relative border border-cyan-300/15 bg-black/55 px-3 py-2 text-cyan-50/90'
        style={{
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        }}
      >
        <span className='absolute -top-px -left-px h-2 w-2 border-t border-l border-cyan-300/70' />
        <span className='absolute -top-px -right-px h-2 w-2 border-t border-r border-cyan-300/70' />
        <span className='absolute -bottom-px -left-px h-2 w-2 border-b border-l border-cyan-300/70' />
        <span className='absolute -right-px -bottom-px h-2 w-2 border-r border-b border-cyan-300/70' />

        <div className='flex items-baseline gap-2'>
          <span
            className='text-2xl leading-none tabular-nums'
            style={{ color: fpsColor }}
          >
            {fps.toString().padStart(3, ' ')}
          </span>
          <span className='text-[8px] tracking-[0.18em] text-cyan-300/50'>FPS</span>
        </div>

        <div className='mt-1 flex justify-between gap-3 text-[8px] tracking-[0.12em] text-cyan-50/45'>
          <span>
            AVG <span className='text-cyan-200/70 tabular-nums'>{avg}</span>
          </span>
          <span>
            MIN <span className='text-cyan-200/70 tabular-nums'>{min}</span>
          </span>
        </div>

        {graph && (
          <canvas
            ref={canvasRef}
            width={120}
            height={24}
            className='mt-1.5 block'
            style={{ width: 120, height: 24 }}
          />
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 *  Graph painter — kept outside the component so it doesn't close over
 *  React state, and so the rAF loop never causes re-renders.
 * ─────────────────────────────────────────────────────────────────────── */
const drawGraph = (canvas: HTMLCanvasElement | null, history: number[]): void => {
  if (!canvas || history.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Reference lines at 60fps (16.67ms) and 120fps (8.33ms).
  // Anything below the 120 line means you're hitting that target.
  const yFor = (deltaMs: number) => {
    // Plot range: 0ms (top) to 33.3ms (30fps, bottom). Anything slower
    // gets clamped to the bottom edge.
    const clamped = Math.min(deltaMs, 33.3);
    return (clamped / 33.3) * h;
  };

  // Target lines.
  ctx.strokeStyle = 'rgba(124, 255, 178, 0.18)';
  ctx.beginPath();
  ctx.moveTo(0, yFor(8.33));
  ctx.lineTo(w, yFor(8.33));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 210, 124, 0.14)';
  ctx.beginPath();
  ctx.moveTo(0, yFor(16.67));
  ctx.lineTo(w, yFor(16.67));
  ctx.stroke();

  // Frame-time line.
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    const x = (i / (history.length - 1 || 1)) * w;
    const y = yFor(history[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
};
