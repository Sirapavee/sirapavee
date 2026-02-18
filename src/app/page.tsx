export const metadata = {
  title: 'Home',
  description: 'Portfolio of Sirapavee Ganyaporngul, a Frontend Developer',
  icons: {
    icon: './logo.svg',
  },
};

export default function Home() {
  return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-4'>
      <h1 className='text-light-gray-300 typo-headline-1 dark:text-dark-gray-100 text-6xl font-bold'>
        I&apos;m Sirapavee Ganyaporngul
      </h1>
      <span className='text-light-gray-200 typo-headline-2 dark:text-dark-gray-200 text-2xl font-semibold'>
        A Frontend Developer
      </span>
      <p className='text-light-gray-200 typo-body-1 dark:text-dark-gray-200 fixed bottom-5 font-semibold'>
        &copy; 2026 Sirapavee
      </p>
    </div>
  );
}
