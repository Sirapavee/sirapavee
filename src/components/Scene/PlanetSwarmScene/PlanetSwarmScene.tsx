import {
  type FC,
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

// ─────────────────────────────────────────────────────────────
// BREAKPOINTS & RESPONSIVE CONFIG
// ─────────────────────────────────────────────────────────────
const BREAKPOINTS = {
  'sm': 361,
  'md': 769,
  'lg': 1025,
  'xl': 1281,
  '2xl': 1445,
} as const;
type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

function getBreakpoint(w: number): Breakpoint {
  if (w < BREAKPOINTS.md) return 'sm';
  if (w < BREAKPOINTS.lg) return 'md';
  if (w < BREAKPOINTS.xl) return 'lg';
  if (w < BREAKPOINTS['2xl']) return 'xl';
  return '2xl';
}

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'lg',
  );
  useEffect(() => {
    const onResize = () => setBp(getBreakpoint(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bp;
}

interface ResponsiveConfig {
  holdXScale: number; // 0 = centered, 1 = full offset
  holdYOffset: number; // Y shift: negative = planet lower on screen
  radiusScale: number; // planet size multiplier
  trajScale: number; // spiral/curve amplitude
  cameraZ: number;
  fov: number;
  panelMode: 'side' | 'top';
  dwarfSpread: number;
  starCount: number;
}

const RESP: Record<Breakpoint, ResponsiveConfig> = {
  'sm': {
    holdXScale: 0,
    holdYOffset: -1.8,
    radiusScale: 0.65,
    trajScale: 0.45,
    cameraZ: 14,
    fov: 65,
    panelMode: 'top',
    dwarfSpread: 0.5,
    starCount: 3000,
  },
  'md': {
    holdXScale: 0,
    holdYOffset: -1.5,
    radiusScale: 0.8,
    trajScale: 0.6,
    cameraZ: 12,
    fov: 62,
    panelMode: 'top',
    dwarfSpread: 0.65,
    starCount: 4000,
  },
  'lg': {
    holdXScale: 0.8,
    holdYOffset: 0,
    radiusScale: 0.92,
    trajScale: 0.85,
    cameraZ: 10,
    fov: 60,
    panelMode: 'side',
    dwarfSpread: 0.85,
    starCount: 5000,
  },
  'xl': {
    holdXScale: 1,
    holdYOffset: 0,
    radiusScale: 1,
    trajScale: 1,
    cameraZ: 10,
    fov: 60,
    panelMode: 'side',
    dwarfSpread: 1,
    starCount: 6000,
  },
  '2xl': {
    holdXScale: 1,
    holdYOffset: 0,
    radiusScale: 1,
    trajScale: 1,
    cameraZ: 10,
    fov: 58,
    panelMode: 'side',
    dwarfSpread: 1,
    starCount: 6000,
  },
};

// Mutable ref for useFrame access (no re-renders)
function useResponsiveRef(): MutableRefObject<ResponsiveConfig> {
  const bp = useBreakpoint();
  const ref = useRef<ResponsiveConfig>(RESP[bp]);
  useEffect(() => {
    ref.current = RESP[bp];
  }, [bp]);
  return ref;
}

// ─── TYPES & UTILS ───
interface RefHandle {
  current: number;
}
interface CamTarget {
  x: number;
  y: number;
  z: number;
  lx: number;
  ly: number;
  lz: number;
}

const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const remap = (v: number, iL: number, iH: number, oL: number, oH: number) =>
  oL + clamp((v - iL) / (iH - iL), 0, 1) * (oH - oL);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
// Smooth start: no hard pop at t=0, scale eases from 0 gently
const easeOutSine = (t: number) => Math.sin(t * Math.PI * 0.5);
const easeInSine = (t: number) => 1 - Math.cos(t * Math.PI * 0.5);

// ─────────────────────────────────────────────────────────────
// TRAJECTORIES
// ─────────────────────────────────────────────────────────────

function trajectoryLogarithmicSpiral(
  t: number,
  holdPos: THREE.Vector3,
  entryAngle: number,
  entryZ: number,
  s = 1,
): THREE.Vector3 {
  const et = easeOutCubic(t);
  const theta = (1 - et) * 1.2 * Math.PI * 2 + entryAngle;
  const radius = (1 - et) * 16 * s;
  return new THREE.Vector3(
    holdPos.x + radius * Math.cos(theta),
    holdPos.y + radius * Math.sin(theta) * 0.45,
    lerp(entryZ, holdPos.z, et),
  );
}

function trajectoryCorkscrew(
  t: number,
  holdPos: THREE.Vector3,
  entryZ: number,
  s = 1,
): THREE.Vector3 {
  const et = easeOutCubic(t);
  const theta = (1 - et) * 1.8 * Math.PI * 2;
  const radius = (1 - et) * 7 * s;
  return new THREE.Vector3(
    holdPos.x + radius * Math.cos(theta),
    holdPos.y + radius * Math.sin(theta) * s,
    lerp(entryZ, holdPos.z, et),
  );
}

function trajectoryBankingSCurve(
  t: number,
  holdPos: THREE.Vector3,
  entryZ: number,
  s = 1,
): THREE.Vector3 {
  const et = easeOutCubic(t);
  const rem = 1 - et;
  return new THREE.Vector3(
    holdPos.x + Math.sin(rem * Math.PI * 1.5) * rem * 12 * s,
    holdPos.y + Math.cos(rem * Math.PI * 1.2) * rem * 5 * s,
    lerp(entryZ, holdPos.z, et),
  );
}

function trajectoryHelixDescent(
  t: number,
  holdPos: THREE.Vector3,
  entryZ: number,
  s = 1,
): THREE.Vector3 {
  const et = easeOutCubic(t);
  const theta = (1 - et) * 2 * Math.PI * 2;
  const radius = (1 - et) * 5 * s;
  return new THREE.Vector3(
    holdPos.x + radius * Math.cos(theta),
    holdPos.y + (1 - et) * 10,
    lerp(entryZ, holdPos.z, et),
  );
}

// Exit: clean departure from holdPos → exitDir.
// No sine/cos offsets — starts exactly at holdPos with zero velocity.
// Uses easeInCubic so the planet drifts slowly at first then accelerates away.
function exitTrajectory(
  t: number,
  holdPos: THREE.Vector3,
  exitDir: THREE.Vector3,
): THREE.Vector3 {
  const et = easeInCubic(t);
  return new THREE.Vector3(
    lerp(holdPos.x, exitDir.x, et),
    lerp(holdPos.y, exitDir.y, et),
    lerp(holdPos.z, exitDir.z, et),
  );
}

// ─── PLANET DEFINITIONS ───

interface ExperienceData {
  role: string;
  company: string;
  period: string;
  description: string;
  skills: string[];
}

interface PlanetDef {
  id: string;
  label: string;
  subtitle: string;
  radius: number;
  holdPos: THREE.Vector3;
  entryZ: number;
  entryAngle: number;
  exitDir: THREE.Vector3;
  trajectoryType: 'logarithmic' | 'corkscrew' | 'banking' | 'helix';
  hasRing: boolean;
  ringInner: number;
  ringOuter: number;
  ringTilt: number;
  colors: {
    base: [number, number, number];
    band1: [number, number, number];
    band2: [number, number, number];
    accent: [number, number, number];
    atmo: [number, number, number];
  };
  experience: ExperienceData;
  panelSide: 'left' | 'right';
}

const PLANETS: PlanetDef[] = [
  {
    id: 'living-prime',
    label: 'Gaia Prime',
    subtitle: 'Living World · Biosphere Peak',
    radius: 3.0,
    holdPos: new THREE.Vector3(5, 0.5, 18),
    entryZ: 70,
    entryAngle: Math.PI * 0.3,
    exitDir: new THREE.Vector3(-15, -10, -45),
    trajectoryType: 'logarithmic',
    hasRing: false,
    ringInner: 0,
    ringOuter: 0,
    ringTilt: 0,
    colors: {
      base: [0.02, 0.08, 0.28], // deep ocean blue
      band1: [0.05, 0.18, 0.38], // shallow tropical water
      band2: [0.12, 0.35, 0.1], // lush forest green
      accent: [0.9, 0.94, 0.98], // polar ice white
      atmo: [0.18, 0.45, 0.85], // vivid blue atmosphere
    },
    experience: {
      role: 'Senior Frontend Engineer',
      company: 'Stellar Corp',
      period: '2022 — Present',
      description:
        'Led the development of a real-time 3D data visualization platform serving 50K+ users. Architected the WebGL rendering pipeline and implemented custom shader systems.',
      skills: ['React', 'Three.js', 'WebGL', 'TypeScript'],
    },
    panelSide: 'left',
  },
  {
    id: 'dramatic-giant',
    label: 'Kronos Ignis',
    subtitle: 'Gas Giant · Crimson Tempest',
    radius: 3.5,
    holdPos: new THREE.Vector3(-5, 0, 17),
    entryZ: 65,
    entryAngle: 0,
    exitDir: new THREE.Vector3(16, 8, -40),
    trajectoryType: 'corkscrew',
    hasRing: true,
    ringInner: 4.5,
    ringOuter: 7.5,
    ringTilt: 0.35,
    colors: {
      base: [0.22, 0.06, 0.08], // deep crimson-black
      band1: [0.75, 0.3, 0.08], // fiery orange band
      band2: [0.35, 0.1, 0.3], // dark purple band
      accent: [0.95, 0.55, 0.15], // great storm gold
      atmo: [0.6, 0.25, 0.1], // warm ember glow
    },
    experience: {
      role: 'Frontend Developer',
      company: 'Ocean Digital',
      period: '2020 — 2022',
      description:
        'Built interactive data dashboards and component libraries. Introduced GSAP-based scroll animations that increased user engagement by 40%.',
      skills: ['Next.js', 'GSAP', 'D3.js', 'Tailwind'],
    },
    panelSide: 'right',
  },
  {
    id: 'volcanic',
    label: 'Vulcan Reach',
    subtitle: 'Rocky Volcanic · Active Geology',
    radius: 2.2,
    holdPos: new THREE.Vector3(4, 1, 16),
    entryZ: 75,
    entryAngle: Math.PI,
    exitDir: new THREE.Vector3(12, -12, -50),
    trajectoryType: 'banking',
    hasRing: false,
    ringInner: 0,
    ringOuter: 0,
    ringTilt: 0,
    colors: {
      base: [0.12, 0.1, 0.1], // dark basalt
      band1: [0.28, 0.24, 0.22], // grey rock
      band2: [0.18, 0.15, 0.14], // dark ridge stone
      accent: [1.0, 0.35, 0.02], // molten lava orange (used for hotspots)
      atmo: [0.5, 0.15, 0.05], // thin red volcanic haze
    },
    experience: {
      role: 'Creative Developer',
      company: 'Ring Studios',
      period: '2018 — 2020',
      description:
        'Designed and developed immersive web experiences for luxury brands. Specialized in WebGL-powered product configurators and interactive storytelling.',
      skills: ['Three.js', 'Blender', 'GLSL', 'React'],
    },
    panelSide: 'left',
  },
  {
    id: 'precambrian',
    label: 'Proto Ferrum',
    subtitle: 'Precambrian Rock · Dawn Era',
    radius: 1.4,
    holdPos: new THREE.Vector3(-4, 0.5, 18),
    entryZ: 55,
    entryAngle: 0,
    exitDir: new THREE.Vector3(-18, 6, -42),
    trajectoryType: 'helix',
    hasRing: false,
    ringInner: 0,
    ringOuter: 0,
    ringTilt: 0,
    colors: {
      base: [0.2, 0.14, 0.1], // iron-rich dark crust
      band1: [0.3, 0.22, 0.16], // rusty regolith
      band2: [0.12, 0.08, 0.06], // crater shadow
      accent: [0.35, 0.2, 0.1], // warm primordial shallow sea
      atmo: [0.3, 0.18, 0.08], // faint dusty haze
    },
    experience: {
      role: 'Junior Developer',
      company: 'Dune Interactive',
      period: '2016 — 2018',
      description:
        'First professional role. Built responsive websites and learned modern frontend tooling. Contributed to an open-source UI component library.',
      skills: ['JavaScript', 'CSS', 'Vue.js', 'Figma'],
    },
    panelSide: 'right',
  },
];

// ─────────────────────────────────────────────────────────────
// PER-PLANET STATE — SMOOTH TRANSITIONS
//
// Each planet's 20% window is structured:
//   0–35%:   ENTER  (trajectory + scale in)
//   35–65%:  HOLD   (parked, gentle drift)
//   65–100%: EXIT   (trajectory out + scale down)
//
// KEY FIX: Scale uses sine easing (no hard pop at 0)
// and each planet extends its visibility 3% beyond its
// window on both sides for smooth cross-fade overlap.
// ─────────────────────────────────────────────────────────────

function getPlanetState(localP: number, def: PlanetDef, resp?: ResponsiveConfig) {
  const p = clamp(localP, 0, 1);
  const r = resp ?? RESP.xl; // fallback to desktop
  let pos: THREE.Vector3;
  let scale: number;

  // Responsive holdPos: sm/md center X and push planet down (negative Y)
  // so the info panel has room at the top of the screen
  const rHold = new THREE.Vector3(
    def.holdPos.x * r.holdXScale,
    def.holdPos.y + r.holdYOffset,
    def.holdPos.z,
  );
  const s = r.trajScale;

  if (p <= 0.35) {
    const t = p / 0.35;
    switch (def.trajectoryType) {
      case 'logarithmic':
        pos = trajectoryLogarithmicSpiral(t, rHold, def.entryAngle, def.entryZ, s);
        break;
      case 'corkscrew':
        pos = trajectoryCorkscrew(t, rHold, def.entryZ, s);
        break;
      case 'banking':
        pos = trajectoryBankingSCurve(t, rHold, def.entryZ, s);
        break;
      case 'helix':
        pos = trajectoryHelixDescent(t, rHold, def.entryZ, s);
        break;
    }
    scale = easeOutSine(t);
  } else if (p <= 0.65) {
    const ht = (p - 0.35) / 0.3;
    const drift = Math.sin(ht * Math.PI * 2) * 0.2;
    pos = rHold.clone().add(new THREE.Vector3(drift * 0.15, drift * 0.08, drift * 0.1));
    scale = 1;
  } else {
    const t = (p - 0.65) / 0.35;
    pos = exitTrajectory(t, rHold, def.exitDir);
    scale = 1 - easeInSine(t);
  }

  return { pos, scale: Math.max(0.001, scale) };
}

// ─────────────────────────────────────────────────────────────
// SHADERS — GUARANTEED OPAQUE (NormalBlending, depthWrite, alpha forced to 1.0)
// Each shader uses 3D noise on object-space position for seamless spherical mapping.
// ─────────────────────────────────────────────────────────────

const planetVert = /* glsl */ `
  varying vec3 vNormal,vViewPos,vObjPos;
  void main(){vObjPos=position;vNormal=normalize(normalMatrix*normal);
    vViewPos=(modelViewMatrix*vec4(position,1.0)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

const noiseLib = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 perm(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0,0.5,1,2);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g,l.zxy);vec3 i2=max(g,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
    vec4 p=perm(perm(perm(i.z+vec4(0,i1.z,i2.z,1))+i.y+vec4(0,i1.y,i2.y,1))+i.x+vec4(0,i1.x,i2.x,1));
    float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=1.79284291400159-0.85373472095314*vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
  float fbm3(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*snoise(p);p*=2.1;a*=0.5;}return v;}`;

// 1. LIVING PRIME — lush continents, deep oceans, swirling clouds, vivid biosphere
const livingPrimeFrag = /* glsl */ `${noiseLib}
  uniform float uTime;uniform vec3 uBase,uBand1,uBand2,uAccent,uAtmo;
  varying vec3 vNormal,vViewPos,vObjPos;
  void main(){
    vec3 p=normalize(vObjPos);
    // Continent/ocean mask
    float terrain=fbm3(p*2.8+0.3);
    float landMask=smoothstep(-0.02,0.06,terrain);
    // Deep vibrant ocean with subsurface variation
    vec3 deepOcean=uBase+vec3(0.0,0.02,0.05)*fbm3(p*10.0+uTime*0.002);
    vec3 shallows=uBand1;
    vec3 ocean=mix(deepOcean,shallows,smoothstep(-0.05,0.02,terrain));
    // Lush land: forests, plains, mountains
    float elevation=fbm3(p*8.0);
    vec3 forest=uBand2;
    vec3 plains=vec3(0.28,0.52,0.18);
    vec3 highland=vec3(0.45,0.40,0.30);
    vec3 land=mix(forest,plains,smoothstep(0.3,0.55,elevation));
    land=mix(land,highland,smoothstep(0.6,0.75,elevation));
    // Snow-capped peaks
    land=mix(land,vec3(0.92,0.94,0.96),smoothstep(0.72,0.82,elevation)*0.6);
    vec3 col=mix(ocean,land,landMask);
    // Ice caps at poles
    col=mix(col,uAccent,smoothstep(0.82,0.94,abs(p.y)));
    // Swirling cloud systems
    float clouds=fbm3(p*5.0+vec3(uTime*0.005,uTime*0.003,uTime*0.001));
    float cloudMask=smoothstep(0.08,0.28,clouds);
    col=mix(col,vec3(0.97,0.98,1.0),cloudMask*0.55);
    // Cyclone eye detail
    float cyclone=fbm3(p*15.0+vec3(uTime*0.008,0.0,0.0));
    col=mix(col,vec3(1.0),smoothstep(0.65,0.72,cyclone)*cloudMask*0.3);
    // Lighting
    vec3 L=normalize(vec3(0.5,0.7,0.8));
    float diff=max(dot(vNormal,L),0.0);
    col*=0.10+diff*0.90;
    // Vibrant atmosphere rim — blue with hint of green aurora
    float rim=pow(1.0-max(dot(vNormal,normalize(-vViewPos)),0.0),2.8);
    col+=uAtmo*rim*0.55;
    col+=vec3(0.1,0.35,0.15)*rim*rim*0.3;
    gl_FragColor=vec4(col,1.0);}`;

// 2. DRAMATIC GAS GIANT — deep crimson/orange/purple bands, massive storms
const dramaticGiantFrag = /* glsl */ `${noiseLib}
  uniform float uTime;uniform vec3 uBase,uBand1,uBand2,uAccent,uAtmo;
  varying vec3 vNormal,vViewPos,vObjPos;
  void main(){
    vec3 p=normalize(vObjPos);
    // Bold latitude bands
    float lat=p.y;
    float bands=sin(lat*14.0+fbm3(p*3.5+uTime*0.006)*3.0)*0.5+0.5;
    float fineBands=sin(lat*40.0+fbm3(p*7.0+uTime*0.004)*1.5)*0.5+0.5;
    vec3 col=mix(uBase,uBand1,bands);
    col=mix(col,uBand2,smoothstep(0.55,0.75,bands)*0.6);
    col=mix(col,uBase*0.7,smoothstep(0.45,0.55,fineBands)*0.2);
    // Great red storm
    float storm1=fbm3(p*6.0+vec3(uTime*0.003,0,0));
    float stormMask=smoothstep(0.55,0.65,storm1)*smoothstep(0.2,0.4,1.0-abs(lat-0.15));
    col=mix(col,uAccent,stormMask*0.7);
    // Secondary swirl near pole
    float storm2=fbm3(p*10.0+vec3(0,uTime*0.005,3.0));
    float polarStorm=smoothstep(0.58,0.66,storm2)*smoothstep(0.6,0.85,abs(lat));
    col=mix(col,uAccent*0.8,polarStorm*0.4);
    // Turbulent flow detail
    float turb=fbm3(p*18.0+vec3(uTime*0.002,uTime*0.003,0));
    col+=vec3(0.05,0.02,0.0)*turb*0.3;
    // Lighting
    vec3 L=normalize(vec3(0.5,0.7,0.8));
    col*=0.10+max(dot(vNormal,L),0.0)*0.90;
    float rim=pow(1.0-max(dot(vNormal,normalize(-vViewPos)),0.0),3.2);
    col+=uAtmo*rim*0.45;
    gl_FragColor=vec4(col,1.0);}`;

// 3. VOLCANIC ROCKY — dark basalt, glowing lava rivers, craters, thin red haze
const volcanicFrag = /* glsl */ `${noiseLib}
  uniform float uTime;uniform vec3 uBase,uBand1,uBand2,uAccent,uAtmo;
  varying vec3 vNormal,vViewPos,vObjPos;
  void main(){
    vec3 p=normalize(vObjPos);
    // Rocky terrain base
    float terrain=fbm3(p*4.0);
    vec3 col=mix(uBase,uBand1,terrain*0.6+0.2);
    // Mountain ridges
    float ridges=abs(fbm3(p*12.0+2.0));
    col=mix(col,uBand2,smoothstep(0.3,0.5,ridges)*0.5);
    // Crater impacts
    float craters=fbm3(p*20.0+5.0);
    float craterRim=smoothstep(0.52,0.56,craters)-smoothstep(0.56,0.62,craters);
    col=mix(col,uBand1*1.2,craterRim*0.4);
    col=mix(col,uBase*0.5,smoothstep(0.56,0.62,craters)*0.3);
    // LAVA — glowing rivers in terrain cracks
    float cracks=fbm3(p*8.0+1.0);
    float lavaMask=smoothstep(0.48,0.52,cracks)*smoothstep(0.56,0.52,cracks);
    // Pulsing lava glow
    float pulse=0.7+0.3*sin(uTime*0.8+cracks*10.0);
    vec3 lavaColor=mix(vec3(1.0,0.3,0.0),vec3(1.0,0.7,0.1),pulse);
    col=mix(col,lavaColor,lavaMask*0.9);
    // Volcanic hotspots
    float hotspot=fbm3(p*6.0+8.0);
    float hotMask=smoothstep(0.62,0.68,hotspot);
    col=mix(col,vec3(0.9,0.2,0.0)*(0.6+0.4*sin(uTime*1.2+hotspot*5.0)),hotMask*0.6);
    // Lighting — lava self-illuminates
    vec3 L=normalize(vec3(0.5,0.7,0.8));
    float diff=max(dot(vNormal,L),0.0);
    vec3 lit=col*(0.08+diff*0.82);
    // Add back lava emission (not affected by shadow)
    lit+=lavaColor*lavaMask*0.5+vec3(0.9,0.2,0.0)*hotMask*0.3;
    // Thin reddish atmosphere
    float rim=pow(1.0-max(dot(vNormal,normalize(-vViewPos)),0.0),4.0);
    lit+=uAtmo*rim*0.25;
    gl_FragColor=vec4(lit,1.0);}`;

// 4. PRECAMBRIAN ROCK — smallest, dark iron surface, early shallow orange-brown seas
const precambrianFrag = /* glsl */ `${noiseLib}
  uniform float uTime;uniform vec3 uBase,uBand1,uBand2,uAccent,uAtmo;
  varying vec3 vNormal,vViewPos,vObjPos;
  void main(){
    vec3 p=normalize(vObjPos);
    // Barren iron-rich crust
    float terrain=fbm3(p*5.0);
    vec3 col=mix(uBase,uBand1,terrain*0.5+0.25);
    // Ancient crater bombardment
    float craters=fbm3(p*16.0+4.0);
    float craterDepth=smoothstep(0.50,0.58,craters);
    col=mix(col,uBand2,craterDepth*0.5);
    // Early shallow seas — warm orange-brown mineral-rich water
    float basins=fbm3(p*3.0+1.5);
    float seaMask=smoothstep(0.08,0.0,basins);
    vec3 primordialSea=uAccent+vec3(0.02,0.0,0.0)*fbm3(p*12.0+uTime*0.002);
    col=mix(col,primordialSea,seaMask*0.8);
    // Iron oxide streaks
    float streaks=fbm3(p*10.0+7.0);
    col=mix(col,vec3(0.45,0.18,0.08),smoothstep(0.45,0.58,streaks)*0.25);
    // Faint volcanic venting
    float vents=fbm3(p*22.0+12.0);
    col=mix(col,vec3(0.5,0.25,0.1),smoothstep(0.64,0.70,vents)*0.2);
    // Lighting
    vec3 L=normalize(vec3(0.5,0.7,0.8));
    col*=0.10+max(dot(vNormal,L),0.0)*0.90;
    // Barely-there atmosphere
    float rim=pow(1.0-max(dot(vNormal,normalize(-vViewPos)),0.0),5.0);
    col+=uAtmo*rim*0.15;
    gl_FragColor=vec4(col,1.0);}`;

const FRAG_MAP: Record<string, string> = {
  'living-prime': livingPrimeFrag,
  'dramatic-giant': dramaticGiantFrag,
  'volcanic': volcanicFrag,
  'precambrian': precambrianFrag,
};

const atmoVert = /* glsl */ `varying vec3 vN,vP;
  void main(){vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(position,1.0)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const atmoFrag = /* glsl */ `uniform vec3 uCol;varying vec3 vN,vP;
  void main(){float rim=pow(1.0-max(dot(vN,normalize(-vP)),0.0),2.5);
    gl_FragColor=vec4(uCol,rim*0.5);}`;

const ringVert = /* glsl */ `varying vec2 vUv;varying vec3 vN;
  void main(){vUv=uv;vN=normalize(normalMatrix*normal);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const ringFrag = /* glsl */ `varying vec2 vUv;varying vec3 vN;
  float h(float n){return fract(sin(n)*43758.5453);}
  void main(){float r=length(vUv-0.5)*2.0;
    float b1=smoothstep(0.30,0.33,r)*smoothstep(0.95,0.92,r);
    float b2=smoothstep(0.38,0.41,r)*smoothstep(0.55,0.52,r);
    float b3=smoothstep(0.60,0.63,r)*smoothstep(0.90,0.87,r);
    float gap=1.0-smoothstep(0.52,0.53,r)*smoothstep(0.59,0.58,r);
    float mask=(b1+b2*0.7+b3*0.5)*gap;
    vec3 col=mix(vec3(0.85,0.78,0.62),vec3(0.52,0.48,0.40),r);
    col*=h(floor(r*250.0))*0.3+0.7;
    col*=max(dot(vN,normalize(vec3(0.4,0.65,0.8))),0.0)*0.5+0.5;
    gl_FragColor=vec4(col,mask*0.8);}`;

// ─── DWARF SHADER + CONFIGS ───

const dwarfFrag = /* glsl */ `${noiseLib}
  uniform float uTime;uniform vec3 uCol1,uCol2,uCol3;uniform float uPattern,uFreq;
  varying vec3 vNormal,vViewPos,vObjPos;
  void main(){vec3 p=normalize(vObjPos);vec3 col;
    float n1=fbm3(p*uFreq),n2=fbm3(p*uFreq*2.5+3.0);float pat=uPattern;
    if(pat<1.0){float cr=smoothstep(0.45,0.5,abs(n2));col=mix(uCol1,uCol2,n1*0.4+0.3);col=mix(col,uCol3,cr*0.5);}
    else if(pat<2.0){col=uCol1*(0.6+n1*0.4);float lv=smoothstep(0.52,0.56,n2);col=mix(col,uCol2,lv*0.8);col+=uCol3*lv*0.3;}
    else if(pat<3.0){col=mix(uCol1,uCol2,n1*0.3+0.35);col+=uCol3*pow(max(0.0,snoise(p*uFreq*4.0+7.0)),3.0)*0.3;}
    else if(pat<4.0){float cr=smoothstep(0.5,0.56,fbm3(p*uFreq*3.0+5.0));col=mix(uCol1,uCol2,n1*0.3+0.35);col=mix(col,uCol3,cr*0.6);}
    else if(pat<5.0){col=mix(uCol1,uCol2,n1*0.5+0.25);col=mix(col,uCol3,smoothstep(0.4,0.55,n2)*0.4);}
    else if(pat<6.0){float f=abs(snoise(p*uFreq*6.0));col=mix(uCol1,uCol2,f);col+=uCol3*pow(f,4.0)*0.5;}
    else if(pat<7.0){float v=sin(p.x*8.0+n1*6.0)*0.5+0.5;col=mix(uCol1,uCol2,v);col=mix(col,uCol3,smoothstep(0.6,0.7,v)*0.4);}
    else if(pat<8.0){col=mix(uCol1,uCol2,n1*0.6+0.2);col=mix(col,uCol3,smoothstep(0.3,0.5,fbm3(p*uFreq*2.0+10.0))*0.5);}
    else if(pat<9.0){col=uCol1*(0.5+n1*0.5);col+=uCol2*pow(max(0.0,snoise(p*20.0)),8.0)*0.6;col+=uCol3*smoothstep(0.6,0.7,n2)*0.2;}
    else{float d=sin(p.y*12.0+n1*3.0)*0.5+0.5;col=mix(uCol1,uCol2,d);col=mix(col,uCol3,smoothstep(0.55,0.65,n2)*0.3);}
    vec3 L=normalize(vec3(0.5,0.7,0.8));col*=0.12+max(dot(vNormal,L),0.0)*0.88;
    col+=vec3(0.15,0.2,0.3)*pow(1.0-max(dot(vNormal,normalize(-vViewPos)),0.0),3.0)*0.3;
    gl_FragColor=vec4(col,1.0);}`;

interface DwarfDef {
  radius: number;
  scrollDelay: number;
  entryAngle: number;
  spreadDist: number;
  yOff: number;
  pattern: number;
  freq: number;
  col1: THREE.Color;
  col2: THREE.Color;
  col3: THREE.Color;
}

const DWARFS: DwarfDef[] = [
  {
    radius: 0.45,
    scrollDelay: 0,
    entryAngle: 0,
    spreadDist: 10,
    yOff: -2,
    pattern: 0,
    freq: 4,
    col1: new THREE.Color(0.75, 0.82, 0.9),
    col2: new THREE.Color(0.4, 0.55, 0.75),
    col3: new THREE.Color(0.2, 0.3, 0.5),
  },
  {
    radius: 0.35,
    scrollDelay: 0.06,
    entryAngle: Math.PI * 0.4,
    spreadDist: 12,
    yOff: 3,
    pattern: 1,
    freq: 5,
    col1: new THREE.Color(0.15, 0.1, 0.08),
    col2: new THREE.Color(0.9, 0.45, 0.1),
    col3: new THREE.Color(1, 0.7, 0.2),
  },
  {
    radius: 0.5,
    scrollDelay: 0.1,
    entryAngle: Math.PI * 0.8,
    spreadDist: 8,
    yOff: -1,
    pattern: 2,
    freq: 3,
    col1: new THREE.Color(0.5, 0.5, 0.55),
    col2: new THREE.Color(0.7, 0.68, 0.65),
    col3: new THREE.Color(0.9, 0.88, 0.85),
  },
  {
    radius: 0.3,
    scrollDelay: 0.14,
    entryAngle: Math.PI * 1.2,
    spreadDist: 14,
    yOff: 4,
    pattern: 3,
    freq: 4,
    col1: new THREE.Color(0.4, 0.4, 0.42),
    col2: new THREE.Color(0.55, 0.55, 0.52),
    col3: new THREE.Color(0.25, 0.25, 0.28),
  },
  {
    radius: 0.4,
    scrollDelay: 0.18,
    entryAngle: Math.PI * 1.6,
    spreadDist: 9,
    yOff: -3,
    pattern: 4,
    freq: 5,
    col1: new THREE.Color(0.55, 0.2, 0.08),
    col2: new THREE.Color(0.75, 0.35, 0.12),
    col3: new THREE.Color(0.4, 0.15, 0.06),
  },
  {
    radius: 0.28,
    scrollDelay: 0.22,
    entryAngle: Math.PI * 0.2,
    spreadDist: 11,
    yOff: 2,
    pattern: 5,
    freq: 6,
    col1: new THREE.Color(0.3, 0.2, 0.45),
    col2: new THREE.Color(0.6, 0.5, 0.8),
    col3: new THREE.Color(0.85, 0.75, 1.0),
  },
  {
    radius: 0.38,
    scrollDelay: 0.26,
    entryAngle: Math.PI * 0.6,
    spreadDist: 13,
    yOff: -4,
    pattern: 6,
    freq: 3,
    col1: new THREE.Color(0.8, 0.78, 0.72),
    col2: new THREE.Color(0.35, 0.32, 0.3),
    col3: new THREE.Color(0.5, 0.48, 0.44),
  },
  {
    radius: 0.32,
    scrollDelay: 0.3,
    entryAngle: Math.PI * 1.0,
    spreadDist: 7,
    yOff: 1,
    pattern: 7,
    freq: 4,
    col1: new THREE.Color(0.3, 0.22, 0.12),
    col2: new THREE.Color(0.2, 0.35, 0.15),
    col3: new THREE.Color(0.25, 0.45, 0.2),
  },
  {
    radius: 0.42,
    scrollDelay: 0.34,
    entryAngle: Math.PI * 1.4,
    spreadDist: 15,
    yOff: -2.5,
    pattern: 8,
    freq: 5,
    col1: new THREE.Color(0.08, 0.08, 0.12),
    col2: new THREE.Color(0.4, 0.42, 0.5),
    col3: new THREE.Color(0.15, 0.15, 0.2),
  },
  {
    radius: 0.36,
    scrollDelay: 0.38,
    entryAngle: Math.PI * 1.8,
    spreadDist: 10,
    yOff: 3.5,
    pattern: 9,
    freq: 4,
    col1: new THREE.Color(0.72, 0.6, 0.4),
    col2: new THREE.Color(0.85, 0.72, 0.5),
    col3: new THREE.Color(0.6, 0.48, 0.3),
  },
];

function getDwarfPos(t: number, d: DwarfDef): THREE.Vector3 {
  const et = easeOutCubic(t);
  // All dwarfs start at center (0,0,zStart) and spiral outward
  // entryAngle determines WHICH direction they fly out
  const theta = d.entryAngle + et * Math.PI * 1.5; // spiral as they spread
  const outwardRadius = et * d.spreadDist; // 0 at start → full spread
  const wobble = Math.sin(et * Math.PI * 3) * (1 - et) * 1.5; // diminishing wobble
  return new THREE.Vector3(
    Math.cos(theta) * outwardRadius + wobble * Math.cos(d.entryAngle),
    Math.sin(theta) * outwardRadius * 0.5 + d.yOff * et,
    lerp(55, -35, et),
  );
}

const trailVert = /* glsl */ `attribute float aSize,aAlpha;uniform float uTime;
  varying float vA;varying vec3 vC;void main(){vC=color;vA=aAlpha;
    vec3 pos=position+sin(uTime*1.5+position.xzy*2.0)*0.04;
    vec4 mv=modelViewMatrix*vec4(pos,1.0);gl_PointSize=aSize*(160.0/-mv.z);gl_Position=projectionMatrix*mv;}`;
const trailFrag = /* glsl */ `varying float vA;varying vec3 vC;void main(){float d=length(gl_PointCoord-0.5)*2.0;
    gl_FragColor=vec4(vC*1.2,(exp(-d*d*3.0)+exp(-d*d*0.8)*0.25)*vA);}`;

// ─────────────────────────────────────────────────────────────
// THREE.JS COMPONENTS
// ─────────────────────────────────────────────────────────────

// KEY CHANGE: overlap margin — each planet renders 3% beyond its
// window so exit of planet N visually overlaps with entry of N+1.
const OVERLAP = 0.03;

const MainPlanet: FC<{
  def: PlanetDef;
  idx: number;
  progressRef: RefHandle;
  respRef: MutableRefObject<ResponsiveConfig>;
}> = ({ def, idx, progressRef, respRef }) => {
  const groupRef = useRef<THREE.Group>(null);
  const myStart = idx * 0.2;
  const myEnd = (idx + 1) * 0.2;

  // Create uniforms once — mutate .value in useFrame
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBase: { value: new THREE.Color(...def.colors.base) },
      uBand1: { value: new THREE.Color(...def.colors.band1) },
      uBand2: { value: new THREE.Color(...def.colors.band2) },
      uAccent: { value: new THREE.Color(...def.colors.accent) },
      uAtmo: { value: new THREE.Color(...def.colors.atmo) },
    }),
    [def],
  );

  // Create material via constructor — properties set BEFORE first render.
  // This is the ONLY reliable way to get opaque ShaderMaterial in R3F.
  // JSX <shaderMaterial> and useEffect both run too late.
  const bodyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: planetVert,
        fragmentShader: FRAG_MAP[def.id],
        transparent: false,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.FrontSide,
      }),
    [uniforms, def.id],
  );

  const atmoUniforms = useMemo(
    () => ({
      uCol: { value: new THREE.Color(...def.colors.atmo) },
    }),
    [def],
  );

  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: atmoUniforms,
        vertexShader: atmoVert,
        fragmentShader: atmoFrag,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide,
      }),
    [atmoUniforms],
  );

  const ringMat = useMemo(
    () =>
      def.hasRing
        ? new THREE.ShaderMaterial({
            vertexShader: ringVert,
            fragmentShader: ringFrag,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
          })
        : null,
    [def.hasRing],
  );

  // Cleanup on unmount
  useEffect(
    () => () => {
      bodyMat.dispose();
      atmoMat.dispose();
      ringMat?.dispose();
    },
    [bodyMat, atmoMat, ringMat],
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    const gp = progressRef.current;
    const r = respRef.current;

    const extStart = myStart - OVERLAP;
    const extEnd = myEnd + OVERLAP;
    const localP = clamp((gp - myStart) / (myEnd - myStart), 0, 1);

    const { pos, scale } = getPlanetState(localP, def, r);
    const visible = gp >= extStart && gp <= extEnd && scale > 0.003;

    if (groupRef.current) {
      groupRef.current.visible = visible;
      if (visible) {
        groupRef.current.position.copy(pos);
        groupRef.current.scale.setScalar(scale * r.radiusScale);
        groupRef.current.rotation.y = clock.getElapsedTime() * 0.04;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Planet body — material created via constructor, guaranteed opaque */}
      <mesh frustumCulled={false} renderOrder={0} material={bodyMat}>
        <sphereGeometry args={[def.radius, 96, 64]} />
      </mesh>
      {/* Atmosphere glow shell */}
      <mesh frustumCulled={false} renderOrder={1} material={atmoMat}>
        <sphereGeometry args={[def.radius * 1.06, 48, 48]} />
      </mesh>
      {def.hasRing && ringMat && (
        <mesh
          rotation={[Math.PI * def.ringTilt, 0, 0.12]}
          frustumCulled={false}
          renderOrder={1}
          material={ringMat}
        >
          <ringGeometry args={[def.ringInner, def.ringOuter, 128]} />
        </mesh>
      )}
    </group>
  );
};

const TexturedDwarf: FC<{ def: DwarfDef; progressRef: RefHandle }> = ({
  def,
  progressRef,
}) => {
  const gRef = useRef<THREE.Group>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCol1: { value: def.col1 },
      uCol2: { value: def.col2 },
      uCol3: { value: def.col3 },
      uPattern: { value: def.pattern },
      uFreq: { value: def.freq },
      uBase: { value: def.col1 },
      uBand1: { value: def.col2 },
      uBand2: { value: def.col3 },
      uAccent: { value: def.col1 },
      uAtmo: { value: def.col2 },
    }),
    [def],
  );

  const bodyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: planetVert,
        fragmentShader: dwarfFrag,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.FrontSide,
      }),
    [uniforms],
  );

  useEffect(
    () => () => {
      bodyMat.dispose();
    },
    [bodyMat],
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    const swP = clamp((progressRef.current - 0.8) / 0.2, 0, 1);
    const lp = clamp((swP - def.scrollDelay) / (1 - def.scrollDelay), 0, 1);
    const visible = swP > 0 && lp > 0.001;
    if (gRef.current) {
      gRef.current.visible = visible;
      if (!visible) return;
      gRef.current.position.copy(getDwarfPos(lp, def));
      const sIn = lp < 0.2 ? easeOutSine(lp / 0.2) : 1;
      const sOut = lp > 0.85 ? 1 - easeInSine((lp - 0.85) / 0.15) : 1;
      gRef.current.scale.setScalar(Math.max(0.001, sIn * sOut));
      gRef.current.rotation.y = clock.getElapsedTime() * (0.1 + def.pattern * 0.015);
    }
  });

  return (
    <group ref={gRef}>
      <mesh frustumCulled={false} renderOrder={0} material={bodyMat}>
        <sphereGeometry args={[def.radius, 32, 32]} />
      </mesh>
    </group>
  );
};

const DwarfTrails: FC<{ progressRef: RefHandle }> = ({ progressRef }) => {
  const PTS = 50;
  const total = DWARFS.length * PTS;
  const uniforms = useRef({ uTime: { value: 0 } });
  const { colors, sizes, baseAlphas } = useMemo(() => {
    const c = new Float32Array(total * 3),
      s = new Float32Array(total),
      a = new Float32Array(total);
    DWARFS.forEach((d, di) => {
      for (let i = 0; i < PTS; i++) {
        const idx = di * PTS + i;
        c[idx * 3] = d.col1.r * rand(0.5, 1.1);
        c[idx * 3 + 1] = d.col1.g * rand(0.5, 1.1);
        c[idx * 3 + 2] = d.col1.b * rand(0.5, 1.1);
        s[idx] = rand(0.3, 1.5);
        a[idx] = rand(0.02, 0.08);
      }
    });
    return { colors: c, sizes: s, baseAlphas: a };
  }, []);
  const posRef = useRef<THREE.BufferAttribute>(null);
  const alpRef = useRef<THREE.BufferAttribute>(null);
  const pos = useMemo(() => new Float32Array(total * 3), [total]);
  const alp = useMemo(() => new Float32Array(total), [total]);
  useFrame(({ clock }) => {
    uniforms.current.uTime.value = clock.getElapsedTime();
    const swP = clamp((progressRef.current - 0.8) / 0.2, 0, 1);
    DWARFS.forEach((d, di) => {
      const lp = clamp((swP - d.scrollDelay) / (1 - d.scrollDelay), 0, 1);
      for (let i = 0; i < PTS; i++) {
        const idx = di * PTS + i;
        const pt = i / (PTS - 1);
        if (pt < lp && lp > 0) {
          const tp = getDwarfPos(pt, d);
          pos[idx * 3] = tp.x + rand(-0.12, 0.12);
          pos[idx * 3 + 1] = tp.y + rand(-0.12, 0.12);
          pos[idx * 3 + 2] = tp.z + rand(-0.12, 0.12);
          alp[idx] = baseAlphas[idx] * Math.min(1, Math.abs(pt - lp) * 10);
        } else {
          alp[idx] = 0;
        }
      }
    });
    if (posRef.current) posRef.current.needsUpdate = true;
    if (alpRef.current) alpRef.current.needsUpdate = true;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          ref={posRef}
          attach='attributes-position'
          array={pos}
          count={total}
          itemSize={3}
        />
        <bufferAttribute
          attach='attributes-color'
          array={colors}
          count={total}
          itemSize={3}
        />
        <bufferAttribute
          attach='attributes-aSize'
          array={sizes}
          count={total}
          itemSize={1}
        />
        <bufferAttribute
          ref={alpRef}
          attach='attributes-aAlpha'
          array={alp}
          count={total}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={trailVert}
        fragmentShader={trailFrag}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const CameraRig: FC<{ camRef: MutableRefObject<CamTarget> }> = ({ camRef }) => {
  const { camera } = useThree();
  const sL = useRef(new THREE.Vector3(0, 0, 25));
  useFrame(() => {
    const c = camRef.current;
    // Position: smooth follow (0.04 = responsive but cinematic)
    if (!!c) {
      camera.position.set(
        camera.position.x + (c.x - camera.position.x) * 0.04,
        camera.position.y + (c.y - camera.position.y) * 0.04,
        camera.position.z + (c.z - camera.position.z) * 0.03,
      );
    }
    // LookAt: slightly faster than position for natural head-turn feel
    sL.current.lerp(new THREE.Vector3(c.lx, c.ly, c.lz), 0.05);
    camera.lookAt(sL.current);
  });
  return null;
};

const Lights: FC = () => {
  const s = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (s.current)
      s.current.intensity = 3.5 + Math.sin(clock.getElapsedTime() * 0.15) * 0.3;
  });
  return (
    <>
      <ambientLight color='#0a0a18' intensity={0.3} />
      <pointLight
        ref={s}
        position={[40, 25, 60]}
        color='#fff2d8'
        intensity={3.5}
        distance={250}
      />
      <pointLight
        position={[-30, -15, -20]}
        color='#1a2540'
        intensity={0.6}
        distance={120}
      />
    </>
  );
};

// ─── CUSTOM STARFIELD ───
// All stars placed on a single distant sphere (radius 200).
// NO depth volume — stars are ALWAYS behind every scene object.
// depthTest=true, depthWrite=false, NormalBlending.
// Stars never render in front of planets.
const starVert = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  varying float vBright;
  varying vec3 vColor;
  uniform float uTime;
  void main() {
    vBright = aBright;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Gentle twinkle
    float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + position.x * 10.0 + position.y * 7.0);
    gl_PointSize = aSize * twinkle * (120.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const starFrag = /* glsl */ `
  varying float vBright;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = exp(-d * d * 8.0);
    float halo = exp(-d * d * 1.5) * 0.25;
    float alpha = (core + halo) * vBright;
    gl_FragColor = vec4(vColor * (core + halo * 0.5), alpha);
  }
`;

const StarField: FC<{ count: number }> = ({ count }) => {
  const uniforms = useRef({ uTime: { value: 0 } });

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const bri = new Float32Array(count);

    const starColors = [
      [1, 0.95, 0.85], // warm white
      [0.85, 0.9, 1], // cool blue-white
      [1, 0.8, 0.6], // warm gold
      [0.7, 0.85, 1], // pale blue
      [1, 0.88, 0.78], // soft peach
    ];

    for (let i = 0; i < count; i++) {
      // ALL on a single distant sphere — never inside the scene
      const STAR_RADIUS = 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = STAR_RADIUS * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = STAR_RADIUS * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = STAR_RADIUS * Math.cos(phi);

      const c = starColors[Math.floor(Math.random() * starColors.length)];
      const v = 0.7 + Math.random() * 0.3;
      col[i * 3] = c[0] * v;
      col[i * 3 + 1] = c[1] * v;
      col[i * 3 + 2] = c[2] * v;

      siz[i] = 0.5 + Math.random() * 2.5;
      bri[i] = 0.4 + Math.random() * 0.6;
    }
    return { pos, col, siz, bri };
  }, [count]);

  useFrame(({ clock }) => {
    uniforms.current.uTime.value = clock.getElapsedTime();
  });

  return (
    <points renderOrder={-100} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach='attributes-position'
          array={data.pos}
          count={count}
          itemSize={3}
        />
        <bufferAttribute
          attach='attributes-color'
          array={data.col}
          count={count}
          itemSize={3}
        />
        <bufferAttribute
          attach='attributes-aSize'
          array={data.siz}
          count={count}
          itemSize={1}
        />
        <bufferAttribute
          attach='attributes-aBright'
          array={data.bri}
          count={count}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={starVert}
        fragmentShader={starFrag}
        vertexColors
        transparent={true}
        depthTest={true}
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
};

const Scene: FC<{
  progressRef: RefHandle;
  camRef: MutableRefObject<CamTarget>;
  respRef: MutableRefObject<ResponsiveConfig>;
}> = ({ progressRef, camRef, respRef }) => {
  const bp = useBreakpoint();
  const r = RESP[bp];
  return (
    <>
      <Lights />
      <fog attach='fog' args={['#020212', 30, 180]} />
      <StarField count={r.starCount} />
      {PLANETS.map((p, i) => (
        <MainPlanet
          key={p.id}
          def={p}
          idx={i}
          progressRef={progressRef}
          respRef={respRef}
        />
      ))}
      {DWARFS.map((d, i) => (
        <TexturedDwarf key={i} def={d} progressRef={progressRef} />
      ))}
      <DwarfTrails progressRef={progressRef} />
      <CameraRig camRef={camRef} />
    </>
  );
};

// ─── EXPERIENCE PANEL (responsive: side on lg+, top on sm/md) ───
const ExperiencePanel: FC<{
  planet: PlanetDef;
  index: number;
  progressRef: RefHandle;
  panelMode: 'side' | 'top';
}> = ({ planet, index, progressRef, panelMode }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf: number;
    const check = () => {
      const myS = index * 0.2,
        myE = (index + 1) * 0.2;
      const lp = clamp((progressRef.current - myS) / (myE - myS), 0, 1);
      const vis = Math.min(remap(lp, 0.38, 0.48, 0, 1), remap(lp, 0.58, 0.64, 1, 0));
      el.style.opacity = String(Math.max(0, vis));
      el.style.transform =
        panelMode === 'top'
          ? `translateX(-50%) translateY(${(1 - Math.max(0, vis)) * -15}px)`
          : `translateY(${(1 - Math.max(0, vis)) * 15}px)`;
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [index, progressRef, panelMode]);
  const exp = planet.experience;
  const isTop = panelMode === 'top';

  // Top mode: centered at top of screen, below nav area
  const posStyle: Record<string, string | number> = isTop
    ? {
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 420,
        textAlign: 'center',
      }
    : {
        position: 'fixed',
        top: '50%',
        [planet.panelSide]: 'clamp(24px,5vw,80px)',
        maxWidth: 380,
      };

  return (
    <div ref={ref} style={{ ...posStyle, zIndex: 15, pointerEvents: 'none', opacity: 0 }}>
      <p
        style={{
          fontSize: 'clamp(0.55rem,0.9vw,0.7rem)',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: `rgb(${planet.colors.atmo.map((c) => Math.round(c * 255 * 1.3)).join(',')})`,
          marginBottom: 8,
          opacity: 0.6,
        }}
      >
        {planet.subtitle}
      </p>
      <h2
        style={{
          fontSize: isTop ? 'clamp(1.1rem,4vw,1.6rem)' : 'clamp(1.3rem,2.5vw,2rem)',
          fontWeight: 300,
          letterSpacing: '0.12em',
          color: '#dde0e8',
          margin: '0 0 12px',
        }}
      >
        {planet.label}
      </h2>
      <div
        style={{
          background: 'rgba(8,10,25,0.8)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: isTop ? '16px 20px' : '24px 28px',
          backdropFilter: 'blur(20px)',
          textAlign: 'left',
        }}
      >
        <h3
          style={{
            fontSize: isTop ? '0.88rem' : '1rem',
            fontWeight: 400,
            letterSpacing: '0.05em',
            color: '#d0d4de',
            margin: '0 0 3px',
          }}
        >
          {exp.role}
        </h3>
        <p
          style={{
            fontSize: isTop ? '0.72rem' : '0.8rem',
            color: 'rgba(180,185,200,0.6)',
            margin: '0 0 3px',
          }}
        >
          {exp.company}
        </p>
        <p
          style={{
            fontSize: '0.65rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(140,150,170,0.4)',
            margin: '0 0 10px',
          }}
        >
          {exp.period}
        </p>
        <p
          style={{
            fontSize: isTop ? '0.75rem' : '0.82rem',
            lineHeight: 1.6,
            color: 'rgba(190,195,210,0.7)',
            margin: '0 0 10px',
          }}
        >
          {exp.description}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {exp.skills.map((s) => (
            <span
              key={s}
              style={{
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(180,190,210,0.6)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── CAMERA LOGIC (responsive Z) ───
function computeCamera(gp: number, resp: ResponsiveConfig): CamTarget {
  const camZ = resp.cameraZ;
  // Default neutral: center, looking forward
  const base: CamTarget = { x: 0, y: 1, z: camZ, lx: 0, ly: 0, lz: 25 };

  // Responsive: less X tracking on mobile since planets are centered
  const xTrack = resp.holdXScale > 0 ? 0.35 : 0.15;
  const yTrack = 0.3;

  for (let i = 0; i < PLANETS.length; i++) {
    const myS = i * 0.2,
      myE = (i + 1) * 0.2;
    const lp = clamp((gp - myS) / (myE - myS), 0, 1);

    if (lp > 0 && lp < 1) {
      const { pos } = getPlanetState(lp, PLANETS[i], resp);

      // Intensity peaks at mid-flyby, zero at boundaries
      const intensity = Math.sin(lp * Math.PI);

      // ENTER (0–0.35): camera drifts toward incoming planet
      // HOLD (0.35–0.65): camera offset from planet (room for panel)
      // EXIT (0.65–1.0): camera follows departure then eases back
      if (lp <= 0.35) {
        const et = lp / 0.35;
        const ease = easeOutCubic(et);
        base.x = pos.x * xTrack * ease;
        base.y = 1 + pos.y * yTrack * ease;
        base.z = camZ + (pos.z - camZ) * 0.08 * ease;
      } else if (lp <= 0.65) {
        // Parked: gentle offset toward planet
        const holdBlend = 0.8;
        base.x = pos.x * xTrack * holdBlend;
        base.y = 1 + pos.y * yTrack * holdBlend;
        base.z = camZ;
      } else {
        const et = (lp - 0.65) / 0.35;
        const ease = 1 - easeInCubic(et);
        base.x = pos.x * xTrack * ease * 0.5;
        base.y = 1 + pos.y * yTrack * ease * 0.5;
        base.z = camZ + (pos.z - camZ) * 0.05 * (1 - ease);
      }

      // Look target: always track the planet, stronger during flyby
      base.lx = pos.x * 0.6 * intensity;
      base.ly = pos.y * 0.5 * intensity;
      base.lz = lerp(25, pos.z, intensity * 0.35);
      break;
    }
  }

  // Dwarf swarm phase: camera stays centered, gentle vertical drift
  if (gp >= 0.8) {
    const dp = clamp((gp - 0.8) / 0.2, 0, 1);
    base.x = 0;
    base.y = 1 + Math.sin(dp * Math.PI) * 0.8;
    base.lx = 0;
    base.ly = Math.sin(dp * Math.PI) * 0.5;
    base.lz = lerp(25, 12, dp);
  }

  return base;
}

// ─── SNAP ───
const HOLD_CENTERS = [0.1, 0.3, 0.5, 0.7, 0.9];
const TRANSITION_ZONES: [number, number][] = [
  [0.17, 0.23],
  [0.37, 0.43],
  [0.57, 0.63],
  [0.77, 0.83],
];
function isInTransition(p: number): boolean {
  return TRANSITION_ZONES.some(([lo, hi]) => p >= lo && p <= hi);
}
function snapFn(progress: number): number {
  if (isInTransition(progress)) return progress;
  let closest = HOLD_CENTERS[0],
    minD = 999;
  for (const sp of HOLD_CENTERS) {
    const d = Math.abs(progress - sp);
    if (d < minD) {
      minD = d;
      closest = sp;
    }
  }
  return minD < 0.05 ? closest : progress;
}

// ─── RESPONSIVE CAMERA UPDATER (inside Canvas) ───
const ResponsiveFov: FC<{ respRef: MutableRefObject<ResponsiveConfig> }> = ({
  respRef,
}) => {
  const { camera } = useThree();
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = respRef.current.fov;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * 0.05;
      cam.updateProjectionMatrix();
    }
  });
  return null;
};

// ─── MAIN EXPORT ───
const SCROLL_VH = 1200;
interface Props {
  onReady?: (trigger: () => void) => void;
}

const PlanetSwarmScene: FC<Props> = ({ onReady }) => {
  const progressRef = useRef(0);
  const respRef = useResponsiveRef();
  const bp = useBreakpoint();
  const panelMode = RESP[bp].panelMode;
  const camRef = useRef<CamTarget>({
    x: 0,
    y: 1,
    z: RESP[bp].cameraZ,
    lx: 0,
    ly: 0,
    lz: 25,
  });

  const [phase, setPhase] = useState<'waiting' | 'entering' | 'scrolling'>('waiting');
  const stRef = useRef<(ScrollTrigger | undefined)[]>([]);

  const initScroll = useCallback(() => {
    const master = ScrollTrigger.create({
      trigger: '#z-scroll-spacer',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 4,
      snap: {
        snapTo: snapFn,
        duration: { min: 0.6, max: 1.8 },
        delay: 0.15,
        ease: 'power2.inOut',
      },
      onUpdate: (self) => {
        progressRef.current = self.progress;
        // camRef.current = computeCamera(self.progress, respRef.current);
      },
    });
    stRef.current.push(master);
    const wt = gsap.from('.work-section', {
      opacity: 0,
      y: 80,
      scrollTrigger: {
        trigger: '.work-section',
        start: 'top 85%',
        end: 'top 40%',
        scrub: 1,
      },
    });
    const ct = gsap.from('.project-card', {
      opacity: 0,
      y: 40,
      stagger: 0.15,
      scrollTrigger: {
        trigger: '.work-section',
        start: 'top 65%',
        end: 'top 25%',
        scrub: 1,
      },
    });
    stRef.current.push(wt.scrollTrigger, ct.scrollTrigger);
  }, [respRef]);

  const triggerEntrance = useCallback(() => {
    if (phase !== 'waiting') return;
    setPhase('entering');
    const r = respRef.current;
    const tl = gsap.timeline({
      onComplete: () => {
        setPhase('scrolling');
        window.scrollTo({ top: 0, behavior: 'instant' });
        requestAnimationFrame(() => requestAnimationFrame(() => initScroll()));
      },
    });
    // tl.to(
    //   camRef.current,
    //   {
    //     x: 0,
    //     y: 1,
    //     z: r.cameraZ,
    //     lx: 0,
    //     ly: 0,
    //     lz: 25,
    //     duration: 1.5,
    //     ease: 'power3.out',
    //   },
    //   0,
    // );
  }, [phase, initScroll, respRef]);

  useEffect(() => {
    if (onReady) onReady(triggerEntrance);
  }, [onReady, triggerEntrance]);
  useEffect(() => {
    if (!onReady && phase === 'waiting') {
      const t = setTimeout(triggerEntrance, 1000);
      return () => clearTimeout(t);
    }
  }, [onReady, phase, triggerEntrance]);
  useEffect(() => {
    return () => {
      stRef.current.forEach((t) => t?.kill());
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <>
      <Scene progressRef={progressRef} camRef={camRef} respRef={respRef} />
      <ResponsiveFov respRef={respRef} />
    </>
  );
};

export default PlanetSwarmScene;

{
  /* {PLANETS.map((p, i) => (
        <ExperiencePanel
          key={p.id}
          planet={p}
          index={i}
          progressRef={progressRef}
          panelMode={panelMode}
        />
      ))} */
}
