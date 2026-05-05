import { FC, ReactNode } from 'react';

import { SceneLoader } from './SceneLoader';

import { SceneLoadingProvider } from '@/providers/SceneLoaderProvider';

type SceneLoaderWrapperProps = {
  children: ReactNode;
};

export const SceneLoaderWrapper: FC<SceneLoaderWrapperProps> = ({ children }) => {
  return (
    <SceneLoadingProvider>
      <SceneLoader>{children}</SceneLoader>
    </SceneLoadingProvider>
  );
};
