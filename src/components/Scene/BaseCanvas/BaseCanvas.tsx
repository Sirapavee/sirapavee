import { FC, ReactNode, useMemo } from 'react';
import { Canvas, CanvasProps } from '@react-three/fiber';
import * as THREE from 'three';

type BaseCanvasProps = {
  children?: ReactNode;
} & CanvasProps;

export const BaseCanvas: FC<BaseCanvasProps> = ({ children, ...props }) => {
  const scene = useMemo(() => new THREE.Scene(), []);

  return (
    <Canvas
      camera={{ position: [0, 0, 42], fov: 50, near: 0.1, far: 500 }}
      gl={{
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.4,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      dpr={[1, 2]}
      style={{
        zIndex: 10,
      }}
      shadows
      fallback={<div>Sorry no WebGL supported!</div>}
      scene={scene}
      {...props}
    >
      {children}
    </Canvas>
  );
};
