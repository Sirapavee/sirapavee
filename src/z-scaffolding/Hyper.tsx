'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { getStarRandomHexColor } from '../components/Scene/SpaceScene/utils';

import { useStateContext } from '@/providers/StateProvider';

const STAR_COUNT = 1000;

export const HyperSpace = () => {
  const { state } = useStateContext();
  const { spaceConfigRef } = state.ref;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // ── per-star state (flat typed arrays for cache-friendly iteration) ──
  const stars = useRef({
    // positions
    px: new Float32Array(STAR_COUNT),
    py: new Float32Array(STAR_COUNT),
    pz: new Float32Array(STAR_COUNT),

    // scales
    sx: new Float32Array(STAR_COUNT).fill(1),
    sy: new Float32Array(STAR_COUNT).fill(1),
    sz: new Float32Array(STAR_COUNT).fill(1),

    // cleaning mode wind-down trackers (per-star, matches your useRef approach)
    zDiffPos: new Float32Array(STAR_COUNT),
    zDiffScale: new Float32Array(STAR_COUNT),
    cleaningInitialized: new Uint8Array(STAR_COUNT),

    // start mode delay tracker (replaces setTimeout — counts frames per star)
    delayFrames: new Float32Array(STAR_COUNT),
    hasAccelerated: new Uint8Array(STAR_COUNT),
  });

  // ── initialize random positions + colors once ──
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const s = stars.current;
    const color = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i++) {
      s.px[i] = THREE.MathUtils.randFloatSpread(100);
      s.py[i] = THREE.MathUtils.randFloatSpread(100);
      s.pz[i] = THREE.MathUtils.randFloatSpread(100);

      // set per-instance color
      color.set(getStarRandomHexColor());
      mesh.setColorAt(i, color);

      // initial matrix
      dummy.position.set(s.px[i], s.py[i], s.pz[i]);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dummy]);

  useFrame(() => {
    const mesh = meshRef.current;
    const config = spaceConfigRef?.current;
    if (!mesh || !config) return;

    const s = stars.current;
    const mode = config.mode;
    const configPosZ = config.configValue['position.z'] ?? 1;
    const configScaleZ = config.configValue['scale.z'] ?? 0.5;

    for (let i = 0; i < STAR_COUNT; i++) {
      // ── idle ──
      if (mode === 'idle') {
        s.pz[i] += 0.1;

        // reset start/cleaning state so next cycle is fresh
        s.delayFrames[i] = 0;
        s.hasAccelerated[i] = 0;
        s.cleaningInitialized[i] = 0;
      }

      // ── fade out approaching camera (your z > 25 → scale 0) ──
      if (s.pz[i] > 26) {
        s.sx[i] = 0;
        s.sy[i] = 0;
        s.sz[i] = 0;
      }

      // ── grow back before wrap (your z > 45 → scale += 0.5) ──
      if (s.pz[i] > 45) {
        s.sx[i] += 0.5;
        s.sy[i] += 0.5;
        s.sz[i] += 0.5;
      }

      // ── wrap around ──
      if (s.pz[i] > 50) {
        s.pz[i] = -50;
      }

      // ── clamp scale back to 1 (your scale.x === 1 check) ──
      if (s.sx[i] >= 1) {
        s.sx[i] = 1;
        s.sy[i] = 1;
        s.sz[i] = 1;
      }

      // ── start (hyperspace engage) ──
      if (mode === 'start') {
        // phase 1: stretch z immediately every frame
        s.sz[i] += configScaleZ;
        s.pz[i] += 0;

        // phase 2: ~1 second delay then accelerate
        s.delayFrames[i]++;
        if (s.delayFrames[i] >= 60) {
          s.hasAccelerated[i] = 1;
        }

        // if (s.hasAccelerated[i]) {
        //   s.pz[i] += configPosZ;
        // }

        setTimeout(() => {
          s.pz[i] += configPosZ;
        }, 1000);
      }

      // ── cleaning (hyperspace disengage) ──
      if (mode === 'cleaning') {
        // initialize wind-down values once (matches your useEffect + useRef pattern)
        if (!s.cleaningInitialized[i]) {
          s.zDiffPos[i] = configPosZ;
          s.zDiffScale[i] = configScaleZ;
          s.cleaningInitialized[i] = 1;
        }

        // drain loops — same as your while loops, runs to completion in one frame
        while (s.zDiffPos[i] > 0.1) {
          s.pz[i] += s.zDiffPos[i];
          s.zDiffPos[i] -= 0.1;
        }

        while (s.zDiffScale[i] > 0) {
          s.sz[i] += s.zDiffScale[i];
          s.zDiffScale[i] -= 0.01;
        }
      }

      // ── stop: do nothing ──

      // ── update instance matrix ──
      dummy.position.set(s.px[i], s.py[i], s.pz[i]);
      dummy.scale.set(s.sx[i], s.sy[i], s.sz[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshBasicMaterial color='white' />
    </instancedMesh>
  );
};
