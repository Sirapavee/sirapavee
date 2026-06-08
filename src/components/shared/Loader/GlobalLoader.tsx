'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { LiquidGlass } from '../LiquidGlass';

import { useHyperspaceContext } from '@/providers/HyperspaceProvider';

/* ─────────────────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────────────────── */

interface LoaderTask {
  id: string;
  label: string;
  weight: number;
  done: boolean;
}

interface LoaderAPI {
  /** Wrap any async work so its progress feeds the global bar. Returns the
   *  same promise it was given, so it composes cleanly with .then / await. */
  track: <T>(label: string, fn: () => Promise<T>, weight?: number) => Promise<T>;

  /** Preload + cache a texture. Subsequent calls with the same URL resolve
   *  immediately from the cache. */
  preloadTexture: (url: string) => Promise<THREE.Texture>;

  /** Preload + cache a 6-face cubemap. */
  preloadCubeTexture: (
    urls: [string, string, string, string, string, string],
  ) => Promise<THREE.CubeTexture>;

  /** Mark a material to be force-touched during warmup. Rare — gl.compile on
   *  the whole scene already covers materials that are mounted in the tree. */
  warmMaterial: (mat: THREE.Material) => void;

  /** 0–100 integer. */
  progress: number;
  /** True until everything resolves (tasks + warmup + min-duration). */
  isLoading: boolean;
  /** Human-readable status for the loading screen. */
  label: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Module-level caches
 *  Living outside React keeps them across StrictMode double-mounts and HMR.
 * ──────────────────────────────────────────────────────────────────────────── */

const textureCache = new Map<string, THREE.Texture>();
const cubeTextureCache = new Map<string, THREE.CubeTexture>();
const materialWarmQueue = new Set<THREE.Material>();

const _textureLoader = new THREE.TextureLoader();
const _cubeLoader = new THREE.CubeTextureLoader();

/* ─────────────────────────────────────────────────────────────────────────────
 *  Context
 * ──────────────────────────────────────────────────────────────────────────── */

const LoaderContext = createContext<LoaderAPI | null>(null);

export function useGlobalLoader(): LoaderAPI {
  const ctx = useContext(LoaderContext);
  if (!ctx) throw new Error('useGlobalLoader must be used inside <LoaderProvider>');
  return ctx;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  WarmupRunner — lives inside <Canvas>
 *
 *  Once we're told the scene is settled, we run two things on the next frame:
 *    • gl.compile(scene, camera) — eagerly compiles every program in the tree
 *      so the first user-visible frame doesn't stall on shader compilation.
 *    • gl.render(scene, camera)  — forces the first draw, which uploads
 *      InstancedBufferAttribute data, vertex buffers, and any pending textures
 *      to the GPU. After this, real frames fly.
 * ──────────────────────────────────────────────────────────────────────────── */

interface WarmupRunnerProps {
  ready: boolean;
  onDone: () => void;
}

export function WarmupRunner({ ready, onDone }: WarmupRunnerProps) {
  const { gl, scene, camera } = useThree();
  const fired = useRef(false);

  useFrame(() => {
    if (!ready || fired.current) return;
    fired.current = true;

    // Drain anything explicitly queued via warmMaterial(). The flag bumps the
    // material's program version so gl.compile actually re-walks it.
    materialWarmQueue.forEach((mat) => {
      mat.needsUpdate = true;
    });
    materialWarmQueue.clear();

    // Compile + first draw. Order matters: compile schedules program builds,
    // render flushes uploads.
    gl.compile(scene, camera);
    gl.render(scene, camera);

    // Yield a frame so drivers can flush, then signal done.
    requestAnimationFrame(onDone);
  });

  return null;
}

function useAnimatedNumber(
  target: number,
  opts?: { speed?: number; minDuration?: number; maxDuration?: number },
) {
  const { speed = 80, minDuration = 300, maxDuration = 1200 } = opts ?? {};
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = displayRef.current;
    if (target === from) return;

    // Duration scales with delta but is clamped — so 0→80 takes ~1s and
    // 80→100 takes ~300ms (clamped to min). Bigger jumps still feel weighty.
    const delta = Math.abs(target - from);
    const duration = Math.max(minDuration, Math.min(maxDuration, (delta / speed) * 1000));
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — settles softly
      const v = from + (target - from) * eased;
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, speed, minDuration, maxDuration]);

  return display;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Loading Screen
 * ──────────────────────────────────────────────────────────────────────────── */

interface LoadingScreenProps {
  progress: number;
  label: string;
  visible: boolean;
}

function LoadingScreen({ progress, label, visible }: LoadingScreenProps) {
  // Keep mounted briefly after `visible` flips false so the fade-out plays,
  // then unmount entirely so it never blocks pointer events post-load.
  const [mounted, setMounted] = useState(true);
  const animated = useAnimatedNumber(progress);
  const displayed = Math.round(animated);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 700);
    return () => clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center',
        'transition-opacity duration-700',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      style={{
        background: 'radial-gradient(ellipse at 50% 60%, #050816 0%, #000003 70%)',
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
      }}
    >
      <div className='relative w-[min(440px,86vw)]'>
        {/* Corner brackets — same probe-ctrl aesthetic as your HUD. */}
        {/* <span className='absolute -top-px -left-px h-3 w-3 border-t border-l border-cyan-300/70' />
        <span className='absolute -top-px -right-px h-3 w-3 border-t border-r border-cyan-300/70' />
        <span className='absolute -bottom-px -left-px h-3 w-3 border-b border-l border-cyan-300/70' />
        <span className='absolute -right-px -bottom-px h-3 w-3 border-r border-b border-cyan-300/70' /> */}

        <div
          className='border border-cyan-300/15 bg-black/55 px-6 py-6 text-cyan-50/90'
          style={{
            backdropFilter: 'blur(12px) saturate(140%)',
            WebkitBackdropFilter: 'blur(12px) saturate(140%)',
          }}
        >
          <div className='mb-5 flex items-baseline justify-between'>
            <h2
              className='m-0 text-[11px] tracking-[0.35em] text-cyan-200/90'
              style={
                {
                  /* unchanged */
                }
              }
            >
              probe boot
            </h2>
            <span className='text-[10px] tracking-[0.18em] text-cyan-200/70 tabular-nums'>
              {String(displayed).padStart(3, '0')}%
            </span>
          </div>

          <div className='relative h-[3px] w-full overflow-hidden bg-cyan-300/10'>
            <div
              className='absolute top-0 left-0 h-full bg-cyan-300/85'
              style={{ width: `${animated}%` }}
            />
            <div
              className='pointer-events-none absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-transparent via-cyan-100/60 to-transparent'
              style={{
                transform: `translate3d(calc(${animated}% - 24px), 0, 0)`,
                opacity: animated > 0.5 && animated < 99.5 ? 1 : 0,
              }}
            />
          </div>

          {/* Status row */}
          <div className='mt-4 flex items-center gap-2 text-[10px] tracking-[0.2em] text-cyan-200/55'>
            <span className='inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300/80' />
            <span className='truncate uppercase'>{label}</span>
          </div>

          <p className='mt-2 mb-0 text-[9px] leading-snug tracking-[0.18em] text-cyan-200/25'>
            uploading buffers · compiling shaders · warming pipelines
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Provider
 * ──────────────────────────────────────────────────────────────────────────── */

interface LoaderProviderProps {
  /** R3F components — render INSIDE the global Canvas. */
  scene: ReactNode;
  /** HTML overlays — render OUTSIDE the Canvas, on top of it. */
  children?: ReactNode;
  /** Minimum time the loading screen stays visible (ms). Avoids flashes on
   *  instant boots. Default 600ms. */
  minDuration?: number;
  /** After the last tracked task finishes, wait this long before triggering
   *  GPU warmup — gives late-mounting children time to register their own
   *  tasks. Default 80ms. */
  settleMs?: number;
  /** Camera config forwarded to <Canvas>. */
  camera?: {
    position?: [number, number, number];
    fov?: number;
    near?: number;
    far?: number;
  };
  /** Background CSS gradient. */
  background?: string;
  /** Time to hold the loading screen visible AFTER everything is warm and
   *  ready, before isLoading flips to false. Use this window to play a
   *  coordinated reveal transition (curtain animation, scene entrance, etc).
   *  Default 0 (dismiss immediately). */
  holdMs?: number;
  /** Fires the moment warmup completes — i.e. the hold window has started
   *  and the scene is fully prepared behind the curtain. Trigger your
   *  reveal animations here. */
  onReady?: () => void;
}

const DEFAULT_BG = 'radial-gradient(ellipse at 50% 60%, #050816 0%, #000003 70%)';

export function LoaderProvider({
  scene,
  children,
  minDuration = 600,
  settleMs = 80,
  holdMs = 0,
  onReady,
  camera = { position: [0, 0, 0], fov: 65, near: 0.1, far: 2000 },
  background = DEFAULT_BG,
}: LoaderProviderProps) {
  const [tasks, setTasks] = useState<Map<string, LoaderTask>>(() => new Map());
  const [warmupDone, setWarmupDone] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [readyForWarmup, setReadyForWarmup] = useState(false);
  const [holdElapsed, setHoldElapsed] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    // Give children one frame + a beat to call track() in their useEffects.
    const t = setTimeout(() => setRegistrationOpen(false), settleMs);
    return () => clearTimeout(t);
  }, [settleMs]);

  // Track whether any task has *ever* been registered (one-way flag).
  const hasEverHadTasks = useRef(false);

  // Keep the latest onReady in a ref so changing it doesn't retrigger the hold.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  /* ── min-duration timer ──────────────────────────────────────────────── */
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), minDuration);
    return () => clearTimeout(t);
  }, [minDuration]);

  /* ── hold window — fires onReady, then waits holdMs before dismissing ─ */
  useEffect(() => {
    if (!warmupDone) return;
    onReadyRef.current?.();
    if (holdMs <= 0) {
      setHoldElapsed(true);
      return;
    }
    const t = setTimeout(() => setHoldElapsed(true), holdMs);
    return () => clearTimeout(t);
  }, [warmupDone, holdMs]);

  /* ── task tracking ───────────────────────────────────────────────────── */
  const track = useCallback(
    <T,>(label: string, fn: () => Promise<T>, weight = 1): Promise<T> => {
      hasEverHadTasks.current = true;

      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `t_${Math.random().toString(36).slice(2)}`;

      setTasks((prev) => {
        const next = new Map(prev);
        next.set(id, { id, label, weight, done: false });
        return next;
      });

      const finalize = () =>
        setTasks((prev) => {
          const t = prev.get(id);
          if (!t || t.done) return prev;
          const next = new Map(prev);
          next.set(id, { ...t, done: true });
          return next;
        });

      return fn().then(
        (result) => {
          finalize();
          return result;
        },
        (err) => {
          // Don't stall the loader on a single failed task — log + finalize.
          console.error(`[GlobalLoader] task "${label}" failed:`, err);
          finalize();
          throw err;
        },
      );
    },
    [],
  );

  /* ── built-in preloaders ─────────────────────────────────────────────── */
  const preloadTexture = useCallback(
    (url: string): Promise<THREE.Texture> => {
      const cached = textureCache.get(url);
      if (cached) return Promise.resolve(cached);
      return track(
        `texture · ${url.split('/').pop() ?? url}`,
        () =>
          new Promise<THREE.Texture>((resolve, reject) => {
            _textureLoader.load(
              url,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = 4;
                textureCache.set(url, tex);
                resolve(tex);
              },
              undefined,
              (err) => reject(err),
            );
          }),
        2,
      );
    },
    [track],
  );

  const preloadCubeTexture = useCallback(
    (
      urls: [string, string, string, string, string, string],
    ): Promise<THREE.CubeTexture> => {
      const key = urls.join('|');
      const cached = cubeTextureCache.get(key);
      if (cached) return Promise.resolve(cached);
      return track(
        `cubemap · ${urls.length} faces`,
        () =>
          new Promise<THREE.CubeTexture>((resolve, reject) => {
            _cubeLoader.load(
              urls,
              (tex) => {
                cubeTextureCache.set(key, tex);
                resolve(tex);
              },
              undefined,
              (err) => reject(err),
            );
          }),
        3,
      );
    },
    [track],
  );

  const warmMaterial = useCallback((mat: THREE.Material) => {
    materialWarmQueue.add(mat);
  }, []);

  /* ── progress + state machine ────────────────────────────────────────── */
  const allTasksDone = useMemo(() => {
    const arr = Array.from(tasks.values());
    return arr.every((t) => t.done);
  }, [tasks]);

  // Once tasks settle, wait `settleMs` for late registrations, THEN warm up.
  useEffect(() => {
    if (!allTasksDone || readyForWarmup) return;
    const t = setTimeout(() => setReadyForWarmup(true), settleMs);
    return () => clearTimeout(t);
  }, [allTasksDone, readyForWarmup, settleMs]);

  const { progress, isLoading, label } = useMemo(() => {
    const arr = Array.from(tasks.values());
    const totalW = arr.reduce((s, t) => s + t.weight, 0);
    const doneW = arr.reduce((s, t) => s + (t.done ? t.weight : 0), 0);

    // Budget: 80% on tasks, 20% on GPU warmup.
    // const taskRatio = totalW > 0 ? doneW / totalW : 1;
    let taskRatio: number;
    if (totalW > 0) {
      taskRatio = doneW / totalW;
    } else if (registrationOpen && !hasEverHadTasks.current) {
      taskRatio = 0;
    } else {
      taskRatio = 1;
    }

    const taskPct = taskRatio * 80;
    const warmPct = warmupDone ? 20 : readyForWarmup ? 10 : 0;

    const pct = Math.min(100, Math.round(taskPct + warmPct));

    const inFlight = arr.find((t) => !t.done);
    const lbl = inFlight
      ? inFlight.label
      : warmupDone
        ? 'ready'
        : readyForWarmup
          ? 'compiling shaders'
          : 'initializing';

    const done = warmupDone && minTimeElapsed && allTasksDone && holdElapsed;
    return { progress: pct, isLoading: !done, label: lbl };
  }, [
    tasks,
    registrationOpen,
    warmupDone,
    readyForWarmup,
    minTimeElapsed,
    allTasksDone,
    holdElapsed,
  ]);

  /* ── public API ──────────────────────────────────────────────────────── */
  const api = useMemo<LoaderAPI>(
    () => ({
      track,
      preloadTexture,
      preloadCubeTexture,
      warmMaterial,
      progress,
      isLoading,
      label,
    }),
    [track, preloadTexture, preloadCubeTexture, warmMaterial, progress, isLoading, label],
  );

  //   const { jump } = useHyperspaceContext();

  //   useEffect(() => {
  //     setTimeout(() => {
  //       if (progress >= 100) {
  //         jump({
  //           onArrival: () => {
  //             // cruising → decelerating boundary; the screen is covered.
  //             // do your scroll / state swap / route change here.
  //             document.getElementById('section-2')?.scrollIntoView();
  //           },
  //           onComplete: () => {
  //             // fires after the sequence ends + unmountDelayMs.
  //           },
  //         });
  //       }
  //     }, 500);
  //     // eslint-disable-next-line react-hooks/exhaustive-deps
  //   }, [progress]);

  return (
    <LoaderContext.Provider value={api}>
      {/* Global Canvas — fills the viewport, sits behind everything. */}
      <div className='fixed inset-0 z-0 h-screen w-screen' style={{ background }}>
        {/* <LiquidGlass> */}
        <Canvas
          camera={camera}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: false,
          }}
          className='block h-full w-full'
          frameloop='always'
        >
          {scene}
          <WarmupRunner ready={readyForWarmup} onDone={() => setWarmupDone(true)} />
        </Canvas>
        {/* </LiquidGlass> */}
      </div>

      {/* HTML overlays (ProbeMenu, scroll hints, your own UI). */}
      {children}

      {/* Loading screen — z-50, fades over the canvas + overlays until ready. */}
      <LoadingScreen progress={progress} label={label} visible={isLoading} />
    </LoaderContext.Provider>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Usage
 *
 *  // app/layout.tsx (Next.js) or your top-level component
 *  import { LoaderProvider } from '@/components/GlobalLoader';
 *  import { StarFields } from '@/components/StarFields';
 *  import { ProbeMenu } from '@/components/ProbeMenu';
 *
 *  export default function RootLayout({ children }: { children: ReactNode }) {
 *    return (
 *      <html>
 *        <body>
 *          <LoaderProvider scene={<StarFields />}>
 *            <ProbeMenu />
 *            {children}
 *          </LoaderProvider>
 *        </body>
 *      </html>
 *    );
 *  }
 *
 *  // Inside any component — register an async task:
 *  function HeroModel() {
 *    const { track } = useGlobalLoader();
 *    const [model, setModel] = useState<THREE.Group | null>(null);
 *
 *    useEffect(() => {
 *      track('hero · model.glb', () => loadGLB('/hero.glb'), 4).then(setModel);
 *    }, [track]);
 *
 *    return model ? <primitive object={model} /> : null;
 *  }
 *
 *  // Or a texture:
 *  function MaterialBall() {
 *    const { preloadTexture } = useGlobalLoader();
 *    const [albedo, setAlbedo] = useState<THREE.Texture | null>(null);
 *
 *    useEffect(() => {
 *      preloadTexture('/textures/albedo.jpg').then(setAlbedo);
 *    }, [preloadTexture]);
 *
 *    if (!albedo) return null;
 *    return (
 *      <mesh>
 *        <sphereGeometry args={[1, 32, 32]} />
 *        <meshStandardMaterial map={albedo} />
 *      </mesh>
 *    );
 *  }
 * ──────────────────────────────────────────────────────────────────────────── */
