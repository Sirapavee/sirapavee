'use client';

import { useState } from 'react';

import { getLocalStorage, setLocalStorage } from '@/utils/cookie';

export const DarkModeCTA = () => {
  const [currentMode, setCurrentMode] = useState(getLocalStorage('theme') ?? 'dark');

  const updateTheme = () => {
    const theme = getLocalStorage('theme');
    const newTheme = !!theme && theme === 'light' ? 'dark' : 'light';

    setLocalStorage('theme', newTheme);
    setCurrentMode(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className='absolute right-3 bottom-3 flex cursor-pointer items-center justify-center'>
      <button
        role='button'
        className='text-light-gray-100 dark:text-dark-gray-200 bg-dark-black-200 dark:bg-light-blue-100 size-12 cursor-pointer rounded-full p-2 text-2xl outline-none'
        onClick={updateTheme}
      >
        {currentMode === 'dark' ? '🌙' : '☀️'}
      </button>
    </div>
  );
};
