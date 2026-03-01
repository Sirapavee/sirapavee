import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // NOTE:  supported languages
  locales: ['en', 'de', 'fr'],
  defaultLocale: 'en',
});
