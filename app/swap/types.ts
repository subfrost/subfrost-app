export type TokenMeta = {
  id: string;
  symbol: string;
  name?: string;
  iconUrl?: string;
};

export type PoolSummary = {
  id: string;
  pairLabel: string; // e.g., "METHANE / bUSD LP"
  token0: TokenMeta;
  token1: TokenMeta;
  tvlUsd?: number;
  vol24hUsd?: number;
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


