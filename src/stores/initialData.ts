import { ConfigProps } from '@/types/scene';

export const INITIAL_DATA = {
  space: {
    configValue: {
      ['position.z']: 1,
      ['scale.z']: 0.5,
    },
    mode: 'idle',
  } as ConfigProps,
  theme: 'light',
};
