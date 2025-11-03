'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { useDebounce } from 'use-debounce';

import { useSwapPriceCalculation } from '@/app/hooks/useSwapPriceCalculation';
import { alkaneToAlks } from '@/app/utils/currencyConverters';
import type { Direction, Focus, Panel, SwapQuote } from './types';

interface State {
  panel: Panel;
  focus: Focus;
  direction: Direction;
  sellCurrency: string | null;
  buyCurrency: string | null;
  sellAmount: string;
  buyAmount: string;
  rawSellAmount: string;
  rawBuyAmount: string;
  sellError: string;
  buyError: string;
  quote: SwapQuote | null;
  sellDirty: boolean;
  buyDirty: boolean;
}

type Action =
  | { type: 'SET_PANEL'; panel: Panel }
  | { type: 'SET_FOCUS'; focus: Focus }
  | { type: 'SET_SELL_CURRENCY'; id: string }
  | { type: 'SET_BUY_CURRENCY'; id: string }
  | { type: 'SET_SELL_AMOUNT'; value: string }
  | { type: 'SET_BUY_AMOUNT'; value: string }
  | { type: 'PRICE_SUCCESS'; quote: SwapQuote }
  | { type: 'SELL_ERROR'; msg: string }
  | { type: 'BUY_ERROR'; msg: string }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'CLEAR_BUY' }
  | { type: 'CLEAR_SELL' }
  | { type: 'INVERT_CURRENCIES' }
  | { type: 'SET_DIRECTION'; dir: Direction };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INVERT_CURRENCIES':
      return {
        ...state,
        sellCurrency: state.buyCurrency,
        buyCurrency: state.sellCurrency,
        sellAmount: state.buyAmount,
        buyAmount: state.sellAmount,
        rawSellAmount: state.rawBuyAmount,
        rawBuyAmount: state.rawSellAmount,
        sellError: state.buyError,
        buyError: state.sellError,
        sellDirty: state.buyDirty,
        buyDirty: state.sellDirty,
        direction: state.direction === 'sell' ? 'buy' : 'sell',
      };
    case 'SET_PANEL':
      return { ...state, panel: action.panel };
    case 'SET_FOCUS':
      return { ...state, focus: action.focus };
    case 'SET_SELL_CURRENCY':
      return {
        ...state,
        sellCurrency: action.id,
        sellAmount: '',
        buyAmount: '',
        rawSellAmount: '0',
        rawBuyAmount: '0',
        sellError: '',
        buyError: '',
        quote: null,
        sellDirty: false,
        buyDirty: false,
        panel: state.buyCurrency ? 'config' : state.panel,
      };
    case 'SET_BUY_CURRENCY':
      return {
        ...state,
        buyCurrency: action.id,
        sellAmount: '',
        buyAmount: '',
        rawSellAmount: '0',
        rawBuyAmount: '0',
        sellError: '',
        buyError: '',
        quote: null,
        sellDirty: false,
        buyDirty: false,
        panel: state.sellCurrency ? 'config' : state.panel,
      };
    case 'SET_SELL_AMOUNT':
      return {
        ...state,
        sellAmount: action.value,
        rawSellAmount: alkaneToAlks(action.value),
        sellDirty: true,
        direction: 'sell',
      };
    case 'SET_BUY_AMOUNT':
      return {
        ...state,
        buyAmount: action.value,
        rawBuyAmount: alkaneToAlks(action.value),
        buyDirty: true,
        direction: 'buy',
      };
    case 'PRICE_SUCCESS': {
      if (action.quote.direction === 'sell' && !state.sellDirty) {
        return { ...state, quote: action.quote };
      }
      if (action.quote.direction === 'buy' && !state.buyDirty) {
        return { ...state, quote: action.quote };
      }
      return {
        ...state,
        quote: action.quote,
        rawSellAmount:
          action.quote.direction === 'buy' ? action.quote.sellAmount : state.rawSellAmount,
        rawBuyAmount:
          action.quote.direction === 'sell' ? action.quote.buyAmount : state.rawBuyAmount,
        sellAmount:
          action.quote.direction === 'buy' ? action.quote.displaySellAmount : state.sellAmount,
        buyAmount:
          action.quote.direction === 'sell' ? action.quote.displayBuyAmount : state.buyAmount,
        sellDirty: action.quote.direction === 'buy' ? false : state.sellDirty,
        buyDirty: action.quote.direction === 'sell' ? false : state.buyDirty,
      };
    }
    case 'SELL_ERROR':
      return { ...state, sellError: action.msg };
    case 'BUY_ERROR':
      return { ...state, buyError: action.msg };
    case 'CLEAR_ERRORS':
      return { ...state, sellError: '', buyError: '' };
    case 'CLEAR_BUY':
      return {
        ...state,
        buyCurrency: null,
        buyAmount: '',
        rawBuyAmount: '0',
        buyError: '',
        buyDirty: false,
      };
    case 'CLEAR_SELL':
      return {
        ...state,
        sellCurrency: null,
        sellAmount: '',
        rawSellAmount: '0',
        sellError: '',
        sellDirty: false,
      };
    default:
      return state;
  }
}

export function useSwapController(
  initialSellCurrency: string | null,
  validateAmount: (v: string, id: string) => { errorMessage: string },
  btcBalance: number | undefined,
  from: string | null,
  to: string | null,
  sellAmount: string | null,
  buyAmount: string | null,
  setFrom: (v: string) => void,
  setTo: (v: string) => void,
  setSellAmount: (v: string) => void,
  setBuyAmount: (v: string) => void,
  maxSlippage: string,
) {
  const [state, dispatch] = useReducer(reducer, {
    focus: 'buy',
    panel: 'buy',
    direction: 'sell',
    sellCurrency: from || initialSellCurrency,
    buyCurrency: to || null,
    sellAmount: sellAmount || '',
    buyAmount: sellAmount ? '' : buyAmount || '',
    rawSellAmount: '0',
    rawBuyAmount: '0',
    sellError: '',
    buyError: '',
    quote: null,
  } as State);

  const [debouncedSellAmount] = useDebounce(state.sellAmount, 300);
  const [debouncedBuyAmount] = useDebounce(state.buyAmount, 300);

  const direction: Direction = state.direction;

  const { data: quote, isPending: isPriceCalculating } = useSwapPriceCalculation(
    state.sellCurrency ?? '',
    state.buyCurrency ?? '',
    direction === 'sell' ? debouncedSellAmount : debouncedBuyAmount,
    direction,
    maxSlippage,
  );

  useEffect(() => {
    const currentAmount = direction === 'sell' ? debouncedSellAmount : debouncedBuyAmount;
    if (!quote || quote.direction !== direction || quote.inputAmount !== currentAmount) {
      return;
    }

    if (quote.error) {
      if (quote.error === 'POOL_NOT_FOUND' || quote.error === 'NO_ROUTE_FOUND') {
        dispatch({ type: 'SELL_ERROR', msg: 'No trading pair available for these tokens. Try selecting different tokens.' });
        dispatch({ type: 'SET_PANEL', panel: state.focus });
      } else {
        dispatch({ type: 'SELL_ERROR', msg: quote.error });
      }
    }

    dispatch({ type: 'PRICE_SUCCESS', quote });

    if (!quote.error) {
      if (quote.direction === 'sell') {
        dispatch({ type: 'BUY_ERROR', msg: '' });
      } else {
        if (state.sellCurrency) {
          const msg = validate(quote.displaySellAmount, state.sellCurrency);
          dispatch({ type: 'SELL_ERROR', msg });
        }
      }
    }
  }, [quote]);

  const validate = useCallback(
    (amount: string, currencyId: string | null) => {
      if (currencyId === 'btc') {
        const totalSats = btcBalance ?? 0;
        const amountInSats = parseFloat(alkaneToAlks(amount));
        const isValid = totalSats >= amountInSats;
        return isValid ? '' : 'Insufficient Bitcoin balance';
      }
      return amount && currencyId ? validateAmount(amount, currencyId).errorMessage : '';
    },
    [validateAmount, btcBalance],
  );

  return {
    state,
    quote: state.quote,
    isPriceCalculating: isPriceCalculating && !!state.sellCurrency && !!state.buyCurrency,

    setPanel: (p: Panel) => dispatch({ type: 'SET_PANEL', panel: p }),
    setFocus: (f: Focus) => dispatch({ type: 'SET_FOCUS', focus: f }),

    setSellCurrency: (id: string) => {
      if (id === state.buyCurrency) {
        dispatch({ type: 'CLEAR_BUY' });
        setTo('');
        dispatch({ type: 'SET_FOCUS', focus: 'buy' });
        dispatch({ type: 'SET_PANEL', panel: 'buy' });
      }
      dispatch({ type: 'SET_SELL_CURRENCY', id });
      setFrom(id);
    },
    setBuyCurrency: (id: string) => {
      if (id === state.sellCurrency) {
        dispatch({ type: 'CLEAR_SELL' });
        setFrom('');
        dispatch({ type: 'SET_FOCUS', focus: 'sell' });
        dispatch({ type: 'SET_PANEL', panel: 'sell' });
      }
      dispatch({ type: 'SET_BUY_CURRENCY', id });
      setTo(id);
    },

    setSellAmount: (v: string) => {
      dispatch({ type: 'SET_SELL_AMOUNT', value: v });
      setSellAmount(v);
      setBuyAmount('');
      dispatch({ type: 'CLEAR_ERRORS' });
      if (state.sellCurrency) {
        dispatch({ type: 'SELL_ERROR', msg: validate(v, state.sellCurrency) });
      }
      if (state.sellCurrency && state.buyCurrency) {
        dispatch({ type: 'SET_PANEL', panel: 'config' });
      }
    },
    setBuyAmount: (v: string) => {
      dispatch({ type: 'SET_BUY_AMOUNT', value: v });
      setBuyAmount(v);
      setSellAmount('');
      dispatch({ type: 'BUY_ERROR', msg: '' });
      if (state.sellCurrency) {
        const msg = validate(state.sellAmount, state.sellCurrency);
        dispatch({ type: 'SELL_ERROR', msg });
      }
      if (state.sellCurrency && state.buyCurrency) {
        dispatch({ type: 'SET_PANEL', panel: 'config' });
      }
    },

    clearBuy: () => dispatch({ type: 'CLEAR_BUY' }),
    clearSell: () => dispatch({ type: 'CLEAR_SELL' }),
    invertCurrencies: () => dispatch({ type: 'INVERT_CURRENCIES' }),
  } as const;
}


