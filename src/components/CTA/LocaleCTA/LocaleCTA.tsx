'use client';

import { useMemo } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { DE, FR, US } from 'country-flag-icons/react/3x2';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const LocaleCTA = () => {
  const pathname = usePathname();

  const locale = useMemo(() => pathname.split('/')[1], [pathname]);

  const getNewPathname = (newLocale: string) => {
    const splittedPathname = pathname.split('/');

    splittedPathname[1] = newLocale;

    return splittedPathname.join('/');
  };

  const [menuSpring, api] = useSpring(() => ({
    from: {
      width: 0,
      opacity: 0,
    },
    to: [
      {
        width: 26,
        opacity: 0,
      },
      {
        width: 52,
        opacity: 0,
      },
      {
        width: 104,
        opacity: 1,
      },
    ],
  }));

  const getFlag = () => {
    switch (locale) {
      case 'fr':
        return (
          <button className='cursor-pointer rounded-4xl' type='button'>
            <FR title='fr' width={24} height={24} />
          </button>
        );
      case 'de':
        return (
          <button className='cursor-pointer rounded-4xl' type='button'>
            <DE title='de' width={24} height={24} />
          </button>
        );
      case 'en':
      default:
        return (
          <button
            className='cursor-pointer rounded-4xl'
            onMouseOver={() => {
              api.start();
            }}
          >
            <US title='en-us' width={24} height={24} />
          </button>
        );
    }
  };

  return (
    <div className='flex flex-row-reverse items-center gap-4'>
      {getFlag()}
      <animated.div style={menuSpring} className='flex items-center gap-4'>
        <Link href={getNewPathname('en')} className='rounded-4xl'>
          <US title='en-us' width={24} height={24} />
        </Link>
        <Link href={getNewPathname('fr')} className='rounded-4xl'>
          <FR title='fr' width={24} height={24} />
        </Link>
        <Link href={getNewPathname('de')} className='rounded-4xl'>
          <DE title='de' width={24} height={24} />
        </Link>
      </animated.div>
    </div>
  );
};
