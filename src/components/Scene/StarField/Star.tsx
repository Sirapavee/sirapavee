import { useEffect, useMemo, useRef } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* =============================================================================
 *  Shaders
 *  Manual perspective projection in the vertex shader so the look is bit-exact
 *  with the canvas version: sx = x * focal/z + cx, etc.
 *  Quad expansion handles the 4 render paths: dot, glow, hero (sprite), stretch.
 *  Output uses additive blending — equivalent to canvas globalCompositeOperation
 *  = 'lighter'.
 * =========================================================================== */

const vertexShader = /* glsl */ `
  attribute vec3  iPosition;
  attribute float iSize;
  attribute vec3  iColor;
  attribute float iTwinklePhase;
  attribute float iTwinkleSpeed;
  attribute float iIsHero;
  attribute float iPulseUntil;

  uniform float uTime;
  uniform float uStretch;
  uniform vec2  uViewport;
  uniform float uFocal;
  uniform float uMaxZ;
  uniform float uTwinkleAmp;

  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAlpha;
  varying float vMode;        // 0=dot 1=glow 2=hero 3=stretch

  void main() {
    vec3 p = iPosition;
    vec2 center = uViewport * 0.5;

    // perspective project — same math as the canvas version
    float k = uFocal / max(p.z, 0.001);
    vec2 screenPos = p.xy * k + center;

    float size = iSize * k * 0.95;
    float depthFade = clamp(1.0 - p.z / uMaxZ, 0.0, 1.0);

    float tw = (1.0 - uTwinkleAmp) + uTwinkleAmp *
               (0.5 + 0.5 * sin(uTime * iTwinkleSpeed + iTwinklePhase));
    float pulse = (iPulseUntil > uTime) ? (1.0 + (iPulseUntil - uTime) * 1.8) : 1.0;
    vAlpha = clamp(depthFade * tw * pulse, 0.0, 1.0);
    vColor = iColor;

    // ---- mode selection (matches the JS render-path picker) ----
    float m = 0.0;
    if (uStretch > 0.04) {
      m = 3.0;
    } else if (iIsHero > 0.5 && p.z < 240.0) {
      m = 2.0;
    } else if (size > 0.85) {
      m = 1.0;
    }

    vUv = position.xy + 0.5;

    // ---- quad expansion in screen space ----
    vec2 quadPos;

    if (m > 2.5) {
      // STRETCH — radial streak from center outward
      vec2 radial = screenPos - center;
      float radialDist = length(radial);
      if (radialDist > 1.5) {
        vec2 dir  = radial / radialDist;
        vec2 tang = vec2(-dir.y, dir.x);
        float baseLen   = 260.0 * uStretch * (0.28 + 0.72 * depthFade);
        float streakLen = min(radialDist * 0.92, baseLen);
        // position.x in [-0.5, 0.5] maps along the streak with HEAD at +0.5 (the star)
        float along  = (position.x + 0.5) * streakLen - streakLen;
        float across = position.y * size * 1.3;
        quadPos = screenPos + dir * along + tang * across;
      } else {
        // fall back to dot near the vanishing point
        m = 0.0;
        float qs = max(size * 1.5, 1.0);
        quadPos = screenPos + position.xy * qs * 2.0;
      }
    } else if (m > 1.5) {
      // HERO — quad sized for spike sprite
      float qs = max(size, 1.0) * 14.0;
      quadPos = screenPos + position.xy * qs * 2.0;
    } else if (m > 0.5) {
      // GLOW
      float qs = size * 5.0;
      quadPos = screenPos + position.xy * qs * 2.0;
    } else {
      // DOT
      float qs = max(size * 1.3, 0.8);
      quadPos = screenPos + position.xy * qs * 2.0;
    }

    vMode = m;

    // canvas Y is top-down, NDC Y is bottom-up
    vec2 ndc = (quadPos / uViewport) * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAlpha;
  varying float vMode;

  uniform sampler2D uHeroSprite;

  void main() {
    vec3 col = vec3(0.0);
    float intensity = 0.0;

    if (vMode > 2.5) {
      // STRETCH — gradient along x (head = bright/white), lateral falloff on y
      float along   = vUv.x;
      float across  = abs(vUv.y - 0.5) * 2.0;
      float lateral = 1.0 - smoothstep(0.0, 1.0, across);
      float head    = smoothstep(0.0, 1.0, along);
      float body    = smoothstep(0.0, 0.6, along);
      float gradient = body * (0.55 + 0.45 * head);
      intensity = gradient * lateral;
      col = mix(vColor, vec3(1.0), head * 0.7);
    } else if (vMode > 1.5) {
      // HERO — pre-rendered diffraction spike sprite (8-point: 6 hex + 2 strut)
      vec4 s = texture2D(uHeroSprite, vUv);
      col = mix(vColor, vec3(1.0), pow(s.r, 1.5));
      intensity = s.a;
    } else if (vMode > 0.5) {
      // GLOW
      vec2 d = vUv - 0.5;
      float r = length(d) * 2.0;
      float core = 1.0 - smoothstep(0.0, 0.15, r);
      float halo = (1.0 - smoothstep(0.0, 1.0, r));
      halo = halo * halo * 0.55;
      intensity = max(core, halo);
      col = mix(vColor, vec3(1.0), core);
    } else {
      // DOT
      vec2 d = vUv - 0.5;
      float r = length(d) * 2.0;
      intensity = 1.0 - smoothstep(0.0, 0.5, r);
      col = vColor;
    }

    if (intensity < 0.001) discard;
    // additive: rgb is the contribution; alpha=1 lets THREE.AdditiveBlending pass it through
    gl_FragColor = vec4(col * intensity * vAlpha, 1.0);
  }
`;

const StarMaterial = shaderMaterial(
  {
    uTime: 0,
    uStretch: 0,
    uViewport: new THREE.Vector2(1, 1),
    uFocal: 340,
    uMaxZ: 1200,
    uTwinkleAmp: 0.4,
    uHeroSprite: null,
  },
  vertexShader,
  fragmentShader,
);
extend({ StarMaterial });

type StarMaterialImpl = THREE.ShaderMaterial & {
  uTime: number;
  uStretch: number;
  uViewport: THREE.Vector2;
  uFocal: number;
  uMaxZ: number;
  uTwinkleAmp: number;
  uHeroSprite: THREE.Texture | null;
};

declare module '@react-three/fiber' {
  interface ThreeElements {
    starMaterial: THREE.Mesh<StarMaterialImpl, typeof StarMaterial>;
  }
}

/* =============================================================================
 *  Hero sprite — 8-point JWST-style diffraction (6 hexagonal + 2 horizontal struts)
 *  Pre-rendered once on a Canvas2D, uploaded as CanvasTexture, sampled by the
 *  fragment shader for stars in HERO mode.
 * =========================================================================== */
function buildHeroSprite(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);

  const baseSize = size * 0.04;
  const spikeLen = baseSize * 26;
  const angles = [
    0,
    Math.PI / 3,
    (2 * Math.PI) / 3,
    Math.PI,
    (4 * Math.PI) / 3,
    (5 * Math.PI) / 3,
    Math.PI / 2,
    -Math.PI / 2,
  ];

  ctx.lineCap = 'round';
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const isHorizontal = i >= 6;
    const len = isHorizontal ? spikeLen * 1.25 : spikeLen;
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len;

    const grad = ctx.createLinearGradient(0, 0, ex, ey);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(0.8, baseSize * 0.45);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // halo
  const haloR = baseSize * 7;
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // hot core
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, baseSize * 1.2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return tex;
}

/* =============================================================================
 *  Random helpers
 * =========================================================================== */
function pickColorFromPalette(palette, totalWeight) {
  let r = Math.random() * totalWeight;
  for (let i = 0; i < palette.length; i++) {
    r -= palette[i][3];
    if (r <= 0) return palette[i];
  }
  return palette[0];
}

function initStarSlot(i, data, opts) {
  const { fieldRadiusXY, maxZ, palette, paletteWeight, heroChance, spawnFar } = opts;

  const idx3 = i * 3;
  data.iPosition[idx3] = (Math.random() - 0.5) * fieldRadiusXY * 2;
  data.iPosition[idx3 + 1] = (Math.random() - 0.5) * fieldRadiusXY * 2;
  data.iPosition[idx3 + 2] = spawnFar
    ? maxZ - Math.random() * 80
    : Math.random() * maxZ + 1;

  data.iSize[i] = Math.pow(Math.random(), 2.6) * 1.7 + 0.22;

  const c = pickColorFromPalette(palette, paletteWeight);
  data.iColor[idx3] = c[0] / 255;
  data.iColor[idx3 + 1] = c[1] / 255;
  data.iColor[idx3 + 2] = c[2] / 255;

  data.iTwinklePhase[i] = Math.random() * Math.PI * 2;
  data.iTwinkleSpeed[i] = 0.5 + Math.random() * 2.4;
  data.iIsHero[i] = Math.random() < heroChance ? 1 : 0;
  data.iPulseUntil[i] = 0;
}

function recycleStarSlot(i, data, opts) {
  // Match HTML version: recycle preserves isHero (no random redraw).
  const idx3 = i * 3;
  const { fieldRadiusXY, maxZ, palette, paletteWeight } = opts;

  data.iPosition[idx3] = (Math.random() - 0.5) * fieldRadiusXY * 2;
  data.iPosition[idx3 + 1] = (Math.random() - 0.5) * fieldRadiusXY * 2;
  data.iPosition[idx3 + 2] = maxZ - Math.random() * 60;

  data.iSize[i] = Math.pow(Math.random(), 2.6) * 1.7 + 0.22;

  const c = pickColorFromPalette(palette, paletteWeight);
  data.iColor[idx3] = c[0] / 255;
  data.iColor[idx3 + 1] = c[1] / 255;
  data.iColor[idx3 + 2] = c[2] / 255;

  data.iTwinklePhase[i] = Math.random() * Math.PI * 2;
  data.iTwinkleSpeed[i] = 0.5 + Math.random() * 2.4;
}

/* =============================================================================
 *  Easing — same as HTML version
 * =========================================================================== */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t) => t * t;
const lerp = (a, b, t) => a + (b - a) * t;

/* =============================================================================
 *  Stars component
 * =========================================================================== */
export default function Stars({
  count, // current visible count (drives geometry.instanceCount)
  maxCount, // pre-allocated upper bound (geometry size)
  palette,
  field,
  warp,
  scroll,
  warpRef, // shared mutable ref { state, intent, velocity, stretch, ... }
  scrollImpulseRef, // shared ref for wheel/touch impulse
  htmlRefs, // { fps, velocity } — span elements to update without re-render
  onPhaseChange, // (newPhaseName) => void — for the React mode label
  prefersReducedMotion,
}) {
  const meshRef = useRef();
  const matRef = useRef();
  const { size: viewport } = useThree();

  const heroSprite = useMemo(() => buildHeroSprite(), []);

  // Pre-allocate maxCount instance attributes; vary instanceCount at runtime.
  const { geometry, data, opts } = useMemo(() => {
    const baseQuad = new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    ]);

    const geom = new THREE.InstancedBufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(baseQuad, 3));
    geom.setIndex([0, 1, 2, 0, 2, 3]);

    const data = {
      iPosition: new Float32Array(maxCount * 3),
      iSize: new Float32Array(maxCount),
      iColor: new Float32Array(maxCount * 3),
      iTwinklePhase: new Float32Array(maxCount),
      iTwinkleSpeed: new Float32Array(maxCount),
      iIsHero: new Float32Array(maxCount),
      iPulseUntil: new Float32Array(maxCount),
    };

    const paletteWeight = palette.reduce((s, c) => s + c[3], 0);
    const opts = {
      fieldRadiusXY: field.fieldRadiusXY,
      maxZ: field.maxZ,
      palette,
      paletteWeight,
      heroChance: field.heroChance,
    };

    for (let i = 0; i < maxCount; i++) initStarSlot(i, data, opts);

    geom.setAttribute('iPosition', new THREE.InstancedBufferAttribute(data.iPosition, 3));
    geom.setAttribute('iSize', new THREE.InstancedBufferAttribute(data.iSize, 1));
    geom.setAttribute('iColor', new THREE.InstancedBufferAttribute(data.iColor, 3));
    geom.setAttribute(
      'iTwinklePhase',
      new THREE.InstancedBufferAttribute(data.iTwinklePhase, 1),
    );
    geom.setAttribute(
      'iTwinkleSpeed',
      new THREE.InstancedBufferAttribute(data.iTwinkleSpeed, 1),
    );
    geom.setAttribute('iIsHero', new THREE.InstancedBufferAttribute(data.iIsHero, 1));
    geom.setAttribute(
      'iPulseUntil',
      new THREE.InstancedBufferAttribute(data.iPulseUntil, 1),
    );

    geom.instanceCount = Math.min(count, maxCount);

    return { geometry: geom, data, opts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxCount, palette, field.fieldRadiusXY, field.maxZ, field.heroChance]);

  // Adjust visible count when breakpoint changes
  useEffect(() => {
    if (geometry) geometry.instanceCount = Math.min(count, maxCount);
  }, [count, maxCount, geometry]);

  // Disposal
  useEffect(
    () => () => {
      geometry?.dispose?.();
      heroSprite?.dispose?.();
    },
    [geometry, heroSprite],
  );

  // Phase change emitter
  const lastEmittedPhase = useRef(null);
  const emitPhaseIfChanged = (next) => {
    if (lastEmittedPhase.current !== next) {
      lastEmittedPhase.current = next;
      onPhaseChange?.(next);
    }
  };

  /* ------------------------------------------------------------------------
   *  Frame loop — advances warp state machine, decays scroll impulse, updates
   *  star z, recycles, sets uniforms, updates HTML readouts.
   * ----------------------------------------------------------------------- */
  const fpsAccum = useRef(0);
  const fpsFrames = useRef(0);
  const fpsLastUpdate = useRef(0);

  useFrame((state, deltaRaw) => {
    const dt = Math.min(0.05, deltaRaw);
    const t = state.clock.getElapsedTime();
    fpsAccum.current += dt;
    fpsFrames.current += 1;

    // ------ Warp state machine ------
    const w = warpRef.current;

    // setHyperspace can request a phase START from outside the frame loop;
    // it leaves a pending flag and we seed phaseT0 here from the real clock.
    if (w.phaseT0Pending) {
      w.phaseT0 = t;
      w.phaseT0Pending = false;
    }

    switch (w.state) {
      case 'charging': {
        const tt = Math.min(1, (t - w.phaseT0) / warp.durations.charging);
        w.velocity = lerp(w.velocityAtPhaseStart, warp.chargeFloorVel, easeInOut(tt));
        w.stretch = lerp(w.stretchAtPhaseStart, 1, easeInQuad(tt));
        if (tt >= 1) {
          // Snap to charge-end values so the next phase starts smoothly
          w.velocityAtPhaseStart = w.velocity;
          w.stretchAtPhaseStart = w.stretch;
          w.phaseT0 = t;
          if (w.intent) {
            // commit to the jump — flash fires here, not on aborted charges
            w.state = 'jumping';
            w.flashAt = t;
          } else {
            w.state = 'decelerating';
          }
          emitPhaseIfChanged(w.state);
        }
        break;
      }
      case 'jumping': {
        const tt = Math.min(1, (t - w.phaseT0) / warp.durations.jumping);
        w.velocity = lerp(warp.chargeFloorVel, warp.warpThrottle, easeOutCubic(tt));
        w.stretch = 1;
        if (tt >= 1) {
          w.velocity = warp.warpThrottle;
          w.state = w.intent ? 'cruising' : 'decelerating';
          if (w.state === 'decelerating') {
            w.phaseT0 = t;
            w.velocityAtPhaseStart = w.velocity;
            w.stretchAtPhaseStart = w.stretch;
          }
          emitPhaseIfChanged(w.state);
        }
        break;
      }
      case 'cruising': {
        w.velocity = warp.warpThrottle;
        w.stretch = 1;
        if (!w.intent) {
          w.state = 'decelerating';
          w.phaseT0 = t;
          w.velocityAtPhaseStart = w.velocity;
          w.stretchAtPhaseStart = w.stretch;
          emitPhaseIfChanged(w.state);
        }
        break;
      }
      case 'decelerating': {
        const tt = Math.min(1, (t - w.phaseT0) / warp.durations.decelerating);
        w.velocity = lerp(w.velocityAtPhaseStart, warp.baseThrottle, easeInOut(tt));
        w.stretch = lerp(w.stretchAtPhaseStart, 0, easeInOut(tt));
        if (tt >= 1) {
          w.state = 'idle';
          w.stretch = 0;
          if (w.intent) {
            w.state = 'charging';
            w.phaseT0 = t;
            w.velocityAtPhaseStart = w.velocity;
            w.stretchAtPhaseStart = w.stretch;
          }
          emitPhaseIfChanged(w.state);
        }
        break;
      }
      case 'idle':
      default: {
        // ease toward ambient throttle (matters when slider changes)
        w.velocity +=
          (warp.baseThrottle - w.velocity) * Math.min(1, dt * warp.velocityDamp);
        w.stretch = 0;
        emitPhaseIfChanged('idle');
        break;
      }
    }

    // ------ Scroll impulse decay ------
    let imp = scrollImpulseRef.current;
    imp *= Math.exp(-scroll.impulseDecay * dt);
    if (Math.abs(imp) < 0.001) imp = 0;
    scrollImpulseRef.current = imp;

    const effectiveVel = w.state === 'idle' ? w.velocity + imp : w.velocity;
    const speedScalar = effectiveVel * 60;

    // ------ Star update + recycle ------
    const W = viewport.width;
    const H = viewport.height;
    const cx = W / 2,
      cy = H / 2;
    const focal = field.focal;
    const minZ = field.minZ;
    const margin = 60;

    const positions = data.iPosition;
    const visible = geometry.instanceCount;
    const pulseUntils = data.iPulseUntil;
    let recycledAny = false;
    let pulsedAny = false;
    const pulseChance = prefersReducedMotion ? 0 : field.pulseChance;

    for (let i = 0; i < visible; i++) {
      const idx3 = i * 3;
      positions[idx3 + 2] -= speedScalar * dt;
      const z = positions[idx3 + 2];

      if (z <= minZ) {
        recycleStarSlot(i, data, opts);
        recycledAny = true;
        continue;
      }
      const k = focal / z;
      const sx = positions[idx3] * k + cx;
      const sy = positions[idx3 + 1] * k + cy;
      if (sx < -margin || sx > W + margin || sy < -margin || sy > H + margin) {
        recycleStarSlot(i, data, opts);
        recycledAny = true;
        continue;
      }

      if (Math.random() < pulseChance) {
        pulseUntils[i] = t + 0.18 + Math.random() * 0.32;
        pulsedAny = true;
      }
    }

    geometry.attributes.iPosition.needsUpdate = true;
    if (recycledAny) {
      geometry.attributes.iSize.needsUpdate = true;
      geometry.attributes.iColor.needsUpdate = true;
      geometry.attributes.iTwinklePhase.needsUpdate = true;
      geometry.attributes.iTwinkleSpeed.needsUpdate = true;
    }
    if (pulsedAny) {
      geometry.attributes.iPulseUntil.needsUpdate = true;
    }

    // ------ Uniforms ------
    if (matRef.current) {
      matRef.current.uTime = t;
      matRef.current.uStretch = w.stretch;
      matRef.current.uViewport.set(W, H);
    }

    // ------ HTML readouts (no React re-render) ------
    if (htmlRefs?.velocity?.current) {
      htmlRefs.velocity.current.textContent = effectiveVel.toFixed(2);
    }
    if (htmlRefs?.fps?.current && state.clock.elapsedTime - fpsLastUpdate.current > 0.5) {
      const fps = Math.round(fpsFrames.current / fpsAccum.current);
      htmlRefs.fps.current.textContent = String(fps);
      fpsLastUpdate.current = state.clock.elapsedTime;
      fpsFrames.current = 0;
      fpsAccum.current = 0;
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={1}>
      <primitive object={geometry} attach='geometry' />
      <starMaterial
        ref={matRef}
        uHeroSprite={heroSprite}
        uFocal={field.focal}
        uMaxZ={field.maxZ}
        uTwinkleAmp={prefersReducedMotion ? 0.1 : field.twinkleAmp}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
