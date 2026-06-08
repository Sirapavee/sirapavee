'use client';

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, extend, type RootState, useFrame, useThree } from '@react-three/fiber';
import { ChromaticAberration, EffectComposer } from '@react-three/postprocessing';
import { BlendFunction, ChromaticAberrationEffect, Effect } from 'postprocessing';
import * as THREE from 'three';

/* ─────────────────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────────────────── */
type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';
type BpRecord<T> = Partial<Record<Breakpoint, T>>;

interface ScrollState {
  impulse: number;
  velocity: number;
}

interface FieldData {
  positions: Float32Array;
  sizes: Float32Array;
  bright: Float32Array;
  tphase: Float32Array;
  tspeed: Float32Array;
  spike: Float32Array;
  spawnTime: Float32Array;
  numSpikes: number;
}

// ── ADD-ON v3.1 ── Formation sequence based on real core-collapse physics:
//
// The phase machine now includes a "forming" stage between aftermath and
// settled. It compresses the years-long real timeline into ~3.5s of visible
// sequence, but the BEATS are physics-faithful:
//
//   1. Iron core collapse + bounce  → "charging" + "detonating" (existing)
//   2. Shock breakout                 → "blooming" (existing)
//   3. Expanding ejecta / fading      → "aftermath" (existing)
//   4. Proto-neutron star revealed,   → "forming" (NEW) sub-beats:
//      fallback debris condenses,        a. Compact ejecta cloud at detonation point
//      accretion disc organizes,         b. Hot PNS core ignites at center
//      magnetically-channeled jets       c. Disc material spirals in (volumetric)
//      establish along spin axis         d. Jets pierce magnetic poles outward
//   5. Stable neutron star + disc + jets → "settled" (existing, redesigned)
//
// During "forming" the assembly lives at the original detonation world
// coordinates and gradually translates toward the orbital center, growing
// in apparent size as it approaches — physically reading as "the explosion
// debris is falling toward us and resolving into the remnant".
//
// References for the sequence beats:
//   - Janka, "Core-Collapse Supernovae" (arxiv 1211.1378)
//   - Kato/Hayashi/Matsumoto, "Formation of Semi-relativistic Jets from
//     Magnetospheres of Accreting Neutron Stars" (arxiv astro-ph/0308437)
//   - NASA SVS visualisations of millisecond pulsars
type SupernovaPhase =
  | 'idle'
  | 'redgiant'
  | 'charging'
  | 'detonating'
  | 'blooming'
  | 'aftermath'
  | 'forming'
  | 'settled'
  // v11: death cycle, expanded to a 10-phase cinematic sequence.
  //
  //   centering     - NS leaves orbit and lerps to a fixed central
  //                   screen position with moderate camera distance.
  //                   Other stars continue normal drift.
  //   freezing      - All star drift halts; existing stars fade out
  //                   (despawn) and respawn at fresh positions but
  //                   start invisible (held until rebirth).
  //   pulling       - Five to ten "victim" stars accelerate toward
  //                   the NS, get consumed; non-victims stay frozen
  //                   and invisible.
  //   coreCollapse  - NS itself rapidly shrinks toward a singular point.
  //   blackholeForm - A black hole emerges from the singular point,
  //                   expanding to its stable radius with photon ring
  //                   and accretion disc.
  //   engulfing     - The black hole grows toward the camera; screen
  //                   begins ramping toward white as the camera is
  //                   pulled into the event horizon.
  //   whitening     - Brief hold at full white (passing through the
  //                   singularity).
  //   emerging      - Camera "out the other side"; theme reverts.
  //   dimming       - Final dim to pitch black; respawned stars fade
  //                   back in, phase returns to "idle".
  | 'centering'
  | 'freezing'
  | 'pulling'
  | 'coreCollapse'
  // v12: coreExplosion — brief radial flash AFTER the NS implodes
  // and BEFORE the BH emerges. Physically motivated: when collapse
  // overshoots the TOV mass limit, a fraction of the in-falling
  // material rebounds outward as a brilliant flash before the
  // event horizon swallows the rest.
  // v12 take 3: NS-to-BH arc mirrors the supernova arc.
  // bhCharging   <-> charging   (final ignition)
  // bhDetonating <-> detonating (peak burst)
  // bhBlooming   <-> blooming   (shockwave spreads)
  // bhAftermath  <-> aftermath  (cooling debris)
  // bhForming    <-> forming    (BH assembly emerges)
  | 'bhCharging'
  | 'bhDetonating'
  | 'bhBlooming'
  | 'bhAftermath'
  | 'bhForming'
  // v15-take5 (Issue 2): bhConsuming — BH stable at its formed
  // size; ALL on-screen stars get pulled in BEFORE the camera
  // approach begins. Inserted between bhForming and engulfing.
  | 'bhConsuming'
  | 'engulfing'
  | 'swallowed'
  | 'emerging'
  | 'dimming';

interface SupernovaState {
  phase: SupernovaPhase;
  phaseT: number;
  starIndex: number;
  starSeed: number;
  detonationXYZ: [number, number, number];
  // ── ADD-ON v6.1 ── Elliptical orbit parameters.
  //
  // The v5 orbit was a perfect circle around the camera (50% behind = bad
  // visibility). v6 uses an ELLIPSE with the major axis aligned with the
  // camera's depth direction, centered slightly in front of the camera.
  // The result: the long arc is in front (visible), the short arc dips
  // briefly behind (~10% of the orbit time).
  //
  // Three params fully determine the orbit shape and orientation:
  //   orbitTilt     — angle (rad) between the major axis and world -Z.
  //                   Small values (15-25°) keep the major axis pointing
  //                   mostly into camera depth, with a slight upward
  //                   component. This determines how dramatically the
  //                   orbit dives in front of / behind the camera.
  //   orbitRotation — rotation around world Z. Random per trigger so the
  //                   orbit's "horizontal" direction varies (diagonal
  //                   feel, not always aligned with X).
  //   orbitZOffset  — distance from camera to orbit center (positive,
  //                   meaning center is at z = -orbitZOffset). Computed
  //                   so the orbit dips behind by exactly ~10% of the
  //                   period: zOffset = 0.951 · R_major · cos(orbitTilt).
  orbitTilt: number;
  orbitRotation: number;
  orbitZOffset: number;
  revolvePhase: number;

  // ── ADD-ON v6.2 ── Speed-handoff state.
  //
  // When formation completes, we want the trajectory to CONTINUE at the
  // same speed the assembly was moving (no sudden drop), then gradually
  // decelerate to the stable orbital revolution. To do this, we capture:
  //   formationEndAngle — the orbital angle at the moment of handoff,
  //                       so settled-mode angle integration starts there
  //                       (position continuity)
  //   omegaInitial      — the initial angular speed in settled mode,
  //                       approximating the formation linear speed / R.
  //                       This gives velocity continuity (no drop).
  // These are populated at the moment of transition from forming to
  // settled (NOT at trigger time). Until then they're zero/unused.
  formationEndAngle: number;
  omegaInitial: number;
  // ── ADD-ON v7.5 ── Formation chord velocity, captured at the
  // formation→settled handoff. With LINEAR formation easing, the
  // assembly's velocity throughout formation is constant and equal to
  // (target - detonation) / formation_duration — this is what we
  // capture here. It's the "incoming direction" the user wants to see
  // preserved when the orbit takes over.
  vFormChord: [number, number, number];
  // v11: guards the once-per-cycle respawn during freezing
  respawnedThisCycle?: boolean;
  // v12: null ⇒ NeutronStar holds last position; undefined ⇒ normal
  // orbit. Set to null on centering → freezing transition.
  frozenOrbitAngle?: number | null;
  // v12 take 4: tells StarField to flag every on-screen star as
  // victim each frame (used during bhConsuming).
  consumeOnScreen?: boolean;
  // v12 take 4: written by BlackHole each frame during engulfing.
  // 0 = pinhole, 1.0 = covers viewport diagonal.
  bhCoverageRatio?: number;
  // v15-take5: random target coverage (0.6..0.7) chosen at the
  // start of bhAftermath. The BH grows toward this coverage during
  // bhForming + bhConsuming, where bhSize is computed per-frame
  // from (targetCoverage * halfDiag) so the body always fills the
  // requested fraction of the screen regardless of camera distance.
  targetBhCoverage?: number;
  // v18: wave-pull batching state. lastWaveTime is the uTime of the
  // most recently fired wave; nextWaveInterval is the (random) gap
  // until the NEXT wave should fire. Both are reset when bhConsuming
  // begins so each cycle has its own random rhythm.
  lastWaveTime?: number;
  nextWaveInterval?: number;
}

const BREAKPOINTS: Record<Breakpoint, number> = {
  mobile: 0,
  tablet: 720,
  desktop: 1280,
  wide: 1920,
};
const BP_ORDER: Breakpoint[] = ['mobile', 'tablet', 'desktop', 'wide'];

function pickBp(width: number): Breakpoint {
  let active: Breakpoint = 'mobile';
  for (const name of BP_ORDER) if (width >= BREAKPOINTS[name]) active = name;
  return active;
}

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'desktop' : pickBp(window.innerWidth),
  );
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = pickBp(window.innerWidth);
        setBp((prev) => (prev === next ? prev : next));
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return bp;
}

function resolveBp<T>(value: BpRecord<T> | T, bp: Breakpoint): T {
  if (value === null || typeof value !== 'object') return value as T;
  const rec = value as BpRecord<T>;
  const idx = BP_ORDER.indexOf(bp);
  for (let i = idx; i >= 0; i--) {
    const k = BP_ORDER[i];
    if (k in rec) return rec[k] as T;
  }
  for (const k of BP_ORDER) if (k in rec) return rec[k] as T;
  throw new Error('resolveBp: empty record');
}

function halton(idx: number, base: number): number {
  let f = 1,
    r = 0,
    i = idx;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function usePageVisibility(): RefObject<boolean> {
  const visible = useRef<boolean>(
    typeof document === 'undefined' ? true : !document.hidden,
  );
  useEffect(() => {
    const onChange = () => {
      visible.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/* ── v17 ── LightMode Provider.
 *
 * Allows ANY component (inside or outside the Canvas tree) to read the
 * current light/dark mode and toggle it. The provider owns three
 * pieces of state:
 *
 *   - lightMode (React state, boolean): true = light/day, false = dark/night.
 *     Drives UI components that need to re-render based on mode (toggle
 *     icon, theme classes, etc).
 *
 *   - lightTargetRef (number ref): 0 or 1, written by both the user
 *     toggle AND by the in-canvas tickSupernova during cycle phases.
 *     The in-canvas LightModeAnimator eases lightRef toward this.
 *
 *   - lightRef (number ref): smoothly eased 0..1 value, read by every
 *     in-canvas shader/driver for fade transitions.
 *
 * The provider runs an rAF loop that watches lightTargetRef and
 * synchronises the React state when it crosses 0.5 — this catches
 * auto-toggles driven by the supernova/BH cycle so the toggle button
 * UI reflects the current visual mode without needing manual sync.
 *
 * Inside the Canvas, the in-canvas refs are read via context too;
 * Canvas children call useLightMode().lightRef / .lightTargetRef and
 * everything stays consistent.
 */
/* v17-take2 (Issue: circular-JSON crash at red giant explosion):
 *
 * SPLIT the provider into TWO contexts so consumers that only need the
 * stable refs do NOT re-render when the boolean state flips.
 *
 *   LightModeRefsContext  - lightRef, lightTargetRef (stable refs only).
 *                            Identity NEVER changes. Subscribers never
 *                            re-render due to mode flips.
 *
 *   LightModeStateContext - lightMode (boolean) + setters. Identity
 *                            changes when toggle happens. Subscribers
 *                            (toggle button UI) re-render correctly.
 *
 * The previous single-context design re-rendered AppContent every time
 * the rAF poll detected the boolean had crossed 0.5 — because
 * AppContent destructured refs from the same context value object that
 * also held the boolean. Re-rendering AppContent meant re-evaluating
 * the entire Canvas JSX, which under certain timing (e.g. a phase
 * transition where Three.js was already serializing scene state for an
 * error message) tripped the "circular structure to JSON" crash via
 * the parent/children references that R3F objects naturally hold.
 *
 * Splitting fixes this at the root: AppContent reads ONLY the refs
 * context, which never changes value, so it never re-renders due to
 * mode flips. The Canvas tree is stable across the supernova arc.
 */
interface LightModeRefsContextValue {
  lightTargetRef: RefObject<number>;
  lightRef: RefObject<number>;
}

interface LightModeStateContextValue {
  lightMode: boolean;
  setLightMode: (next: boolean | ((prev: boolean) => boolean)) => void;
  toggleLightMode: () => void;
}

const LightModeRefsContext = createContext<LightModeRefsContextValue | null>(null);
const LightModeStateContext = createContext<LightModeStateContextValue | null>(null);

export function LightModeProvider({ children }: { children: ReactNode }) {
  const lightTargetRef = useRef<number>(0);
  const lightRef = useRef<number>(0);
  const [lightMode, setLightModeState] = useState<boolean>(false);

  // rAF poll: detect when the in-canvas auto-toggle (e.g.
  // tickSupernova writing lightTargetRef = 1 at supernova flash)
  // crosses 0.5, and sync the React boolean state. Only setState
  // when the value actually changes — cheap, no spurious re-renders.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = lightTargetRef.current ?? 0;
      const next = target >= 0.5;
      setLightModeState((prev) => (prev !== next ? next : prev));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setLightMode = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setLightModeState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      (lightTargetRef as { current: number }).current = resolved ? 1 : 0;
      return resolved;
    });
  }, []);

  const toggleLightMode = useCallback(() => {
    setLightMode((prev) => !prev);
  }, [setLightMode]);

  // Refs context value: ALWAYS the same object (refs are stable).
  // Subscribers never re-render on mode flips.
  const refsValue = useMemo<LightModeRefsContextValue>(
    () => ({ lightTargetRef, lightRef }),
    [],
  );

  // State context value: changes when lightMode flips. Subscribers
  // (toggle button UI etc) re-render to reflect the new mode.
  const stateValue = useMemo<LightModeStateContextValue>(
    () => ({ lightMode, setLightMode, toggleLightMode }),
    [lightMode, setLightMode, toggleLightMode],
  );

  return (
    <LightModeRefsContext.Provider value={refsValue}>
      <LightModeStateContext.Provider value={stateValue}>
        {children}
      </LightModeStateContext.Provider>
    </LightModeRefsContext.Provider>
  );
}

/* Refs hook: stable across renders. Use this in components that need
 * to pass lightRef / lightTargetRef to in-canvas drivers. AppContent
 * uses this so it does NOT re-render when the boolean toggles. */
export function useLightModeRefs(): LightModeRefsContextValue {
  const ctx = useContext(LightModeRefsContext);
  if (!ctx) {
    throw new Error('useLightModeRefs must be used inside <LightModeProvider>');
  }
  return ctx;
}

/* State hook: subscribes to the boolean mode. Use this in toggle
 * buttons or theme-aware UI components that need to re-render when
 * the mode changes. */
export function useLightModeState(): LightModeStateContextValue {
  const ctx = useContext(LightModeStateContext);
  if (!ctx) {
    throw new Error('useLightModeState must be used inside <LightModeProvider>');
  }
  return ctx;
}

/* Combined hook for convenience. Subscribes to BOTH contexts; only
 * use this if the component genuinely needs both refs AND mode
 * boolean (otherwise prefer the split hooks above so re-renders are
 * scoped correctly). */
export function useLightMode(): LightModeRefsContextValue & LightModeStateContextValue {
  return { ...useLightModeRefs(), ...useLightModeState() };
}

/* v20: SafeModeProvider — accessibility preference for photosensitive
 * users. When enabled, the supernova white flash, chromatic aberration
 * pulses, and kilonova glitch effects are replaced with low-flicker
 * alternatives that stay below clinical seizure-risk thresholds
 * (no >3Hz luminance flashes, no saturated-red oscillations, no rapid
 * RGB channel separation).
 *
 * Architecture mirrors LightModeProvider: a refs context (safeModeRef)
 * for in-canvas drivers/shaders so they can read without subscribing
 * to React re-renders, plus a state context (safeMode boolean +
 * setters) for the toggle button UI.
 *
 * Default: safeMode is OFF, BUT defaults to ON when the OS prefers-
 * reduced-motion media query matches (those users have already opted
 * into calmer animation system-wide).
 */
interface SafeModeRefsContextValue {
  safeModeRef: RefObject<boolean>;
}

interface SafeModeStateContextValue {
  safeMode: boolean;
  setSafeMode: (next: boolean | ((prev: boolean) => boolean)) => void;
  toggleSafeMode: () => void;
}

const SafeModeRefsContext = createContext<SafeModeRefsContextValue | null>(null);
const SafeModeStateContext = createContext<SafeModeStateContextValue | null>(null);

export function SafeModeProvider({ children }: { children: ReactNode }) {
  const safeModeRef = useRef<boolean>(false);
  const reducedMotion = usePrefersReducedMotion();
  const [safeMode, setSafeModeState] = useState<boolean>(false);

  // Default to ON when OS prefers-reduced-motion is set. Only runs
  // once on mount — if the user toggles afterward, their explicit
  // choice wins.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (reducedMotion) {
      safeModeRef.current = true;
      setSafeModeState(true);
    }
  }, [reducedMotion]);

  const setSafeMode = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setSafeModeState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      safeModeRef.current = resolved;
      return resolved;
    });
  }, []);

  const toggleSafeMode = useCallback(() => {
    setSafeMode((prev) => !prev);
  }, [setSafeMode]);

  const refsValue = useMemo<SafeModeRefsContextValue>(() => ({ safeModeRef }), []);

  const stateValue = useMemo<SafeModeStateContextValue>(
    () => ({ safeMode, setSafeMode, toggleSafeMode }),
    [safeMode, setSafeMode, toggleSafeMode],
  );

  return (
    <SafeModeRefsContext.Provider value={refsValue}>
      <SafeModeStateContext.Provider value={stateValue}>
        {children}
      </SafeModeStateContext.Provider>
    </SafeModeRefsContext.Provider>
  );
}

export function useSafeModeRefs(): SafeModeRefsContextValue {
  const ctx = useContext(SafeModeRefsContext);
  if (!ctx) {
    throw new Error('useSafeModeRefs must be used inside <SafeModeProvider>');
  }
  return ctx;
}

export function useSafeModeState(): SafeModeStateContextValue {
  const ctx = useContext(SafeModeStateContext);
  if (!ctx) {
    throw new Error('useSafeModeState must be used inside <SafeModeProvider>');
  }
  return ctx;
}

const FIELD_CONFIG = {
  starCount: { mobile: 400, tablet: 700, desktop: 1000, wide: 1200 } as BpRecord<number>,
  volumeXY: { mobile: 160, tablet: 200, desktop: 240, wide: 280 } as BpRecord<number>,
  volumeZ: { mobile: 360, tablet: 440, desktop: 520, wide: 600 } as BpRecord<number>,
  spikeRatio: {
    mobile: 0.02,
    tablet: 0.025,
    desktop: 0.03,
    wide: 0.035,
  } as BpRecord<number>,
  dprMax: { mobile: 1.5, tablet: 2, desktop: 2, wide: 2 } as BpRecord<number>,
  dprMin: { mobile: 1, tablet: 1, desktop: 1, wide: 1.25 } as BpRecord<number>,
};

const SCROLL_CONFIG = {
  baseDrift: 2.4,
  impulseDecay: 1.8,
  impulseMax: 90,
  impulseMin: -90,
  wheelGain: 0.45,
  touchGain: 1.8,
};

const DESPAWN_BEHIND = 50;
const SPAWN_FADE_SECONDS = 0.6;
const DESPAWN_FADE_UNITS = 25;

const SUPERNOVA_TIMINGS: Record<SupernovaPhase, number> = {
  idle: Infinity,
  // ── ADD-ON v9.8 ── Red giant phase.
  // The progenitor of a core-collapse supernova spends its final stage
  // as a red supergiant — hydrogen envelope swollen, surface cool
  // (3000-4000K, hence red), iron core silently building inward toward
  // the Chandrasekhar limit. We compress this stage to 1.8s of slow
  // visible swelling and reddening before the rapid "charging" phase
  // (final ignition flash) and detonation.
  redgiant: 1.8,
  charging: 0.8,
  detonating: 0.3,
  blooming: 0.6,
  aftermath: 1.5,
  // ── ADD-ON v9.2 ── Four explicit formation stages over 5 seconds.
  //
  // Real neutron star formation is far slower than a few seconds, but for
  // an interactive visualization we compress it into 5s with clearly
  // separated stages that match the actual physics:
  //
  //   Stage A (0-25%, 1.25s): Remnant ejecta visible — supernova ejecta
  //     cloud expanded outward, hangs at the detonation site. No NS
  //     visible yet.
  //   Stage B (25-50%, 1.25s): Core collapse / NS formation — proto-
  //     neutron star ignites at the center as the inner core collapses.
  //     Ejecta starts to fade as material is being captured.
  //   Stage C (50-80%, 1.5s): Fallback disc forming — the reverse shock
  //     causes some ejecta to fall back onto the NS; high-angular-
  //     momentum material organizes into an accretion disc that reveals
  //     from outside-in.
  //   Stage D (80-100%, 1s): Iron jets emerging — magnetic field
  //     channels charged particles into bipolar relativistic streams
  //     emitted from the magnetic poles.
  forming: 5.0,
  settled: Infinity,
  // v11: death cycle timings. Total ~19.5s, broken into beats so each
  // visual moment is given enough time to read.
  centering: 3.5, // NS glides to center
  freezing: 1.0, // stars stop, fade out, respawn invisible
  pulling: 3.0, // 5-10 victim stars are pulled into the NS
  coreCollapse: 2.0, // NS shrinks to a point
  // v12 take 4: NS-to-BH explosion is MORE dramatic than the supernova.
  // Longer ignition + sustained shockwave, more intense detonation,
  // more aftermath debris time. Total = 11.0s vs supernova's 8.2s.
  // v14: NS-to-BH explosion 20x more violent than the supernova arc.
  // Stretched durations (total 14.7s vs supernova\'s 8.2s = 1.8x) +
  // bigger shell scale + 5-color ramp + crazy chromatic punch.
  bhCharging: 1.6, // longer winding-tension build
  bhDetonating: 0.7, // bigger detonation beat
  bhBlooming: 1.8, // sustained chaos shockwave
  bhAftermath: 3.0, // extended cooling debris
  bhForming: 5.6, // was 5.0 — BH crystallization stretched out
  bhConsuming: 5.5, // v18-take3: extended so 1.4s per-star pull fits with margin
  // v15: engulfing now means "fade-to-black while BH pulls remaining
  // stars in place". No camera approach, no swallow. The transition
  // begins the moment bhForming completes.
  engulfing: 2.2, // black overlay 0→1 + final star pull
  swallowed: 0.6, // v15-take2: pitch-black hold after engulf
  // (swallowed phase removed in v15)
  emerging: 1.5, // back to dark side; light reverts
  dimming: 2.0, // dim to black, respawned stars fade in, → idle
};
const SUPERNOVA_MIN_DEPTH = 80;

// ── ADD-ON v2.3 ── Light/dark fade speed.
const LIGHT_MODE_FADE_SECONDS = 0.6;

// ── ADD-ON v3.5 ── Neutron star geometry, redesigned.
//
// The orbit is now a TILTED 3D circle centered at world origin, with a
// large enough radius that the orbit crosses the z=0 plane and sweeps
// BEHIND the camera on each revolution. While behind (z > 0), the assembly
// is naturally clipped by the camera frustum and not drawn — exactly the
// behavior requested.
//
// ── ADD-ON v6.3 ── Elliptical-orbit constants.
//
// v5 used a true circular orbit centered exactly at the camera — physically
// pure but visually unsatisfying because the assembly was hidden behind the
// camera 50% of the time. The user wanted the orbit closed AND the back
// portion brief.
//
// v6's solution: an elliptical orbit. The major axis points mostly along
// world -Z (camera depth). The center is offset slightly forward of the
// camera. The result is an orbit that:
//   - Sweeps deeply in front (long, visible arc)
//   - Briefly ducks behind the camera (short, hidden arc)
//   - Closed and continuous (true trajectory, no oscillation)
//
// Math: position(θ) = center + R_minor·e1·cos(θ) + R_major·e2·sin(θ)
//   where e1 is in the plane mostly horizontal (after random Z-rotation),
//         e2 is in the plane mostly along -Z (depth direction, tilted up
//         by orbitTilt from world -Z).
// The fraction of the orbit with z > 0 (behind camera) is:
//   acos(orbitZOffset / (R_major · cos(orbitTilt))) / π
// We pick orbitZOffset = 0.951 · R_major · cos(orbitTilt) per trigger,
// which gives exactly 10% behind-camera time regardless of the random
// orbitTilt value.
const NEUTRON_ORBIT_R_MAJOR = 20; // semi-major axis (depth direction)
const NEUTRON_ORBIT_R_MINOR = 7; // semi-minor axis (screen direction)
const NEUTRON_REVOLVE_SPEED = 0.16; // stable angular speed (rad/sec)
// ── ADD-ON v9.19 ── NEUTRON_DISC_SPIN removed (was for per-layer
// rotation rates — particles now handle differential rotation in the
// vertex shader via per-particle Keplerian physics).
const NEUTRON_JET_LENGTH = 22; // jet half-length: full cylinder is 2x this
const NEUTRON_DISC_RADIUS = 8.5;
// ── ADD-ON v9.6 ── Single-layer disc (was 4-layer stack).
//
// Earlier the disc was 4 stacked layers at slight Y offsets (-0.12 to
// +0.12 in spinGroup space) for a "volumetric haze" feel. With v9.1's
// addition of depthWrite=true (needed for occluding background and jets),
// these 4 layers started Z-fighting against each other: at certain disc
// rotation angles, two layers' camera-Z values nearly coincide, and the
// depth buffer non-deterministically picks one to "win" each pixel —
// producing the "straight line sweeping" artifact the user observed.
//
// Going to a single layer eliminated Z-fighting. v9.19 makes this
// moot entirely — the disc is now a particle system, not stacked
// geometry. NEUTRON_DISC_LAYERS removed.
const NEUTRON_SPIN_SPEED = 0.6;

// ── ADD-ON v9.19 ── Particle-based accretion disc.
//
// The 2D shader-drawn disc is replaced with a real particle system:
// thousands of grain particles in differential rotation, slowly
// spiralling inward toward the neutron star core. This gives a
// hyperrealistic plasma swirl where each grain has its own orbit.
//
// Physics:
//   - Each particle has lifecycle phase t ∈ [0,1) cycled by uTime
//   - Radial position: r(t) = mix(R_out, R_in, t)  (linear inflow)
//   - Keplerian angular velocity: ω(r) = K_kepler · r^(-3/2)
//     → outer particles barely rotate, inner particles whirl rapidly
//   - Cumulative angle integrates analytically (linear r(t)):
//     θ_acc(t) = K_orbit · (1/√r(t) - 1/√R_out)
//     where K_orbit = 2 · K_kepler · uInflowTau / (R_out - R_in)
//   - Areal density ∝ 1/r naturally (linear r0 distribution) —
//     denser toward center, like real accretion discs.
//
// Tuning: K_orbit ≈ 40 gives ~6 revolutions per inflow lifecycle,
// dominated by inner-radius spinning. Visually reads as plasma
// swirling into the core.
const NEUTRON_DISC_PARTICLES = 4000;
const NEUTRON_DISC_INFLOW_TAU = 14.0; // seconds for full inflow cycle
const NEUTRON_DISC_INNER_R = 0.65; // just outside the core sphere (R=0.45)
const NEUTRON_DISC_THICKNESS = 0.4; // disc Y-extent (±thickness/2)
const NEUTRON_DISC_ORBIT_K = 42.0; // orbital constant in θ_acc formula

// ── ADD-ON v6.4 ── Speed-handoff decay constants.
//
// At the moment the neutron star enters its orbit (end of formation), the
// linear velocity is high (matching the formation rush speed). The angular
// speed in settled-mode decays exponentially to NEUTRON_REVOLVE_SPEED:
//
//   ω(t) = ω_stable + (ω_initial - ω_stable) · exp(-t / NEUTRON_DECAY_TAU)
//
// where ω_initial is computed at handoff from the formation linear speed
// (capped at NEUTRON_OMEGA_MAX so very-far detonations don't produce
// absurd spin rates). The angle integration over time has a closed form
// (linear term + exponential-saturation term), used in the settled branch.
const NEUTRON_DECAY_TAU = 4.0; // exponential decay time-constant (seconds)
const NEUTRON_OMEGA_MAX = 2.0; // maximum angular speed at handoff (rad/sec)

// ── ADD-ON v7.8 ── Trajectory direction memory time-constant.
//
// Q(t) = V_form · t · exp(-t / τ_traj) — the formation velocity vector
// multiplied by t·exp(-t/τ). Peak magnitude (at t = τ_traj) is
// |V_form|·τ_traj/e. With V_form capped at 35 u/s and τ_traj = 2s,
// peak deviation from the orbit is ~25 units — visible as a clear
// "incoming direction overshoot", but contained enough to keep the
// neutron star on screen. After ~3·τ_traj = 6s, deviation is small;
// after ~5·τ_traj = 10s, the trajectory is on the orbit for all
// practical purposes.
const NEUTRON_TRAJECTORY_TAU = 2.0;

// ── ADD-ON v8.4 ── Approach time-constant for static-formation→orbit.
//
// In v8 the assembly stays at detonationXYZ throughout formation, then
// during settled phase converges to the orbit via:
//   position(t) = P_orbit(t) + ε · exp(-t / τ_approach)
//   where ε = detonationXYZ - P_orbit(0)
//
// τ_approach controls both the speed of approach and the deceleration
// rate. Larger τ = slower approach, gentler deceleration.
//
// For typical detonation depth ~270 units:
//   • τ=4: initial speed ~67 u/s, fast approach
//   • τ=6: initial speed ~45 u/s, balanced
//   • τ=8: initial speed ~34 u/s, gentle
// We pick 6 — substantial entry speed without being aggressive,
// smooth gradual deceleration over ~15 seconds.
const NEUTRON_APPROACH_TAU = 6.0;

// ── ADD-ON v6.15 ── Cone geometry for particle-stream jets.
//
// JET_BASE_RADIUS is the cone's radius at the BASE (the tip of the jet,
// far from the neutron star). The cone narrows to a point at the apex
// (the source / pole). Half-angle = atan(BASE_RADIUS / JET_LENGTH) ≈
// atan(3.5 / 22) ≈ 9° — a narrow but visibly-conical particle stream,
// matching real relativistic-jet morphology.
const NEUTRON_JET_BASE_RADIUS = 3.5;

// ── ADD-ON v7.2 ── Particle count per jet.
// 600 particles each is enough to read as a thick stream of discrete
// particles without overwhelming the GPU at typical viewing scales.
const NEUTRON_JET_PARTICLES = 600;

// ── ADD-ON v6.16 ── Self-axis spin: oblique-rotator wobble.
//
// The previous version rotated the spinGroup around its local Y axis
// (the disc/jet axis). But spinning around the jet axis produces NO
// visible motion of the jets (they're cylinders/cones along that axis,
// rotationally symmetric), and the disc — also perpendicular to the
// axis — only shows the spin via its internal pattern, which is hard
// to track among the layer-shear swirl.
//
// v6.16 introduces an OBLIQUE rotator: the spin axis is tilted by
// NEUTRON_SPIN_OBLIQUE_ANGLE relative to the jet/disc axis. As the
// assembly rotates around the spin axis, the jets sweep a small CONE
// around the spin axis (the lighthouse effect), and the disc PRECESSES.
// Both motions are visible.
//
// Real pulsars are oblique rotators (the magnetic axis is misaligned
// from the rotation axis by 5°-90°). Our 12° wobble is realistic for
// young pulsars and visually clear without being dizzying.
const NEUTRON_SPIN_OBLIQUE_ANGLE = (Math.PI / 180) * 12; // 12°

/* ─────────────────────────────────────────────────────────────────────────────
 *  Starfield Shaders — ── ADD-ON v2.5 ── uLight uniform drives palette swap.
 *  Light mode uses ReverseSubtract blending (set on the material from JS),
 *  shader outputs become "amount to subtract from white background" — so
 *  bright shader values = strong dark dots on the white cosmos.
 * ──────────────────────────────────────────────────────────────────────────── */
const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aTwinklePhase;
  attribute float aTwinkleSpeed;
  attribute float aSpike;
  attribute float aSpawnTime;
  attribute float aIsVictim; // v11: 1.0 = will be pulled into NS during pulling phase
  // v15-take9: per-star "consumed" flag. 1.0 means this star has been
  // permanently swallowed by the BH and must not render. Set at end
  // of bhConsuming for all victim stars; reset at start of next
  // cycle (charging) so the same instance can be used again.
  attribute float aConsumed;
  // v18: per-star pull-start timestamp. Default = -1 (not yet pulled).
  // When wave-selected during bhConsuming, set to current uTime so the
  // shader computes that star's INDIVIDUAL pull progress from its own
  // start time. Stars in the same wave move together; different waves
  // stagger.
  attribute float aPullStartTime;

  uniform float uTime;
  uniform float uFarWall;
  uniform float uDespawnBehind;
  uniform float uSpawnFade;
  uniform float uDespawnFade;
  uniform float uTwinkleStrength;
  uniform float uNovaIndex;
  uniform float uNovaScale;
  uniform float uNovaIntensity;
  // v11: gravitational pull toward the dying NS / black hole.
  // Only victim stars (aIsVictim == 1.0) are affected by the pull;
  // all other stars stay in place.
  uniform float uPullStrength;
  uniform vec3  uPullCenter;
  // v18: per-star pull duration in seconds. Drives the per-star
  // (uTime - aPullStartTime) / uPullDuration ratio so individual
  // stars complete their travel uniformly regardless of wave.
  uniform float uPullDuration;
  // v15-take4: BH-explosion glitch. Drives a per-star spatial jitter
  // when the neutron star explodes into a black hole, simulating a
  // gravitational-wave-like ripple through the entire starfield.
  // 0 = no jitter (idle). Peak ~1.0 during bhDetonating.
  uniform float uExplosionGlitch;
  // v11: global alpha multiplier. Used for synchronized fade-out
  // (despawn) and fade-in (respawn) under the death-cycle phases.
  uniform float uGlobalAlpha;

  varying vec2  vUv;
  varying float vSpike;
  varying float vTwinkle;
  varying float vBright;
  varying float vDepth;
  varying float vFade;
  varying float vIsNova;
  varying float vNovaIntensity;

  void main() {
    vUv     = uv;
    vSpike  = aSpike;
    vBright = aBright;

    float t      = uTime * aTwinkleSpeed + aTwinklePhase;
    float gentle = mix(0.75, 1.05, 0.5 + 0.5 * sin(t));
    float pop    = pow(0.5 + 0.5 * sin(t * 1.7 + 1.3), 14.0) * 2.2 * uTwinkleStrength;
    vTwinkle = gentle + pop * (0.4 + aSpike);

    vec4 instWorld  = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // v11: pull math — victim stars only.
    //
    // We blend ONLY victim stars (aIsVictim == 1.0) toward the
    // pull center. The blend uses a curve that gives:
    //   uPullStrength = 0.0  -> star at home
    //   uPullStrength = 0.5  -> halfway in (a long approach)
    //   uPullStrength = 1.0  -> star fully consumed at center
    //
    // We also accelerate the late approach: cubic ease-in so victims
    // gather speed dramatically as they near the core.
    // v18: per-star pull (bhConsuming wave system). Each victim
    // has its own aPullStartTime stamp; individual progress goes
    // 0 -> 1 over uPullDuration seconds from THAT timestamp.
    // Cubic-eased so each star "falls" into the BH dramatically.
    //
    // For the OLD pre-bh "pulling" phase (NS-formation gravitational
    // gather), aPullStartTime stays at its default -1 and we fall
    // back to the original uPullStrength path so legacy behavior is
    // preserved.
    if (aIsVictim > 0.5) {
      if (aPullStartTime >= 0.0) {
        float dt = max(0.0, uTime - aPullStartTime);
        float pT = clamp(dt / uPullDuration, 0.0, 1.0);
        // v18 (Issue 2): quadratic ease-in for a more natural
        // gravitational-pull feel. Cubic was too back-loaded —
        // stars barely moved for the first 70% then rocketed past
        // the camera. Quadratic gives steadier acceleration: gentle
        // start, smooth ramp, smooth landing.
        float blendT = pT * pT;
        instWorld.xyz = mix(instWorld.xyz, uPullCenter, blendT);
      } else if (uPullStrength > 0.0001) {
        float blendT = clamp(uPullStrength * uPullStrength * (3.0 - 2.0 * uPullStrength), 0.0, 1.0);
        instWorld.xyz = mix(instWorld.xyz, uPullCenter, blendT);
      }
    }
    // v15-take5: world-space twitch removed (the user dislikes the
    // "twitching star" look). Glitch now happens entirely in clip
    // space at the end of the vertex shader as horizontal-slice
    // displacement — see below after gl_Position is computed.

    vec4 viewCenter = viewMatrix * instWorld;
    vDepth = max(0.0, -viewCenter.z);

    float age       = uTime - aSpawnTime;
    float spawnFade = smoothstep(0.0, uSpawnFade, age);
    float forwardFade  = 1.0 - smoothstep(uDespawnBehind - uDespawnFade,
                                          uDespawnBehind, instWorld.z);
    float backwardFade = smoothstep(uFarWall, uFarWall + uDespawnFade, instWorld.z);
    // v11: multiply by global alpha for synchronized despawn/respawn.
    vFade = spawnFade * min(forwardFade, backwardFade) * uGlobalAlpha;

    float novaMatch = step(uNovaIndex - 0.5, float(gl_InstanceID))
                    * step(float(gl_InstanceID), uNovaIndex + 0.5);
    vIsNova = novaMatch;
    vNovaIntensity = uNovaIntensity * novaMatch;

    // ── ADD-ON v3.16 ── Bigger billboard for spike stars.
    // Spike stars need MORE billboard area than dim stars because their
    // diffraction rays extend far from the center. Without this, the
    // rays clip at the rectangle edge (the user's reported issue).
    // Doubling the quad size for spike stars gives the rays room to fade
    // exponentially to invisible inside the billboard, before reaching
    // any corner. Dim stars keep their original aSize unchanged.
    float spikeBoost = mix(1.0, 2.0, aSpike);
    float effectiveSize = mix(aSize * spikeBoost, uNovaScale, novaMatch);
    vec2 quadOffset = (uv - 0.5) * effectiveSize;
    vec4 viewPos    = viewCenter + vec4(quadOffset, 0.0, 0.0);
    gl_Position = projectionMatrix * viewPos;

    // v15-take9: if this star has been consumed by the BH,
    // push it WAY off-screen so the fragment shader is never
    // invoked. Setting w=0 collapses it; using NaN-like
    // coords ensures clipping discards the primitive.
    if (aConsumed > 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside [-1,1]^3
    }
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2  vUv;
  varying float vSpike;
  varying float vTwinkle;
  varying float vBright;
  varying float vDepth;
  varying float vFade;
  varying float vIsNova;
  varying float vNovaIntensity;

  uniform float uLight;
  uniform float uNovaRedShift;  // ── ADD-ON v9.10 ── 0..1, red-giant rendering bias

  float spike(vec2 p, float angle, float thickness, float decay) {
    float c = cos(angle), s = sin(angle);
    vec2  r = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
    return exp(-r.y * r.y * thickness) * exp(-abs(r.x) * decay);
  }

  void main() {
    if (vFade < 0.001 && vIsNova < 0.5) discard;

    vec2  p = vUv - 0.5;
    float r = length(p);

    if (vIsNova > 0.5) {
      float novaCore   = exp(-r * r * 28.0);
      float novaInner  = exp(-r * 6.0) * 0.55;
      float novaOuter  = exp(-r * 2.2) * 0.30;
      float novaSpike = 0.0;
      float th = 350.0 - vNovaIntensity * 200.0;
      float ln = mix(2.4, 1.0, vNovaIntensity);
      novaSpike += spike(p, 0.0,            th, ln);
      novaSpike += spike(p, 0.5235987756,   th, ln);
      novaSpike += spike(p, 1.5707963268,   th, ln);
      novaSpike += spike(p, 2.6179938780,   th, ln);
      novaSpike *= 0.9 * vNovaIntensity;

      // ── ADD-ON v9.11 ── Red giant color bias.
      //
      // Real red supergiants have surface temperatures ~3000-4000K and
      // appear orange-red. We bias the existing nova-color palette
      // toward red giant colors when uNovaRedShift > 0.
      //
      // hotWhite (the central spot color) shifts to a warm orange
      // peach (the warmer "skin" of the giant) shifts to deeper red
      // ember (the outer edge color) shifts to dim crimson
      //
      // This makes the swelling-to-detonation visible as a color shift:
      //   t=0 (start of redgiant): full red palette
      //   t=1 (end of redgiant):   red palette  (still red until charging)
      //   charging phase:          interpolates back to white-hot
      //   detonating onward:       full white-hot palette
      vec3 hotWhite = mix(vec3(1.30, 1.25, 1.15), vec3(1.40, 0.55, 0.20), uNovaRedShift);
      vec3 peach    = mix(vec3(1.20, 0.85, 0.55), vec3(1.10, 0.40, 0.18), uNovaRedShift);
      vec3 ember    = mix(vec3(0.95, 0.45, 0.30), vec3(0.75, 0.20, 0.10), uNovaRedShift);
      // Reduce the spike effect during red giant phase — red giants are
      // diffuse and luminous, not flashy. Spikes are for hot bright stars.
      novaSpike *= mix(1.0, 0.15, uNovaRedShift);
      vec3 ringCol  = mix(hotWhite, peach, smoothstep(0.0,  0.18, r));
      ringCol       = mix(ringCol,  ember, smoothstep(0.18, 0.45, r));

      float novaTotal = (novaCore + novaInner + novaOuter + novaSpike)
                      * (0.6 + vNovaIntensity * 1.8);
      vec3 rgb = ringCol * novaTotal;
      float edge = 1.0 - smoothstep(0.42, 0.50, r);
      rgb *= edge;
      novaTotal *= edge;
      if (novaTotal < 0.003) discard;
      gl_FragColor = vec4(rgb, novaTotal);
      return;
    }

    float closeness = 1.0 - smoothstep(15.0, 45.0, vDepth);

    float coreFalloff = mix(130.0, 60.0, closeness);
    float core = exp(-r * r * coreFalloff);

    float haloFalloff   = mix(9.5, 3.5, closeness);
    float haloIntensity = mix(0.16, 0.55, closeness);
    float halo = exp(-r * haloFalloff) * haloIntensity;
    halo *= 1.0 - smoothstep(0.42, 0.50, r);

    float sp = 0.0;
    if (vSpike > 0.5) {
      // ── ADD-ON v3.17 ── Spike tip clipping fix.
      //
      // Old values: thickness=700, decay=2.2. With the original quad
      // size, the spike along its axis hit the quad edge (r.x = 0.5)
      // with intensity exp(-1.1) ≈ 0.33 — visibly bright at the
      // rectangle boundary. That's the clipping artifact in the
      // reference image the user pointed out.
      //
      // New values: thickness=3000, decay=8.0. Combined with the 2×
      // billboard size from the vertex shader (ADD-ON v3.16):
      //   intensity at quad edge (r.x=0.5)  : exp(-4.0)  = 0.018  (invisible)
      //   intensity at r.x=0.4              : exp(-3.2)  = 0.041  (faint tip)
      //   intensity at r.x=0.2              : exp(-1.6)  = 0.202  (bright body)
      //   intensity at r.x=0.05             : exp(-0.4)  = 0.670  (near core)
      // Thickness was scaled up so the perpendicular profile stays
      // visually thin in the bigger billboard space.
      //
      // Plus an explicit corner mask multiplies the spike output by
      // 1 - smoothstep(0.43, 0.495, r) — guarantees absolute zero at
      // the rectangle corners regardless of axis direction, so even
      // very-bright spikes can't leak through to the corner pixels.
      float th = 3000.0;
      float ln = 8.0;
      sp += spike(p, 0.0,            th, ln * 0.85);
      sp += spike(p, 0.5235987756,   th, ln);
      sp += spike(p, 1.5707963268,   th, ln);
      sp += spike(p, 2.6179938780,   th, ln);
      sp *= 0.6;
      sp *= smoothstep(15.0, 45.0, vDepth);
      // Hard corner mask — the same edge fade we use for halos. This
      // is the belt-and-suspenders that prevents any edge artifact.
      sp *= 1.0 - smoothstep(0.43, 0.495, r);
    }

    // Dark mode palette (emissive stars on dark cosmos).
    vec3 cool = vec3(0.82, 0.92, 1.05);
    vec3 warm = vec3(1.05, 0.95, 0.82);
    vec3 dimDark = mix(warm, cool, smoothstep(0.2, 0.9, vBright));

    vec3 jwstCore   = vec3(1.05, 1.08, 1.18);
    vec3 jwstSpkIn  = vec3(0.65, 0.85, 1.20);
    vec3 jwstSpkOut = vec3(0.85, 0.65, 1.05);
    vec3 jwstHalo   = vec3(1.05, 0.85, 0.85);
    vec3 jwstSpkColor = mix(jwstSpkIn, jwstSpkOut, smoothstep(0.12, 0.42, r));

    vec3 coreColD  = mix(dimDark, jwstCore,     vSpike);
    vec3 spikeColD = mix(dimDark, jwstSpkColor, vSpike);
    vec3 haloColD  = mix(dimDark, jwstHalo,     vSpike);

    // Light mode palette (high-key inverted: dark ink dots on white cosmos).
    vec3 inkDeep   = vec3(0.05, 0.08, 0.16);
    vec3 inkWarm   = vec3(0.15, 0.10, 0.05);
    vec3 dimLight  = mix(inkWarm, inkDeep, smoothstep(0.2, 0.9, vBright));

    vec3 invCore   = vec3(0.10, 0.12, 0.30);
    vec3 invSpkIn  = vec3(0.30, 0.10, 0.05);
    vec3 invSpkOut = vec3(0.10, 0.30, 0.05);
    vec3 invHalo   = vec3(0.05, 0.20, 0.20);
    vec3 invSpkColor = mix(invSpkIn, invSpkOut, smoothstep(0.12, 0.42, r));

    vec3 coreColL  = mix(dimLight, invCore,     vSpike);
    vec3 spikeColL = mix(dimLight, invSpkColor, vSpike);
    vec3 haloColL  = mix(dimLight, invHalo,     vSpike);

    vec3 coreCol  = mix(coreColD,  coreColL,  uLight);
    vec3 spikeCol = mix(spikeColD, spikeColL, uLight);
    vec3 haloCol  = mix(haloColD,  haloColL,  uLight);

    float lightGain = mix(1.0, 1.6, uLight);
    float gain = vTwinkle * (0.6 + vBright * 0.9) * vFade * lightGain;
    vec3 rgb = coreCol * core + spikeCol * sp + haloCol * halo;
    rgb *= gain;

    float intensity = (core + halo + sp) * gain;
    if (intensity < 0.003) discard;

    gl_FragColor = vec4(rgb, intensity);
  }
`;

/* ─────────────────────────────────────────────────────────────────────────────
 *  ── ADD-ON v2.6 ── FlashOverlay (light-mode aware tinting)
 * ──────────────────────────────────────────────────────────────────────────── */
function FlashOverlay({
  flashRef,
  lightRef,
  safeModeRef,
}: {
  flashRef: RefObject<number>;
  lightRef: RefObject<number>;
  safeModeRef: RefObject<boolean>;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  // v20: low-pass-filtered flash value for safe mode. We keep a
  // separate eased value that follows the raw flashRef with a slow
  // time constant when safe mode is on, so sudden 0 → 1.6 spikes
  // become smooth 0 → 0.4 ramps over several seconds.
  const easedFlashRef = useRef<number>(0);
  useFrame((_, delta) => {
    if (!matRef.current) return;
    const raw = flashRef.current ?? 0;
    const safe = safeModeRef.current === true;
    let display: number;
    if (safe) {
      // Cap at 0.4 (well below the 0.6 threshold flagged as risky
      // for large-area luminance flashes) and ease with ~0.8s
      // time constant so the rate of change stays under 2Hz.
      const capped = Math.min(0.4, raw * 0.25);
      const k = 1 - Math.exp(-(1 / 0.8) * delta);
      easedFlashRef.current += (capped - easedFlashRef.current) * k;
      display = easedFlashRef.current;
    } else {
      // No safe mode: pass raw value through (no smoothing).
      easedFlashRef.current = raw;
      display = raw;
    }
    matRef.current.uniforms.uFlash.value = display;
    matRef.current.uniforms.uLight.value = lightRef.current ?? 0;
  });
  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.999,1.0); }`}
        fragmentShader={`precision highp float; uniform float uFlash; uniform float uLight; varying vec2 vUv;
          void main(){
            if (uFlash < 0.001) discard;
            vec2 c = vUv - 0.5;
            float radial = 1.0 - smoothstep(0.0, 0.7, length(c));
            float intensity = uFlash * mix(0.85, 1.0, radial);
            vec3 col = mix(vec3(1.0), vec3(0.95, 0.85, 0.65), uLight);
            gl_FragColor = vec4(col, intensity);
          }`}
        uniforms={{ uFlash: { value: 0 }, uLight: { value: 0 } }}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  ── ADD-ON v3.6 ── NeutronStar (hyperrealistic, with birth sequence)
 *
 *  Visual reference: the user-supplied image of a young pulsar — bright
 *  cyan-white core, two cyan bipolar jets, and a VOLUMETRIC swirling
 *  plasma disc (NOT a clean ring) with magenta/violet outer regions and
 *  cyan-white inner regions, embedded in nebular haze.
 *
 *  Architecture:
 *    groupRef                 (visibility toggle, hides everything pre-forming)
 *      orbitGroupRef          (animates the assembly's world position)
 *        tiltGroupRef         (per-trigger random tilt of the disc/jet axis)
 *          coreSprite         (billboard — bright cyan-white halo)
 *          coreSphere         (small sphere, the actual neutron)
 *          discLayers (×4)    (stacked planes with the swirling shader)
 *          ejectaSprite       (cloudy halo that ONLY shows during forming)
 *          upperJet, lowerJet (cylinders, fade in last during forming)
 *
 *  Position math:
 *    During "forming": position = lerp(detonationXYZ, orbitPos(0), u)
 *      where u eases from 0 to 1 over the forming duration. So the
 *      assembly starts at where the explosion happened and slides into
 *      its orbital position.
 *    During "settled": position = orbitPos(now * speed + revolvePhase)
 *      where orbitPos(angle) returns a point on a tilted 3D circle
 *      around world origin (radius NEUTRON_ORBIT_RADIUS, plane normal
 *      computed from random tiltX/tiltZ).
 *
 *  The orbit plane has a 35-55° tilt component, so the orbit Z-coord
 *  ranges roughly from -16 to +16 — the assembly passes BEHIND the
 *  camera (z > 0) on every revolution, naturally clipping out of view.
 * ──────────────────────────────────────────────────────────────────────────── */

const passthroughVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Disc shader — VOLUMETRIC plasma swirl, not a thin ring.
//
// Each disc layer renders the same shader but with a per-layer phase
// offset (uLayer) so multiple stacked planes show distinct but related
// patterns, producing the "many translucent veils of plasma" feel of
// the reference image.
//
// The pattern is a polar-warped fbm: angle is twisted as a function of
// radius (creating spiral arms), and that warped polar coord drives a
// noise function for the cloud structure. Doppler beaming highlights
// the side rotating toward the viewer.
const discFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uLight;
  uniform float uLayer;       // 0..1, per-stack phase offset
  uniform float uFormProgress; // 0..1 during forming, 1 in settled

  // Hash + noise utilities (cheap value noise, sufficient for clouds).
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.55;
    }
    return v;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float theta = atan(p.y, p.x);

    // Annular mask. Inner edge depends on the formation progress so the
    // disc reveals from outside-in during forming.
    float innerR = mix(0.50, 0.12, uFormProgress);
    if (r < innerR || r > 1.0) discard;

    // Spiral warp: twist theta as a function of radius. The amount of
    // twist gives the spiral-arm look from the reference image.
    float twist = 5.5 * (1.0 - r) + uLayer * 1.3;
    float twistedTheta = theta + twist;

    // ── ADD-ON v4.1 ── Angularly periodic fbm sampling.
    //
    // The previous implementation passed twistedTheta directly (multiplied
    // by a scalar) into a 2D noise function, which is NOT periodic in
    // theta. When theta wrapped from +pi to -pi (across the negative-X
    // axis of the disc), the fbm sample point jumped to a completely
    // different lattice position, creating a hard discontinuity — visible
    // as a straight seam slicing across each disc layer. With four stacked
    // layers each rotated to a different phase, the seams superimposed
    // into the rectangular pinwheel artifact in the reference screenshot.
    //
    // Fix: sample noise at a position on a circle whose radius is set by
    // the desired angular frequency. (cos(theta), sin(theta)) is a perfect
    // 1-to-1 map of the angle to a closed loop in 2D — sampling fbm at
    // that loop is automatically periodic with no discontinuity at
    // theta = +/- pi.
    //
    // The radial component (which differentiates noise samples at different
    // disc radii) is folded in as a separate offset so the result still
    // varies along radius.
    float angScale = 2.4;  // controls angular noise frequency
    vec2 angCoord = vec2(cos(twistedTheta), sin(twistedTheta)) * angScale;
    vec2 radCoord = vec2(r * 4.0, uTime * 0.18);
    float n = fbm(angCoord + radCoord);
    n = pow(n, 1.4);

    // Banded ridges along radius give finer accretion-stream structure.
    float bands = sin(r * 22.0 - uTime * 0.7 + uLayer * 6.28) * 0.5 + 0.5;
    bands = pow(bands, 2.5);

    // Doppler beaming: viewer-approaching side brighter.
    float beam = 0.55 + 0.45 * cos(theta + uTime * 0.9);

    // Inner-to-outer envelope so the disc fades softly at both ends.
    float innerEdge = smoothstep(innerR, innerR + 0.10, r);
    float outerEdge = 1.0 - smoothstep(0.78, 1.00, r);
    float ringMask  = innerEdge * outerEdge;

    // Combine ingredients. The cloud is the main contributor; bands give
    // texture; beam gives directional asymmetry.
    float cloud = (n * 0.85 + bands * 0.30) * ringMask * beam;

    // Each layer contributes proportionally less the higher its index, so
    // the stack reads as one volume rather than four flat planes summed.
    float layerWeight = mix(1.0, 0.45, uLayer);
    // ── ADD-ON v9.5 ── Disc invisible until uFormProgress ramps.
    //
    // Old: intensity = cloud * layerWeight * (0.55 + 0.55 * uFormProgress)
    // gave a 55% baseline intensity even at uFormProgress=0 — the disc
    // would be visible at half-intensity throughout the entire formation.
    // We want the disc to be COMPLETELY HIDDEN until Stage C (50-80% of
    // formation), then ramp to full as material spirals inward.
    //
    // New: intensity = cloud * layerWeight * uFormProgress (linear).
    // At uFormProgress=0, intensity=0 — disc invisible. At uFormProgress=1,
    // intensity = cloud * layerWeight (full). The reveal is driven by
    // uFormProgress alone.
    float intensity = cloud * layerWeight * uFormProgress;

    if (intensity < 0.005) discard;

    // Color ramp inspired by the reference: hot cyan-white at inner edge,
    // through pure cyan in the body, to violet-magenta at the outer rim.
    // The reference image has heavy magenta/blue gradient — match that.
    // ── ADD-ON v9.17 ── Disc colors brought down from HDR.
    //
    // Earlier versions used HDR values up to 1.70 for "luminous glow".
    // With premultiplied-additive blending: result = src + dst·(1-alpha)
    // For visible dimming of stars behind, we need src < dst·alpha.
    // With HDR colors near 1.5-1.7, src always exceeded the dimming
    // term — bright stars under the disc looked just as bright as
    // outside it (as the user noted from the image).
    //
    // New values: max ~0.70, in the [0,1] range. Combined with the
    // higher alpha cap (v9.18), src is now ALWAYS < dst·alpha for any
    // star with dst > ~1. The disc's own emission is dimmer (less
    // HDR sparkle) but the filter effect is now clearly visible:
    // stars and other elements behind the disc are visibly faint.
    vec3 hotCore  = vec3(0.55, 0.65, 0.75); // hot center, was 1.40 1.55 1.70
    vec3 cyan     = vec3(0.30, 0.55, 0.70); // disc body, was 0.55 1.10 1.50
    vec3 magenta  = vec3(0.50, 0.22, 0.65); // violet-magenta, was 1.00 0.45 1.30
    vec3 deep     = vec3(0.20, 0.12, 0.42); // deep violet rim, was 0.35 0.20 0.85

    vec3 col = mix(hotCore, cyan,    smoothstep(innerR, 0.40, r));
    col      = mix(col,     magenta, smoothstep(0.40,   0.75, r));
    col      = mix(col,     deep,    smoothstep(0.75,   1.00, r));

    // Light-mode inversion: same chromatic story but darker plasma on
    // white background. We invert luminosity but preserve hue.
    vec3 darkVariant = (vec3(1.0) - col) * 0.55 + col * 0.15;
    col = mix(col, darkVariant, uLight);
    intensity *= mix(1.0, 1.45, uLight);

    // ── ADD-ON v9.16 ── Soft-filter alpha cap.
    //
    // With premultiplied-additive blending (v9.16):
    //   result = src + dst · (1 - alpha)
    //
    // Capping alpha at 0.55 means at full disc density:
    //   dst · (1 - 0.55) = 0.45 · dst
    // → 45% of the background still shows through. The disc reads as
    // a translucent obscurer, not as opaque matter. Tenuous halo
    // regions (where intensity is low) barely dim anything.
    //
    // src contribution (col * intensity) is unchanged — the disc
    // doesn't lose its own brightness, just lets what's behind
    // partially show through.
    // ── ADD-ON v9.18 ── Stronger alpha cap + clamp.
    //
    // With v9.17's reduced disc colors (max ~0.75 instead of ~1.7),
    // we can now afford a higher alpha cap because the disc no longer
    // overwhelms the dimming with its own emission. Cap raised from
    // 0.55 → 0.70 for clearly perceptible dimming.
    //
    // Also clamping intensity in the alpha channel: previously
    // 'intensity * alphaCap' with intensity > 1 (which can happen
    // when fbm + bands stack above 1) would push alpha above
    // alphaCap, breaking the (1-alpha) dimming math. Clamping intensity
    // to [0,1] before scaling keeps alpha cleanly bounded by alphaCap.
    //
    // Net effect with v9.17 + v9.18 combined:
    //   - Star (dst=1) under dense disc:
    //       result = ~0.55 + 1·(1-0.7) = 0.85 → 15% dim, visible
    //   - Bright star (dst=1.5) under dense disc:
    //       result = ~0.55 + 1.5·0.3 = 1.0 → 33% dim from 1.5
    //   - Dark bg (dst=0) under disc:
    //       result = 0.55 → disc still visible
    float alphaCap = mix(0.70, 0.78, uLight);
    gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0) * alphaCap);
  }
`;

// ── ADD-ON v9.19 ── Particle accretion-disc shaders.
//
// These replace the 2D shader-drawn disc. Each particle is a single
// gl_Point whose position is computed deterministically from uTime and
// per-particle attributes, following Keplerian inflow physics.
//
// Vertex stage:
//   1. Compute lifecycle phase lifeT = fract(uTime/τ + aR0)
//   2. Smooth-fade at lifecycle boundaries (avoid teleport artifacts)
//   3. Radial position r(t) = mix(R_out, R_in, lifeT)
//   4. Cumulative angle θ_acc = K_orbit · (1/√r - 1/√R_out)
//   5. Place at (r·cos θ, height, r·sin θ) in disc-local space
//   6. gl_PointSize with perspective compensation
//
// Fragment stage:
//   - Soft-edged Gaussian profile
//   - Color graded by radial fraction (hot inner → cool outer)
//   - Premultiplied-additive output for the same filter behavior as
//     the old shader disc (dims background where particles are dense)
const discParticleVertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uInnerR;
  uniform float uOuterR;
  uniform float uInflowTau;
  uniform float uOrbitK;
  uniform float uFormProgress;
  uniform float uPixelRatio;

  attribute float aPhase;
  attribute float aR0;          // initial lifecycle phase offset
  attribute float aHeight;      // Y offset within disc thickness
  attribute float aSize;        // size multiplier
  attribute float aSpeedJitter; // angular speed jitter

  varying float vRadialFrac;
  varying float vFade;

  void main() {
    // Lifecycle phase, cycled per particle
    float lifeT = fract(uTime / uInflowTau + aR0);

    // Smooth fade at lifecycle endpoints — particles ramp in at outer
    // edge over first 5% and ramp out before reaching inner edge over
    // last 8% — this avoids the visible "teleport" when fract() wraps.
    float fade = smoothstep(0.0, 0.05, lifeT) * (1.0 - smoothstep(0.92, 1.0, lifeT));
    fade *= uFormProgress; // disc reveals during formation phase

    // Linear inflow: r decays from outer to inner across lifecycle.
    float r = mix(uOuterR, uInnerR, lifeT);
    vRadialFrac = (r - uInnerR) / (uOuterR - uInnerR); // 0 at inner, 1 at outer

    // Cumulative angle from analytical integration (see physics comment
    // at constants). This gives genuine differential rotation: outer
    // particles barely move, inner particles whirl rapidly.
    float thetaAcc = uOrbitK * (1.0 / sqrt(r) - 1.0 / sqrt(uOuterR));
    float angle = aPhase + thetaAcc * aSpeedJitter;

    // Position in disc-local space (XZ plane, Y is disc-normal axis)
    vec3 localPos = vec3(r * cos(angle), aHeight, r * sin(angle));

    vec4 mvPos = modelViewMatrix * vec4(localPos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Size: bigger near center (denser, brighter plasma at inner edge).
    // Perspective compensation via 1/-z so distant particles are smaller.
    float sizeMult = mix(1.6, 0.55, vRadialFrac);
    float perspectiveSize = 200.0 / max(0.1, -mvPos.z);
    gl_PointSize = max(1.0, aSize * sizeMult * perspectiveSize * uPixelRatio);

    vFade = fade;
  }
`;

const discParticleFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uLight;

  varying float vRadialFrac;
  varying float vFade;

  void main() {
    if (vFade < 0.001) discard;

    vec2 p = gl_PointCoord - 0.5;
    float r2 = dot(p, p);
    if (r2 > 0.25) discard; // circular cutoff

    // Soft Gaussian core + halo for "grain with glow" look.
    float core = exp(-r2 * 50.0);
    float halo = exp(-r2 * 8.0) * 0.35;
    float intensity = (core + halo) * vFade;

    // Radial color gradient. Inner particles are hot blue-white;
    // outer particles fade through magenta to deep violet — matching
    // the original disc's aesthetic but in physical "hotter inside"
    // sense (real accretion discs ionize harder near the central object).
    vec3 hotInner = vec3(0.95, 1.05, 1.20); // bluish-white, hot
    vec3 midRing  = vec3(0.75, 0.45, 1.00); // pink-magenta
    vec3 coolEdge = vec3(0.30, 0.18, 0.55); // deep violet

    vec3 col = mix(hotInner, midRing, smoothstep(0.0, 0.45, vRadialFrac));
    col      = mix(col, coolEdge, smoothstep(0.45, 1.0, vRadialFrac));

    // Light-mode inversion (preserves hue, darkens in light theme)
    vec3 darkVariant = (vec3(1.0) - col) * 0.55 + col * 0.15;
    col = mix(col, darkVariant, uLight);

    // Premultiplied-additive output. Same filter math as v9.16-18:
    // dense regions of overlapping particles dim background; sparse
    // halo lets background through. The alpha cap is per-particle low
    // (0.55) so individual particles barely dim — but where many
    // particles overlap, dimming compounds (1-α)^N → naturally denser
    // areas obscure more.
    gl_FragColor = vec4(col * intensity, intensity * 0.55);
  }
`;

// Jet shader — narrow, intensely bright cyan-white core with internal
// MHD-instability ripples (sausage modes), surrounded by a softer halo.
// The taper is reversed from reference: jets in real life broaden slightly
// far from the source as they decompress, but the visual cliché of the
// reference image has them gently widening too — we follow that.
// ── ADD-ON v6.10 ── Hyperrealistic, perfectly-aligned jet shader.
//
// v5 used two cylinders (one rotated 180°) which sometimes showed subtle
// asymmetry between the two halves. v6 uses a SINGLE cylinder spanning
// the full jet length (-NEUTRON_JET_LENGTH to +NEUTRON_JET_LENGTH along
// Y), with the source at the center (vUv.y = 0.5). The two halves are
// generated by the SAME shader code with axial symmetry, so they're
// mathematically identical.
//
// Profile improvements over v5:
//   - Gaussian-shaped transverse profile (smooth falloff, no hard edges)
//     instead of smoothstep — gives a much softer, more luminous look
//   - Slight thickness variation along length (narrow at source,
//     subtly broader toward tips) — physically motivated by jet
//     decompression as it leaves the magnetic confinement region
//   - HDR-bright core (RGB > 1.0) for that bloomed cyan-white look the
//     reference images have
//   - Subtle wave-modulated brightness along length (MHD instabilities)
//   - Outer halo from exponential falloff for the bloom-around-the-beam
//     glow
// ── ADD-ON v7.1 ── Real GPU particle system for the iron jets.
//
// Earlier versions painted a noise-based pattern onto a cone-shaped mesh
// to simulate particles. The result still read as a textured cone, not as
// discrete particles. v7 uses an actual GPU particle system: hundreds of
// real points, each computed independently in a vertex shader, advected
// from the source out to the tip.
//
// Approach (modeled after our earlier nebula work):
//   - BufferGeometry with N particles, each with random per-particle
//     attributes (phase, speed, radial angle, radial fraction, size)
//   - A custom vertex shader animates each particle's position from
//     uTime + aPhase, projecting along the jet axis with a conical
//     spread determined by aRadialAngle and aRadialFraction
//   - Fragment shader emits a soft circular sprite for each particle,
//     fading by lifetime progress
//
// The particles loop: when a particle reaches t=1 (tip of jet), it
// reappears at t=0 (source) due to mod() wrapping, with a fade envelope
// at both ends so the wrap is invisible. With ~600 particles per jet
// and varied per-particle phases/speeds, the eye sees a continuous
// stream rather than synchronized jumps.

const jetVertexShader = /* glsl */ `
  attribute float aPhase;        // 0..1 random offset for de-syncing
  attribute float aSpeed;        // ~0.7..1.3 per-particle speed multiplier
  attribute float aRadialAngle;  // 0..2π emission angle around the cone
  attribute float aRadialFraction; // 0..1 spread fraction (biased to center)
  attribute float aSize;         // base point size in pixels at near-camera

  uniform float uTime;
  uniform float uJetLength;
  uniform float uBaseRadius;
  uniform float uYDirection;     // +1 for upper jet, -1 for lower
  uniform float uJetIntensity;   // 0..1 fade-in during forming

  varying float vProgress;       // 0..1 along the cone
  varying float vSize;

  void main() {
    // Each particle's progress through its lifetime:
    // wrap by mod(...,1) so particles loop indefinitely.
    float t = mod(uTime * 0.32 * aSpeed + aPhase, 1.0);

    // Position along the jet axis: t=0 at apex (source), t=1 at base (tip).
    // Apex is at world origin (the pole); base is at y = uYDirection*uJetLength.
    float along = t * uJetLength * uYDirection;

    // Radial spread in the cone's cross-section. The cone widens linearly
    // from 0 at apex to uBaseRadius at tip, so a particle's radial offset
    // also scales with t.
    float radius = aRadialFraction * uBaseRadius * t;
    float rx = cos(aRadialAngle) * radius;
    float rz = sin(aRadialAngle) * radius;

    vec3 localPos = vec3(rx, along, rz);

    // Standard model→view→projection.
    vec4 worldPos = modelMatrix * vec4(localPos, 1.0);
    vec4 viewPos = viewMatrix * worldPos;
    gl_Position = projectionMatrix * viewPos;

    // Point size in pixels: scale inversely with view-space distance so
    // particles look size-consistent in world units. Multiply by
    // jetIntensity to fade in during formation, and by a lifetime
    // envelope so particles fade in/out at the wrap points.
    float lifetimeEnv =
        smoothstep(0.0, 0.05, t) *
        (1.0 - smoothstep(0.92, 1.0, t));
    float depthScale = 320.0 / max(1.0, -viewPos.z);
    gl_PointSize = aSize * depthScale * lifetimeEnv * uJetIntensity;

    vProgress = t;
    vSize = aSize;
  }
`;

const jetFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uLight;
  varying float vProgress;
  varying float vSize;

  void main() {
    // gl_PointCoord ranges 0..1 across the point sprite. Compute a soft
    // circular falloff and discard outside the radius.
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    if (r > 0.5) discard;

    // Bright Gaussian core, soft falloff to edge.
    float core = exp(-r * r * 24.0);

    // Color gradient: hot white-cyan at apex, cooling to deep cyan at tip.
    // The reference image showed orange/white/yellow; for our
    // cyan-themed neutron star we use the hot-white-to-cyan gradient.
    vec3 hotWhite = vec3(1.65, 1.80, 2.00);
    vec3 coolCyan = vec3(0.55, 1.00, 1.50);
    vec3 col = mix(hotWhite, coolCyan, vProgress);

    // Light-mode dark variant (the cosmos is white, jets are dark cobalt).
    vec3 darkVariant = vec3(0.10, 0.20, 0.45);
    col = mix(col, darkVariant, uLight);

    float intensity = core;
    if (intensity < 0.005) discard;
    intensity *= mix(1.0, 1.5, uLight);

    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

// Core sprite shader — large cyan-white halo that blooms around the
// neutron sphere. Uses radial falloff like the bright stars in the
// starfield, but at much greater intensity and with the JWST-style
// gradient.
const coreSpriteFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uLight;
  uniform float uCoreIntensity; // 0..1

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p);
    if (r > 0.5) discard;

    // Tight core, then exponential halo, then wide diffuse halo.
    float tightCore = exp(-r * r * 80.0);
    float midHalo   = exp(-r * 9.0)  * 0.55;
    float wideHalo  = exp(-r * 2.5)  * 0.20;

    // Circle clip so the bright halo never reveals the quad rectangle.
    float edge = 1.0 - smoothstep(0.42, 0.50, r);

    float intensity = (tightCore + midHalo + wideHalo) * edge * uCoreIntensity;
    if (intensity < 0.005) discard;

    // Very hot bluish-white center → cool cyan halo.
    vec3 hot  = vec3(1.60, 1.65, 1.80);
    vec3 cyan = vec3(0.65, 1.00, 1.40);
    vec3 col = mix(cyan, hot, tightCore);

    vec3 darkVariant = vec3(0.05, 0.15, 0.40);
    col = mix(col, darkVariant, uLight);
    intensity *= mix(1.0, 1.5, uLight);

    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

// Ejecta cloud shader — only shown during forming. Soft, large radial
// haze of the supernova debris cloud that the neutron star is condensing
// out of. Uses a simpler noise-modulated radial falloff.
const ejectaCloudFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uLight;
  uniform float uEjectaIntensity; // 0..1, peaks early in forming, fades by end

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;

    // Big soft falloff to outer edge; cloud structure inside.
    float falloff = pow(1.0 - r, 1.6);
    float cloud = fbm(p * 6.0 + uTime * 0.05) * 0.7 + 0.3;

    float intensity = falloff * cloud * uEjectaIntensity;
    if (intensity < 0.005) discard;

    // Hot ember ramp — recently-detonated ejecta is yellow-orange-red.
    vec3 hotYellow = vec3(1.40, 1.20, 0.65);
    vec3 ember     = vec3(1.10, 0.55, 0.30);
    vec3 cool      = vec3(0.45, 0.55, 0.95);
    vec3 col = mix(ember, hotYellow, smoothstep(0.0, 0.3, r));
    col      = mix(col,   cool,      smoothstep(0.3, 1.0, r));

    vec3 darkVariant = (vec3(1.0) - col) * 0.6 + col * 0.1;
    col = mix(col, darkVariant, uLight);
    intensity *= mix(1.0, 1.4, uLight);

    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

interface NeutronStarProps {
  novaState: RefObject<SupernovaState>;
  lightRef: RefObject<number>;
  visible: RefObject<boolean>;
  novaPosRef: RefObject<THREE.Vector3>;
  collapseScaleRef: RefObject<number>;
  centerProgressRef: RefObject<number>;
  // v12: written each frame — true if NS is currently within the
  // camera frustum (visible on screen). Read by tickSupernova's
  // centering branch to know when to stop the orbit and begin the
  // BH process.
  nsOnScreenRef: RefObject<boolean>;
}

// v12: shared scratch for the on-screen frustum check (allocated
// once outside the component function so it persists between frames
// without being a hook).
const _frustumScratch = new THREE.Vector3();
const _clipMatrix = new THREE.Matrix4();
// v12 take 4: scratch for the bhConsuming per-star screen test.
const _consumeStarPos = new THREE.Vector3();
const _consumeClipMatrix = new THREE.Matrix4();

function NeutronStar({
  novaState,
  lightRef,
  visible,
  novaPosRef,
  collapseScaleRef,
  centerProgressRef,
  nsOnScreenRef,
}: NeutronStarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const orbitGroupRef = useRef<THREE.Group>(null);
  const tiltGroupRef = useRef<THREE.Group>(null);
  // ── ADD-ON v4.3 ── Spin group: rotates around its own Y axis at
  // NEUTRON_SPIN_SPEED to simulate the neutron star's axial rotation.
  // Lives INSIDE tiltGroup so the rotation is around the disc/jet axis
  // (the actual spin axis in physics). Disc, jets, and core sphere all
  // live inside spinGroup so they rotate as a rigid body.
  const spinGroupRef = useRef<THREE.Group>(null);
  // Disc layers — array of refs.
  // ── ADD-ON v9.19 ── Old per-layer disc refs removed (replaced by
  // discParticleMatRef defined below alongside the geometry).
  const jetUpMatRef = useRef<THREE.ShaderMaterial>(null);
  const jetDownMatRef = useRef<THREE.ShaderMaterial>(null);
  const coreSpriteMatRef = useRef<THREE.ShaderMaterial>(null);
  const ejectaMatRef = useRef<THREE.ShaderMaterial>(null);

  // ── ADD-ON v4.4 ── Seamless forming→settled position handoff.
  //
  // Bug in v3: when forming completed, the assembly was at
  //   formEnd = orbitPosition(revolvePhase, ...)
  // but settled mode immediately computed
  //   angle = revolvePhase + now * NEUTRON_REVOLVE_SPEED
  // — and `now` is whatever the absolute clock time is when settled
  // begins, NOT zero. So the first settled frame computes a position at
  // angle (revolvePhase + non-zero), creating a visible jump.
  //
  // Fix: capture the clock time when settled begins (settledStartRef),
  // then compute angle = revolvePhase + (now - settledStart) * SPEED so
  // the first settled frame uses angle = revolvePhase exactly,
  // matching the position where forming ended.
  //
  // Same idea for the spin angle: capture spinStart so axial rotation
  // begins from 0 at the moment of settled entry, not at some random
  // accumulated phase.
  const settledStartRef = useRef<number>(-1);

  // Stable scratch vector to avoid per-frame allocations.
  const scratchVec = useMemo(() => new THREE.Vector3(), []);

  // ── ADD-ON v7.3 ── Particle BufferGeometry for the jets.
  //
  // Built once per mount. Each particle has five random attributes
  // (phase, speed, radial angle, radial fraction, size) that determine
  // its trajectory through the conical volume. The shader reads these
  // in the vertex stage to compute the particle's current position
  // each frame — no JS-side per-frame work, all on the GPU.
  //
  // Single shared geometry for both jets; the per-mesh uniform
  // uYDirection (+1 / -1) selects which pole the particles emit from.
  const jetParticleGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const N = NEUTRON_JET_PARTICLES;
    const positions = new Float32Array(N * 3); // unused (computed in shader) but required
    const phases = new Float32Array(N);
    const speeds = new Float32Array(N);
    const angles = new Float32Array(N);
    const fractions = new Float32Array(N);
    const sizes = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Per-particle random phase so particles aren't synchronized.
      phases[i] = Math.random();
      // Speed multiplier in [0.7, 1.3] so faster/slower particles mix.
      speeds[i] = 0.7 + Math.random() * 0.6;
      // Emission angle around the cone (full 0..2π).
      angles[i] = Math.random() * Math.PI * 2;
      // Radial fraction biased toward center (sqrt distribution gives
      // uniform area density rather than uniform radial spacing, but
      // here we want denser core, so we power-bias instead).
      fractions[i] = Math.pow(Math.random(), 0.6);
      // Size in pixels at near-camera depth, varied for visual interest.
      // ── ADD-ON v8.1 ── Smaller, grainier particle size distribution.
      //
      // Old v7 distribution: uniform over [2.5, 7] — particles felt
      // bloated and homogeneous. Reference image showed a wide range
      // dominated by tiny grains with a few brighter accent points.
      //
      // New: pow(rand, 2.5) maps uniform→biased-toward-zero, then map
      // to [0.5, 2.6]. Result:
      //   - Most particles cluster at the small end (~0.5-1.0 px)
      //   - Some medium (~1.5 px)
      //   - Rare bright accents (~2.5 px max)
      // Square-curve bias gives the "grainy with sparkles" look from
      // the reference.
      const sizeRand = Math.pow(Math.random(), 2.5);
      sizes[i] = 0.5 + sizeRand * 2.1;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geom.setAttribute('aRadialAngle', new THREE.BufferAttribute(angles, 1));
    geom.setAttribute('aRadialFraction', new THREE.BufferAttribute(fractions, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    return geom;
  }, []);

  // ── ADD-ON v9.19 ── Particle disc geometry.
  //
  // Each particle gets:
  //   aPhase        — initial angular position (random over 0..2π)
  //   aR0           — initial lifecycle phase offset (random 0..1) so
  //                   at any time t, particles are spread across the
  //                   full radial range from inner to outer.
  //   aHeight       — small Y offset for disc thickness (±thickness/2)
  //   aSize         — size jitter for "grainy" look (most small, few big)
  //   aSpeedJitter  — angular speed jitter so neighbouring particles
  //                   shear past each other (turbulence cue)
  //
  // 4000 particles distributed by aR0 lifecycle gives natural areal
  // density ∝ 1/r (denser inner, sparser outer) — exactly the look
  // the user asked for (plasma swirling INTO the core).
  const discParticleGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const N = NEUTRON_DISC_PARTICLES;
    const positions = new Float32Array(N * 3); // unused (computed in shader)
    const aPhase = new Float32Array(N);
    const aR0 = new Float32Array(N);
    const aHeight = new Float32Array(N);
    const aSize = new Float32Array(N);
    const aSpeedJitter = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      aPhase[i] = Math.random() * Math.PI * 2;
      aR0[i] = Math.random(); // uniform lifecycle offset
      aHeight[i] = (Math.random() - 0.5) * NEUTRON_DISC_THICKNESS;
      // Power-biased size: most particles tiny, few bigger accents (matches v8.1 jet pattern).
      aSize[i] = 0.5 + Math.pow(Math.random(), 2.2) * 1.8;
      // Angular speed jitter: neighbouring particles shear past each other,
      // creating turbulent micro-structure even though they're on the
      // same lifecycle curve.
      aSpeedJitter[i] = 0.85 + Math.random() * 0.3;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    geom.setAttribute('aR0', new THREE.BufferAttribute(aR0, 1));
    geom.setAttribute('aHeight', new THREE.BufferAttribute(aHeight, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    geom.setAttribute('aSpeedJitter', new THREE.BufferAttribute(aSpeedJitter, 1));

    return geom;
  }, []);

  // ── ADD-ON v9.19 ── Disc particle material ref.
  // Replaces the per-layer disc material refs (now obsolete).
  const discParticleMatRef = useRef<THREE.ShaderMaterial | null>(null);

  // ── ADD-ON v6.5 ── Elliptical orbit math.
  //
  // Position at angle θ in an elliptical orbit:
  //
  //   localX = R_minor · cos(θ)
  //   localY = R_major · sin(orbitTilt) · sin(θ)
  //   localZ = -R_major · cos(orbitTilt) · sin(θ) - orbitZOffset
  //
  // Then rotate (localX, localY) by orbitRotation around world Z, leaving
  // localZ unchanged. The result:
  //   - At θ = 0:    (R_minor, 0, -orbitZOffset) after Z rotation —
  //                  on the side, at orbit center depth.
  //   - At θ = π/2:  (0, R_major·sin(α), -orbitZOffset - R_major·cos(α)) —
  //                  deepest in front of camera (-z extreme).
  //   - At θ = π:    (-R_minor, 0, -orbitZOffset) — other side.
  //   - At θ = 3π/2: (0, -R_major·sin(α), -orbitZOffset + R_major·cos(α)) —
  //                  briefly behind camera (+z extreme, just barely > 0).
  //
  // The major axis direction is dominantly along world -Z (camera depth),
  // with a small tilt by orbitTilt that gives the orbit a 3D sweep
  // through Y rather than being a flat XZ-plane circle.
  const orbitPosition = (
    angle: number,
    tilt: number,
    rotation: number,
    zOffset: number,
    out: THREE.Vector3,
  ) => {
    const sinAng = Math.sin(angle);
    const cosAng = Math.cos(angle);
    const sinT = Math.sin(tilt);
    const cosT = Math.cos(tilt);

    // Local coordinates (before rotation around world Z).
    const localX = NEUTRON_ORBIT_R_MINOR * cosAng;
    const localY = NEUTRON_ORBIT_R_MAJOR * sinT * sinAng;
    const localZ = -NEUTRON_ORBIT_R_MAJOR * cosT * sinAng - zOffset;

    // Rotate (X, Y) around world Z by orbitRotation. localZ unchanged.
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    out.set(localX * cosR - localY * sinR, localX * sinR + localY * cosR, localZ);
    return out;
  };

  useFrame((state, delta) => {
    if (!visible.current) return;
    const ns = novaState.current;
    if (!ns) return;

    // v11: assembly is visible from forming through coreCollapse.
    // After coreCollapse the NS is gone and the black hole takes
    // over visual duty (rendered separately).
    const isVisible =
      ns.phase === 'forming' ||
      ns.phase === 'settled' ||
      ns.phase === 'centering' ||
      ns.phase === 'freezing' ||
      ns.phase === 'pulling' ||
      ns.phase === 'coreCollapse';
    if (groupRef.current) groupRef.current.visible = isVisible;
    if (!isVisible) return;

    const now = state.clock.elapsedTime;
    const lightVal = lightRef.current ?? 0;

    // ── Position math ───────────────────────────────────────────────
    // During forming: lerp from detonation point to first orbit position.
    // During settled: orbital revolution.
    let formProgress = 1;
    let coreIntensity = 1;
    let ejectaIntensity = 0;
    let jetIntensity = 1;

    if (ns.phase === 'forming') {
      const u = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.forming);
      // ── ADD-ON v9.4 ── Disc reveal aligned with Stage C only.
      //
      // formProgress drives uFormProgress in the disc shader, which
      // animates the inner-radius cutoff from outer-edge (innerR=0.50)
      // to inner-edge (innerR=0.12). We want this animation to happen
      // ONLY during Stage C (50-80%), not throughout formation. That
      // way the disc visually starts forming AT the right moment in
      // the sequence — material spiraling inward from the outside as
      // fallback accretion organizes into a disc.
      formProgress = smoothstep01(0.5, 0.8, u);

      // ── ADD-ON v9.3 ── Four-stage formation sub-beat schedule.
      //
      // Each component's intensity is gated by smoothstep windows
      // matching the four explicit stages. The transitions overlap by
      // a small amount so successive stages "hand off" smoothly rather
      // than each component popping in and out.
      //
      //   Stage A (0-25%): ejecta peak, no core/disc/jets
      //   Stage B (25-50%): ejecta fading, core igniting
      //   Stage C (50-80%): ejecta gone, core full, disc forming
      //   Stage D (80-100%): disc full, jets emerging
      //
      // Schedule:
      //   ejecta: ramps in 0-5%, holds full till 30%, fades 30-65%, gone
      //   core:   silent till 25%, ramps 25-50%, full till end
      //   disc:   silent till 50%, ramps 50-80%, full till end (drives
      //           uFormProgress, which the shader uses to reveal the
      //           disc from the outside in — material spiraling toward
      //           the center, mimicking the fallback-disc accretion)
      //   jets:   silent till 80%, ramps 80-100%
      ejectaIntensity = (1 - smoothstep01(0.3, 0.65, u)) * smoothstep01(0.0, 0.05, u);
      coreIntensity = smoothstep01(0.25, 0.5, u);
      // c) disc reveal: handled inside disc shader via uFormProgress
      jetIntensity = smoothstep01(0.8, 1.0, u);

      // ── ADD-ON v8.2 ── Static formation at the detonation position.
      //
      // Earlier versions interpolated position from detonationXYZ to the
      // orbital target during formation. The user noted that this made
      // formation appear to materialize "out of nowhere" rather than
      // visibly happening at the explosion site — because while the
      // visuals were fading in (slow ramps), the position was already
      // moving away from the explosion. By the time the formation
      // visuals were fully visible, the assembly was halfway to the
      // orbit, and the connection to the explosion site was lost.
      //
      // v8 fix: position is FROZEN at detonationXYZ for the entire
      // formation phase. The user clearly sees the ejecta cloud, core
      // ignition, disc establishment, and jet emergence all happening
      // AT the explosion site (deep in the field). When formation
      // completes, the assembly is fully formed at that position, and
      // the settled phase smoothly approaches the orbit (see v8.3).
      //
      // The visual fade-in (ejecta, core, disc, jets) and scale ramp
      // still use smoothstep so the assembly establishes cleanly rather
      // than popping in.
      const easedVis = u * u * (3 - 2 * u);
      if (orbitGroupRef.current) {
        orbitGroupRef.current.position.set(
          ns.detonationXYZ[0],
          ns.detonationXYZ[1],
          ns.detonationXYZ[2],
        );
        const scale = 0.35 + 0.65 * easedVis;
        orbitGroupRef.current.scale.setScalar(scale);
      }

      // Reset settled baseline; it'll be initialized at handoff.
      settledStartRef.current = -1;
    } else {
      // settled — exponential approach from detonation to orbit.

      // ── ADD-ON v8.3 ── Exponential approach to the orbital trajectory.
      //
      // At the moment formation ends, the assembly is at detonationXYZ
      // (deep in the field). It needs to reach the orbital trajectory
      // smoothly, with:
      //   • position continuity at handoff (start at detonationXYZ)
      //   • substantial initial speed (the user wants no perceptual
      //     "stop" or speed drop — the assembly should APPROACH the
      //     orbit at a noticeable speed)
      //   • gradual deceleration (smoothly entering orbital motion)
      //   • asymptotic convergence to the orbit
      //
      // Closed-form solution:
      //   position(t) = P_orbit(t) + ε · exp(-t / τ_approach)
      //
      // where ε = detonationXYZ - P_orbit(0) is the initial position
      // offset (captured once at handoff).
      //
      // Properties (verified):
      //   • At t=0: position = P_orbit(0) + ε = detonationXYZ ✓
      //   • At t→∞: position → P_orbit(t) ✓ (orbital trajectory)
      //   • Initial velocity magnitude ≈ |ε| / τ_approach
      //     For typical detonation depth (~270 units) and τ=6s,
      //     this gives ~45 u/s — substantial initial speed.
      //   • Speed decays exponentially → smooth gradual deceleration.
      //   • Asymptotic speed = orbital tangent magnitude (slow).
      //
      // This single formula handles all four user requirements: clear
      // emergence from the detonation site, substantial entry speed,
      // gradual deceleration, smooth orbital convergence.
      if (settledStartRef.current < 0) {
        settledStartRef.current = now;

        // Settled angle starts where formation left off. With static
        // formation, the orbit didn't progress — settled angle is just
        // the initial revolvePhase.
        ns.formationEndAngle = ns.revolvePhase;

        // Compute initial offset ε = detonationXYZ - P_orbit(0)
        const orbitStart = scratchVec.clone();
        orbitPosition(
          ns.formationEndAngle,
          ns.orbitTilt,
          ns.orbitRotation,
          ns.orbitZOffset,
          orbitStart,
        );
        // Stash on vFormChord (reusing the field; it's now the
        // initial offset ε rather than chord velocity — the math is
        // structurally identical, just with a different decay function).
        ns.vFormChord = [
          ns.detonationXYZ[0] - orbitStart.x,
          ns.detonationXYZ[1] - orbitStart.y,
          ns.detonationXYZ[2] - orbitStart.z,
        ];
      }

      // Compute orbital position at current settled time.
      const settledElapsed = now - settledStartRef.current;
      const angle = ns.formationEndAngle + NEUTRON_REVOLVE_SPEED * settledElapsed;
      orbitPosition(angle, ns.orbitTilt, ns.orbitRotation, ns.orbitZOffset, scratchVec);

      // Add the decaying offset.
      const decay = Math.exp(-settledElapsed / NEUTRON_APPROACH_TAU);
      scratchVec.x += ns.vFormChord[0] * decay;
      scratchVec.y += ns.vFormChord[1] * decay;
      scratchVec.z += ns.vFormChord[2] * decay;

      // v12: NS continues its orbital trajectory throughout the
      // pre-freezing phases of the death cycle. tickSupernova
      // checks frustum visibility (via nsOnScreenRef) to decide
      // when to advance from "centering" to "freezing".
      //
      // Once frozenOrbitAngle is set to null (handoff from
      // centering to freezing), we HOLD the last position for
      // the rest of the death cycle. Override scratchVec with
      // the existing orbitGroupRef position to lock in place.
      if (ns.frozenOrbitAngle === null && orbitGroupRef.current) {
        scratchVec.copy(orbitGroupRef.current.position);
      }

      if (orbitGroupRef.current) {
        orbitGroupRef.current.position.copy(scratchVec);
        // v11: collapse scale ramps from 1 -> 0 during "coreCollapse"
        // phase only (not centering/freezing/pulling).
        const collapseScale = collapseScaleRef.current ?? 1;
        orbitGroupRef.current.scale.setScalar(collapseScale);
      }
    }

    // v11: write the NS world position to the shared ref so the
    // StarField vertex shader can read it as the gravitational-pull
    // center. We use orbitGroup's position (which is the visible
    // center of the assembly) rather than groupRef.current (root,
    // always at origin).
    if (orbitGroupRef.current && novaPosRef.current) {
      novaPosRef.current.copy(orbitGroupRef.current.position);
    }

    // v12: on-screen check. Project NS world position into clip
    // space via the camera's projection*view matrix. If clip x/y
    // are within [-1, 1] AND clip z is within [-1, 1] (in front
    // of camera), it's on screen. We pad slightly (margin = 0.85)
    // so we begin the BH process when the NS is comfortably in
    // frame, not at the edge.
    if (nsOnScreenRef.current !== null && novaPosRef.current) {
      const np = novaPosRef.current;
      // Build a temp clip-space coord. Use the existing scratchVec
      // (we're done with it for this frame).
      _frustumScratch
        .copy(np)
        .applyMatrix4(
          _clipMatrix.multiplyMatrices(
            state.camera.projectionMatrix,
            state.camera.matrixWorldInverse,
          ),
        );
      const margin = 0.85;
      const onScreen =
        _frustumScratch.x > -margin &&
        _frustumScratch.x < margin &&
        _frustumScratch.y > -margin &&
        _frustumScratch.y < margin &&
        _frustumScratch.z > -1 &&
        _frustumScratch.z < 1;
      (nsOnScreenRef as { current: boolean }).current = onScreen;
    }

    // ── ADD-ON v3.15 ── Disc/jet axis tilt is now derived from the
    // per-trigger seed so it varies between supernovas, but is FULLY
    // independent of the orbit's major-axis rotation. (In v3, tiltX was
    // used both for orbit and disc; with the new elliptical orbit, tiltX
    // is now a screen-XY rotation angle that has no meaning for the
    // disc plane — so we derive disc tilts here.)
    if (tiltGroupRef.current) {
      // Two pseudo-random angles in [-π/3, +π/3] (capped at 60° each so
      // the disc stays readable — a 90° tilt would render edge-on as a
      // line). Generated deterministically from starSeed so they don't
      // change frame-to-frame.
      const seed = ns.starSeed;
      const ax = Math.sin(seed * 12.9898) * 0.5 * (Math.PI * 0.66);
      const az = Math.sin(seed * 78.233 + 2.1) * 0.5 * (Math.PI * 0.66);
      tiltGroupRef.current.rotation.x = ax;
      tiltGroupRef.current.rotation.z = az;
    }

    // ── ADD-ON v4.7 / v8.5 ── Self-axis rotation, no wobble.
    //
    // Earlier versions (v6) added a wobbleGroup with a fixed 12° tilt to
    // simulate oblique-rotator pulsars and make rotation more visible.
    // The math was monotonic (rotation.y += SPEED * delta is always
    // positive), but PROJECTING a precessing tilted disc onto a 2D
    // screen produced visible OSCILLATION — the disc tilt-toward-camera
    // and tilt-away components alternated as spinGroup rotated through
    // 0°/90°/180°/270°, which the user perceived as the rotation
    // reversing direction.
    //
    // v8 fix: remove the wobble entirely. The spin is monotonic Y
    // rotation, and the visible rotation signal comes from the disc's
    // spiral-arm shader pattern (which has clear angular features that
    // rotate cleanly in one direction). The jets, being rotationally
    // symmetric around Y, don't visibly rotate — but that matches an
    // ALIGNED (non-oblique) pulsar, which is just as physical as the
    // oblique case.
    //
    // Spin accumulates incrementally without reset, so it runs
    // continuously from formation through settled.
    if (spinGroupRef.current) {
      spinGroupRef.current.rotation.y += NEUTRON_SPIN_SPEED * delta;
    }

    // ── ADD-ON v9.19 ── Drive particle disc uniforms.
    // The per-particle vertex shader handles all rotation/inflow
    // physics from uTime — no per-frame mesh transforms needed.
    {
      const m = discParticleMatRef.current;
      if (m) {
        m.uniforms.uTime.value = now;
        m.uniforms.uLight.value = lightVal;
        m.uniforms.uFormProgress.value = formProgress;
        m.uniforms.uPixelRatio.value = Math.min(2, window.devicePixelRatio || 1);
      }
    }

    // ── ADD-ON v6.17 ── Two jet materials, same uniforms.
    // Upper and lower cones each have their own ShaderMaterial. Update
    // both so they advance synchronously. (They use the same uTime so
    // the particle flow is mirror-symmetric across the source point.)
    if (jetUpMatRef.current) {
      jetUpMatRef.current.uniforms.uTime.value = now;
      jetUpMatRef.current.uniforms.uLight.value = lightVal;
      jetUpMatRef.current.uniforms.uJetIntensity.value = jetIntensity;
    }
    if (jetDownMatRef.current) {
      jetDownMatRef.current.uniforms.uTime.value = now;
      jetDownMatRef.current.uniforms.uLight.value = lightVal;
      jetDownMatRef.current.uniforms.uJetIntensity.value = jetIntensity;
    }
    if (coreSpriteMatRef.current) {
      coreSpriteMatRef.current.uniforms.uLight.value = lightVal;
      coreSpriteMatRef.current.uniforms.uCoreIntensity.value = coreIntensity;
    }
    if (ejectaMatRef.current) {
      ejectaMatRef.current.uniforms.uTime.value = now;
      ejectaMatRef.current.uniforms.uLight.value = lightVal;
      ejectaMatRef.current.uniforms.uEjectaIntensity.value = ejectaIntensity;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={orbitGroupRef}>
        {/* The ejecta cloud is OUTSIDE the tiltGroup — it's the
            unstructured supernova debris from before tilt is meaningful.
            Camera-aligned billboard. */}
        <mesh frustumCulled={false}>
          <planeGeometry args={[26, 26]} />
          <shaderMaterial
            ref={ejectaMatRef}
            vertexShader={passthroughVertexShader}
            fragmentShader={ejectaCloudFragmentShader}
            uniforms={{
              uTime: { value: 0 },
              uLight: { value: 0 },
              uEjectaIntensity: { value: 0 },
            }}
            transparent
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* The core sprite is ALSO outside tiltGroup so it always faces
            the camera regardless of disc orientation. Always present. */}
        <mesh frustumCulled={false}>
          <planeGeometry args={[12, 12]} />
          <shaderMaterial
            ref={coreSpriteMatRef}
            vertexShader={passthroughVertexShader}
            fragmentShader={coreSpriteFragmentShader}
            uniforms={{
              uLight: { value: 0 },
              uCoreIntensity: { value: 1 },
            }}
            transparent
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <group ref={tiltGroupRef}>
          {/* ── ADD-ON v4.8 ── spinGroup wraps the disc, jets, and core
              sphere. Rotated around its local Y-axis (the spin axis = jet
              axis) at NEUTRON_SPIN_SPEED rad/sec, so the entire assembly
              visibly rotates as a rigid body. The disc's internal
              layer-shear (which creates the swirl) is still applied to
              individual disc meshes inside this group, so the visible
              effect is "the whole disc rotates AND the plasma swirls
              within it" — both motions visible together, both physically
              motivated. */}
          <group ref={spinGroupRef}>
            {/* ── ADD-ON v8.6 ── No more wobbleGroup. Children attach
                directly to spinGroup. Removing the wobble eliminates the
                projection-induced apparent reversal of rotation that
                the user reported. */}
            {/* Tiny opaque sphere at the very center — the actual neutron */}
            <mesh>
              <sphereGeometry args={[0.45, 24, 24]} />
              <meshBasicMaterial
                color={new THREE.Color(2.4, 2.4, 2.8)}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            {/* ── ADD-ON v9.19 ── Particle accretion disc.
                4000 grain particles in differential rotation, slowly
                spiralling inward toward the neutron star core. Each
                particle's position is computed in the vertex shader
                from per-particle attributes + uTime, with Keplerian
                inflow physics (inner orbits faster, outer slower). */}
            <points geometry={discParticleGeometry} frustumCulled={false}>
              <shaderMaterial
                ref={discParticleMatRef}
                vertexShader={discParticleVertexShader}
                fragmentShader={discParticleFragmentShader}
                uniforms={{
                  uTime: { value: 0 },
                  uLight: { value: 0 },
                  uInnerR: { value: NEUTRON_DISC_INNER_R },
                  uOuterR: { value: NEUTRON_DISC_RADIUS },
                  uInflowTau: { value: NEUTRON_DISC_INFLOW_TAU },
                  uOrbitK: { value: NEUTRON_DISC_ORBIT_K },
                  uFormProgress: { value: 1 },
                  uPixelRatio: { value: 1 },
                }}
                transparent
                depthWrite={false}
                blending={THREE.CustomBlending}
                blendEquation={THREE.AddEquation}
                blendSrc={THREE.OneFactor}
                blendDst={THREE.OneMinusSrcAlphaFactor}
              />
            </points>

            {/* ── ADD-ON v7.4 ── GPU particle-emitter jets.
                Two <points> objects share one BufferGeometry. The shader
                animates each particle's position from uTime + per-particle
                attributes, projecting along the cone axis toward ±Y. The
                upper jet has uYDirection = +1, the lower has -1, so they
                emit symmetrically from the central pole.

                With ~600 particles each and varied per-particle phases,
                the eye reads a continuous discrete-particle stream
                rather than a textured cone surface. */}

            {/* Upper jet — particles flow toward +Y */}
            <points geometry={jetParticleGeometry} frustumCulled={false}>
              <shaderMaterial
                ref={jetUpMatRef}
                vertexShader={jetVertexShader}
                fragmentShader={jetFragmentShader}
                uniforms={{
                  uTime: { value: 0 },
                  uLight: { value: 0 },
                  uJetIntensity: { value: 1 },
                  uJetLength: { value: NEUTRON_JET_LENGTH },
                  uBaseRadius: { value: NEUTRON_JET_BASE_RADIUS },
                  uYDirection: { value: 1 },
                }}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </points>

            {/* Lower jet — particles flow toward -Y */}
            <points geometry={jetParticleGeometry} frustumCulled={false}>
              <shaderMaterial
                ref={jetDownMatRef}
                vertexShader={jetVertexShader}
                fragmentShader={jetFragmentShader}
                uniforms={{
                  uTime: { value: 0 },
                  uLight: { value: 0 },
                  uJetIntensity: { value: 1 },
                  uJetLength: { value: NEUTRON_JET_LENGTH },
                  uBaseRadius: { value: NEUTRON_JET_BASE_RADIUS },
                  uYDirection: { value: -1 },
                }}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </points>
          </group>
        </group>
      </group>
    </group>
  );
}

// JS smoothstep helper used in the formation sub-beat schedule.
function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  StarField — light-mode aware via dynamic blending switch
 * ──────────────────────────────────────────────────────────────────────────── */
interface StarFieldProps {
  scrollState: RefObject<ScrollState>;
  bp: Breakpoint;
  reducedMotion: boolean;
  visible: RefObject<boolean>;
  novaState: RefObject<SupernovaState>;
  flashRef: RefObject<number>;
  chromaRef: RefObject<number>;
  positionsRef: RefObject<Float32Array | null>;
  lightRef: RefObject<number>;
  // v11: NS world position (updated by NeutronStar each frame) and
  // gravitational-pull strength (driven by the death-cycle phase
  // machine). Pull strength is 0 outside the death cycle; ramps in
  // during "consuming"; stays at peak through "collapsing" and
  // "engulfed"; resets to 0 at the start of "rebirth".
  novaPosRef: RefObject<THREE.Vector3>;
  pullStrengthRef: RefObject<number>;
  collapseScaleRef: RefObject<number>;
  overlayOpacityRef: RefObject<number>;
  // v11 cinematic death cycle:
  //   centerProgressRef  - 0..1 NS-to-center lerp progress
  //   lightTargetRef     - light-mode target (0/1), driven during
  //                        engulfing/whitening for the white-out
  //   whiteFlashRef      - 0..1 extra screen-white intensity
  //                        beyond what light-mode provides
  centerProgressRef: RefObject<number>;
  lightTargetRef: RefObject<number>;
  whiteFlashRef: RefObject<number>;
  globalAlphaRef: RefObject<number>;
  nsOnScreenRef: RefObject<boolean>; // v12
  bhActiveRef: RefObject<boolean>; // v12
  explosionProgressRef: RefObject<number>; // v12 take 2
  explosionGlitchRef: RefObject<number>; // v15-take4 BH-explosion starfield jitter
}

function StarField({
  scrollState,
  bp,
  reducedMotion,
  visible,
  novaState,
  flashRef,
  chromaRef,
  positionsRef,
  lightRef,
  novaPosRef,
  pullStrengthRef,
  collapseScaleRef,
  overlayOpacityRef,
  centerProgressRef,
  lightTargetRef,
  whiteFlashRef,
  globalAlphaRef,
  nsOnScreenRef,
  bhActiveRef,
  explosionProgressRef,
  explosionGlitchRef,
}: StarFieldProps) {
  // v20: SafeMode for damping the per-star explosion-glitch jitter
  // amplitude. Read via hook so we don't have to plumb the ref
  // through props.
  const { safeModeRef } = useSafeModeRefs();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const spikeHaltonIdx = useRef<number>(0);
  const spawnTimeAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  // v11: ref to the aIsVictim attribute so the death-cycle tick
  // can mark/unmark stars.
  const isVictimAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  // v15-take9: ref to the aConsumed attribute (permanent-swallowed flag).
  const isConsumedAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  // v18: ref to the aPullStartTime attribute (per-star pull-start
  // timestamps, used by the wave-pull batching during bhConsuming).
  const pullStartAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  // v18: tracks last frame's consumeOnScreen value so we can detect
  // the transition to false and run a final on-screen catch-all
  // (mark any remaining unflagged on-screen stars as consumed so
  // engulfing starts with a clean field).
  const prevConsumeOnScreenRef = useRef<boolean>(false);

  const cfg = useMemo(() => {
    const baseCount = resolveBp(FIELD_CONFIG.starCount, bp);
    return {
      starCount: reducedMotion ? Math.floor(baseCount * 0.4) : baseCount,
      volumeXY: resolveBp(FIELD_CONFIG.volumeXY, bp),
      volumeZ: resolveBp(FIELD_CONFIG.volumeZ, bp),
      spikeRatio: resolveBp(FIELD_CONFIG.spikeRatio, bp),
    };
  }, [bp, reducedMotion]);

  const data: FieldData = useMemo(() => {
    const { starCount, volumeXY, volumeZ, spikeRatio } = cfg;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const bright = new Float32Array(starCount);
    const tphase = new Float32Array(starCount);
    const tspeed = new Float32Array(starCount);
    const spike = new Float32Array(starCount);
    const spawnTime = new Float32Array(starCount);

    const numSpikes = Math.floor(starCount * spikeRatio);

    for (let i = 0; i < starCount; i++) {
      const isSpike = i < numSpikes;
      if (isSpike) {
        const h = i + 1;
        positions[i * 3 + 0] = (halton(h, 2) - 0.5) * volumeXY;
        positions[i * 3 + 1] = (halton(h, 3) - 0.5) * volumeXY;
        positions[i * 3 + 2] = -5 - halton(h, 5) * (volumeZ - 5);
      } else {
        positions[i * 3 + 0] = (Math.random() - 0.5) * volumeXY;
        positions[i * 3 + 1] = (Math.random() - 0.5) * volumeXY;
        positions[i * 3 + 2] = -5 - Math.random() * (volumeZ - 5);
      }

      spike[i] = isSpike ? 1.0 : 0.0;
      bright[i] = isSpike
        ? 0.85 + Math.random() * 0.15
        : Math.pow(Math.random(), 1.7) * 0.85;
      sizes[i] = isSpike ? 5.5 + Math.random() * 3.5 : 0.35 + Math.random() * 0.95;
      tphase[i] = Math.random() * Math.PI * 2.0;
      tspeed[i] = 0.35 + Math.random() * 1.6;
      spawnTime[i] = -SPAWN_FADE_SECONDS;
    }

    return { positions, sizes, bright, tphase, tspeed, spike, spawnTime, numSpikes };
  }, [cfg]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { positions, sizes, bright, tphase, tspeed, spike, spawnTime, numSpikes } =
      data;
    for (let i = 0; i < cfg.starCount; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const spawnTimeAttr = new THREE.InstancedBufferAttribute(spawnTime, 1);
    spawnTimeAttr.setUsage(THREE.DynamicDrawUsage);

    const g = mesh.geometry;
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    g.setAttribute('aBright', new THREE.InstancedBufferAttribute(bright, 1));
    g.setAttribute('aTwinklePhase', new THREE.InstancedBufferAttribute(tphase, 1));
    g.setAttribute('aTwinkleSpeed', new THREE.InstancedBufferAttribute(tspeed, 1));
    g.setAttribute('aSpike', new THREE.InstancedBufferAttribute(spike, 1));
    g.setAttribute('aSpawnTime', spawnTimeAttr);

    // v11: aIsVictim per-instance attribute (0 by default; flipped to
    // 1 per-victim during the pulling phase, reset to 0 at cycle end).
    const isVictimArr = new Float32Array(cfg.starCount);
    const isVictimAttr = new THREE.InstancedBufferAttribute(isVictimArr, 1);
    isVictimAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aIsVictim', isVictimAttr);
    isVictimAttrRef.current = isVictimAttr;

    // v15-take9: aConsumed per-instance attribute. 1.0 = star has
    // been permanently swallowed by the BH (skip rendering until
    // cycle reset). Set at end of bhConsuming for all victims;
    // cleared at start of next cycle (charging).
    const isConsumedArr = new Float32Array(cfg.starCount);
    const isConsumedAttr = new THREE.InstancedBufferAttribute(isConsumedArr, 1);
    isConsumedAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aConsumed', isConsumedAttr);
    isConsumedAttrRef.current = isConsumedAttr;

    // v18: aPullStartTime per-instance attribute. Default -1 means
    // "not pulled". When a star is wave-selected during bhConsuming,
    // it gets stamped with the current uTime so the shader can
    // compute its individual pull progress. Reset to -1 at cycle
    // restart so the next cycle starts clean.
    const pullStartArr = new Float32Array(cfg.starCount);
    pullStartArr.fill(-1);
    const pullStartAttr = new THREE.InstancedBufferAttribute(pullStartArr, 1);
    pullStartAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPullStartTime', pullStartAttr);
    pullStartAttrRef.current = pullStartAttr;

    spawnTimeAttrRef.current = spawnTimeAttr;
    spikeHaltonIdx.current = numSpikes + 1;

    if (positionsRef && 'current' in positionsRef) {
      (positionsRef as { current: Float32Array }).current = mesh.instanceMatrix
        .array as Float32Array;
    }
  }, [data, dummy, cfg.starCount, positionsRef]);

  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uFarWall.value = -cfg.volumeZ;
    mat.uniforms.uDespawnBehind.value = DESPAWN_BEHIND;
    mat.uniforms.uSpawnFade.value = SPAWN_FADE_SECONDS;
    mat.uniforms.uDespawnFade.value = DESPAWN_FADE_UNITS;
    mat.uniforms.uTwinkleStrength.value = reducedMotion ? 0.0 : 1.0;
  }, [cfg.volumeZ, reducedMotion]);

  // ── ADD-ON v2.9 ── Blending mode switch.
  // Additive in dark mode (stars EMIT photons), ReverseSubtract in light
  // mode (stars REMOVE photons from the white cosmos). Snap-switch at the
  // eased uLight midpoint where the color palette is also halfway, so the
  // mode swap is visually masked.
  //
  // Critical: blending is FIXED-FUNCTION GPU state, NOT shader-program
  // state. Three.js reads these properties every frame at render time, so
  // simply mutating them takes effect on the next draw. We do NOT set
  // `mat.needsUpdate = true` — that would trigger a full GLSL recompile
  // (the program itself hasn't changed!) and depending on the driver, the
  // recompile can race with mid-frame state and surface a Three.js error
  // path that JSON.stringify's a scene object → the parent/children
  // circular-JSON crash. Skip the recompile.
  //
  // We also EXPLICITLY reset the custom-blend properties when switching
  // back to additive, otherwise stale values can carry over in some
  // Three.js versions and confuse the renderer.
  const lastBlendModeRef = useRef<'add' | 'sub' | null>(null);
  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    const lv = lightRef.current ?? 0;
    const want = lv > 0.5 ? 'sub' : 'add';
    if (lastBlendModeRef.current === want) return;

    if (want === 'sub') {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.ReverseSubtractEquation;
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendEquationAlpha = THREE.AddEquation;
      mat.blendSrcAlpha = THREE.OneFactor;
      mat.blendDstAlpha = THREE.OneFactor;
    } else {
      // Reset explicit values before switching to the additive preset, so
      // no custom-blend leftovers can carry over.
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendEquationAlpha = THREE.AddEquation;
      mat.blendSrcAlpha = THREE.OneFactor;
      mat.blendDstAlpha = THREE.OneFactor;
      mat.blending = THREE.AdditiveBlending;
    }
    // Intentionally NO mat.needsUpdate here.
    lastBlendModeRef.current = want;
  });

  useFrame((state: RootState, delta: number) => {
    if (!visible.current) return;

    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const ss = scrollState.current;
    if (!ss) return;

    ss.impulse *= Math.exp(-SCROLL_CONFIG.impulseDecay * delta);
    if (ss.impulse > SCROLL_CONFIG.impulseMax) ss.impulse = SCROLL_CONFIG.impulseMax;
    if (ss.impulse < SCROLL_CONFIG.impulseMin) ss.impulse = SCROLL_CONFIG.impulseMin;

    const velocity = SCROLL_CONFIG.baseDrift + ss.impulse;
    ss.velocity = velocity;

    const dz = velocity * delta;
    const now = state.clock.elapsedTime;

    const ma = mesh.instanceMatrix.array as Float32Array;
    const spikeArr = data.spike;
    const spawnTimeAttr = spawnTimeAttrRef.current;
    const spawnTimeArr = spawnTimeAttr ? (spawnTimeAttr.array as Float32Array) : null;
    const STAR_COUNT = cfg.starCount;
    const VOL_XY = cfg.volumeXY;
    const VOL_Z = cfg.volumeZ;
    const farWall = -VOL_Z;

    // ── ADD-ON v2.10 ── Freeze the chosen instance only during pre-settled
    // ── ADD-ON v3.9 ── Freeze the chosen instance ONLY during the
    // pre-aftermath active phases (charging, detonating, blooming,
    // aftermath). At end of aftermath we transition to "forming" and
    // immediately respawn the starfield slot (consumeNovaStar), so from
    // forming onward the slot is just a regular star — no freeze.
    const ns = novaState.current;
    const novaIdx = ns?.starIndex ?? -1;
    const freezeNova =
      novaIdx >= 0 &&
      ns &&
      ns.phase !== 'idle' &&
      ns.phase !== 'settled' &&
      ns.phase !== 'forming';

    // v11: freeze the entire field during the death cycle. Drift loop
    // is skipped so positions stay locked. The shader's uGlobalAlpha
    // handles synchronized despawn/respawn alpha.
    const fieldFrozen =
      ns &&
      (ns.phase === 'centering' ||
        ns.phase === 'freezing' ||
        ns.phase === 'pulling' ||
        ns.phase === 'coreCollapse' ||
        ns.phase === 'bhCharging' ||
        ns.phase === 'bhDetonating' ||
        ns.phase === 'bhBlooming' ||
        ns.phase === 'bhAftermath' ||
        ns.phase === 'bhForming' ||
        ns.phase === 'bhConsuming' ||
        ns.phase === 'engulfing' ||
        ns.phase === 'swallowed' ||
        ns.phase === 'emerging' ||
        ns.phase === 'dimming');

    let spawnDirty = false;

    if (dz !== 0 && !fieldFrozen) {
      let haltonCounter = spikeHaltonIdx.current;

      for (let i = 0; i < STAR_COUNT; i++) {
        if (freezeNova && i === novaIdx) continue;

        const o = i * 16;
        const newZ = ma[o + 14] + dz;
        ma[o + 14] = newZ;

        if (newZ > DESPAWN_BEHIND) {
          if (spikeArr[i] > 0.5) {
            const h = haltonCounter++;
            ma[o + 12] = (halton(h, 2) - 0.5) * VOL_XY;
            ma[o + 13] = (halton(h, 3) - 0.5) * VOL_XY;
            ma[o + 14] = -5 - halton(h, 5) * (VOL_Z - 5);
          } else {
            ma[o + 12] = (Math.random() - 0.5) * VOL_XY;
            ma[o + 13] = (Math.random() - 0.5) * VOL_XY;
            ma[o + 14] = -5 - Math.random() * (VOL_Z - 5);
          }
          if (spawnTimeArr) {
            spawnTimeArr[i] = now;
            spawnDirty = true;
          }
        } else if (newZ < farWall) {
          if (spikeArr[i] > 0.5) {
            const h = haltonCounter++;
            ma[o + 12] = (halton(h, 2) - 0.5) * VOL_XY;
            ma[o + 13] = (halton(h, 3) - 0.5) * VOL_XY;
          } else {
            ma[o + 12] = (Math.random() - 0.5) * VOL_XY;
            ma[o + 13] = (Math.random() - 0.5) * VOL_XY;
          }
          ma[o + 14] = DESPAWN_BEHIND - 1;
          if (spawnTimeArr) {
            spawnTimeArr[i] = now;
            spawnDirty = true;
          }
        }
      }
      spikeHaltonIdx.current = haltonCounter;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (spawnDirty && spawnTimeAttr) spawnTimeAttr.needsUpdate = true;

    mat.uniforms.uTime.value = now;
    mat.uniforms.uLight.value = lightRef.current ?? 0;
    mat.uniforms.uGlobalAlpha.value = globalAlphaRef.current ?? 1;
    // v12: toggle depthTest so the opaque BH body occludes stars.
    // When BH is inactive, depthTest stays false (always-on-top).
    mat.depthTest = bhActiveRef.current === true;

    // v11: drive the gravitational-pull uniforms.
    // pullStrengthRef is computed in the App-level death-cycle
    // tick; novaPosRef is written by NeutronStar each frame.
    {
      const ps = pullStrengthRef.current ?? 0;
      mat.uniforms.uPullStrength.value = ps;
      const np = novaPosRef.current;
      if (np) {
        const cur = mat.uniforms.uPullCenter.value as THREE.Vector3;
        cur.copy(np);
      }
    }
    // v15-take4: drive uExplosionGlitch from the App-level ref.
    // v20: cap glitch jitter at 0.25 in safe mode (peak goes from
    // 1.0 → 0.25). The per-star spatial twitch is still visible as a
    // very subtle wobble, but the amplitude is too small to register
    // as flicker.
    {
      const rawGlitch = explosionGlitchRef.current ?? 0;
      const safe = safeModeRef.current === true;
      mat.uniforms.uExplosionGlitch.value = safe
        ? Math.min(0.25, rawGlitch * 0.25)
        : rawGlitch;
    }

    // v11: pass per-instance attribute arrays so the death-cycle
    // logic can flag victims and trigger respawn fade-ins.
    const isVictimAttr = isVictimAttrRef.current;
    const isVictimArr = isVictimAttr ? (isVictimAttr.array as Float32Array) : null;

    // v18: bhConsuming wave-pull. Fix two issues from earlier
    // versions:
    //   1. The "stutter to a new position" bug — stars used to
    //      teleport to a partially-pulled position the moment they
    //      were flagged, because the shared uPullStrength was
    //      already non-zero and the shader applied the blend
    //      immediately. Now stars only START moving when their own
    //      aPullStartTime gets stamped to uTime; before that they
    //      stay at home position.
    //   2. The "all at once" pull — every on-screen star used to
    //      get flagged on the first frame. Now we fire WAVES of
    //      5-20 stars at staggered intervals (~0.15-0.30s apart),
    //      so the consumption reads as a fast, eye-catching cascade
    //      rather than a single smear.
    //
    // Per-star pull duration is uPullDuration (0.6s default), cubic-
    // eased so each individual star "falls" into the BH dramatically.
    // After pull completes, the star is marked aConsumed=1 so it
    // disappears permanently and stops being a candidate.
    const pullStartAttr = pullStartAttrRef.current;
    const pullStartArr = pullStartAttr ? (pullStartAttr.array as Float32Array) : null;
    const isConsumedAttr = isConsumedAttrRef.current;
    const isConsumedArr = isConsumedAttr ? (isConsumedAttr.array as Float32Array) : null;

    if (
      ns?.consumeOnScreen &&
      isVictimArr &&
      isVictimAttr &&
      pullStartArr &&
      pullStartAttr &&
      isConsumedArr &&
      isConsumedAttr
    ) {
      const PULL_DURATION = mat.uniforms.uPullDuration.value as number;
      const uTimeNow = mat.uniforms.uTime.value as number;
      let victimDirty = false;
      let pullDirty = false;
      let consumedDirty = false;

      // Pass A: mark stars whose pull has fully completed as
      // permanently consumed. Frees them from the active-victim
      // pool so the per-frame iteration stays cheap and the wave
      // logic can target fresh stars.
      for (let i = 0; i < STAR_COUNT; i++) {
        if (
          isVictimArr[i] > 0.5 &&
          pullStartArr[i] >= 0 &&
          uTimeNow - pullStartArr[i] >= PULL_DURATION
        ) {
          isConsumedArr[i] = 1;
          isVictimArr[i] = 0;
          pullStartArr[i] = -1;
          victimDirty = true;
          pullDirty = true;
          consumedDirty = true;
        }
      }

      // Pass B: fire a new wave if enough time has elapsed since
      // the last one. Wave size + interval are randomized per fire
      // so the cascade has rhythm, not a metronome feel.
      const lastFire = ns.lastWaveTime ?? -1;
      const nextInterval = ns.nextWaveInterval ?? 0;
      const needWave = lastFire < 0 || uTimeNow - lastFire >= nextInterval;

      if (needWave) {
        // Build clip-space matrix once.
        _consumeClipMatrix.multiplyMatrices(
          state.camera.projectionMatrix,
          state.camera.matrixWorldInverse,
        );

        // Collect candidate indices (on-screen, not yet flagged,
        // not yet consumed).
        const candidates: number[] = [];
        for (let i = 0; i < STAR_COUNT; i++) {
          if (isVictimArr[i] > 0.5) continue; // already in flight
          if (isConsumedArr[i] > 0.5) continue; // already gone
          const o = i * 16;
          _consumeStarPos.set(ma[o + 12], ma[o + 13], ma[o + 14]);
          _consumeStarPos.applyMatrix4(_consumeClipMatrix);
          if (
            _consumeStarPos.x > -1.2 &&
            _consumeStarPos.x < 1.2 &&
            _consumeStarPos.y > -1.2 &&
            _consumeStarPos.y < 1.2 &&
            _consumeStarPos.z > -1 &&
            _consumeStarPos.z < 1
          ) {
            candidates.push(i);
          }
        }

        // v18-take3 (Issue 2): DYNAMIC wave size scaled to the
        // remaining candidate pool. Goal: consume every on-screen
        // star via pull animation, never via the engulfing catch-
        // all sweep (which makes stars vanish abruptly).
        //
        // We size each wave so the entire pool clears in ~8 more
        // waves (with 0.10-0.20s intervals = ~1.2s of wave-firing).
        // That leaves plenty of bhConsuming time for the 1.4s pull
        // animations of the LAST wave to complete before the phase
        // ends. Minimum wave size is 20 (always eye-catching);
        // maximum is unbounded (large pools catch up fast).
        const candidateCount = candidates.length;
        const targetWaveSize = Math.max(20, Math.ceil(candidateCount / 8));
        const waveSize = Math.min(targetWaveSize, candidateCount);

        // Fisher-Yates shuffle just enough to pick waveSize random
        // entries (partial shuffle is O(waveSize)).
        for (let k = 0; k < waveSize; k++) {
          const j = k + Math.floor(Math.random() * (candidates.length - k));
          const tmp = candidates[k];
          candidates[k] = candidates[j];
          candidates[j] = tmp;
          const idx = candidates[k];
          isVictimArr[idx] = 1;
          pullStartArr[idx] = uTimeNow;
          victimDirty = true;
          pullDirty = true;
        }

        // v18-take3: wave interval 0.10-0.20s (was 0.15-0.30s).
        // Snappier cascade so we get more waves into the available
        // bhConsuming time and ensure all candidates are flagged
        // before the phase ends.
        ns.lastWaveTime = uTimeNow;
        ns.nextWaveInterval = 0.1 + Math.random() * 0.1;
      }

      if (victimDirty) isVictimAttr.needsUpdate = true;
      if (pullDirty) pullStartAttr.needsUpdate = true;
      if (consumedDirty) isConsumedAttr.needsUpdate = true;
    }

    // v18: detect the consumeOnScreen true → false transition
    // (bhConsuming → engulfing) and run the on-screen catch-all.
    // ANY star still on-screen at that instant gets marked consumed
    // immediately so engulfing starts with a guaranteed clean field.
    const consumeNow = ns?.consumeOnScreen ?? false;
    if (
      prevConsumeOnScreenRef.current &&
      !consumeNow &&
      isVictimArr &&
      isVictimAttr &&
      pullStartArr &&
      pullStartAttr &&
      isConsumedArr &&
      isConsumedAttr
    ) {
      _consumeClipMatrix.multiplyMatrices(
        state.camera.projectionMatrix,
        state.camera.matrixWorldInverse,
      );
      let dirty = false;
      for (let i = 0; i < STAR_COUNT; i++) {
        if (isConsumedArr[i] > 0.5) continue;
        const o = i * 16;
        _consumeStarPos.set(ma[o + 12], ma[o + 13], ma[o + 14]);
        _consumeStarPos.applyMatrix4(_consumeClipMatrix);
        if (
          _consumeStarPos.x > -1.2 &&
          _consumeStarPos.x < 1.2 &&
          _consumeStarPos.y > -1.2 &&
          _consumeStarPos.y < 1.2 &&
          _consumeStarPos.z > -1 &&
          _consumeStarPos.z < 1
        ) {
          isConsumedArr[i] = 1;
          isVictimArr[i] = 0;
          pullStartArr[i] = -1;
          dirty = true;
        }
      }
      if (dirty) {
        isConsumedAttr.needsUpdate = true;
        isVictimAttr.needsUpdate = true;
        pullStartAttr.needsUpdate = true;
      }
    }
    prevConsumeOnScreenRef.current = consumeNow;

    const novaDirtiedSpawn = tickSupernova(
      novaState,
      delta,
      mat,
      flashRef,
      chromaRef,
      ma,
      spawnTimeArr,
      pullStrengthRef,
      collapseScaleRef,
      overlayOpacityRef,
      STAR_COUNT,
      isVictimArr,
      isVictimAttr,
      centerProgressRef,
      lightTargetRef,
      whiteFlashRef,
      nsOnScreenRef,
      explosionProgressRef, // v12 take 2
      explosionGlitchRef, // v15-take4
      isConsumedArr,
      isConsumedAttr, // v15-take9
      pullStartArr,
      pullStartAttr, // v18
    );
    if (novaDirtiedSpawn && spawnTimeAttr) {
      spawnTimeAttr.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cfg.starCount]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uFarWall: { value: 0 },
          uDespawnBehind: { value: DESPAWN_BEHIND },
          uSpawnFade: { value: SPAWN_FADE_SECONDS },
          uDespawnFade: { value: DESPAWN_FADE_UNITS },
          uTwinkleStrength: { value: 1 },
          uNovaIndex: { value: -1 },
          uNovaScale: { value: 1 },
          uNovaIntensity: { value: 0 },
          uNovaRedShift: { value: 0 }, // ── ADD-ON v9.9 ── 0..1 = red giant tint
          uLight: { value: 0 },
          // v11: gravitational pull during death cycle
          uPullStrength: { value: 0 },
          uPullCenter: { value: new THREE.Vector3() },
          // v18 (Issue 2): per-star pull duration (seconds).
          // Bumped from 0.6 to 1.4s after user reported the pull
          // looked like a "flyby" rather than gravitational pull-in.
          // 1.4s gives enough on-screen travel time for the eye to
          // track each star's arc, with cubic ease-in producing a
          // realistic "slow drift, then dramatic acceleration"
          // gravitational-potential profile.
          uPullDuration: { value: 1.4 },
          // v15-take4: BH-explosion starfield glitch driver.
          uExplosionGlitch: { value: 0 },
          // v11: global alpha for despawn/respawn synchronization.
          uGlobalAlpha: { value: 1 },
        }}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Supernova state machine — ── ADD-ON v2.11 ── now ends in "settled"
 * ──────────────────────────────────────────────────────────────────────────── */
function tickSupernova(
  novaState: RefObject<SupernovaState>,
  delta: number,
  mat: THREE.ShaderMaterial,
  flashRef: RefObject<number>,
  chromaRef: RefObject<number>,
  ma: Float32Array,
  spawnTimeArr: Float32Array | null,
  pullStrengthRef: RefObject<number>,
  collapseScaleRef: RefObject<number>,
  overlayOpacityRef: RefObject<number>,
  starCount: number,
  isVictimArr: Float32Array | null,
  isVictimAttr: THREE.InstancedBufferAttribute | null,
  centerProgressRef: RefObject<number>,
  lightTargetRef: RefObject<number>,
  whiteFlashRef: RefObject<number>,
  nsOnScreenRef: RefObject<boolean>,
  // v12 take 2: explosion shell progress (driven during coreExplosion).
  explosionProgressRef: RefObject<number>,
  // v15-take4: BH-explosion starfield glitch (driven during bh* arc).
  explosionGlitchRef: RefObject<number>,
  // v15-take9: per-star consumed flag (set at end of bhConsuming).
  isConsumedArr: Float32Array | null,
  isConsumedAttr: THREE.InstancedBufferAttribute | null,
  // v18: per-star pull-start timestamps (wave-pull batching).
  pullStartArr: Float32Array | null,
  pullStartAttr: THREE.InstancedBufferAttribute | null,
): boolean {
  const ns = novaState.current;
  if (!ns) return false;

  // ============================================================
  // v11: cinematic death cycle (9 phases). Each beat advances on
  // ns.phaseT >= SUPERNOVA_TIMINGS[phase].
  //
  // State outputs driven by this branch:
  //   pull         -> uPullStrength (victim-only pull)
  //   centerProg   -> centerProgressRef (NS-to-center lerp)
  //   collapse     -> collapseScaleRef (NS group scale 1 -> 0)
  //   overlay      -> overlayOpacityRef (black overlay 0 -> 1)
  //   globalAlpha  -> uGlobalAlpha (synchronized despawn/respawn)
  //   lightTarget  -> lightTargetRef (whitening uses light mode)
  //   whiteFlash   -> whiteFlashRef (extra screen-white)
  //
  // Phase ladder:
  //   centering   -> freezing -> pulling -> coreCollapse ->
  //   blackholeForm -> engulfing -> whitening -> emerging -> dimming -> idle
  // ============================================================
  const isDeathPhase =
    ns.phase === 'centering' ||
    ns.phase === 'freezing' ||
    ns.phase === 'pulling' ||
    ns.phase === 'coreCollapse' ||
    ns.phase === 'bhCharging' ||
    ns.phase === 'bhDetonating' ||
    ns.phase === 'bhBlooming' ||
    ns.phase === 'bhAftermath' ||
    ns.phase === 'bhForming' ||
    ns.phase === 'bhConsuming' ||
    ns.phase === 'engulfing' ||
    ns.phase === 'swallowed' ||
    ns.phase === 'emerging' ||
    ns.phase === 'dimming';

  if (isDeathPhase) {
    ns.phaseT += delta;
    const dur = SUPERNOVA_TIMINGS[ns.phase];
    const u = Math.min(1, ns.phaseT / dur);

    let pull = 0;
    let centerProg = 1; // hold at 1 unless centering
    let collapse = 1;
    let overlay = 0;
    let globalAlpha = 1;
    let lightTarget: number | null = null; // null = leave alone
    let whiteFlash = 0;
    let respawn = false;

    // ── centering ───────────────────────────────────────────
    // v12: NS continues its orbital trajectory. Phase advances
    // when one of two conditions is met:
    //   (a) NS world XY is naturally close to screen center
    //       (|x| + |y| < 25 units), OR
    //   (b) the soft-cap duration runs out (u >= 1).
    // Whichever happens first.
    //
    // centerProg ramps to 1.0 only when condition (a) is satisfied
    // (so the NeutronStar fine-tune blend kicks in only when we're
    // actually centering). Otherwise it stays at u (so the HUD label
    // shows progress but no spatial yank happens).
    if (ns.phase === 'centering') {
      // v12: phase advances only when NS is actually visible on
      // screen (frustum-tested per frame by NeutronStar). No
      // time-based fallback — if NS is behind the camera at
      // trigger time, we wait for orbital revolution to bring it
      // back into view.
      const onScreen = nsOnScreenRef.current === true;
      centerProg = onScreen ? 1 : Math.min(0.95, ns.phaseT / 10);
      if (onScreen) {
        // Tell NeutronStar to hold its current position from now
        // through the rest of the death cycle (no more orbit motion).
        ns.frozenOrbitAngle = null;
        ns.phase = 'freezing';
        ns.phaseT = 0;
      }
    }
    // ── freezing ─────────────────────────────────────────────
    // Stars freeze + fade out (drift loop is gated in StarField).
    // Halfway through, we respawn with new random positions but
    // keep them invisible (globalAlpha is 0 by then). At the END
    // of freezing we choose 5-10 victims and flag them.
    else if (ns.phase === 'freezing') {
      // v12: starfield stays VISIBLE. We freeze positions only
      // (the drift loop in StarField is already gated). Background
      // stars remain at full alpha throughout this phase.
      globalAlpha = 1;

      // At end of phase: pick the 5-10 victims that are currently
      // CLOSEST to the NS in the existing field. This means we
      // don't need to teleport stars near the NS to make pull
      // visible — we use the natural neighbours, which keeps the
      // background unchanged.
      if (u >= 1) {
        if (isVictimArr && isVictimAttr) {
          // Reset all victim flags.
          for (let i = 0; i < starCount; i++) isVictimArr[i] = 0;

          const novaPos = mat.uniforms.uPullCenter.value as THREE.Vector3;
          const victimCount = 10 + Math.floor(Math.random() * 11); // v12: 10-20

          // Compute squared distance from NS for every star, then
          // partial-sort by distance to find the K nearest.
          //
          // To stay O(N), we use a bounded insertion: maintain a
          // buffer of the K smallest (idx, dist) pairs seen so far.
          // For N up to ~1200 stars and K up to 10, this is trivial.
          type DistEntry = { idx: number; d2: number };
          const nearest: DistEntry[] = [];
          for (let i = 0; i < starCount; i++) {
            const o = i * 16;
            const dx = ma[o + 12] - novaPos.x;
            const dy = ma[o + 13] - novaPos.y;
            const dz = ma[o + 14] - novaPos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (nearest.length < victimCount) {
              nearest.push({ idx: i, d2 });
              if (nearest.length === victimCount) {
                nearest.sort((a, b) => b.d2 - a.d2); // worst-first
              }
            } else if (d2 < nearest[0].d2) {
              nearest[0] = { idx: i, d2 };
              // Re-heapify by simple sort (K is tiny).
              nearest.sort((a, b) => b.d2 - a.d2);
            }
          }

          // Flag them as victims. Their CURRENT positions are kept
          // — the shader's pull math will draw them inward in the
          // pulling phase. No teleport, no flash.
          for (let k = 0; k < nearest.length; k++) {
            isVictimArr[nearest[k].idx] = 1;
          }
          isVictimAttr.needsUpdate = true;
        }
        ns.phase = 'pulling';
        ns.phaseT = 0;
      }
    }
    // ── pulling ─────────────────────────────────────────────
    // Pull strength ramps 0 -> 1; victims accelerate into NS.
    // Non-victims stay at globalAlpha=0 (invisible).
    else if (ns.phase === 'pulling') {
      pull = u; // linear (the cubic ease-in lives in the shader)
      // v12: starfield stays fully visible. Only the victim stars
      // are pulled (gated in the shader by aIsVictim). Everyone
      // else holds their position at full alpha.
      globalAlpha = 1;
      if (u >= 1) {
        // After pulling, the consumed victim stars need to be
        // respawned at fresh positions so they re-enter the field
        // properly during dimming. Mark them with a far-future
        // spawnTime to keep them invisible during coreCollapse /
        // blackholeForm / engulfing / whitening / emerging; we
        // re-stamp at dimming.
        if (isVictimArr && isVictimAttr && spawnTimeArr) {
          const nowVal = mat.uniforms.uTime.value as number;
          for (let i = 0; i < starCount; i++) {
            if (isVictimArr[i] > 0.5) {
              const o = i * 16;
              ma[o + 12] = (Math.random() - 0.5) * 240;
              ma[o + 13] = (Math.random() - 0.5) * 240;
              ma[o + 14] = -150 - Math.random() * 350;
              spawnTimeArr[i] = nowVal + 100; // far-future = invisible
            }
            isVictimArr[i] = 0;
          }
          isVictimAttr.needsUpdate = true;
          respawn = true;
        }
        ns.phase = 'coreCollapse';
        ns.phaseT = 0;
      }
    }
    // ── coreCollapse ────────────────────────────────────────
    // NS scales 1 -> 0 with a sharp ease so it visibly "implodes".
    else if (ns.phase === 'coreCollapse') {
      // NS scales 1 -> 0 with cubic ease (visible implosion).
      collapse = 1 - u * u * u;
      globalAlpha = 1;
      if (u >= 1) {
        ns.phase = 'bhCharging';
        ns.phaseT = 0;
      }
    }
    // ============================================================
    // v12 take 3: NS -> BH explosion arc, mirrors the supernova arc.
    //
    // The Supernova3D shell is driven by explosionProgressRef across
    // ALL FIVE beats so the visual is a single continuous expansion
    // (not five separate animations). The shell finishes at ~70% of
    // the arc, leaving the last 30% (most of bhForming) for the
    // shell to fade out and the BH to fully assemble underneath.
    // ============================================================
    else if (
      ns.phase === 'bhCharging' ||
      ns.phase === 'bhDetonating' ||
      ns.phase === 'bhBlooming' ||
      ns.phase === 'bhAftermath' ||
      ns.phase === 'bhForming'
    ) {
      collapse = 0;
      globalAlpha = 1;

      // Total arc duration.
      const arcTotal =
        SUPERNOVA_TIMINGS.bhCharging +
        SUPERNOVA_TIMINGS.bhDetonating +
        SUPERNOVA_TIMINGS.bhBlooming +
        SUPERNOVA_TIMINGS.bhAftermath +
        SUPERNOVA_TIMINGS.bhForming;

      // Compute elapsed-since-bhCharging-start.
      let elapsed = 0;
      if (ns.phase === 'bhCharging') {
        elapsed = ns.phaseT;
      } else if (ns.phase === 'bhDetonating') {
        elapsed = SUPERNOVA_TIMINGS.bhCharging + ns.phaseT;
      } else if (ns.phase === 'bhBlooming') {
        elapsed =
          SUPERNOVA_TIMINGS.bhCharging + SUPERNOVA_TIMINGS.bhDetonating + ns.phaseT;
      } else if (ns.phase === 'bhAftermath') {
        elapsed =
          SUPERNOVA_TIMINGS.bhCharging +
          SUPERNOVA_TIMINGS.bhDetonating +
          SUPERNOVA_TIMINGS.bhBlooming +
          ns.phaseT;
      } else {
        // bhForming
        elapsed =
          SUPERNOVA_TIMINGS.bhCharging +
          SUPERNOVA_TIMINGS.bhDetonating +
          SUPERNOVA_TIMINGS.bhBlooming +
          SUPERNOVA_TIMINGS.bhAftermath +
          ns.phaseT;
      }
      const arcU = Math.min(1, elapsed / arcTotal);

      // Drive the Supernova3D shell expansion (smoothstep eased).
      const shellU = Math.min(1, arcU / 0.7);
      const expProg = shellU * shellU * (3 - 2 * shellU);
      if (explosionProgressRef.current !== null) {
        (explosionProgressRef as { current: number }).current = expProg;
      }

      // v14: per-beat cinematic punch \u2014 cranked up to match the
      // 20x-more-violent shell. Chromatic aberration peaks at 1.4
      // (was 0.9), flashRef drives FlashOverlay 2.5x harder.
      //
      // v20.1: chromaRef and explosionGlitchRef are now driven to 0
      // by the end of bhBlooming and held at 0 through bhAftermath
      // and bhForming. The BH becomes visible (bhActive=true) at
      // start of bhAftermath, but previously these refs continued
      // fading lingering 0.5\u21920 values \u2014 the ChromaticAberration
      // post-effect (driven by chromaRef) was sampling R/G/B at
      // offsets up to ~6 px on a 1042-px viewport, which smeared
      // the BH\'s photon ring and silhouette into visible color
      // fringes. Likewise, the in-shader lensing glitch (driven
      // by explosionGlitchRef) was displacing slice-bands of the
      // BH region. The user observed this as the BH "wobbling" or
      // "clipping" during bhAftermath/bhForming and noticed that
      // SafeMode\'s heavy dampening of these refs eliminated it.
      //
      // The supernova "wow" moment is bhDetonating + early
      // bhBlooming. By the time the BH starts forming, that drama
      // is over \u2014 the lingering effects were just smearing the
      // BH. Now they end on a clean note and the BH visual is
      // rock-solid from the moment it appears.
      let punch = 0;
      if (ns.phase === 'bhCharging') {
        // Charging: brightness ramps as u^2, plus rising chromatic.
        punch = u * u;
        (chromaRef as { current: number }).current = u * u * 0.6;
      } else if (ns.phase === 'bhDetonating') {
        // Detonation peak \u2014 maximum chromatic + huge flash.
        punch = 1.5;
        (chromaRef as { current: number }).current = 1.4;
      } else if (ns.phase === 'bhBlooming') {
        // Sustained brilliance through the shockwave.
        // v20.1: quadratic fade to 0 by end of phase (was linear
        // ending at 0.66). The BH is about to form \u2014 chroma must
        // be at 0 before bhAftermath starts so the BH features
        // don\'t get RGB-smeared.
        punch = 1.3 - u * 0.4;
        (chromaRef as { current: number }).current = 1.1 * (1.0 - u) * (1.0 - u);
      } else if (ns.phase === 'bhAftermath') {
        // Slow cooling fade (post-pass illumination only).
        // v20.1: chroma held at 0 from here on \u2014 the BH is now
        // visible and the post-effect would smear its silhouette.
        punch = 0.85 * (1 - u * 0.7);
        (chromaRef as { current: number }).current = 0;
      } else {
        // bhForming
        // Embers \u2014 still some glow as BH crystallizes.
        punch = 0.3 * (1 - u);
        (chromaRef as { current: number }).current = 0;
      }
      // v14: flashRef multiplier 1.6 (was 0.6) so the screen
      // pulses with explosion intensity but no white-out.
      (flashRef as { current: number }).current = punch * 1.6;

      // v15-take4: drive starfield glitch. Peaks during bhDetonating
      // (1.0), still strong through bhBlooming, fades through
      // bhAftermath, near zero by bhForming. The starfield jitter
      // amplitude scales with this so the entire field "twitches"
      // with the explosion energy.
      //
      // v20.1: glitch ends at 0 by end of bhBlooming and stays at 0
      // for bhAftermath and bhForming (same rationale as the chroma
      // change above \u2014 the in-shader lensing glitch path was
      // displacing the BH region after it became visible).
      let glitch = 0;
      if (ns.phase === 'bhCharging') {
        // Builds up linearly during charging.
        glitch = u * 0.4;
      } else if (ns.phase === 'bhDetonating') {
        // Detonation peak \u2014 maximum jitter.
        glitch = 1.0;
      } else if (ns.phase === 'bhBlooming') {
        // Sustained shockwave glitch, fading to 0 (quadratic) so
        // the BH starts bhAftermath with no glitch displacing it.
        glitch = 0.85 * (1.0 - u) * (1.0 - u);
      } else if (ns.phase === 'bhAftermath') {
        // BH is now visible \u2014 hold glitch at 0 so its silhouette
        // doesn\'t get slice-displaced by the lensing post-pass.
        glitch = 0;
      } else {
        // bhForming
        // BH stabilising \u2014 no glitch.
        glitch = 0;
      }
      (explosionGlitchRef as { current: number }).current = glitch;

      if (u >= 1) {
        if (ns.phase === 'bhCharging') {
          ns.phase = 'bhDetonating';
          ns.phaseT = 0;
        } else if (ns.phase === 'bhDetonating') {
          ns.phase = 'bhBlooming';
          ns.phaseT = 0;
        } else if (ns.phase === 'bhBlooming') {
          // v15-take9 (Issue 1): formed-BH coverage 5..9% of screen.
          // Distant, small BH so the user can clearly see stars
          // streaming into it during bhConsuming. The BH then grows
          // larger as the camera approaches during engulfing.
          // v19.3: tightened randomization range from 0.05..0.09
          // (1.8x size variation) to 0.07..0.08 (1.14x). This makes
          // the BH appear more consistently sized across cycles —
          // the user observed cycle-to-cycle variation as "BH gets
          // smaller during bhConsuming", which was actually random
          // size between cycles, not a phase-transition issue.
          ns.targetBhCoverage = 0.07 + Math.random() * 0.01;
          ns.phase = 'bhAftermath';
          ns.phaseT = 0;
        } else if (ns.phase === 'bhAftermath') {
          ns.phase = 'bhForming';
          ns.phaseT = 0;
        } else /* bhForming */ {
          if (explosionProgressRef.current !== null) {
            (explosionProgressRef as { current: number }).current = 0;
          }
          (chromaRef as { current: number }).current = 0;
          (flashRef as { current: number }).current = 0;
          (explosionGlitchRef as { current: number }).current = 0;
          // v15-take5 (Issue 2): bhForming → bhConsuming.
          // The BH first sits stable at its formed size and
          // devours every on-screen star, THEN the camera approach
          // happens in engulfing.
          ns.phase = 'bhConsuming';
          ns.phaseT = 0;
        }
      }
    }
    // v15-take5 (Issue 2): bhConsuming — BH stable at its formed
    // size; ALL on-screen stars get pulled in BEFORE engulfing.
    //
    // Behavior across the phase:
    //   - BH stays put (no camera approach in this phase).
    //   - Pull strength ramps 0 -> 1 cubic-eased so stars get
    //     pulled in progressively faster.
    //   - consumeOnScreen flag tells StarField to flag every
    //     on-screen star as a victim each frame (existing
    //     mechanism from v12).
    //   - At end of phase: clear victim flags and advance to
    //     engulfing for the camera approach.
    //
    // After this phase the starfield is empty (all visible stars
    // have been pulled into the BH center), so the engulfing
    // camera-approach is purely about getting the camera into
    // the BH — no more star consumption needed.
    else if (ns.phase === 'bhConsuming') {
      collapse = 0;
      globalAlpha = 1;
      // v18: pull is per-star (driven by aPullStartTime + uPullDuration
      // in the shader), NOT by the global uPullStrength uniform. The
      // global pull stays at 0 for this entire phase so stars not yet
      // wave-flagged stay at their home position with NO movement.
      // This eliminates the v17 "stutter" where stars teleported to a
      // partially-pulled position the moment they got flagged.
      pull = 0;
      ns.consumeOnScreen = true;
      overlay = 0;
      whiteFlash = 0;
      lightTarget = null;

      // v18: first frame of bhConsuming — reset wave-batching state
      // so each cycle gets its own random rhythm.
      if (ns.phaseT < delta * 1.5) {
        ns.lastWaveTime = -1; // forces immediate first wave
        ns.nextWaveInterval = 0;
      }

      if (u >= 1) {
        ns.consumeOnScreen = false;
        // v18: mark all in-flight victims as permanently consumed
        // (their pull may not have finished but engulfing is about
        // to start; they need to be gone). The on-screen catch-all
        // for any unflagged stars runs in StarField's useFrame
        // (it has camera access for the clip-space test).
        if (isVictimArr && isVictimAttr && isConsumedArr && isConsumedAttr) {
          for (let i = 0; i < starCount; i++) {
            if (isVictimArr[i] > 0.5) {
              isConsumedArr[i] = 1;
              isVictimArr[i] = 0;
            }
          }
          isVictimAttr.needsUpdate = true;
          isConsumedAttr.needsUpdate = true;
        }
        ns.phase = 'engulfing';
        ns.phaseT = 0;
      }
    }
    // v16: engulfing — BH grows DRAMATICALLY at its world position
    // until it engulfs the camera. Camera stays at origin; star
    // consumption already done in bhConsuming. The BH body sphere
    // (DoubleSide) renders the inside surface as solid black when
    // the camera ends up inside it. The overlay snaps in over the
    // last 15% to ensure clean transition into pitch-black
    // swallowed phase.
    else if (ns.phase === 'engulfing') {
      collapse = 0;
      globalAlpha = 1;
      pull = 0;
      ns.consumeOnScreen = false;
      // v19.2 (Ask 2): trigger dark-mode at START of engulfing,
      // not at swallowed. The fade is ~0.6s (LIGHT_MODE_FADE_SECONDS);
      // engulfing is 2.2s. So by the time the BH has grown large
      // enough to fill most of the viewport, the bg is already dark
      // and the user doesn't see bright cream "flashing" through
      // before the overlay snaps in.
      //
      // The supernova ignition trigger set lightTarget=1 way back;
      // we override here so the dark fade rides alongside the BH
      // growth, producing "world darkens as BH consumes everything"
      // rather than "world stays bright then suddenly cuts to black".
      lightTarget = 0;
      // v20.2: overlay ramp delayed to the LAST 30% of engulfing
      // (was 50%). Premature-black-screen analysis:
      //
      //   BH growth is cubic ease-in: bhSize grows from bhSizeAtTarget
      //   to 4 \xd7 distToCamera over the 2.2s engulfing phase. The
      //   camera (at origin) enters the body sphere when bhSize
      //   exceeds distToCamera \u2014 i.e. when easedGrowth (=uEng\xb3)
      //   reaches roughly (distToCamera - bhSizeAtTarget) /
      //   (4\xb7distToCamera - bhSizeAtTarget) \u2248 0.23. That happens at
      //   uEng \u2248 0.61. From uEng=0.61 onward, the camera is INSIDE
      //   the body sphere, which is DoubleSide with a black inner
      //   surface \u2014 the screen NATURALLY goes black via the body
      //   geometry itself, no overlay needed.
      //
      //   v19.2 ramped the overlay from u=0.5, which started darkening
      //   the screen BEFORE the BH had engulfed the camera. The user
      //   saw a premature fade-to-black while the BH was still small
      //   and pulling them in. The actual engulfment moment (uEng\u2248
      //   0.61) was masked behind an already-half-black overlay.
      //
      //   New ramp: u=0.7 to u=1.0. By u=0.7 the camera is reliably
      //   inside the body; the overlay is now a belt-and-suspenders
      //   smoothing the transition to the fully-black `swallowed`
      //   phase, not the mechanism producing the black.
      //
      //   The bg darkening (lightTarget=0 + 0.6s ease) still rides
      //   alongside BH growth, so by the time the body engulfs the
      //   camera the bg behind is already dark \u2014 no bright cream
      //   leaks through during the visible BH growth.
      const ovProg = Math.max(0, Math.min(1, (u - 0.7) / 0.3));
      overlay = ovProg * ovProg * (3 - 2 * ovProg);
      whiteFlash = 0;
      if (u >= 1) {
        ns.phase = 'swallowed';
        ns.phaseT = 0;
      }
    }
    // v17 (Issue 1): swallowed — pitch black hold. ALSO triggers
    // the dark-mode auto-toggle. The BH has fully engulfed the
    // camera at this point (overlay just hit 1.0 at end of
    // engulfing); the screen is opaque black so the lightRef ease
    // is invisible behind the overlay. By the time emerging fades
    // the overlay back, lightRef has settled at 0 and the world
    // emerges in dark mode.
    else if (ns.phase === 'swallowed') {
      collapse = 0;
      globalAlpha = 1;
      // Set dark-mode target. Animator eases lightRef toward 0
      // smoothly during the swallowed beat (which is opaque black
      // so the user doesn't see the crossfade itself).
      lightTarget = 0;
      pull = 0;
      overlay = 1; // hold full black
      whiteFlash = 0;
      if (u >= 1) {
        ns.phase = 'emerging';
        ns.phaseT = 0;
      }
    }
    // v16-take2 (Issue: starfield "re-render" pop): emerging —
    // fade pitch black to reveal starfield directly. NO white flash.
    //
    // CRITICAL: at the very FIRST frame of emerging we clear the
    // aConsumed flags for all consumed stars and stamp their
    // spawnTime to NOW. The spawn-fade shader then fades them in
    // over SPAWN_FADE_SECONDS (0.6s). This happens while the
    // overlay is still at full opacity (overlay=1.0), so the
    // unmask is invisible.
    //
    // As the overlay fades 1→0 over the rest of emerging, the
    // consumed stars' alpha simultaneously rises 0→1 via
    // spawn-fade. Net effect: ALL stars (consumed and non-
    // consumed) become visible together at their HOME positions,
    // smoothly fading in alongside the overlay fade. No discrete
    // "pop" at end of dimming where the user previously saw
    // ~half the field suddenly reappear.
    else if (ns.phase === 'emerging') {
      collapse = 0;
      globalAlpha = 1;
      lightTarget = null;
      pull = 0;
      // First frame of emerging: clear aConsumed + restamp spawnTime.
      // v18: ALSO reset aPullStartTime to -1 for all stars so the
      // shader's per-star pull math is a no-op next cycle.
      if (ns.phaseT < delta * 1.5 && isConsumedArr && isConsumedAttr && spawnTimeArr) {
        const nowVal = mat.uniforms.uTime.value as number;
        for (let i = 0; i < starCount; i++) {
          if (isConsumedArr[i] > 0.5) {
            isConsumedArr[i] = 0;
            spawnTimeArr[i] = nowVal;
          }
          if (pullStartArr) pullStartArr[i] = -1;
        }
        isConsumedAttr.needsUpdate = true;
        if (pullStartAttr) pullStartAttr.needsUpdate = true;
        respawn = true;
      }
      // Smoothstep ease-out overlay from 1 → 0 over the phase.
      const fade = 1 - u;
      overlay = fade * fade * (3 - 2 * fade);
      whiteFlash = 0;
      if (u >= 1) {
        ns.phase = 'dimming';
        ns.phaseT = 0;
      }
    }
    // ── dimming ─────────────────────────────────────────────
    // Final dim to black. Respawn ALL stars with current spawnTime
    // so the existing shader fade-in plays as overlay fades away.
    else if (ns.phase === 'dimming') {
      collapse = 0;
      // v12: only re-stamp spawnTime for the consumed victims.
      // Non-victim stars keep their original positions AND
      // their original spawnTime, so they continue rendering
      // unchanged — no position snap when the cycle ends.
      //
      // Victims were marked with a far-future spawnTime at end
      // of pulling; we re-stamp them now so the shader's
      // spawnFade plays them in alongside the dim-from-black.
      if (ns.phaseT < delta * 1.5 && spawnTimeArr) {
        const nowVal = mat.uniforms.uTime.value as number;
        for (let i = 0; i < starCount; i++) {
          // Only re-stamp the ones still flagged invisible
          // (spawnTime > current uTime, i.e., far-future stamps
          // we set earlier).
          if (spawnTimeArr[i] > nowVal) {
            spawnTimeArr[i] = nowVal;
          }
        }
        respawn = true;
      }
      // Black overlay was at 0 throughout the death cycle (we
      // never used it for the BH path). Keep it at 0; the white
      // flash overlay (already fading from emerging) is the only
      // overlay we needed.
      overlay = 0;
      globalAlpha = 1;
      if (u >= 1) {
        // v16-take2: aConsumed was already cleared at start of
        // emerging. This block is now just a SAFETY net — if
        // anything left a consumed flag set, clear it here so the
        // next cycle starts with a full field.
        if (isConsumedArr && isConsumedAttr) {
          let dirty = false;
          for (let i = 0; i < starCount; i++) {
            if (isConsumedArr[i] > 0.5) {
              isConsumedArr[i] = 0;
              dirty = true;
            }
          }
          if (dirty) isConsumedAttr.needsUpdate = true;
        }
        ns.phase = 'idle';
        ns.phaseT = 0;
        ns.respawnedThisCycle = false;
        ns.frozenOrbitAngle = undefined; // v12: clear freeze flag
      }
    }

    // Drive App refs.
    if (pullStrengthRef.current !== null) {
      (pullStrengthRef as { current: number }).current = pull;
    }
    if (collapseScaleRef.current !== null) {
      (collapseScaleRef as { current: number }).current = collapse;
    }
    if (overlayOpacityRef.current !== null) {
      (overlayOpacityRef as { current: number }).current = overlay;
    }
    if (centerProgressRef.current !== null) {
      (centerProgressRef as { current: number }).current = centerProg;
    }
    if (whiteFlashRef.current !== null) {
      (whiteFlashRef as { current: number }).current = whiteFlash;
    }
    if (lightTarget !== null && lightTargetRef.current !== null) {
      (lightTargetRef as { current: number }).current = lightTarget;
    }

    mat.uniforms.uGlobalAlpha.value = globalAlpha;

    // Quiescent supernova-side uniforms.
    mat.uniforms.uNovaIndex.value = -1;
    mat.uniforms.uNovaScale.value = 1;
    mat.uniforms.uNovaIntensity.value = 0;
    mat.uniforms.uNovaRedShift.value = 0;
    (flashRef as { current: number }).current = 0;
    (chromaRef as { current: number }).current = 0;

    return respawn;
  }

  if (ns.phase === 'idle' || ns.phase === 'settled' || ns.phase === 'forming') {
    // During forming the starfield-side nova render (scaled instance) is
    // already gone — the NeutronStar group handles the visuals. Keep
    // uniforms quiescent for the field shader.
    mat.uniforms.uNovaIndex.value = -1;
    mat.uniforms.uNovaScale.value = 1;
    mat.uniforms.uNovaIntensity.value = 0;
    mat.uniforms.uNovaRedShift.value = 0;
    (flashRef as { current: number }).current = 0;
    (chromaRef as { current: number }).current = 0;
    // v11: keep death-cycle refs at default outside the death cycle.
    if (pullStrengthRef.current !== null) {
      (pullStrengthRef as { current: number }).current = 0;
    }
    if (collapseScaleRef.current !== null) {
      (collapseScaleRef as { current: number }).current = 1;
    }
    if (overlayOpacityRef.current !== null) {
      (overlayOpacityRef as { current: number }).current = 0;
    }
    if (centerProgressRef.current !== null) {
      (centerProgressRef as { current: number }).current = 0;
    }
    if (whiteFlashRef.current !== null) {
      (whiteFlashRef as { current: number }).current = 0;
    }
    if (explosionProgressRef.current !== null) {
      (explosionProgressRef as { current: number }).current = 0;
    }
    mat.uniforms.uGlobalAlpha.value = 1;
    // We still need to advance the forming phase clock so it eventually
    // transitions to settled.
    if (ns.phase === 'forming') {
      ns.phaseT += delta;
      if (ns.phaseT >= SUPERNOVA_TIMINGS.forming) {
        ns.phase = 'settled';
        ns.phaseT = 0;
      }
    }
    return false;
  }

  ns.phaseT += delta;
  const dur = SUPERNOVA_TIMINGS[ns.phase];
  const u = Math.min(1, ns.phaseT / dur);

  let scale = 1,
    intensity = 0,
    flash = 0,
    chroma = 0,
    redShift = 0;

  if (ns.phase === 'redgiant') {
    // ── ADD-ON v9.12 ── Red giant phase: slow swell + reddening.
    //
    // The doomed star's hydrogen envelope expands while its iron core
    // silently builds toward the Chandrasekhar limit. Visually:
    //   - scale grows from 1 (normal) to 8 (red giant, ~8x the
    //     visible size of the original star) over 1.8s
    //   - intensity rises from 0.05 (typical bright star) to 0.45
    //     (luminous but not flashy — red giants are big but cool)
    //   - redShift = 1 throughout (full red giant color palette)
    //
    // Easing: smoothstep so the start is gentle (the star is just
    // starting to bloat) and the end is gentle (just before charging
    // takes over with a much faster scale-up).
    const eased = u * u * (3 - 2 * u);
    scale = 1 + eased * 7;
    intensity = 0.05 + eased * 0.4;
    redShift = 1.0;
    if (u >= 1) {
      advance(ns, 'charging');
      return false;
    }
  } else if (ns.phase === 'charging') {
    const eased = u * u;
    scale = 8 + eased * 8; // continue from 8 (red giant size) up to 16
    intensity = 0.45 + eased * 0.25;
    // ── ADD-ON v9.13 ── Color shifts from full red back to white-hot
    // as the star "ignites" out of the red giant phase into the bright
    // pre-detonation flash.
    redShift = 1.0 - eased;
    if (u >= 1) {
      // v17 (Issue 1): supernova white flash starts → switch to LIGHT
      // mode. The mode crossfade rides along with the white flash so
      // the world appears to "flash bright and stay bright".
      (lightTargetRef as { current: number }).current = 1;
      advance(ns, 'detonating');
      return false;
    }
  } else if (ns.phase === 'detonating') {
    const eased = 1 - Math.pow(1 - u, 4);
    scale = 16 + eased * 60;
    intensity = 0.7 + eased * 0.5;
    flash = Math.min(1, eased * 1.4);
    chroma = eased * 0.6;
    redShift = 0;
    if (u >= 1) {
      advance(ns, 'blooming');
      return false;
    }
  } else if (ns.phase === 'blooming') {
    const eased = u;
    scale = 76 + eased * 20;
    intensity = 1.2 - eased * 0.7;
    flash = (1 - eased) * 0.85;
    chroma = 0.6 + Math.sin(u * Math.PI) * 0.4;
    if (u >= 1) {
      advance(ns, 'aftermath');
      return false;
    }
  } else if (ns.phase === 'aftermath') {
    scale = 0;
    intensity = 0;
    flash = 0;
    chroma = (1 - u) * 0.6;
    if (u >= 1) {
      // ── ADD-ON v3.8 ── Transition to forming, NOT directly to settled.
      // The forming phase runs for SUPERNOVA_TIMINGS.forming seconds
      // during which the <NeutronStar> component plays the birth sequence
      // (ejecta cloud → core ignition → disc reveal → jets). The chosen
      // starfield instance is respawned NOW so the field has no hole
      // during the long forming animation.
      consumeNovaStar(ns.starIndex, ma, spawnTimeArr);
      ns.phase = 'forming';
      ns.phaseT = 0;
      mat.uniforms.uNovaIndex.value = -1;
      mat.uniforms.uNovaScale.value = 1;
      mat.uniforms.uNovaIntensity.value = 0;
      mat.uniforms.uNovaRedShift.value = 0;
      (flashRef as { current: number }).current = 0;
      (chromaRef as { current: number }).current = 0;
      return spawnTimeArr !== null;
    }
  }

  mat.uniforms.uNovaIndex.value = ns.starIndex;
  mat.uniforms.uNovaScale.value = scale;
  mat.uniforms.uNovaIntensity.value = intensity;
  mat.uniforms.uNovaRedShift.value = redShift;
  (flashRef as { current: number }).current = flash;
  (chromaRef as { current: number }).current = chroma;
  return false;
}

function advance(ns: SupernovaState, next: SupernovaPhase) {
  ns.phase = next;
  ns.phaseT = 0;
}

function consumeNovaStar(
  index: number,
  ma: Float32Array,
  spawnTimeArr: Float32Array | null,
) {
  if (index < 0) return;
  const o = index * 16;
  ma[o + 12] = (Math.random() - 0.5) * 240;
  ma[o + 13] = (Math.random() - 0.5) * 240;
  ma[o + 14] = -150 - Math.random() * 350;
  if (spawnTimeArr) {
    spawnTimeArr[index] = -SPAWN_FADE_SECONDS;
  }
}

function AdaptiveDPR({ min, max }: { min: number; max: number }) {
  const { setDpr } = useThree();
  const samples = useRef<number[]>([]);
  const lastAdjust = useRef<number>(0);
  const currentDpr = useRef<number>(max);

  useEffect(() => {
    setDpr(max);
    currentDpr.current = max;
  }, [max, setDpr]);

  useFrame((state: RootState, delta: number) => {
    const arr = samples.current;
    arr.push(delta);
    if (arr.length > 30) arr.shift();
    if (arr.length < 30) return;

    const now = state.clock.elapsedTime;
    if (now - lastAdjust.current < 1.5) return;

    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    const fps = 1 / (sum / arr.length);

    let nextDpr = currentDpr.current;
    if (fps < 45 && currentDpr.current > min) {
      nextDpr = Math.max(min, currentDpr.current - 0.25);
    } else if (fps > 58 && currentDpr.current < max) {
      nextDpr = Math.min(max, currentDpr.current + 0.25);
    }

    if (nextDpr !== currentDpr.current) {
      currentDpr.current = nextDpr;
      setDpr(nextDpr);
      lastAdjust.current = now;
    }
  });

  return null;
}

function ChromaticAberrationDriver({
  effectRef,
  chromaRef,
  safeModeRef,
}: {
  effectRef: RefObject<ChromaticAberrationEffect | null>;
  chromaRef: RefObject<number>;
  safeModeRef: RefObject<boolean>;
}) {
  // v20: low-pass-filter chroma offset in safe mode. The raw
  // chromaRef can pulse rapidly (0..1.4 during bhDetonating with
  // sin() modulation in bhBlooming), producing high-frequency RGB-
  // channel-separation flicker that's a known seizure trigger.
  //
  // In safe mode we cap the magnitude to a quarter of the peak AND
  // pass it through a slow exponential filter (~1.2s time constant)
  // so the offset eases in/out as a gentle constant-ish "warp" feel
  // rather than a rapid pulse.
  const easedRef = useRef<number>(0);
  useFrame((_, delta) => {
    const eff = effectRef.current;
    if (!eff || !eff.offset) return;
    const raw = chromaRef.current ?? 0;
    const safe = safeModeRef.current === true;
    let k: number;
    if (safe) {
      const capped = Math.min(0.35, raw * 0.25);
      const lerpK = 1 - Math.exp(-(1 / 1.2) * delta);
      easedRef.current += (capped - easedRef.current) * lerpK;
      k = easedRef.current;
    } else {
      easedRef.current = raw;
      k = raw;
    }
    eff.offset.set(k * 0.012, k * 0.006);
  });
  return null;
}

// ============================================================
// v13 (genesis-port): LensingDriver \u2014 single per-frame driver for
// the BlackHolePostEffect uniforms.
//
// Mirrors the reference\'s PostProcessor uniform-driving block:
//   uCenter           = project(bhPos) \u2192 UV
//   uRadius           = apparent screen-space radius via FOV math
//   uActive           = bhActiveRef ? 1 : 0  (smoothed by coverage)
//   uPhotonRingBoost  = whiteFlash + bhCoverage scaled
//   uPostFlash        = whiteFlashRef value (during whitening)
// ============================================================
function LensingDriver({
  effectRef,
  bhPositionRef,
  bhCoverageRef,
  bhActiveRef,
  whiteFlashRef,
  explosionGlitchRef,
  lightRef,
  safeModeRef,
}: {
  effectRef: RefObject<LensingEffect | null>;
  bhPositionRef: RefObject<THREE.Vector3>;
  bhCoverageRef: RefObject<number>;
  bhActiveRef: RefObject<boolean>;
  whiteFlashRef: RefObject<number>;
  explosionGlitchRef: RefObject<number>;
  // v18-take3: light-mode awareness for the lensing post-pass.
  lightRef: RefObject<number>;
  // v20: SafeMode awareness — drives uSafeMode + dampens glitch/flash.
  safeModeRef: RefObject<boolean>;
}) {
  const projVec = useMemo(() => new THREE.Vector3(), []);
  // v20: low-pass eased glitch + flash values for safe mode.
  const easedGlitchRef = useRef<number>(0);
  const easedFlashRef = useRef<number>(0);
  useFrame((state, delta) => {
    const eff = effectRef.current;
    if (!eff) return;
    const uniforms = (eff as unknown as { uniforms: Map<string, THREE.Uniform> })
      .uniforms;
    if (!uniforms) return;

    const active = bhActiveRef.current === true;
    const cov = bhCoverageRef.current ?? 0;
    const bp = bhPositionRef.current;
    const rawFlash = whiteFlashRef.current ?? 0;
    const rawGlitch = explosionGlitchRef.current ?? 0;
    const safe = safeModeRef.current === true;

    // v20: in safe mode, dampen glitch + flash via low-pass filter so
    // they appear as slow drifts rather than rapid pulses. Cap
    // magnitudes well below clinical seizure thresholds. The shader
    // also reads uSafeMode and uses a different glitch ALGORITHM
    // (radial cosmic ripple instead of horizontal-slice + RGB-split).
    let glitchOut: number;
    let flashOut: number;
    if (safe) {
      const cappedGlitch = Math.min(0.35, rawGlitch * 0.4);
      const cappedFlash = Math.min(0.35, rawFlash * 0.35);
      const kG = 1 - Math.exp(-(1 / 1.0) * delta);
      const kF = 1 - Math.exp(-(1 / 1.2) * delta);
      easedGlitchRef.current += (cappedGlitch - easedGlitchRef.current) * kG;
      easedFlashRef.current += (cappedFlash - easedFlashRef.current) * kF;
      glitchOut = easedGlitchRef.current;
      flashOut = easedFlashRef.current;
    } else {
      easedGlitchRef.current = rawGlitch;
      easedFlashRef.current = rawFlash;
      glitchOut = rawGlitch;
      flashOut = rawFlash;
    }
    uniforms.get('uGlitch')!.value = glitchOut;
    uniforms.get('uGlitchTime')!.value = state.clock.elapsedTime;
    uniforms.get('uSafeMode')!.value = safe ? 1.0 : 0.0;
    uniforms.get('uLight')!.value = lightRef.current ?? 0;

    if (!active || cov <= 0 || !bp) {
      uniforms.get('uActive')!.value = 0;
      uniforms.get('uPostFlash')!.value = flashOut;
      return;
    }

    // Project BH world position \u2192 NDC \u2192 UV [0..1].
    projVec.copy(bp).project(state.camera);
    uniforms.get('uCenter')!.value.set(projVec.x * 0.5 + 0.5, projVec.y * 0.5 + 0.5);

    // The post-pass treats uRadius as the apparent screen-space
    // radius (NDC-y units). Coverage \u2248 radius / halfDiag, so
    // radius \u2248 coverage * halfDiag. Since halfDiag \u2248 sqrt(1+aspect\u00b2)/2
    // for a unit-height NDC viewport, and we just want roughly
    // "fraction of half-height", we map coverage directly with a
    // small bias so the ring/lens are visible the moment the BH
    // forms.
    const radius = Math.min(1.4, Math.max(cov, 0.02));
    uniforms.get('uRadius')!.value = radius;

    // Master "active" fade ramps in over the first slice of cov so
    // the ring/horizon overlay doesn\'t pop on at full strength.
    uniforms.get('uActive')!.value = Math.min(1, cov * 6);

    // Photon ring boost rises during engulfing (when whiteFlash also
    // rises). This is the moment the ring should bloom toward the
    // singularity entry.
    uniforms.get('uPhotonRingBoost')!.value = Math.min(1, flashOut + cov * 0.3);

    // Pass-through white flash for the singularity passage.
    uniforms.get('uPostFlash')!.value = flashOut;

    // Aspect correction.
    const dom = state.gl.domElement;
    uniforms.get('uAspect')!.value = dom.clientWidth / dom.clientHeight;
  });
  return null;
}

/* \u2500\u2500 ADD-ON v2.13 \u2500\u2500 Eased lightRef toward target.
 * targetRef is read every frame (not a prop) so toggling does not cause
 * any React re-render of <App> or its descendants — toggling just writes
 * a new value to the ref and the animator picks it up on the next frame. */
function LightModeAnimator({
  lightRef,
  targetRef,
}: {
  lightRef: RefObject<number>;
  targetRef: RefObject<number>;
}) {
  useFrame((_, delta) => {
    if (lightRef.current === null) return;
    const cur = lightRef.current;
    const target = targetRef.current ?? 0;
    if (Math.abs(cur - target) < 0.001) {
      (lightRef as { current: number }).current = target;
      return;
    }
    const k = 1 - Math.exp(-(1 / LIGHT_MODE_FADE_SECONDS) * 4 * delta);
    (lightRef as { current: number }).current = cur + (target - cur) * k;
  });
  return null;
}

// ============================================================
// v13: CameraFOVDriver \u2014 widens camera FOV during engulfing to
// simulate the "camera being pulled into the BH" feel. As coverage
// approaches 1.0, the FOV opens up from 65 (default) toward 90,
// producing a subtle but unmistakable spaghettification distortion.
// Reverts smoothly back to default during emerging/dimming.
// ============================================================
const FOV_DEFAULT = 65;
const FOV_ENGULF = 92;
const FOV_LERP_RATE = 2.5; // higher = snappier
function CameraFOVDriver({
  bhCoverageRef,
  novaState,
}: {
  bhCoverageRef: RefObject<number>;
  novaState: RefObject<SupernovaState>;
}) {
  useFrame((state, delta) => {
    const cam = state.camera;
    if (!(cam instanceof THREE.PerspectiveCamera)) return;
    const ns = novaState.current;
    if (!ns) return;
    // Target FOV based on phase + coverage:
    //   engulfing/whitening: lerp toward FOV_ENGULF based on coverage
    //   everything else: revert to FOV_DEFAULT
    const cov = bhCoverageRef.current ?? 0;
    let targetFov = FOV_DEFAULT;
    if (ns.phase === 'engulfing') {
      // Use coverage so FOV opens up as the BH gets close.
      targetFov = FOV_DEFAULT + (FOV_ENGULF - FOV_DEFAULT) * Math.min(1, cov);
    } else if (ns.phase === 'swallowed' || ns.phase === 'emerging') {
      // v15-take2: hold widened FOV during pitch black + reveal
      // so the camera doesn't snap-zoom back at the wrong moment.
      targetFov = FOV_ENGULF;
    }
    // Exponential lerp toward target.
    const k = 1 - Math.exp(-FOV_LERP_RATE * delta);
    const newFov = cam.fov + (targetFov - cam.fov) * k;
    if (Math.abs(newFov - cam.fov) > 0.01) {
      cam.fov = newFov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/* \u2500\u2500 ADD-ON v2.14 \u2500\u2500 DOM background gradient that lerps with lightRef. */
function useBackgroundAnimator(
  bgRef: RefObject<HTMLDivElement | null>,
  lightRef: RefObject<number>,
) {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const bg = bgRef.current;
      if (bg) {
        const lv = lightRef.current ?? 0;
        const lerp = (a: number, b: number) => a + (b - a) * lv;
        const r1 = Math.round(lerp(5, 232));
        const g1 = Math.round(lerp(8, 238));
        const b1 = Math.round(lerp(22, 244));
        const r2 = Math.round(lerp(0, 210));
        const g2 = Math.round(lerp(0, 220));
        const b2 = Math.round(lerp(3, 232));
        bg.style.background = `radial-gradient(ellipse at 50% 60%, rgb(${r1},${g1},${b1}) 0%, rgb(${r2},${g2},${b2}) 70%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bgRef, lightRef]);
}

interface ProbeMenuProps {
  scrollState: RefObject<ScrollState>;
  bp: Breakpoint;
  onTriggerNova: () => void;
  onTriggerCollapse: () => void; // v11
  novaState: RefObject<SupernovaState>;
  // v17: light-mode wiring moved to LightModeContext (useLightMode()).
}

function ProbeMenu({
  scrollState,
  bp,
  onTriggerNova,
  onTriggerCollapse,
  novaState,
}: ProbeMenuProps) {
  const [vel, setVel] = useState<number>(0);
  const [novaPhase, setNovaPhase] = useState<SupernovaPhase>('idle');
  // v17-take2: use state-only hook (boolean + toggle callback).
  // ProbeMenu doesn't need the refs themselves — it just toggles and
  // reads the boolean for the icon swap.
  const { lightMode, toggleLightMode } = useLightModeState();
  const onToggleLightMode = toggleLightMode;
  // v20: SafeMode toggle for photosensitive users. Caps supernova
  // white flash, chromatic aberration, and kilonova glitch effects
  // below clinical seizure thresholds when active.
  const { safeMode, toggleSafeMode } = useSafeModeState();
  const onToggleSafeMode = toggleSafeMode;

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 100) {
        const ss = scrollState.current;
        setVel(ss?.velocity ?? 0);
        const ns = novaState.current;
        const cur = ns?.phase ?? 'idle';
        setNovaPhase((prev) => (prev === cur ? prev : cur));
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollState, novaState]);

  const isMobile = bp === 'mobile';

  const phaseLabel: Record<SupernovaPhase, string> = {
    idle: 'DETONATE NEAREST GIANT',
    redgiant: 'RED GIANT SWELLING…',
    charging: 'CHARGING…',
    detonating: 'DETONATING',
    blooming: 'SHOCKWAVE',
    aftermath: 'AFTERMATH',
    forming: 'REMNANT FORMING…',
    settled: 'COLLAPSE NEUTRON STAR',
    centering: 'CENTERING…',
    freezing: 'FIELD FREEZE',
    pulling: 'CONSUMING STARS…',
    coreCollapse: 'CORE COLLAPSE',
    bhCharging: 'BH IGNITION…',
    bhDetonating: 'BH DETONATION',
    bhBlooming: 'BH SHOCKWAVE',
    bhAftermath: 'AFTERMATH',
    bhForming: 'GARGANTUA FORMING…',
    bhConsuming: 'DEVOURING STARS…',
    engulfing: 'EVENT HORIZON',
    swallowed: 'INSIDE THE EVENT HORIZON',
    emerging: 'EMERGING',
    dimming: 'REBIRTH',
  };
  const phaseColor: Record<SupernovaPhase, string> = {
    idle: lightMode ? 'rgba(60, 90, 130, 0.85)' : 'rgba(140, 230, 255, 0.7)',
    redgiant: 'rgba(255, 130, 70, 0.95)',
    charging: 'rgba(255, 200, 120, 0.95)',
    detonating: 'rgba(255, 240, 220, 1.0)',
    blooming: 'rgba(255, 170, 110, 0.95)',
    aftermath: 'rgba(180, 200, 230, 0.7)',
    forming: lightMode ? 'rgba(80, 50, 140, 0.85)' : 'rgba(150, 200, 255, 0.85)',
    settled: lightMode ? 'rgba(120, 80, 160, 0.85)' : 'rgba(180, 140, 240, 0.85)',
    // v11: cinematic death cycle. Cool slate → amber pull → black hole
    // dim → white-out singularity → cool emerge → dim home.
    centering: 'rgba(180, 140, 240, 0.85)',
    freezing: 'rgba(120, 130, 160, 0.85)',
    pulling: 'rgba(220, 130, 80, 0.95)',
    coreCollapse: 'rgba(150, 80, 50, 0.95)',
    bhCharging: 'rgba(255, 200, 120, 0.95)',
    bhDetonating: 'rgba(255, 240, 220, 1.0)',
    bhBlooming: 'rgba(255, 170, 110, 0.95)',
    bhAftermath: 'rgba(180, 150, 200, 0.7)',
    bhForming: 'rgba(70, 60, 90, 0.95)',
    bhConsuming: 'rgba(40, 40, 60, 0.95)',
    engulfing: 'rgba(40, 40, 50, 0.95)',
    swallowed: 'rgba(0, 0, 0, 1.0)',
    emerging: 'rgba(180, 220, 255, 0.85)',
    dimming: lightMode ? 'rgba(70, 110, 150, 0.85)' : 'rgba(150, 200, 255, 0.85)',
  };
  // ── ADD-ON v3.12 ── novaActive includes forming — button stays
  // locked until the birth sequence finishes.
  // v11: button is now enabled BOTH in "idle" (triggers supernova)
  // AND in "settled" (triggers collapse). Locked during all
  // intermediate phases (charging, blooming, ..., consuming, etc.).
  const novaActive = novaPhase !== 'idle' && novaPhase !== 'settled';
  const novaButtonDisabled = novaActive;
  const onButtonClick = () => {
    if (novaPhase === 'idle') onTriggerNova();
    else if (novaPhase === 'settled') onTriggerCollapse();
  };

  // ── ADD-ON v2.16 ── HUD theme adapts to light mode via Tailwind classes.
  const panelBg = lightMode ? 'bg-white/55' : 'bg-black/55';
  const panelBorder = lightMode ? 'border-slate-500/15' : 'border-cyan-300/15';
  const cornerStroke = lightMode ? 'border-slate-600/70' : 'border-cyan-300/70';
  const titleColor = lightMode ? 'text-slate-700' : 'text-cyan-200/90';
  const labelColor = lightMode ? 'text-slate-700/70' : 'text-cyan-50/55';
  const valueColor = lightMode ? 'text-slate-800/90' : 'text-cyan-200/70';
  const textColor = lightMode ? 'text-slate-800/90' : 'text-cyan-50/90';
  const dimColor = lightMode ? 'text-slate-500/70' : 'text-cyan-200/30';
  const versionColor = lightMode ? 'text-slate-500/60' : 'text-cyan-300/40';
  const rowBorder = lightMode ? 'border-slate-400/20' : 'border-cyan-300/10';

  const rows: Array<[string, string]> = [
    [
      'TELEMETRY',
      novaActive
        ? 'ANOMALY DETECTED'
        : novaPhase === 'settled'
          ? 'REMNANT IDENTIFIED'
          : 'NOMINAL',
    ],
    ['NAVIGATION', 'DEEP FIELD'],
    ['VELOCITY', `${vel >= 0 ? '+' : ''}${vel.toFixed(1)} u/s`],
    ['BREAKPOINT', bp.toUpperCase()],
    ['MODE', lightMode ? 'DAY' : 'NIGHT'],
  ];

  return (
    <div
      className={[
        'fixed top-6 z-10 select-none',
        isMobile ? 'right-3 left-3' : 'right-6 w-72',
        textColor,
      ].join(' ')}
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace' }}
    >
      <div
        className={['relative max-w-sm border px-5 py-4', panelBg, panelBorder].join(' ')}
        style={{
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        }}
      >
        <span
          className={`absolute -top-px -left-px h-3 w-3 border-t border-l ${cornerStroke}`}
        />
        <span
          className={`absolute -top-px -right-px h-3 w-3 border-t border-r ${cornerStroke}`}
        />
        <span
          className={`absolute -bottom-px -left-px h-3 w-3 border-b border-l ${cornerStroke}`}
        />
        <span
          className={`absolute -right-px -bottom-px h-3 w-3 border-r border-b ${cornerStroke}`}
        />

        <div className='mb-3 flex items-baseline justify-between'>
          <h2
            className={`m-0 text-[11px] tracking-[0.35em] ${titleColor}`}
            style={{ fontFamily: '"Major Mono Display", ui-monospace, monospace' }}
          >
            probe ctrl
          </h2>
          <span className={`text-[9px] tracking-[0.18em] ${versionColor}`}>v9</span>
        </div>

        <ul className='m-0 list-none p-0 text-[10.5px] tracking-[0.12em]'>
          {rows.map(([label, val]) => (
            <li
              key={label}
              className={`flex justify-between border-b py-1.5 ${rowBorder}`}
            >
              <span className={labelColor}>{label}</span>
              <span className={`${valueColor} tabular-nums`}>{val}</span>
            </li>
          ))}
        </ul>

        <button
          type='button'
          onClick={onButtonClick}
          disabled={novaButtonDisabled}
          className={[
            'mt-4 w-full border px-3 py-2 text-[10px] tracking-[0.22em]',
            'transition-colors duration-200',
            lightMode
              ? 'border-slate-500/30 bg-white/40'
              : 'border-cyan-300/30 bg-black/40',
            novaButtonDisabled
              ? 'cursor-not-allowed opacity-90'
              : lightMode
                ? 'cursor-pointer hover:border-slate-600/60 hover:bg-slate-300/30'
                : 'cursor-pointer hover:border-cyan-300/60 hover:bg-cyan-300/10',
          ].join(' ')}
          style={{
            color: phaseColor[novaPhase],
            // v11: settled is clickable now — still show themed border.
            borderColor: novaPhase !== 'idle' ? phaseColor[novaPhase] : undefined,
            fontFamily: 'inherit',
          }}
        >
          {phaseLabel[novaPhase]}
        </button>

        {/* ── ADD-ON v2.17 ── Light-mode toggle button. */}
        <button
          type='button'
          onClick={onToggleLightMode}
          className={[
            'mt-2 w-full border px-3 py-2 text-[10px] tracking-[0.22em]',
            'cursor-pointer transition-colors duration-200',
            lightMode
              ? 'border-slate-500/30 bg-white/40 text-slate-700 hover:border-slate-600/60 hover:bg-slate-300/30'
              : 'border-cyan-300/30 bg-black/40 text-cyan-200/80 hover:border-cyan-300/60 hover:bg-cyan-300/10',
          ].join(' ')}
          style={{ fontFamily: 'inherit' }}
        >
          {lightMode ? '◐  SWITCH TO NIGHT' : '◑  SWITCH TO DAY'}
        </button>

        {/* v20: SafeMode toggle (photosensitive-safe effects). When
            active, the supernova white flash is low-pass-filtered
            and capped, chromatic aberration becomes a gentle constant
            warp instead of rapid pulses, and the kilonova glitch is
            replaced with a slow radial cosmic ripple (no high-frequency
            luminance flicker, no RGB-channel separation). The toggle
            defaults to ON when the OS reports prefers-reduced-motion. */}
        <button
          type='button'
          onClick={onToggleSafeMode}
          aria-pressed={safeMode}
          title='Reduce flashing & high-contrast effects for photosensitive viewers'
          className={[
            'mt-2 w-full border px-3 py-2 text-[10px] tracking-[0.22em]',
            'cursor-pointer transition-colors duration-200',
            safeMode
              ? lightMode
                ? 'border-amber-700/40 bg-amber-100/60 text-amber-900 hover:border-amber-700/70 hover:bg-amber-200/60'
                : 'border-amber-300/40 bg-amber-400/15 text-amber-200 hover:border-amber-300/70 hover:bg-amber-400/25'
              : lightMode
                ? 'border-slate-500/30 bg-white/40 text-slate-700 hover:border-slate-600/60 hover:bg-slate-300/30'
                : 'border-cyan-300/30 bg-black/40 text-cyan-200/80 hover:border-cyan-300/60 hover:bg-cyan-300/10',
          ].join(' ')}
          style={{ fontFamily: 'inherit' }}
        >
          {safeMode ? '⚠  PHOTOSENSITIVE: ON' : '⚠  PHOTOSENSITIVE: OFF'}
        </button>

        <p className={`mt-3 mb-0 text-[9px] leading-snug tracking-[0.12em] ${dimColor}`}>
          {isMobile ? 'swipe to thrust.' : 'scroll to thrust.'} stars drift continuously.
        </p>
      </div>
    </div>
  );
}

/* v17: AppContent is the un-wrapped Canvas root. It REQUIRES a
 * LightModeProvider somewhere above it in the tree (call useLightMode
 * to access the refs). Use this directly if you want to place a custom
 * light-mode toggle component outside the Canvas as a sibling — wrap
 * App and the toggle with your own LightModeProvider.
 *
 * For simple usage, use the default export `App` which self-wraps. */
export function AppContent() {
  const bp = useBreakpoint();
  const reducedMotion = usePrefersReducedMotion();
  const visible = usePageVisibility();
  const scrollState = useRef<ScrollState>({ impulse: 0, velocity: 0 });

  const novaState = useRef<SupernovaState>({
    phase: 'idle',
    phaseT: 0,
    starIndex: -1,
    starSeed: 0,
    detonationXYZ: [0, 0, 0],
    orbitTilt: 0,
    orbitRotation: 0,
    orbitZOffset: 18,
    revolvePhase: 0,
    formationEndAngle: 0,
    omegaInitial: NEUTRON_REVOLVE_SPEED,
    vFormChord: [0, 0, 0],
  });
  // v17-take2: AppContent reads the REFS context only (never
  // re-renders on mode flips). The boolean state lives in a separate
  // context so toggle UI re-renders correctly without forcing the
  // entire Canvas tree to re-render.
  const { lightRef, lightTargetRef } = useLightModeRefs();
  // v20: read SafeMode ref so we can pass it to in-canvas drivers
  // and shaders that need to dampen their photosensitive effects.
  const { safeModeRef } = useSafeModeRefs();
  const flashRef = useRef<number>(0);
  const chromaRef = useRef<number>(0);
  const positionsRef = useRef<Float32Array | null>(null);
  const chromaEffectRef = useRef<ChromaticAberrationEffect>(null);

  // v11: death-cycle plumbing.
  //   novaPosRef        - NS world position, written by NeutronStar
  //                       each frame, read by StarField shader.
  //   pullStrengthRef   - 0..1 gravitational-pull strength uniform.
  //   collapseScaleRef  - 1..0 scale multiplier on the NS group
  //                       (drives the visible shrink during collapse).
  //   overlayOpacityRef - 0..1 black-overlay opacity, polled by the
  //                       overlay div's rAF loop.
  const novaPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const pullStrengthRef = useRef<number>(0);
  const collapseScaleRef = useRef<number>(1);
  const overlayOpacityRef = useRef<number>(0);
  // v15-take4: BH-explosion starfield glitch. Driven by tickSupernova
  // during the bh* phases; consumed by StarField each frame to set
  // the uExplosionGlitch uniform on the starfield material.
  const explosionGlitchRef = useRef<number>(0);
  // v11: cinematic death cycle plumbing.
  //   centerProgressRef - 0..1 NS-to-center lerp progress (centering)
  //   whiteFlashRef     - 0..1 extra screen-white intensity (engulfing/whitening)
  //   globalAlphaRef    - 0..1 starfield global alpha (despawn/respawn)
  //   blackHoleProgRef  - 0..1 black-hole formation progress (blackholeForm)
  //   blackHoleEngulfRef- 0..1 black-hole growth toward camera (engulfing)
  const centerProgressRef = useRef<number>(0);
  const whiteFlashRef = useRef<number>(0);
  const globalAlphaRef = useRef<number>(1);
  const blackHoleProgRef = useRef<number>(0);
  const blackHoleEngulfRef = useRef<number>(0);
  // v12: written by NeutronStar each frame; true if NS is in
  // camera frustum. Read by tickSupernova's centering branch.
  const nsOnScreenRef = useRef<boolean>(false);
  // v12: written by BlackHole each frame; true during BH-active
  // phases. Read by StarField to enable depthTest so the opaque
  // BH body occludes stars properly.
  const bhActiveRef = useRef<boolean>(false);
  // v12 take 2: written by tickSupernova during coreExplosion.
  // 0..1 expansion progress for the Supernova3D shell shader.
  const explosionProgressRef = useRef<number>(0);
  // v13: BH world position (separate from NS pos so lensing tracks
  // the BH wherever it is, even when the BH starts approaching the
  // camera during engulfing).
  const bhPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  // v13: BH apparent screen-space coverage (0 = pinhole, 1 = covers
  // viewport diagonal). Drives lensing radius/strength.
  const bhCoverageRef = useRef<number>(0);
  // v19.1: BH current world-space body radius. Written by BlackHole
  // each frame; read by BlackHoleHalo to scale itself to ~3x body
  // radius (a stable corona that maintains the perceived "core
  // perimeter" through the bhForming → bhConsuming transition).
  const bhSizeRef = useRef<number>(0);
  // v13: ref to the LensingEffect instance for the postprocessing
  // pass. The driver component reads it each frame.
  const lensingEffectRef = useRef<LensingEffect | null>(null);
  const chromaInitialOffset = useMemo(() => new THREE.Vector2(0, 0), []);

  // ── ADD-ON v2.18 ── Light mode is owned by <ProbeMenu> (its own
  // useState). App stays unaware of the boolean, so toggling does NOT
  // re-render this component or its <Canvas> subtree. The shared
  // lightTargetRef is the only handoff between menu and animator.

  // v11: trigger the cinematic death cycle. Only valid from
  // "settled". Begins with "centering" (NS glides to screen center)
  // and runs through the 9-phase ladder defined in tickSupernova.
  const onTriggerCollapse = useCallback(() => {
    if (novaState.current.phase !== 'settled') return;
    novaState.current.phase = 'centering';
    novaState.current.phaseT = 0;
    novaState.current.respawnedThisCycle = false;
  }, []);

  const onTriggerNova = useCallback(() => {
    if (novaState.current.phase !== 'idle') return;
    const positions = positionsRef.current;
    if (!positions) return;

    const candidates: number[] = [];
    const starCount = positions.length / 16;
    for (let i = 0; i < starCount; i++) {
      const z = positions[i * 16 + 14];
      if (z < -SUPERNOVA_MIN_DEPTH && z > -550) {
        candidates.push(i);
      }
    }
    if (candidates.length === 0) return;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const o = chosen * 16;

    novaState.current.phase = 'redgiant'; // ── ADD-ON v9.14 ── start with red giant phase
    novaState.current.phaseT = 0;
    novaState.current.starIndex = chosen;
    novaState.current.starSeed = Math.random();
    novaState.current.detonationXYZ = [
      positions[o + 12],
      positions[o + 13],
      positions[o + 14],
    ];
    // ── ADD-ON v6.9 ── Build the elliptical orbit parameters.
    //
    // Three random values per trigger:
    //   orbitTilt     — angle of major axis from world -Z, range
    //                   [15°, 25°]. Small enough to keep the orbit
    //                   strongly into camera depth; large enough to
    //                   give a 3D "diving" feel rather than purely
    //                   side-to-side.
    //   orbitRotation — rotation around world Z, full [0, 2π]. This is
    //                   the diagonal feel — the orbit's "horizontal"
    //                   direction points at any random angle.
    //   orbitZOffset  — computed from orbitTilt so behind-camera time
    //                   is exactly ~10% per revolution:
    //                     zOffset = 0.951 · R_major · cos(orbitTilt)
    //
    // revolvePhase is biased so the assembly starts at a position deep
    // in front of the camera (most-negative z), so the formation handoff
    // doesn't immediately slide the neutron star toward a hidden region.
    // For our parameterization, the deepest-in-front angle is θ = π/2
    // (where sin(θ) is +1 and our z-formula gives the most negative z).
    {
      const tilt = (Math.PI / 180) * (15 + Math.random() * 10);
      const rotation = Math.random() * Math.PI * 2;
      const zOffset = 0.951 * NEUTRON_ORBIT_R_MAJOR * Math.cos(tilt);

      novaState.current.orbitTilt = tilt;
      novaState.current.orbitRotation = rotation;
      novaState.current.orbitZOffset = zOffset;

      // Start angle near θ=π/2 (deepest-in-front) ± 60° so the assembly
      // begins its orbit from a clearly visible deep-front position.
      const deepestFrontAngle = Math.PI / 2;
      novaState.current.revolvePhase =
        deepestFrontAngle + (Math.random() - 0.5) * (Math.PI / 1.5);
    }

    // Speed-handoff state initialized at the first settled frame, not
    // here. Set placeholders.
    novaState.current.formationEndAngle = 0;
    novaState.current.omegaInitial = NEUTRON_REVOLVE_SPEED;
    novaState.current.vFormChord = [0, 0, 0];
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const ss = scrollState.current;
      if (ss) ss.impulse += e.deltaY * SCROLL_CONFIG.wheelGain;
    };

    let lastTouchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (lastTouchY == null) return;
      const y = e.touches[0].clientY;
      const dy = lastTouchY - y;
      const ss = scrollState.current;
      if (ss) ss.impulse += dy * SCROLL_CONFIG.touchGain;
      lastTouchY = y;
    };
    const onTouchEnd = () => {
      lastTouchY = null;
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyMargin: body.style.margin,
      bodyHeight: body.style.height,
      bodyBackground: body.style.background,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.margin = '0';
    body.style.height = '100vh';
    body.style.background = '#000';
    body.style.overscrollBehavior = 'none';

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400&family=Major+Mono+Display&display=swap';
    document.head.appendChild(link);

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.margin = prev.bodyMargin;
      body.style.height = prev.bodyHeight;
      body.style.background = prev.bodyBackground;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);

  const dprMin = resolveBp(FIELD_CONFIG.dprMin, bp);
  const dprMax = resolveBp(FIELD_CONFIG.dprMax, bp);

  const bgRef = useRef<HTMLDivElement>(null);
  useBackgroundAnimator(bgRef, lightRef);

  return (
    <>
      <div ref={bgRef} className='fixed inset-0 z-0 h-screen w-screen'>
        <Canvas
          camera={{ position: [0, 0, 0], fov: 65, near: 0.1, far: 2000 }}
          dpr={dprMax}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
          }}
          className='block h-full w-full'
          frameloop='always'
        >
          <AdaptiveDPR min={dprMin} max={dprMax} />
          <LightModeAnimator lightRef={lightRef} targetRef={lightTargetRef} />
          {/* v13: widens FOV during engulfing for "camera being pulled" feel. */}
          <CameraFOVDriver bhCoverageRef={bhCoverageRef} novaState={novaState} />
          <StarField
            scrollState={scrollState}
            bp={bp}
            reducedMotion={reducedMotion}
            visible={visible}
            novaState={novaState}
            flashRef={flashRef}
            chromaRef={chromaRef}
            positionsRef={positionsRef}
            lightRef={lightRef}
            novaPosRef={novaPosRef}
            pullStrengthRef={pullStrengthRef}
            collapseScaleRef={collapseScaleRef}
            overlayOpacityRef={overlayOpacityRef}
            centerProgressRef={centerProgressRef}
            lightTargetRef={lightTargetRef}
            whiteFlashRef={whiteFlashRef}
            globalAlphaRef={globalAlphaRef}
            nsOnScreenRef={nsOnScreenRef}
            bhActiveRef={bhActiveRef}
            explosionProgressRef={explosionProgressRef}
            explosionGlitchRef={explosionGlitchRef}
          />
          <NeutronStar
            novaState={novaState}
            lightRef={lightRef}
            visible={visible}
            novaPosRef={novaPosRef}
            collapseScaleRef={collapseScaleRef}
            centerProgressRef={centerProgressRef}
            nsOnScreenRef={nsOnScreenRef}
          />
          {/* v12 take 2: dramatic supernova-style shell during
              coreExplosion. Replaces the v12-take-1 white flash. */}
          <Supernova3D
            novaState={novaState}
            visible={visible}
            novaPosRef={novaPosRef}
            explosionProgressRef={explosionProgressRef}
          />
          {/* v15-take6 (Issue 3): physics-based NS→BH ejecta sequence.
              Renders a kilonova-style explosion across the 5-beat
              bh-arc with realistic blue→red color evolution and
              jet-axis emphasis during bhForming. */}
          <KilonovaEjecta
            novaState={novaState}
            visible={visible}
            novaPosRef={novaPosRef}
          />
          {/* v11: black hole — rendered separately from NeutronStar
              because it has its own lifecycle (born during
              blackholeForm, grows during engulfing, gone after). */}
          <BlackHole
            novaState={novaState}
            visible={visible}
            novaPosRef={novaPosRef}
            blackHoleProgRef={blackHoleProgRef}
            blackHoleEngulfRef={blackHoleEngulfRef}
            bhActiveRef={bhActiveRef}
            bhPositionRef={bhPositionRef}
            bhCoverageRef={bhCoverageRef}
            bhSizeRef={bhSizeRef}
          />
          {/* v19.2: BlackHoleHalo removed — the ejecta now provides
              the stable "core perimeter" by expanding past the
              camera (scale=200 from bhAftermath onward) so the user
              never sees an expansion/contraction edge. The persistent
              red tint while inside takes over the role the separate
              halo mesh briefly held. */}
          <FlashOverlay
            flashRef={flashRef}
            lightRef={lightRef}
            safeModeRef={safeModeRef}
          />

          <EffectComposer multisampling={0}>
            {/* v13: spacetime warp \u2014 must come BEFORE chromatic so the
                aberration is applied to the already-warped scene
                (gives a more intense "fall through the lens" feel). */}
            <lensingEffect ref={lensingEffectRef} />
            <LensingDriver
              effectRef={lensingEffectRef}
              bhPositionRef={bhPositionRef}
              bhCoverageRef={bhCoverageRef}
              bhActiveRef={bhActiveRef}
              whiteFlashRef={whiteFlashRef}
              explosionGlitchRef={explosionGlitchRef}
              lightRef={lightRef}
              safeModeRef={safeModeRef}
            />
            <ChromaticAberration
              blendFunction={BlendFunction.NORMAL}
              offset={chromaInitialOffset}
              radialModulation={false}
              modulationOffset={0}
              ref={chromaEffectRef}
            />
            <ChromaticAberrationDriver
              effectRef={chromaEffectRef}
              chromaRef={chromaRef}
              safeModeRef={safeModeRef}
            />
          </EffectComposer>
        </Canvas>
      </div>

      <ProbeMenu
        scrollState={scrollState}
        bp={bp}
        onTriggerNova={onTriggerNova}
        onTriggerCollapse={onTriggerCollapse}
        novaState={novaState}
      />

      {/* v11: black-hole engulf overlay (final dim-to-black). */}
      <DeathOverlay overlayOpacityRef={overlayOpacityRef} />
      {/* v11: white flash overlay (singularity passage). Polls
          whiteFlashRef on rAF; CSS variable drives opacity. */}
      <WhiteFlashOverlay whiteFlashRef={whiteFlashRef} safeModeRef={safeModeRef} />

      {bp !== 'mobile' && <ScrollHint />}
    </>
  );
}

/* v12 take 2: Supernova3D + BlackHole genesis-style components.
 *
 * Built on the architecture from the "Blackhole collapse and spacetime
 * warping scene" chat: a noise-perturbed expanding shell during the
 * coreExplosion phase, followed by a multi-component black hole made
 * of: solid event-horizon sphere, tilted accretion disk with Keplerian
 * rotation + Doppler beaming, and a lensing-style halo billboard.
 */

// Simplex noise (2D / 3D) for use in shell + disk shaders. Standard
// Ashima/IQ-style implementation, GPU-friendly, no textures.
const SIMPLEX_NOISE_GLSL = /* glsl */ `
  vec3 mod289_3(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289_4(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289_4(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289_3(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

// ============================================================
// v13: Spacetime-warping lensing effect (postprocessing pass).
//
// ============================================================
// v13 (genesis-port): BlackHolePostEffect.
//
// Single post-pass that does THREE things in one shader, mirroring
// the reference BlackHoleGenesis.tsx PostProcessor:
//
//   1. Gravitational lensing \u2014 displaces the input UV toward the BH
//      center with a 1/r^2 deflection profile, softened near r=0
//      by (1 - exp(-r * 8)).
//   2. Photon ring overlay \u2014 a Gaussian band at radius 0.92 * uRadius
//      painted on top of the lensed sample. Color (1.0, 0.65, 0.3),
//      intensity (1.6 + photonRingBoost * 4) * uActive.
//   3. Event-horizon mask \u2014 paints clean black inside the body
//      circle (radius 0.74 * uRadius), masking any edge artifacts
//      from the 3D sphere\'s rasterization + lensing.
//
// Plus: vignette + global white flash (for the "crossing the horizon"
// transition).
//
// Uniforms (all vec/float so they are easy to drive each frame):
//   uCenter           - vec2  BH screen-space UV [0..1]
//   uRadius           - float BH apparent screen-space radius
//                        (in NDC-y units, 0..~1.4)
//   uActive           - float 0..1 master fade for the BH overlay
//                        (so we can fade in/out as the BH appears)
//   uAspect           - float screen aspect (width/height)
//   uPhotonRingBoost  - float 0..1 extra brightness for the ring
//   uPostFlash        - float 0..1 white-screen flash
// ============================================================
const lensingFragmentShader = /* glsl */ `
  uniform vec2  uCenter;
  uniform float uRadius;
  uniform float uActive;
  uniform float uAspect;
  uniform float uPhotonRingBoost;
  uniform float uPostFlash;
  // v15-take6: scene-wide glitch. RGB-channel separation +
  // horizontal-slice band displacement, applied to the entire
  // rendered scene. Mimics the digital-corruption look from the
  // user's reference image.
  uniform float uGlitch;
  uniform float uGlitchTime;
  // v18-take3: light-mode awareness. When uLight is high (day mode),
  // the lensing deflection + halo darkening produce a visible "black
  // halo" artifact around the BH because lensing samples from far
  // outside the body silhouette and pulls those samples INTO the
  // black horizon-mask region, stretching black across the bright
  // cream sky. We reduce the lensing strength + halo darkening in
  // light mode to preserve the bright sky around the BH.
  uniform float uLight;
  // v20: SafeMode flag (0.0 normal, 1.0 photosensitive-safe). Routes
  // the glitch shader through a slow radial cosmic ripple instead of
  // high-frequency horizontal-slice + RGB-split displacement.
  uniform float uSafeMode;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // \u2500\u2500 1. lensing deflection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Aspect-correct so the deflection field is circular on screen.
    vec2 sampleUv = uv;
    if (uActive > 0.001 && uRadius > 0.0001) {
      vec2 d = uv - uCenter;
      d.x *= uAspect;
      float r = max(length(d), 0.0001);
      // 1/r^2 deflection from the genesis post-pass.
      // v18-take3: scale defl down in light mode so we don't pull
      // wide swaths of bright sky into the black horizon region
      // (which produces the visible "BH texture cut out" halo).
      float lensStrength = mix(1.0, 0.25, uLight);
      float defl = (uRadius * uRadius * 1.2 * lensStrength) / (r * r) * uActive;
      // Soften near r=0 so we don\'t get a singular pinch right at
      // the body \u2014 (1 - exp(-r*8)) ramps from 0 at r=0 to ~1 by r=0.5.
      defl *= (1.0 - exp(-r * 8.0));
      // Cap displacement so we never sample wildly out of bounds.
      defl = min(defl, r * 0.92);
      vec2 dirN = d / r;
      dirN.x /= uAspect;
      sampleUv = uv - dirN * defl;
    }

    // v15-take6: GLITCH — horizontal slice + RGB channel split.
    //
    // 1. Horizontal slice: quantize the screen into ~24 horizontal
    //    bands; each band gets a per-band hash from sin(bandIdx). About
    //    30% of bands "slip" left/right by up to 0.18 in UV space.
    //    Time advances the band pattern so the corruption shimmers.
    //
    // 2. RGB split: each channel sampled at a slightly offset UV
    //    (per-band offsets + a small global x-shift). This produces
    //    the iconic red/blue/cyan/yellow fringing from the ref image.
    //
    // Both effects scale with uGlitch (0..1). Applied to the lensed
    // sampleUv so they compose with the BH lensing properly.
    //
    // v20: when uSafeMode is on, the slice+RGB-split path is bypassed
    // (high-frequency luminance + saturated-color fringing is a known
    // photosensitive seizure trigger). Replaced with a SLOW RADIAL
    // COSMIC RIPPLE: a smooth sinusoidal wave emanating from uCenter
    // outward at ~0.19 Hz (well below the 3 Hz clinical threshold),
    // with the SAME offset applied to all three channels so no
    // chromatic separation occurs. Still reads as "spacetime
    // warping" without the seizure risk.
    vec2 baseUv = sampleUv;
    float glitchAmt = uGlitch;
    vec2 rUv = baseUv, gUv = baseUv, bUv = baseUv;

    if (glitchAmt > 0.0001) {
      if (uSafeMode < 0.5) {
        // Normal mode: horizontal slice + RGB split (existing logic).
        float bandIdx = floor(baseUv.y * 24.0 + uGlitchTime * 8.0);
        float h1 = fract(sin(bandIdx * 12.9898) * 43758.5453);
        float h2 = fract(sin(bandIdx * 78.233 + 1.7) * 43758.5453);
        float slip = step(0.7, h1);
        float bandOffset = (h2 * 2.0 - 1.0) * glitchAmt * 0.06 * slip;
        rUv.x += bandOffset;
        gUv.x += bandOffset;
        bUv.x += bandOffset;
        float chromaShift = glitchAmt * 0.012 * (0.5 + h1);
        rUv.x -= chromaShift;
        bUv.x += chromaShift;
        float vSlip = step(0.92, h2);
        rUv.y += (h1 - 0.5) * glitchAmt * 0.02 * vSlip;
      } else {
        // Safe mode: slow radial cosmic ripple. Aspect-corrected
        // radial distance from uCenter, then a sub-1Hz sinusoidal
        // wave that travels outward. SAME offset for R/G/B (no
        // chromatic separation = no high-frequency color flicker).
        vec2 d = baseUv - uCenter;
        d.x *= uAspect;
        float r = length(d);
        // Radial frequency 8.0 cycles per unit and temporal 1.2 rad/s
        // (~0.19 Hz). The wave reads as a slowly expanding gravitational
        // ring at human-perceivable speed.
        float wave = sin(r * 8.0 - uGlitchTime * 1.2);
        vec2 dirN = (r > 0.0001) ? d / r : vec2(0.0);
        // Aspect-undo for the displacement so x/y stay in UV space.
        dirN.x /= max(uAspect, 0.0001);
        // Amplitude: glitchAmt * 0.004 (already capped at 0.35 by the
        // driver, so peak displacement is ~0.0014 UV \u2014 a very gentle
        // warp). All three channels get the SAME displacement.
        vec2 disp = dirN * wave * glitchAmt * 0.004;
        rUv += disp;
        gUv += disp;
        bUv += disp;
      }
    }

    // Sample lensed scene (clamp so we never read beyond edges).
    // v17 (Issue 2): also sample ALPHA from each displaced UV. The
    // original code took alpha from inputColor.a (the pixel at base
    // UV without displacement), which meant the glitch was invisible
    // in light mode — the FBO has alpha=0 everywhere except where
    // stars rendered, so any displaced color sample got masked back
    // to transparent and the DOM background showed through unchanged.
    //
    // By sampling alpha from each channel's displaced UV and taking
    // the max, the glitch produces visible displaced content even
    // when the base UV has nothing. Result: slipped bands of stars
    // retain their visibility in their displaced position; RGB
    // chromatic fringes extend beyond the original star silhouette.
    vec4 sampleR = texture2D(inputBuffer, clamp(rUv, vec2(0.0), vec2(1.0)));
    vec4 sampleG = texture2D(inputBuffer, clamp(gUv, vec2(0.0), vec2(1.0)));
    vec4 sampleB = texture2D(inputBuffer, clamp(bUv, vec2(0.0), vec2(1.0)));
    vec3 col = vec3(sampleR.r, sampleG.g, sampleB.b);
    // Glitch-aware alpha: when uGlitch is active, take max of the
    // three displaced alphas so displaced content stays visible.
    // When uGlitch is 0, the displaced UVs all equal the base UV so
    // sampleG.a is exactly inputColor.a — no behavioral change for
    // the non-glitch case.
    float glitchAlpha = max(max(sampleR.a, sampleG.a), sampleB.a);

    // \u2500\u2500 2. photon ring + 3. horizon mask \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if (uActive > 0.001) {
      vec2 d2 = uv - uCenter;
      d2.x *= uAspect;
      float r2 = length(d2);

      // v15.C: horizon mask covers FULL body silhouette (was 0.74).
      // Painting black at the entire body apparent radius eliminates
      // disk-pixel leaks around the body silhouette. Photon ring
      // moves outward proportionally so it sits just outside.
      // v15-take4 (Issue 1): seal the BH region against background
      // star leaks. Three-zone radial structure:
      //   r < 1.05*uRadius  : pure black (event horizon)
      //   1.05..1.20        : photon ring (additive)
      //   1.20..2.00        : darkening halo (multiplicative)
      // The halo smoothly attenuates background light around the BH
      // so no stars peek through gaps in the disk territory.
      float horizon = uRadius * 1.05;
      float photon  = uRadius * 1.13;
      float ringW   = uRadius * 0.06;

      // v19.2 take3: widened photon ring + boosted intensity so
      // the bright cream halo around the body silhouette is wider
      // and more reliably visible. The user observed that the
      // bright halo "detached" from the body during bhConsuming
      // (a thin black gap appeared between body and cream halo).
      // The cause: the original Gaussian ring (width 0.06*uRadius)
      // is narrow, so its bright zone sits near r2=1.13*uRadius
      // and quickly tapers. Outside the ring peak, the halo region
      // is just dim cream bg — reading as "darker than the body
      // silhouette boundary" against the cream sky.
      //
      // Widening to 0.18*uRadius (3x) spreads the bright cream
      // contribution over a much broader band, eliminating the
      // perceived dark gap by ensuring the body-adjacent zone is
      // always bright. Intensity boost (1.6 → 2.5) keeps the ring
      // visually prominent even when wider.
      float ringWideW = uRadius * 0.18;
      float ring = exp(-pow((r2 - photon) / ringWideW, 2.0));
      // v19.4: use fadeIn (smoothstep over uActive) instead of
      // raw uActive so ring/horizon are at FULL strength once the
      // BH is properly formed. uActive at steady state is ~0.42
      // which made these features dim; the fade-in coefficient
      // hits 1.0 once uActive > 0.2.
      float fadeInCol = smoothstep(0.0, 0.2, uActive);
      col += vec3(1.0, 0.65, 0.3) * ring * (2.5 + uPhotonRingBoost * 4.0) * fadeInCol;

      // Event horizon mask \u2014 paints clean black inside the body
      // circle so any lensing-edge artifacts get covered.
      // v15.C: harder-edged horizon mask. Keep transition tight
      // (0.02 instead of 0.04) so the silhouette is crisp and no
      // bright disk pixels bleed into the body region.
      float horizonMask = 1.0 - smoothstep(horizon - uRadius * 0.02, horizon, r2);
      col = mix(col, vec3(0.0), horizonMask * fadeInCol);

      // Subtle radial vignette around the BH \u2014 darkens the field
      // outside the body so the ring/disk pop.
      // v15-take4: darkening halo around the BH. Outside the photon
      // ring, gradually attenuate background light from full down to
      // ~5% at the photon ring outer edge. This eliminates the
      // "stars peeking through" gaps: anything in the BH-influence
      // region (out to 2x body radius) gets dimmed multiplicatively,
      // simulating lensed light being deflected away by gravity.
      float haloT = smoothstep(uRadius * 2.0, uRadius * 1.18, r2);
      // v15-take5: halo floor raised to 0.4 (was 0.05) so stars
      // pulling into the BH remain visible during bhConsuming.
      // v18-take3: in light mode, lift the floor to 0.85 so the
      // bright sky stays bright around the BH. The body silhouette
      // is still clean black via the horizon mask; the halo here
      // is only a subtle ambient darkening cue.
      // v19.4: stronger halo darkening in light mode (0.6 floor,
      // was 0.85). The user observed that in light mode the BH had
      // no surrounding darkening — the body silhouette was the
      // only dark feature, looking isolated against the bright bg.
      // 0.6 means cream bg gets multiplied by 0.6 in the halo zone,
      // producing a visible dark gradient around the body (a soft
      // gravitational influence cue) without going to full black.
      float haloFloor = mix(0.4, 0.6, uLight);
      // Use fadeIn so halo darkening is at full strength once the
      // BH is properly formed (uActive > 0.2).
      float fadeInHalo = smoothstep(0.0, 0.2, uActive);
      col *= mix(1.0, haloFloor, haloT * fadeInHalo);

      float vig = 1.0 - exp(-r2 * 1.2);
      col *= mix(1.0, vig * 1.05, uActive * 0.35);
    }

    // ── global vignette ───────────────────────────────────────
    vec2 vc = uv - 0.5;
    vc.x *= uAspect;
    float gvig = 1.0 - smoothstep(0.55, 1.1, length(vc));
    col *= mix(1.0, gvig, 0.45);

    // v21 ── atmospheric grading for light mode ───────────────
    //
    // Previous light-mode behavior was a per-material palette
    // swap (the star/disk/BH shaders each had a uLight branch
    // producing dark-on-cream variants). That works but reads
    // as "the same scene, color-flipped" \u2014 not as a coherent
    // daytime atmosphere. This block adds three coordinated
    // grades AFTER all per-material rendering, so light mode
    // gets a unified atmospheric feel without disturbing the
    // dark-mode pipeline (the entire block is mathematically a
    // no-op when uLight = 0).
    //
    // 1. EXPOSURE: light mode compresses dynamic range so bright
    //    additive accumulations (disk highlights, photon ring
    //    bloom) roll off softly into the cream sky instead of
    //    blowing out to pure white.
    //
    // 2. ACES TONE-MAP: applies a filmic shoulder to the bright
    //    end. Mixed in proportional to uLight so dark mode keeps
    //    its high-contrast star-on-black punch unchanged.
    //
    // 3. ATMOSPHERIC TINT: a subtle vertical gradient that warms
    //    the lower part of the viewport (low-angle scattering)
    //    and cools the upper (zenith). Bright pixels pick up a
    //    warm cream tint; dark pixels pick up a cool blue-grey
    //    cast (silhouettes against bright sky have a touch of
    //    bluish desaturation in real photography). Applied with
    //    soft amplitude so it reads as atmosphere, not a colour
    //    filter on top of the scene.
    if (uLight > 0.001) {
      // 1. Exposure compression.
      float exposure = mix(1.0, 0.72, uLight);
      vec3 graded = col * exposure;

      // 2. ACES filmic tone-map (Narkowicz 2015 approximation).
      vec3 aces;
      {
        vec3 x = graded;
        aces = clamp(
          (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
          0.0, 1.0
        );
      }
      graded = mix(graded, aces, uLight);

      // 3. Atmospheric tint. Vertical gradient: cooler at top
      //    (zenith ~ blue-grey), warmer at bottom (horizon-ish
      //    cream-amber). Plus a luminance-aware tint so bright
      //    pixels lean cream, dark pixels lean cool blue.
      float vy = uv.y; // 0 = bottom, 1 = top
      vec3 zenithTint  = vec3(0.78, 0.86, 0.98); // cool blue-grey
      vec3 horizonTint = vec3(1.05, 0.98, 0.88); // warm cream
      vec3 skyTint = mix(horizonTint, zenithTint, smoothstep(0.0, 1.0, vy));

      // Luminance of the graded pixel \u2014 standard Rec. 709 weights.
      float lum = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      // Soft bias: very-dark pixels (stars) get cool tint, very-
      // bright pixels (disk/ring/flash) get warm tint, mid-tones
      // get the vertical sky gradient.
      vec3 darkTint  = vec3(0.85, 0.90, 1.00); // cool-cyan-ish
      vec3 brightTint = vec3(1.04, 0.99, 0.92); // warm cream
      float darkW   = 1.0 - smoothstep(0.0, 0.15, lum);
      float brightW = smoothstep(0.7, 1.0, lum);
      vec3 lumTint = mix(skyTint, darkTint, darkW);
      lumTint = mix(lumTint, brightTint, brightW);

      // Apply tint. Amplitude mixed in by uLight so dark mode is
      // untouched; in full light mode the tint is 25% applied
      // (subtle enough to read as atmosphere, not a hue shift).
      vec3 tinted = graded * lumTint;
      graded = mix(graded, tinted, uLight * 0.25);

      col = graded;
    }

    // ── white flash ────────────────────────────────────────────
    col = mix(col, vec3(1.0), uPostFlash);

    // v17 (Issue 2): use glitch-aware alpha so the displaced/sliced
    // RGB content is actually visible in light mode.
    //
    // v19.3: ALSO write proper alpha for the BH's post-pass features
    // (horizon mask, photon ring, halo darkening). In light mode the
    // input FBO is mostly alpha=0 (transparent), so the BH features
    // computed above would be invisible even when bright (e.g. the
    // cream photon ring is computed but discarded by alpha=0 when no
    // scene geometry is at that NDC location).
    //
    // We compute a bhFeatureAlpha that's the union of:
    //   - the horizon mask (body silhouette — pure black, opaque)
    //   - the photon ring presence (bright cream, opaque where ring)
    //   - the darkening halo gradient (subtle, semi-opaque)
    // and OR it with inputColor.a so dark-mode behavior is unchanged
    // and light-mode finally shows the post-pass features.
    // v19.4: BH visual identity (body silhouette + photon ring +
    // halo) writes its OWN alpha so it stays visible against any
    // background, even in light mode where the FBO is mostly
    // transparent. Previously the alpha was multiplied by uActive
    // (≈0.42 at steady state), making the body semi-transparent and
    // the ring barely visible — the user perceived this as the BH
    // "core shrinking" when in fact the surrounding cream halo was
    // just dim enough to blend with the bright bg.
    //
    // Now: bhFeatureAlpha is at FULL strength, with uActive only as
    // a smooth fade-in coefficient via smoothstep. At steady state
    // (uActive=0.42), alpha is at FULL opacity for the body
    // silhouette and 0.95 for the photon ring — the BH visual is
    // ROCK SOLID regardless of FBO content beneath.
    float bhFeatureAlpha = 0.0;
    if (uActive > 0.001 && uRadius > 0.0001) {
      vec2 dA = uv - uCenter;
      dA.x *= uAspect;
      float rA = length(dA);
      float horizonA = uRadius * 1.05;
      float photonA  = uRadius * 1.13;
      float ringWideA = uRadius * 0.18;
      float horizonMaskA = 1.0 - smoothstep(horizonA - uRadius * 0.02, horizonA, rA);
      float ringA = exp(-pow((rA - photonA) / ringWideA, 2.0));
      float haloTA = smoothstep(uRadius * 2.0, uRadius * 1.18, rA);
      // Fade-in coefficient — smooth ramp 0..1 over first slice of
      // uActive. Once past 0.2, it's effectively 1.0 (full opacity).
      float fadeIn = smoothstep(0.0, 0.2, uActive);
      bhFeatureAlpha = max(
        max(horizonMaskA, ringA * 0.95),
        haloTA * 0.5
      ) * fadeIn;
    }
    float baseAlpha = mix(inputColor.a, glitchAlpha, step(0.0001, uGlitch));
    float finalAlpha = max(baseAlpha, bhFeatureAlpha);
    outputColor = vec4(col, finalAlpha);
  }
`;

class LensingEffect extends Effect {
  constructor() {
    super('BlackHolePostEffect', lensingFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uCenter', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uRadius', new THREE.Uniform(0.0)],
        ['uActive', new THREE.Uniform(0.0)],
        ['uAspect', new THREE.Uniform(1.0)],
        ['uPhotonRingBoost', new THREE.Uniform(0.0)],
        ['uPostFlash', new THREE.Uniform(0.0)],
        // v15-take6: scene-wide glitch (RGB split + horizontal slice).
        ['uGlitch', new THREE.Uniform(0.0)],
        ['uGlitchTime', new THREE.Uniform(0.0)],
        // v18-take3: light-mode level for lens-strength / halo-floor
        // scaling. 0 = dark mode (full lensing), 1 = light mode
        // (reduced to preserve bright bg around BH).
        ['uLight', new THREE.Uniform(0.0)],
        // v20: SafeMode flag. When 1.0, the glitch shader branch
        // uses a slow radial cosmic ripple instead of high-frequency
        // horizontal-slice + RGB-channel-separation displacement
        // (which is a known photosensitive seizure trigger).
        ['uSafeMode', new THREE.Uniform(0.0)],
      ]),
    });
  }
}

// Register the effect tag for R3F so we can use it as JSX.
extend({ LensingEffect });

declare module '@react-three/fiber' {
  interface ThreeElements {
    lensingEffect: object;
  }
}

// Supernova shell shader \u2014 from the "blackhole collapse" chat.
//
// Sphere geometry of radius 1, scaled in the vertex shader by
// mix(1, 80, p) and perturbed by snoise so the surface looks turbulent.
// Color ramps from hot blue-white → orange shell → faint magenta as
// progress goes 0 → 1. Alpha fades in fast (0..0.05) and out slow
// (0.5..1) so the shell flares brilliantly then dims into the BH.
const supernovaVertexShader = /* glsl */ `
  precision highp float;
  ${SIMPLEX_NOISE_GLSL}
  uniform float uProgress;
  uniform float uTime;
  varying float vNoise;
  varying vec3 vNormal;
  void main() {
    // v15-take3 (Issue 3): reuse the EXACT original supernova shell
    // shader that fires for the red-giant -> NS arc. Same single-octave
    // snoise, same scale 1->80, same normal displacement. The "20x more
    // violent / brighter" feel is delivered via screen effects
    // (flashRef + chromaRef cranked harder by the host driver) and
    // bigger sphere geometry in the host mesh (radius 3 vs supernova's 1).
    // No "wobbling object" inside the shell because there are no domain
    // warps or extra rebound spikes here.
    float n = snoise(position * 0.6 + uTime * 0.2);
    vNoise = n;
    vNormal = normal;
    float scale = mix(1.0, 80.0, smoothstep(0.0, 1.0, uProgress));
    vec3 p = position * scale;
    p += normal * n * scale * 0.18;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const supernovaFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uProgress;
  varying float vNoise;
  varying vec3 vNormal;
  void main() {
    // Original color ramp: hot blue-white core -> orange shell ->
    // dim magenta shockwave. Identical to the supernova's shader
    // so the BH-explosion looks exactly like a brighter version
    // of the same physical event.
    vec3 col = mix(vec3(1.6, 1.4, 1.2), vec3(1.0, 0.4, 0.15),
                   smoothstep(0.0, 0.6, uProgress));
    col = mix(col, vec3(0.6, 0.15, 0.3),
              smoothstep(0.6, 1.0, uProgress));
    col *= 1.2 + vNoise * 0.6;
    float a = smoothstep(0.0, 0.05, uProgress)
            * (1.0 - smoothstep(0.5, 1.0, uProgress));
    gl_FragColor = vec4(col, a * 0.9);
  }
`;

interface Supernova3DProps {
  novaState: RefObject<SupernovaState>;
  visible: RefObject<boolean>;
  novaPosRef: RefObject<THREE.Vector3>;
  explosionProgressRef: RefObject<number>;
}

function Supernova3D({
  novaState,
  visible,
  novaPosRef,
  explosionProgressRef,
}: Supernova3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (!visible.current) return;
    const ns = novaState.current;
    if (!ns) return;
    const m = meshRef.current;
    const mat = matRef.current;
    if (!m || !mat) return;
    // v15-take4 (Issue 2): Supernova3D shell is permanently hidden.
    // The user dislikes the wobbly remnant the shell produces. The
    // BH-explosion drama is now delivered entirely by:
    //   - flashRef pulse (FlashOverlay, screen-wide white pulse)
    //   - chromaRef sweep (ChromaticAberration post-pass, "3D glass"
    //     RGB split that warps the whole scene)
    //   - uExplosionGlitch (per-star jitter on the entire starfield,
    //     simulating gravitational-wave ripple)
    // The mesh stays in the scene graph so the host driver code below
    // still runs (uniforms get updated harmlessly), but the mesh
    // itself never renders.
    m.visible = false;
    // The remaining (unused) ref reads keep the closure stable; the
    // mesh itself never renders.
    void mat;
    void state;
    void novaPosRef;
    void explosionProgressRef;
  });

  return (
    <mesh ref={meshRef} visible={false} frustumCulled={false}>
      {/* v15-take3 (Issue 3): geometry radius 3 (was 1). The shell
          shader scales by 1->80, so peak shell radius = 240 world
          units (vs 80 for the supernova). 3x larger physical extent
          delivers the "20x more violent" feel via geometry. */}
      <sphereGeometry args={[3, 48, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={supernovaVertexShader}
        fragmentShader={supernovaFragmentShader}
        uniforms={{
          uProgress: { value: 0 },
          uTime: { value: 0 },
        }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ============================================================
// v15-take6 (Issue 3): KilonovaEjecta — physics-based NS→BH
// explosion sequence.
//
// Real-physics sequence (synthesized from astrophysics literature
// on NS-to-BH gravitational collapse and binary-NS-merger kilonova
// observations):
//
//   bhCharging   - protoneutron-star f-mode oscillations build up
//                  as critical mass is approached. (Visual: NS body
//                  itself pulsates — driven elsewhere; this
//                  component is invisible during this beat.)
//
//   bhDetonating - dynamical collapse begins. The quadrupole moment
//                  spikes as the PNS implodes; a brief bright
//                  blue-white flash is emitted as the polar fast-
//                  ejecta first decouples. (Visual: tiny bright
//                  hot-blue burst at the NS location.)
//
//   bhBlooming   - "blue kilonova": fast polar ejecta (~0.2c)
//                  composed of light r-process nuclei, hot
//                  (T ≈ 5500K). Lanthanide-poor so spectrum is blue.
//                  Expands rapidly outward. (Visual: blue
//                  expanding sphere + axial brightening for jet
//                  hint.)
//
//   bhAftermath  - "red kilonova": slower equatorial ejecta
//                  rich in lanthanides (heavy r-process nuclei),
//                  with very high opacity. Color reddens as ejecta
//                  cools and lanthanide-rich material dominates.
//                  Velocity slower (~0.1c). (Visual: blue→red
//                  color shift; sphere keeps expanding but dimmer.)
//
//   bhForming    - relativistic jet launches along BH spin axis
//                  (Poynting-flux-dominated, GRB-like). Most of
//                  the kilonova ejecta has expanded out of frame;
//                  what remains is the bipolar jet structure.
//                  (Visual: bright thin axial cones; main sphere
//                  almost gone.)
// ============================================================

const kilonovaVertexShader = /* glsl */ `
  precision highp float;
  ${SIMPLEX_NOISE_GLSL}
  uniform float uArcU;    // 0..1 across the entire 5-beat arc
  uniform float uTime;
  varying vec3  vNormal;
  varying float vNoise;
  void main() {
    vNormal = normal;
    // Surface noise for ejecta texture (uniform across arc).
    float n = snoise(position * 1.4 + uTime * 0.3);
    vNoise = n;

    // v19.2: Scale evolution rebalanced so the ejecta expands PAST
    // the camera by end of blooming. The BH world position is ~50
    // units from camera; once scale > 50 the camera is inside the
    // sphere and only the inside (back face from rendering POV) is
    // visible. The user then sees an ambient red tint rather than
    // a visible expansion boundary that could appear to "shrink".
    //
    //   detonating (0.10..0.20): tiny burst, scale 0.5..3
    //   blooming   (0.20..0.50): rapid expansion 3..120 (engulfs cam)
    //   aftermath  (0.50..0.75): expands to 200 (well off-screen)
    //   forming    (0.75..1.00): stable at 200
    //   bhConsuming (uArcU 1..2): stable at 200
    float scale = 0.0;
    if (uArcU < 0.10) {
      scale = 0.0;
    } else if (uArcU < 0.20) {
      // Detonation flash: scale 0.5 -> 3.
      float t = (uArcU - 0.10) / 0.10;
      scale = mix(0.5, 3.0, t);
    } else if (uArcU < 0.50) {
      // Blooming: 3 -> 120. Crosses camera at scale=50 (~40% of
      // blooming progress); from then on the user is inside.
      float t = (uArcU - 0.20) / 0.30;
      scale = mix(3.0, 120.0, smoothstep(0.0, 1.0, t));
    } else if (uArcU < 0.75) {
      // Aftermath: 120 -> 200 (off-screen).
      float t = (uArcU - 0.50) / 0.25;
      scale = mix(120.0, 200.0, t);
    } else {
      // Forming + bhConsuming: stable at 200. Edge stays well past
      // viewport, so the user never sees an expansion/contraction
      // boundary — only ambient tint that fades via alpha.
      scale = 200.0;
    }

    // Slight noise displacement so the ejecta sphere isn't perfectly
    // smooth (resembles turbulent ejecta morphology).
    vec3 p = position * scale;
    p += normal * n * scale * 0.10;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const kilonovaFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uArcU;
  varying vec3  vNormal;
  varying float vNoise;
  void main() {
    // Color evolution by phase.
    //
    // Real kilonova spectroscopy (GW170817):
    //   blue kilonova: T ≈ 5500K, lanthanide-poor polar ejecta
    //   red kilonova: lanthanide-rich equatorial ejecta, low opacity
    //
    // We use 3 reference colors:
    //   blueHot  - vec3(0.6, 0.85, 1.4)  hot blue-white (5500K-ish)
    //   blueCool - vec3(0.30, 0.55, 1.10) saturated blue
    //   red      - vec3(1.30, 0.30, 0.10) deep red kilonova
    vec3 blueHot  = vec3(1.30, 1.45, 1.60);
    vec3 blueCool = vec3(0.30, 0.55, 1.10);
    vec3 red      = vec3(1.30, 0.30, 0.10);

    vec3 col;
    float alpha = 0.0;

    // v19.2: alpha values rebalanced. From bhBlooming onward the
    // camera is inside the ejecta sphere (scale > 50 = camera dist
    // to BH center). When inside, the user sees the inner surface
    // ambient-style — alpha is reduced so the tint is gentle, not
    // an opaque red wall.
    if (uArcU < 0.10) {
      // Charging: nothing visible from this component.
      discard;
    } else if (uArcU < 0.20) {
      // Detonation flash: hot blue-white at peak brightness. Sphere
      // still small (scale 0.5..3), camera outside, OK to be opaque.
      float t = (uArcU - 0.10) / 0.10;
      col = mix(blueHot * 1.5, blueHot, t);
      alpha = mix(0.0, 1.0, smoothstep(0.0, 0.3, t));
    } else if (uArcU < 0.50) {
      // Blooming: scale 3 → 120. Crosses camera mid-phase. Alpha
      // ramps DOWN from peak as the camera transitions from outside
      // to inside (so we don't suddenly fill the screen with opaque
      // blue when scale=50). Past camera crossover, ambient tint.
      float t = (uArcU - 0.20) / 0.30;
      col = mix(blueHot, blueCool, t);
      // 1.0 alpha while camera outside (t<0.4), then fade to 0.25
      // ambient tint after camera is inside (t>0.4).
      alpha = mix(1.0, 0.25, smoothstep(0.35, 0.55, t));
    } else if (uArcU < 0.75) {
      // Aftermath (camera inside): blue → red ambient tint.
      // v19.2 take2: alpha settles to 0.20 (not 0.18) by end so
      // there's a stable target for bhForming and bhConsuming.
      float t = (uArcU - 0.50) / 0.25;
      col = mix(blueCool, red, smoothstep(0.0, 1.0, t));
      alpha = mix(0.25, 0.20, t);
    } else if (uArcU < 1.0) {
      // Forming: ejecta fades out across bhForming so it's gone by
      // the time bhConsuming starts. Physically correct — the
      // dispersing kilonova material thins out as it expands, and
      // by the time the BH is "settled" and ready to pull stars,
      // the explosion remnant has cleared.
      //
      // v19.3: starts at alpha 0.20 (continuous with bhAftermath
      // end) and smooth-fades to 0 across bhForming. The post-pass
      // BH features (photon ring, horizon mask) now write their
      // own alpha so the BH visual identity survives even when the
      // ejecta is fully gone — there's no longer a perceived "core
      // shrink" because the ring/halo are visible in light mode
      // even with the FBO transparent everywhere except the body.
      float t = (uArcU - 0.75) / 0.25;
      float jetMask = pow(abs(vNormal.z), 12.0);
      col = mix(red, vec3(1.5, 0.8, 0.4), jetMask);
      alpha = mix(0.20, 0.0, smoothstep(0.0, 1.0, t));
    } else {
      // bhConsuming (camera inside): ejecta is GONE (alpha=0).
      // Per user request: bhConsuming should look like bhForming
      // but with the ejecta disappeared (real kilonova physics:
      // material has dispersed/diluted to invisibility by this
      // point in the timeline).
      //
      // The BH visual identity (body silhouette, photon ring,
      // halo) is now carried entirely by the post-pass effects,
      // which write their own alpha (v19.3 finalAlpha boost).
      // No discontinuity at uArcU=1.0 since bhForming end also
      // had alpha=0.
      discard;
    }

    // Modulate by surface noise for organic feel.
    col *= 1.0 + vNoise * 0.5;
    // Light rim falloff so the sphere has volume rather than flat.
    // From inside the sphere this becomes a soft soft directional
    // shading that varies across the view — still adds visual
    // texture, just reads differently than outside-view.
    float rim = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    col *= 0.7 + rim * 0.6;

    gl_FragColor = vec4(col, alpha);
  }
`;

interface KilonovaEjectaProps {
  novaState: RefObject<SupernovaState>;
  visible: RefObject<boolean>;
  novaPosRef: RefObject<THREE.Vector3>;
}

function KilonovaEjecta({ novaState, visible, novaPosRef }: KilonovaEjectaProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (!visible.current) return;
    const ns = novaState.current;
    if (!ns) return;
    const m = meshRef.current;
    const mat = matRef.current;
    if (!m || !mat) return;

    // v19 (continuity fix): extend visibility to include bhConsuming
    // so the residual ejecta lingers as a faded red glow during the
    // pulling phase. Without this, the BH visually "shrinks" at the
    // bhForming → bhConsuming transition because the large ejecta
    // sphere disappears in one frame. Now arcU goes 0..1 across the
    // 5-beat arc, then 1..2 across bhConsuming as a residual fade.
    const isInArc =
      ns.phase === 'bhCharging' ||
      ns.phase === 'bhDetonating' ||
      ns.phase === 'bhBlooming' ||
      ns.phase === 'bhAftermath' ||
      ns.phase === 'bhForming' ||
      ns.phase === 'bhConsuming';

    m.visible = isInArc;
    if (!isInArc) return;

    const arcTotal =
      SUPERNOVA_TIMINGS.bhCharging +
      SUPERNOVA_TIMINGS.bhDetonating +
      SUPERNOVA_TIMINGS.bhBlooming +
      SUPERNOVA_TIMINGS.bhAftermath +
      SUPERNOVA_TIMINGS.bhForming;

    let elapsed = 0;
    let arcU = 0;
    if (ns.phase === 'bhCharging') {
      elapsed = ns.phaseT;
      arcU = Math.min(1, elapsed / arcTotal);
    } else if (ns.phase === 'bhDetonating') {
      elapsed = SUPERNOVA_TIMINGS.bhCharging + ns.phaseT;
      arcU = Math.min(1, elapsed / arcTotal);
    } else if (ns.phase === 'bhBlooming') {
      elapsed = SUPERNOVA_TIMINGS.bhCharging + SUPERNOVA_TIMINGS.bhDetonating + ns.phaseT;
      arcU = Math.min(1, elapsed / arcTotal);
    } else if (ns.phase === 'bhAftermath') {
      elapsed =
        SUPERNOVA_TIMINGS.bhCharging +
        SUPERNOVA_TIMINGS.bhDetonating +
        SUPERNOVA_TIMINGS.bhBlooming +
        ns.phaseT;
      arcU = Math.min(1, elapsed / arcTotal);
    } else if (ns.phase === 'bhForming') {
      elapsed =
        SUPERNOVA_TIMINGS.bhCharging +
        SUPERNOVA_TIMINGS.bhDetonating +
        SUPERNOVA_TIMINGS.bhBlooming +
        SUPERNOVA_TIMINGS.bhAftermath +
        ns.phaseT;
      arcU = Math.min(1, elapsed / arcTotal);
    } else {
      // bhConsuming — residual fade, arcU 1..2
      const consU = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.bhConsuming);
      arcU = 1 + consU;
    }

    const np = novaPosRef.current;
    if (np) m.position.copy(np);

    mat.uniforms.uArcU.value = arcU;
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} visible={false} frustumCulled={false}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={kilonovaVertexShader}
        fragmentShader={kilonovaFragmentShader}
        uniforms={{
          uArcU: { value: 0 },
          uTime: { value: 0 },
        }}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ============================================================
// v13 (genesis-port): BlackHole — ported from BlackHoleGenesis.tsx.
//
// Two real 3D scene meshes:
//
//   bodyRef   — solid black sphere (sphereGeometry [1, 48, 48]
//                with meshBasicMaterial color 0x000000). Writes
//                depth so on-screen stars (which depthTest during
//                BH-active phases) are occluded.
//
//   diskRef   — ringGeometry(0.32, 1.0, 256, 1) tilted at
//                rotation [-PI/2 + 0.18, 0, 0]. Custom UV remap
//                (u = angle, v = normalised radius) so the shader
//                can do Keplerian rotation, banded streaks, and
//                doppler beaming. Scaled by bhSize * 7.5 so the
//                disk's outer rim ends up ~7.5x the body radius
//                — the iconic "thin extended disk" proportion.
//
// The visual identity (photon ring + horizon mask + screen-space
// lensing) is painted in the post-pass (BlackHolePostEffect at the
// top of file). The 3D body and disk provide:
//   1. depth occlusion for the starfield
//   2. real-3D parallax for the disk as the camera approaches
//   3. animated banded turbulence rotating around the BH
// ============================================================

const accretionDiskVertexShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  // v21.2: pass local (geometry-space) position so the fragment
  // shader can recover the ring's angle per-pixel via atan2 rather
  // than reading it from vUv.x (which has a seam discontinuity).
  varying vec3 vLocalPos;
  void main() {
    vUv = uv;
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Direct port of the reference's accretion-disk fragment shader.
// Unchanged except for the snoise prefix (we re-use the existing
// SIMPLEX_NOISE_GLSL, which is functionally identical to the
// reference's SNOISE block).
const accretionDiskFragmentShader = /* glsl */ `
  precision highp float;
  ${SIMPLEX_NOISE_GLSL}
  uniform float uTime;
  uniform float uProgress;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  // v21.2: pass local (geometry-space) position so the fragment
  // shader can recover the ring's angle per-pixel via atan, rather
  // than reading it from vUv.x which has a seam discontinuity.
  varying vec3 vLocalPos;
  void main() {
    float r = vUv.y;                       // 0 inner edge, 1 outer
    // v21.2: angle PER-PIXEL from interpolated local position.
    //
    // vUv.x was computed from u = (atan2(y,x)/pi + 1)*0.5 over the
    // RingGeometry vertices. That UV remapping has a seam along the
    // ring\'s negative-x radial line: vertices on either side of the
    // seam have u≈0.001 and u≈0.999. Across that seam the GPU
    // linearly interpolates vUv.x, producing intermediate values
    // (u≈0.5, angle≈π) for pixels that should actually be at
    // angle≈0 / 2π. The wrong angle fed every downstream calc
    // (Keplerian streak rotation, banding, Doppler), drawing a thin
    // radial discontinuity that, with the ring tilted near-edge-on,
    // projected to the visible horizontal brown line.
    //
    // atan() on interpolated vLocalPos has its own discontinuity at
    // y=0, x<0 (jumps +π ↔ -π). But every downstream use feeds
    // angle through cos/sin/cos(N*angle), and cos(±π) = -1,
    // sin(±π) = 0, cos(N*π) = cos(N*(-π)) for integer N — so
    // the visible output is continuous across the seam.
    float angle = atan(vLocalPos.y, vLocalPos.x);
    float omega = 1.0 / max(r * r, 0.05);  // Keplerian ω ∝ 1/r^2
    float streakAngle = angle - uTime * omega * 0.04;
    vec3 noisePos = vec3(cos(streakAngle), sin(streakAngle), r * 4.0) * 2.5;
    float n = snoise(noisePos + vec3(0.0, 0.0, uTime * 0.3));
    n = n * 0.5 + 0.5;
    float bands = 0.5 + 0.5 * sin(streakAngle * 18.0 + n * 4.0);
    bands = pow(bands, 3.0);
    vec3 inner = vec3(1.6, 1.5, 1.2);  // hot white-yellow inside
    vec3 mid   = vec3(1.4, 0.7, 0.2);  // orange middle
    vec3 outer = vec3(0.9, 0.18, 0.05); // dim red outer
    vec3 col = mix(inner, mid, smoothstep(0.0, 0.45, r));
    col = mix(col, outer, smoothstep(0.45, 1.0, r));
    col *= (0.4 + bands * 0.7) * (0.8 + n * 0.6);
    // Doppler: side rotating toward camera ~140% brighter.
    float doppler = 1.0 + 1.4 * smoothstep(-0.2, 1.0, cos(angle));
    col *= doppler;
    // Soft inner / outer edge feathering.
    float edgeIn  = smoothstep(0.0, 0.06, r);
    float edgeOut = 1.0 - smoothstep(0.85, 1.0, r);
    float alpha = edgeIn * edgeOut * uProgress;
    col *= 1.2 * uProgress;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Build a RingGeometry with the reference's custom UV remapping:
//   u = (atan2(y,x) / pi + 1) / 2     — angle around ring [0..1]
//   v = (r - innerR) / (outerR - innerR)  — radius [0..1]
//
// (Default RingGeometry UVs aren't suitable for a Keplerian shader
// because they don't expose angle/radius cleanly.)
function makeAccretionRingGeometry(): THREE.RingGeometry {
  // v21.1: disk inner radius tightened from 0.55 (= 4.125 * bhSize
  // in world units) to 0.20 (= 1.5 * bhSize). The previous value
  // produced a visible cream sky gap of ~3-body-radii between the
  // photon ring's outer edge and the disk's inner edge, which the
  // user noted as physically incorrect.
  //
  // Real BH physics (Schwarzschild, non-rotating):
  //   - Event horizon at r = 2M
  //   - Photon sphere at r = 3M
  //   - Apparent shadow as seen by distant observer: b_c = 3*sqrt(3)*M
  //     ~= 5.196M (the critical impact parameter; light below this
  //     spirals into the horizon)
  //   - Photon ring sits AT the shadow edge (b = b_c)
  //   - ISCO (innermost stable circular orbit, inner edge of the
  //     accretion disk) at r = 6M, but its lensed image appears
  //     just outside the photon ring \u2014 ratio ISCO_image/photon_ring
  //     is roughly 1.15 in the non-rotating case.
  //
  // In our code 'bhSize' is conceptually the apparent shadow radius
  // (what the observer sees as the black disk). The photon ring in
  // the post-pass is at ~1.13 * bhSize. The disk inner edge should
  // therefore appear at ~1.15 * bhSize \u2014 i.e. JUST outside the
  // photon ring.
  //
  // We use 1.2 * bhSize (geometry innerR = 0.16, scaled by 7.5)
  // rather than the bare ISCO_image/photon_ring ratio of 1.15.
  // The hair of extra clearance accounts for two practical issues:
  // (1) the disk is a flat tilted ring (no ray-tracing), so any
  // off-axis viewing might intersect the body sphere's surface;
  // (2) the disk's soft inner-edge alpha fade-in (smoothstep over
  // the first 6% of the radial range) means the visually bright
  // disk emission actually starts a little past the geometric
  // inner edge. With innerR = 0.16, the disk's soft fade-in spans
  // world (1.2, 1.46) * bhSize \u2014 the bright disk emission starts
  // right where the photon ring ends. Tight Interstellar-Gargantua
  // / EHT-M87 wrap, no z-fighting.
  const innerR = 0.16;
  const outerR = 1.0;
  const geo = new THREE.RingGeometry(innerR, outerR, 256, 1);
  const pos = geo.attributes.position.array as Float32Array;
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3],
      y = pos[i * 3 + 1];
    const r = Math.sqrt(x * x + y * y);
    const a = Math.atan2(y, x);
    uv[i * 2] = (a / Math.PI + 1) * 0.5;
    uv[i * 2 + 1] = (r - innerR) / (outerR - innerR);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

interface BlackHoleProps {
  novaState: RefObject<SupernovaState>;
  visible: RefObject<boolean>;
  novaPosRef: RefObject<THREE.Vector3>;
  blackHoleProgRef: RefObject<number>;
  blackHoleEngulfRef: RefObject<number>;
  bhActiveRef: RefObject<boolean>;
  bhPositionRef: RefObject<THREE.Vector3>;
  bhCoverageRef: RefObject<number>;
  // v19.1: per-frame world-space body radius, read by BlackHoleHalo.
  bhSizeRef: RefObject<number>;
}

function BlackHole({
  novaState,
  visible,
  novaPosRef,
  blackHoleProgRef,
  blackHoleEngulfRef,
  bhActiveRef,
  bhPositionRef,
  bhCoverageRef,
  bhSizeRef,
}: BlackHoleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  // v18 (Issue 1): body material ref so we can toggle `side` between
  // FrontSide (normal phases) and DoubleSide (engulfing only).
  // DoubleSide on the body during bhConsuming was causing the back-
  // facing surface to write depth at the far side of the sphere,
  // which interacted oddly with the disk's depthTest=true rendering
  // at light-mode bg — producing a horizontal "chop" of disk pixels
  // around the BH silhouette.
  const bodyMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const diskRef = useRef<THREE.Mesh>(null);
  const diskMatRef = useRef<THREE.ShaderMaterial>(null);

  // Build the disk geometry once, with the custom UV layout.
  const ringGeo = useMemo(() => makeAccretionRingGeometry(), []);
  // Dispose on unmount so we don't leak GPU memory.
  useEffect(() => () => ringGeo.dispose(), [ringGeo]);

  useFrame((state) => {
    if (!visible.current) return;
    const ns = novaState.current;
    if (!ns) return;
    const grp = groupRef.current;
    const body = bodyRef.current;
    const disk = diskRef.current;
    const diskMat = diskMatRef.current;
    if (!grp || !body || !disk || !diskMat) return;

    // v15-take5: BH visibility list extended to include bhConsuming.
    // Hidden during the swallowed/emerging black-hold and during the
    // late part of engulfing (overlay opaque).
    let isVisible =
      ns.phase === 'bhAftermath' ||
      ns.phase === 'bhForming' ||
      ns.phase === 'bhConsuming' ||
      ns.phase === 'engulfing';
    if (ns.phase === 'engulfing') {
      const uEng = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.engulfing);
      // Cutoff at 0.85 — BH stops rendering once overlay starts
      // ramping over the final 15% of engulfing.
      if (uEng > 0.85) isVisible = false;
    }
    grp.visible = isVisible;
    if (bhActiveRef.current !== null) {
      (bhActiveRef as { current: boolean }).current = isVisible;
    }
    if (!isVisible) {
      if (bhCoverageRef.current !== null) {
        (bhCoverageRef as { current: number }).current = 0;
      }
      return;
    }

    // v15-take5 (Issue 3): compute halfDiag FIRST so we can derive
    // bhSize from the target coverage. The body world-space radius
    // = halfDiag * coverage; halfDiag is computed at the BH's
    // current world position (which lerps toward camera during
    // engulfing). For phases where the BH hasn't moved yet, halfDiag
    // uses the current grp.position (set last frame from
    // novaPosRef).
    let halfDiag = 1;
    if (state.camera instanceof THREE.PerspectiveCamera) {
      const dx = grp.position.x - state.camera.position.x;
      const dy = grp.position.y - state.camera.position.y;
      const dz = grp.position.z - state.camera.position.z;
      const dist = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const halfFovRad = (state.camera.fov * Math.PI) / 180 / 2;
      const halfH = dist * Math.tan(halfFovRad);
      const halfW = halfH * state.camera.aspect;
      halfDiag = Math.sqrt(halfH * halfH + halfW * halfW);
    }

    // Target coverage for this cycle (20..35%). Default to 0.275
    // (midpoint) if not yet set (defensive: should be set in
    // bhBlooming->bhAftermath transition).
    // v15-take8: default fallback target coverage 0.275 (was 0.35).
    const targetCov = ns.targetBhCoverage ?? 0.07;
    // The body radius that produces targetCov: bhRadius = halfDiag * targetCov.
    const bhSizeAtTarget = halfDiag * targetCov;

    // bhSize — body sphere world-space radius. Drives both the
    // body and disk scales. Computed per-phase below.
    let bhSize = 1;
    let prog = 0;
    let camApproach = 0;

    if (ns.phase === 'bhAftermath') {
      // Body assembles to ~40% of target during aftermath.
      const u = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.bhAftermath);
      prog = u * 0.4;
      bhSize = bhSizeAtTarget * prog;
    } else if (ns.phase === 'bhForming') {
      // Body grows from 40% to 100% of target during forming.
      const u = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.bhForming);
      const eased = 0.4 + (1 - Math.pow(1 - u, 3)) * 0.6;
      prog = eased;
      bhSize = bhSizeAtTarget * eased;
    } else if (ns.phase === 'bhConsuming') {
      // Body holds stable at target size during the consume phase.
      prog = 1;
      bhSize = bhSizeAtTarget;
    } else if (ns.phase === 'engulfing') {
      // v16: BH stays STATIONARY at its formed position. Instead
      // of moving the camera, the BH itself grows dramatically
      // until it engulfs the camera. Camera stays at origin.
      //
      // Target size = ~3x the camera-to-BH distance, so by the end
      // of engulfing the BH has fully enveloped the camera (radius
      // exceeds distance, camera is "inside" the body sphere).
      //
      // Ease-in cubic so growth starts gentle (BH visibly inflating
      // from its formed size) then accelerates to swallow the
      // camera in the final beat.
      prog = 1;
      // Compute current camera-to-BH distance for scaling target.
      let distToCamera = 50; // safe default
      if (state.camera instanceof THREE.PerspectiveCamera && novaPosRef.current) {
        const np_ = novaPosRef.current;
        const dxc = np_.x - state.camera.position.x;
        const dyc = np_.y - state.camera.position.y;
        const dzc = np_.z - state.camera.position.z;
        distToCamera = Math.max(1, Math.sqrt(dxc * dxc + dyc * dyc + dzc * dzc));
      }
      const targetEngulfSize = distToCamera * 4.0;
      const uEng = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.engulfing);
      const easedGrowth = uEng * uEng * uEng; // ease-in cubic
      bhSize = bhSizeAtTarget + (targetEngulfSize - bhSizeAtTarget) * easedGrowth;
    } else {
      prog = 1;
      bhSize = bhSizeAtTarget;
    }

    // v16: BH always sits at np. Camera does not move; the BH
    // grows to engulf the camera during engulfing.
    const np = novaPosRef.current;
    if (np) {
      grp.position.copy(np);
    }
    // camApproach unused in v16 (no camera approach).
    void camApproach;

    // Body & disk scales.
    if (bodyRef.current) bodyRef.current.scale.setScalar(bhSize);
    // v18 (Issue 1): set body side. DoubleSide ONLY during engulfing
    // (when bhSize grows huge enough that camera ends up inside).
    // Normal phases stay FrontSide so the body silhouette renders
    // as a clean opaque circle without depth-buffer artifacts that
    // were producing the "chop" visual the user reported.
    if (bodyMatRef.current) {
      const wantDouble = ns.phase === 'engulfing';
      const want = wantDouble ? THREE.DoubleSide : THREE.FrontSide;
      if (bodyMatRef.current.side !== want) {
        bodyMatRef.current.side = want;
        // No needsUpdate — side is a fixed-function property, not
        // a shader-program one. Avoids GLSL recompile + the
        // circular-JSON crash documented in v17-take2.
      }
    }
    if (diskRef.current) {
      diskRef.current.scale.setScalar(bhSize * 7.5);
      // v16: hide the disk during engulfing once the BH gets large
      // enough to dominate the screen. The disk geometry would
      // otherwise grow to absurd sizes and clip weirdly. The user
      // wants pitch-black engulfment, not a cosmic light-show.
      if (ns.phase === 'engulfing') {
        const uEng = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.engulfing);
        diskRef.current.visible = uEng < 0.4; // fade out by 40% in
      } else {
        diskRef.current.visible = true;
      }
    }

    // Disk shader uniforms.
    diskMat.uniforms.uTime.value = state.clock.elapsedTime;
    // v16: fade disk alpha during engulfing so it doesn't pop off
    // visibly. uProgress drives the disk's own smoothstep gates.
    if (ns.phase === 'engulfing') {
      const uEng = Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.engulfing);
      diskMat.uniforms.uProgress.value = Math.max(0, 1 - uEng / 0.4);
    } else {
      diskMat.uniforms.uProgress.value = prog;
    }

    // Write external refs.
    if (bhPositionRef.current) {
      bhPositionRef.current.copy(grp.position);
    }
    if (blackHoleProgRef.current !== null) {
      (blackHoleProgRef as { current: number }).current = prog;
    }
    if (blackHoleEngulfRef.current !== null) {
      (blackHoleEngulfRef as { current: number }).current =
        ns.phase === 'engulfing'
          ? Math.min(1, ns.phaseT / SUPERNOVA_TIMINGS.engulfing)
          : 0;
    }

    // Final coverage write — RECOMPUTE halfDiag at the (possibly
    // updated) grp position, since the lerp may have moved it.
    if (state.camera instanceof THREE.PerspectiveCamera) {
      const dx2 = grp.position.x - state.camera.position.x;
      const dy2 = grp.position.y - state.camera.position.y;
      const dz2 = grp.position.z - state.camera.position.z;
      const dist2 = Math.max(0.5, Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2));
      const halfFovRad2 = (state.camera.fov * Math.PI) / 180 / 2;
      const halfH2 = dist2 * Math.tan(halfFovRad2);
      const halfW2 = halfH2 * state.camera.aspect;
      const halfDiag2 = Math.sqrt(halfH2 * halfH2 + halfW2 * halfW2);
      const coverage = bhSize / Math.max(0.001, halfDiag2);
      ns.bhCoverageRatio = coverage;
      if (bhCoverageRef.current !== null) {
        (bhCoverageRef as { current: number }).current = coverage;
      }
      // v19.1: write current world-space body radius for the halo
      // mesh to read. Halo scales itself to bhSize * 3.
      if (bhSizeRef.current !== null) {
        (bhSizeRef as { current: number }).current = bhSize;
      }
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* v16: solid black event-horizon sphere. side=DoubleSide so
          when the BH grows huge during engulfing and the camera ends
          up INSIDE the body sphere, the back-facing inner surface
          is still rendered (pure black). depthWrite=true so stars
          (depthTest enabled during BH-active phases) are occluded.
          Without DoubleSide, the camera-inside case would render
          nothing for the body, leaving stars visible behind it. */}
      <mesh ref={bodyRef} renderOrder={900} frustumCulled={false}>
        <sphereGeometry args={[1, 48, 48]} />
        {/* v18 (Issue 1): default to FrontSide (normal sphere
            silhouette). The useFrame below switches to DoubleSide
            only when the camera ends up inside the body sphere
            (engulfing phase), so the inner surface still renders
            as solid black. Outside engulfing, FrontSide avoids
            depth-buffer interactions that were causing the
            visual "chop" the user reported. */}
        <meshBasicMaterial
          ref={bodyMatRef}
          color={0x000000}
          toneMapped={false}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* Tilted accretion disk — RingGeometry with custom UVs +
          Keplerian + Doppler shader. Tilt = -PI/2 + 0.18 puts the
          disk almost perpendicular to camera with a slight rake. */}
      <mesh
        ref={diskRef}
        geometry={ringGeo}
        rotation={[-Math.PI / 2 + 0.18, 0, 0]}
        renderOrder={901}
        frustumCulled={false}
      >
        <shaderMaterial
          ref={diskMatRef}
          vertexShader={accretionDiskVertexShader}
          fragmentShader={accretionDiskFragmentShader}
          uniforms={{
            uTime: { value: 0 },
            uProgress: { value: 0 },
          }}
          transparent
          depthWrite={false}
          // v14: depthTest=false so the disk\'s back-far portion
          // (which would otherwise be occluded by the body sphere)
          // draws on top of the body silhouette in the FBO. The
          // post-pass horizon mask then paints clean black over
          // the body region, hiding the overlapping disk pixels.
          // What remains visible: the disk pixels OUTSIDE the
          // body silhouette \u2014 including the back-far edges that
          // arch ABOVE the body and the front-near edges that
          // arch BELOW. This produces the iconic Gargantua-style
          // continuous wrap-around without explicit lensing math
          // on the disk geometry itself.
          depthTest={true}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* v11: WhiteFlashOverlay
 * Full-screen white div whose opacity is polled from whiteFlashRef.
 * Used during engulfing/whitening for the singularity passage.
 * Positioned ABOVE the black DeathOverlay (z-40 vs z-30) so when
 * both are at full intensity, white wins. */
function WhiteFlashOverlay({
  whiteFlashRef,
  safeModeRef,
}: {
  whiteFlashRef: RefObject<number>;
  safeModeRef: RefObject<boolean>;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let eased = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const raw = whiteFlashRef.current ?? 0;
      const safe = safeModeRef.current === true;
      let display: number;
      if (safe) {
        // v20: cap full-screen white at 0.35 (was 1.0) and ease
        // with ~1.0s time constant so the rate of change stays
        // well below the 3Hz clinical threshold for large-area
        // luminance flashes.
        const capped = Math.min(0.35, raw * 0.35);
        const k = 1 - Math.exp(-(1 / 1.0) * dt);
        eased += (capped - eased) * k;
        display = eased;
      } else {
        eased = raw;
        display = raw;
      }
      const el = divRef.current;
      if (el) {
        el.style.opacity = String(display);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [whiteFlashRef, safeModeRef]);

  return (
    <div
      ref={divRef}
      className='fixed inset-0 z-40 bg-white'
      style={{ opacity: 0, pointerEvents: 'none' }}
    />
  );
}

/* v11: black-hole engulf overlay.
 * Polls overlayOpacityRef on rAF and writes opacity onto its own
 * div so the rest of the app doesn't re-render. */
function DeathOverlay({ overlayOpacityRef }: { overlayOpacityRef: RefObject<number> }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = overlayOpacityRef.current ?? 0;
      const el = divRef.current;
      if (el) {
        el.style.opacity = String(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overlayOpacityRef]);

  return (
    <div
      ref={divRef}
      className='fixed inset-0 z-30 bg-black'
      style={{ opacity: 0, pointerEvents: 'none' }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  ── ADD-ON v2.20 ── ScrollHint
 *  Tiny component that polls lightTargetRef so it can theme itself without
 *  needing App to pass down a re-rendering boolean. Same pattern as
 *  <ProbeMenu>'s self-owned lightMode state.
 * ──────────────────────────────────────────────────────────────────────────── */
function ScrollHint() {
  // v17-take2: ScrollHint only needs the boolean, so it subscribes to
  // the state context (re-renders on mode flips only, not on every
  // ref read).
  const { lightMode } = useLightModeState();

  return (
    <div
      className={[
        'pointer-events-none fixed bottom-6 left-6 z-10 text-[10px] tracking-[0.3em]',
        lightMode ? 'text-slate-600/60' : 'text-cyan-200/40',
      ].join(' ')}
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
    >
      ↓ SCROLL TO TRAVERSE
    </div>
  );
}

/* v17: Default export. Self-wraps AppContent with LightModeProvider so
 * simple usage `<App />` works without manual wrapping.
 *
 * For advanced usage (external toggle button), do NOT use this default
 * export. Instead:
 *
 *   import { AppContent, LightModeProvider, useLightMode } from "...";
 *
 *   function MyToggle() {
 *     const { lightMode, toggleLightMode } = useLightMode();
 *     return <button onClick={toggleLightMode}>
 *       {lightMode ? "\u2600\ufe0f" : "\ud83c\udf19"}
 *     </button>;
 *   }
 *
 *   export default function MyPage() {
 *     return (
 *       <LightModeProvider>
 *         <AppContent />
 *         <MyToggle />
 *       </LightModeProvider>
 *     );
 *   }
 */
export default function App() {
  return (
    <LightModeProvider>
      <SafeModeProvider>
        <AppContent />
      </SafeModeProvider>
    </LightModeProvider>
  );
}
