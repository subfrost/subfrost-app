import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

export interface SynthPoolState {
  poolId: string;
  hasLiquidity: boolean;
  reserveA: string;
  reserveB: string;
  feeRatePer1000: number;
  totalSupply: string;
  poolType: string;
}

/**
 * Parse a u128 from 16 little-endian bytes starting at offset
 */
function readU128LE(bytes: number[], offset: number): string {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value.toString();
}

/**
 * Simulate an alkanes call and return execution result
 */
async function simulateCall(
  network: string,
  target: { block: string; tx: string },
  inputs: string[],
): Promise<{ data?: string | number[]; error?: string } | null> {
  try {
    const resp = await fetch(`/api/rpc/${network}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{ target, inputs, alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
        id: 1,
      }),
    });
    const data = await resp.json();
    return data?.result?.execution || null;
  } catch {
    return null;
  }
}

/**
 * Convert hex string or number array to number array
 */
function toByteArray(data: string | number[]): number[] {
  if (Array.isArray(data)) return data;
  return Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'));
}

export function useSynthPoolState() {
  const { network } = useWallet();

  return useQuery<SynthPoolState | null>({
    queryKey: ['synth-pool-state', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      const poolId = (config as any).SYNTH_POOL_ID;
      if (!poolId) return null;

      const [block, tx] = poolId.split(':');
      const target = { block, tx };

      // Opcode 100: GetPoolState or general status check
      const stateExec = await simulateCall(network!, target, ['100']);
      const hasLiquidity = !!(stateExec && !stateExec.error);

      let reserveA = '0';
      let reserveB = '0';
      let feeRatePer1000 = 0;
      let totalSupply = '0';
      let poolType = 'unknown';

      // Opcode 97: GetReserves — returns two u128 values (reserveA, reserveB)
      try {
        const reservesExec = await simulateCall(network!, target, ['97']);
        if (reservesExec?.data && !reservesExec.error) {
          const bytes = toByteArray(reservesExec.data);
          if (bytes.length >= 32) {
            reserveA = readU128LE(bytes, 0);
            reserveB = readU128LE(bytes, 16);
          }
        }
      } catch (err) {
        console.warn('[useSynthPoolState] Failed to fetch reserves (opcode 97):', err);
      }

      // Opcode 20: GetTotalFee — returns fee per 1000 as u128
      try {
        const feeExec = await simulateCall(network!, target, ['20']);
        if (feeExec?.data && !feeExec.error) {
          const bytes = toByteArray(feeExec.data);
          if (bytes.length >= 16) {
            feeRatePer1000 = Number(readU128LE(bytes, 0));
          }
        }
      } catch (err) {
        console.warn('[useSynthPoolState] Failed to fetch fee rate (opcode 20):', err);
      }

      // Opcode 101: GetTotalSupply — returns total LP token supply as u128
      try {
        const supplyExec = await simulateCall(network!, target, ['101']);
        if (supplyExec?.data && !supplyExec.error) {
          const bytes = toByteArray(supplyExec.data);
          if (bytes.length >= 16) {
            totalSupply = readU128LE(bytes, 0);
          }
        }
      } catch (err) {
        console.warn('[useSynthPoolState] Failed to fetch total supply (opcode 101):', err);
      }

      // Determine pool type based on fee rate or reserves ratio
      // Synth pools typically have lower fees than AMM pools
      if (feeRatePer1000 <= 1) {
        poolType = 'stable';
      } else if (feeRatePer1000 <= 3) {
        poolType = 'synth';
      } else {
        poolType = 'volatile';
      }

      return {
        poolId,
        hasLiquidity,
        reserveA,
        reserveB,
        feeRatePer1000,
        totalSupply,
        poolType,
      };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
