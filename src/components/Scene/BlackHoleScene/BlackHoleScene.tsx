'use client';

/* ════════════════════════════════════════════════════════════════════
   BLACK HOLE GENESIS — R3F + Drei (single-file, TypeScript)

   Scroll-driven cinematic: dying star → collapse → supernova → singularity
   → planets devoured → camera pulled into horizon → tesseract / contact reveal.

   Every breakpoint, shader, uniform, and CSS detail from the vanilla
   Three.js version is preserved. Phase boundaries are exposed as a
   `breakpoints` prop so you can re-pace the entire arc without touching
   internals.

   Usage:
     import BlackHoleGenesis from './BlackHoleGenesis';

     <BlackHoleGenesis />                            // defaults
     <BlackHoleGenesis scrollLengthPx={3000} />      // longer scroll
     <BlackHoleGenesis breakpoints={{ supernova: [0.18, 0.26] }} />
     <BlackHoleGenesis contact={{ links: [...] }} />
   ════════════════════════════════════════════════════════════════════ */

import React, {
  createContext,
  MutableRefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useFBO } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ════════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════════ */

export type Range = [number, number];

export type PlanetHue = 'gas' | 'rocky' | 'rust' | 'ice' | 'ringed';

export interface PlanetSpec {
  /** Initial orbit radius in world units. */
  orbitRadius: number;
  /** Sphere geometry radius. */
  size: number;
  /** Hex color (e.g. 0x4880ff). */
  color: number;
  /** Hue family — passed to shader as a flag. */
  hue: PlanetHue;
  /** If true, adds a Saturn-style ring child mesh. */
  hasRing: boolean;
  /** Scroll progress at which spaghettification begins. */
  eatStart: number;
  /** Scroll progress at which the planet is fully consumed. */
  eatEnd: number;
  /** Initial orbit phase (radians) — controls starting position. */
  theta: number;
}

export interface ScrollBreakpoints {
  // ── Star phase ────────────────────────────────────────────────
  /** Window in which the star shrinks from full giant to pinpoint. */
  collapse: Range;
  /** Window in which the star wobbles axially. (Auto-fades after end.) */
  tremor: Range;
  /** Window in which the star ramps up brightness pre-supernova. */
  heat: Range;

  // ── Supernova ─────────────────────────────────────────────────
  /** Window in which the supernova shell expands and fades. */
  supernova: Range;

  // ── Black hole formation ──────────────────────────────────────
  /** Window in which the event horizon + accretion disk fade in. */
  bhFormation: Range;
  /** Additional growth multiplier as planets are eaten + camera approaches. */
  bhGrowth: Range;
  /** Final size multiplier applied across the bhGrowth range. */
  bhGrowthFactor: number;

  // ── Camera ────────────────────────────────────────────────────
  /** World-space Z keyframes for camera. */
  cameraZ: { far: number; mid: number; close: number; horizon: number };
  /** Far → mid */
  cameraApproach: Range;
  /** Mid → close */
  cameraSteady: Range;
  /** Close → horizon */
  cameraPullIn: Range;
  /** Window over which FOV widens for the "swallowed" feel. */
  cameraFovWiden: Range;
  cameraFov: { min: number; max: number };

  // ── Post-processing ───────────────────────────────────────────
  /** Window for the white flash on tesseract entry. */
  whiteFlash: Range;
  /** Window over which the photon ring brightens. */
  photonRingBoost: Range;

  // ── Tesseract ─────────────────────────────────────────────────
  /** Threshold at which the tesseract overlay fades in. */
  tesseractActive: number;

  // ── Planets ───────────────────────────────────────────────────
  /** Sequential consume specs. Order = visual order. */
  planets: PlanetSpec[];

  // ── HUD ───────────────────────────────────────────────────────
  labels: Array<{ range: Range; text: string }>;
}

export interface ContactInfo {
  eyebrow?: string;
  titleStart?: string;
  titleEm?: string;
  titleEnd?: string;
  subtitle?: string;
  links?: Array<{ label: string; href: string }>;
  coords?: string;
}

export interface BlackHoleGenesisProps {
  /** Effective scroll length in pixels. Default 2000. */
  scrollLengthPx?: number;
  /** Partial breakpoints — deep-merged with defaults. */
  breakpoints?: DeepPartial<ScrollBreakpoints>;
  /** Contact card content shown in the tesseract. */
  contact?: ContactInfo;
  /** Show the HUD overlay. Default true. */
  showHud?: boolean;
  /** Show the "Scroll ↓" hint. Default true. */
  showHint?: boolean;
  /** Title shown in the top-left HUD tag. Default 'Black Hole Genesis · Phase'. */
  hudTitle?: string;
  /** Optional className for the outer wrapper. */
  className?: string;
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/* ════════════════════════════════════════════════════════════════════
   DEFAULTS
   ════════════════════════════════════════════════════════════════════ */

export const defaultPlanets: PlanetSpec[] = [
  {
    orbitRadius: 86,
    size: 3.4,
    color: 0x4880ff,
    hue: 'gas',
    hasRing: false,
    eatStart: 0.45,
    eatEnd: 0.5,
    theta: 0.4,
  },
  {
    orbitRadius: 72,
    size: 2.0,
    color: 0x55aa55,
    hue: 'rocky',
    hasRing: false,
    eatStart: 0.48,
    eatEnd: 0.53,
    theta: 2.1,
  },
  {
    orbitRadius: 60,
    size: 2.4,
    color: 0xcc4030,
    hue: 'rust',
    hasRing: false,
    eatStart: 0.51,
    eatEnd: 0.56,
    theta: 3.7,
  },
  {
    orbitRadius: 48,
    size: 1.6,
    color: 0xd0e0ff,
    hue: 'ice',
    hasRing: false,
    eatStart: 0.54,
    eatEnd: 0.59,
    theta: 5.2,
  },
  {
    orbitRadius: 36,
    size: 2.6,
    color: 0xf0b070,
    hue: 'ringed',
    hasRing: true,
    eatStart: 0.57,
    eatEnd: 0.62,
    theta: 0.9,
  },
];

export const defaultBreakpoints: ScrollBreakpoints = {
  collapse: [0.1, 0.2],
  tremor: [0.06, 0.18],
  heat: [0.05, 0.2],
  supernova: [0.2, 0.3],
  bhFormation: [0.27, 0.4],
  bhGrowth: [0.45, 0.85],
  bhGrowthFactor: 4.5,

  cameraZ: { far: 200, mid: 80, close: 60, horizon: 6 },
  cameraApproach: [0.0, 0.3],
  cameraSteady: [0.3, 0.65],
  cameraPullIn: [0.65, 0.92],
  cameraFovWiden: [0.75, 0.95],
  cameraFov: { min: 55, max: 78 },

  whiteFlash: [0.88, 0.95],
  photonRingBoost: [0.7, 0.92],
  tesseractActive: 0.92,

  planets: defaultPlanets,

  labels: [
    { range: [0.0, 0.1], text: 'Dying Star' },
    { range: [0.1, 0.2], text: 'Gravitational Collapse' },
    { range: [0.2, 0.3], text: 'Supernova' },
    { range: [0.3, 0.45], text: 'Singularity Forms' },
    { range: [0.45, 0.65], text: 'Worlds Devoured' },
    { range: [0.65, 0.85], text: 'Spaghettification' },
    { range: [0.85, 0.92], text: 'Crossing the Horizon' },
    { range: [0.92, 1.01], text: '5th Dimension' },
  ],
};

export const defaultContact: ContactInfo = {
  eyebrow: 'Beyond the horizon',
  titleStart: 'You found ',
  titleEm: 'me',
  titleEnd: '.',
  subtitle: "Let's talk.",
  links: [
    { label: 'EMAIL · hello@sense.dev', href: 'mailto:hello@sense.dev' },
    { label: 'GITHUB · /sense', href: 'https://github.com/' },
    { label: 'LINKEDIN · /in/sense', href: 'https://linkedin.com/' },
  ],
  coords: '5D · LAT 0.0000 · LON 0.0000 · T+∞',
};

function mergeBreakpoints(user?: DeepPartial<ScrollBreakpoints>): ScrollBreakpoints {
  if (!user) return defaultBreakpoints;
  return {
    ...defaultBreakpoints,
    ...user,
    cameraZ: { ...defaultBreakpoints.cameraZ, ...(user.cameraZ as object) },
    cameraFov: { ...defaultBreakpoints.cameraFov, ...(user.cameraFov as object) },
    planets: (user.planets as PlanetSpec[] | undefined) ?? defaultBreakpoints.planets,
    labels:
      (user.labels as ScrollBreakpoints['labels'] | undefined) ??
      defaultBreakpoints.labels,
  } as ScrollBreakpoints;
}

/* ════════════════════════════════════════════════════════════════════
   SHARED GLSL: simplex 3D noise (Ashima)
   ════════════════════════════════════════════════════════════════════ */

const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
       i.z+vec4(0.0,i1.z,i2.z,1.0))
     + i.y+vec4(0.0,i1.y,i2.y,1.0))
     + i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* ════════════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════════════ */

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function smoothstep(a: number, b: number, t: number) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

/* ════════════════════════════════════════════════════════════════════
   CONTEXT
   ════════════════════════════════════════════════════════════════════ */

interface SceneCtx {
  scrollRef: MutableRefObject<number>;
  bhSizeRef: MutableRefObject<number>;
  breakpoints: ScrollBreakpoints;
}
const SceneContext = createContext<SceneCtx | null>(null);
const useSceneCtx = () => {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('SceneContext not found');
  return ctx;
};

/* ════════════════════════════════════════════════════════════════════
   HOOKS
   ════════════════════════════════════════════════════════════════════ */

function useScrollProgress(scrollLengthPx: number) {
  const ref = useRef(0);
  useEffect(() => {
    const update = () => {
      ref.current = clamp(window.scrollY / scrollLengthPx, 0, 1);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollLengthPx]);
  return ref;
}

function useGlobalStyles() {
  useLayoutEffect(() => {
    const id = 'bh-genesis-styles';
    if (typeof document === 'undefined') return;
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
  }, []);
}

/* ════════════════════════════════════════════════════════════════════
   STARFIELD — 5000 points, custom shader, slow drift
   ════════════════════════════════════════════════════════════════════ */

const STAR_COUNT = 5000;

function Starfield() {
  const pointsRef = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const { gl } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const sze = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 500 + Math.random() * 600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const t = Math.random();
      if (t < 0.1) {
        col[i * 3] = 1.0;
        col[i * 3 + 1] = 0.8;
        col[i * 3 + 2] = 0.6;
      } else if (t < 0.25) {
        col[i * 3] = 0.7;
        col[i * 3 + 1] = 0.85;
        col[i * 3 + 2] = 1.0;
      } else {
        col[i * 3] = 1.0;
        col[i * 3 + 1] = 1.0;
        col[i * 3 + 2] = 1.0;
      }
      sze[i] = 0.5 + Math.random() * 1.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sze, 1));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: gl.getPixelRatio() },
    }),
    [gl],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.005;
      pointsRef.current.rotation.x = state.clock.elapsedTime * 0.003;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={
          /* glsl */ `
          attribute float aSize;
          attribute vec3 color;
          varying vec3 vColor;
          uniform float uTime;
          uniform float uPixelRatio;
          void main(){
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
          }`
        }
        fragmentShader={
          /* glsl */ `
          varying vec3 vColor;
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d);
            a *= a;
            gl_FragColor = vec4(vColor * a * 1.4, a);
          }`
        }
      />
    </points>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DYING STAR — sphere with noise displacement + halo
   ════════════════════════════════════════════════════════════════════ */

function DyingStar() {
  const { scrollRef, breakpoints: bp } = useSceneCtx();
  const bodyRef = useRef<THREE.Mesh>(null!);
  const haloRef = useRef<THREE.Mesh>(null!);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCollapse: { value: 0 },
      uTremor: { value: 0 },
      uHeat: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    const sp = scrollRef.current;
    const t = state.clock.elapsedTime;

    const collapse = smoothstep(bp.collapse[0], bp.collapse[1], sp);
    const tremorIn = smoothstep(bp.tremor[0], bp.tremor[1], sp);
    const tremorOut = 1 - smoothstep(bp.tremor[1], bp.tremor[1] + 0.03, sp);
    const tremor = tremorIn * tremorOut;
    const heat = smoothstep(bp.heat[0], bp.heat[1], sp);

    uniforms.uTime.value = t;
    uniforms.uCollapse.value = collapse;
    uniforms.uTremor.value = tremor;
    uniforms.uHeat.value = heat;

    const scale = lerp(1.0, 0.05, collapse);
    bodyRef.current.scale.setScalar(scale);
    haloRef.current.scale.setScalar(scale);

    // hide once supernova has begun (matches original sp < 0.21 cutoff,
    // but we use the configured supernova start + epsilon instead)
    const visible = sp < bp.supernova[0] + 0.01;
    bodyRef.current.visible = visible;
    haloRef.current.visible = visible;
  });

  return (
    <>
      {/* Star body */}
      <mesh ref={bodyRef} position={[0, 0, 0]}>
        <sphereGeometry args={[8, 96, 96]} />
        <shaderMaterial
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          vertexShader={
            /* glsl */ `
            ${SNOISE}
            uniform float uTime;
            uniform float uTremor;
            varying vec3 vWorldPos;
            varying float vNoise;
            void main(){
              float n = snoise(position * 1.6 + uTime * 0.4);
              n += snoise(position * 4.0 + uTime * 0.8) * 0.4;
              vNoise = n;
              vec3 p = position + normal * n * (0.18 + uTremor * 0.6);
              p.x += sin(uTime * 60.0) * uTremor * 0.4;
              p.y += cos(uTime * 55.0) * uTremor * 0.4;
              vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`
          }
          fragmentShader={
            /* glsl */ `
            uniform float uTime;
            uniform float uCollapse;
            uniform float uHeat;
            varying float vNoise;
            void main(){
              vec3 cool = vec3(1.0, 0.18, 0.04);
              vec3 mid  = vec3(1.0, 0.55, 0.12);
              vec3 hot  = vec3(1.0, 0.95, 0.7);
              vec3 col = mix(cool, mid, smoothstep(-0.4, 0.4, vNoise));
              col = mix(col, hot, smoothstep(0.4, 1.2, vNoise + uHeat * 1.5));
              col *= 1.0 + 0.18 * sin(uTime * 1.6);
              col *= 1.0 + uHeat * 6.0;
              float alpha = 1.0 - uCollapse * 0.85;
              gl_FragColor = vec4(col, alpha);
            }`
          }
        />
      </mesh>
      {/* Outer halo (BackSide fresnel) */}
      <mesh ref={haloRef} position={[0, 0, 0]}>
        <sphereGeometry args={[13, 64, 64]} />
        <shaderMaterial
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
          vertexShader={
            /* glsl */ `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main(){
              vNormal = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vViewDir = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }`
          }
          fragmentShader={
            /* glsl */ `
            uniform float uHeat;
            uniform float uCollapse;
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main(){
              float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.2);
              vec3 col = mix(vec3(1.0, 0.3, 0.08), vec3(1.0, 0.85, 0.5), uHeat);
              float a = fres * (0.6 + uHeat * 1.5) * (1.0 - uCollapse);
              gl_FragColor = vec4(col * (1.5 + uHeat * 4.0), a);
            }`
          }
        />
      </mesh>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SUPERNOVA — expanding turbulent shell
   ════════════════════════════════════════════════════════════════════ */

function Supernova() {
  const { scrollRef, breakpoints: bp } = useSceneCtx();
  const meshRef = useRef<THREE.Mesh>(null!);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    const sp = scrollRef.current;
    const novaP = smoothstep(bp.supernova[0], bp.supernova[1], sp);
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uProgress.value = novaP;
    meshRef.current.visible = novaP > 0 && novaP < 1;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexShader={
          /* glsl */ `
          ${SNOISE}
          uniform float uProgress;
          uniform float uTime;
          varying float vNoise;
          void main(){
            float n = snoise(position * 0.6 + uTime * 0.2);
            vNoise = n;
            float scale = mix(1.0, 80.0, smoothstep(0.0, 1.0, uProgress));
            vec3 p = position * scale;
            p += normal * n * scale * 0.18;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`
        }
        fragmentShader={
          /* glsl */ `
          uniform float uProgress;
          varying float vNoise;
          void main(){
            vec3 col = mix(vec3(1.6, 1.4, 1.2), vec3(1.0, 0.4, 0.15), smoothstep(0.0, 0.6, uProgress));
            col = mix(col, vec3(0.6, 0.15, 0.3), smoothstep(0.6, 1.0, uProgress));
            col *= 1.2 + vNoise * 0.6;
            float a = smoothstep(0.0, 0.05, uProgress) * (1.0 - smoothstep(0.5, 1.0, uProgress));
            gl_FragColor = vec4(col, a * 0.9);
          }`
        }
      />
    </mesh>
  );
}

/* ════════════════════════════════════════════════════════════════════
   EVENT HORIZON — solid black sphere, drives bhSizeRef
   ════════════════════════════════════════════════════════════════════ */

function EventHorizon() {
  const { scrollRef, bhSizeRef, breakpoints: bp } = useSceneCtx();
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const sp = scrollRef.current;
    const formation = smoothstep(bp.bhFormation[0], bp.bhFormation[1], sp);
    const growth = smoothstep(bp.bhGrowth[0], bp.bhGrowth[1], sp);
    const size = lerp(0, 1, formation) * lerp(1, bp.bhGrowthFactor, growth);
    bhSizeRef.current = size;
    meshRef.current.scale.setScalar(size);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial color={0x000000} />
    </mesh>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACCRETION DISK — tilted ring with Keplerian rotation + doppler beam
   ════════════════════════════════════════════════════════════════════ */

function AccretionDisk() {
  const { scrollRef, bhSizeRef, breakpoints: bp } = useSceneCtx();
  const meshRef = useRef<THREE.Mesh>(null!);

  const geometry = useMemo(() => {
    const geo = new THREE.RingGeometry(0.32, 1.0, 256, 1);
    // Custom radial UVs: u = angle [0,1], v = normalized radius
    const pos = geo.attributes.position.array as Float32Array;
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3],
        y = pos[i * 3 + 1];
      const r = Math.sqrt(x * x + y * y);
      const a = Math.atan2(y, x);
      uv[i * 2] = (a / Math.PI + 1) * 0.5;
      uv[i * 2 + 1] = (r - 0.32) / (1.0 - 0.32);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    const sp = scrollRef.current;
    const formation = smoothstep(bp.bhFormation[0], bp.bhFormation[1], sp);
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uProgress.value = formation;
    meshRef.current.scale.setScalar(bhSizeRef.current * 7.5);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation={[-Math.PI / 2 + 0.18, 0, 0]}
      scale={0}
    >
      <shaderMaterial
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        vertexShader={
          /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          void main(){
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`
        }
        fragmentShader={
          /* glsl */ `
          ${SNOISE}
          uniform float uTime;
          uniform float uProgress;
          varying vec2 vUv;
          varying vec3 vWorldPos;
          void main(){
            float r = vUv.y;
            float angle = vUv.x * 6.28318;
            float omega = 1.0 / max(r * r, 0.05);
            float streakAngle = angle - uTime * omega * 0.04;
            vec3 noisePos = vec3(cos(streakAngle), sin(streakAngle), r * 4.0) * 2.5;
            float n = snoise(noisePos + vec3(0.0, 0.0, uTime * 0.3));
            n = n * 0.5 + 0.5;
            float bands = 0.5 + 0.5 * sin(streakAngle * 18.0 + n * 4.0);
            bands = pow(bands, 3.0);
            vec3 inner = vec3(1.6, 1.5, 1.2);
            vec3 mid   = vec3(1.4, 0.7, 0.2);
            vec3 outer = vec3(0.9, 0.18, 0.05);
            vec3 col = mix(inner, mid, smoothstep(0.0, 0.45, r));
            col = mix(col, outer, smoothstep(0.45, 1.0, r));
            col *= (0.4 + bands * 0.7) * (0.8 + n * 0.6);
            float doppler = 1.0 + 1.4 * smoothstep(-0.2, 1.0, cos(angle));
            col *= doppler;
            float edgeIn  = smoothstep(0.0,  0.06, r);
            float edgeOut = 1.0 - smoothstep(0.85, 1.0, r);
            float alpha = edgeIn * edgeOut * uProgress;
            col *= 1.2 * uProgress;
            gl_FragColor = vec4(col, alpha);
          }`
        }
      />
    </mesh>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PLANETS — 5 (or N) bodies orbiting then spaghettified into the BH
   ════════════════════════════════════════════════════════════════════ */

function PlanetItem({ spec, index }: { spec: PlanetSpec; index: number }) {
  const { scrollRef } = useSceneCtx();
  const groupRef = useRef<THREE.Group>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);

  const tilts = useMemo(
    () => ({
      x: Math.sin(index * 12.9898) * 0.5 * 0.4 - 0.2,
      z: Math.cos(index * 78.233) * 0.5 * 0.6 - 0.3,
    }),
    [index],
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(spec.color) },
      uHue: { value: ['gas', 'rocky', 'rust', 'ice', 'ringed'].indexOf(spec.hue) },
      uEat: { value: 0 },
    }),
    [spec.color, spec.hue],
  );

  useFrame((state) => {
    const sp = scrollRef.current;
    const t = state.clock.elapsedTime;
    const pp = smoothstep(spec.eatStart, spec.eatEnd, sp);
    const orbitSpeed = 0.05 + pp * 0.4;

    groupRef.current.rotation.y += orbitSpeed * 0.012;
    meshRef.current.position.x = lerp(spec.orbitRadius, 0, pp);
    const sc = lerp(1.0, 0.05, pp);
    meshRef.current.scale.setScalar(sc);
    uniforms.uTime.value = t;
    uniforms.uEat.value = pp;
    meshRef.current.visible = pp < 0.999;
  });

  return (
    <group ref={groupRef} rotation={[tilts.x, spec.theta, tilts.z]}>
      <mesh ref={meshRef} position={[spec.orbitRadius, 0, 0]}>
        <sphereGeometry args={[spec.size, 32, 32]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={
            /* glsl */ `
            uniform float uEat;
            varying vec3 vNormal;
            varying vec3 vPos;
            varying vec3 vViewDir;
            void main(){
              vNormal = normalize(normalMatrix * normal);
              vec3 p = position;
              p.z *= 1.0 + uEat * 5.0;
              p.x *= 1.0 - uEat * 0.4;
              p.y *= 1.0 - uEat * 0.4;
              vPos = p;
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              vViewDir = normalize(-mv.xyz);
              gl_Position = projectionMatrix * mv;
            }`
          }
          fragmentShader={
            /* glsl */ `
            ${SNOISE}
            uniform vec3 uColor;
            uniform float uHue;
            uniform float uTime;
            uniform float uEat;
            varying vec3 vNormal;
            varying vec3 vPos;
            varying vec3 vViewDir;
            void main(){
              vec3 lightDir = normalize(-vPos);
              float diff = max(dot(vNormal, lightDir), 0.0);
              float n = snoise(vPos * 0.8 + uTime * 0.05);
              n += snoise(vPos * 3.0) * 0.4;
              vec3 col = uColor * (0.4 + 0.6 * (n * 0.3 + 0.7));
              col *= (0.18 + diff * 0.95);
              float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
              col += vec3(1.0, 0.5, 0.15) * fres * uEat * 2.5;
              gl_FragColor = vec4(col, 1.0);
            }`
          }
        />
        {spec.hasRing && (
          <mesh rotation={[Math.PI / 2 - 0.4, 0, 0]}>
            <ringGeometry args={[spec.size * 1.4, spec.size * 2.2, 64, 1]} />
            <meshBasicMaterial
              color={0xeec888}
              transparent
              opacity={0.45}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}
      </mesh>
    </group>
  );
}

function Planets() {
  const { breakpoints: bp } = useSceneCtx();
  return (
    <>
      {bp.planets.map((p, i) => (
        <PlanetItem key={i} spec={p} index={i} />
      ))}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CAMERA RIG — keyframes z + drift + FOV widen
   ════════════════════════════════════════════════════════════════════ */

function CameraRig() {
  const { scrollRef, breakpoints: bp } = useSceneCtx();
  const { camera, size } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = bp.cameraFov.min;
      camera.near = 0.05;
      camera.far = 2000;
      camera.aspect = size.width / size.height;
      camera.position.set(0, 2, bp.cameraZ.far);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera, bp.cameraFov.min, bp.cameraZ.far, size.width, size.height]);

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const sp = scrollRef.current;

    let camZ: number;
    if (sp < bp.cameraApproach[1]) {
      camZ = lerp(
        bp.cameraZ.far,
        bp.cameraZ.mid,
        smoothstep(bp.cameraApproach[0], bp.cameraApproach[1], sp),
      );
    } else if (sp < bp.cameraSteady[1]) {
      camZ = lerp(
        bp.cameraZ.mid,
        bp.cameraZ.close,
        smoothstep(bp.cameraSteady[0], bp.cameraSteady[1], sp),
      );
    } else if (sp < bp.cameraPullIn[1]) {
      camZ = lerp(
        bp.cameraZ.close,
        bp.cameraZ.horizon,
        smoothstep(bp.cameraPullIn[0], bp.cameraPullIn[1], sp),
      );
    } else {
      camZ = bp.cameraZ.horizon;
    }

    const drift = Math.sin(sp * Math.PI * 1.2) * 4 * (1 - smoothstep(0.7, 0.9, sp));
    camera.position.set(drift * 0.5, drift, camZ);
    camera.lookAt(0, 0, 0);

    const targetFov = lerp(
      bp.cameraFov.min,
      bp.cameraFov.max,
      smoothstep(bp.cameraFovWiden[0], bp.cameraFovWiden[1], sp),
    );
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/* ════════════════════════════════════════════════════════════════════
   POST-PROCESSOR — gravitational lensing + photon ring + flash
   Renders the scene to an FBO, then draws a fullscreen quad with the
   lensing fragment shader. Priority 1 disables R3F's auto-render.
   ════════════════════════════════════════════════════════════════════ */

function PostProcessor() {
  const { scrollRef, bhSizeRef, breakpoints: bp } = useSceneCtx();
  const { gl, scene, camera, size } = useThree();
  const fbo = useFBO({ type: THREE.HalfFloatType });

  const postScene = useMemo(() => new THREE.Scene(), []);
  const postCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  const uniforms = useMemo(
    () => ({
      tScene: { value: fbo.texture },
      uBHScreen: { value: new THREE.Vector2(0.5, 0.5) },
      uBHRadius: { value: 0 },
      uBHActive: { value: 0 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uPostFlash: { value: 0 },
      uPhotonRingBoost: { value: 0 },
    }),
    [fbo.texture, size.width, size.height],
  );

  // Build the fullscreen quad once
  useEffect(() => {
    const quadMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform vec2 uBHScreen;
        uniform float uBHRadius;
        uniform float uBHActive;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uPostFlash;
        uniform float uPhotonRingBoost;
        varying vec2 vUv;

        void main(){
          vec2 uv = vUv;
          float aspect = uResolution.x / uResolution.y;

          // ── gravitational lensing distortion ──
          if (uBHActive > 0.001 && uBHRadius > 0.0001) {
            vec2 d = uv - uBHScreen;
            d.x *= aspect;
            float r = max(length(d), 0.0001);
            float defl = (uBHRadius * uBHRadius * 1.2) / (r * r) * uBHActive;
            defl = defl * (1.0 - exp(-r * 8.0));
            defl = min(defl, r * 0.92);
            vec2 dirN = d / r;
            dirN.x /= aspect;
            uv = uv - dirN * defl;
          }

          vec3 col = texture2D(tScene, clamp(uv, vec2(0.0), vec2(1.0))).rgb;

          // ── photon ring + event horizon overlay ──
          if (uBHActive > 0.001) {
            vec2 d2 = vUv - uBHScreen;
            d2.x *= aspect;
            float r2 = length(d2);
            float horizon  = uBHRadius * 0.74;
            float photon   = uBHRadius * 0.92;
            float ringW    = uBHRadius * 0.05;

            float ring = exp(-pow((r2 - photon) / ringW, 2.0));
            col += vec3(1.0, 0.65, 0.3) * ring * (1.6 + uPhotonRingBoost * 4.0) * uBHActive;

            float horizonMask = 1.0 - smoothstep(horizon - uBHRadius * 0.04, horizon, r2);
            col = mix(col, vec3(0.0), horizonMask * uBHActive);

            float vig = 1.0 - exp(-r2 * 1.2);
            col *= mix(1.0, vig * 1.05, uBHActive * 0.35);
          }

          // global vignette
          vec2 vc = vUv - 0.5; vc.x *= aspect;
          float gvig = 1.0 - smoothstep(0.55, 1.1, length(vc));
          col *= mix(1.0, gvig, 0.45);

          // white flash
          col = mix(col, vec3(1.0), uPostFlash);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
    postScene.add(quad);
    return () => {
      postScene.remove(quad);
      quad.geometry.dispose();
      quadMat.dispose();
    };
  }, [postScene, uniforms]);

  // Resize uniform when canvas size changes
  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [size.width, size.height, uniforms]);

  // Project BH world position to screen each frame, then render
  useFrame((state) => {
    const sp = scrollRef.current;
    const t = state.clock.elapsedTime;

    const formation = smoothstep(bp.bhFormation[0], bp.bhFormation[1], sp);
    const photon = smoothstep(bp.photonRingBoost[0], bp.photonRingBoost[1], sp);
    const flash = smoothstep(bp.whiteFlash[0], bp.whiteFlash[1], sp);

    // Project (0,0,0) — the BH center — to NDC, convert to UV
    const v = new THREE.Vector3(0, 0, 0).project(camera);
    uniforms.uBHScreen.value.set((v.x + 1) * 0.5, (v.y + 1) * 0.5);

    // Apparent radius in screen-Y units
    const distToBH = camera.position.length();
    if (camera instanceof THREE.PerspectiveCamera) {
      const yFovHalf = THREE.MathUtils.degToRad(camera.fov) * 0.5;
      const apparentR =
        ((bhSizeRef.current * 1.1) / Math.max(distToBH, 1) / Math.tan(yFovHalf)) * 0.5;
      uniforms.uBHRadius.value = clamp(apparentR, 0, 1.4);
    }

    uniforms.uBHActive.value = formation;
    uniforms.uPhotonRingBoost.value = photon;
    uniforms.uPostFlash.value = flash;
    uniforms.uTime.value = t;

    // Render scene → FBO → screen
    gl.setRenderTarget(fbo);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(postScene, postCamera);
  }, 1); // priority 1 = override default auto-render

  return null;
}

/* ════════════════════════════════════════════════════════════════════
   SCENE — composes all 3D children inside a single SceneContext
   ════════════════════════════════════════════════════════════════════ */

interface SceneProps {
  scrollRef: MutableRefObject<number>;
  bhSizeRef: MutableRefObject<number>;
  breakpoints: ScrollBreakpoints;
}

function Scene({ scrollRef, bhSizeRef, breakpoints }: SceneProps) {
  const ctx = useMemo(
    () => ({ scrollRef, bhSizeRef, breakpoints }),
    [scrollRef, bhSizeRef, breakpoints],
  );
  return (
    <SceneContext.Provider value={ctx}>
      <CameraRig />
      <Starfield />
      <DyingStar />
      <Supernova />
      <EventHorizon />
      <AccretionDisk />
      <Planets />
      <PostProcessor />
    </SceneContext.Provider>
  );
}

/* ════════════════════════════════════════════════════════════════════
   HUD — fixed overlay (label + progress + hint), DOM-only RAF updates
   ════════════════════════════════════════════════════════════════════ */

interface HUDProps {
  scrollRef: MutableRefObject<number>;
  breakpoints: ScrollBreakpoints;
  showHint: boolean;
  hudTitle: string;
}

function HUD({ scrollRef, breakpoints, showHint, hudTitle }: HUDProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastIdx = useRef(-1);

  useEffect(() => {
    let raf = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const sp = scrollRef.current;
      if (progressRef.current) {
        progressRef.current.textContent =
          (sp * 100).toFixed(1).padStart(4, '0') + ' / 100.0';
      }
      const idx = breakpoints.labels.findIndex(
        (l) => sp >= l.range[0] && sp < l.range[1],
      );
      if (idx !== -1 && idx !== lastIdx.current && labelRef.current) {
        lastIdx.current = idx;
        labelRef.current.style.opacity = '0';
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          if (labelRef.current) {
            labelRef.current.textContent = breakpoints.labels[idx].text;
            labelRef.current.style.opacity = '1';
          }
        }, 220);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [breakpoints.labels, scrollRef]);

  return (
    <div className='bh-ui'>
      <div className='bh-hud-tag'>{hudTitle}</div>
      <div className='bh-hud-progress' ref={progressRef}>
        00.0 / 100.0
      </div>
      <div className='bh-label' ref={labelRef}>
        {breakpoints.labels[0]?.text ?? ''}
      </div>
      {showHint && <div className='bh-hint'>Scroll ↓</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TESSERACT — CSS finale, fades in past threshold
   ════════════════════════════════════════════════════════════════════ */

interface TesseractProps {
  scrollRef: MutableRefObject<number>;
  threshold: number;
  contact: ContactInfo;
}

function Tesseract({ scrollRef, threshold, contact }: TesseractProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const isActive = useRef(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const active = scrollRef.current > threshold;
      if (active !== isActive.current && wrapRef.current) {
        isActive.current = active;
        wrapRef.current.classList.toggle('active', active);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [threshold, scrollRef]);

  return (
    <div className='bh-tesseract' ref={wrapRef}>
      <div className='bh-tess-grid' />
      <div className='bh-tess-grid bottom' />
      <div className='bh-tess-vlines' />
      <div className='bh-contact'>
        {contact.eyebrow && <div className='bh-contact-eyebrow'>{contact.eyebrow}</div>}
        <h1 className='bh-contact-title'>
          {contact.titleStart}
          {contact.titleEm && <em>{contact.titleEm}</em>}
          {contact.titleEnd}
          {contact.subtitle && (
            <>
              <br />
              {contact.subtitle}
            </>
          )}
        </h1>
        {contact.links && contact.links.length > 0 && (
          <div className='bh-contact-lines'>
            {contact.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel={l.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
        {contact.coords && <div className='bh-contact-coords'>{contact.coords}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   GLOBAL STYLES — exact port of the original CSS (prefixed with .bh-)
   ════════════════════════════════════════════════════════════════════ */

const GLOBAL_STYLES = `
  .bh-root, .bh-root * { box-sizing: border-box; }
  .bh-canvas {
    position: fixed;
    top: 0; left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1;
    display: block;
  }
  .bh-canvas canvas { display: block; }

  .bh-ui {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    font-family: 'JetBrains Mono', 'SF Mono', 'Courier New', monospace;
    color: #fff;
  }
  .bh-hud-tag {
    position: absolute;
    top: 28px; left: 28px;
    font-size: 10px;
    letter-spacing: 5px;
    color: rgba(220, 220, 220, 0.45);
    text-transform: uppercase;
    font-weight: 500;
  }
  .bh-hud-tag::before {
    content: '';
    display: inline-block;
    width: 6px; height: 6px;
    background: #ff5028;
    margin-right: 10px;
    transform: translateY(-1px);
    box-shadow: 0 0 8px #ff5028;
    animation: bh-pulse 1.6s ease-in-out infinite;
  }
  @keyframes bh-pulse {
    0%, 100% { opacity: 0.5; transform: translateY(-1px) scale(0.9); }
    50%      { opacity: 1;   transform: translateY(-1px) scale(1.2); }
  }
  .bh-hud-progress {
    position: absolute;
    top: 28px; right: 28px;
    font-size: 10px;
    letter-spacing: 4px;
    color: rgba(220, 220, 220, 0.45);
    text-transform: uppercase;
    font-variant-numeric: tabular-nums;
  }
  .bh-label {
    position: absolute;
    bottom: 64px; left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    letter-spacing: 10px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    text-align: center;
    white-space: nowrap;
    transition: opacity 0.6s ease;
  }
  .bh-hint {
    position: absolute;
    bottom: 28px; left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    letter-spacing: 6px;
    color: rgba(220, 220, 220, 0.35);
    text-transform: uppercase;
    animation: bh-hintBob 2.2s ease-in-out infinite;
  }
  @keyframes bh-hintBob {
    0%, 100% { transform: translateX(-50%) translateY(0); opacity: 0.35; }
    50%      { transform: translateX(-50%) translateY(4px); opacity: 0.7; }
  }

  .bh-tesseract {
    position: fixed;
    inset: 0;
    background: #f6f4ef;
    opacity: 0;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
    transition: opacity 1.6s cubic-bezier(.5, 0, .2, 1);
  }
  .bh-tesseract.active { opacity: 1; pointer-events: auto; }
  .bh-tess-grid {
    position: absolute;
    inset: -10%;
    background-image:
      linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px);
    background-size: 80px 80px;
    transform: perspective(800px) rotateX(60deg) translateY(-15%);
    transform-origin: center top;
    -webkit-mask-image: radial-gradient(ellipse at center top, black 30%, transparent 75%);
            mask-image: radial-gradient(ellipse at center top, black 30%, transparent 75%);
  }
  .bh-tess-grid.bottom {
    transform: perspective(800px) rotateX(-60deg) translateY(15%);
    transform-origin: center bottom;
    -webkit-mask-image: radial-gradient(ellipse at center bottom, black 30%, transparent 75%);
            mask-image: radial-gradient(ellipse at center bottom, black 30%, transparent 75%);
  }
  .bh-tess-vlines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(90deg, transparent 0, transparent calc(50% - 0.5px), rgba(0,0,0,0.08) calc(50% - 0.5px), rgba(0,0,0,0.08) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
      repeating-linear-gradient(90deg, transparent 0, transparent 14.28%, rgba(0,0,0,0.04) 14.28%, rgba(0,0,0,0.04) calc(14.28% + 1px));
    pointer-events: none;
  }
  .bh-contact {
    position: relative;
    z-index: 2;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    padding: 40px;
    transform: translateY(20px);
    opacity: 0;
    transition: all 1.4s cubic-bezier(.5, 0, .2, 1) 0.5s;
  }
  .bh-tesseract.active .bh-contact { transform: translateY(0); opacity: 1; }
  .bh-contact-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 8px;
    color: #888;
    text-transform: uppercase;
  }
  .bh-contact-title {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: clamp(1.8rem, 5.5vw, 3.6rem);
    font-weight: 200;
    color: #1a1a1a;
    letter-spacing: -0.01em;
    text-align: center;
    line-height: 1.05;
    max-width: 14ch;
    margin: 0;
  }
  .bh-contact-title em {
    font-style: italic;
    font-weight: 300;
    color: #ff5028;
  }
  .bh-contact-lines {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    margin-top: 8px;
  }
  .bh-contact-lines a {
    color: #1a1a1a;
    text-decoration: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: clamp(0.78rem, 1.3vw, 0.92rem);
    letter-spacing: 0.32em;
    padding: 10px 28px;
    border: 1px solid rgba(0,0,0,0.18);
    text-transform: uppercase;
    transition: all 0.3s cubic-bezier(.5, 0, .2, 1);
    background: rgba(255,255,255,0.4);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .bh-contact-lines a:hover {
    background: #1a1a1a;
    color: #f6f4ef;
    letter-spacing: 0.4em;
    border-color: #1a1a1a;
  }
  .bh-contact-coords {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 3px;
    color: #aaa;
    text-transform: uppercase;
    margin-top: 24px;
  }
`;

/* ════════════════════════════════════════════════════════════════════
   MAIN — BlackHoleScene
   ════════════════════════════════════════════════════════════════════ */

export const BlackHoleScene = ({
  scrollLengthPx = 2000,
  breakpoints: bpProp,
  contact: contactProp,
  showHud = true,
  showHint = true,
  hudTitle = 'Black Hole Genesis · Phase',
  className,
}: BlackHoleGenesisProps) => {
  useGlobalStyles();

  const breakpoints = useMemo(() => mergeBreakpoints(bpProp), [bpProp]);
  const contact = useMemo(() => ({ ...defaultContact, ...contactProp }), [contactProp]);

  const scrollRef = useScrollProgress(scrollLengthPx);
  const bhSizeRef = useRef(0);

  return (
    <div
      className={`bh-root ${className ?? ''}`}
      style={{ minHeight: `calc(100vh + ${scrollLengthPx}px)`, position: 'relative' }}
    >
      <div className='bh-canvas'>
        <Canvas
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
          camera={{
            fov: breakpoints.cameraFov.min,
            near: 0.05,
            far: 2000,
            position: [0, 2, breakpoints.cameraZ.far],
          }}
          onCreated={({ gl, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.0;
            scene.background = new THREE.Color(0x000004);
          }}
        >
          <Scene scrollRef={scrollRef} bhSizeRef={bhSizeRef} breakpoints={breakpoints} />
        </Canvas>
      </div>

      {showHud && (
        <HUD
          scrollRef={scrollRef}
          breakpoints={breakpoints}
          showHint={showHint}
          hudTitle={hudTitle}
        />
      )}

      <Tesseract
        scrollRef={scrollRef}
        threshold={breakpoints.tesseractActive}
        contact={contact}
      />
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   USAGE EXAMPLES
   ────────────────────────────────────────────────────────────────────

   // 1. Drop-in defaults
   <BlackHoleGenesis />

   // 2. Stretch the arc to 3500px
   <BlackHoleGenesis scrollLengthPx={3500} />

   // 3. Re-pace the supernova later, drop one planet, custom contact
   <BlackHoleGenesis
     breakpoints={{
       supernova:    [0.22, 0.32],
       bhFormation:  [0.30, 0.45],
       cameraFov:    { min: 50, max: 85 },
       planets: [
         { orbitRadius: 80, size: 3, color: 0x4080ff, hue: 'gas',
           hasRing: false, eatStart: 0.46, eatEnd: 0.52, theta: 0 },
         { orbitRadius: 50, size: 2, color: 0xffaa70, hue: 'ringed',
           hasRing: true,  eatStart: 0.55, eatEnd: 0.62, theta: 2 },
       ],
     }}
     contact={{
       eyebrow: 'Reach me',
       titleStart: 'Past the ',
       titleEm: 'horizon',
       titleEnd: '.',
       subtitle: 'Drop a line.',
       links: [
         { label: 'EMAIL · sense@example.com', href: 'mailto:sense@example.com' },
         { label: 'TWITTER · @sense',          href: 'https://twitter.com/' },
       ],
     }}
   />

   ════════════════════════════════════════════════════════════════════ */
