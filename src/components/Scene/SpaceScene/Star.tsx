'use client';

import { FC, useEffect, useRef } from 'react';
import { Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Mesh } from 'three';

type ConfigProps = {
  configValue: {
    [key: string]: number;
  };
  mode: 'start' | 'cleaning' | 'stop' | 'idle';
};

type StarProps = {
  configProps: ConfigProps;
  idx: number;
};

export const Star: FC<StarProps> = ({ configProps }) => {
  const starRef = useRef<Mesh>(null);
  const zDiffPosRef = useRef<number>(configProps.configValue['position.z']);
  const zDiffScaleRef = useRef<number>(configProps.configValue['scale.z']);

  useEffect(() => {
    zDiffPosRef.current = configProps.configValue['position.z'];
    zDiffScaleRef.current = configProps.configValue['scale.z'];
  }, [configProps.configValue]);

  const defaultPositionX = MathUtils.randFloatSpread(100);
  const defaultPositionY = MathUtils.randFloatSpread(100);
  const defaultPositionZ = MathUtils.randFloatSpread(100);

  const resetStarPosition = () => {
    if (starRef.current && starRef.current.position.z > 50) {
      starRef.current.position.z = -50;
    }
  };

  useFrame(() => {
    if (starRef.current) {
      if (configProps.mode === 'idle') {
        starRef.current.position.z += 0.1;
      }

      if (starRef.current.position.z > 25) {
        starRef.current.scale.set(0, 0, 0);
      }

      if (starRef.current.position.z > 45) {
        starRef.current.scale.x += 0.5;
        starRef.current.scale.y += 0.5;
        starRef.current.scale.z += 0.5;
      }

      resetStarPosition();

      if (starRef.current.scale.x === 1) {
        starRef.current.scale.set(1, 1, 1);
      }

      if (configProps.mode === 'start') {
        starRef.current.scale.z += configProps.configValue['scale.z'];

        starRef.current.position.z += 0;
        setTimeout(() => {
          starRef.current!.position.z += configProps.configValue['position.z'];
        }, 1000);
      } else if (configProps.mode === 'cleaning') {
        while (zDiffPosRef.current > 0.1) {
          starRef.current.position.z += zDiffPosRef.current;
          zDiffPosRef.current -= 0.1;
        }

        while (zDiffScaleRef.current > 0) {
          starRef.current.scale.z += zDiffScaleRef.current;
          zDiffScaleRef.current -= 0.01;
        }

        // starRef.current.position.z += 0.1;
      } else if (configProps.mode === 'stop') {
        starRef.current.position.z += 0;
      }
    }
  });

  const availableColors = [
    0x009dff, // Example color 1
    0x001aff, // Example color 2
    0x4000ff, // Example color 3
    0x7300ff, // Example color 4
  ];

  const predefinedStarColorList = [0x4a6b90, 0x8fc5c1, 0xe6ffed, 0x967098, 0xffd7d7];

  const randomIndex = Math.floor(
    MathUtils.randFloat(0, predefinedStarColorList.length - 1),
  );
  const randomColorHex = predefinedStarColorList[randomIndex];

  return (
    <group>
      <Instance
        ref={starRef}
        position={[defaultPositionX, defaultPositionY, defaultPositionZ]}
        color={randomColorHex}
      />
    </group>
  );
};
