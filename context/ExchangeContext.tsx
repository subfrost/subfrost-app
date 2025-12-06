/**
 * ExchangeContext - Global state for exchange/swap functionality
 * 
 * Manages:
 * - Available pools (dynamically loaded per network)
 * - Token metadata
 * - Network-specific configuration
 * - Pool reloading when network changes
 */

"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useRef } from 'react';
import { useWallet } from './WalletContext';
import { useDynamicPools, type DynamicPool } from '@/hooks/useDynamicPools';
import { getConfig } from '@/utils/getConfig';

export type TokenMeta = {
  symbol: string;
  name: string;
  id: string; // alkane ID format: "block:tx"
  decimals: number;
  iconUrl?: string;
};

export type EnrichedPool = {
  id: string; // pool alkane ID
  token0: TokenMeta;
  token1: TokenMeta;
  tvl?: number;
  volume24h?: number;
  apr?: number;
  rawData: DynamicPool;
};

type ExchangeContextType = {
  // Pools
  pools: EnrichedPool[];
  poolsLoading: boolean;
  poolsError: Error | null;
  reloadPools: () => void;
  
  // Token whitelist
  allowedTokens: Set<string>;
  
  // Network info
  factoryId: string;
  network: string;
};

const ExchangeContext = createContext<ExchangeContextType | null>(null);

export function ExchangeProvider({ children }: { children: ReactNode }) {
  const { network } = useWallet();
  const config = useMemo(() => getConfig(network), [network]);
  const prevNetworkRef = useRef(network);
  
  // Token whitelist for filtering
  const [allowedTokens] = useState(() => new Set([
    'BTC',
    'frBTC',
    'SUBFROST BTC',
    'bUSD',
    'DIESEL',
    'METHANE',
    'ALKAMIST',
    'GOLD DUST'
  ]));
  
  // Fetch pools dynamically using WASM method
  const {
    data: poolsData,
    isLoading: poolsLoading,
    error: poolsError,
    refetch: reloadPools,
  } = useDynamicPools({
    chunk_size: 30,
    max_concurrent: 10,
    enabled: true,
  });
  
  // Parse and enrich pool data
  const [pools, setPools] = useState<EnrichedPool[]>([]);
  
  useEffect(() => {
    if (!poolsData?.pools) {
      setPools([]);
      return;
    }
    
    const enrichedPools = poolsData.pools
      .map((pool): EnrichedPool | null => {
        try {
          // Pool structure from BatchPoolsResponse in alkanes-cli-common:
          // {
          //   pool_id_block: u64,
          //   pool_id_tx: u64,
          //   details: Option<PoolDetails> {
          //     token_a_block, token_a_tx,
          //     token_b_block, token_b_tx,
          //     reserve_a, reserve_b,
          //     total_supply,
          //     pool_name
          //   }
          // }
          
          if (!pool.details) {
            console.warn('Pool has no details:', pool);
            return null;
          }
          
          const details = pool.details;
          const poolId = `${pool.pool_id_block}:${pool.pool_id_tx}`;

          // Create token metadata from pool details
          const tokenAId = `${details.token_a_block}:${details.token_a_tx}`;
          const tokenBId = `${details.token_b_block}:${details.token_b_tx}`;

          // Extract token names from pool details if available
          // Pool details may include: token_a_name, token_b_name, token_a_symbol, token_b_symbol
          const tokenAName = details.token_a_name || details.token_a_symbol || '';
          const tokenBName = details.token_b_name || details.token_b_symbol || '';

          // Map known tokens - uses network-specific IDs from config
          const getTokenMeta = (alkaneId: string, detailsName?: string): TokenMeta => {
            // Get network-specific token IDs from config
            const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = config;

            // Known token mappings - dynamically built based on network config
            const tokenMap: Record<string, TokenMeta> = {
              // frBTC - uses config value (32:0 on most networks)
              [FRBTC_ALKANE_ID]: {
                symbol: 'frBTC',
                name: 'Subfrost BTC',
                id: FRBTC_ALKANE_ID,
                decimals: 8,
                iconUrl: `https://asset.oyl.gg/alkanes/${network}/${FRBTC_ALKANE_ID.replace(':', '-')}.png`,
              },
              // bUSD - uses config value (varies by network)
              [BUSD_ALKANE_ID]: {
                symbol: 'bUSD',
                name: 'Bitcoin USD',
                id: BUSD_ALKANE_ID,
                decimals: 8,
                iconUrl: `https://asset.oyl.gg/alkanes/${network}/${BUSD_ALKANE_ID.replace(':', '-')}.png`,
              },
            };

            // If the alkaneId matches a known token, return it
            if (tokenMap[alkaneId]) {
              return tokenMap[alkaneId];
            }

            // Use the name from pool details if available, otherwise use alkaneId
            const name = detailsName ? detailsName.replace('SUBFROST BTC', 'frBTC') : `Token ${alkaneId}`;
            const symbol = detailsName ? detailsName.replace('SUBFROST BTC', 'frBTC') : alkaneId.replace(':', '_');

            return {
              symbol,
              name,
              id: alkaneId,
              decimals: 8,
              iconUrl: `https://asset.oyl.gg/alkanes/${network}/${alkaneId.replace(':', '-')}.png`,
            };
          };

          const token0 = getTokenMeta(tokenAId, tokenAName);
          const token1 = getTokenMeta(tokenBId, tokenBName);
          
          // Calculate TVL and other metrics from reserves
          // Note: This is simplified - real TVL would need price oracles
          const tvl = Number(details.reserve_a) + Number(details.reserve_b);
          
          return {
            id: poolId,
            token0,
            token1,
            tvl,
            rawData: pool,
          };
        } catch (error) {
          console.error('Failed to parse pool:', pool, error);
          return null;
        }
      })
      .filter((p): p is EnrichedPool => p !== null);
    
    // Filter by whitelist (symbols)
    const filtered = enrichedPools.filter((pool) => {
      return allowedTokens.has(pool.token0.symbol) && allowedTokens.has(pool.token1.symbol);
    });
    
    console.log('[ExchangeContext] Loaded pools:', {
      total: enrichedPools.length,
      filtered: filtered.length,
      pools: filtered.map(p => `${p.token0.symbol}/${p.token1.symbol}`)
    });
    
    setPools(filtered);
  }, [poolsData, network, allowedTokens, config]);

  // Reload pools when network changes
  useEffect(() => {
    // Only reload if network actually changed (not on initial mount or other triggers)
    if (prevNetworkRef.current !== network) {
      console.log('[ExchangeContext] Network changed to:', network);
      prevNetworkRef.current = network;
      reloadPools();
    }
  }, [network, reloadPools]);
  
  const value: ExchangeContextType = {
    pools,
    poolsLoading,
    poolsError: poolsError as Error | null,
    reloadPools,
    allowedTokens,
    factoryId: config.ALKANE_FACTORY_ID,
    network,
  };
  
  return (
    <ExchangeContext.Provider value={value}>
      {children}
    </ExchangeContext.Provider>
  );
}

export function useExchange() {
  const context = useContext(ExchangeContext);
  if (!context) {
    throw new Error('useExchange must be used within ExchangeProvider');
  }
  return context;
}
