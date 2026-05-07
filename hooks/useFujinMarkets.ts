import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import {
  simulateContract,
  extractField3Data,
  parseU128LE,
  espoCall,
} from '@/lib/fujin/rpc';

export interface FujinEpochPool {
  epoch: number;
  pool: { block: number; tx: number };
  long: { block: number; tx: number };
  short: { block: number; tx: number };
  reserves?: { long: bigint; short: bigint };
  settled?: boolean;
  blocksRemaining?: number;
  endHeight?: number;
  epochLength?: number;
  startBits?: number;
}

export interface FujinMarketsResult {
  factoryId: string;
  markets: FujinEpochPool[];
  numMarkets: number;
  currentEpoch: number;
  error: string | null;
}

const EPOCH_LENGTH = 2016;
const FACTORY_GET_CURRENT_EPOCH = 3;
const FACTORY_GET_EPOCH_POOL = 2;
const POOL_GET_INFO = 40;
const POOL_GET_RESERVES = 97;

/**
 * Try to get pool AlkaneId for a given epoch from the factory.
 */
async function tryGetEpochPool(
  rpcUrl: string,
  factoryId: string,
  epoch: number,
): Promise<{ block: number; tx: number } | null> {
  try {
    const result = await simulateContract(rpcUrl, factoryId, FACTORY_GET_EPOCH_POOL, [epoch]);
    const data = extractField3Data(result, 32);
    if (!data) return null;
    const block = Number(parseU128LE(data, 0));
    const tx = Number(parseU128LE(data, 32));
    if (block > 100000 || tx > 100000 || (block === 0 && tx === 0)) return null;
    return { block, tx };
  } catch {
    return null;
  }
}

/**
 * Get LONG/SHORT token IDs from pool via GetInfo (opcode 40).
 * Format: [epoch u128][token_a_block u128][token_a_tx u128]
 *         [token_b_block u128][token_b_tx u128][diesel_locked u128]
 */
async function getPoolTokens(
  rpcUrl: string,
  poolId: string,
): Promise<{ long: { block: number; tx: number }; short: { block: number; tx: number } } | null> {
  try {
    const result = await simulateContract(rpcUrl, poolId, POOL_GET_INFO);
    const data = extractField3Data(result, 96);
    if (!data) return null;
    return {
      long: { block: Number(parseU128LE(data, 32)), tx: Number(parseU128LE(data, 64)) },
      short: { block: Number(parseU128LE(data, 96)), tx: Number(parseU128LE(data, 128)) },
    };
  } catch {
    return null;
  }
}

/**
 * Get pool reserves via opcode 97.
 * Response: reserve_long(u128) + reserve_short(u128)
 */
async function getPoolReserves(
  rpcUrl: string,
  poolId: string,
): Promise<{ long: bigint; short: bigint } | null> {
  try {
    const result = await simulateContract(rpcUrl, poolId, POOL_GET_RESERVES);
    const data = extractField3Data(result, 32);
    if (!data) return null;
    return {
      long: parseU128LE(data, 0),
      short: parseU128LE(data, 32),
    };
  } catch {
    return null;
  }
}

/**
 * Get pool settlement data via opcode 51.
 * Response: start_bits(u32 LE) + end_height(u128 LE) + settled(u8) + ...
 */
async function getPoolSettlement(
  rpcUrl: string,
  poolId: string,
): Promise<{ startBits: number; endHeight: number; settled: boolean } | null> {
  try {
    const result = await simulateContract(rpcUrl, poolId, 51);
    const data = extractField3Data(result, 16);
    if (!data) return null;
    // start_bits: first 4 bytes LE → u32
    const startBits = parseInt(data.slice(0, 8).match(/../g)!.reverse().join(''), 16);
    // end_height: next 16 bytes LE → u128
    const endHeight = Number(parseU128LE(data, 8));
    // settled: byte at offset 24 (after 4 + 16 bytes = 40 hex chars)
    const settledByte = parseInt(data.slice(40, 42), 16);
    return { startBits, endHeight, settled: settledByte !== 0 };
  } catch {
    return null;
  }
}

/**
 * Fetch Fujin markets data.
 *
 * On regtest-local: queries factory contract via metashrew_view simulate.
 * On devnet: queries MasterFujin via alkanes_simulate (existing path).
 * Optionally enriches with Espo Fujin data if available.
 */
export function useFujinMarkets() {
  const { network } = useWallet();

  return useQuery<FujinMarketsResult | null>({
    queryKey: ['fujin-markets', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      // For local networks, use direct RPC URL (not proxy which returns 503)
      const LOCAL_NETWORKS = ['regtest-local', 'devnet'];
      const rpcUrl = LOCAL_NETWORKS.includes(network || '')
        ? 'http://localhost:18888'
        : network === 'qubitcoin-regtest'
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/rpc/qubitcoin-regtest`
          : getRpcUrl(network);

      // regtest-local: use factory contract via metashrew_view simulate
      const fujinFactoryId = (config as any).FUJIN_FACTORY_ID;
      const espoUrl = (config as any).FUJIN_ESPO_URL;

      if (fujinFactoryId && (network === 'regtest-local' || network === 'qubitcoin-regtest')) {
        try {
          return await fetchViaFactory(rpcUrl, fujinFactoryId, espoUrl);
        } catch (e) {
          console.warn('[useFujinMarkets] Factory not available:', (e as Error)?.message?.slice(0, 80));
          return { factoryId: fujinFactoryId, markets: [], numMarkets: 0, currentEpoch: 0, error: null };
        }
      }

      // devnet: use MasterFujin via alkanes_simulate (existing path)
      const masterId = (config as any).FUJIN_MASTER_ID;
      if (masterId) {
        return await fetchViaMasterFujin(rpcUrl, masterId);
      }
      return null;
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}

/**
 * Fetch via factory contract (regtest-local Docker).
 * Uses metashrew_view("simulate") protobuf — same approach as fuboku.
 */
async function fetchViaFactory(
  rpcUrl: string,
  factoryId: string,
  espoUrl?: string,
): Promise<FujinMarketsResult> {
  // 1. Get current epoch
  const epochResult = await simulateContract(rpcUrl, factoryId, FACTORY_GET_CURRENT_EPOCH);
  const epochData = extractField3Data(epochResult, 16);
  if (!epochData) {
    return { factoryId, markets: [], numMarkets: 0, currentEpoch: 0, error: 'Could not parse epoch' };
  }
  const currentEpoch = Number(parseU128LE(epochData, 0));

  // 2. Scan backwards to find initialized epochs (up to 5)
  const markets: FujinEpochPool[] = [];
  for (let e = currentEpoch; e >= 0 && markets.length < 5; e--) {
    const pool = await tryGetEpochPool(rpcUrl, factoryId, e);
    if (!pool) continue;

    const poolId = `${pool.block}:${pool.tx}`;
    const tokens = await getPoolTokens(rpcUrl, poolId);
    const reserves = await getPoolReserves(rpcUrl, poolId);
    const settlement = await getPoolSettlement(rpcUrl, poolId);

    markets.push({
      epoch: e,
      pool,
      long: tokens?.long || { block: 0, tx: 0 },
      short: tokens?.short || { block: 0, tx: 0 },
      reserves: reserves || undefined,
      settled: settlement?.settled,
      endHeight: settlement?.endHeight,
      startBits: settlement?.startBits,
      // epochLength = endHeight - epochStart (not fixed 2016; can span multiple epochs)
      epochLength: settlement?.endHeight ? settlement.endHeight - (e * EPOCH_LENGTH) : undefined,
    });
  }

  // 3. Optionally enrich with Espo data
  if (espoUrl && markets.length > 0) {
    try {
      const espoData = await espoCall(espoUrl, 'fujin.get_markets', { limit: 10 });
      if (espoData?.markets) {
        for (const m of markets) {
          const espoMarket = espoData.markets.find(
            (em: any) => String(em.epoch) === String(m.epoch)
          );
          if (espoMarket?.pool) {
            m.settled = espoMarket.pool.settled;
            m.blocksRemaining = espoMarket.pool.blocks_remaining;
          }
        }
      }
    } catch {
      // Espo optional — continue without enrichment
    }
  }

  return {
    factoryId,
    markets,
    numMarkets: markets.length,
    currentEpoch,
    error: null,
  };
}

/**
 * Fetch via MasterFujin (devnet path — existing logic).
 * Uses alkanes_simulate JSON-RPC.
 */
async function fetchViaMasterFujin(
  rpcUrl: string,
  masterId: string,
): Promise<FujinMarketsResult> {
  const [block, tx] = masterId.split(':');
  const target = { block, tx };

  // MasterFujin opcode 91: GetMarketCount
  const numResp = await fetch(rpcUrl, {
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
    return { factoryId: masterId, markets: [], numMarkets: 0, currentEpoch: 0, error: numExec.error };
  }

  const hexData = numExec?.data?.replace(/^0x/, '') || '';
  let numMarkets = 0;
  if (hexData.length >= 32) {
    numMarkets = Number(parseU128LE(hexData, 0));
  }

  if (numMarkets === 0) {
    return { factoryId: masterId, markets: [], numMarkets: 0, currentEpoch: 0, error: null };
  }

  // Query each market via opcode 92
  const markets: FujinEpochPool[] = [];
  for (let i = 0; i < numMarkets && i < 20; i++) {
    try {
      const idxResp = await fetch(rpcUrl, {
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
        if (hex.length >= 64) {
          const mBlock = Number(parseU128LE(hex, 0));
          const mTx = Number(parseU128LE(hex, 32));
          markets.push({
            epoch: i,
            pool: { block: mBlock, tx: mTx },
            long: { block: 0, tx: 0 },
            short: { block: 0, tx: 0 },
          });
        }
      }
    } catch {
      // skip failed market
    }
  }

  return { factoryId: masterId, markets, numMarkets, currentEpoch: 0, error: null };
}
