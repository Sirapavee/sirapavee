/**
 * Hyperspace.tsx (v3) — wrapper component with inside-out cutout reveal.
 *
 * No destination prop. The component wraps your single-page app's children;
 * during decelerating, the tunnel layer "opens up" via a CSS mask so the
 * children below are revealed inside-out through a growing hole at center.
 *
 * Designed for SPA-style apps where there's no separate route to render
 * during the warp — the same children are visible before, during (covered),
 * and after the sequence.
 *
 * Usage:
 *
 *   import { Hyperspace, useHyperspace } from './Hyperspace';
 *
 *   function App() {
 *     return (
 *       <Hyperspace>
 *         <Router />
 *       </Hyperspace>
 *     );
 *   }
 *
 *   function CTAButton() {
 *     const { jump, isActive } = useHyperspace();
 *     return (
 *       <button
 *         disabled={isActive}
 *         onClick={() =>
 *           jump({
 *             onArrival: () => {
 *               // cruising → decelerating boundary; the screen is covered.
 *               // do your scroll / state swap / route change here.
 *               document.getElementById('section-2')?.scrollIntoView();
 *             },
 *             onComplete: () => {
 *               // fires after the sequence ends + unmountDelayMs.
 *             },
 *           })
 *         }
 *       >
 *         Begin Journey
 *       </button>
 *     );
 *   }
 *
 * Required deps:
 *   npm i react react-dom three @react-three/fiber @react-three/drei
 *   npm i -D @types/three @types/react @types/react-dom typescript tailwindcss
 */

import { FC, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { SPIN_MAX, SVG_NS } from './const';
import { getWarp } from './utils';

import {
  HyperspacePhase,
  HyperspaceProps,
  useHyperspaceContext,
} from '@/providers/HyperspaceProvider';

/* ============================================================
   SHADER (relativistic stars on a back-side cylinder)
============================================================ */

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uMotion;
uniform float uStretch;
uniform float uIntensity;
uniform float uShake;
uniform float uChargeGlow;     // 0..1 — paints a bright energetic fill during charging
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec2 vUv;
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
void main() {
  vec2 uv = vUv;
  uv.x += sin(uTime * 60.0) * 0.001 * uShake;
  uv.y += cos(uTime * 73.0) * 0.001 * uShake;
  float depthGrad = smoothstep(0.0, 1.0, uv.y);
  vec3 base = mix(uColorA * 0.4, uColorA * 1.1, depthGrad);
  vec3 col = base;
  for (int i = 0; i < 80; i++) {
    float fi = float(i);
    vec2 starPos;
    starPos.x = hash11(fi * 1.31);
    float ry = hash11(fi * 2.77);
    starPos.y = pow(ry, 0.45);
    float starSpeed = 0.6 + hash11(fi * 4.13) * 1.6;
    starPos.y = mod(starPos.y - uTime * starSpeed * uMotion * 0.5, 1.0);
    vec2 d = uv - starPos;
    d.x = abs(d.x); d.x = min(d.x, 1.0 - d.x);
    d.y = abs(d.y); d.y = min(d.y, 1.0 - d.y);
    float xRadius = 0.0018;
    float yRadius = mix(0.0018, 0.085, uStretch);
    d.x /= xRadius; d.y /= yRadius;
    float dist = length(d);
    float intensity = exp(-dist * dist * 1.0);
    float bright = 0.55 + hash11(fi * 5.71) * 1.55;
    vec3 starColor = mix(uColorB, uColorC, hash11(fi * 7.31));
    col += intensity * starColor * bright * 1.9;
  }
  float vp = smoothstep(0.85, 1.0, uv.y);
  col += vp * uColorC * 0.3 * mix(0.4, 1.6, uMotion);

  // CHARGE GLOW — bright energetic plasma fill that's visible during
  // charging, when the rift first opens and would otherwise look like
  // a black hole. Bright cyan-white plasma with subtle radial structure
  // centered around uv = (0.5, 0.5). Fades to zero before jumping starts.
  if (uChargeGlow > 0.001) {
    // Distance from cylinder center in screen-ish space
    vec2 cuv = uv - vec2(0.5, 0.5);
    cuv.x *= 6.2831;  // x is angular, normalize roughly
    float r = length(cuv);
    // Bright core, falloff to edges
    float core = exp(-r * r * 1.2);
    // Pulsing energy texture
    float pulse = 0.85 + 0.15 * sin(uTime * 3.5 + r * 4.0);
    vec3 plasma = mix(uColorB * 1.6, uColorC * 1.4, core);
    col += plasma * core * pulse * uChargeGlow * 1.4;
    // Add a soft hot center
    col += uColorC * pow(core, 3.0) * uChargeGlow * 0.9;
  }

  col *= uIntensity;
  col = col / (1.0 + col * 0.15);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ============================================================
   THE TUNNEL MESH — lives inside R3F <Canvas>
============================================================ */

interface TunnelMeshProps {
  phaseRef: React.MutableRefObject<HyperspacePhase>;
  progressFnRef: React.MutableRefObject<() => number>;
  spinAccumRef: React.MutableRefObject<number>;
}

function TunnelMesh({ phaseRef, progressFnRef, spinAccumRef }: TunnelMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { camera, gl } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMotion: { value: 0 },
      uStretch: { value: 0 },
      uIntensity: { value: 1 },
      uShake: { value: 0 },
      uChargeGlow: { value: 0 },
      uColorA: { value: new THREE.Color(0x020615) },
      uColorB: { value: new THREE.Color(0x4d80ff) },
      uColorC: { value: new THREE.Color(0xc8f0ff) },
    }),
    [],
  );

  useEffect(() => {
    gl.setClearColor(0x020615, 1);
  }, [gl]);

  useFrame((_, dt) => {
    const t = performance.now() / 1000;
    const phase = phaseRef.current;
    const p = progressFnRef.current();
    const safeDt = Math.min(0.05, dt);

    if (matRef.current) {
      const u = matRef.current.uniforms;
      u.uTime.value = t;

      const warp = getWarp(phase, p);
      u.uMotion.value = warp;
      u.uStretch.value = warp;

      spinAccumRef.current += safeDt * warp * SPIN_MAX;
      if (phase === 'idle') spinAccumRef.current = 0;

      let fov = 75;
      let camZ = 0;
      let shake = 0;
      let chargeGlow = 0;
      const intensity = 0.85 + warp * 0.65;

      switch (phase) {
        case 'idle':
          fov = 75;
          camZ = 0;
          shake = 0;
          chargeGlow = 0;
          camera.position.set(0, 0, 0);
          camera.rotation.set(0, 0, 0);
          break;
        case 'charging': {
          fov = 75;
          camZ = 0;
          shake = 0;
          // Charge glow: bright early (rift just opening, otherwise looks
          // like a black hole), fading as the rift fully opens by p≈0.85.
          // After that, the star tunnel takes over visually.
          chargeGlow = Math.max(0, 1 - p / 0.85);
          camera.position.set(0, 0, 0);
          camera.rotation.set(0, 0, 0);
          break;
        }
        case 'jumping': {
          const e = Math.pow(p, 1.5);
          camZ = -e * 6;
          fov = 75 + e * 30;
          shake = 0.4 + e * 0.6;
          camera.position.set(0, 0, camZ);
          camera.rotation.set(0, 0, 0);
          break;
        }
        case 'cruising': {
          fov = 105;
          camZ = -6;
          shake = 1.0;
          // x/y jitter only — no roll. Camera Z rotation makes the cylinder's
          // discrete stars appear to rotate with the camera, which reads as
          // tunnel tumbling.
          //   camera.position.x = Math.sin(t * 47) * 0.012;
          //   camera.position.y = Math.cos(t * 53) * 0.012;
          //   camera.position.z = camZ;
          camera.position.set(Math.sin(t * 47) * 0.012, Math.cos(t * 53) * 0.012, camZ);
          camera.rotation.z = 0;
          break;
        }
        case 'decelerating': {
          const camEase = Math.pow(p, 1.4);
          camZ = -6 - camEase * 16;
          fov = 105 - p * 20;
          shake = (1 - p) * 0.6;
          camera.position.set(
            Math.sin(t * 47) * 0.012 * (1 - p),
            Math.cos(t * 53) * 0.012 * (1 - p),
            camZ,
          );
          camera.rotation.z = 0;
          break;
        }
      }

      u.uIntensity.value = intensity;
      u.uShake.value = shake;
      u.uChargeGlow.value = chargeGlow;

      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        (camera as THREE.PerspectiveCamera).fov = fov;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    }

    if (meshRef.current) {
      meshRef.current.rotation.z = spinAccumRef.current;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -38]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[2.4, 2.4, 80, 96, 64, true]} />
      <shaderMaterial
        ref={matRef}
        side={THREE.BackSide}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
      />
    </mesh>
  );
}

/* ============================================================
   THE MAIN COMPONENT
============================================================ */

export const Hyperspace: FC<HyperspaceProps> = ({
  children,
  slashAngleDeg = -30,
  showStateBar = true,
  className,
}) => {
  const {
    phase,
    lockLayerRef,
    hyperspaceRef,
    sparkRef,
    jetsContainerRef,
    phaseRef,
    progressFnRef,
    spinAccumRef,
    dims,
    portalRimRef,
    chromaticRef,
    motionStreakRef,
  } = useHyperspaceContext();

  /* ---------------- Render ---------------- */
  const slashTransform = `translate(-50%, -50%) rotate(${slashAngleDeg}deg)`;
  const showOverlay = phase !== 'idle';

  const inlineStyles = (
    <style>{`
        @keyframes hs-blink-cursor {
          0%, 60%   { opacity: 1; }
          70%, 100% { opacity: 0; }
        }
        .hs-blink-cursor { animation: hs-blink-cursor 1.4s steps(2) infinite; }
      `}</style>
  );

  return (
    <>
      {inlineStyles}

      {/* The user's app — always rendered, always reactive when idle */}
      <div className={`relative ${className ?? ''}`} style={{ zIndex: 0 }}>
        {children}
      </div>

      {showOverlay && (
        <>
          {/* Modal lock — captures clicks during warp.
                Released when the inside-out reveal is meaningfully open. */}
          <div
            ref={lockLayerRef}
            className='fixed inset-0'
            style={{
              zIndex: 40,
              pointerEvents: 'auto',
              background: 'transparent',
            }}
          />

          {/* HYPERSPACE — the tunnel R3F canvas.
                clip-path drives the rift OPENING during charging.
                mask-image drives the inside-out REVEAL during late decelerating. */}
          <div
            ref={hyperspaceRef}
            className='pointer-events-none fixed inset-0 bg-black'
            style={{
              zIndex: 50,
              clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%)',
              willChange: 'clip-path, mask-image',
              filter:
                phase === 'charging'
                  ? 'drop-shadow(0 0 14px rgba(108,240,255,0.45))'
                  : undefined,
              // mask defaults to none — set per-frame during decelerating
              maskImage: 'none',
              WebkitMaskImage: 'none',
            }}
          >
            <Canvas
              gl={{ alpha: false, antialias: true }}
              dpr={[1, 2]}
              camera={{ fov: 75, near: 0.01, far: 200, position: [0, 0, 0] }}
            >
              <TunnelMesh
                phaseRef={phaseRef}
                progressFnRef={progressFnRef}
                spinAccumRef={spinAccumRef}
              />
            </Canvas>
          </div>

          {/* Motion-blur streak — diagonal smear during early charging */}
          <div
            ref={motionStreakRef}
            className='pointer-events-none fixed top-1/2 left-1/2'
            style={{
              zIndex: 51,
              opacity: 0,
              width: '220vmax',
              height: '16vmin',
              transform: slashTransform,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(80,150,220,0.12) 22%, rgba(140,220,255,0.35) 45%, rgba(200,240,255,0.55) 50%, rgba(140,220,255,0.35) 55%, rgba(80,150,220,0.12) 78%, transparent 100%)',
              filter: 'blur(28px)',
              mixBlendMode: 'screen',
              willChange: 'opacity',
            }}
          />

          {/* Spark — diagonal impact streak at start of charging */}
          <div
            ref={sparkRef}
            className='pointer-events-none fixed top-1/2 left-1/2'
            style={{
              zIndex: 52,
              width: '12px',
              height: '320px',
              marginLeft: '-6px',
              opacity: 0,
              background:
                'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,1) 0%, rgba(220,240,255,0.95) 10%, rgba(140,220,255,0.6) 28%, rgba(80,160,220,0.25) 50%, transparent 75%)',
              filter: 'blur(1px)',
              transformOrigin: '50% 50%',
              transform: slashTransform,
            }}
          />

          {/* SVG plasma jets — fractal lightning trees */}
          <svg
            ref={jetsContainerRef}
            className='pointer-events-none fixed inset-0'
            style={{
              zIndex: 53,
              mixBlendMode: 'screen',
              overflow: 'visible',
            }}
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            width={dims.w}
            height={dims.h}
            xmlns={SVG_NS}
          >
            <defs>
              <linearGradient id='hsJetGrad' x1='0%' y1='100%' x2='0%' y2='0%'>
                <stop offset='0%' stopColor='#ffffff' stopOpacity='1.0' />
                <stop offset='12%' stopColor='#cce8ff' stopOpacity='0.95' />
                <stop offset='32%' stopColor='#c099ff' stopOpacity='0.85' />
                <stop offset='58%' stopColor='#ff66c8' stopOpacity='0.7' />
                <stop offset='82%' stopColor='#a040d0' stopOpacity='0.45' />
                <stop offset='100%' stopColor='#601090' stopOpacity='0.0' />
              </linearGradient>
              <linearGradient id='hsJetGradHalo' x1='0%' y1='100%' x2='0%' y2='0%'>
                <stop offset='0%' stopColor='#ffffff' stopOpacity='0.8' />
                <stop offset='22%' stopColor='#a0c0ff' stopOpacity='0.55' />
                <stop offset='55%' stopColor='#c060e0' stopOpacity='0.4' />
                <stop offset='100%' stopColor='#601090' stopOpacity='0.0' />
              </linearGradient>
            </defs>
          </svg>

          {/* Chromatic edge bleed — peak charging */}
          <div
            ref={chromaticRef}
            className='pointer-events-none fixed inset-0'
            style={{
              zIndex: 54,
              opacity: 0,
              background:
                'radial-gradient(ellipse 30vmin 8vmin at 50% 50%, rgba(255,80,120,0.25) 0%, transparent 60%)',
              filter: 'blur(8px)',
              mixBlendMode: 'screen',
              transform: `translate(-3px, 2px) rotate(${slashAngleDeg}deg)`,
            }}
          />

          {/* Portal rim — bright ring at the inside-out hole boundary */}
          <div
            ref={portalRimRef}
            className='pointer-events-none fixed inset-0'
            style={{
              zIndex: 69,
              opacity: 0,
              mixBlendMode: 'screen',
              background:
                'radial-gradient(circle at 50% 50%, transparent 0%, transparent calc(var(--rim) - 6%), rgba(255,255,255,0.85) calc(var(--rim) - 1%), rgba(180,230,255,0.55) var(--rim), transparent calc(var(--rim) + 4%))',
              ['--rim' as string]: '0%',
            }}
          />

          {/* CRT scanlines */}
          <div
            className='pointer-events-none fixed inset-0'
            style={{
              zIndex: 95,
              mixBlendMode: 'multiply',
              background:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0) 4px)',
            }}
          />

          {showStateBar && <StateBar phase={phase} />}
        </>
      )}
    </>
  );
};

/* ============================================================
   STATE BAR HUD
============================================================ */

function StateBar({ phase }: { phase: HyperspacePhase }) {
  const phases: HyperspacePhase[] = ['charging', 'jumping', 'cruising', 'decelerating'];
  const labels: Record<HyperspacePhase, string> = {
    idle: '— STANDBY —',
    charging: '> RIFT GENESIS',
    jumping: '> WARP ENGAGED',
    cruising: '> CRUISING',
    decelerating: '> APPROACHING EXIT',
  };
  const phaseIdx = ['idle', 'charging', 'jumping', 'cruising', 'decelerating'].indexOf(
    phase,
  );
  return (
    <div
      className='fixed top-4 left-1/2 flex -translate-x-1/2 items-center gap-1 text-[10px] tracking-[0.25em] uppercase sm:top-6'
      style={{ zIndex: 90, color: '#6cf0ff' }}
    >
      {phases.map((s, i) => {
        const idx = i + 1;
        const active = idx === phaseIdx;
        const done = idx < phaseIdx && phaseIdx > 0;
        return (
          <div
            key={s}
            className='h-1.5 w-7 transition-all duration-300'
            style={{
              background: active || done ? '#6cf0ff' : '#2a7888',
              opacity: active ? 1 : done ? 0.5 : 0.3,
              boxShadow: active ? '0 0 10px #6cf0ff' : undefined,
              clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)',
            }}
          />
        );
      })}
      <div
        className='ml-3.5 min-w-[180px] sm:min-w-[200px]'
        style={{ textShadow: '0 0 6px #6cf0ff' }}
      >
        {labels[phase]}
      </div>
    </div>
  );
}
