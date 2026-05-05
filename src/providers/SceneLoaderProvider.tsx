import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useProgress } from '@react-three/drei';

import { loadingStore, useLoadingStore } from '@/hooks/useLoadingStore';
import { LoadingState } from '@/stores/external/loadingStore';

type LoadingContextValue = LoadingState & {
  /** Read the latest aggregate progress (0..1). Safe to call in rAF. */
  getProgress: () => number;
  /** Imperatively kick off a procedural load. Idempotent by name. */
  preload: <T>(name: string, factory: () => T, durationMs?: number) => void;
  /** Force-complete every in-flight asset (used to dismiss the loader). */
  dismiss: () => void;
};

const LoadingContext = createContext<LoadingContextValue | null>(null);

type LoadingProviderProps = {
  children: ReactNode;
};

export const SceneLoadingProvider: FC<LoadingProviderProps> = ({ children }) => {
  const { getProgress } = useLoadingStore();
  const { computeState, dismiss, preload, subscribe } = loadingStore;

  // Drei's progress hook subscribes to THREE.DefaultLoadingManager,
  // so any useGLTF / useTexture / etc. inside the tree is auto-tracked.
  const progress = useProgress();

  // Coarse state — re-renders consumers only on lifecycle events.
  const [state, setState] = useState<LoadingState>(() => computeState(false, '', 0, 0));

  // Recompute discrete state whenever the store changes OR Drei updates.
  useEffect(() => {
    const recompute = () => {
      const next = computeState(
        progress.active,
        progress.item ?? '',
        progress.loaded,
        progress.total,
      );

      setState((prev) =>
        prev.isLoading === next.isLoading &&
        prev.currentAsset === next.currentAsset &&
        prev.totalFiles === next.totalFiles &&
        prev.completedFiles === next.completedFiles
          ? prev
          : next,
      );
    };

    recompute();
    return subscribe(recompute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const value = useMemo<LoadingContextValue>(
    () => ({
      ...state,
      getProgress,
      preload: preload,
      dismiss: dismiss,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, getProgress],
  );

  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>;
};

export const useSceneLoadingContext = (): LoadingContextValue => {
  const ctx = useContext(LoadingContext);

  if (!ctx) {
    throw new Error('useSceneLoadingContext must be used inside <LoadingProvider>');
  }

  return ctx;
};
