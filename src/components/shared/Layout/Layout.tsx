'use client';

import { FC, ReactNode, Suspense, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import * as THREE from 'three';

import { LiquidGlass } from '../LiquidGlass';
import { SceneLoaderWrapper } from '../Loader/SceneLoaderWrapper';

import { DarkModeCTA } from '@/components/CTA';
import { Footer } from '@/components/Footer';
import { NavBar } from '@/components/NavBar';
import { SpaceScene } from '@/components/Scene';
import { BaseCanvas } from '@/components/Scene/BaseCanvas/BaseCanvas';
import { ButterflyNebulaScene } from '@/components/Scene/ButterflyNebulaScene';
import { HyperspaceWrapper } from '@/components/Scene/Hyperspace';
import PlanetSwarmScene from '@/components/Scene/PlanetSwarmScene/PlanetSwarmScene';
import { StarFields } from '@/components/Scene/StarField';
import { TextTransitionScene } from '@/components/Scene/TextTransitionScene/TextTransitionScene';
import { Transition } from '@/components/Transition';
import { usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useTransitionContext } from '@/providers/TransitionProvider';

gsap.registerPlugin(useGSAP);

type LayoutProps = {
  children: ReactNode;
  theme: string;
};

export const Layout: FC<LayoutProps> = ({ children, theme }) => {
  const curtainRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const { timeline } = useTransitionContext();

  useGSAP(
    () => {
      gsap.to(curtainRef.current, {
        opacity: 1,
        duration: 1.2,
        ease: 'power3.inOut',
        zIndex: -1,
      });

      timeline.add(
        gsap.to(curtainRef.current, {
          opacity: 0,
          duration: 1.2,
          ease: 'power3.inOut',
          zIndex: 100,
        }),
      );
    },
    {
      scope: curtainRef,
      dependencies: [pathname],
    },
  );

  return (
    <>
      <Transition id={pathname}>
        <HyperspaceWrapper>
          <SceneLoaderWrapper>
            <div
              ref={curtainRef}
              // className={cn('absolute z-100 h-dvh w-dvw opacity-0')}
              id='curtain'
            >
              {/* <TextTransitionScene /> */}
              <NavBar />
              <div className='h-dvh w-dvw'>{children}</div>
              <DarkModeCTA ssrTheme={theme} />
              <Footer />
            </div>

            <div className='fixed top-0 left-0 h-dvh w-dvw'>
              <LiquidGlass>
                <Suspense fallback={null}>
                  <BaseCanvas
                    camera={{ position: [0, 0, 42], fov: 50, near: 0.1, far: 500 }}
                    gl={{
                      alpha: true,
                      antialias: true,
                      premultipliedAlpha: false,
                      toneMapping: THREE.ACESFilmicToneMapping,
                      toneMappingExposure: 1.4,
                    }}
                    dpr={[1, 2]}
                    style={{
                      zIndex: 10,
                    }}
                  >
                    {/* <SpaceScene /> */}
                    {/* <HyperSpace /> */}
                    <ButterflyNebulaScene />
                    {/* <PlanetSwarmScene /> */}
                    {/* <TransitionScene /> */}
                    <StarFields />
                  </BaseCanvas>
                </Suspense>
              </LiquidGlass>
            </div>
          </SceneLoaderWrapper>
        </HyperspaceWrapper>
      </Transition>
    </>
  );
};
