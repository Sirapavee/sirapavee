import React, { FC, useMemo } from 'react';

type EnhanceChildrenWrapperProps = {
  children: React.ReactElement;
  anonymousCallbackList?: {
    [key: string]: (...args: any[]) => void;
  };
  refList?: {
    [key: string]: React.Ref<unknown>;
  };
};

export const EnhanceChildrenWrapper: FC<EnhanceChildrenWrapperProps> = ({
  children,
  anonymousCallbackList,
  refList,
}) =>
  useMemo(
    () =>
      React.cloneElement(children, {
        ...(!!anonymousCallbackList && anonymousCallbackList),
        ...(!!refList && refList),
      }),
    [children, anonymousCallbackList, refList],
  );
