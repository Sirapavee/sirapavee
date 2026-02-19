import { Pridi } from 'next/font/google';
import { cookies } from 'next/headers';

import { cn } from '../utils/className';

import '@styles/global.css';

import { DarkModeCTA } from '@/components/CTA';
import { NavBar } from '@/components/NavBar';

const pridi = Pridi({
  subsets: ['latin'],
  variable: '--font-pridi',
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'Home',
  description: 'Portfolio of Sirapavee Ganyaporngul, a Frontend Developer',
  icons: {
    icon: './logo.svg',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = (await cookies()).get('theme')?.value ?? 'dark;';

  return (
    <html lang='en' data-theme={theme}>
      <body
        className={cn(
          'bg-light-blue-100 dark:bg-dark-black-200 antialiased',
          pridi.variable,
        )}
      >
        <NavBar />
        <div className='h-dvh w-dvw'>{children}</div>
        <DarkModeCTA ssrTheme={theme} />
      </body>
    </html>
  );
}
