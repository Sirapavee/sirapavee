'use client';

import { animated, useSpring } from '@react-spring/web';

import { themeHeader, themeSubHeader } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

export const LandingPage = () => {
  const headerSpring = useSpring({
    from: {
      opacity: 0,
      scale: 0,
    },
    to: [
      {
        opacity: 1,
        scale: 1.1,
      },
      {
        opacity: 1,
        scale: 1,
      },
    ],
  });

  const subHeaderSpring = useSpring({
    from: {
      opacity: 0,
      scale: 0,
    },
    to: {
      opacity: 1,
      scale: 1,
    },
    delay: 500,
  });

  const copyrightSpring = useSpring({
    from: {
      opacity: 0,
      y: 20,
    },
    to: {
      opacity: 1,
      y: 0,
    },
    delay: 1000,
  });

  return (
    <div className='relative flex size-full flex-col items-center justify-center gap-4'>
      <animated.h1
        style={headerSpring}
        className={cn(
          'typo-headline-1 text-center text-5xl font-bold md:text-6xl',
          themeHeader,
        )}
      >
        I&apos;m Sirapavee Ganyaporngul
      </animated.h1>
      <animated.span
        style={subHeaderSpring}
        className={cn('typo-headline-2 text-2xl font-semibold', themeSubHeader)}
      >
        A Frontend Developer
      </animated.span>
      <animated.p
        style={copyrightSpring}
        className={cn('typo-body-1 absolute bottom-5 font-semibold', themeSubHeader)}
      >
        &copy; 2026 Sirapavee
      </animated.p>
    </div>
  );
};
