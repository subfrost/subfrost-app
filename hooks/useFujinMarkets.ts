import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { alkanesSimulate as rpcAlkanesSimulate } from '@/lib/alkanes/rpc';

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
    queryFn: async ({ signal }) => {
      const config = getConfig(network || 'devnet');
      // Use MasterFujin (market registry), not factory logic (uninitialized template)
      const masterId = (config as any).FUJIN_MASTER_ID || (config as any).FUJIN_FACTORY_ID;
      if (!masterId) return null;

      // MasterFujin opcode 91: GetMarketCount → u128
      const numRes = await rpcAlkanesSimulate(
        network,
        { target: masterId, inputs: ['91'], height: '999999' },
        signal,
      );
      const numExec = numRes.execution;

      if (numExec?.error) {
        return { factoryId: masterId, markets: [], numMarkets: 0, error: numExec.error };
      }

      const numMarkets = numExec?.data ? parseNumMarkets(numExec.data) : 0;

      if (numMarkets === 0) {
        return { factoryId: masterId, markets: [], numMarkets: 0, error: null };
      }

      // MasterFujin opcode 92: GetMarketAtIndex. Parallelize — server doesn't
      // support JSON-RPC batch arrays, so we use Promise.all instead. The
      // per-index calls are independent reads so the AbortSignal is shared
      // to cancel all in-flight requests on unmount.
      const indicesToFetch = Math.min(numMarkets, 20);
      const marketResponses = await Promise.all(
        Array.from({ length: indicesToFetch }, (_, i) =>
          rpcAlkanesSimulate(
            network,
            { target: masterId, inputs: ['92', String(i)], height: '999999' },
            signal,
          ).catch((err) => {
            console.warn(`[useFujinMarkets] index ${i} failed:`, err);
            return null;
          }),
        ),
      );

      const markets: FujinMarket[] = [];
      for (const res of marketResponses) {
        const idxExec = res?.execution;
        if (!idxExec?.data || idxExec.error) continue;
        const hex = idxExec.data.replace(/^0x/, '');
        // GetMarketAtIndex returns: base_token(32 bytes) + duration(16 bytes) = 80 bytes
        if (hex.length >= 80) {
          const bytes = Array.from(Buffer.from(hex, 'hex'));
          const baseBlock = Number(readU128LE(bytes, 0));
          const baseTx = Number(readU128LE(bytes, 16));
          markets.push({
            marketId: `${baseBlock}:${baseTx}`,
            block: baseBlock,
            tx: baseTx,
          });
        }
      }

      return { factoryId: masterId, markets, numMarkets, error: null };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
