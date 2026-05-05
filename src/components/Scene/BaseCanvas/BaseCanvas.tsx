import { FC, ReactNode, useMemo } from 'react';
import { Canvas, CanvasProps } from '@react-three/fiber';
import { Scene } from 'three';

type BaseCanvasProps = {
  children?: ReactNode;
} & CanvasProps;

export const BaseCanvas: FC<BaseCanvasProps> = ({ children, ...props }) => {
  const scene = useMemo(() => new Scene(), []);

  return (
    <Canvas
      shadows
      fallback={<div>Sorry no WebGL supported!</div>}
      scene={scene}
      {...props}
    >
      {children}
    </Canvas>
  );
};
