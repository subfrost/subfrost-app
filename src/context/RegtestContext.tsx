"use client";

import React from 'react';
import * as regtest from '@/context/regtest';

// Type for the context value
export type RegtestContextType = {
  regtest: typeof regtest;
};

// Create context with undefined default to enforce Provider usage
export const RegtestContext = React.createContext<RegtestContextType | undefined>(undefined);

export const RegtestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Expose regtest module on window for debugging/testing
  if (typeof window !== 'undefined') {
    (window as any).regtest = regtest;
  }

  return (
    <RegtestContext.Provider value={{ regtest }}>
      {children}
    </RegtestContext.Provider>
  );
};

// Custom hook for consuming regtest context
export const useRegtest = () => {
  const context = React.useContext(RegtestContext);
  if (context === undefined) {
    throw new Error('useRegtest must be used within a RegtestProvider');
  }
  return context.regtest;
};
