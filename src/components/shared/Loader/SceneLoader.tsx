/**
 * Loading.tsx — v1
 *
 * Global loading state for an R3F scene, exposed through a Context
 * Provider. Tracks two kinds of work:
 *
 *   1. THREE-loaded assets (useGLTF / useTexture / etc.) — picked up
 *      automatically via Drei's `useProgress`, which subscribes to
 *      `THREE.DefaultLoadingManager`.
 *
 *   2. Procedural assets (custom geometry, GLSL ShaderMaterials,
 *      particle systems) — registered through `useProcedural` and
 *      tracked alongside Drei loaders in the same aggregate.
 *
 * Architecture notes:
 *
 *   - A singleton `LoadingStore` lives at module scope. The Provider
 *     hands it down via Context. This shape lets `useProcedural.preload`
 *     be called before any component mounts (so all loads kick off in
 *     parallel rather than serializing on Suspense throws).
 *
 *   - Two notification channels: coarse events (file registered /
 *     completed / loading transition) trigger React re-renders;
 *     high-frequency synthetic-curve updates only mutate refs and are
 *     consumed by `getProgress()` in the LoadingScreen's rAF loop.
 *     The Canvas tree never re-renders for animation.
 *
 *   - The synthetic curve solves the same problem as the v1 HTML demo:
 *     a `THREE.LoadingManager` only emits per-file completion, and
 *     `xhr.lengthComputable` is usually false on cross-origin loads.
 *     An asymptotic `1 − e^(−t/τ)` curve, capped at 0.9, guarantees
 *     visible motion and is overridden by real bytes when available.
 *
 * Required deps:
 *   npm i three @react-three/fiber @react-three/drei
 *   npm i -D @types/three
 *   Tailwind already configured.
 */

'use client';

import {
  FC,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { LoadingScreen } from './LoadingScreen';

import { useProcedural } from '@/hooks/useProcedural';
import { useHyperspaceContext } from '@/providers/HyperspaceProvider';
import {
  SceneLoadingProvider,
  useSceneLoadingContext,
} from '@/providers/SceneLoaderProvider';

/* ============================================================
 * DEMO — procedural meshes + custom GLSL shader
 * ------------------------------------------------------------
 * Everything below this line exists only to exercise the loader.
 * Delete it (and the default export) when integrating into your
 * own app; keep the LoadingProvider / useProcedural / LoadingScreen
 * exports above.
 * ============================================================ */

const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewDir;

  void main () {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 viewPos  = viewMatrix * worldPos;

    vNormal   = normalize(normalMatrix * normal);
    vPosition = position;
    vViewDir  = normalize(-viewPos.xyz);

    gl_Position = projectionMatrix * viewPos;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewDir;

  // 3D value noise + fbm — cheap, looks fine for surface detail.
  float hash (vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise (vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm (vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main () {
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);

    vec3 p = vPosition * 1.8 + vec3(0.0, uTime * 0.15, 0.0);
    float n = fbm(p);

    vec3 dark   = vec3(0.05, 0.05, 0.07);
    vec3 mid    = vec3(0.40, 0.16, 0.08);
    vec3 accent = vec3(1.00, 0.42, 0.21);

    vec3 col = mix(dark, mid, smoothstep(0.30, 0.60, n));
    col = mix(col, accent, smoothstep(0.55, 0.78, n) * 0.7);
    col += accent * fresnel * 1.4;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- Asset factories (pure functions, no ctx required) -----------

function makeDisplacedIcosahedron(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 6);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n3 = (x: number, y: number, z: number) =>
    (Math.sin(x * 1.7 + y * 2.1) +
      Math.sin(y * 1.3 + z * 2.7) * 0.7 +
      Math.sin(z * 2.3 + x * 1.1) * 0.5) /
    2.2;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length();
    const d = n3(v.x * 1.4, v.y * 1.4, v.z * 1.4) * 0.18;
    v.normalize().multiplyScalar(len + d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

function makeParticleGeometry(): THREE.BufferGeometry {
  const N = 1500;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.7 + Math.random() * 0.9;
    arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = r * Math.cos(phi);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Kick everything off in parallel — one Suspense barrier waits on all.
useProcedural.preload<THREE.BufferGeometry>(
  'demo-geometry',
  makeDisplacedIcosahedron,
  1300,
);
useProcedural.preload<THREE.ShaderMaterial>('demo-material', makeShaderMaterial, 2000);
useProcedural.preload<THREE.BufferGeometry>('demo-particles', makeParticleGeometry, 800);

// --- Scene components --------------------------------------------

function CustomMesh() {
  const geometry = useProcedural<THREE.BufferGeometry>(
    'demo-geometry',
    makeDisplacedIcosahedron,
    1300,
  );
  const material = useProcedural<THREE.ShaderMaterial>(
    'demo-material',
    makeShaderMaterial,
    2000,
  );
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((s, dt) => {
    meshRef.current.rotation.y += dt * 0.2;
    meshRef.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.3) * 0.15;
    material.uniforms.uTime.value = s.clock.elapsedTime;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}

function ParticleField() {
  const geometry = useProcedural<THREE.BufferGeometry>(
    'demo-particles',
    makeParticleGeometry,
    800,
  );
  const ref = useRef<THREE.Points>(null!);

  useFrame((_, dt) => {
    ref.current.rotation.y -= dt * 0.05;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color={0xff6b35}
        size={0.012}
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

function Scene() {
  return (
    <>
      <CustomMesh />
      <ParticleField />
      <OrbitControls
        enableDamping
        dampingFactor={0.06}
        minDistance={1.8}
        maxDistance={6}
      />
    </>
  );
}

/* ============================================================
 * App — default export, ready to drop into any host page
 * ============================================================ */

type SceneLoaderProps = {
  children?: ReactNode;
};

export const SceneLoader: FC<SceneLoaderProps> = ({ children }) => {
  const { isLoading, getProgress } = useSceneLoadingContext();
  const [shouldReveal, setShouldReveal] = useState<boolean>(false);

  useLayoutEffect(() => {
    const shouldReveal = !isLoading && getProgress() >= 1;

    if (shouldReveal) {
      setTimeout(() => {
        setShouldReveal(true);
      }, 3000);
    }
  }, [getProgress, isLoading]);

  return (
    <>
      {/* <div className='fixed inset-0 bg-[#0a0a0c]'>
        <Canvas
          camera={{ position: [0, 0, 3.4], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div> */}
      {children}
      <LoadingScreen />
    </>
  );
};
