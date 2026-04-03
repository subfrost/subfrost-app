import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';

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

/**
 * Queries MasterFujin [4:7112] for market count and list.
 *
 * MasterFujin opcodes (from reference/Fujin-contracts/alkanes/fujin-master/src/lib.rs):
 *   0: Init, 1: CreateMarket, 90: GetMarket, 91: GetMarketCount,
 *   92: GetMarketAtIndex, 93: GetAllMarkets, 50: Forward
 *
 * Previously this hook queried FUJIN_FACTORY_ID (4:7107) which is the factory LOGIC
 * (uninitialized template). Markets are registered in MasterFujin, not the factory.
 *
 * GetMarketCount (opcode 91): returns u128 count
 * GetAllMarkets (opcode 93): returns u128 count + count×(u128 block, u128 tx) of factory IDs
 */
export function useFujinMarkets() {
  const { network } = useWallet();

  return useQuery<FujinMarketsResult | null>({
    queryKey: ['fujin-markets', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      // Use MasterFujin (market registry), not factory logic (uninitialized template)
      const masterId = (config as any).FUJIN_MASTER_ID || (config as any).FUJIN_FACTORY_ID;
      if (!masterId) return null;

      const [block, tx] = masterId.split(':');
      const target = { block, tx };

      // MasterFujin opcode 91: GetMarketCount → u128
      const numResp = await fetch(getRpcUrl(network), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{ target, inputs: ['91'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
          id: 1,
        }),
      });
      const numData = await numResp.json();
      const numExec = numData?.result?.execution;

      if (numExec?.error) {
        return { factoryId: masterId, markets: [], numMarkets: 0, error: numExec.error };
      }

      const numMarkets = numExec?.data ? parseNumMarkets(numExec.data) : 0;

      if (numMarkets === 0) {
        return { factoryId: masterId, markets: [], numMarkets: 0, error: null };
      }

      // MasterFujin opcode 93: GetAllMarkets → market list
      // Response format differs from factory — each entry is (base_token_block, base_token_tx, duration)
      // For now, query each market individually via opcode 92 (GetMarketAtIndex)
      let markets: FujinMarket[] = [];
      try {
        for (let i = 0; i < numMarkets && i < 20; i++) {
          const idxResp = await fetch(getRpcUrl(network), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{ target, inputs: ['92', String(i)], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
              id: 2 + i,
            }),
          });
          const idxData = await idxResp.json();
          const idxExec = idxData?.result?.execution;
          if (idxExec?.data && !idxExec.error) {
            const hex = idxExec.data.replace(/^0x/, '');
            // GetMarketAtIndex returns: base_token(32 bytes) + duration(16 bytes) = 80 bytes
            if (hex.length >= 80) {
              const baseBlock = Number(readU128LE(Array.from(Buffer.from(hex, 'hex')), 0));
              const baseTx = Number(readU128LE(Array.from(Buffer.from(hex, 'hex')), 16));
              markets.push({
                marketId: `${baseBlock}:${baseTx}`,
                block: baseBlock,
                tx: baseTx,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[useFujinMarkets] Failed to fetch market list:', err);
      }

      return { factoryId: masterId, markets, numMarkets, error: null };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
