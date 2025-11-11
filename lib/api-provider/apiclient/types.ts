export interface AlkaneId {
  block: string;
  tx: string;
}

export interface AlkanesByAddressResult {
  alkaneId: AlkaneId;
  name: string;
  symbol: string;
  balance: string;
  busdPoolPriceInUsd: number;
  frbtcPoolPriceInSats: number;
  priceInSatoshi: string;
  floorPrice: string;
  tokenImage: string | null;
  idClubMarketplace: boolean | null;
}

export type PoolDetailsResult = {
  poolId: AlkaneId;
  token0: AlkaneId;
  token1: AlkaneId;
  token0Amount: string;
  token1Amount: string;
  tokenSupply: string;
  poolName: string;
  lPTokenValueInSats: number;
  lPTokenValueInUsd: number;
  poolTvlInSats: number;
  poolTvlInUsd: number;
  token0TvlInSats?: number;
  token0TvlInUsd?: number;
  token1TvlInSats?: number;
  token1TvlInUsd?: number;
  poolVolume30dInSats?: number;
  poolVolume1dInSats?: number;
  poolVolume30dInUsd?: number;
  poolVolume1dInUsd?: number;
  token0Volume30d?: number;
  token1Volume30d?: number;
  token0Volume1d?: number;
  token1Volume1d?: number;
  poolApr?: number;
};
export type AddressPositionsResult = PoolDetailsResult & {
  token0: AlkaneId;
  token1: AlkaneId;
  token0Amount: string;
  token1Amount: string;
  tokenSupply: string;
  poolName: string;
  poolId: AlkaneId;
  balance: string;
  token0ValueInSats: number;
  token1ValueInSats: number;
  token0ValueInUsd: number;
  token1ValueInUsd: number;
  totalValueInSats: number;
  totalValueInUsd: number;
};

export type PoolAmountOutResult = {
  equivalentAmount: string;
};

export type AllPoolsDetailsResult = {
  count: number;
  pools: (PoolDetailsResult & { poolId: AlkaneId })[];
  total: number;
  offset: number;
  limit: number;
  totalTvl: number;
  totalPoolVolume24hChange: string;
  totalPoolVolume24h: number;
  largestPool: (PoolDetailsResult & { tvl: number; poolId: AlkaneId; });
  trendingPools: {
    "15m": (PoolDetailsResult & { trend: number; poolId: AlkaneId });
    "1h": (PoolDetailsResult & { trend: number; poolId: AlkaneId });
    "4h": (PoolDetailsResult & { trend: number; poolId: AlkaneId });
    "1d": (PoolDetailsResult & { trend: number; poolId: AlkaneId });
  };
};

export interface AlkanesTokenPairsResult {
  poolId: PoolId;
  poolName: string;
  token0: AlkanesTokenPairToken0;
  token1: AlkanesTokenPairToken1;
  poolVolume1dInUsd?: number;
  poolTvlInUsd?: number;
}

export interface PoolId {
  block: string;
  tx: string;
}

export interface AlkanesTokenPairToken {
  name: string;
  symbol: string;
  totalSupply: number;
  cap: number;
  mintAmount: number;
  alkaneId: AlkaneId;
  token0Amount?: string;
  token1Amount?: string;
}

export interface AlkanesTokenPairToken0 extends AlkanesTokenPairToken {
  token0Amount: string;
}

export interface AlkanesTokenPairToken1 extends AlkanesTokenPairToken {
  token1Amount: string;
}

export interface IdClubMarketplaceAlkanesTokenResult {
  floorPrice?: number | null;
  fdv?: number | null;
  marketcap?: number | null;
  tokenVolume1d?: number | null;
  tokenVolume30d?: number | null;
  tokenVolume7d?: number | null;
  tokenVolumeAllTime?: number | null;
  holders?: number | null;
}

export type AlkanesTokens = IdClubMarketplaceAlkanesTokenResult & {
  id: AlkaneId;
  name: string;
  symbol: string;
  totalSupply: number;
  minted: number;
  mintActive: boolean;
  percentageMinted: number;
  busdPoolPriceInUsd: number;
  frbtcPoolFdvInSats: number | null;
  busdPoolFdvInUsd: number | null;
  frbtcPoolPriceInSats: number;
  idClubMarketplace: boolean | null;
  busdPoolMarketcapInUsd: number | null;
  frbtcPoolMarketcapInSats: number | null;
  tokenPoolsVolume1dInUsd?: number;
  tokenPoolsVolume30dInUsd?: number;
  tokenPoolsVolume7dInUsd?: number;
  tokenPoolsVolumeAllTimeInUsd?: number;
  priceChange24h: string
  priceChange7d: string
  priceChange30d: string;
  priceChangeAllTime: string;
};

export type AlkanesTokensResult = {
  tokens: AlkanesTokens[];
  total: number;
  offset: number;
  limit: number;
  count: number
};

export type AlkanesGlobalSearchResult = {
  tokens: AlkanesTokens[];
  pools: PoolDetailsResult[];
}


export interface AlkaneTokenDetails {
  id?: AlkaneId;
  name: string;
  symbol: string;
  totalSupply: number;
  cap: number;
  minted: number;
  mintActive: boolean;
  percentageMinted: number;
  mintAmount: number;
  image?: string;
  frbtcPoolPriceInSats?: number;
  busdPoolPriceInUsd?: number;
  maxSupply?: number;
  busdPoolFdvInUsd?: number;
  frbtcPoolFdvInSats?: number;
  idClubMarketplace: boolean;
  floorPrice: number;
  marketcap: number;
}


export type AlkaneTokenSortByParams =
'price' | 'fdv' | 'marketcap' | 'volume1d' 
  | 'volume30d' | 'volume7d' | 'volumeAllTime' 
  | 'holders' | 'change1d' | 'change7d' 
  | 'change30d' | 'changeAllTime' ;


export interface SwapInfo {
  tokenId: AlkaneId;
  amount: string;
}

export interface SwapHistory {
  transactionId: string;
  pay: SwapInfo;
  receive: SwapInfo;
  address: string;
  timestamp: Date;
}

export interface PoolSwapHistory {
  pool: {
    poolId: AlkaneId;
    poolName: string;
  };
  swaps: SwapHistory[];
  count: number;
  offset: number;
  total: number;
}



export interface DieselRewardsLeaderboardResponse {
  rank: number;
  wallet_address: string;
  whalepass_count: number;
  airhead_count: number;
  xp: number;
  Total_DIESEL: number;
}

export interface DieselAddressLeaderboardResponse {
  wallet_address: string;
  Total_DIESEL: number;
}

export interface DieselRewardsResponse {
  rank: number;
  totalDiesel: string;
  weightedXp: number;
  ownershipBonus: {
    whalePassOwnership: {
      whalepass_count: number;
      multiplier: number;
      totalDiesel: number;
    };
    airheadsOwnership: {
      airhead_count: number;
      multiplier: number;
      totalDiesel: number;
    };
  };
  communityBonus: {
    clockInOfficial: {
      count: number;
      multiplier: number;
      totalDiesel: number;
    };
    clockInExternal: {
      count: number;
      multiplier: number;
      totalDiesel: number;
    };
    community: {
      totalDiesel: number;
    };
  };
  airheadHoldingXp: {
    totalXp: number;
    weight: number;
    totalDiesel: number;
    airheads: {
      name: string;
      xp: number;
    }[];
  };
  assetBasedXp: {
    totalXp: number;
    totalDiesel: number;
    bitcoinXp: {
      xp: number;
      weight: number;
    };
    ordinalsXp: {
      xp: number;
      weight: number;
    };
    brc20Xp: {
      xp: number;
      weight: number;
    };
    runeXp: {
      xp: number;
      weight: number;
    };
    alkaneXp: {
      xp: number;
      weight: number;
    };
  };
  additionalXp: {
    totalXp: number;
    totalDiesel: number;
    questsXp: {
      xp: number;
      weight: number;
    };
    whaleBonusXp: {
      xp: number;
      weight: number;
    };
    idClubXp: {
      xp: number;
      weight: number;
    };
    unisatXp: {
      xp: number;
      weight: number;
    };
    whalePassXp: {
      xp: number;
      weight: number;
    };
  };
}

// AMM History shared types
export type PaginationParams = {
  count?: number; // default 50; clamped [1, 200]
  offset?: number; // default 0; clamped >= 0
  successful?: boolean; // optional; filter to successful only
  includeTotal?: boolean; // default true; when false, total = -1
};

export type Page<T> = {
  items: T[] | T;
  total: number;
  count: number;
  offset: number;
};

// Rows
export type PoolSwapRow = {
  transactionId: string;
  poolBlockId?: string;
  poolTxId?: string;
  soldTokenBlockId: string;
  soldTokenTxId: string;
  boughtTokenBlockId: string;
  boughtTokenTxId: string;
  soldAmount: string; // amounts are strings
  boughtAmount: string; // amounts are strings
  address?: string; // normalized address (preferred)
  sellerAddress?: string;
  timestamp: string; // ISO
};

export type PoolMintRow = {
  transactionId: string;
  poolBlockId: string;
  poolTxId: string;
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  token0Amount: string;
  token1Amount: string;
  lpTokenAmount: string;
  address?: string; // normalized address (preferred)
  minterAddress?: string;
  timestamp: string;
};

export type PoolBurnRow = {
  transactionId: string;
  poolBlockId: string;
  poolTxId: string;
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  token0Amount: string;
  token1Amount: string;
  lpTokenAmount: string;
  address?: string; // normalized address (preferred)
  burnerAddress?: string;
  timestamp: string;
};

export type PoolCreationRow = {
  transactionId: string;
  poolBlockId: string;
  poolTxId: string;
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  token0Amount: string;
  token1Amount: string;
  tokenSupply: string;
  address?: string; // normalized address (preferred)
  creatorAddress?: string;
  timestamp: string;
};

// Special object for pool swap history
export type PoolSwapHistoryResult = {
  pool: {
    poolId: AlkaneId;
    poolName: string;
  };
  swaps: Array<{
    transactionId: string;
    pay: { tokenId: AlkaneId; amount: string };
    receive: { tokenId: AlkaneId; amount: string };
    address?: string | null;
    timestamp: string;
  }>;
};

// Combined address AMM tx history rows
export type AllAddressAmmTxSwap = {
  type: 'swap';
  transactionId: string;
  timestamp: string;
  poolBlockId: string;
  poolTxId: string;
  soldTokenBlockId: string;
  soldTokenTxId: string;
  boughtTokenBlockId: string;
  boughtTokenTxId: string;
  soldAmount: string; // amounts are strings
  boughtAmount: string; // amounts are strings
  address: string; // normalized address
};

export type AllAddressAmmTxMint = {
  type: 'mint';
  transactionId: string;
  timestamp: string;
  poolBlockId: string;
  poolTxId: string;
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  token0Amount: string;
  token1Amount: string;
  lpTokenAmount: string;
  address: string; // normalized address
};

export type AllAddressAmmTxBurn = {
  type: 'burn';
  transactionId: string;
  timestamp: string;
  poolBlockId: string;
  poolTxId: string;
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  token0Amount: string;
  token1Amount: string;
  lpTokenAmount: string;
  address: string; // normalized address
};

export type AllAddressAmmTxCreation = {
  type: 'creation';
  transactionId: string;
  timestamp: string;
  poolBlockId: string;
  poolTxId: string;
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  token0Amount: string;
  token1Amount: string;
  tokenSupply: string;
  address: string; // normalized address
};

export type AllAddressAmmTxRow =
  | AllAddressAmmTxSwap
  | AllAddressAmmTxMint
  | AllAddressAmmTxBurn
  | AllAddressAmmTxCreation;

// Futures Market Types
export type FuturesMarketType = 'perpetual' | 'expiry';

export interface FuturesMarketResult {
  id: string;
  symbol: string;
  type: FuturesMarketType;
  baseAsset: string;
  quoteAsset: string;
  baseAssetId: AlkaneId;
  quoteAssetId: AlkaneId;
  markPrice: number;
  indexPrice: number;
  lastPrice: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate?: number;
  nextFundingTime?: string;
  expiryDate?: string;
  maxLeverage: number;
  minOrderSize: number;
  tickSize: number;
  makerFee: number;
  takerFee: number;
  liquidationFee: number;
}

export interface AllFuturesMarketsResult {
  markets: FuturesMarketResult[];
  total: number;
  timestamp: string;
}

export interface FuturesPositionResult {
  id: string;
  marketId: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: string;
}

export interface FuturesOrderResult {
  id: string;
  marketId: string;
  symbol: string;
  side: 'long' | 'short';
  type: 'market' | 'limit' | 'stop-market' | 'stop-limit';
  size: number;
  price?: number;
  stopPrice?: number;
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  filledSize: number;
  averageFillPrice?: number;
  createdAt: string;
  updatedAt: string;
}
