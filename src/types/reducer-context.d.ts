import { Reducer } from 'react';

import { initialState, rootActions } from '@/stores';

type ActionsMap<A> = {
  [K in keyof A]: A[K] extends Record<keyof A[K], (...arg: never[]) => infer R>
    ? R
    : never;
}[keyof A];

export type TRootState = typeof initialState;

export type TRootActions = ActionsMap<typeof rootActions>;

export type TRootReducer<S = TRootState, A = TRootActions> = Reducer<S, A>;
