import { RefObject } from 'react';

import { REF_ACTION } from '../reducers/refReducer';

import { ConfigProps } from '@/types/scene';

const setspaceConfigRef = (spaceConfigRef: RefObject<ConfigProps | null>) => ({
  type: REF_ACTION.SET_SPACE_CONFIG_REF,
  payload: spaceConfigRef,
});

const setThemeRef = (themeRef: RefObject<string | null>) => ({
  type: REF_ACTION.SET_THEME_REF,
  payload: themeRef,
});

export const refAction = { setspaceConfigRef, setThemeRef };
