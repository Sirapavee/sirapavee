import {
  createContext,
  FC,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DEFAULT_DURATIONS,
  getJetSpecs,
  HOLE_FINAL_RADIUS,
  HOLE_GROWTH_POWER,
  HOLE_THRESHOLD,
  JetSpec,
  SVG_NS,
} from '@/components/Scene/Hyperspace/const';
import {
  buildRiftClipPath,
  generateJet,
  pointsToSvgPath,
} from '@/components/Scene/Hyperspace/utils';

export type HyperspacePhase =
  | 'idle'
  | 'charging'
  | 'jumping'
  | 'cruising'
  | 'decelerating';

export interface JumpOptions {
  /**
   * Fires at the cruising → decelerating boundary, before the inside-out
   * reveal begins. The screen is fully covered by the tunnel at this moment,
   * so this is the safe time to scroll, swap state, change routes, etc. —
   * any visual change is hidden behind the warp.
   */
  onArrival?: () => void;

  /**
   * Fires after the entire sequence ends + unmountDelayMs has elapsed.
   * Useful for post-arrival cleanup, analytics, etc.
   */
  onComplete?: () => void;
}

export type HyperspaceProps = {
  /** The user's app. Always rendered, always reactive when phase === 'idle'. */
  children: ReactNode;
  /** Slash angle in degrees. -30 = upper-right to lower-left tear. Default -30. */
  slashAngleDeg?: number;
  /** Override individual phase durations (ms). */
  durations?: Partial<Record<Exclude<HyperspacePhase, 'idle'>, number>>;
  /** Delay in ms after sequence ends before onComplete fires. Default 2000. */
  unmountDelayMs?: number;
  /** Show the optional state bar HUD. Default true. */
  showStateBar?: boolean;
  /** Optional extra className for the root container. */
  className?: string;
};

export interface HyperspaceHandle {
  jump: (opts?: JumpOptions) => boolean;
  isActive: () => boolean;
  getPhase: () => HyperspacePhase;
}

export interface HyperspaceContextProps {
  /** Begin a jump. No-op + returns false if a jump is already running. */
  jump: (opts?: JumpOptions) => boolean;
  /** Current phase of the sequence. Updates trigger React renders. */
  phase: HyperspacePhase;
  /** Convenience: phase !== 'idle'. */
  isActive: boolean;

  lockLayerRef?: RefObject<HTMLDivElement | null>;

  hyperspaceRef?: RefObject<HTMLDivElement | null>;
  phaseRef: RefObject<HyperspacePhase>;
  progressFnRef: RefObject<() => number>;
  spinAccumRef: RefObject<number>;
  sparkRef: RefObject<HTMLDivElement | null>;
  jetsContainerRef: RefObject<SVGSVGElement | null>;
  dims: { w: number; h: number };
  chromaticRef: RefObject<HTMLDivElement | null>;
  portalRimRef: RefObject<HTMLDivElement | null>;
  motionStreakRef: RefObject<HTMLDivElement | null>;
}

export type HypespaceContextProviderProps = {
  ref: React.Ref<HyperspaceHandle>;
} & HyperspaceProps;

const HyperspaceContext = createContext<HyperspaceContextProps | null>(null);

export const HyperspaceProvider: FC<HypespaceContextProviderProps> = ({
  children,
  durations,
  ref,
  slashAngleDeg = -30,
  unmountDelayMs = 2000,
}) => {
  const slashAngle = (slashAngleDeg * Math.PI) / 180;
  const finalDurations = useMemo<Record<Exclude<HyperspacePhase, 'idle'>, number>>(
    () => ({ ...DEFAULT_DURATIONS, ...(durations ?? {}) }),
    [durations],
  );

  /* ---------------- State + refs ---------------- */
  const [phase, setPhase] = useState<HyperspacePhase>('idle');
  const phaseRef = useRef<HyperspacePhase>('idle');
  const phaseStartMsRef = useRef<number>(0);
  const spinAccumRef = useRef<number>(0);

  const jumpOptsRef = useRef<JumpOptions | null>(null);
  const arrivalFiredRef = useRef<boolean>(false);
  const completionTimerRef = useRef<number | null>(null);

  // DOM refs — high-frequency style writes go here directly
  const hyperspaceRef = useRef<HTMLDivElement | null>(null);
  const sparkRef = useRef<HTMLDivElement>(null);
  const motionStreakRef = useRef<HTMLDivElement>(null);
  const chromaticRef = useRef<HTMLDivElement>(null);
  const portalRimRef = useRef<HTMLDivElement>(null);
  const lockLayerRef = useRef<HTMLDivElement | null>(null);
  const jetsContainerRef = useRef<SVGSVGElement>(null);

  const spawnedJetIdxRef = useRef<Set<number>>(new Set());
  interface ActiveJet {
    group: SVGGElement;
    halo: HTMLDivElement;
    spawnTime: number;
    lifetime: number;
  }
  const activeJetsRef = useRef<ActiveJet[]>([]);

  const [dims, setDims] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  const jetSpecs = useMemo(() => getJetSpecs(slashAngleDeg), [slashAngleDeg]);

  /* ---------------- Progress reader ---------------- */
  const progressFnRef = useRef<() => number>(() => 0);
  useEffect(() => {
    progressFnRef.current = () => {
      if (phaseRef.current === 'idle') return 0;
      const dur = finalDurations[phaseRef.current as Exclude<HyperspacePhase, 'idle'>];
      const elapsed = performance.now() - phaseStartMsRef.current;
      return Math.min(elapsed / dur, 1);
    };
  }, [finalDurations]);

  /* ---------------- Jets (procedural fractal lightning) ---------------- */
  const clearAllJets = useCallback(() => {
    for (const j of activeJetsRef.current) {
      if (j.group.parentNode) j.group.parentNode.removeChild(j.group);
      if (j.halo.parentNode) j.halo.parentNode.removeChild(j.halo);
    }
    activeJetsRef.current = [];
  }, []);

  const spawnJet = useCallback(
    (spec: JetSpec) => {
      const svg = jetsContainerRef.current;
      if (!svg) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const cosA = Math.cos(slashAngle);
      const sinA = Math.sin(slashAngle);
      const ax = cx + spec.offsetAcross * cosA - spec.offsetAlong * sinA;
      const ay = cy + spec.offsetAcross * sinA + spec.offsetAlong * cosA;
      const angleRad = (spec.angleDeg * Math.PI) / 180;
      const branches = generateJet(spec.seed, ax, ay, angleRad, spec.length);

      const group = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      const haloLayer = document.createElementNS(SVG_NS, 'g');
      haloLayer.style.filter = 'blur(6px)';
      haloLayer.setAttribute('opacity', '0.65');
      const midLayer = document.createElementNS(SVG_NS, 'g');
      midLayer.style.filter = 'blur(2.5px)';
      midLayer.setAttribute('opacity', '0.85');
      const coreLayer = document.createElementNS(SVG_NS, 'g');

      for (const br of branches) {
        const d = pointsToSvgPath(br.points);
        const depthScale = br.depth === 0 ? 1 : br.depth === 1 ? 0.55 : 0.32;

        const halo = document.createElementNS(SVG_NS, 'path');
        halo.setAttribute('d', d);
        halo.setAttribute('stroke', 'url(#hsJetGradHalo)');
        halo.setAttribute('stroke-width', String(br.thickness * 5.5 * depthScale));
        halo.setAttribute('stroke-linecap', 'round');
        halo.setAttribute('stroke-linejoin', 'round');
        halo.setAttribute('fill', 'none');
        haloLayer.appendChild(halo);

        const mid = document.createElementNS(SVG_NS, 'path');
        mid.setAttribute('d', d);
        mid.setAttribute('stroke', 'url(#hsJetGrad)');
        mid.setAttribute('stroke-width', String(br.thickness * 2.0 * depthScale));
        mid.setAttribute('stroke-linecap', 'round');
        mid.setAttribute('stroke-linejoin', 'round');
        mid.setAttribute('fill', 'none');
        midLayer.appendChild(mid);

        const core = document.createElementNS(SVG_NS, 'path');
        core.setAttribute('d', d);
        core.setAttribute('stroke', '#ffffff');
        core.setAttribute(
          'stroke-width',
          String(Math.max(0.6, br.thickness * 0.45 * depthScale)),
        );
        core.setAttribute('stroke-linecap', 'round');
        core.setAttribute('stroke-linejoin', 'round');
        core.setAttribute('fill', 'none');
        core.setAttribute('opacity', '0.95');
        coreLayer.appendChild(core);
      }
      group.appendChild(haloLayer);
      group.appendChild(midLayer);
      group.appendChild(coreLayer);
      group.style.opacity = '0';
      svg.appendChild(group);

      const halo = document.createElement('div');
      const haloSize = spec.length * 0.45;
      halo.style.cssText = `
          position: fixed;
          pointer-events: none;
          border-radius: 50%;
          background: radial-gradient(circle,
            rgba(220,240,255,0.95) 0%,
            rgba(160,200,255,0.7) 12%,
            rgba(110,150,240,0.45) 30%,
            rgba(120,90,200,0.2) 55%,
            transparent 80%);
          mix-blend-mode: screen;
          filter: blur(4px);
          opacity: 0;
          will-change: opacity;
          transform: translate(-50%, -50%);
          z-index: 53;
          width: ${haloSize}px;
          height: ${haloSize}px;
          left: ${ax}px;
          top: ${ay}px;
        `;
      document.body.appendChild(halo);

      activeJetsRef.current.push({
        group,
        halo,
        spawnTime: performance.now(),
        lifetime: spec.lifetime * 1000,
      });
    },
    [slashAngle],
  );

  const updateJets = useCallback(() => {
    const now = performance.now();
    const arr = activeJetsRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      const j = arr[i];
      const age = now - j.spawnTime;
      const t = age / j.lifetime;
      if (t >= 1) {
        if (j.group.parentNode) j.group.parentNode.removeChild(j.group);
        if (j.halo.parentNode) j.halo.parentNode.removeChild(j.halo);
        arr.splice(i, 1);
        continue;
      }
      let opacity: number;
      if (t < 0.08) opacity = t / 0.08;
      else if (t < 0.25) opacity = 0.85 + 0.15 * Math.sin(age * 0.04);
      else opacity = Math.exp(-(t - 0.25) * 5.5);
      j.group.style.opacity = String(opacity);

      let haloOp: number;
      if (t < 0.1) haloOp = (t / 0.1) * 0.95;
      else if (t < 0.3) haloOp = 0.95;
      else haloOp = Math.exp(-(t - 0.3) * 6) * 0.95;
      j.halo.style.opacity = String(haloOp);
    }
  }, []);

  const maybeSpawnJets = useCallback(
    (progress: number) => {
      for (let i = 0; i < jetSpecs.length; i++) {
        if (!spawnedJetIdxRef.current.has(i) && progress >= jetSpecs[i].birth) {
          spawnJet(jetSpecs[i]);
          spawnedJetIdxRef.current.add(i);
        }
      }
    },
    [jetSpecs, spawnJet],
  );

  /* ---------------- Mask helpers — the inside-out reveal ----------------
       The tunnel layer's CSS mask uses a radial-gradient with two stops at
       the SAME percentage to create a hard-edged hole. Inside the hole =
       transparent (children show through); outside = opaque (tunnel visible).
       At hole=0%, the entire tunnel is shown (no hole).
       At hole>=100%, the entire tunnel is hidden (children fully revealed).
    */
  const setHoleRadius = useCallback((holePercent: number) => {
    const el = hyperspaceRef.current;
    if (!el) return;
    // Clamp so we don't generate degenerate gradients
    const r = Math.max(0, Math.min(200, holePercent));
    const mask = `radial-gradient(circle at 50% 50%, transparent ${r.toFixed(2)}%, black ${r.toFixed(2)}%)`;
    el.style.maskImage = mask;
    (el.style as any).webkitMaskImage = mask;
  }, []);

  const clearHole = useCallback(() => {
    const el = hyperspaceRef.current;
    if (!el) return;
    el.style.maskImage = 'none';
    (el.style as any).webkitMaskImage = 'none';
  }, []);

  /* ---------------- Hard reset — kills every visual residual ---------------- */
  const hardReset = useCallback(() => {
    // Hyperspace tunnel layer — collapse clip-path AND clear mask AND filter
    const hs = hyperspaceRef.current;
    if (hs) {
      const cp = 'polygon(50% 50%, 50% 50%, 50% 50%)';
      hs.style.clipPath = cp;
      (hs.style as any).webkitClipPath = cp;
      hs.style.maskImage = 'none';
      (hs.style as any).webkitMaskImage = 'none';
      hs.style.filter = 'none';
    }
    // Spark — opacity AND inline height/transform that may have stuck
    if (sparkRef.current) {
      sparkRef.current.style.opacity = '0';
      sparkRef.current.style.height = '320px';
    }
    // Motion streak
    if (motionStreakRef.current) motionStreakRef.current.style.opacity = '0';
    // Chromatic
    if (chromaticRef.current) chromaticRef.current.style.opacity = '0';
    // Portal rim — opacity AND --rim variable (otherwise residual radial gradient)
    if (portalRimRef.current) {
      portalRimRef.current.style.opacity = '0';
      portalRimRef.current.style.setProperty('--rim', '0%');
    }
    // Lock layer — let clicks through
    if (lockLayerRef.current) lockLayerRef.current.style.pointerEvents = 'auto';
    // Spin accumulator
    spinAccumRef.current = 0;
    // Jets — DOM nodes
    clearAllJets();

    // NOTE: restore pointer events and scrolling
    document.body.style.pointerEvents = 'auto';
    document.body.style.overflow = 'auto';
  }, [clearAllJets]);

  /* ---------------- Phase transitions ---------------- */
  const advancePhase = useCallback(
    (next: HyperspacePhase) => {
      const prev = phaseRef.current;
      phaseRef.current = next;
      phaseStartMsRef.current = performance.now();
      setPhase(next);

      if (next === 'charging') {
        spawnedJetIdxRef.current.clear();
        clearAllJets();
      } else if (next === 'idle') {
        clearAllJets();
      }

      // Fire onArrival exactly once at cruising → decelerating
      if (
        prev === 'cruising' &&
        next === 'decelerating' &&
        jumpOptsRef.current?.onArrival &&
        !arrivalFiredRef.current
      ) {
        arrivalFiredRef.current = true;
        try {
          jumpOptsRef.current.onArrival();
        } catch (err) {
          console.error('[Hyperspace] onArrival threw:', err);
        }
      }
    },
    [clearAllJets],
  );

  /* ---------------- Per-frame DOM update loop ---------------- */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now() / 1000;
      const ph = phaseRef.current;
      const p = progressFnRef.current();

      updateJets();

      switch (ph) {
        case 'idle': {
          // Belt-and-suspenders: hardReset on every idle frame to mop up
          // any stale styles introduced from outside.
          hardReset();
          break;
        }

        case 'charging': {
          if (hyperspaceRef.current) {
            const cp = buildRiftClipPath(p, t, slashAngle, dims.w, dims.h);
            hyperspaceRef.current.style.clipPath = cp;
            (hyperspaceRef.current.style as any).webkitClipPath = cp;
          }
          // No mask during charging — clip-path is the rift opening
          clearHole();

          if (sparkRef.current) {
            if (p < 0.13) {
              const sparkOp = p < 0.03 ? p / 0.03 : 1 - (p - 0.03) / 0.1;
              sparkRef.current.style.opacity = String(Math.max(0, Math.min(1, sparkOp)));
              const sparkH = 100 + p * 320;
              sparkRef.current.style.height = `${sparkH.toFixed(0)}px`;
            } else {
              sparkRef.current.style.opacity = '0';
            }
          }

          if (motionStreakRef.current) {
            const streakBand =
              p < 0.05 ? p / 0.05 : p < 0.4 ? 1 : p < 0.55 ? 1 - (p - 0.4) / 0.15 : 0;
            motionStreakRef.current.style.opacity = String(streakBand * 0.85);
          }

          if (chromaticRef.current) {
            const chromaP = Math.sin(Math.min(1, p / 0.55) * Math.PI);
            chromaticRef.current.style.opacity = String(chromaP * 0.55);
          }

          maybeSpawnJets(p);

          if (p >= 1) advancePhase('jumping');
          break;
        }

        case 'jumping': {
          if (hyperspaceRef.current) {
            hyperspaceRef.current.style.clipPath = 'inset(0)';
            (hyperspaceRef.current.style as any).webkitClipPath = 'inset(0)';
          }
          clearHole();
          if (sparkRef.current) sparkRef.current.style.opacity = '0';
          if (motionStreakRef.current) motionStreakRef.current.style.opacity = '0';
          if (chromaticRef.current) chromaticRef.current.style.opacity = '0';
          if (p >= 1) advancePhase('cruising');
          break;
        }

        case 'cruising': {
          if (hyperspaceRef.current) {
            hyperspaceRef.current.style.clipPath = 'inset(0)';
            (hyperspaceRef.current.style as any).webkitClipPath = 'inset(0)';
          }
          clearHole();
          if (p >= 1) advancePhase('decelerating');
          break;
        }

        case 'decelerating': {
          if (hyperspaceRef.current) {
            hyperspaceRef.current.style.clipPath = 'inset(0)';
            (hyperspaceRef.current.style as any).webkitClipPath = 'inset(0)';
          }

          // ---- INSIDE-OUT REVEAL via CSS mask ----
          // Before HOLE_THRESHOLD: tunnel fully covers (no hole)
          // After HOLE_THRESHOLD: hole grows from 0% to 150% with steep ease-in
          if (p < HOLE_THRESHOLD) {
            clearHole();
            if (portalRimRef.current) portalRimRef.current.style.opacity = '0';
            if (lockLayerRef.current) lockLayerRef.current.style.pointerEvents = 'auto';
          } else {
            const growth = (p - HOLE_THRESHOLD) / (1 - HOLE_THRESHOLD);
            const radius = Math.pow(growth, HOLE_GROWTH_POWER) * HOLE_FINAL_RADIUS;
            setHoleRadius(radius);

            // Portal rim — bright ring at the hole boundary
            if (portalRimRef.current) {
              portalRimRef.current.style.setProperty('--rim', `${radius.toFixed(2)}%`);
              const rimVisGate = Math.min(1, Math.max(0, (radius - 2) / 4));
              const rimPeak = Math.sin(growth * Math.PI) * 0.9;
              portalRimRef.current.style.opacity = String(rimVisGate * rimPeak);
            }

            // Pointer-events handoff: once the hole is meaningfully open,
            // let clicks pass through to children. Sharp threshold at 6%
            // (matches the rim's visibility gate so the user doesn't see
            // a clickable area before the visual reveal).
            if (lockLayerRef.current) {
              lockLayerRef.current.style.pointerEvents = radius > 6 ? 'none' : 'auto';
            }
          }

          if (p >= 1) {
            advancePhase('idle');
            // Hard reset — kills every possible residual artifact
            hardReset();

            if (completionTimerRef.current !== null) {
              window.clearTimeout(completionTimerRef.current);
            }
            const opts = jumpOptsRef.current;
            completionTimerRef.current = window.setTimeout(() => {
              if (opts?.onComplete) {
                try {
                  opts.onComplete();
                } catch (err) {
                  console.error('[Hyperspace] onComplete threw:', err);
                }
              }
              jumpOptsRef.current = null;
              arrivalFiredRef.current = false;
              completionTimerRef.current = null;
            }, unmountDelayMs);
          }
          break;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    advancePhase,
    clearHole,
    dims.h,
    dims.w,
    hardReset,
    maybeSpawnJets,
    setHoleRadius,
    slashAngle,
    unmountDelayMs,
    updateJets,
  ]);

  /* ---------------- Resize handling ---------------- */
  useEffect(() => {
    const onResize = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ---------------- Cleanup on unmount ---------------- */
  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      clearAllJets();
    };
  }, [clearAllJets]);

  /* ---------------- The jump function ---------------- */
  const jump = useCallback(
    (opts?: JumpOptions): boolean => {
      if (phaseRef.current !== 'idle') {
        return false;
      }

      jumpOptsRef.current = opts ?? null;
      arrivalFiredRef.current = false;
      advancePhase('charging');

      // NOTE: disable pointer events and scrolling immediately to prevent any
      // interaction during the critical charging → jumping → cruising phases,
      // where the visual transition is happening but onArrival hasn't fired yet.
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.style.pointerEvents = 'none';
      document.body.style.overflow = 'hidden';

      return true;
    },
    [advancePhase],
  );

  useImperativeHandle(
    ref,
    () => ({
      jump: (opts) => jump(opts),
      isActive: () => phaseRef.current !== 'idle',
      getPhase: () => phaseRef.current,
    }),
    [jump],
  );

  const contextValue = useMemo<HyperspaceContextProps>(
    () => ({
      jump,
      phase,
      isActive: phase !== 'idle',
      lockLayerRef,
      hyperspaceRef,
      phaseRef,
      progressFnRef,
      spinAccumRef,
      sparkRef,
      jetsContainerRef,
      dims,
      chromaticRef,
      portalRimRef,
      motionStreakRef,
    }),
    [dims, jump, phase],
  );

  return (
    <HyperspaceContext.Provider value={contextValue}>
      {children}
    </HyperspaceContext.Provider>
  );
};

export const useHyperspaceContext = (): HyperspaceContextProps => {
  const ctx = useContext(HyperspaceContext);

  if (!ctx) {
    throw new Error('useHyperspaceContext must be used within a HyperspaceProvider');
  }

  return ctx;
};
