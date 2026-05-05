import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useHyperspaceContext } from '@/providers/HyperspaceProvider';
import { useSceneLoadingContext } from '@/providers/SceneLoaderProvider';

/* ============================================================
 * Loading Screen
 * ------------------------------------------------------------
 * Reads coarse state from `useLoading()` (re-renders on lifecycle)
 * and live progress via `getProgress()` inside an rAF loop that
 * mutates the DOM directly. Tailwind for layout / typography;
 * a tiny `<style>` injection covers the cursor-blink keyframe.
 * ============================================================ */

const FONT_LINK_ID = 'loading-screen-fonts';
const KEYFRAMES_ID = 'loading-screen-keyframes';

export const LoadingScreen = () => {
  const { isLoading, currentAsset, getProgress } = useSceneLoadingContext();

  const { jump } = useHyperspaceContext();
  const progressPercent = getProgress() * 100;

  //   useEffect(() => {
  //     setTimeout(() => {
  //       if (progressPercent >= 100) {
  //         jump({
  //           onArrival: () => {
  //             // cruising → decelerating boundary; the screen is covered.
  //             // do your scroll / state swap / route change here.
  //             document.getElementById('section-2')?.scrollIntoView();
  //           },
  //           onComplete: () => {
  //             // fires after the sequence ends + unmountDelayMs.
  //           },
  //         });
  //       }
  //     }, 500);
  //   }, [progressPercent]);

  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const isLoadingRef = useRef(isLoading);

  // Persist smoothed progress across effect re-runs and StrictMode double-invokes.
  // The previous closure-local variable would reset to 0 on every teardown,
  // causing the bar to snap backward and re-climb.
  const smoothedRef = useRef(0);
  const triggeredFadeRef = useRef(false);

  useLayoutEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // 'visible' → 'fading' → 'hidden'
  const [phase, setPhase] = useState<'visible' | 'fading' | 'hidden'>('visible');

  // One-time CSS injection (font + keyframes). Doing it here keeps
  // the component a single self-contained import — drop it in any
  // app without touching globals.css.
  useEffect(() => {
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById(KEYFRAMES_ID)) {
      const style = document.createElement('style');
      style.id = KEYFRAMES_ID;
      style.textContent = `@keyframes loaderBlink { 50% { opacity: 0; } }`;
      document.head.appendChild(style);
    }
  }, []);

  // Smoothing rAF — DOM-direct, never re-renders React.
  useEffect(() => {
    let frame = 0;

    const tick = () => {
      const target = getProgress();
      const k = isLoadingRef.current ? 0.12 : 0.25;

      // Lerp toward target, but never let it visibly go backward —
      // a brief upstream blip (file count changing while computing
      // the aggregate) shouldn't shrink the bar.
      const next = smoothedRef.current + (target - smoothedRef.current) * k;
      smoothedRef.current = Math.max(smoothedRef.current, next);

      const pct = Math.min(100, Math.round(smoothedRef.current * 100));
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${smoothedRef.current.toFixed(4)})`;
      }
      if (pctRef.current) pctRef.current.textContent = String(pct);

      if (
        !isLoadingRef.current &&
        smoothedRef.current > 0.99 &&
        !triggeredFadeRef.current
      ) {
        triggeredFadeRef.current = true;
        smoothedRef.current = 1;
        if (fillRef.current) fillRef.current.style.transform = 'scaleX(1)';
        if (pctRef.current) pctRef.current.textContent = '100';
        setPhase('fading');
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getProgress]);

  // After the fade transition completes, fully unmount from layout.
  useEffect(() => {
    if (phase === 'fading') {
      const t = window.setTimeout(() => setPhase('hidden'), 900);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  return (
    <div
      role='status'
      aria-live='polite'
      className={[
        'fixed inset-0 z-50',
        'flex flex-col justify-between',
        'p-5 md:p-10',
        'bg-[#0a0a0c] text-[#f5f5f0]',
      ].join(' ')}
      style={{
        // State-driven fade kept inline so it doesn't depend on
        // Tailwind's opacity / transition utilities being compiled.
        opacity: phase === 'visible' ? 1 : 0,
        transition: 'opacity 900ms cubic-bezier(0.65, 0, 0.35, 1)',
        pointerEvents: phase === 'visible' ? 'auto' : 'none',
        visibility: phase === 'hidden' ? 'hidden' : 'visible',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {/* Scanline grain — atmosphere, not load-bearing */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 mix-blend-overlay'
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.014) 2px 4px)',
        }}
      />

      {/* Top meta row */}
      <div className='relative flex justify-between text-[0.7rem] tracking-[0.18em] text-[#6b6b6e] uppercase'>
        <div className='text-[#f5f5f0]'>SCENE_LOADER · v1</div>
        <div className='text-right leading-[1.7]'>
          R3F · DREI
          <br />
          ASSET_PIPELINE
        </div>
      </div>

      {/* Hero text */}
      <div className='relative flex flex-1 items-center justify-center text-center'>
        <h1
          className='leading-[0.92] font-light tracking-[-0.035em]'
          style={{
            fontFamily: "'Fraunces', 'Times New Roman', serif",
            fontSize: 'clamp(2.75rem, 9vw, 6.75rem)',
          }}
        >
          Composing
          <br />
          the <span style={{ fontStyle: 'italic', color: '#ff6b35' }}>scene</span>
          <span
            aria-hidden
            className='inline-block align-[-0.06em]'
            style={{
              width: '0.06em',
              height: '0.85em',
              marginLeft: '0.12em',
              background: 'currentColor',
              animation: 'loaderBlink 1s steps(1) infinite',
            }}
          />
        </h1>
      </div>

      {/* Footer: progress bar + label */}
      <div className='relative flex flex-col gap-[0.85rem]'>
        <div className='relative h-px overflow-hidden bg-white/[0.08]'>
          <div
            ref={fillRef}
            className='absolute inset-0 origin-left bg-[#f5f5f0]'
            style={{ transform: 'scaleX(0)', willChange: 'transform' }}
          >
            <div
              className='absolute top-0 right-0 bottom-0 w-[60px] opacity-60'
              style={{
                background: 'linear-gradient(90deg, transparent, #ff6b35)',
              }}
            />
          </div>
        </div>
        <div className='flex items-baseline justify-between gap-4 text-[0.7rem] tracking-[0.18em] text-[#6b6b6e] uppercase'>
          <span
            className='overflow-hidden text-ellipsis whitespace-nowrap text-[#f5f5f0]'
            style={{ maxWidth: '60%' }}
          >
            {currentAsset || (isLoading ? 'preparing' : 'ready')}
          </span>
          <span className='text-[#f5f5f0] tabular-nums'>
            <span ref={pctRef}>0</span>%
          </span>
        </div>
      </div>
    </div>
  );
};
