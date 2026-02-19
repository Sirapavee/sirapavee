'use client';

import { FC, useEffect, useState } from 'react';
import Cookie from 'js-cookie';

type DarkModeCTAProps = {
  ssrTheme: string;
};

export const DarkModeCTA: FC<DarkModeCTAProps> = ({ ssrTheme }) => {
  const [currentMode, setCurrentMode] = useState(ssrTheme);

  const updateTheme = () => {
    const theme = Cookie.get('theme');
    const newTheme = !!theme && theme === 'light' ? 'dark' : 'light';

    Cookie.set('theme', newTheme);
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
        className='text-light-gray-100 dark:text-dark-gray-200 bg-dark-black-200 dark:bg-light-blue-100 size-12 cursor-pointer rounded-full p-2 text-2xl outline-none'
        onClick={updateTheme}
      >
        {currentMode === 'dark' ? '🌑' : '☀️'}
      </button>
    </div>
  );
};
