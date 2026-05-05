'use client';

import Image from 'next/image';
import Link from 'next/link';

import { themeSubHeader } from '@/const/tailwindClass';
// import { useStateContext } from '@/providers/StateProvider';

export const NavBar = () => {
  // const { state } = useStateContext();
  // const { ref } = state;
  // const { spaceConfigRef } = ref;

  // const handleMouseOver = () => {
  //   spaceConfigRef.current = {
  //     configValue: {
  //       ['position.z']: 1,
  //       ['scale.z']: 0.5,
  //     },
  //     mode: 'start',
  //   };
  // };

  // const handleMouseLeave = () => {
  //   spaceConfigRef.current = {
  //     configValue: {
  //       ['position.z']: 1,
  //       ['scale.z']: 0.5,
  //     },
  //     mode: 'idle',
  //   };
  // };

  return (
    <nav className='fixed top-0 z-99 h-20 w-dvw'>
      <div className='relative flex h-20 items-center justify-center py-5 pr-10'>
        <div className='absolute top-0 left-0 flex items-center gap-4'>
          <Link scroll={false} href='/'>
            <Image
              className='size-20'
              src='/logo.svg'
              alt='Logo'
              width={80}
              height={80}
              loading='eager'
            />
          </Link>
        </div>
        <div className='flex gap-4'>
          {/* <Link scroll={false} className={themeSubHeader} href='/about'>
            About
          </Link> */}
          <Link scroll={false} className={themeSubHeader} href='/experience'>
            About
          </Link>
          <Link scroll={false} className={themeSubHeader} href='/experience'>
            Experience
          </Link>
          <Link scroll={false} className={themeSubHeader} href='/experience'>
            Experiments
          </Link>
          <Link scroll={false} className={themeSubHeader} href='/experience'>
            Contact
          </Link>
        </div>
      </div>
    </nav>
  );
};
