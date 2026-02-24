import { CookiesNextProvider } from 'cookies-next';
import { Pridi } from 'next/font/google';
import { cookies } from 'next/headers';

import { cn } from '../utils/className';

import '@styles/global.css';

import { DarkModeCTA } from '@/components/CTA';
import { NavBar } from '@/components/NavBar';
import { themeBg } from '@/const/tailwindClass';

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
  const theme = (await cookies()).get('theme')?.value ?? 'light;';

  return (
    <html lang='en' data-theme={theme}>
      <body className={cn('antialiased', pridi.variable, themeBg)}>
        <CookiesNextProvider pollingOptions={{ enabled: true, intervalMs: 0 }}>
          <NavBar />
          <div className='h-dvh w-dvw'>{children}</div>
          <DarkModeCTA ssrTheme={theme} />
        </CookiesNextProvider>
      </body>
    </html>
  );
}
