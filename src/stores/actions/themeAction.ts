import { THEME_ACTION } from '../reducers/themeReducer';

const setThemeAction = (theme: string) => ({
  type: THEME_ACTION.SET_THEME,
  payload: theme,
});

export const themeAction = { setThemeAction };
