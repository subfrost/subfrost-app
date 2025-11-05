import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useState } from 'react';

export type GlobalStoreShape = {
  banner: boolean;
  maxSlippage: string;
  setMaxSlippage: Dispatch<SetStateAction<string>>;
  deadlineBlocks: number;
  setDeadlineBlocks: Dispatch<SetStateAction<number>>;
};

const GlobalContext = createContext<GlobalStoreShape>({
  banner: true,
  maxSlippage: '0.5',
  setMaxSlippage: () => {},
  deadlineBlocks: 3,
  setDeadlineBlocks: () => {},
});

export function GlobalStore(props: { children: ReactNode }) {
  const [maxSlippage, setMaxSlippage] = useState('0.5');
  const [deadlineBlocks, setDeadlineBlocks] = useState(3);

  return (
    <GlobalContext.Provider
      value={{
        banner: true,
        maxSlippage,
        setMaxSlippage,
        deadlineBlocks,
        setDeadlineBlocks,
      }}
    >
      {props.children}
    </GlobalContext.Provider>
  );
}

export function useGlobalStore() {
  return useContext(GlobalContext);
}


