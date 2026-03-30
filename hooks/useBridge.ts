/**
 * useBridge — Query bridge state for cross-chain BTC <-> USDT/USDC operations
 *
 * Queries:
 *   - frUSD total supply via opcode 3
 *   - Pending bridges via opcode 6 (GetPendingBridges)
 *   - Synth pool reserves via opcode 97
 *   - Synth pool fee via opcode 20
 *
 * Contract: frUSD token [4:8201], Synth pool [4:8202]
 *
 * JOURNAL (2026-03-22): Initial implementation for bridge UI.
 * The bridge flow is:
 *   USDT -> deposit on EVM -> coordinator mints frUSD on Bitcoin -> synth pool swaps frUSD -> frBTC -> unwrap to BTC
 *   BTC -> wrap -> frBTC -> synth pool swaps frBTC -> frUSD -> burn frUSD with BurnAndBridge -> coordinator withdraws USDT on EVM
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';

// ---- Bridge protocol constants ----

/** Protocol fee: 0.1% (1 per 1000) */
export const BRIDGE_PROTOCOL_FEE_PER_1000 = 1;

/** USDC uses 6 decimals, frUSD uses 18 decimals */
export const USDC_DECIMALS = 6;
export const FRUSD_DECIMALS = 18;

/** Cross-chain token identifiers */
export const BRIDGE_TOKEN_IDS = ['usdt', 'usdc'] as const;
export type BridgeTokenId = typeof BRIDGE_TOKEN_IDS[number];

// ---- Parsing helpers ----

function readU128LE(bytes: number[], offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

function toByteArray(data: string | number[]): number[] {
  if (Array.isArray(data)) return data;
  return Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'));
}

async function simulateCall(
  network: string,
  target: { block: string; tx: string },
  inputs: string[],
): Promise<{ data?: string | number[]; error?: string } | null> {
  try {
    const resp = await fetch(getRpcUrl(network), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target, inputs, alkanes: [],
          transaction: '0x', block: '0x',
          height: '999999', txindex: 0, vout: 0,
        }],
        id: 1,
      }),
    });
    const data = await resp.json();
    return data?.result?.execution || null;
  } catch {
    return null;
  }
}

// ---- Types ----

export interface PendingBridge {
  bridgeId: string;
  amount: string;
  evmRecipient: string;
  status: 'pending' | 'processing' | 'completed';
}

export interface BridgeState {
  /** frUSD total supply in 18-decimal base units */
  frusdSupply: string;
  /** Number of pending burn-and-bridge requests */
  pendingBridges: PendingBridge[];
  /** Synth pool reserves: frBTC and frUSD */
  synthPoolState: {
    reserveFrbtc: string;
    reserveFrusd: string;
    feeRatePer1000: number;
    hasLiquidity: boolean;
  };
  /** Whether bridge infrastructure is available on this network */
  isAvailable: boolean;
}

// ---- Conversion helpers (exported for use in components and tests) ----

/**
 * Convert USDC amount (6 decimals) to frUSD amount (18 decimals).
 * E.g., "1000000" (1 USDC) -> "1000000000000000000" (1 frUSD)
 */
export function usdcToFrusd(usdcAmount: string): string {
  const factor = BigInt(10) ** BigInt(FRUSD_DECIMALS - USDC_DECIMALS);
  return (BigInt(usdcAmount) * factor).toString();
}

/**
 * Convert frUSD amount (18 decimals) to USDC amount (6 decimals).
 * E.g., "1000000000000000000" (1 frUSD) -> "1000000" (1 USDC)
 */
export function frusdToUsdc(frusdAmount: string): string {
  const factor = BigInt(10) ** BigInt(FRUSD_DECIMALS - USDC_DECIMALS);
  return (BigInt(frusdAmount) / factor).toString();
}

/**
 * Apply protocol fee (0.1%) and return net + fee amounts.
 */
export function applyProtocolFee(amount: string): { net: string; fee: string } {
  const total = BigInt(amount);
  const fee = total / BigInt(1000); // 0.1%
  const net = total - fee;
  return { net: net.toString(), fee: fee.toString() };
}

/**
 * Calculate expected BTC output for a given USDC/USDT input amount.
 * Path: USDC -> frUSD (decimal conversion) -> frBTC (synth pool) -> BTC (unwrap)
 *
 * @param inputUsdcRaw - Input amount in USDC 6-decimal base units
 * @param reserveFrbtc - Synth pool frBTC reserve (18-dec)
 * @param reserveFrusd - Synth pool frUSD reserve (18-dec)
 * @param poolFeePer1000 - Pool fee rate per 1000
 * @returns Expected BTC output in sats (frBTC base units)
 */
export function calculateBridgeOutput(
  inputUsdcRaw: string,
  reserveFrbtc: string,
  reserveFrusd: string,
  poolFeePer1000: number,
): string {
  // 1. Apply protocol fee
  const { net: netUsdc } = applyProtocolFee(inputUsdcRaw);

  // 2. Convert USDC to frUSD (6-dec -> 18-dec)
  const frusdAmount = BigInt(usdcToFrusd(netUsdc));

  // 3. Constant-product swap: frUSD -> frBTC
  const rFrbtc = BigInt(reserveFrbtc);
  const rFrusd = BigInt(reserveFrusd);
  if (rFrbtc === 0n || rFrusd === 0n) return '0';

  // Apply pool fee
  const feeMultiplier = BigInt(1000 - poolFeePer1000);
  const amountInWithFee = frusdAmount * feeMultiplier;
  const numerator = amountInWithFee * rFrbtc;
  const denominator = rFrusd * 1000n + amountInWithFee;
  const frbtcOut = numerator / denominator;

  return frbtcOut.toString();
}

/**
 * Calculate expected USDC output for a given BTC input.
 * Path: BTC -> frBTC (wrap) -> frUSD (synth pool) -> USDC (bridge)
 */
export function calculateReverseBridgeOutput(
  inputSats: string,
  reserveFrbtc: string,
  reserveFrusd: string,
  poolFeePer1000: number,
): string {
  const frbtcIn = BigInt(inputSats);
  const rFrbtc = BigInt(reserveFrbtc);
  const rFrusd = BigInt(reserveFrusd);
  if (rFrbtc === 0n || rFrusd === 0n) return '0';

  // Swap frBTC -> frUSD via synth pool
  const feeMultiplier = BigInt(1000 - poolFeePer1000);
  const amountInWithFee = frbtcIn * feeMultiplier;
  const numerator = amountInWithFee * rFrusd;
  const denominator = rFrbtc * 1000n + amountInWithFee;
  const frusdOut = numerator / denominator;

  // Apply protocol fee
  const { net: netFrusd } = applyProtocolFee(frusdOut.toString());

  // Convert frUSD to USDC (18-dec -> 6-dec)
  return frusdToUsdc(netFrusd);
}

/**
 * Generate a deposit address for USDC/USDT deposits.
 * In production, this would come from the coordinator.
 * For devnet/testing, returns a static address.
 */
export function getDepositAddress(network: string): string {
  // Static deposit address for dev/test environments
  return '0x59f57b84d6742acdaa56e9da1c770898e4a270b6';
}

// ---- Main hook ----

export function useBridgeState() {
  const { network } = useWallet();

  return useQuery<BridgeState | null>({
    queryKey: ['bridge-state', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      const frusdTokenId = (config as any).FRUSD_TOKEN_ID;
      const synthPoolId = (config as any).SYNTH_POOL_ID;

      if (!frusdTokenId || !synthPoolId) {
        return {
          frusdSupply: '0',
          pendingBridges: [],
          synthPoolState: {
            reserveFrbtc: '0',
            reserveFrusd: '0',
            feeRatePer1000: 0,
            hasLiquidity: false,
          },
          isAvailable: false,
        };
      }

      const [frusdBlock, frusdTx] = frusdTokenId.split(':');
      const [poolBlock, poolTx] = synthPoolId.split(':');
      const frusdTarget = { block: frusdBlock, tx: frusdTx };
      const poolTarget = { block: poolBlock, tx: poolTx };

      // Query frUSD total supply (opcode 3)
      let frusdSupply = '0';
      try {
        const supplyExec = await simulateCall(network!, frusdTarget, ['3']);
        if (supplyExec?.data && !supplyExec.error) {
          const bytes = toByteArray(supplyExec.data);
          if (bytes.length >= 16) {
            frusdSupply = readU128LE(bytes, 0).toString();
          }
        }
      } catch (err) {
      }

      // Query pending bridges (opcode 6)
      const pendingBridges: PendingBridge[] = [];
      try {
        const bridgesExec = await simulateCall(network!, frusdTarget, ['6']);
        if (bridgesExec?.data && !bridgesExec.error) {
          const bytes = toByteArray(bridgesExec.data);
          if (bytes.length >= 16) {
            const count = Number(readU128LE(bytes, 0));
            let offset = 16;
            for (let i = 0; i < count && offset + 48 <= bytes.length; i++) {
              // Each bridge record: u128 amount (16 bytes) + 20 bytes EVM address + 12 bytes padding
              const amount = readU128LE(bytes, offset).toString();
              offset += 16;
              const evmAddrBytes = bytes.slice(offset, offset + 20);
              const evmRecipient = '0x' + evmAddrBytes.map(b => b.toString(16).padStart(2, '0')).join('');
              offset += 32; // 20 bytes addr + 12 bytes padding
              pendingBridges.push({
                bridgeId: `bridge-${i}`,
                amount,
                evmRecipient,
                status: 'pending',
              });
            }
          }
        }
      } catch (err) {
      }

      // Query synth pool reserves (opcode 97)
      let reserveFrbtc = '0';
      let reserveFrusd = '0';
      let feeRatePer1000 = 0;
      let hasLiquidity = false;

      try {
        const reservesExec = await simulateCall(network!, poolTarget, ['97']);
        if (reservesExec?.data && !reservesExec.error) {
          const bytes = toByteArray(reservesExec.data);
          if (bytes.length >= 32) {
            reserveFrbtc = readU128LE(bytes, 0).toString();
            reserveFrusd = readU128LE(bytes, 16).toString();
            hasLiquidity = BigInt(reserveFrbtc) > 0n && BigInt(reserveFrusd) > 0n;
          }
        }
      } catch (err) {
      }

      // Query synth pool fee (opcode 20)
      try {
        const feeExec = await simulateCall(network!, poolTarget, ['20']);
        if (feeExec?.data && !feeExec.error) {
          const bytes = toByteArray(feeExec.data);
          if (bytes.length >= 16) {
            feeRatePer1000 = Number(readU128LE(bytes, 0));
          }
        }
      } catch (err) {
      }

      return {
        frusdSupply,
        pendingBridges,
        synthPoolState: {
          reserveFrbtc,
          reserveFrusd,
          feeRatePer1000,
          hasLiquidity,
        },
        isAvailable: true,
      };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
