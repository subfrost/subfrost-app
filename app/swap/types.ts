export type TokenMeta = {
  id: string;
  symbol: string;
  name?: string;
  iconUrl?: string;
  isAvailable?: boolean;
  unavailableReason?: 'no_balance' | 'no_pool';
};

export type PoolSummary = {
  id: string;
  pairLabel: string; // e.g., "DIESEL / bUSD LP"
  token0: TokenMeta;
  token1: TokenMeta;
  tvlUsd?: number;
  token0TvlUsd?: number;
  token1TvlUsd?: number;
  vol24hUsd?: number;
  vol7dUsd?: number;
  vol30dUsd?: number;
  apr?: number;
};

export type SwapQuote = {
  sellAmount: string;
  buyAmount: string;
  displaySellAmount: string;
  displayBuyAmount: string;
  exchangeRate: string;
  minimumReceived: string;
  maximumSent: string;
  route?: string[]; // Token IDs in swap path (e.g., ['32:0', '5:0', '2:0'])
  hops?: number; // Number of swaps (1 for direct, 2 for multi-hop)
};


