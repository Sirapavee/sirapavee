// ═══════════════════════════════════════════════════════
// Pillars of Creation — React Three Fiber + Drei + TypeScript
// Single-file version — extract into components as needed
// ═══════════════════════════════════════════════════════
//
// Dependencies:
//   npm i react react-dom three @react-three/fiber @react-three/drei
//         @react-three/postprocessing postprocessing
//   npm i -D @types/react @types/react-dom @types/three typescript
//         @vitejs/plugin-react vite
//
// Usage:
//   Wrap with <Canvas> in your app entry, or use <App /> directly.
//
// ═══════════════════════════════════════════════════════

import { Suspense, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

// ─── UTILITIES ───────────────────────────────────────

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

const gaussian = (): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

interface PillarDef {
  cx: number;
  cz: number;
  baseR: number;
  topR: number;
  h: number;
  yOff: number;
  tiltX: number;
  tiltZ: number;
}

interface PillarData {
  positions: number[];
  colors: number[];
  sizes: number[];
}

const PILLAR_DEFS: PillarDef[] = [
  { cx: -3.5, cz: 0, baseR: 3.2, topR: 1.2, h: 22, yOff: -3, tiltX: 1.5, tiltZ: -0.5 },
  { cx: 1.5, cz: -1, baseR: 2.5, topR: 0.9, h: 16, yOff: -2, tiltX: -0.5, tiltZ: 0.8 },
  { cx: 5.5, cz: 1, baseR: 2.0, topR: 0.7, h: 12, yOff: -1, tiltX: -1.0, tiltZ: -0.3 },
];

function generatePillarPoints(
  { cx, cz, baseR, topR, h, yOff, tiltX, tiltZ }: PillarDef,
  count: number,
): PillarData {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];

  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const y = yOff + t * h;
    const localR = THREE.MathUtils.lerp(baseR, topR, t);

    const wobbleFreq = 3.0;
    const wobble =
      1.0 + 0.25 * Math.sin(t * wobbleFreq * Math.PI) * Math.cos(t * 2.7 * Math.PI + cx);
    const r = localR * wobble;

    let fingerBoost = 0;
    if (t > 0.85) {
      const ft = (t - 0.85) / 0.15;
      const angle = Math.atan2((i % 7) - 3, (i % 5) - 2);
      fingerBoost = Math.sin(angle * 3.0 + cx * 5.0) * ft * 1.5;
    }

    const angle = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 0.5) * (r + fingerBoost);

    let x = cx + Math.cos(angle) * dist + tiltX * t * t;
    let z = cz + Math.sin(angle) * dist + tiltZ * t * t;

    const surfaceness = dist / (r + 0.01);
    if (Math.random() > 0.4 && surfaceness > 0.7) {
      const pushOut = r * rand(0.85, 1.15);
      x = cx + Math.cos(angle) * pushOut + tiltX * t * t;
      z = cz + Math.sin(angle) * pushOut + tiltZ * t * t;
    }

    positions.push(x, y, z);

    const edge = surfaceness;
    let cr: number, cg: number, cb: number;

    if (edge > 0.6) {
      const rimT = (edge - 0.6) / 0.4;
      cr = THREE.MathUtils.lerp(0.55, 0.4, rimT) + t * 0.2;
      cg = THREE.MathUtils.lerp(0.3, 0.55, rimT) + t * 0.15;
      cb = THREE.MathUtils.lerp(0.15, 0.35, rimT);
    } else {
      cr = rand(0.2, 0.4);
      cg = rand(0.1, 0.2);
      cb = rand(0.05, 0.1);
    }

    if (t > 0.8) {
      const tipT = (t - 0.8) / 0.2;
      cr += tipT * 0.4;
      cg += tipT * 0.25;
      cb += tipT * 0.1;
    }

    colors.push(cr, cg, cb);
    sizes.push(rand(0.08, 0.35) * (1.0 + edge * 0.5));
  }

  return { positions, colors, sizes };
}

// ─── SHADERS ─────────────────────────────────────────

const starVert = /* glsl */ `
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (200.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const starFrag = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = exp(-d * d * 3.0);
    float core = smoothstep(0.3, 0.0, d);
    gl_FragColor = vec4(vColor * (glow * 0.5 + core * 1.5), glow + core);
  }
`;

const pillarVert = /* glsl */ `
  attribute float size;
  uniform float uTime;
  varying vec3 vColor;
  varying float vDist;

  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vColor = color;
    vec3 pos = position;
    float sway = sin(uTime * 0.15 + position.y * 0.3 + position.x * 0.2) * 0.08;
    float sway2 = cos(uTime * 0.12 + position.y * 0.2 + position.z * 0.3) * 0.06;
    pos.x += sway * (position.y * 0.05);
    pos.z += sway2 * (position.y * 0.04);
    float flicker = 0.9 + 0.1 * sin(uTime * 2.0 + hash(position) * 50.0);
    vColor *= flicker;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDist = -mv.z;
    gl_PointSize = size * (160.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const pillarFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vDist;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = exp(-d * d * 4.0);
    float glow = exp(-d * d * 1.5) * 0.5;
    float alpha = (core + glow) * 0.7;
    float fog = exp(-vDist * 0.01);
    gl_FragColor = vec4(vColor * (1.0 + core * 0.5), alpha * fog);
  }
`;

const dustVert = /* glsl */ `
  attribute float size;
  varying vec3 vColor;
  varying float vDist;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_PointSize = size * (180.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const dustFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vDist;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = exp(-d * d * 2.0) * 0.12;
    float fog = exp(-vDist * 0.015);
    gl_FragColor = vec4(vColor, alpha * fog);
  }
`;

const embeddedVert = /* glsl */ `
  attribute float size;
  uniform float uTime;
  varying vec3 vColor;
  void main() {
    vColor = color;
    float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + position.x * 10.0 + position.y * 7.0);
    vColor *= twinkle;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (250.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const embeddedFrag = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    vec2 uv = gl_PointCoord - 0.5;
    float angle = atan(uv.y, uv.x);
    float spike = pow(abs(cos(angle * 3.0)), 40.0) * exp(-d * 2.0) * 0.6;
    float core = exp(-d * d * 8.0);
    float halo = exp(-d * d * 1.5) * 0.3;
    float alpha = core + halo + spike;
    gl_FragColor = vec4(vColor * (1.0 + core), alpha);
  }
`;

const glowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFrag = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);
    vec3 warm = vec3(0.15, 0.06, 0.03) * exp(-d * 1.5);
    vec3 cool = vec3(0.03, 0.04, 0.08) * exp(-d * 2.0);
    float topGlow = exp(-(vUv.y - 1.0) * (vUv.y - 1.0) * 5.0) * 0.08;
    vec3 top = vec3(0.3, 0.2, 0.1) * topGlow;
    gl_FragColor = vec4(warm + cool + top, 0.6);
  }
`;

// ─── COMPONENTS ──────────────────────────────────────

export function StarField({ count = 6000 }: { count?: number }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 50 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const temp = Math.random();
      if (temp < 0.3) {
        col[i * 3] = 0.9;
        col[i * 3 + 1] = 0.75;
        col[i * 3 + 2] = 0.5;
      } else if (temp < 0.5) {
        col[i * 3] = 0.6;
        col[i * 3 + 1] = 0.7;
        col[i * 3 + 2] = 1.0;
      } else {
        col[i * 3] = 1.0;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.85;
      }
      sizes[i] = rand(0.3, 2.0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [count]);

  return (
    <points geometry={geometry}>
      <shaderMaterial
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={starVert}
        fragmentShader={starFrag}
      />
    </points>
  );
}

function DiffuseDust({ count = 180000 }: { count?: number }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = gaussian() * 25;
      pos[i * 3 + 1] = rand(-5, 30) + gaussian() * 5;
      pos[i * 3 + 2] = gaussian() * 20;
      const t = Math.random();
      col[i * 3] = rand(0.12, 0.25) * (1.0 + t * 0.3);
      col[i * 3 + 1] = rand(0.06, 0.15) * (1.0 + t * 0.2);
      col[i * 3 + 2] = rand(0.04, 0.12);
      sizes[i] = rand(0.1, 0.6);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [count]);

  return (
    <points geometry={geometry}>
      <shaderMaterial
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={dustVert}
        fragmentShader={dustFrag}
      />
    </points>
  );
}

function Pillars({ particlesPerPillar = 20000 }: { particlesPerPillar?: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);

  const geometry = useMemo(() => {
    const allPos: number[] = [];
    const allCol: number[] = [];
    const allSizes: number[] = [];

    for (const def of PILLAR_DEFS) {
      const d = generatePillarPoints(def, particlesPerPillar);
      allPos.push(...d.positions);
      allCol.push(...d.colors);
      allSizes.push(...d.sizes);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allPos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(allCol), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(allSizes), 1));
    return geo;
  }, [particlesPerPillar]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={pillarVert}
        fragmentShader={pillarFrag}
      />
    </points>
  );
}

export function EmbeddedStars({ count = 200 }: { count?: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);

  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(-15, 15);
      pos[i * 3 + 1] = rand(-3, 25);
      pos[i * 3 + 2] = rand(-10, 10);
      const warm = Math.random() > 0.5;
      col[i * 3] = warm ? rand(1.0, 1.2) : rand(0.7, 0.9);
      col[i * 3 + 1] = warm ? rand(0.85, 1.0) : rand(0.8, 1.0);
      col[i * 3 + 2] = warm ? rand(0.6, 0.8) : rand(0.9, 1.2);
      sizes[i] = rand(0.5, 2.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [count]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={embeddedVert}
        fragmentShader={embeddedFrag}
      />
    </points>
  );
}

function BackgroundGlow() {
  return (
    <mesh position={[0, 10, -25]}>
      <planeGeometry args={[120, 80]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        vertexShader={glowVert}
        fragmentShader={glowFrag}
      />
    </mesh>
  );
}

function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={0.5}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <Vignette offset={0.3} darkness={0.7} blendFunction={BlendFunction.NORMAL} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

// ─── SCENE ───────────────────────────────────────────

export function NebulaScene() {
  return (
    <>
      <OrbitControls
        target={[0, 6, 0]}
        enableDamping
        dampingFactor={0.05}
        minDistance={15}
        maxDistance={70}
        maxPolarAngle={Math.PI * 0.75}
        minPolarAngle={Math.PI * 0.15}
      />
      <fog attach='fog' args={['#030210', 30, 120]} />
      <color attach='background' args={['#020108']} />

      {/* <StarField count={1000} /> */}
      <DiffuseDust count={180000} />
      <Pillars particlesPerPillar={20000} />
      <EmbeddedStars count={200} />
      <BackgroundGlow />
      <PostProcessing />
    </>
  );
}

// ─── APP ─────────────────────────────────────────────

export default function GG() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas
        camera={{ position: [0, 8, 38], fov: 55, near: 0.1, far: 500 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: 0, toneMappingExposure: 1.1 }}
      >
        <Suspense fallback={null}>
          <NebulaScene />
        </Suspense>
      </Canvas>

      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'Courier New', monospace",
          fontSize: 12,
          color: 'rgba(180, 160, 130, 0.6)',
          letterSpacing: 3,
          textTransform: 'uppercase',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        Pillars of Creation · Drag to orbit
      </div>
    </div>
  );
}
