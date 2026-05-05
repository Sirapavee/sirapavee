/**
 * StarfieldProbe — defaults
 *
 * Every magic number from the original HTML version lives here. If you want
 * to tweak the look, this is the file to edit. Per-call overrides via props
 * deep-merge over these.
 */

export const DEFAULT_BREAKPOINTS = {
  // mobile-first: each name maps to its MIN width in CSS pixels
  mobile: 0,
  tablet: 720,
  desktop: 1280,
  wide: 1920,
};

/**
 * JWST-ish palette weighted toward blue-white with rare warm tones.
 * Each entry is [r, g, b, weight]. Weights don't have to sum to 1.
 */
export const DEFAULT_PALETTE = [
  [255, 255, 255, 0.55],
  [240, 248, 255, 0.19],
  [220, 232, 255, 0.12],
  [200, 220, 255, 0.06],
  [180, 210, 255, 0.03],
  [255, 240, 210, 0.03],
  [255, 220, 180, 0.015],
  [255, 195, 150, 0.005],
];

export const DEFAULT_FIELD = {
  starCount: 1000,
  focal: 340, // perspective focal length in pixels
  fieldRadiusXY: 1900, // half-extent of spawn cube on x/y
  maxZ: 1200,
  minZ: 1,
  fieldDepthMin: 0, // where stars can spawn near the camera
  twinkleAmp: 0.4,
  pulseChance: 0.00012, // per-star, per-frame
  heroChance: 0.004, // probability a recycled star becomes "hero" sized
};

export const DEFAULT_WARP = {
  baseThrottle: 0.2,
  warpThrottle: 22,
  chargeFloorVel: 0.04,
  velocityDamp: 4,
  durations: {
    charging: 0.85,
    jumping: 0.18,
    decelerating: 0.95,
  },
};

export const DEFAULT_SCROLL = {
  impulseDecay: 1.8, // 1/sec exponential decay
  impulseMax: 9,
  impulseMin: -3.6, // -impulseMax * 0.4
  wheelGain: 0.005,
  touchGain: 0.02,
};

/**
 * Mode labels surfaced in the instrument panel for each warp phase.
 * Override these (e.g. localization) by passing `modeLabels` as a prop.
 */
export const DEFAULT_MODE_LABELS = {
  idle: 'NOMINAL',
  charging: 'CHARGING',
  jumping: 'JUMP',
  cruising: 'WARP',
  decelerating: 'COOLDOWN',
};
