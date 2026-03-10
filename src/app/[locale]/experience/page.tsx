'use client';

// import { cookies } from 'next/headers';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { themeHeader } from '@/const/tailwindClass';
import { useTransitionContext } from '@/providers/TransitionProvider';
import { cn } from '@/utils/className';

// import { createClient } from '@/utils/supabase/server';

export default function ExperiencePage() {
  //   const cookieStore = cookies();
  //   const supabase = createClient(cookieStore);

  //   const { data: experienceList } = await supabase
  //     .from('[sirapavee] experience')
  //     .select('*');

  //   console.log({
  //     experienceList,
  //   });

  const container = useRef<HTMLDivElement>(null);
  const { timeline } = useTransitionContext();

  useGSAP(
    () => {
      gsap.fromTo(
        container.current,
        { opacity: 0, duration: 2, backgroundColor: 'red' },
        { opacity: 1, duration: 2, stagger: 0.1, backgroundColor: 'transparent' },
      );

      timeline.add(
        gsap.to(container.current, { opacity: 0, duration: 2, backgroundColor: 'red' }),
      );
    },
    {
      scope: container,
    },
  );

  return (
    <div ref={container} className='flex h-dvh w-dvw items-center justify-center'>
      <span className={cn('typo-headline-1', themeHeader)}>Experience Page</span>
    </div>
  );
}
