'use client';

import { FC, ReactNode, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';

import { useTransitionContext } from '@/providers/TransitionProvider';

gsap.registerPlugin(useGSAP);

type TransitionProps = {
  children: ReactNode;
  id: string;
};

export const Transition: FC<TransitionProps> = ({ children, id }) => {
  const [displayChildren, setDisplayChildren] = useState<ReactNode>(children);
  const [currentChildrenId, setCurrentChildrenId] = useState<string>(id);

  const { timeline } = useTransitionContext();

  useGSAP(() => {
    if (id !== currentChildrenId) {
      timeline.play().then(() => {
        setDisplayChildren(children);
        setCurrentChildrenId(id);

        window.scrollTo(0, 0);
        timeline.pause().clear();
      });
    }
  });

  return <>{displayChildren}</>;
};
