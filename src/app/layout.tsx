import { Pridi } from 'next/font/google';

import { cn } from './utils/className';

import '@styles/global.css';

import { DarkModeCTA } from '@/components/DarkModeCTA';
import { NavBar } from '@/components/NavBar';

const pridi = Pridi({
  subsets: ['latin'],
  variable: '--font-pridi',
  weight: ['400', '500', '600', '700'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localStorage = typeof window !== 'undefined' ? window.localStorage : null;

  return (
    <html lang='en' data-theme={localStorage?.getItem('theme') ?? 'dark'}>
      <body
        className={cn(
          'bg-light-blue-100 dark:bg-dark-black-200 antialiased',
          pridi.variable,
        )}
      >
        <NavBar />
        {children}
        <DarkModeCTA />
      </body>
    </html>
  );
}
