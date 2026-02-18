import Image from 'next/image';
import Link from 'next/link';

export const NavBar = () => {
  return (
    <nav className='fixed top-0 z-99 h-20 w-dvw'>
      <div className='flex items-center justify-between pr-10'>
        <div className='flex items-center gap-4'>
          <Link href='/'>
            <Image src='/logo.svg' alt='Logo' width={80} height={80} />
          </Link>
          <Link className='text-light-gray-200 dark:text-dark-gray-200' href='/test'>
            Test
          </Link>
        </div>
        <div className='flex gap-4'>
          <Link className='text-light-gray-200 dark:text-dark-gray-200' href='/about'>
            About
          </Link>
          <Link
            className='text-light-gray-200 dark:text-dark-gray-200'
            href='/experience'
          >
            Experience
          </Link>
          <Link className='text-light-gray-200 dark:text-dark-gray-200' href='/contact'>
            Contact
          </Link>
        </div>
      </div>
    </nav>
  );
};
