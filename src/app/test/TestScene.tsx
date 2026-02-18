'use client';

import { useMemo, useRef } from 'react';
import {
  ContactShadows,
  Float,
  OrbitControls,
  Plane,
  useHelper,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { Mesh, PointLight, PointLightHelper, Scene } from 'three';

const Box = () => {
  const meshRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);

  const { color, width, height, depth } = useControls('Box', {
    color: '#00ffff',
    width: { value: 1, min: 0.5, max: 3, step: 0.1 },
    height: { value: 1, min: 0.5, max: 3, step: 0.1 },
    depth: { value: 1, min: 0.5, max: 3, step: 0.1 },
  });

  const boxLengthRef = useRef<number>(1);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
      // meshRef.current.scale.x += 0.01;

      // if (boxLengthRef.current <= 3) {
      //   boxLengthRef.current += 0.01;
      //   meshRef.current.scale.x += 0.01;
      // } else if (boxLengthRef.current > 10) {
      //   boxLengthRef.current -= 0.01;
      //   meshRef.current.scale.x -= 0.01;
      // }
    }
  });

  useHelper(lightRef, PointLightHelper, 0.5, 'hotpink');

  return (
    <>
      <mesh ref={meshRef} position={[0, 1, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>

      <ambientLight intensity={0.5} />
      <pointLight ref={lightRef} intensity={100} color='white' position={[2, 1, 3]} />
    </>
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
        <Float speed={1} rotationIntensity={1} floatIntensity={2}>
          <Box />
        </Float>

        <ContactShadows position={[0, -1, 0]} opacity={1} scale={10} blur={1} far={10} />

        <Plane position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} args={[100, 100]} />
        {/* <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, 100]}>
          <sphereGeometry args={[1, 32, 32]} />
          <pointsMaterial color='hotpink' size={0.1} />
        </instancedMesh>
        <points position={[2, 0, 0]} name='point-star'>
          <sphereGeometry args={[1, 1, 1]} />
          <pointsMaterial color='hotpink' size={0.1} />
        </points> */}
        <perspectiveCamera position={[-6, 7, 7]} fov={100} near={0.1} far={1000} />
        <OrbitControls />
      </Canvas>
    </div>
  );
};
