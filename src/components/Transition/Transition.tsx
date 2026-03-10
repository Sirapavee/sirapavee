'use client';

import { FC, ReactNode, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { useTransitionContext } from '@/providers/TransitionProvider';

gsap.registerPlugin(useGSAP);

type TransitionProps = {
  children: ReactNode;
  key: string;
};

export const Transition: FC<TransitionProps> = ({ children, key }) => {
  const [displayChildren, setDisplayChildren] = useState<ReactNode>(children);
  const [currentChildrenKey, setCurrentChildrenKey] = useState<string>(key);

  const { timeline } = useTransitionContext();

  useGSAP(() => {
    if (key !== currentChildrenKey) {
      timeline.play().then(() => {
        setDisplayChildren(children);
        setCurrentChildrenKey(key);

        window.scrollTo(0, 0);
        timeline.pause().clear();
      });
    }
  });

  return <>{displayChildren}</>;
};
