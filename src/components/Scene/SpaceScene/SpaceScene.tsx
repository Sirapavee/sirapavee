'use client';

import { useRef } from 'react';
import { PerspectiveCamera } from 'three';

import { Space } from './Space';

const Camera = () => {
  const perspectiveCameraRef = useRef<PerspectiveCamera>(null!);

  return (
    <perspectiveCamera
      ref={perspectiveCameraRef}
      position={[0, 0, 0]}
      fov={100}
      near={0.1}
      far={500}
    />
  );
};

export const SpaceScene = () => (
  <>
    <Space />
    <Camera />
  </>
);
