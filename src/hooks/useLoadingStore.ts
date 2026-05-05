import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';

import { createLoadingStore, LoadingState } from '@/stores/external/loadingStore';

/* ============================================================
 * Hook — consumer wrapper around the singleton
 * ------------------------------------------------------------
 * Combines store events + Drei's progress into one coarse state,
 * plus a stable getProgress() for the LoadingScreen's rAF loop.
 * useSyncExternalStore handles the subscribe/unsubscribe plumbing
 * and tearing-free reads.
 * ============================================================ */

type LoadingStoreSnapshot = {
  getProgress: () => number;
  loaderStoreState: LoadingState;
};

// Module-level singleton — must live here, not inside a hook, so
// preload() can be called before any component mounts (parallel loads).
export const loadingStore = createLoadingStore();

export const useLoadingStore = (): LoadingStoreSnapshot => {
  const { computeProgress, computeState, subscribe } = loadingStore;

  const progress = useProgress();

  // Sync latest drei into a ref AFTER commit — no render-time writes.
  // useLayoutEffect (not useEffect) so the ref is current before any
  // dependent effects fire later in the same commit.
  const progressRef = useRef(progress);
  useLayoutEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Coarse state — re-renders only on lifecycle events.
  const [state, setState] = useState<LoadingState>(() =>
    computeState(progress.active, progress.item ?? '', progress.loaded, progress.total),
  );

  // Recompute reads progressRef rather than progress directly, so the function
  // itself doesn't need progress in its deps — keeping its identity stable.
  const recompute = useCallback(() => {
    const d = progressRef.current;
    const next = computeState(d.active, d.item ?? '', d.loaded, d.total);

    setState((prev) =>
      prev.isLoading === next.isLoading &&
      prev.currentAsset === next.currentAsset &&
      prev.totalFiles === next.totalFiles &&
      prev.completedFiles === next.completedFiles
        ? prev
        : next,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to procedural store events (mount once).
  useEffect(
    () => subscribe(recompute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recompute],
  );

  // Recompute whenever Drei's state changes. progressRef has already been
  // updated by the layout effect above by the time this fires.
  useEffect(() => {
    recompute();
  }, [progress.active, progress.item, progress.loaded, progress.total, recompute]);

  const getProgress = () => {
    const d = progressRef.current;
    return computeProgress(d.loaded, d.total);
  };

  return { loaderStoreState: state, getProgress };
};
