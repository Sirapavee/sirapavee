import { useRef } from 'react';
import { Environment, MeshTransmissionMaterial, Torus } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { Mesh } from 'three';

export const TransmissionTorusScene = () => {
  const config = useControls('tranmission', {
    ior: {
      value: 1.5,
      min: 1,
      max: 20,
      step: 0.01,
    },
    thickness: {
      value: 0.5,
      min: 0,
      max: 2,
      step: 0.01,
    },
    chromaticAberration: {
      value: 20,
      min: 0,
      max: 20,
      step: 0.01,
    },
    transmission: {
      value: 1,
      min: 0,
      max: 1,
      step: 0.01,
    },
    roughness: {
      value: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
    backside: {
      value: true,
    },
  });

  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      // if (meshRef.current.scale.z > 10) {
      //   meshRef.current.scale.x = 10;
      //   meshRef.current.scale.y = 10;
      //   meshRef.current.scale.z = 10;
      // } else {
      //   meshRef.current.scale.x += 0.05;
      //   meshRef.current.scale.y += 0.05;
      //   meshRef.current.scale.z += 0.05;
      // }

      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.x += 0.01;
    }
  });

  return (
    <>
      <directionalLight position={[0, 0, 0]} intensity={3} />
      <Environment preset='city' />

      <group>
        <Torus ref={meshRef} args={[2, 0.5, 64, 80]} position={[0, 0, 0]}>
          <MeshTransmissionMaterial {...config} />
        </Torus>
      </group>
    </>
  );
};
