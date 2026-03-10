'use client';

import { FC } from 'react';
import { Instances } from '@react-three/drei';
import { PointsMaterial, SphereGeometry } from 'three';

import { Star } from './Star';

import { ConfigProps } from '@/types/scene';

type SpaceProps = {
  configProps: ConfigProps;
};

export const Space: FC<SpaceProps> = ({ configProps }) => {
  return (
    <>
      <Instances
        limit={1000}
        // range={1000}
        geometry={new SphereGeometry(0.1, 16, 16)}
        material={new PointsMaterial({ color: 'white' })}
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
