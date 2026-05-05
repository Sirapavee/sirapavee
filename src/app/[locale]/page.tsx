'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { ScrollSection } from '@/components/sections/ScrollSection';
import { useStateContext } from '@/providers/StateProvider';
import { useTransitionContext } from '@/providers/TransitionProvider';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function Home() {
  const container = useRef<HTMLDivElement>(null);
  // const curtainRef = useRef<HTMLDivElement>(null);

  const { timeline } = useTransitionContext();
  const { state } = useStateContext();

  const { ref } = state;
  const { spaceConfigRef } = ref;

  useGSAP(
    () => {
      gsap.to(container.current, { opacity: 1, duration: 2 }).then(() => {
        spaceConfigRef.current = {
          configValue: {
            ['position.z']: 1,
            ['scale.z']: 0.5,
          },
          mode: 'start',
        };

        setTimeout(() => {
          spaceConfigRef.current = {
            configValue: {
              ['position.z']: 1,
              ['scale.z']: 0.5,
            },
            mode: 'idle',
          };
        }, 2500);
      });

      timeline.add(gsap.to(container.current, { opacity: 0, duration: 2 }));
    },
    {
      scope: container,
    },
  );

  return (
    <div ref={container} className='relative h-dvh w-dvw opacity-0'>
      {/* <div
        ref={curtainRef}
        className={cn('absolute z-2 h-dvh w-dvw', themeBg)}
        id='curtain'
      /> */}
      {/* <TextTransitionScene /> */}

      <ScrollSection />
    </div>
  );
}
