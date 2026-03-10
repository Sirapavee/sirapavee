'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import {
  Instance,
  Instances,
  OrbitControls,
  Plane,
  Torus,
  useHelper,
  useProgress,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReactiveGetCookie } from 'cookies-next';
import { useControls } from 'leva';
import {
  Color,
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
      position={[-6, 7, 7]}
      fov={100}
      near={0.1}
      far={500}
    />
  );
};

const Light = () => {
  const lightRef = useRef<PointLight>(null!);
  useHelper(lightRef, PointLightHelper, 0.5, 'hotpink');

  return <pointLight ref={lightRef} intensity={100} color='white' position={[2, 1, 3]} />;
};

const Object = () => {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<PointsMaterial>(null);
  const planeMaterialRef = useRef<PointsMaterial>(null);

  console.log(window.innerWidth);

  useFrame(() => {
    if (meshRef.current && materialRef.current && planeMaterialRef.current) {
      if (meshRef.current.scale.z > 10) {
        meshRef.current.scale.x = 10;
        meshRef.current.scale.y = 10;
        meshRef.current.scale.z = 10;

        // materialRef.current.color.set('cyan');
        materialRef.current.transparent = true;
        materialRef.current.opacity -= 0.03;

        planeMaterialRef.current.transparent = true;
        planeMaterialRef.current.opacity -= 0.02;
      } else {
        meshRef.current.scale.x += 0.05;
        meshRef.current.scale.y += 0.05;
        meshRef.current.scale.z += 0.05;
      }
    }
  });

  console.log(new Color('#16161a'));

  return (
    <group>
      <Plane args={[100, 100]}>
        <pointsMaterial
          ref={planeMaterialRef}
          attach='material'
          color={new Color().setHex(0x16161a)}
          transparent
          opacity={1}
        />
      </Plane>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <circleGeometry args={[1, 256]} />
        <pointsMaterial ref={materialRef} color='white' transparent opacity={1} />
      </mesh>
    </group>
  );
};

type ShatterSceneProps = {
  ref?: React.Ref<HTMLDivElement>;
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
        {/* <Light /> */}
        <Object />
        <Camera />
      </Canvas>
    </div>
  );
};
