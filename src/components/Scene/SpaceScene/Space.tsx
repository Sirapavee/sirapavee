'use client';

import { useMemo, useRef } from 'react';
import { Instances } from '@react-three/drei';
import { InstancedMesh, PointsMaterial, SphereGeometry } from 'three';

import { Star } from './Star';

const INSTANCE_LIMIT = 1000;

// hoist these outside — they never change
const sphereGeo = new SphereGeometry(0.1, 16, 16);
const defaultMat = new PointsMaterial({ color: 'white' });

export const Space = () => {
  const instancesRef = useRef<InstancedMesh>(null);

  // build the array once, not on every render
  const stars = useMemo(
    () => Array.from({ length: INSTANCE_LIMIT }, (_, i) => <Star key={i} />),
    [],
  );

  return (
    <Instances
      ref={instancesRef}
      limit={INSTANCE_LIMIT}
      geometry={sphereGeo}
      material={defaultMat}
    >
      {stars}
    </Instances>
  );
};
