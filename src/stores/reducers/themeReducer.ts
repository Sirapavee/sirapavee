import { TRootActions } from '@/types/reducer-context';

export const THEME_ACTION = {
  GET_THEME: 'get_theme',
  SET_THEME: 'set_theme',
} as const;

export type ThemeState = {
  theme: string;
};

export const themeInitialState: ThemeState = {
  theme: 'dark',
};

export const themeReducer = (
  state = themeInitialState,
  action: TRootActions,
): ThemeState => {
  switch (action.type) {
    case THEME_ACTION.GET_THEME:
      return state;
    case THEME_ACTION.SET_THEME:
      return { ...state, theme: action.payload };
    default:
      return state;
  }
};
