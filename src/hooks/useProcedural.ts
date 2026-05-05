import { loadingStore } from './useLoadingStore';

import { useSceneLoadingContext } from '@/providers/SceneLoaderProvider';

/**
 * Suspense-compatible procedural asset. Use for code-built things —
 * custom geometries, ShaderMaterials, particle BufferGeometries —
 * that should appear in the loading screen alongside Drei loaders.
 *
 * For parallel loads, call `useProcedural.preload(...)` for every
 * asset at module scope or in a parent before the consuming
 * components mount. Otherwise each Suspense throw serializes the next
 * `useProcedural` call by one full render cycle.
 *
 * Example:
 *   useProcedural.preload('hero-geo', makeGeometry, 1300);
 *   useProcedural.preload('hero-mat', makeMaterial, 2000);
 *
 *   function Hero() {
 *     const geo = useProcedural<THREE.BufferGeometry>('hero-geo', makeGeometry, 1300);
 *     const mat = useProcedural<THREE.ShaderMaterial>('hero-mat', makeMaterial, 2000);
 *     return <mesh geometry={geo} material={mat} />;
 *   }
 */

export const useProcedural = <T>(
  name: string,
  factory: () => T,
  durationMs = 1500,
): T => {
  useSceneLoadingContext(); // assert we're inside the Provider
  return loadingStore.use<T>(name, factory, durationMs);
};

useProcedural.preload = <T>(name: string, factory: () => T, durationMs = 1500): void => {
  loadingStore.preload(name, factory, durationMs);
};
