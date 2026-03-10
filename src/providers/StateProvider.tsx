'use client';

import React, { createContext, ReactNode, useContext, useMemo, useReducer } from 'react';

import { initialState, store } from '@/stores';
import { TRootActions, TRootState } from '@/types/reducer-context';

const StateContext = createContext<
  { state: TRootState; dispatch: React.Dispatch<TRootActions> } | undefined
>(undefined);

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(store, initialState);
  const contextValue = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <StateContext.Provider value={contextValue}>{children}</StateContext.Provider>;
};

export const useStateContext = () => {
  const context = useContext(StateContext);

  if (context === undefined) {
    throw new Error('useStateContext must be used within a StateProvider');
  }

  return context;
};
