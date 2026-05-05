import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';

import { themeBg } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

gsap.registerPlugin(useGSAP);

export const TextTransitionScene = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textBlockRef = useRef<HTMLDivElement>(null);

  const curtain1Ref = useRef<HTMLDivElement>(null);
  const curtain2Ref = useRef<HTMLDivElement>(null);
  const curtain3Ref = useRef<HTMLDivElement>(null);

  const section1Ref = useRef<HTMLDivElement>(null);
  const section2Ref = useRef<HTMLDivElement>(null);
  const section3Ref = useRef<HTMLDivElement>(null);
  const section4Ref = useRef<HTMLDivElement>(null);
  const section5Ref = useRef<HTMLDivElement>(null);
  const section6Ref = useRef<HTMLDivElement>(null);

  const block1Ref = useRef<HTMLDivElement>(null);
  const block2Ref = useRef<HTMLDivElement>(null);
  const block3Ref = useRef<HTMLDivElement>(null);
  const block4Ref = useRef<HTMLDivElement>(null);
  const block5Ref = useRef<HTMLDivElement>(null);
  const block6Ref = useRef<HTMLDivElement>(null);
  const block7Ref = useRef<HTMLDivElement>(null);
  const block8Ref = useRef<HTMLDivElement>(null);
  const block9Ref = useRef<HTMLDivElement>(null);
  const block10Ref = useRef<HTMLDivElement>(null);
  const block11Ref = useRef<HTMLDivElement>(null);
  const block12Ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, duration: 0.6 },
        { opacity: 1, duration: 0.6 },
      );

      gsap
        .to(textBlockRef.current, {
          rotate: 90,
          translateX: -60,
          translateY: 20,
          opacity: 1,
          duration: 0.5,
          delay: 0.5,
        })
        .then(() => {
          gsap.to(section3Ref.current, {
            translateX: -40,
            rotate: -90,
            transformOrigin: 'top left',
            duration: 0.5,
          });

          gsap.to(section1Ref.current, { translateY: 40, duration: 0.5 });

          gsap
            .to(section4Ref.current, {
              rotate: 90,
              duration: 0.5,
              transformOrigin: 'bottom left',
            })
            .then(() => {
              gsap.to(section2Ref.current, {
                rotate: 90,
                duration: 0.5,
                transformOrigin: 'top right',
              });

              gsap.to(section6Ref.current, {
                rotate: 90,
                duration: 0.5,
                transformOrigin: 'bottom left',
              });

              gsap.to(block1Ref.current, {
                rotate: 90,
                duration: 0.5,
                transformOrigin: 'top right',
              });

              gsap.to(block12Ref.current, {
                rotate: 90,
                duration: 0.5,
                transformOrigin: 'bottom left',
              });
            });
        })
        .then(() => {
          gsap
            .to([curtain1Ref.current, curtain2Ref.current, curtain3Ref.current], {
              translateY: (index) => (index % 2 === 0 ? '100%' : '-100%'),
              duration: 0.4,
              delay: 1.6,
              stagger: 0.6,
            })
            .then(() => {
              gsap.to(containerRef.current, {
                display: 'none',
                zIndex: -1,
                duration: 0.5,
              });
            });
        });
    },
    {
      scope: containerRef,
    },
  );

  //   shadow-[0,0,0,200vmax,rgba(0,0,0,.5)] - text block

  return (
    <div
      ref={containerRef}
      className='absolute z-100 flex h-dvh w-dvw items-center justify-center'
      id='transition'
    >
      <div className='absolute flex h-dvh w-dvw'>
        <div
          ref={curtain1Ref}
          id='curtain-1'
          className={cn('block h-dvh w-1/3', themeBg)}
        />
        <div
          ref={curtain2Ref}
          id='curtain-2'
          className={cn('flex h-dvh w-1/3 items-center justify-center', themeBg)}
        >
          <div ref={textBlockRef} id='text-block' className='flex opacity-0'>
            <div ref={section1Ref} id='section-1' className='flex'>
              <div ref={section2Ref} id='section-2' className='flex'>
                <div ref={block1Ref} id='block-1' className='block size-10 bg-white' />
                <div ref={block2Ref} id='block-2' className='block size-10 bg-white' />
                <div ref={block3Ref} id='block-3' className='block size-10 bg-white' />
              </div>
              <div ref={block4Ref} id='block-4' className='block size-10 bg-white' />
              <div ref={block5Ref} id='block-5' className='block size-10 bg-white' />
            </div>
            <div ref={block6Ref} id='block-6' className='block size-10 bg-white' />
            <div ref={section3Ref} id='section-3' className='flex'>
              <div ref={block7Ref} id='block-7' className='block size-10 bg-white' />
              <div ref={section4Ref} id='section-4' className='flex'>
                <div ref={block8Ref} id='block-8' className='block size-10 bg-white' />
                <div ref={section5Ref} id='section-5' className='flex'>
                  <div ref={block9Ref} id='block-9' className='block size-10 bg-white' />
                  <div ref={section6Ref} id='section-6' className='flex'>
                    <div
                      ref={block10Ref}
                      id='block-10'
                      className='block size-10 bg-white'
                    />
                    <div
                      ref={block11Ref}
                      id='block-11'
                      className='block size-10 bg-white'
                    />
                    <div
                      ref={block12Ref}
                      id='block-12'
                      className='block size-10 bg-white'
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          ref={curtain3Ref}
          id='curtain-3'
          className={cn('block h-dvh w-1/3', themeBg)}
        />
      </div>
    </div>
  );
};
