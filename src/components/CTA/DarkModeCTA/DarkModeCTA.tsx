'use client';

import { FC, useEffect, useState } from 'react';
import Cookie from 'js-cookie';

import { themeBgReverse } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

type DarkModeCTAProps = {
  ssrTheme: string;
};

export const DarkModeCTA: FC<DarkModeCTAProps> = ({ ssrTheme }) => {
  const [currentMode, setCurrentMode] = useState(ssrTheme);

  const updateTheme = () => {
    const theme = Cookie.get('theme');

    const toggledTheme = theme === 'light' ? 'dark' : 'light';
    const newTheme = !theme ? 'dark' : toggledTheme;

    // NOTE: set cookie to expire in 365 days
    Cookie.set('theme', newTheme, {
      expires: 365,
    });
    setCurrentMode(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentMode);
  }, [currentMode]);

  return (
    <div className='absolute right-3 bottom-3 flex cursor-pointer items-center justify-center'>
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
