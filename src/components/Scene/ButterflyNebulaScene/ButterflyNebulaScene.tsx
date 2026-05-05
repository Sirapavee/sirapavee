import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

import { ButterflyNebula } from './ButterflyNebula';

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
//   <ButterflyNebulaScene onReady={(trigger) => {
//     hyperspaceTimeline.eventCallback("onComplete", trigger);
//   }} />
//
// ─────────────────────────────────────────────────────────────

type CameraSetting = {
  x: number;
  y: number;
  z: number;
  lookX?: number;
  lookY?: number;
  lookZ?: number;
};

// ─────────────────────────────────────────────────────────────
// SCROLL ZONE BREAKPOINTS
// ─────────────────────────────────────────────────────────────
// Total scroll-zone: 400vh
//
//   0%–45%   = FORMATION BAND  → progressRef 0→1
//   45%–55%  = REST BAND       → progressRef = 1 (nebula stable)
//   55%–100% = TRANSITION BAND → camera zoom, hero fade, work in
//
// After entrance, scroll jumps to ~50% (center of rest band).
// Scrolling UP enters formation band → reverse.
// Scrolling DOWN enters transition band → work section.
// ─────────────────────────────────────────────────────────────

const FLASH_MIDDLE = 0.04;
const FLASH_END = 0.12;
const FORMATION_START = 0.03;
const FORMATION_END = 0.16;
const REST_END = 0.3;
const TRANSITION_END = 0.42;

type ButterflyNebulaSceneProps = {
  onReady?: (callback: () => void) => void;
};

export const ButterflyNebulaScene: FC<ButterflyNebulaSceneProps> = ({ onReady }) => {
  const progressRef = useRef(0);
  const enterPhaseRef = useRef(0);
  const flashRef = useRef(0);
  const cameraRef = useRef<CameraSetting>({
    x: 0,
    y: 0,
    z: 42,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
  });
  const [phase, setPhase] = useState('waiting');
  const scrollTriggersRef = useRef<ScrollTrigger[]>([]);

  // ─── SCROLL SYSTEM ───
  const initScrollSystem = useCallback(() => {
    const zoneEl = document.querySelector('#z-scroll-spacer');
    if (!zoneEl) {
      return;
    }

    const masterTrigger = ScrollTrigger.create({
      trigger: '#z-scroll-spacer',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.5,
      onUpdate: (self) => {
        const p = self.progress;

        console.log(p, enterPhaseRef.current, progressRef.current, flashRef.current);

        // NOTE: progresss reset upon reverse scroll back to the topmost point
        if (
          (p <= FORMATION_START - 0.01 &&
            (enterPhaseRef.current !== 0 || progressRef.current !== 0)) ||
          p > TRANSITION_END
        ) {
          enterPhaseRef.current = 0;
          flashRef.current = 0;
          progressRef.current = 0;
        }

        // NOTE: stellar flash (formation start 3%): flashRef 0→1 then 1→0
        if (p > FORMATION_START && p <= FLASH_MIDDLE) {
          const formationProgress =
            (p - FORMATION_START) / (FLASH_MIDDLE - FORMATION_START); // 0→1
          flashRef.current = formationProgress;
        } else if (p > FLASH_MIDDLE && p <= FLASH_END) {
          const formationProgress = 1 - (p - FLASH_MIDDLE) / (FLASH_END - FLASH_MIDDLE); // 1→0
          flashRef.current = formationProgress;
        }

        // NOTE: turbulence fadeout (2-4%): enterPhaseRef 0→1
        if (p > FORMATION_START - 0.01 && p <= FORMATION_END - 0.01) {
          const formationProgress =
            (p - FORMATION_START - 0.01) / (FORMATION_END - 0.01 - FORMATION_START); // 0→1
          enterPhaseRef.current = formationProgress;
        }

        // NOTE: formation start (3–5%): progressRef 0→1 = nebula forms
        if (p > FORMATION_START && p <= FORMATION_END) {
          const formationProgress =
            (p - FORMATION_START) / (FORMATION_END - FORMATION_START); // 0→1
          progressRef.current = formationProgress;
          enterPhaseRef.current = 1.0 - formationProgress;

          cameraRef.current.z = 10;
        }

        // NOTE: rest state (5–30%): nebula stable at progressRef 1, camera static
        else if (p > FORMATION_END && p <= REST_END) {
          progressRef.current = 1;
          enterPhaseRef.current = 0;

          cameraRef.current.z = 10;
        }

        // NOTE: transition state (30–41%): zoom in to get through the nebula center
        else if (p > REST_END && p <= TRANSITION_END - 0.01) {
          const transitionProgress = (p - REST_END) / (TRANSITION_END - 0.01 - REST_END); // 0→1

          progressRef.current = 1 - transitionProgress; // reverse nebula formation
          enterPhaseRef.current = transitionProgress;

          // NOTE: for cool fade out effect
          //   cameraRef.current.z = 10 - transitionProgress * 10;

          // NOTE: for go though and dissolve effect
          cameraRef.current.z = 0;
        }
      },
    });
    scrollTriggersRef.current.push(masterTrigger);
  }, []);

  // ─── ENTRANCE ANIMATION ───
  const triggerFormation = useCallback(() => {
    if (phase !== 'waiting') {
      return;
    }
    setPhase('entering');

    const tl = gsap.timeline({
      onComplete: () => {
        setPhase('scrolling');

        // Small delay for scroll to settle, then init triggers
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            initScrollSystem();
          });
        });
      },
    });
  }, [phase, initScrollSystem]);

  // Expose trigger
  useEffect(() => {
    if (onReady) {
      onReady(triggerFormation);
    }
  }, [onReady, triggerFormation]);

  // Auto-trigger fallback for testing (remove when integrating hyperspace)
  useEffect(() => {
    if (!onReady && phase === 'waiting') {
      const t = setTimeout(triggerFormation, 1500);
      return () => clearTimeout(t);
    }
  }, [onReady, phase, triggerFormation]);

  // Cleanup
  useEffect(() => {
    return () => {
      scrollTriggersRef.current.forEach((t) => t && t.kill());
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <ButterflyNebula
      progressRef={progressRef}
      enterPhaseRef={enterPhaseRef}
      flashRef={flashRef}
      cameraRef={cameraRef}
    />
  );
};
