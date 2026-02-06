/**
 * Centralized query key factories.
 *
 * Every key includes `network` so that invalidating by network prefix
 * automatically covers all queries for that network.
 *
 * Structure: queryKeys.<domain>.<entity>(deps...)
 */

export const queryKeys = {
  // -------------------------------------------------------------------------
  // Height (the one polling query)
  // -------------------------------------------------------------------------
  height: {
    all: (network: string) => ['height', network] as const,
    espo: (network: string) => ['height', network, 'espo'] as const,
  },

  // -------------------------------------------------------------------------
  // Market data
  // -------------------------------------------------------------------------
  market: {
    btcPrice: (network: string) => ['btcPrice', network] as const,
    frbtcPremium: (network: string, frbtcId: string) =>
      ['frbtc-premium', network, frbtcId] as const,
    tokenDisplayMap: (network: string, ids: string) =>
      ['token-display', network, ids] as const,
    feeEstimates: (network: string) => ['feeEstimates', network] as const,
  },

  // -------------------------------------------------------------------------
  // Account / wallet
  // -------------------------------------------------------------------------
  account: {
    enrichedWallet: (network: string, addresses: string) =>
      ['enriched-wallet', network, addresses] as const,
    btcBalance: (network: string, address: string) =>
      ['btc-balance', address, network] as const,
    sellableCurrencies: (
      network: string,
      walletAddress: string,
      tokensKey: string,
    ) => ['sellable-currencies', walletAddress, tokensKey, network] as const,
  },

  // -------------------------------------------------------------------------
  // Pools
  // -------------------------------------------------------------------------
  pools: {
    list: (network: string, paramsKey: string, btcPrice: number) =>
      ['pools', network, paramsKey, btcPrice] as const,
    dynamic: (network: string, factoryId: string) =>
      ['dynamic-pools', network, factoryId] as const,
    tokenPairs: (network: string, alkaneId: string, paramsKey: string) =>
      ['alkanesTokenPairs', alkaneId, paramsKey, network] as const,
    fee: (network: string, alkaneId: string) =>
      ['poolFee', network, alkaneId] as const,
    metadata: (network: string, poolIdsKey: string) =>
      ['poolsMetadata', network, poolIdsKey] as const,
  },

  // -------------------------------------------------------------------------
  // Charts / candles
  // -------------------------------------------------------------------------
  charts: {
    poolCandles: (network: string, poolKey: string, timeframe: string) =>
      ['pool-candles', poolKey, timeframe, network] as const,
    btcUsdtCandles: (timeframe: string) =>
      ['btc-usdt-candles', timeframe] as const,
    poolEspoCandles: (network: string, poolId: string, timeframe: string) =>
      ['pool-espo-candles', poolId, timeframe, network] as const,
    poolCandleVolume: (
      network: string,
      poolId: string,
      token1Id: string,
      btcPrice: number,
    ) => ['pool-candle-volume', poolId, token1Id, network, btcPrice] as const,
    allPoolCandleVolumes: (
      network: string,
      poolsKey: string,
      btcPrice: number,
    ) => ['all-pool-candle-volumes', poolsKey, network, btcPrice] as const,
  },

  // -------------------------------------------------------------------------
  // Pool data (API-backed stats/prices/volumes)
  // -------------------------------------------------------------------------
  poolData: {
    prices: (network: string) => ['pool-prices', 'all', network] as const,
    price: (network: string, poolKey: string) =>
      ['pool-price', poolKey, network] as const,
    statsAll: (network: string) => ['pool-stats', 'all', network] as const,
    stats: (network: string, poolKey: string) =>
      ['pool-stats', poolKey, network] as const,
    dashboard: (network: string) => ['dashboard-stats', network] as const,
    volumesAll: (network: string, period: string) =>
      ['pool-volumes', 'all', period, network] as const,
    volume: (network: string, poolKey: string, period: string) =>
      ['pool-volume', poolKey, period, network] as const,
  },

  // -------------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------------
  positions: {
    metadata: (positionIdsKey: string) =>
      ['position-metadata', positionIdsKey] as const,
  },

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------
  history: {
    ammTx: (
      network: string,
      address: string,
      count: number,
      txType: string,
    ) => ['ammTxHistory', network, address, count, txType] as const,
    transactions: (network: string, address: string) =>
      ['transaction-history', network, address] as const,
  },

  // -------------------------------------------------------------------------
  // Vaults
  // -------------------------------------------------------------------------
  vaults: {
    stats: (
      network: string,
      vaultContractId: string,
      baseTokenId: string,
      accountKey: string,
    ) =>
      [
        'vaultStats',
        vaultContractId,
        baseTokenId,
        accountKey,
        network,
      ] as const,
    units: (vaultTemplateId: string) =>
      ['vaultUnits', vaultTemplateId] as const,
  },

  // -------------------------------------------------------------------------
  // Futures
  // -------------------------------------------------------------------------
  futures: {
    markets: (network: string, type: string, baseAsset: string) =>
      ['futures-markets', network, type, baseAsset] as const,
    market: (network: string, marketId: string) =>
      ['futures-market', network, marketId] as const,
    all: (network: string) => ['futures', network] as const,
  },

  // -------------------------------------------------------------------------
  // Swap quotes
  // -------------------------------------------------------------------------
  swap: {
    quotes: (
      network: string,
      direction: string,
      sellId: string,
      buyId: string,
      amount: string,
      slippage: string,
      wrapFee: number,
      unwrapFee: number,
    ) =>
      [
        'swap-quotes',
        network,
        direction,
        sellId,
        buyId,
        amount,
        slippage,
        wrapFee,
        unwrapFee,
      ] as const,
  },
} as const;
