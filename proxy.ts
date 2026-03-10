import { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};

const proxy = async (request: NextRequest) => {
  const defaultLocale = request.headers.get('x-custom-locale') || 'en';

  const handleI18nRouting = createMiddleware(routing);
  const response = handleI18nRouting(request);

  response.headers.set('x-custom-locale', defaultLocale);

  response.headers.set('x-ssr-pathname', request.nextUrl.pathname);
  response.headers.set('x-ssr-domain', request.nextUrl.origin);

  return response;
};

export default proxy;
