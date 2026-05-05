import { useRef } from 'react';
import { Circle } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Mesh, PointsMaterial } from 'three';

export const TransitionScene = () => {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<PointsMaterial>(null);

  const starModeRef = useRef<'idle' | 'start' | 'enlarge' | 'supernova' | 'complete'>(
    'idle',
  );

  useFrame(() => {
    if (meshRef.current && materialRef.current) {
      if (materialRef.current.opacity < 1 && starModeRef.current === 'idle') {
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

            setTimeout(() => {
              if (materialRef.current) {
                materialRef.current.opacity -= 0.03;
              }
            }, 650);
          }
        }, 600);

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
      <Circle ref={meshRef} args={[1, 64, 64]} scale={[0.1, 0.1, 0.1]}>
        <pointsMaterial ref={materialRef} color='white' transparent opacity={0} />
      </Circle>
    </group>
  );
};
