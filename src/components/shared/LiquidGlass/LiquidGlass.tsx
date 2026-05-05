/**
 * LiquidGlassJsxV2.jsx — Surface 04 · v2 (R3F)
 * ─────────────────────────────────────────────────────────────
 * Successor to LiquidGlass.jsx that ALSO refracts WebGL content
 * — react-three-fiber meshes, Drei helpers, raw three.js — not
 * just regular DOM. Every visual detail from v1 is preserved
 * (SVG feDisplacementMap × 3 chromatic aberration, edge-only
 * tilt, rim light, scroll progress, custom cursor, six
 * scrolling sections, atmospheric orbs, grain, fonts).
 *
 * Why v1 didn't refract three.js content
 * ─────────────────────────────────────────────────────────────
 * `backdrop-filter` (with or without an SVG `url(#filter)`)
 * samples whatever the browser composited beneath the element,
 * including WebGL canvases — but ONLY when the canvas sits in
 * a stacking context the glass can see through. In v1 the only
 * background layers were `.atmosphere` (z:0) and `<main>`
 * (z:1); a Canvas inserted ad-hoc would either land above the
 * glass or get isolated behind transformed parents.
 *
 * v2 fixes this with explicit layering:
 *
 *   z:   0  .atmosphere       (fixed gradient + drifting orbs)
 *   z:   1  .three-layer      ◄── NEW. Fixed full-viewport
 *                                 R3F <Canvas>, alpha:true,
 *                                 pointerEvents:none.
 *   z:   2  <main>            (scrolling sections, bumped from 1)
 *   z:  60  .grain
 *   z:  70  .meta
 *   z:  80  .glass-wrap       (the panel — refracts EVERYTHING
 *                              with a lower z-index, including
 *                              the WebGL pixels of layer 1)
 *   z: 100  .lg-cursor
 *   z: 200  .progress
 *
 * The Canvas is `pointer-events: none` so mouse events still
 * reach the glass for tilt/rim-light. Sections with transparent
 * backgrounds (hero, quote, specs) reveal the 3D scene through
 * to the glass; sections with solid colour (bands, specimen)
 * cover it, which is fine — the glass refracts whatever happens
 * to be there at the moment.
 *
 * Peer deps you'll need:
 *
 *   npm i @react-three/fiber @react-three/drei three
 *
 * Tailwind: same hybrid as v1 — utilities for layout where they
 * compose cleanly, scoped <style> block for the visual-effect
 * rules that don't.
 *
 * Drop in, mount, scroll.
 */

import React, { FC, ReactNode, useEffect, useRef } from 'react';
import { Float } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';

/* ─────────────────────────────────────────────────────────────
   Data
───────────────────────────────────────────────────────────── */
const SWATCHES = [
  { name: 'Solar', hex: '#FFD166', dark: false },
  { name: 'Magma', hex: '#FF5B3C', dark: false },
  { name: 'Coral', hex: '#FF8FA3', dark: false },
  { name: 'Plum', hex: '#5A1BFF', dark: true },
  { name: 'Lagoon', hex: '#34E7E0', dark: false },
  { name: 'Ink', hex: '#0C0814', dark: true },
  { name: 'Bone', hex: '#F7F3EC', dark: false },
  { name: 'Fuchsia', hex: '#FF2D8A', dark: true },
  { name: 'Olive', hex: '#A8B324', dark: false },
  { name: 'Slate', hex: '#3A3F4B', dark: true },
  { name: 'Peach', hex: '#FFB088', dark: false },
  { name: 'Royal', hex: '#1B3CFF', dark: true },
];

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700;9..144,900&family=JetBrains+Mono:wght@400;500&display=swap';

/* ─────────────────────────────────────────────────────────────
   CSS — visual-effect styles. Identical to v1 except for two
   tiny edits flagged inline (main z-index and a .three-layer
   rule for the new R3F canvas wrapper).
───────────────────────────────────────────────────────────── */
const STYLES = `
  :root {
    --bg-0: #0c0814;
    --bg-1: #1a0f24;
    --hot:    #ff5b3c;
    --pink:   #ff2d8a;
    --gold:   #ffd166;
    --cyan:   #34e7e0;
    --violet: #5a1bff;
    --ink:    #f7f3ec;

    --display: "Fraunces", "Times New Roman", serif;
    --mono:    "JetBrains Mono", ui-monospace, monospace;

    --mx: 50%;
    --my: 50%;
    --tx: 0deg;
    --ty: 0deg;
    --lift: 0;
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  html, body { margin: 0; }

  ::selection { background: var(--gold); color: var(--bg-0); }

  /* Atmosphere ─────────────────────────────────────────── */
  .atmosphere {
    position: fixed; inset: 0; z-index: 0;
    pointer-events: none; overflow: hidden;
    background: linear-gradient(135deg, var(--bg-0));
    
    // NOTE: purple bg including
    // background: linear-gradient(135deg, var(--bg-1), var(--bg-0));
  }
  .orb {
    position: absolute; border-radius: 50%;
    filter: blur(60px); opacity: .8;
    will-change: transform;
    animation: drift 22s ease-in-out infinite;
  }
  .orb--1 { width: 520px; height: 520px; left: -120px; top: -80px;
            background: radial-gradient(circle, var(--hot), transparent 70%); }
  .orb--2 { width: 460px; height: 460px; right: -80px; bottom: -120px;
            background: radial-gradient(circle, var(--cyan), transparent 70%);
            animation-duration: 28s; animation-delay: -6s; }
  .orb--3 { width: 380px; height: 380px; left: 55%; top: 30%;
            background: radial-gradient(circle, var(--gold), transparent 70%);
            animation-duration: 18s; animation-delay: -10s; }
  @keyframes drift {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    33%     { transform: translate3d(40px,-30px,0) scale(1.08); }
    66%     { transform: translate3d(-30px,50px,0) scale(.95); }
  }

  /* ◄── NEW: the R3F canvas layer. Sits between atmosphere
     and main content, fixed full-viewport, ignores pointer
     events so glass tilt still works. The Canvas component
     itself sets these styles inline too — this rule is the
     authoritative one for the wrapper if you ever swap the
     <Canvas> inline-style approach for a className. */
  .three-layer {
    position: fixed; inset: 0; z-index: 1;
    pointer-events: none;
  }

  /* Grain ──────────────────────────────────────────────── */
  .grain {
    position: fixed; inset: 0;
    pointer-events: none; z-index: 60;
    opacity: .22; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.5'/></svg>");
  }

  /* Fixed UI chrome ────────────────────────────────────── */
  .meta {
    position: fixed; font-family: var(--mono);
    font-size: 11px; letter-spacing: .18em;
    text-transform: uppercase;
    color: rgba(255,243,230,.6); z-index: 70;
  }
  .meta--tl { top: 28px; left: 32px; }
  .meta--tr { top: 28px; right: 32px; text-align: right; }
  .meta strong { color: var(--gold); font-weight: 500; }

  .progress {
    position: fixed; top: 0; left: 0; right: 0;
    height: 2px; background: rgba(255,255,255,.06);
    z-index: 200;
  }
  .progress__bar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, var(--hot), var(--gold), var(--cyan), var(--violet));
    box-shadow: 0 0 12px rgba(255,209,102,.6);
    transition: width .08s linear;
  }

  /* THE GLASS ──────────────────────────────────────────── */
  .glass-wrap {
    position: fixed; inset: 0;
    display: grid; place-items: center;
    perspective: 1400px; pointer-events: none; z-index: 80;
  }
  .glass {
    --w: min(540px, 78vw);
    --h: min(360px, 52vh);
    --r: 32px;

    position: relative;
    width: var(--w); height: var(--h);
    border-radius: var(--r);
    pointer-events: auto;

    -webkit-backdrop-filter: blur(2px) saturate(1.6) url(#liquidGlass);
            backdrop-filter: blur(2px) saturate(1.6) url(#liquidGlass);

    /* Matte background */
    // background:
    //   linear-gradient(135deg,
    //     rgba(255,255,255,.16) 0%,
    //     rgba(255,255,255,.04) 40%,
    //     rgba(255,255,255,.02) 60%,
    //     rgba(255,255,255,.10) 100%);

    box-shadow:
      0 30px 60px -20px rgba(0,0,0,.55),
      0 8px 20px -8px rgba(0,0,0,.35),
      inset 0  1px 0 rgba(255,255,255,.55),
      inset 0 -1px 0 rgba(0,0,0,.25),
      inset  1px 0 0 rgba(255,255,255,.18),
      inset -1px 0 0 rgba(0,0,0,.18);

    transform:
      perspective(1200px)
      rotateX(var(--ty))
      rotateY(var(--tx))
      translateZ(0);
    transition: transform .35s cubic-bezier(.2,.7,.2,1);
    transform-style: preserve-3d;
    will-change: transform;
  }
  // .glass::before {
  //   content: ""; position: absolute; inset: 0;
  //   border-radius: inherit;
  //   background: radial-gradient(120% 80% at 0% 0%,
  //     rgba(255,255,255,.30), rgba(255,255,255,0) 45%);
  //   mix-blend-mode: screen; pointer-events: none;
  // }
  .glass::after {
    content: ""; position: absolute; inset: 0;
    border-radius: inherit; padding: 1.5px;
    background:
      radial-gradient(220px 220px at var(--mx) var(--my),
        rgba(255,255,255,.95) 0%,
        rgba(255,220,180,.55) 18%,
        rgba(255,255,255,.10) 45%,
        rgba(255,255,255,0) 70%),
      linear-gradient(135deg,
        rgba(255,255,255,.45),
        rgba(255,255,255,.05) 40%,
        rgba(255,255,255,.05) 60%,
        rgba(255,255,255,.30));
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
            mask-composite: exclude;
    pointer-events: none;
  }
  .chroma {
    position: absolute; inset: -2px;
    border-radius: calc(var(--r) + 2px);
    pointer-events: none;
    opacity: calc(.35 + .65 * var(--lift));
    transition: opacity .25s ease;
    mix-blend-mode: screen;
    background:
      conic-gradient(from 0deg at var(--mx) var(--my),
        rgba(255, 70, 90,.9)   0deg,
        rgba(255,220,100,.0)   90deg,
        rgba( 80,230,255,.9) 180deg,
        rgba(180,120,255,.0) 270deg,
        rgba(255, 70, 90,.9) 360deg);
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    padding: 3px;
    -webkit-mask-composite: xor;
            mask-composite: exclude;
    filter: blur(2.5px);
  }

  .glass__content {
    position: absolute; inset: 0;
    padding: 36px 40px;
    display: flex; flex-direction: column;
    justify-content: space-between;
    transform: translateZ(40px);
  }
`;

/* ─────────────────────────────────────────────────────────────
   Inline SVG filter — refraction + per-channel chromatic
   aberration. Pure JSX, no state. The displacement map is
   embedded as a data-URI SVG so the filter is fully
   self-contained.
───────────────────────────────────────────────────────────── */
function LiquidGlassFilter() {
  const dispMapHref =
    'data:image/svg+xml;utf8,' +
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>" +
    '<defs>' +
    "<linearGradient id='X' x1='0' y1='0' x2='1' y2='0'>" +
    "<stop offset='0' stop-color='rgb(255,128,128)'/>" +
    "<stop offset='1' stop-color='rgb(0,128,128)'/>" +
    '</linearGradient>' +
    "<linearGradient id='Y' x1='0' y1='0' x2='0' y2='1'>" +
    "<stop offset='0' stop-color='rgb(128,255,128)'/>" +
    "<stop offset='1' stop-color='rgb(128,0,128)'/>" +
    '</linearGradient>' +
    '</defs>' +
    "<rect width='100' height='100' fill='rgb(128,128,128)'/>" +
    "<rect width='100' height='100' fill='url(%23X)' opacity='.5'/>" +
    "<rect width='100' height='100' fill='url(%23Y)' opacity='.5'/>" +
    '</svg>';

  return (
    <svg width='0' height='0' style={{ position: 'absolute' }} aria-hidden='true'>
      <defs>
        <filter
          id='liquidGlass'
          x='0%'
          y='0%'
          width='100%'
          height='100%'
          colorInterpolationFilters='sRGB'
        >
          <feImage
            x='0'
            y='0'
            width='100%'
            height='100%'
            preserveAspectRatio='none'
            href={dispMapHref}
            result='map'
          />
          <feGaussianBlur in='map' stdDeviation='0.4' result='map2' />

          <feDisplacementMap
            in='SourceGraphic'
            in2='map2'
            scale='120'
            xChannelSelector='R'
            yChannelSelector='G'
            result='dispR'
          />
          <feColorMatrix
            in='dispR'
            type='matrix'
            values='1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
            result='rOnly'
          />

          <feDisplacementMap
            in='SourceGraphic'
            in2='map2'
            scale='95'
            xChannelSelector='R'
            yChannelSelector='G'
            result='dispG'
          />
          <feColorMatrix
            in='dispG'
            type='matrix'
            values='0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'
            result='gOnly'
          />

          <feDisplacementMap
            in='SourceGraphic'
            in2='map2'
            scale='70'
            xChannelSelector='R'
            yChannelSelector='G'
            result='dispB'
          />
          <feColorMatrix
            in='dispB'
            type='matrix'
            values='0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'
            result='bOnly'
          />

          <feComposite
            in='rOnly'
            in2='gOnly'
            operator='arithmetic'
            k1='0'
            k2='1'
            k3='1'
            k4='0'
            result='rg'
          />
          <feComposite
            in='rg'
            in2='bOnly'
            operator='arithmetic'
            k1='0'
            k2='1'
            k3='1'
            k4='0'
            result='rgb'
          />

          <feGaussianBlur in='rgb' stdDeviation='0.35' />
        </filter>
      </defs>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Atmosphere — fixed gradients + drifting orbs (z: 0)
───────────────────────────────────────────────────────────── */
function Atmosphere() {
  return (
    <div className='atmosphere'>
      {/* <div className='orb orb--1' />
      <div className='orb orb--2' />
      <div className='orb orb--3' /> */}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main component — wires up the panel, the cursor, and the
   imperative animation loop. CSS custom props are written
   directly to elements via refs (no React re-renders during
   mouse movement / rAF tick).
───────────────────────────────────────────────────────────── */
type LiquidGlassProps = {
  children?: ReactNode;
};

export const LiquidGlass: FC<LiquidGlassProps> = ({ children }) => {
  const glassRef = useRef(null);
  // const cursorRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    /* ── 1. Inject Google Fonts (preconnect + stylesheet) ── */
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';

    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = '';

    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = FONT_HREF;

    document.head.append(pre1, pre2, sheet);

    /* ── 2. Imperative animation state ───────────────────── */
    let tx = 0,
      ty = 0,
      lift = 0;
    let tTx = 0,
      tTy = 0,
      tLift = 0;
    let lastE = null;
    let rafId = 0;

    const MAX_TILT = 9;
    const EDGE_FROM = 0.35;
    const EDGE_TO = 1.2;

    function compute(e) {
      const glass = glassRef.current;
      // const cursor = cursorRef.current;
      // if (!glass || !cursor) return;
      if (!glass) return;

      // cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;

      const r = glass.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const nx = (e.clientX - cx) / (r.width / 2);
      const ny = (e.clientY - cy) / (r.height / 2);

      const localX = Math.max(-0.15, Math.min(1.15, (e.clientX - r.left) / r.width));
      const localY = Math.max(-0.15, Math.min(1.15, (e.clientY - r.top) / r.height));
      glass.style.setProperty('--mx', (localX * 100).toFixed(2) + '%');
      glass.style.setProperty('--my', (localY * 100).toFixed(2) + '%');

      const dist = Math.max(Math.abs(nx), Math.abs(ny)); // chebyshev
      let strength = 0;
      if (dist >= EDGE_FROM && dist <= EDGE_TO) {
        strength =
          dist <= 1
            ? (dist - EDGE_FROM) / (1 - EDGE_FROM)
            : 1 - (dist - 1) / (EDGE_TO - 1);
        strength = Math.max(0, Math.min(1, strength));
      }

      tTx = nx * MAX_TILT * strength;
      tTy = -ny * MAX_TILT * strength;
      tLift = strength;

      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      // cursor.classList.toggle('is-on-glass', inside);
    }

    function tick() {
      const glass = glassRef.current;
      if (glass) {
        tx += (tTx - tx) * 0.12;
        ty += (tTy - ty) * 0.12;
        lift += (tLift - lift) * 0.1;
        glass.style.setProperty('--tx', tx.toFixed(3) + 'deg');
        glass.style.setProperty('--ty', ty.toFixed(3) + 'deg');
        glass.style.setProperty('--lift', lift.toFixed(3));
      }
      rafId = requestAnimationFrame(tick);
    }

    /* ── 3. Listeners ────────────────────────────────────── */
    const onMove = (e) => {
      lastE = { clientX: e.clientX, clientY: e.clientY };
      compute(lastE);
    };
    const onScroll = () => {
      if (lastE) compute(lastE);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (progressRef.current) {
        progressRef.current.style.width = p.toFixed(2) + '%';
      }
    };
    const onTouch = (e) => {
      if (e.touches[0]) {
        lastE = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        compute(lastE);
      }
    };
    const onLeave = () => {
      tTx = 0;
      tTy = 0;
      tLift = 0;
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('mouseleave', onLeave);

    tick();

    /* ── 4. Cleanup ──────────────────────────────────────── */
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('mouseleave', onLeave);
      [pre1, pre2, sheet].forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, []);

  return (
    <>
      <style>{STYLES}</style>

      <LiquidGlassFilter />

      <Atmosphere />

      {/* z: 1  ─ NEW. The 3D layer the glass refracts. */}
      {/* <ThreeLayer /> */}
      {children}

      {/* Scroll progress */}
      <div className='progress'>
        <div className='progress__bar' ref={progressRef} />
      </div>

      {/* Fixed UI */}
      {/* <div className='meta meta--tl'>
        Liquid Glass <strong>·</strong> Surface 04 v2
      </div>
      <div className='meta meta--tr'>
        scroll <strong>·</strong> hover near edges
      </div> */}

      {/* z: 2  ─ Scrolling content */}
      {/* <main>
        <HeroSection />
        <BandsSection />
        <SpecimenSection />
        <SwatchesSection />
        <QuoteSection />
        <SpecsSection />
      </main> */}

      {/* z: 80 ─ The fixed glass panel. Refracts everything
          beneath it, including the WebGL canvas at z:1. */}
      <div className='glass-wrap'>
        <div className='glass' ref={glassRef}>
          <span className='chroma' aria-hidden='true' />
          <div className='glass__content'>
            {/* <div className='kicker'>
              <span className='dot' />
              Surface 04 / Liquid · v2
            </div>
            <div>
              <h2 className='title'>
                Poured
                <br />
                <em>light, set.</em>
              </h2>
            </div>
            <div className='row'>
              <p className='desc'>
                Scroll past the bands. The torus knot keeps drifting behind — and the
                glass keeps bending it.
              </p>
              <span className='badge'>Hover&nbsp;edges</span>
            </div> */}
          </div>
        </div>
      </div>

      <div className='grain' />
      {/* <div className='lg-cursor' ref={cursorRef} /> */}
    </>
  );
};
