import { CookiesNextProvider } from 'cookies-next';
import { Pridi } from 'next/font/google';
import { cookies } from 'next/headers';
import { hasLocale, NextIntlClientProvider } from 'next-intl';

import { cn } from '../../utils/className';
import notFound from './not-found';

import '@styles/global.css';

import { DarkModeCTA } from '@/components/CTA';
import { Footer } from '@/components/Footer';
import { NavBar } from '@/components/NavBar';
import { themeBg } from '@/const/tailwindClass';
import { routing } from '@/i18n/routing';

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
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const store = await cookies();
  const theme = store.get('theme')?.value ?? 'light;';

  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  console.log({
    pages: {
      'experience':
        'planet menu orbiting the center click arrow to move orbit to the next',
      'experience2': 'timeline point with mountain background',
      'transition between page': 'space warp',
      'about': 'floating astronaut with speech bubble said "Learn more about me!"',
    },
  });

  return (
    <html lang='en' data-theme={theme}>
      <body className={cn('antialiased', pridi.variable, themeBg)}>
        <NextIntlClientProvider>
          <CookiesNextProvider pollingOptions={{ enabled: true, intervalMs: 0 }}>
            <NavBar />
            <div className='h-dvh w-dvw'>{children}</div>
            <DarkModeCTA ssrTheme={theme} />
            <Footer />
          </CookiesNextProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
