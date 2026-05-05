import { FC, RefObject, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

import {
  flashFragment,
  flashVertical,
  ironJetFragment,
  ironJetVertical,
  shockFragment,
  shockVertical,
  torusFragment,
  torusVertical,
  wingFragment,
  wingVertical,
} from './shader';

gsap.registerPlugin(ScrollTrigger);

// ─────────────────────────────────────────────────────────────
// ARCHITECTURE — BIDIRECTIONAL SCROLL + ENTRANCE ANIMATION
// ─────────────────────────────────────────────────────────────
//
// PHASE 1: WAITING — screen dark, hyperspace plays
//
// PHASE 2: ENTRANCE (~4s time-based GSAP timeline)
//   - Stellar flash → particles swirl out → settle into butterfly
//   - Camera pulls back, title reveals
//   - On complete: scroll is silently set to the "formed" anchor
//     point, then ScrollTrigger activates
//
// PHASE 3: SCROLL-CONTROLLED (bidirectional)
//   Layout: [100vh spacer] [400vh scroll-zone] [100vh work]
//
//   Scroll zone mapping (0% → 100%):
//     0–45%   → progressRef 0→1 (nebula forms)
//     45–55%  → progressRef stays at 1 (rest zone)
//     55–100% → camera pulls back, hero fades, work slides in
//
//   After entrance, scroll is set to ~50% of zone (formed state).
//   ↑ Scrolling UP = progressRef 1→0 = nebula REVERSES to core
//   ↓ Scrolling DOWN = camera zoom, transition to work section
//
// Integration:
//   <ButterflyNebulaPortfolio onReady={(trigger) => {
//     hyperspaceTimeline.eventCallback("onComplete", trigger);
//   }} />
//
// ─────────────────────────────────────────────────────────────

// ─── UTILS ───
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── WING GEOMETRY ───
const wingPoint = (side: number) => {
  const t = Math.random();
  const maxAngle = Math.PI * 0.55;
  const angle = (Math.random() - 0.5) * 2 * maxAngle * (0.3 + t * 0.7);
  const width = t * (3.5 + Math.sin(t * 5) * 0.8 + Math.random() * 1.5);
  const length = t * 12 * side;
  const clumpPhase = Math.sin(t * 8 + angle * 3) * 0.5 + 0.5;
  const radialSpread = width * (0.4 + clumpPhase * 0.6);
  const x = length + Math.sin(angle) * radialSpread * 0.3;
  const y = Math.cos(angle) * radialSpread;
  const z = Math.sin(angle * 1.3 + t * 2) * radialSpread * 0.6;
  const sCurve = Math.sin(t * Math.PI) * side * 0.8;

  return { x: x + sCurve * 0.3, y: y + sCurve, z, t, dist: Math.sqrt(y * y + z * z) };
};

const generateOrigins = (count: number) => {
  const o = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = rand(0.02, 0.35);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);

    o[i * 3] = r * Math.sin(ph) * Math.cos(th);
    o[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    o[i * 3 + 2] = r * Math.cos(ph);
  }

  return o;
};

const generateDelays = (count: number, min: number, max: number) => {
  const d = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    d[i] = rand(min, max);
  }

  return d;
};

// ─────────────────────────────────────────────────────────────
// SHARED UNIFORM HOOK
// ─────────────────────────────────────────────────────────────
const useFormationUniforms = (
  progressRef: RefObject<number>,
  enterPhaseRef: RefObject<number>,
) => {
  const u = useRef({
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uEnterPhase: { value: 1 },
  });

  useFrame(({ clock }) => {
    u.current.uTime.value = clock.getElapsedTime();
    u.current.uProgress.value = progressRef.current;
    u.current.uEnterPhase.value = enterPhaseRef.current;
  });

  return u;
};

// ─────────────────────────────────────────────────────────────
// PARTICLE COMPONENTS
// ─────────────────────────────────────────────────────────────

type ButterflyWingsProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
};

const ButterflyWings: FC<ButterflyWingsProps> = ({ progressRef, enterPhaseRef }) => {
  const count = 55000;
  const uniforms = useFormationUniforms(progressRef, enterPhaseRef);

  const palette = useMemo(
    () => [
      new THREE.Color(0.95, 0.9, 0.75),
      new THREE.Color(0.92, 0.82, 0.55),
      new THREE.Color(0.88, 0.7, 0.35),
      new THREE.Color(0.85, 0.6, 0.28),
      new THREE.Color(0.9, 0.75, 0.5),
      new THREE.Color(0.8, 0.55, 0.25),
      new THREE.Color(0.75, 0.4, 0.2),
      new THREE.Color(0.65, 0.3, 0.18),
      new THREE.Color(0.55, 0.22, 0.15),
      new THREE.Color(0.45, 0.18, 0.14),
    ],
    [],
  );

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const opa = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const side = THREE.MathUtils.randFloat(0, 1) < 0.5 ? 1 : -1;
      const wp = wingPoint(side);
      pos[i * 3] = wp.x;
      pos[i * 3 + 1] = wp.y;
      pos[i * 3 + 2] = wp.z;

      const ci = clamp(
        Math.floor(
          wp.t * (palette.length - 1) + (THREE.MathUtils.randFloat(0, 1) - 0.5) * 2,
        ),
        0,
        palette.length - 1,
      );
      const c = palette[ci];
      const br = 0.6 + (1 - wp.t) * 0.5;
      col[i * 3] = c.r * br;
      col[i * 3 + 1] = c.g * br;
      col[i * 3 + 2] = c.b * br;

      const cl = 0.5 + 0.5 * Math.sin(wp.x * 2.5 + wp.y * 3 + wp.z * 2);
      siz[i] = rand(0.08, 0.45) * (0.5 + cl * 0.5);
      opa[i] = rand(0.35, 0.85) * (0.5 + (1 - wp.t) * 0.4) * (0.5 + cl * 0.5);
    }

    return {
      pos,
      col,
      siz,
      opa,
      origins: generateOrigins(count),
      delays: generateDelays(count, 0.0, 0.3),
    };
  }, [palette]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
        <bufferAttribute
          args={[data.opa, 1]}
          attach='attributes-aOpacity'
          count={count}
        />
        <bufferAttribute
          args={[data.origins, 3]}
          attach='attributes-aOrigin'
          count={count}
        />
        <bufferAttribute
          args={[data.delays, 1]}
          attach='attributes-aDelay'
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={wingVertical}
        fragmentShader={wingFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

type ShockWavesProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
};

const ShockWaves: FC<ShockWavesProps> = ({ progressRef, enterPhaseRef }) => {
  const count = 6000;
  const uniforms = useFormationUniforms(progressRef, enterPhaseRef);

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const side = THREE.MathUtils.randFloat(0, 1) < 0.5 ? 1 : -1;
      const wp = wingPoint(side);

      if (wp.t > 0.4 && wp.dist > 1.5) {
        pos[i * 3] = wp.x;
        pos[i * 3 + 1] = wp.y;
        pos[i * 3 + 2] = wp.z;
      } else {
        const w2 = wingPoint(side);
        pos[i * 3] = w2.x * 1.05;
        pos[i * 3 + 1] = w2.y * 1.05;
        pos[i * 3 + 2] = w2.z * 1.05;
      }
      const w = rand(0.85, 1);
      col[i * 3] = w;
      col[i * 3 + 1] = w * rand(0.92, 1);
      col[i * 3 + 2] = w * rand(0.88, 1);
      siz[i] = rand(0.1, 0.35);
    }

    return {
      pos,
      col,
      siz,
      origins: generateOrigins(count),
      delays: generateDelays(count, 0.15, 0.4),
    };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
        <bufferAttribute
          args={[data.origins, 3]}
          attach='attributes-aOrigin'
          count={count}
        />
        <bufferAttribute
          args={[data.delays, 1]}
          attach='attributes-aDelay'
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={shockVertical}
        fragmentShader={shockFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

type DusttorusProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
};

const DustTorus: FC<DusttorusProps> = ({ progressRef, enterPhaseRef }) => {
  const count = 12000;
  const uniforms = useFormationUniforms(progressRef, enterPhaseRef);

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3),
      col = new Float32Array(count * 3);
    const siz = new Float32Array(count),
      opa = new Float32Array(count);
    const R = 2.5,
      r = 1.2;

    for (let i = 0; i < count; i++) {
      const th = THREE.MathUtils.randFloat(0, Math.PI * 2);
      const ph = THREE.MathUtils.randFloat(0, Math.PI * 2);
      const tr = r * (0.3 + THREE.MathUtils.randFloat(0, 0.7));

      pos[i * 3] = (R + tr * Math.cos(ph)) * Math.cos(th) * 0.8;
      pos[i * 3 + 1] = tr * Math.sin(ph) * 0.7;
      pos[i * 3 + 2] = (R + tr * Math.cos(ph)) * Math.sin(th) * 0.3;

      const dk = rand(0.02, 0.1);

      col[i * 3] = dk * 1.2;
      col[i * 3 + 1] = dk * 0.8;
      col[i * 3 + 2] = dk * 0.6;
      siz[i] = rand(0.15, 0.5);
      opa[i] = rand(0.6, 0.95);
    }

    return {
      pos,
      col,
      siz,
      opa,
      origins: generateOrigins(count),
      delays: generateDelays(count, 0.3, 0.5),
    };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
        <bufferAttribute
          args={[data.opa, 1]}
          attach='attributes-aOpacity'
          count={count}
        />
        <bufferAttribute
          args={[data.origins, 3]}
          attach='attributes-aOrigin'
          count={count}
        />
        <bufferAttribute
          args={[data.delays, 1]}
          attach='attributes-aDelay'
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={torusVertical}
        fragmentShader={torusFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
};

type CentralGlowProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
};

const CentralGlow: FC<CentralGlowProps> = ({ progressRef, enterPhaseRef }) => {
  const count = 5000;
  const uniforms = useFormationUniforms(progressRef, enterPhaseRef);

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const opa = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = THREE.MathUtils.randFloat(0, 2.5);
      const th = THREE.MathUtils.randFloat(0, Math.PI * 2);
      const ph = THREE.MathUtils.randFloat(-0.5, 0.5) * Math.PI * 0.6;

      pos[i * 3] = r * Math.cos(th) * Math.cos(ph) * 0.5;
      pos[i * 3 + 1] = r * Math.sin(ph) * 1.2;
      pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(ph) * 0.3;
      const v = rand(0.85, 1);
      col[i * 3] = v;
      col[i * 3 + 1] = v * rand(0.88, 0.98);
      col[i * 3 + 2] = v * rand(0.7, 0.88);
      siz[i] = rand(0.1, 0.4);
      opa[i] = (1 - (r / 2.5) ** 2) * rand(0.3, 0.6);
    }

    return {
      pos,
      col,
      siz,
      opa,
      origins: generateOrigins(count),
      delays: generateDelays(count, 0.0, 0.1),
    };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
        <bufferAttribute
          args={[data.opa, 1]}
          attach='attributes-aOpacity'
          count={count}
        />
        <bufferAttribute
          args={[data.origins, 3]}
          attach='attributes-aOrigin'
          count={count}
        />
        <bufferAttribute
          args={[data.delays, 1]}
          attach='attributes-aDelay'
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={wingVertical}
        fragmentShader={wingFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

type IronJetsProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
};

const IronJets: FC<IronJetsProps> = ({ progressRef, enterPhaseRef }) => {
  const count = 3000;
  const uniforms = useFormationUniforms(progressRef, enterPhaseRef);

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const pha = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const t = (THREE.MathUtils.randFloat(0, 1) - 0.5) * 2;
      const s = Math.sin(t * Math.PI) * 2.5;

      pos[i * 3] = t * 10 + rand(-0.4, 0.4);
      pos[i * 3 + 1] = s + rand(-0.3, 0.3);
      pos[i * 3 + 2] = rand(-0.3, 0.3);
      const iv = rand(0.6, 1);
      col[i * 3] = 0.3 * iv;
      col[i * 3 + 1] = 0.55 * iv;
      col[i * 3 + 2] = 0.8 * iv;
      siz[i] = rand(0.08, 0.25);
      pha[i] = THREE.MathUtils.randFloat(0, 1);
    }

    return {
      pos,
      col,
      siz,
      pha,
      origins: generateOrigins(count),
      delays: generateDelays(count, 0.4, 0.55),
    };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
        <bufferAttribute args={[data.pha, 1]} attach='attributes-aPhase' count={count} />
        <bufferAttribute
          args={[data.origins, 3]}
          attach='attributes-aOrigin'
          count={count}
        />
        <bufferAttribute
          args={[data.delays, 1]}
          attach='attributes-aDelay'
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={ironJetVertical}
        fragmentShader={ironJetFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

type HydrogenGlowProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
};

const HydrogenGlow: FC<HydrogenGlowProps> = ({ progressRef, enterPhaseRef }) => {
  const count = 4000;
  const uniforms = useFormationUniforms(progressRef, enterPhaseRef);
  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const opa = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const side = THREE.MathUtils.randFloat(0, 1) < 0.5 ? 1 : -1;
      const wp = wingPoint(side);

      pos[i * 3] = wp.x;
      pos[i * 3 + 1] = wp.y;
      pos[i * 3 + 2] = wp.z;
      const v = rand(0.5, 0.9);
      col[i * 3] = 0.3 * v;
      col[i * 3 + 1] = 0.45 * v;
      col[i * 3 + 2] = 0.9 * v;
      siz[i] = rand(0.15, 0.5);
      opa[i] = rand(0.03, 0.1);
    }

    return {
      pos,
      col,
      siz,
      opa,
      origins: generateOrigins(count),
      delays: generateDelays(count, 0.1, 0.35),
    };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
        <bufferAttribute
          args={[data.opa, 1]}
          attach='attributes-aOpacity'
          count={count}
        />
        <bufferAttribute
          args={[data.origins, 3]}
          attach='attributes-aOrigin'
          count={count}
        />
        <bufferAttribute
          args={[data.delays, 1]}
          attach='attributes-aDelay'
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={wingVertical}
        fragmentShader={wingFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

type StellarFlashProps = {
  flashRef: RefObject<number>;
};

const StellarFlash: FC<StellarFlashProps> = ({ flashRef }) => {
  const count = 2000;
  const uniforms = useRef({ uTime: { value: 0 }, uFlash: { value: 0 } });
  const shaderMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = rand(0.1, 2.5);
      const th = THREE.MathUtils.randFloat(0, 1) * Math.PI * 2;
      const ph = Math.acos(2 * THREE.MathUtils.randFloat(0, 1) - 1);

      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
      col[i * 3] = rand(0.9, 1);
      col[i * 3 + 1] = rand(0.85, 1);
      col[i * 3 + 2] = rand(0.9, 1);
      siz[i] = rand(0.1, 0.5);
    }
    return { pos, col, siz };
  }, []);

  useFrame(({ clock }) => {
    uniforms.current.uTime.value = clock.getElapsedTime();
    uniforms.current.uFlash.value = flashRef.current;
  });

  // useEffect(() => {
  //   if (shaderMaterialRef.current && uniforms.current) {
  //     shaderMaterialRef.current.uniforms = uniforms.current;
  //   }
  // }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          args={[data.pos, 3]}
          attach='attributes-position'
          count={count}
        />
        <bufferAttribute args={[data.col, 3]} attach='attributes-color' count={count} />
        <bufferAttribute args={[data.siz, 1]} attach='attributes-aSize' count={count} />
      </bufferGeometry>
      <shaderMaterial
        ref={shaderMaterialRef}
        uniforms={uniforms.current}
        vertexShader={flashVertical}
        fragmentShader={flashFragment}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

type CameraSetting = {
  x: number;
  y: number;
  z: number;
  lookX?: number;
  lookY?: number;
  lookZ?: number;
};

// ─── CAMERA RIG ───
type CameraRigProps = {
  cameraRef: RefObject<CameraSetting>;
};

const CameraRig: FC<CameraRigProps> = ({ cameraRef }) => {
  const { camera } = useThree();

  useFrame(() => {
    const c = cameraRef.current;

    if (!!c) {
      camera.position.set(
        camera.position.x + (c.x - camera.position.x) * 0.06,
        camera.position.y + (c.y - camera.position.y) * 0.06,
        camera.position.z + (c.z - camera.position.z) * 0.06,
      );

      camera.lookAt(c.lookX || 0, c.lookY || 0, c.lookZ || 0);
    }
  });

  return null;
};

// ─── LIGHTS ───
type AnimatedLightsProps = {
  progressRef: RefObject<number>;
};

const AnimatedLights: FC<AnimatedLightsProps> = ({ progressRef }) => {
  const coreRef = useRef<THREE.PointLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const p = progressRef.current;

    if (coreRef.current) {
      coreRef.current.intensity = (1.8 + Math.sin(t * 0.2) * 0.2) * (0.1 + p * 0.9);
    }

    if (rimRef.current) {
      rimRef.current.intensity = (0.5 + Math.cos(t * 0.25) * 0.1) * p;
    }
  });

  return (
    <>
      <ambientLight color='#0a0810' intensity={0.25} />
      <pointLight
        ref={coreRef}
        position={[0, 0, 0]}
        color='#fff5e0'
        intensity={1.8}
        distance={30}
      />
      <pointLight
        ref={rimRef}
        position={[12, 4, 5]}
        color='#ffcc88'
        intensity={0.5}
        distance={25}
      />
      <pointLight position={[-12, -3, 4]} color='#ffbb77' intensity={0.4} distance={25} />
      <pointLight position={[0, 6, 8]} color='#5577bb' intensity={0.3} distance={20} />
    </>
  );
};

// ─── SCENE ───
type ButterflyNebulaProps = {
  progressRef: RefObject<number>;
  enterPhaseRef: RefObject<number>;
  flashRef: RefObject<number>;
  cameraRef: RefObject<CameraSetting>;
};

export const ButterflyNebula: FC<ButterflyNebulaProps> = ({
  progressRef,
  enterPhaseRef,
  flashRef,
  cameraRef,
}) => (
  <group rotation={[0, 0, 0.4]}>
    <AnimatedLights progressRef={progressRef} />
    <fog attach='fog' args={['#020206', 15, 120]} />
    <StellarFlash flashRef={flashRef} />
    <CentralGlow progressRef={progressRef} enterPhaseRef={enterPhaseRef} />
    <ButterflyWings progressRef={progressRef} enterPhaseRef={enterPhaseRef} />
    <ShockWaves progressRef={progressRef} enterPhaseRef={enterPhaseRef} />
    <HydrogenGlow progressRef={progressRef} enterPhaseRef={enterPhaseRef} />
    <DustTorus progressRef={progressRef} enterPhaseRef={enterPhaseRef} />
    <IronJets progressRef={progressRef} enterPhaseRef={enterPhaseRef} />
    <CameraRig cameraRef={cameraRef} />
  </group>
);
