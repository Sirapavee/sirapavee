'use client';

import { useEffect, useRef } from 'react';
import { Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Mesh } from 'three';

import { getStarRandomHexColor } from './utils';

import { useStateContext } from '@/providers/StateProvider';

export const Star = () => {
  const { state } = useStateContext();

  const { ref } = state;
  const { spaceConfigRef } = ref;

  const starRef = useRef<Mesh>(null);
  const zDiffPosRef = useRef<number>(1);
  const zDiffScaleRef = useRef<number>(0.5);

  useEffect(() => {
    if (spaceConfigRef.current) {
      zDiffPosRef.current = spaceConfigRef.current.configValue['position.z'];
      zDiffScaleRef.current = spaceConfigRef.current.configValue['scale.z'];
    }
  }, [spaceConfigRef]);

  const defaultPositionX = MathUtils.randFloatSpread(100);
  const defaultPositionY = MathUtils.randFloatSpread(100);
  const defaultPositionZ = MathUtils.randFloatSpread(100);

  const resetStarPosition = () => {
    if (starRef.current && starRef.current.position.z > 50) {
      starRef.current.position.z = -50;
    }
  };

  useFrame(() => {
    if (starRef.current && spaceConfigRef.current) {
      if (spaceConfigRef.current.mode === 'idle') {
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

      if (spaceConfigRef.current.mode === 'start') {
        starRef.current.scale.z += spaceConfigRef.current.configValue['scale.z'];
        starRef.current.position.z += 0;

        setTimeout(() => {
          if (starRef.current && spaceConfigRef.current) {
            starRef.current.position.z +=
              spaceConfigRef.current.configValue['position.z'];
          }
        }, 1000);
      } else if (spaceConfigRef.current.mode === 'cleaning') {
        while (zDiffPosRef.current > 0.1) {
          starRef.current.position.z += zDiffPosRef.current;
          zDiffPosRef.current -= 0.1;
        }

        while (zDiffScaleRef.current > 0) {
          starRef.current.scale.z += zDiffScaleRef.current;
          zDiffScaleRef.current -= 0.01;
        }
      } else if (spaceConfigRef.current.mode === 'stop') {
        starRef.current.position.z += 0;
      }
    }
  });

  const randomColorHex = getStarRandomHexColor();

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
