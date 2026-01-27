import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useState } from 'react';

export type SlippageSelection = 'low' | 'medium' | 'high' | 'custom';

export type GlobalStoreShape = {
  banner: boolean;
  maxSlippage: string;
  setMaxSlippage: Dispatch<SetStateAction<string>>;
  slippageSelection: SlippageSelection;
  setSlippageSelection: Dispatch<SetStateAction<SlippageSelection>>;
  deadlineBlocks: number;
  setDeadlineBlocks: Dispatch<SetStateAction<number>>;
};

const GlobalContext = createContext<GlobalStoreShape>({
  banner: true,
  maxSlippage: '5',
  setMaxSlippage: () => {},
  slippageSelection: 'medium',
  setSlippageSelection: () => {},
  deadlineBlocks: 3,
  setDeadlineBlocks: () => {},
});

export function GlobalStore(props: { children: ReactNode }) {
  const [maxSlippage, setMaxSlippage] = useState('5');
  const [slippageSelection, setSlippageSelection] = useState<SlippageSelection>('medium');
  const [deadlineBlocks, setDeadlineBlocks] = useState(3);

  return (
    <GlobalContext.Provider
      value={{
        banner: true,
        maxSlippage,
        setMaxSlippage,
        slippageSelection,
        setSlippageSelection,
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


