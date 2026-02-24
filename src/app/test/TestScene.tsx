'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Html, Instance, Instances, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useReactiveGetCookie } from 'cookies-next';
import {
  MathUtils,
  Mesh,
  PerspectiveCamera,
  PointsMaterial,
  Scene,
  SphereGeometry,
} from 'three';

import { themeBgReverse, themeSubHeader } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

// const Box = () => {
//   const meshRef = useRef<Mesh>(null);
//   const lightRef = useRef<PointLight>(null!);

//   const { color, width, height, depth } = useControls('Box', {
//     color: '#00ffff',
//     width: { value: 1, min: 0.5, max: 3, step: 0.1 },
//     height: { value: 1, min: 0.5, max: 3, step: 0.1 },
//     depth: { value: 1, min: 0.5, max: 3, step: 0.1 },
//   });

//   // const boxLengthRef = useRef<number>(1);

//   useFrame(() => {
//     if (meshRef.current) {
//       meshRef.current.rotation.x += 0.01;
//       meshRef.current.rotation.y += 0.01;

//       meshRef.current.position.x = Math.sin(meshRef.current.rotation.y) * 2;
//       // meshRef.current.scale.x += 0.01;

//       // if (boxLengthRef.current <= 3) {
//       //   boxLengthRef.current += 0.01;
//       //   meshRef.current.scale.x += 0.01;
//       // } else if (boxLengthRef.current > 10) {
//       //   boxLengthRef.current -= 0.01;
//       //   meshRef.current.scale.x -= 0.01;
//       // }
//     }
//   });

//   useHelper(lightRef, PointLightHelper, 0.5, 'hotpink');

//   return (
//     <>
//       <mesh ref={meshRef} position={[0, 1, 0]}>
//         <boxGeometry args={[width, height, depth]} />
//         <meshStandardMaterial color={color} />
//       </mesh>

//       <ambientLight intensity={0.5} />
//       <pointLight ref={lightRef} intensity={100} color='white' position={[2, 1, 3]} />
//     </>
//   );
// };

type ConfigProps = {
  configValue: {
    [key: string]: number;
  };
  mode: 'start' | 'cleaning' | 'stop';
};

type StarProps = {
  configProps: ConfigProps;
};
const Star: FC<StarProps> = ({ configProps }) => {
  const starRef = useRef<Mesh>(null);

  const defaultPositionZ = MathUtils.randFloatSpread(100);

  const resetStarPosition = () => {
    if (starRef.current && starRef.current.position.z > 50) {
      starRef.current.position.z = -50;
    }
  };

  useFrame(() => {
    if (starRef.current) {
      starRef.current.position.z += 0.1;

      // starRef.current.scale.z += 0.1;
      // starRef.current.position.z += 1;

      if (starRef.current.position.z > 25) {
        starRef.current.scale.set(0, 0, 0);
      }

      if (starRef.current.position.z > 45) {
        starRef.current.scale.x += 0.5;
        starRef.current.scale.y += 0.5;
        starRef.current.scale.z += 0.5;
      }

      // if (starRef.current.position.z > 50) {
      //   starRef.current.position.z = -50;
      // }

      if (starRef.current.scale.x === 1) {
        starRef.current.scale.set(1, 1, 1);
      }

      if (configProps.mode === 'start') {
        Object.entries(configProps.configValue).forEach(([key, value]) => {
          if (starRef.current) {
            if (key === 'position.z') {
              // starRef.current.position.z -= 0.4;

              setTimeout(() => {
                starRef.current!.position.z += value;
              }, 1000);
            } else if (key === 'scale.z') {
              starRef.current.scale.z += value;
            }
          }
        });

        resetStarPosition();
      } else if (configProps.mode === 'cleaning') {
        starRef.current.position.z = defaultPositionZ;
        starRef.current.scale.set(0, 0, 0);

        resetStarPosition();

        // starRef.current.visible = false;
      } else if (configProps.mode === 'stop') {
        // starRef.current.position.z += 0.1;
        // starRef.current.scale.set(1, 1, 1);

        // starRef.current.visible = true;
        resetStarPosition();
      }
    }
  });

  return (
    <group>
      <Instance
        ref={starRef}
        position={[
          MathUtils.randFloatSpread(100),
          MathUtils.randFloatSpread(100),
          defaultPositionZ,
        ]}
      />
    </group>
  );
};

const Galaxy = () => {
  const [themedColor, setThemeColor] = useState<string>('white');

  const [configProps, setConfigProps] = useState<ConfigProps>({
    configValue: {
      ['position.z']: 0,
      ['scale.z']: 0,
    },
    mode: 'stop',
  });

  const getCookie = useReactiveGetCookie();
  const theme = getCookie('theme');

  useEffect(() => {
    setThemeColor(theme === 'dark' ? 'white' : 'black');
  }, [theme]);

  return (
    <>
      <Html>
        <button
          className={cn(
            themeBgReverse,
            themeSubHeader,
            'absolute rounded-md px-3 py-1 text-sm font-semibold hover:cursor-pointer',
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
                ['position.z']: 0,
                ['scale.z']: 0,
              },
              mode: 'cleaning',
            });

            setTimeout(() => {
              setConfigProps({
                configValue: {
                  ['position.z']: 0,
                  ['scale.z']: 0,
                },
                mode: 'stop',
              });
            }, 500);
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
                ['position.z']: 0,
                ['scale.z']: 0,
              },
              mode: 'cleaning',
            });

            setTimeout(() => {
              setConfigProps({
                configValue: {
                  ['position.z']: 0,
                  ['scale.z']: 0,
                },
                mode: 'stop',
              });
            }, 500);
          }}
        >
          Hola
        </button>
      </Html>
      <Instances
        limit={1000}
        // range={1000}
        geometry={new SphereGeometry(0.2, 16, 16)}
        material={new PointsMaterial({ color: themedColor })}
      >
        {Array.from(
          {
            length: 1000,
          },
          (_, i) => (
            <Star key={i} configProps={configProps} />
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

export const TestScene = () => {
  const scene = useMemo(() => new Scene(), []);

  return (
    <div className='flex h-dvh w-dvw'>
      <Canvas
        className='bg-light-blue-100 dark:bg-dark-black-200'
        shadows
        fallback={<div>Sorry no WebGL supported!</div>}
        scene={scene}
      >
        {/* <Float speed={1} rotationIntensity={1} floatIntensity={2}>
          <Box />
        </Float> */}

        <Galaxy />

        <Camera />
        <OrbitControls />
      </Canvas>
    </div>
  );
};
