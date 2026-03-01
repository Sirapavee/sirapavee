'use client';

import { FC, useEffect, useState } from 'react';
import { getCookie, setCookie } from 'cookies-next';
import dayjs from 'dayjs';

import { themeBgReverse } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

type DarkModeCTAProps = {
  ssrTheme: string;
};

export const DarkModeCTA: FC<DarkModeCTAProps> = ({ ssrTheme }) => {
  const [currentMode, setCurrentMode] = useState(ssrTheme);

  const updateTheme = () => {
    const theme = getCookie('theme');

    const toggledTheme = theme === 'light' ? 'dark' : 'light';
    const newTheme = !theme ? 'dark' : toggledTheme;

    // NOTE: set cookie to expire in 365 days
    setCookie('theme', newTheme, {
      expires: dayjs().add(365, 'day').toDate(),
    });
    setCurrentMode(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentMode);
  }, [currentMode]);

  return (
    <div className='absolute bottom-3 left-3 z-2 flex cursor-pointer items-center justify-center'>
      <button
        role='button'
        className={cn(
          'size-12 cursor-pointer rounded-full p-2 text-2xl outline-none',
          themeBgReverse,
        )}
        onClick={updateTheme}
      >
        {currentMode === 'dark' ? '🌑' : '☀️'}
      </button>
    </div>
  );
};
