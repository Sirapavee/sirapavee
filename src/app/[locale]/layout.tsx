import { CookiesNextProvider } from 'cookies-next';
import { Pridi } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { hasLocale, NextIntlClientProvider } from 'next-intl';

import notFound from './not-found';

import '@styles/global.css';

import { Layout } from '@/components/shared/Layout/Layout';
import { Transition } from '@/components/Transition/Transition';
import { themeBg } from '@/const/tailwindClass';
import { routing } from '@/i18n/routing';
import { StateProvider } from '@/providers/StateProvider';
import { TransitionProvider } from '@/providers/TransitionProvider';
import { cn } from '@/utils/className';

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
  const headerList = headers();
  const ssrPathname = (await headerList).get('x-ssr-pathname');

  const store = await cookies();
  const theme = store.get('theme')?.value ?? 'light';

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
    swapDarkmode: 'star supernova explosion -> light mode, black hole -> dark mode',
    ssrPathname,
  });

  return (
    <html lang='en' data-theme={theme}>
      <body className={cn('antialiased', pridi.variable, themeBg)}>
        <NextIntlClientProvider>
          <CookiesNextProvider pollingOptions={{ enabled: true, intervalMs: 0 }}>
            <StateProvider>
              <TransitionProvider>
                <Transition key={ssrPathname ?? ''}>
                  <Layout theme={theme}>{children}</Layout>
                </Transition>
              </TransitionProvider>
            </StateProvider>
          </CookiesNextProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
