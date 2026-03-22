import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

export interface FujinMarket {
  marketId: string;
  block: number;
  tx: number;
  underlyingBlock?: number;
  underlyingTx?: number;
  expiry?: number;
  strikePrice?: string;
}

export interface FujinMarketsResult {
  factoryId: string;
  markets: FujinMarket[];
  numMarkets: number;
  error: string | null;
}

/**
 * Parse a u128 from 16 little-endian bytes starting at offset
 */
function readU128LE(bytes: number[], offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * Parse GetNumMarkets (opcode 4) response — returns a single u128 count
 */
function parseNumMarkets(data: string | number[]): number {
  const bytes = typeof data === 'string'
    ? Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'))
    : data;
  if (bytes.length < 16) return 0;
  return Number(readU128LE(bytes, 0));
}

/**
 * Parse GetAllMarkets (opcode 3) response — returns a list of market AlkaneIds
 * Format: u128 count, then count * (u128 block, u128 tx) pairs
 */
function parseMarketsList(data: string | number[]): FujinMarket[] {
  const bytes = typeof data === 'string'
    ? Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'))
    : data;
  if (bytes.length < 16) return [];

  const count = Number(readU128LE(bytes, 0));
  const markets: FujinMarket[] = [];
  let offset = 16;

  for (let i = 0; i < count && offset + 32 <= bytes.length; i++) {
    const block = Number(readU128LE(bytes, offset));
    const tx = Number(readU128LE(bytes, offset + 16));
    markets.push({
      marketId: `${block}:${tx}`,
      block,
      tx,
    });
    offset += 32;
  }

  return markets;
}

export function useFujinMarkets() {
  const { network } = useWallet();

  return useQuery<FujinMarketsResult | null>({
    queryKey: ['fujin-markets', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      const factoryId = (config as any).FUJIN_FACTORY_ID;
      if (!factoryId) return null;

      const [block, tx] = factoryId.split(':');
      const target = { block, tx };

      // First try opcode 4 (GetNumMarkets) to check if factory is deployed and responsive
      const numResp = await fetch(`/api/rpc/${network}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{ target, inputs: ['4'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
          id: 1,
        }),
      });
      const numData = await numResp.json();
      const numExec = numData?.result?.execution;

      if (numExec?.error) {
        return { factoryId, markets: [], numMarkets: 0, error: numExec.error };
      }

      const numMarkets = numExec?.data ? parseNumMarkets(numExec.data) : 0;

      if (numMarkets === 0) {
        return { factoryId, markets: [], numMarkets: 0, error: null };
      }

      // Fetch full market list via opcode 3 (GetAllMarkets)
      let markets: FujinMarket[] = [];
      try {
        const listResp = await fetch(`/api/rpc/${network}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alkanes_simulate',
            params: [{ target, inputs: ['3'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
            id: 2,
          }),
        });
        const listData = await listResp.json();
        const listExec = listData?.result?.execution;

        if (listExec?.data && !listExec.error) {
          markets = parseMarketsList(listExec.data);
        }
      } catch (err) {
        console.warn('[useFujinMarkets] Failed to fetch market list (opcode 3):', err);
      }

      return { factoryId, markets, numMarkets, error: null };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
