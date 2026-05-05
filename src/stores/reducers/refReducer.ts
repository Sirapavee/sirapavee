import { RefObject } from 'react';

import { INITIAL_DATA } from '../initialData';

import { TRootActions } from '@/types/reducer-context';
import { ConfigProps } from '@/types/scene';

export const REF_ACTION = {
  SET_SPACE_CONFIG_REF: 'set_space_config_ref',
  SET_THEME_REF: 'set_theme_ref',
} as const;

export type RefState = {
  spaceConfigRef: RefObject<ConfigProps | null>;
  themeRef: RefObject<string | null>;
};

export const refInitialState: RefState = {
  spaceConfigRef: {
    current: INITIAL_DATA.space as ConfigProps,
  },
  themeRef: {
    current: INITIAL_DATA.theme,
  },
};

export const refReducer = (state = refInitialState, action: TRootActions): RefState => {
  switch (action.type) {
    case REF_ACTION.SET_SPACE_CONFIG_REF:
      return { ...state, spaceConfigRef: action.payload };
    case REF_ACTION.SET_THEME_REF:
      return { ...state, themeRef: action.payload };
    default:
      return state;
  }
};
