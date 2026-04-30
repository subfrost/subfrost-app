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
  /** Raw reserve amount of token0 in sub-units (1e8). Used to lock the
   *  add-liquidity ratio for existing pools. */
  token0Amount?: string;
  /** Raw reserve amount of token1 in sub-units. */
  token1Amount?: string;
  /** Total LP token supply in sub-units (1e8). Used to compute expected
   *  withdrawal amounts: expected = (lpAmount / lpTotalSupply) * reserve. */
  lpTotalSupply?: string;
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
  /** Routing source: 'amm' (default), 'clob' (orderbook), or 'router' (hybrid best-price) */
  routeSource?: 'amm' | 'clob' | 'router';
};


