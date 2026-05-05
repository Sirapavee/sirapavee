import { refAction } from './actions/refAction';
import { themeAction } from './actions/themeAction';
import { refInitialState, refReducer } from './reducers/refReducer';
import { themeInitialState, themeReducer } from './reducers/themeReducer';

import { TRootReducer, TRootState } from '@/types/reducer-context';

const combineReducers =
  <S = TRootState>(reducers: {
    [K in keyof S]: TRootReducer<S[K]>;
  }): TRootReducer<S> =>
  (state, action) =>
    (Object.keys(reducers) as Array<keyof S>).reduce(
      (prevState, key) => ({
        ...prevState,
        [key]: reducers[key](prevState[key], action),
      }),
      state,
    );

export const initialState = {
  ref: refInitialState,
  theme: themeInitialState,
};

export const rootActions = {
  ref: refAction,
  theme: themeAction,
};

export const store = combineReducers({
  ref: refReducer,
  theme: themeReducer,
});
