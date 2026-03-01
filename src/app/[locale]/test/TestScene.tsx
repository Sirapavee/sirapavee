'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Instance, Instances, OrbitControls, Torus, useHelper } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReactiveGetCookie } from 'cookies-next';
import { useControls } from 'leva';
import {
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  PointLight,
  PointLightHelper,
  PointsMaterial,
  Scene,
  SphereGeometry,
} from 'three';

import { themeBgReverse, themeSubHeader } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

type PlanetProps = {
  configProps: ConfigProps;
};
const Planet: FC<PlanetProps> = ({ configProps }) => {
  const planetRef = useRef<Mesh>(null);
  const planetBodyRef = useRef<SphereGeometry>(null);
  const scaleRef = useRef<number>(0);

  const groupRef = useRef<Group>(null);

  const {
    color,
    radius,
    widthSegments,
    heightSegments,
    x,
    y,
    z,
    rotationX,
    rotationY,
    rotationZ,
  } = useControls('Planet', {
    color: '#00ffff',
    radius: { value: 2, min: 0.5, max: 3, step: 0.1 },
    widthSegments: { value: 128, step: 1 },
    heightSegments: { value: 128, step: 1 },
    x: { value: -1.0, step: 0.1 },
    y: { value: 0.0, step: 0.1 },
    z: { value: -2, step: 0.1 },
    rotationX: { value: -1.6, step: 0.1 },
    rotationY: { value: 1.3, step: 0.1 },
    rotationZ: { value: 0, step: 0.1 },
  });

  const {
    childRadius,
    childWidthSegments,
    childHeightSegments,
    childX,
    childY,
    childZ,
    childRotationX,
    childRotationY,
    childRotationZ,
  } = useControls('Child Planet', {
    childRadius: { value: 0.5, min: 0.5, max: 3, step: 0.1 },
    childWidthSegments: { value: 128, step: 1 },
    childHeightSegments: { value: 128, step: 1 },
    childX: { value: 7, step: 0.1 },
    childY: { value: 0.0, step: 0.1 },
    childZ: { value: -2, step: 0.1 },
    childRotationX: { value: -1.6, step: 0.1 },
    childRotationY: { value: 1.3, step: 0.1 },
    childRotationZ: { value: 0, step: 0.1 },
  });

  useFrame(() => {
    if (planetRef.current) {
      // console.log({
      //   teritory: planetRef.current.geometry.boundingSphere?.intersectsSphere(
      //     planetBodyRef.current!.boundingSphere!,
      //   ),
      // });

      if (configProps.mode === 'start') {
        // if (planetRef.current.position.y > -5) {
        //   planetRef.current.position.y -= 0.1;
        // }

        if (planetRef.current.position.z < 7) {
          planetRef.current.position.z += 0.1;
        }

        // setTimeout(() => {
        //   if (planetRef.current!.position.x > -6) {
        //     planetRef.current!.position.x -= 0.05;
        //   }
        // }, 200);
      } else if (configProps.mode === 'idle') {
        planetRef.current.position.x = x;
        planetRef.current.position.y = y;
        planetRef.current.position.z = z;
      } else if (configProps.mode === 'cleaning') {
        // planetRef.current.scale.set(1, 1, 1);

        // if (planetRef.current.position.z < 2) {
        //   planetRef.current.position.z += 0.01;
        // }

        if (scaleRef.current <= 1) {
          scaleRef.current += 0.05;

          planetRef.current.scale.set(
            scaleRef.current,
            scaleRef.current,
            scaleRef.current,
          );
        }

        // groupRef.current!.rotation.y += 0.005;
        groupRef.current!.rotation.z += 0.005;
      }
    }
  });

  return (
    <>
      <mesh
        ref={planetRef}
        position={[x, y, z]}
        scale={[0, 0, 0]}
        rotation={[rotationX, rotationY, rotationZ]}
      >
        <sphereGeometry
          ref={planetBodyRef}
          args={[radius, widthSegments, heightSegments]}
        />
        <pointsMaterial color={color} />
        <Torus args={[4, 0.5, 2, 256, 16]} />

        <group ref={groupRef}>
          <mesh position={[childX, childY, childZ]}>
            <sphereGeometry
              args={[childRadius, childWidthSegments, childHeightSegments]}
            />
            <pointsMaterial color='green' />
          </mesh>
        </group>
      </mesh>
      {/* <axesHelper args={[15]} />
        {!!planetRef?.current && <boxHelper args={[planetRef.current, 'red']} />} */}
    </>
  );
};

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
const Star: FC<StarProps> = ({ configProps, idx }) => {
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

type SpaceProps = {
  configProps: ConfigProps;
};
const Space: FC<SpaceProps> = ({ configProps }) => {
  const [themedColor, setThemeColor] = useState<string>('white');

  const getCookie = useReactiveGetCookie();
  const theme = getCookie('theme');

  useEffect(() => {
    setThemeColor(theme === 'dark' ? 'white' : 'black');
  }, [theme]);

  return (
    <>
      <Instances
        limit={1000}
        // range={1000}
        geometry={new SphereGeometry(0.1, 16, 16)}
        material={new PointsMaterial({ color: themedColor })}
      >
        {Array.from(
          {
            length: 1000,
          },
          (_, i) => (
            <Star key={i} configProps={configProps} idx={i} />
          ),
        )}
      </Instances>
    </>
  );
};

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

export const TestScene = () => {
  const scene = useMemo(() => new Scene(), []);

  const [configProps, setConfigProps] = useState<ConfigProps>({
    configValue: {
      ['position.z']: 0,
      ['scale.z']: 0,
    },
    mode: 'idle',
  });

  const [isFinsihJump, setIsFinishJump] = useState<boolean>(false);

  return (
    <div className='flex h-dvh w-dvw'>
      <div className='absolute top-1/2 right-1/2 z-999 flex flex-col gap-4'>
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
        <Space configProps={configProps} />
        {isFinsihJump && <Planet configProps={configProps} />}

        {/* <Light /> */}
        <Camera />
        <OrbitControls />
      </Canvas>
    </div>
  );
};
