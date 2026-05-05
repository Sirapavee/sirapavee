import { HyperspacePhase } from '@/providers/HyperspaceProvider';

export type JetSpec = {
  birth: number;
  offsetAlong: number;
  offsetAcross: number;
  angleDeg: number;
  length: number;
  lifetime: number;
  seed: number;
};

export const getJetSpecs = (slashAngleDeg: number): JetSpec[] => [
  {
    birth: 0.12,
    offsetAlong: -160,
    offsetAcross: 0,
    angleDeg: slashAngleDeg + 90 + 8,
    length: 360,
    lifetime: 0.55,
    seed: 11,
  },
  {
    birth: 0.2,
    offsetAlong: 60,
    offsetAcross: 0,
    angleDeg: slashAngleDeg + 90 - 12,
    length: 280,
    lifetime: 0.5,
    seed: 23,
  },
  {
    birth: 0.32,
    offsetAlong: 220,
    offsetAcross: 0,
    angleDeg: slashAngleDeg + 90 + 5,
    length: 320,
    lifetime: 0.55,
    seed: 41,
  },
  {
    birth: 0.16,
    offsetAlong: -100,
    offsetAcross: 0,
    angleDeg: slashAngleDeg - 90 + 10,
    length: 300,
    lifetime: 0.5,
    seed: 67,
  },
  {
    birth: 0.28,
    offsetAlong: 140,
    offsetAcross: 0,
    angleDeg: slashAngleDeg - 90 - 8,
    length: 260,
    lifetime: 0.48,
    seed: 89,
  },
];

export const DEFAULT_DURATIONS: Record<Exclude<HyperspacePhase, 'idle'>, number> = {
  charging: 2800,
  jumping: 1500,
  cruising: 4000,
  decelerating: 3000,
};

/* Hole reveal threshold + curve.
   p < threshold → tunnel fully covers (no hole yet, viewer still sees warp)
   p >= threshold → hole grows from 0% to 150% radius with steep ease-in
   Same numbers as v2's destination growth, but applied as a mask cutout. */
export const HOLE_THRESHOLD = 0.78;
export const HOLE_GROWTH_POWER = 3.0;
export const HOLE_FINAL_RADIUS = 150;

/* Cylinder rotation is disabled (was 0.4 in v11).
   Reason: with a discrete-star shader (only 80 stars in the cylinder),
   rotating the geometry causes individual stars to visibly sweep across
   the view, which reads as "the whole tube is rotating" rather than
   "we're flying through it." The hyperspace sensation comes from the
   streaks' axial motion (uMotion), not from rotation. */
export const SPIN_MAX = 0;
export const SVG_NS = 'http://www.w3.org/2000/svg';
