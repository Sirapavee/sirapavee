'use client';

import { FC, useEffect, useMemo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { setCookie, useReactiveGetCookie } from 'cookies-next';
import dayjs from 'dayjs';
import { gsap } from 'gsap';

import { themeBgReverse } from '@/const/tailwindClass';
import { useStateContext } from '@/providers/StateProvider';
import { cn } from '@/utils/className';

gsap.registerPlugin(useGSAP);

type DarkModeCTAProps = {
  ssrTheme: string;
};

export const DarkModeCTA: FC<DarkModeCTAProps> = ({ ssrTheme }) => {
  const darkModeCTARef = useRef<HTMLDivElement>(null);
  const getCookie = useReactiveGetCookie();
  const theme = useMemo(() => getCookie('theme') ?? ssrTheme, [getCookie, ssrTheme]);

  const { state } = useStateContext();
  const { ref } = state;
  const { themeRef } = ref;

  const updateTheme = () => {
    // const theme = getCookie('theme');

    const toggledTheme = theme === 'light' ? 'dark' : 'light';
    const newTheme = !theme ? 'dark' : toggledTheme;

    // NOTE: set cookie to expire in 365 days
    setCookie('theme', newTheme, {
      expires: dayjs().add(365, 'day').toDate(),
    });
    themeRef.current = newTheme;
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    themeRef.current = theme;
  }, [theme, themeRef]);

  useGSAP(
    () => {
      gsap
        .fromTo(
          darkModeCTARef.current,
          {
            opacity: 0,
          },
          {
            opacity: 1,
          },
        )
        .then(() => {
          themeRef.current = theme;
        });
    },
    {
      scope: darkModeCTARef,
      dependencies: [theme],
    },
  );

  return (
    <div
      ref={darkModeCTARef}
      className='fixed bottom-3 left-3 z-11 flex cursor-pointer items-center justify-center'
    >
      <button
        role='button'
        className={cn(
          'size-12 cursor-pointer rounded-full p-2 text-2xl outline-none',
          themeBgReverse,
        )}
        onClick={updateTheme}
      >
        {theme === 'dark' ? '🌑' : '☀️'}
      </button>
    </div>
  );
};
