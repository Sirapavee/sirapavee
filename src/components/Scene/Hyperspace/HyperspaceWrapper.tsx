import { FC, ReactElement, useRef } from 'react';

import { Hyperspace } from './Hyperspace';

import { EnhanceChildrenWrapper } from '@/components/shared/EnhanceChildrenWrapper/EnhanceChildrenWrapper';
import {
  HyperspaceHandle,
  HyperspaceProps,
  HyperspaceProvider,
} from '@/providers/HyperspaceProvider';

export const HyperspaceWrapper: FC<HyperspaceProps> = ({
  children,
  className,
  slashAngleDeg = -30,
  durations,
  unmountDelayMs = 2000,
  showStateBar = true,
}) => {
  const hyperspaceref = useRef<HyperspaceHandle>(null);

  return (
    <HyperspaceProvider
      ref={hyperspaceref}
      durations={durations}
      slashAngleDeg={slashAngleDeg}
      unmountDelayMs={unmountDelayMs}
    >
      <Hyperspace
        slashAngleDeg={slashAngleDeg}
        showStateBar={showStateBar}
        className={className}
      >
        <EnhanceChildrenWrapper refList={{ hyperspaceref }}>
          {children as ReactElement}
        </EnhanceChildrenWrapper>
      </Hyperspace>
    </HyperspaceProvider>
  );
};
