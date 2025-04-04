"use client";

import { createContext, useContext, ReactNode, useState } from "react";

// Utility function to format balances
export const formatBalance = (balance: string, token: string, decimals?: number) => {
  // Format dxFROST and frost to 4 decimals, others to 8 decimals
  const decimalPlaces = (token === 'dxFROST' || token === 'frost') ? 4 : (decimals || 8);
  
  // Parse the balance as a float and format it with the specified number of decimal places
  const value = parseFloat(balance);
  if (isNaN(value)) return '0.' + '0'.repeat(decimalPlaces);
  
  return value.toFixed(decimalPlaces);
};

interface Balances {
  btc: string;
  frBTC: string;
  dxFROST: string;
  frBTCFROST: string;
  frost: string;
}

const defaultBalances: Balances = {
  btc: "0.00000000",
  frBTC: "0.00000000",
  dxFROST: "0.00000000",
  frost: "0.00000000",
  frBTCFROST: "0.00000000"
};

interface BalancesContextType {
  balances: Balances;
  setBalances: (balances: Balances) => void;
}

const BalancesContext = createContext<BalancesContextType | undefined>(
  undefined,
);

export function BalancesProvider({ children }: { children: ReactNode }) {
  const [balances, setBalances] = useState<Balances>(defaultBalances);

  return (
    <BalancesContext.Provider value={{ balances, setBalances }}>
      {children}
    </BalancesContext.Provider>
  );
}

export function useBalances() {
  const context = useContext(BalancesContext);
  if (context === undefined) {
    throw new Error("useBalances must be used within a BalancesProvider");
  }
  
  // Add formatted balances to the context
  const formattedBalances = {
    btc: formatBalance(context.balances.btc, 'btc'),
    frBTC: formatBalance(context.balances.frBTC, 'frBTC'),
    dxFROST: formatBalance(context.balances.dxFROST, 'dxFROST'),
    frost: formatBalance(context.balances.frost, 'frost'),
    frBTCFROST: formatBalance(context.balances.frBTCFROST, 'frBTCFROST'),
  };
  
  return {
    ...context,
    formattedBalances
  };
}
