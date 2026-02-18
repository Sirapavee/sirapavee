import { useEffect, useState } from 'react';
import { RESPONSIVE_BREAKPOINTS } from '@const/general';

export const useResponsive = () => {
  const [responsiveData, setResponsiveData] = useState({
    curWidth: 0,
    isMobile: false,
    isTablet: false,
    isDesktop: false,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;

      setResponsiveData({
        curWidth: width,
        isMobile: width < RESPONSIVE_BREAKPOINTS.md,
        isTablet: width >= RESPONSIVE_BREAKPOINTS.md && width < RESPONSIVE_BREAKPOINTS.lg,
        isDesktop: width >= RESPONSIVE_BREAKPOINTS.lg,
      });
    };

    // NOTE: initial check
    handleResize();

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return responsiveData;
};
