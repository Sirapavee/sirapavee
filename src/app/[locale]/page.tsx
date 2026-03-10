'use client';

import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { LandingPage } from '@/components/LandingPage';
import { INITIAL_SPACE_CONFIG_PROPS, SpaceScene } from '@/components/Scene';
import { useTransitionContext } from '@/providers/TransitionProvider';
import { ConfigProps } from '@/types/scene';

gsap.registerPlugin(useGSAP);

export default function Home() {
  const container = useRef<HTMLDivElement>(null);
  const { timeline } = useTransitionContext();

  const [configProps, setConfigProps] = useState<ConfigProps>(INITIAL_SPACE_CONFIG_PROPS);

  useGSAP(
    () => {
      gsap
        .fromTo(
          container.current,
          { opacity: 0, duration: 2, backgroundColor: 'red' },
          { opacity: 1, duration: 2, stagger: 0.1, backgroundColor: 'transparent' },
        )
        .then(() => {
          setTimeout(() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'start',
            });

            setTimeout(() => {
              setConfigProps({
                configValue: {
                  ['position.z']: 1,
                  ['scale.z']: 0.5,
                },
                mode: 'idle',
              });
            }, 5000);
          }, 1000);
        });

      timeline.add(
        gsap.to(container.current, { opacity: 0, duration: 2, backgroundColor: 'red' }),
      );
    },
    {
      scope: container,
    },
  );

  return (
    <div ref={container} className='h-dvh w-dvw'>
      <SpaceScene configProps={configProps}>
        <LandingPage />
      </SpaceScene>
    </div>
  );
}
