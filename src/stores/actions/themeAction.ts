import { THEME_ACTION } from '../reducers/themeReducer';

const getThemeAction = () => ({
  type: THEME_ACTION.GET_THEME,
});

const setThemeAction = (theme: string) => ({
  type: THEME_ACTION.SET_THEME,
  payload: theme,
});

export const themeAction = { getThemeAction, setThemeAction };
