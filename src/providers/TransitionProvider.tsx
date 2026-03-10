'use client';

import { createContext, FC, ReactNode, useContext, useState } from 'react';
import gsap from 'gsap';

type TransitionContextProps = {
  timeline: gsap.core.Timeline;
  updateTimeline: (newTimeline: gsap.core.Timeline) => void;
};

const TransitionContext = createContext<TransitionContextProps>({
  timeline: gsap.timeline({ paused: true }),
  updateTimeline: () => {},
});

export const TransitionProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [timeline, setTimeLine] = useState(() => gsap.timeline({ paused: true }));

  const updateTimeline = (newTimeline: gsap.core.Timeline) => {
    setTimeLine(newTimeline);
  };

  const contextValue = {
    timeline,
    updateTimeline,
  };

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}
    </TransitionContext.Provider>
  );
};

export const useTransitionContext = () => {
  const context = useContext(TransitionContext);

  if (context === undefined) {
    throw new Error('useTransitionContext must be used within a TransitionProvider');
  }

  return context;
};
