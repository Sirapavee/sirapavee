export type LoadingState = {
  /** True while any tracked asset (Drei or procedural) is in flight. */
  isLoading: boolean;
  /** Human-readable name of the most recent in-flight asset. */
  currentAsset: string;
  /** Total tracked assets across both pipelines. */
  totalFiles: number;
  /** Completed assets across both pipelines. */
  completedFiles: number;
};

type ProceduralFile = {
  name: string;
  startTime: number;
  progress: number; // 0..1
  complete: boolean;
};

type ProceduralCacheEntry<T = unknown> = {
  promise?: Promise<T>;
  result?: T;
};

type LoadingStore = {
  preload: <T>(name: string, factory: () => T, durationMs?: number) => void;
  use: <T>(name: string, factory: () => T, durationMs?: number) => T;
  computeProgress: (dreiLoaded: number, dreiTotal: number) => number;
  computeState: (
    dreiActive: boolean,
    dreiItem: string,
    dreiLoaded: number,
    dreiTotal: number,
  ) => LoadingState;
  dismiss: () => void;
  subscribe: (listener: () => void) => () => void;
};

const TAU = 1.8; // synthetic curve time constant (seconds)

const cleanAssetName = (url: string): string =>
  url.split('/').pop()?.split('?')[0] ?? url;

/* ============================================================
 * Singleton Store
 * ------------------------------------------------------------
 * Kept module-scoped so `preload` works before any Provider is
 * mounted — this is what lets multiple `useProcedural` calls
 * across separate components actually load in parallel instead
 * of serializing on Suspense throws.
 * ============================================================ */

export const createLoadingStore = (): LoadingStore => {
  const files = new Map<string, ProceduralFile>();
  const cache = new Map<string, ProceduralCacheEntry>();
  const listeners = new Set<() => void>();
  let rafId: number | null = null;

  const notify = () => listeners.forEach((l) => l());

  const startTicking = () => {
    if (rafId !== null) {
      return;
    }

    // SSR guard — store may be touched during server render (e.g. via
    // a preload call at module scope). rAF only exists in the browser;
    // the synthetic curve will resume on the next preload after hydration.
    if (typeof window === 'undefined') {
      return;
    }

    const tick = () => {
      const now = performance.now();
      for (const f of files.values()) {
        if (f.complete) continue;
        const elapsed = (now - f.startTime) / 1000;
        const synth = Math.min(0.9, 1 - Math.exp(-elapsed / TAU));
        if (synth > f.progress) f.progress = synth;
      }
      const stillLoading = [...files.values()].some((f) => !f.complete);
      rafId = stillLoading ? requestAnimationFrame(tick) : null;
    };
    rafId = requestAnimationFrame(tick);
  };

  const preload = <T>(name: string, factory: () => T, durationMs = 1500): void => {
    if (cache.has(name)) return;

    const entry: ProceduralCacheEntry<T> = {};
    files.set(name, {
      name,
      startTime: performance.now(),
      progress: 0,
      complete: false,
    });
    startTicking();
    notify();

    entry.promise = new Promise<T>((resolve) => {
      setTimeout(() => {
        const result = factory();
        entry.result = result;
        const f = files.get(name);
        if (f && !f.complete) {
          f.complete = true;
          f.progress = 1;
        }
        notify();
        resolve(result);
      }, durationMs);
    });

    cache.set(name, entry as ProceduralCacheEntry);
  };

  const use = <T>(name: string, factory: () => T, durationMs = 1500): T => {
    const hadEntry = cache.has(name);
    const entryy = cache.get(name) as ProceduralCacheEntry<T> | undefined;
    console.log(
      `[store.use] name=${name} hadEntry=${hadEntry} hasResult=${entryy?.result !== undefined}`,
    );

    if (!cache.has(name)) preload(name, factory, durationMs);
    const entry = cache.get(name) as ProceduralCacheEntry<T>;
    if (entry.result !== undefined) return entry.result;
    if (entry.promise) throw entry.promise;
    throw new Error(`useProcedural(${name}): cache entry has neither result nor promise`);
  };

  const computeProgress = (dreiLoaded: number, dreiTotal: number): number => {
    const proc = [...files.values()];
    const procSum = proc.reduce((s, f) => s + f.progress, 0);
    const totalCount = proc.length + dreiTotal;
    if (totalCount === 0) return 0;
    return (procSum + dreiLoaded) / totalCount;
  };

  const computeState = (
    dreiActive: boolean,
    dreiItem: string,
    dreiLoaded: number,
    dreiTotal: number,
  ): LoadingState => {
    const proc = [...files.values()];
    const inFlight = proc.find((f) => !f.complete);
    return {
      isLoading: dreiActive || inFlight !== undefined,
      currentAsset: dreiItem ? cleanAssetName(dreiItem) : (inFlight?.name ?? ''),
      totalFiles: proc.length + dreiTotal,
      completedFiles: proc.filter((f) => f.complete).length + dreiLoaded,
    };
  };

  const dismiss = (): void => {
    let changed = false;
    for (const f of files.values()) {
      if (!f.complete) {
        f.complete = true;
        f.progress = 1;
        changed = true;
      }
    }
    if (changed) notify();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { preload, use, computeProgress, computeState, dismiss, subscribe };
};
