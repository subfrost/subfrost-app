"use client";

import { createContext, useContext, ReactNode, useState } from "react";

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
  return context;
}
