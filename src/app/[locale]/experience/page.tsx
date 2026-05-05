'use client';

// import { cookies } from 'next/headers';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';

import { BlackHoleScene } from '@/components/Scene/BlackHoleScene';
import SpiralPlanet from '@/components/Scene/SpiralFlyByPlanetScene/SpiralFlyByPlanetScene';
import { themeHeader } from '@/const/tailwindClass';
import { useTransitionContext } from '@/providers/TransitionProvider';
import { cn } from '@/utils/className';

gsap.registerPlugin(useGSAP);

// import { createClient } from '@/utils/supabase/server';

export default function ExperiencePage() {
  //   const cookieStore = cookies();
  //   const supabase = createClient(cookieStore);

  //   const { data: experienceList } = await supabase
  //     .from('[sirapavee] experience')
  //     .select('*');

  //   console.log({
  //     experienceList,
  //   });

  const container = useRef<HTMLDivElement>(null);
  const { timeline } = useTransitionContext();

  useGSAP(
    () => {
      gsap.fromTo(
        container.current,
        { opacity: 0, duration: 2, backgroundColor: 'red' },
        { opacity: 1, duration: 2, stagger: 0.1, backgroundColor: 'transparent' },
      );

      timeline.add(
        gsap.to(container.current, { opacity: 0, duration: 2, backgroundColor: 'red' }),
      );
    },
    {
      scope: container,
    },
  );

  return (
    // <div ref={container} className='flex h-dvh w-dvw items-center justify-center'>
    //   <span className={cn('typo-headline-1', themeHeader)}>Experience Page</span>
    // </div>
    // <SpiralPlanet />
    <BlackHoleScene />

    // <Starfield
    //   ref={probeRef}
    //   // ---- per-breakpoint props (mobile-first fallback) ----
    //   starCount={1000}
    //   twinkleAmp={0.4}
    //   panelPosition={'top-right'}
    //   // ---- single values (apply at every breakpoint) ----
    //   initialThrottle={0.2}
    //   onPhaseChange={(phase) => {
    //     // console.log('warp phase →', phase);
    //   }}
    // />

    // <StarfieldProbe />
  );
}
