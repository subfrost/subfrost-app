'use client';

import type { CurrencyPriceInfoResponse } from '@/app/types/alkanes';

export type Panel = 'sell' | 'buy' | 'config' | 'none';
export type Direction = 'sell' | 'buy';
export type Focus = 'sell' | 'buy' | 'config';

export interface SwapQuote {
  direction: Direction;
  inputAmount: string;
  /** Amount you will send, in alks */
  sellAmount: string;
  /** Amount you will receive, in alks */
  buyAmount: string;
  /** Minimum you may receive after slippage, in alks */
  minimumReceived: string;
  /** Maximum you may send after slippage, in alks */
  maximumSent: string;

  /** Human-readable amounts (UI only) */
  displaySellAmount: string; // formatted Alkanes
  displayBuyAmount: string; // formatted Alkanes
  displayMinimumReceived: string; // formatted Alkanes
  displayMaximumSent: string; // formatted Alkanes

  /** Metadata */
  sellCurrency: CurrencyPriceInfoResponse | null;
  buyCurrency: CurrencyPriceInfoResponse | null;
  exchangeRate: string; // 1 sell → ? buy
  error?: string;
  /**
   * Multi-hop route, if present. For direct swaps, this is undefined.
   */
  route?: string[];
  hops?: number;
}


