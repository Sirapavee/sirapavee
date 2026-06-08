import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { type RootState, useFrame, useThree } from '@react-three/fiber';
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Breakpoints
 * ──────────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Halton low-discrepancy sequence
 * ──────────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Reduced-motion hook — gates star count and twinkle behavior
 * ──────────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Page-visibility hook — pauses the render loop when tab is hidden
 * ──────────────────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Per-breakpoint config
 *  Star counts trimmed slightly from the JSX version on mobile/tablet — same
 *  visual density (their viewport is smaller) but less GPU/CPU work per frame.
 * ──────────────────────────────────────────────────────────────────────────── */
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
  // Adaptive DPR: top of range used when FPS is healthy, bottom when struggling.
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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Shaders
 *  The vertex shader handles per-star spawn (temporal) and despawn (geometric)
 *  fades, plus billboard projection. Fragment shader does the depth-based
 *  realism pass: close stars resolve to a faint diffuse sphere; far stars
 *  show the full JWST diffraction spike pattern with a multi-color gradient.
 * ──────────────────────────────────────────────────────────────────────────── */
const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aTwinklePhase;
  attribute float aTwinkleSpeed;
  attribute float aSpike;
  attribute float aSpawnTime;

  uniform float uTime;
  uniform float uFarWall;
  uniform float uDespawnBehind;
  uniform float uSpawnFade;
  uniform float uDespawnFade;
  uniform float uTwinkleStrength;

  varying vec2  vUv;
  varying float vSpike;
  varying float vTwinkle;
  varying float vBright;
  varying float vDepth;
  varying float vFade;

  void main() {
    vUv     = uv;
    vSpike  = aSpike;
    vBright = aBright;

    // Twinkle: gentle continuous shimmer + occasional bright pop ("blink").
    // uTwinkleStrength scales the pop magnitude — set to 0 for reduced-motion.
    float t      = uTime * aTwinkleSpeed + aTwinklePhase;
    float gentle = mix(0.75, 1.05, 0.5 + 0.5 * sin(t));
    float pop    = pow(0.5 + 0.5 * sin(t * 1.7 + 1.3), 14.0) * 2.2 * uTwinkleStrength;
    vTwinkle = gentle + pop * (0.4 + aSpike);

    // Per-instance world position → view space.
    vec4 instWorld  = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 viewCenter = viewMatrix * instWorld;

    vDepth = max(0.0, -viewCenter.z);

    // Spawn fade (temporal): 0 at moment of respawn, rises to 1 over uSpawnFade
    // seconds. Reads as the star "breathing in".
    float age       = uTime - aSpawnTime;
    float spawnFade = smoothstep(0.0, uSpawnFade, age);

    // Despawn fade (geometric): fades to 0 as star approaches either boundary.
    float forwardFade  = 1.0 - smoothstep(uDespawnBehind - uDespawnFade,
                                          uDespawnBehind,
                                          instWorld.z);
    float backwardFade = smoothstep(uFarWall,
                                    uFarWall + uDespawnFade,
                                    instWorld.z);
    vFade = spawnFade * min(forwardFade, backwardFade);

    // Standard billboard offset in view-space xy.
    vec2 quadOffset = (uv - 0.5) * aSize;
    vec4 viewPos    = viewCenter + vec4(quadOffset, 0.0, 0.0);

    gl_Position = projectionMatrix * viewPos;
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

  // One spike along an arbitrary axis (symmetric).
  // thickness ↑ = thinner perpendicular profile (sharper rays)
  // decay     ↓ = LONGER spike (slower exponential falloff along axis)
  float spike(vec2 p, float angle, float thickness, float decay) {
    float c = cos(angle), s = sin(angle);
    vec2  r = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
    return exp(-r.y * r.y * thickness) * exp(-abs(r.x) * decay);
  }

  void main() {
    // Early discard if fade is fully zero — saves the rest of the work entirely
    // for stars in their fade zones. Common during heavy scrolling.
    if (vFade < 0.001) discard;

    vec2  p = vUv - 0.5;
    float r = length(p);

    // Closeness ramp: 1 when near probe (resolved as faint diffuse sphere),
    // 0 when far (sharp point with full diffraction).
    float closeness = 1.0 - smoothstep(15.0, 45.0, vDepth);

    // Core — tighter when far (sharp point), softer when close.
    float coreFalloff = mix(130.0, 60.0, closeness);
    float core = exp(-r * r * coreFalloff);

    // Halo — tight + dim far, wide + brighter close. Multiplied by a circular
    // edge fade so the wide close-range halo doesn't reveal the square quad.
    float haloFalloff   = mix(9.5, 3.5, closeness);
    float haloIntensity = mix(0.16, 0.55, closeness);
    float halo = exp(-r * haloFalloff) * haloIntensity;
    halo *= 1.0 - smoothstep(0.42, 0.50, r);

    // Diffraction spikes (JWST hex+strut). Faded out when star is close.
    float sp = 0.0;
    if (vSpike > 0.5) {
      float th = 700.0;
      float ln = 2.2;
      sp += spike(p, 0.0,            th, ln * 0.85); // horizontal strut
      sp += spike(p, 0.5235987756,   th, ln);        //  30°
      sp += spike(p, 1.5707963268,   th, ln);        //  90° vertical
      sp += spike(p, 2.6179938780,   th, ln);        // 150°
      sp *= 0.6;
      sp *= smoothstep(15.0, 45.0, vDepth);
    }

    // Color palette.
    vec3 cool = vec3(0.82, 0.92, 1.05);
    vec3 warm = vec3(1.05, 0.95, 0.82);
    vec3 dimColor = mix(warm, cool, smoothstep(0.2, 0.9, vBright));

    // JWST gradient for bright stars.
    vec3 jwstCore   = vec3(1.05, 1.08, 1.18);
    vec3 jwstSpkIn  = vec3(0.65, 0.85, 1.20);
    vec3 jwstSpkOut = vec3(0.85, 0.65, 1.05);
    vec3 jwstHalo   = vec3(1.05, 0.85, 0.85);
    vec3 jwstSpkColor = mix(jwstSpkIn, jwstSpkOut, smoothstep(0.12, 0.42, r));

    vec3 coreCol  = mix(dimColor, jwstCore,     vSpike);
    vec3 spikeCol = mix(dimColor, jwstSpkColor, vSpike);
    vec3 haloCol  = mix(dimColor, jwstHalo,     vSpike);

    float gain = vTwinkle * (0.6 + vBright * 0.9) * vFade;
    vec3 rgb = coreCol * core + spikeCol * sp + haloCol * halo;
    rgb *= gain;

    float intensity = (core + halo + sp) * gain;
    if (intensity < 0.003) discard;

    gl_FragColor = vec4(rgb, intensity);
  }
`;

/* ─────────────────────────────────────────────────────────────────────────────
 *  StarField
 * ──────────────────────────────────────────────────────────────────────────── */
interface StarFieldProps {
  scrollState: RefObject<ScrollState>;
  bp: Breakpoint;
  reducedMotion: boolean;
  visible: RefObject<boolean>;
}

function StarField({ scrollState, bp, reducedMotion, visible }: StarFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const spikeHaltonIdx = useRef<number>(0);
  const spawnTimeAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);

  // Resolve once per (bp, reducedMotion) — passed down through everything.
  const cfg = useMemo(() => {
    const baseCount = resolveBp(FIELD_CONFIG.starCount, bp);
    return {
      starCount: reducedMotion ? Math.floor(baseCount * 0.4) : baseCount,
      volumeXY: resolveBp(FIELD_CONFIG.volumeXY, bp),
      volumeZ: resolveBp(FIELD_CONFIG.volumeZ, bp),
      spikeRatio: resolveBp(FIELD_CONFIG.spikeRatio, bp),
    };
  }, [bp, reducedMotion]);

  // Per-instance attribute buffers — allocated once per cfg.
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
      spawnTime[i] = -SPAWN_FADE_SECONDS; // initially fully faded-in
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
    // instanceMatrix is updated frequently (every frame); flag for the driver.
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

    spawnTimeAttrRef.current = spawnTimeAttr;
    spikeHaltonIdx.current = numSpikes + 1;
  }, [data, dummy, cfg.starCount]);

  // Set static uniforms once when material is ready / bp changes.
  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uFarWall.value = -cfg.volumeZ;
    mat.uniforms.uDespawnBehind.value = DESPAWN_BEHIND;
    mat.uniforms.uSpawnFade.value = SPAWN_FADE_SECONDS;
    mat.uniforms.uDespawnFade.value = DESPAWN_FADE_UNITS;
    mat.uniforms.uTwinkleStrength.value = reducedMotion ? 0.0 : 1.0;
  }, [cfg.volumeZ, reducedMotion]);

  useFrame((state: RootState, delta: number) => {
    // Skip ALL work when tab is hidden — biggest single perf win on multi-tab
    // sessions. Stars resume cleanly from where they were.
    if (!visible.current) return;

    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const ss = scrollState.current;
    if (!ss) return;

    // Decay scroll impulse and clamp.
    ss.impulse *= Math.exp(-SCROLL_CONFIG.impulseDecay * delta);
    if (ss.impulse > SCROLL_CONFIG.impulseMax) ss.impulse = SCROLL_CONFIG.impulseMax;
    if (ss.impulse < SCROLL_CONFIG.impulseMin) ss.impulse = SCROLL_CONFIG.impulseMin;

    const velocity = SCROLL_CONFIG.baseDrift + ss.impulse;
    ss.velocity = velocity;

    const dz = velocity * delta;
    const now = state.clock.elapsedTime;

    // Cache hot values to local consts — V8 optimizes much better than
    // repeated property accesses through three refs.
    const ma = mesh.instanceMatrix.array as Float32Array;
    const spikeArr = data.spike;
    const spawnTimeAttr = spawnTimeAttrRef.current;
    const spawnTimeArr = spawnTimeAttr ? (spawnTimeAttr.array as Float32Array) : null;
    const STAR_COUNT = cfg.starCount;
    const VOL_XY = cfg.volumeXY;
    const VOL_Z = cfg.volumeZ;
    const farWall = -VOL_Z;

    let spawnDirty = false;

    // Position update path: only iterate when there's actual motion.
    if (dz !== 0) {
      let haltonCounter = spikeHaltonIdx.current;

      for (let i = 0; i < STAR_COUNT; i++) {
        const o = i * 16;
        const newZ = ma[o + 14] + dz;
        ma[o + 14] = newZ;

        if (newZ > DESPAWN_BEHIND) {
          // Forward despawn → respawn far ahead with fresh random x, y, z.
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
          // Backward despawn → respawn at +49 (just behind camera) so the
          // star streams BACK toward the far field as the user keeps
          // scrolling up.
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

    // Time uniform must update every frame so twinkle keeps animating even
    // when stars themselves are stationary.
    mat.uniforms.uTime.value = now;
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
 *  AdaptiveDPR — observes FPS via R3F's perf state and steps DPR up/down
 *  smoothly. Lives inside <Canvas> so it has access to gl/setDpr.
 * ──────────────────────────────────────────────────────────────────────────── */
function AdaptiveDPR({ min, max }: { min: number; max: number }) {
  const { gl, setDpr } = useThree();
  const samples = useRef<number[]>([]);
  const lastAdjust = useRef<number>(0);
  const currentDpr = useRef<number>(max);

  useEffect(() => {
    setDpr(max);
    currentDpr.current = max;
  }, [max, setDpr]);

  useFrame((state: RootState, delta: number) => {
    // Track recent frame deltas in a tiny ring buffer.
    const arr = samples.current;
    arr.push(delta);
    if (arr.length > 30) arr.shift();
    if (arr.length < 30) return;

    const now = state.clock.elapsedTime;
    if (now - lastAdjust.current < 1.5) return; // throttle adjustments

    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    const avgDelta = sum / arr.length;
    const fps = 1 / avgDelta;

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
    void gl; // unused, but keeps the destructure honest if lint complains
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Probe HUD
 * ──────────────────────────────────────────────────────────────────────────── */
interface ProbeMenuProps {
  scrollState: RefObject<ScrollState>;
  bp: Breakpoint;
}

function ProbeMenu({ scrollState, bp }: ProbeMenuProps) {
  const [vel, setVel] = useState<number>(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 100) {
        const ss = scrollState.current;
        setVel(ss?.velocity ?? 0);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollState]);

  const isMobile = bp === 'mobile';

  const rows: Array<[string, string]> = [
    ['TELEMETRY', 'NOMINAL'],
    ['NAVIGATION', 'DEEP FIELD'],
    ['VELOCITY', `${vel >= 0 ? '+' : ''}${vel.toFixed(1)} u/s`],
    ['BREAKPOINT', bp.toUpperCase()],
  ];

  return (
    <div
      className={[
        'fixed top-6 z-10 select-none',
        isMobile ? 'right-3 left-3' : 'right-6 w-72',
      ].join(' ')}
      style={{ fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace' }}
    >
      <div
        className='relative max-w-sm border border-cyan-300/15 bg-black/55 px-5 py-4 text-cyan-50/90'
        style={{
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        }}
      >
        <span className='absolute -top-px -left-px h-3 w-3 border-t border-l border-cyan-300/70' />
        <span className='absolute -top-px -right-px h-3 w-3 border-t border-r border-cyan-300/70' />
        <span className='absolute -bottom-px -left-px h-3 w-3 border-b border-l border-cyan-300/70' />
        <span className='absolute -right-px -bottom-px h-3 w-3 border-r border-b border-cyan-300/70' />

        <div className='mb-3 flex items-baseline justify-between'>
          <h2
            className='m-0 text-[11px] tracking-[0.35em] text-cyan-200/90'
            style={{ fontFamily: '"Major Mono Display", ui-monospace, monospace' }}
          >
            probe ctrl
          </h2>
          <span className='text-[9px] tracking-[0.18em] text-cyan-300/40'>v0.4.7</span>
        </div>

        <ul className='m-0 list-none p-0 text-[10.5px] tracking-[0.12em]'>
          {rows.map(([label, val]) => (
            <li
              key={label}
              className='flex justify-between border-b border-cyan-300/10 py-1.5'
            >
              <span className='text-cyan-50/55'>{label}</span>
              <span className='text-cyan-200/70 tabular-nums'>{val}</span>
            </li>
          ))}
        </ul>

        <p className='mt-3 mb-0 text-[9px] leading-snug tracking-[0.12em] text-cyan-200/30'>
          {isMobile ? 'swipe to thrust.' : 'scroll to thrust.'} stars drift continuously.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  App
 * ──────────────────────────────────────────────────────────────────────────── */
export const StarFields = () => {
  const bp = useBreakpoint();
  const reducedMotion = usePrefersReducedMotion();
  const visible = usePageVisibility();
  const scrollState = useRef<ScrollState>({ impulse: 0, velocity: 0 });

  // Wheel + touch listeners.
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

  const dprMin = resolveBp(FIELD_CONFIG.dprMin, bp);
  const dprMax = resolveBp(FIELD_CONFIG.dprMax, bp);

  return (
    <>
      {/* <div
        className='fixed inset-0 z-0 h-screen w-screen'
        style={{
          background: 'radial-gradient(ellipse at 50% 60%, #050816 0%, #000003 70%)',
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 0], fov: 65, near: 0.1, far: 2000 }}
          dpr={dprMax}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            // stencil isn't used — disabling shrinks the framebuffer.
            stencil: false,
            // depth not needed (depthTest is off in our material).
            depth: false,
          }}
          className='block h-full w-full'
          // Internal frameloop kept "always" since we DO want continuous
          // animation (twinkle, drift). Pause comes from visibility ref
          // inside useFrame instead — same outcome, simpler.
          frameloop='always'
        > */}
      <AdaptiveDPR min={dprMin} max={dprMax} />
      <StarField
        scrollState={scrollState}
        bp={bp}
        reducedMotion={reducedMotion}
        visible={visible}
      />
      {/* </Canvas>
      </div>

      <ProbeMenu scrollState={scrollState} bp={bp} />

      {bp !== 'mobile' && (
        <div
          className='pointer-events-none fixed bottom-6 left-6 z-10 text-[10px] tracking-[0.3em] text-cyan-200/40'
          style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
        >
          ↓ SCROLL TO TRAVERSE
        </div>
      )} */}
    </>
  );
};
