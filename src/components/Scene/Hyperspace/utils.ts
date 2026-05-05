import { HyperspacePhase } from '@/providers/HyperspaceProvider';

const makeRng = (seed: number) => {
  let s = seed * 9301 + 49297;

  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

type JetBranch = {
  points: Array<{ x: number; y: number }>;
  thickness: number;
  depth: number;
};

export const generateJet = (
  seed: number,
  baseX: number,
  baseY: number,
  mainAngle: number,
  mainLength: number,
): JetBranch[] => {
  const rng = makeRng(seed);
  const branches: JetBranch[] = [];

  const buildBranch = (
    x: number,
    y: number,
    angle: number,
    length: number,
    thickness: number,
    depth: number,
  ) => {
    const numSegs = depth === 0 ? 14 : depth === 1 ? 8 : 5;
    let curX = x;
    let curY = y;
    let curAngle = angle;
    const points = [{ x: curX, y: curY }];
    const targetAngle = angle;

    for (let i = 0; i < numSegs; i++) {
      const segLen = length / numSegs;
      const jitterRange = depth === 0 ? 0.18 : depth === 1 ? 0.42 : 0.65;
      const jitter = (rng() - 0.5) * jitterRange;
      const restore = depth === 0 ? (targetAngle - curAngle) * 0.18 : 0;
      curAngle += jitter + restore;

      curX += Math.cos(curAngle) * segLen;
      curY += Math.sin(curAngle) * segLen;
      points.push({ x: curX, y: curY });

      if (depth < 2 && i > 0 && i < numSegs - 1) {
        const heightT = i / numSegs;
        const branchProb = depth === 0 ? 0.18 + heightT * 0.45 : 0.3;
        if (rng() < branchProb) {
          const sideSign = rng() < 0.5 ? -1 : 1;
          const sideAngle = 0.45 + rng() * 0.55;
          const branchAngle = curAngle + sideSign * sideAngle;
          const branchLen =
            length * (depth === 0 ? 0.18 + rng() * 0.32 : 0.35 + rng() * 0.35);
          const branchThick = thickness * (0.45 + rng() * 0.25);
          buildBranch(curX, curY, branchAngle, branchLen, branchThick, depth + 1);
        }
      }
    }
    branches.push({ points, thickness, depth });
  };

  buildBranch(baseX, baseY, mainAngle, mainLength, 4.5, 0);
  return branches;
};

export const pointsToSvgPath = (points: Array<{ x: number; y: number }>): string => {
  let d = '';

  for (let i = 0; i < points.length; i++) {
    d +=
      (i === 0 ? 'M' : 'L') + points[i].x.toFixed(1) + ' ' + points[i].y.toFixed(1) + ' ';
  }

  return d;
};

export const buildRiftClipPath = (
  progress: number,
  time: number,
  slashAngle: number,
  width: number,
  height: number,
): string => {
  const cx = width / 2;
  const cy = height / 2;
  const N = 88;
  const screenMax = Math.max(width, height);
  const cosA = Math.cos(slashAngle);
  const sinA = Math.sin(slashAngle);

  let halfA: number;
  let halfX: number;
  if (progress < 0.1) {
    const t = progress / 0.1;
    halfA = 30 + t * 120;
    halfX = 2 + t * 5;
  } else if (progress < 0.45) {
    const t = (progress - 0.1) / 0.35;
    const eased = 1 - Math.pow(1 - t, 1.6);
    halfA = 150 + eased * (screenMax * 0.85 - 150);
    halfX = 7 + eased * 18;
  } else if (progress < 0.78) {
    const t = (progress - 0.45) / 0.33;
    const eased = 1 - Math.pow(1 - t, 1.7);
    const startA = screenMax * 0.85;
    const startX = 25;
    halfA = startA + eased * (screenMax * 0.95 - startA);
    halfX = startX + eased * (screenMax * 0.6 - startX);
  } else {
    const t = (progress - 0.78) / 0.22;
    const eased = 1 - Math.pow(1 - t, 3);
    const startA = screenMax * 0.95;
    const startX = screenMax * 0.6;
    const finalSize = screenMax * 1.55;
    halfA = startA + eased * (finalSize - startA);
    halfX = startX + eased * (finalSize - startX);
  }

  const jaggedness = Math.max(0.18, 1 - progress * 0.65);
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let p = 1;
    p += Math.sin(a * 5.7 + time * 0.4) * 0.06;
    p += Math.sin(a * 11.3 + 1.7) * 0.05;
    p += Math.sin(a * 19.1 + 2.5) * 0.04;
    p += Math.sin(a * 31.7 + 4.1) * 0.025;
    const tipFactor = Math.pow(Math.abs(ca), 8);
    p += Math.sin(a * 47.0 + 1.3) * 0.04 * tipFactor;
    p = 1 + (p - 1) * jaggedness;

    const lx = ca * halfX * p;
    const ly = sa * halfA * p;
    const wx = cx + lx * cosA - ly * sinA;
    const wy = cy + lx * sinA + ly * cosA;
    pts.push((i === 0 ? 'M' : 'L') + wx.toFixed(1) + ' ' + wy.toFixed(1));
  }

  pts.push('Z');
  return `path('${pts.join(' ')}')`;
};

export const getWarp = (phase: HyperspacePhase, p: number): number => {
  switch (phase) {
    case 'idle':
    case 'charging':
      return 0;
    case 'jumping': {
      const ramp = Math.min(1, p / 0.15);
      return Math.pow(ramp, 1.2);
    }
    case 'cruising':
      return 1.0;
    case 'decelerating':
      return 1.0 - p * 0.65;
  }
};
