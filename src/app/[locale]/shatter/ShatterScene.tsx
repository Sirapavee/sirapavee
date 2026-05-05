'use client';

import { FC, Ref, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Instance,
  Instances,
  OrbitControls,
  Plane,
  Sphere,
  Torus,
  useHelper,
  useProgress,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReactiveGetCookie } from 'cookies-next';
import { useControls } from 'leva';
import {
  Color,
  DirectionalLight,
  DirectionalLightHelper,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  PointLightHelper,
  PointsMaterial,
  Scene,
  SphereGeometry,
} from 'three';

import { themeBgReverse, themeSubHeader } from '@/const/tailwindClass';
import { ConfigProps } from '@/types/scene';
import { cn } from '@/utils/className';

const Camera = () => {
  const perspectiveCameraRef = useRef<PerspectiveCamera>(null!);
  // useHelper(perspectiveCameraRef, CameraHelper);

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

const Light = () => {
  const lightRef = useRef<DirectionalLight>(null!);
  useHelper(lightRef, DirectionalLightHelper, 0.5, 'hotpink');

  return (
    <directionalLight ref={lightRef} intensity={100} color='white' position={[0, 0, 0]} />
  );
};

const Object = () => {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<PointsMaterial>(null);
  // const planeMaterialRef = useRef<PointsMaterial>(null);

  const starModeRef = useRef<'idle' | 'start' | 'enlarge' | 'supernova' | 'complete'>(
    'idle',
  );

  useFrame(() => {
    if (meshRef.current && materialRef.current) {
      if (materialRef.current.opacity < 1) {
        materialRef.current.opacity += 0.1;
      } else if (materialRef.current.opacity >= 1 && starModeRef.current === 'idle') {
        starModeRef.current = 'start';
      }

      if (
        materialRef.current.opacity > 1 &&
        meshRef.current.scale.z >= 0 &&
        starModeRef.current === 'enlarge'
      ) {
        meshRef.current.scale.x -= 0.5;
        meshRef.current.scale.y -= 0.5;
        meshRef.current.scale.z -= 0.5;
      } else if (
        materialRef.current.opacity > 1 &&
        meshRef.current.scale.z <= 0 &&
        starModeRef.current === 'enlarge'
      ) {
        starModeRef.current = 'supernova';
      }

      if (meshRef.current.scale.z < 3 && starModeRef.current === 'start') {
        meshRef.current.scale.x += 0.01;
        meshRef.current.scale.y += 0.01;
        meshRef.current.scale.z += 0.01;

        // starModeRef.current = 'enlarge';
      } else if (meshRef.current.scale.z >= 3 && starModeRef.current === 'start') {
        starModeRef.current = 'enlarge';
      }

      if (starModeRef.current === 'supernova' && meshRef.current.scale.z !== 0) {
        meshRef.current.scale.set(0, 0, 0);
      } else if (starModeRef.current === 'supernova' && meshRef.current.scale.z === 0) {
        starModeRef.current = 'complete';
      }

      if (starModeRef.current === 'complete') {
        setTimeout(() => {
          if (meshRef.current) {
            meshRef.current.scale.x += 0.5;
            meshRef.current.scale.y += 0.5;
            meshRef.current.scale.z += 0.5;
          }
        }, 1000);

        // materialRef.current.color.set('cyan');
        // materialRef.current.transparent = true;
        // materialRef.current.opacity -= 0.03;
        // planeMaterialRef.current.transparent = true;
        // planeMaterialRef.current.opacity -= 0.02;
      }
    }

    // console.log({
    //   mode: starModeRef.current,
    //   opacity: materialRef.current?.opacity,
    //   scale: meshRef.current?.scale,
    // });
  });

  return (
    <group>
      <Circle ref={meshRef} args={[1, 64, 64]}>
        <pointsMaterial ref={materialRef} color='white' transparent opacity={0} />
      </Circle>
    </group>
  );
};

type ShatterSceneProps = {
  ref?: Ref<HTMLDivElement>;
};

export const ShatterScene: FC<ShatterSceneProps> = ({ ref }) => {
  const scene = useMemo(() => new Scene(), []);

  const [configProps, setConfigProps] = useState<ConfigProps>({
    configValue: {
      ['position.z']: 0,
      ['scale.z']: 0,
    },
    mode: 'idle',
  });

  const [isFinishJump, setIsFinishJump] = useState<boolean>(false);

  return (
    <div className='flex h-dvh w-dvw' ref={ref}>
      <div className='absolute top-1/2 right-5 z-999 flex flex-col gap-4'>
        <button
          className={cn(
            themeBgReverse,
            themeSubHeader,
            'rounded-md px-3 py-1 text-sm font-semibold hover:cursor-pointer',
          )}
          onMouseOver={() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'start',
            });
          }}
          onMouseLeave={() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'cleaning',
            });

            setTimeout(() => {
              setIsFinishJump(true);
            }, 800);

            // setTimeout(() => {
            //   setConfigProps({
            //     configValue: {
            //       ['position.z']: 1,
            //       ['scale.z']: 0.5,
            //     },
            //     mode: 'stop',
            //   });
            // }, 2000);
          }}
          onTouchStart={() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'start',
            });
          }}
          onTouchEnd={() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'cleaning',
            });
          }}
        >
          Hola
        </button>
        <button
          className={cn(
            themeBgReverse,
            themeSubHeader,
            'rounded-md px-3 py-1 text-sm font-semibold hover:cursor-pointer',
          )}
          onClick={() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'idle',
            });

            setIsFinishJump(false);
          }}
        >
          IDLE
        </button>
        <button
          className={cn(
            themeBgReverse,
            themeSubHeader,
            'rounded-md px-3 py-1 text-sm font-semibold hover:cursor-pointer',
          )}
          onClick={() => {
            setConfigProps({
              configValue: {
                ['position.z']: 1,
                ['scale.z']: 0.5,
              },
              mode: 'stop',
            });

            setIsFinishJump(false);
          }}
        >
          STOP
        </button>
      </div>
      <Canvas
        className='bg-light-blue-100 dark:bg-dark-black-200'
        shadows
        fallback={<div>Sorry no WebGL supported!</div>}
        scene={scene}
      >
        <Light />
        <Object />
        <Camera />
      </Canvas>
    </div>
  );
};
