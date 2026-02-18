import { useEffect, useState } from 'react';

export const useMediaQuery = (minWidth: number) => {
  const [matches, setMatches] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`screen and (min-width: ${minWidth}px)`);
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };
    mediaQuery.addEventListener('change', listener);

    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return matches;
};
