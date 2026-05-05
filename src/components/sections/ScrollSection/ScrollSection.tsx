import { useCallback, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { About } from '../About';

import { LandingPage } from '@/components/LandingPage';
import { cn } from '@/utils/className';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const SECTION_LIST = [
  { id: 'hero', label: 'Home', z: 0 },
  { id: 'about', label: 'About', z: -2500 },
  { id: 'work', label: 'Experience', z: -7000 },
  { id: 'skills', label: 'Experiments', z: -8000 },
  { id: 'contact', label: 'Contact', z: -10000 },
];

const TOTAL_DEPTH = 10000;
const PERSPECTIVE = 800;

export const ScrollSection = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<HTMLElement[]>([]);

  const updateSectionRef = useCallback((el: HTMLElement | null, i: number) => {
    if (el) {
      sectionRefs.current[i] = el;
    }
  }, []);

  useGSAP(() => {
    const sectionList = sectionRefs.current.filter(Boolean);

    sectionList.forEach((section, i) => {
      const z = SECTION_LIST[i].z;
      gsap.set(section, {
        z,
        opacity: z === 0 ? 1 : 0,
        display: z === 0 ? 'flex' : 'none',
      });
    });

    const trigger = ScrollTrigger.create({
      trigger: '#z-scroll-spacer',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => {
        const p = self.progress;
        const camZ = p * TOTAL_DEPTH;

        sectionList.forEach((section, i) => {
          const baseZ = Math.abs(SECTION_LIST[i].z);
          const cz = baseZ - camZ;

          let op, disp;
          if (cz < -250) {
            op = 0;
            disp = 'none';
          } else if (cz > PERSPECTIVE) {
            op = 0;
            disp = 'none';
          } else if (cz > PERSPECTIVE * 0.55) {
            op = 1 - (cz - PERSPECTIVE * 0.55) / (PERSPECTIVE * 0.45);
            disp = 'flex';
          } else if (cz < 0) {
            op = Math.max(0, 1 + cz / 250);
            disp = 'flex';
          } else {
            op = 1;
            disp = 'flex';
          }

          gsap.set(section, { z: -cz, opacity: op, display: disp });
        });
      },
    });

    return () => trigger.kill();
  });

  return (
    <>
      <div
        ref={viewportRef}
        className={cn('fixed inset-0 z-1 overflow-hidden perspective-origin-[50%_50%]')}
        style={{
          perspective: `${PERSPECTIVE}px`,
        }}
      >
        <div className='absolute inset-0 transform-3d'>
          <section
            ref={(el) => updateSectionRef(el, 0)}
            className='absolute inset-0 flex items-center justify-center will-change-[transform,opacity] backface-hidden transform-3d'
          >
            <LandingPage />
          </section>
          <section
            ref={(el) => updateSectionRef(el, 1)}
            className='absolute inset-0 flex items-center justify-center will-change-[transform,opacity] backface-hidden transform-3d'
          >
            <About />
          </section>
          <section
            ref={(el) => updateSectionRef(el, 2)}
            className='absolute inset-0 flex items-center justify-center will-change-[transform,opacity] backface-hidden transform-3d'
          >
            <LandingPage />
          </section>
          <section
            ref={(el) => updateSectionRef(el, 3)}
            className='absolute inset-0 flex items-center justify-center will-change-[transform,opacity] backface-hidden transform-3d'
          >
            <About />
          </section>
          <section
            ref={(el) => updateSectionRef(el, 4)}
            className='absolute inset-0 flex items-center justify-center will-change-[transform,opacity] backface-hidden transform-3d'
          >
            <LandingPage />
          </section>
        </div>
      </div>
      <div id='z-scroll-spacer' className='pointer-events-none h-[600vh]' />
    </>
  );
};
