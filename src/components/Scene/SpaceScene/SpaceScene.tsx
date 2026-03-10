'use client';

import { FC, ReactNode, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Scene } from 'three';

import { Space } from './Space';

import { ConfigProps } from '@/types/scene';

const Camera = () => {
  const perspectiveCameraRef = useRef<PerspectiveCamera>(null!);

  return (
    <perspectiveCamera
      ref={perspectiveCameraRef}
      position={[-6, 7, 7]}
      fov={100}
      near={0.1}
      far={500}
    />
  );
};

export const INITIAL_SPACE_CONFIG_PROPS: ConfigProps = {
  configValue: {
    ['position.z']: 0,
    ['scale.z']: 0,
  },
  mode: 'idle',
};

type SpaceSceneProps = {
  children?: ReactNode;
  configProps?: ConfigProps;
};

export const SpaceScene: FC<SpaceSceneProps> = ({
  children,
  configProps = INITIAL_SPACE_CONFIG_PROPS,
}) => {
  const scene = useMemo(() => new Scene(), []);

  return (
    <div className='flex h-dvh w-dvw'>
      <div className='absolute z-1 h-dvh w-dvw'>{children}</div>
      <Canvas
        className='bg-light-blue-100 dark:bg-dark-black-200'
        shadows
        fallback={<div>Sorry no WebGL supported!</div>}
        scene={scene}
      >
        <Space configProps={configProps} />
        <Camera />
      </Canvas>
    </div>
  );
};
