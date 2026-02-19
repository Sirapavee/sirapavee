'use client';

import { animated, useSpring } from '@react-spring/web';

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

  // const pathname = usePathname();
  // const transition = useTransition(pathname, {
  //   from: {
  //     opacity: 0,
  //     scale: 0,
  //   },
  //   enter: [
  //     {
  //       opacity: 1,
  //       scale: 1.1,
  //     },
  //     {
  //       opacity: 1,
  //       scale: 1,
  //     },
  //   ],
  //   leave: {
  //     opacity: 0,
  //     scale: 0,
  //   },
  //   key: pathname,
  // });

  return (
    <div className='relative flex size-full flex-col items-center justify-center gap-4'>
      <animated.h1
        style={headerSpring}
        className='text-light-gray-300 typo-headline-1 dark:text-dark-gray-100 text-center text-5xl font-bold md:text-6xl'
      >
        I&apos;m Sirapavee Ganyaporngul
      </animated.h1>
      {/* {transition(
        (style, item) =>
          item && (
            <animated.h1
              style={style}
              className='text-light-gray-300 typo-headline-1 dark:text-dark-gray-100 text-center text-5xl font-bold md:text-6xl'
            >
              I&apos;m Sirapavee Ganyaporngul
            </animated.h1>
          ),
      )} */}
      <animated.span
        style={subHeaderSpring}
        className='text-light-gray-200 typo-headline-2 dark:text-dark-gray-200 text-2xl font-semibold'
      >
        A Frontend Developer
      </animated.span>
      <animated.p
        style={copyrightSpring}
        className='text-light-gray-200 typo-body-1 dark:text-dark-gray-200 absolute bottom-5 font-semibold'
      >
        &copy; 2026 Sirapavee
      </animated.p>
    </div>
  );
};
