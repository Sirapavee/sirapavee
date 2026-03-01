import { LocaleCTA } from '@components/CTA/LocaleCTA';
import Link from 'next/link';

import { GithubIcon, LinkedInIcon } from '@/components/ui';
import { themeSubHeader } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

export const Footer = () => {
  return (
    <div className='fixed bottom-0 flex h-fit w-dvw items-center justify-end p-3'>
      <div className={cn('flex items-center gap-3', themeSubHeader)}>
        <LocaleCTA />
        <Link href='https://linkedin.com/in/sirapavee-g' target='_blank'>
          <LinkedInIcon />
        </Link>
        <Link href='https://github.com/Sirapavee' target='_blank'>
          <GithubIcon />
        </Link>
      </div>
    </div>
  );
};
