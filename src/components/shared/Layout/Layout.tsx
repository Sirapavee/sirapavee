import { FC } from 'react';

import { DarkModeCTA } from '@/components/CTA';
import { Footer } from '@/components/Footer';
import { NavBar } from '@/components/NavBar';

type LayoutProps = {
  children: React.ReactNode;
  theme: string;
};

export const Layout: FC<LayoutProps> = ({ children, theme }) => {
  return (
    <>
      <NavBar />
      <div className='h-dvh w-dvw'>{children}</div>
      <DarkModeCTA ssrTheme={theme} />
      <Footer />
    </>
  );
};
