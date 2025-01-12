"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { provider } from "./regtest";

interface BlockchainState {
  height: number;
  feeRate: number;
  loading: boolean;
}

const defaultState: BlockchainState = {
  height: 0, 
  feeRate: 1,
  loading: true
};

interface BlockchainContextType {
  height: number;
  feeRate: number;
  loading: boolean;
}

const BlockchainContext = createContext<BlockchainContextType | undefined>(undefined);

export function BlockchainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BlockchainState>(defaultState);

  useEffect(() => {
    let mounted = true;

    const updateBlockchainState = async () => {
      try {
        const height = await provider.getHeight();
        const feeRate = await provider.estimateFee();
        
        if (mounted) {
          setState({
            height,
            feeRate,
            loading: false
          });
        }
      } catch (error) {
        console.error("Failed to update blockchain state:", error);
        if (mounted) {
          setState(prev => ({ ...prev, loading: false }));
        }
      }
    };

    // Initial update
    updateBlockchainState();

    // Poll every 30 seconds
    const interval = setInterval(updateBlockchainState, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <BlockchainContext.Provider value={state}>
      {children}
    </BlockchainContext.Provider>
  );
}

export function useBlockchain() {
  const context = useContext(BlockchainContext);
  if (context === undefined) {
    throw new Error("useBlockchain must be used within a BlockchainProvider");
  }
  return context;
}
