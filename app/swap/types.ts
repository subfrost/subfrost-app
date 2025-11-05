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


