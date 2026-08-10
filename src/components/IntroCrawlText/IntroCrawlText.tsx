import { FC, useEffect, useRef } from 'react';

interface IntroTextCrawlProps {
  scrollSensitivity?: number;
  maxScrollSpeed?: number;
}

export const IntroCrawlText: FC<IntroTextCrawlProps> = ({
  scrollSensitivity = 1.0,
  maxScrollSpeed = 2500, // Caps max animation jump per scroll tick
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const crawlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const crawl = crawlRef.current;

    if (!container || !crawl) {
      return;
    }

    const handleWheel = (e: WheelEvent): void => {
      // Prevent default page scrolling while interacting with the crawl
      e.preventDefault();

      // Access the running CSS animation via Web Animations API
      const animations = crawl.getAnimations();

      if (animations.length > 0) {
        const animation = animations[0];
        const currentMs = (animation.currentTime as number) || 0;

        // Calculate delta with sensitivity
        let rawShift = e.deltaY * scrollSensitivity * 10;

        // Cap scroll speed (clamp between -maxScrollSpeed and +maxScrollSpeed)
        const clampedShift = Math.max(
          -maxScrollSpeed,
          Math.min(maxScrollSpeed, rawShift),
        );

        let newTime = currentMs + clampedShift;
        if (newTime < 0) newTime = 0;

        animation.currentTime = newTime;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scrollSensitivity, maxScrollSpeed]);

  return (
    <div className='relative z-1 h-screen w-full overflow-hidden bg-transparent font-sans select-none'>
      {/* 3D Perspective Container */}
      <div
        ref={containerRef}
        className='crawl-container relative flex h-full w-full cursor-pointer justify-center'
        style={{ perspective: '1000px' }}
      >
        {/* Crawling Text Plane: Expanded to 80% screen width (80vw) */}
        <div
          ref={crawlRef}
          className='animate-starwars absolute w-[90vw] text-justify leading-[1.8] font-extrabold tracking-widest text-[#fed100] uppercase'
          style={{ transformOrigin: '50% 100%' }}
        >
          {/* Episode Header */}
          <div className='mb-16 text-center'>
            <h1 className='mb-4 text-4xl tracking-[0.3em] text-[#fed100] md:text-6xl'>
              Special Introduction
            </h1>
            <h2 className='text-6xl tracking-[0.2em] text-[#fed100] md:text-8xl'>
              The Frontend Architect
            </h2>
          </div>

          {/* Paragraphs with increased text size */}
          <div className='space-y-12 text-3xl font-bold md:text-5xl lg:text-6xl'>
            <p>
              It is a time of vast digital expansion. Across the endless galaxy of the
              Web, millions of users navigate complex interfaces in search of seamless
              digital experiences. Emerging from the honors halls of Chulalongkorn
              University, <span className='text-white'>Sirapavee Ganyaporngul</span> has
              risen as a dedicated force in the front-end realm.
            </p>

            <p>
              Armed with the modern arts of React, Next.js, and TypeScript, this front-end
              developer has collaborated with elite squads on high-stakes digital
              projects. From architecting complex mission-critical customization engines
              to engineering core e-commerce checkouts,&nbsp;
              <span className='text-white'>Sirapavee</span> brings balance to user
              experience across every device.
            </p>

            <p>
              Guided by a commitment to continuous learning and technical rigor,&nbsp;
              <span className='text-white'>Sirapavee</span> continues to refine the craft
              of web engineering—building reliable front-end architectures, sharing
              maintainable code solutions, and collaborating closely with teams to deliver
              high-quality digital experiences...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
