/**
 * useNormalPool — queries the volBTC pool for ftrBTC futures trading.
 *
 * The volBTC pool is a constant-product AMM where all ftrBTC instances
 * are valued by their intrinsic dxBTC share value (utilization-adjusted).
 * This enables trading between futures with different expiries/premiums.
 *
 * Opcodes:
 *   10: GetFtrValue(ftr_id) → u128 dxBTC value per token
 *   11: GetTotalPoolValue → u128 total pool value in dxBTC
 *   12: GetPoolHoldings → serialized list of ftrBTC instances held
 *   13: GetSwapQuote(ftr_in, ftr_out, amount) → u128 expected output
 *   99: GetName → string
 *  101: GetTotalSupply → u128 LP token supply
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

export interface NormalPoolState {
  poolId: string;
  totalValue: string;      // Total pool value in dxBTC shares
  totalSupply: string;      // LP token supply
  holdings: NormalPoolHolding[];
  hasLiquidity: boolean;
}

export interface NormalPoolHolding {
  ftrId: string;
  amount: string;
  dxBtcValue: string;
}

function readU128LE(bytes: number[], offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

export function useNormalPool() {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['normal-pool', network],
    queryFn: async (): Promise<NormalPoolState | null> => {
      if (!network) return null;

      const config = getConfig(network);
      const poolId = (config as any).DXBTC_NORMAL_POOL_ID;
      if (!poolId) return null;

      const [block, tx] = poolId.split(':');

      try {
        // Query total pool value (opcode 11)
        const valueResp = await fetch(`/api/rpc/${network}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alkanes_simulate',
            params: [{
              target: { block, tx },
              inputs: ['11'],
              alkanes: [],
              transaction: '0x',
              block: '0x',
              height: '999999',
              txindex: 0,
              vout: 0,
            }],
            id: 1,
          }),
        });
        const valueData = await valueResp.json();
        const valueExec = valueData?.result?.execution;

        if (valueExec?.error) {
          // Pool not deployed or not initialized
          return { poolId, totalValue: '0', totalSupply: '0', holdings: [], hasLiquidity: false };
        }

        let totalValue = '0';
        if (valueExec?.data) {
          const hex = valueExec.data.replace('0x', '');
          if (hex.length >= 32) {
            totalValue = readU128LE(Array.from(Buffer.from(hex, 'hex')), 0).toString();
          }
        }

        // Query total supply (opcode 101)
        const supplyResp = await fetch(`/api/rpc/${network}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alkanes_simulate',
            params: [{
              target: { block, tx },
              inputs: ['101'],
              alkanes: [],
              transaction: '0x',
              block: '0x',
              height: '999999',
              txindex: 0,
              vout: 0,
            }],
            id: 2,
          }),
        });
        const supplyData = await supplyResp.json();
        let totalSupply = '0';
        if (supplyData?.result?.execution?.data) {
          const hex = supplyData.result.execution.data.replace('0x', '');
          if (hex.length >= 32) {
            totalSupply = readU128LE(Array.from(Buffer.from(hex, 'hex')), 0).toString();
          }
        }

        // Query pool holdings (opcode 12)
        const holdingsResp = await fetch(`/api/rpc/${network}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alkanes_simulate',
            params: [{
              target: { block, tx },
              inputs: ['12'],
              alkanes: [],
              transaction: '0x',
              block: '0x',
              height: '999999',
              txindex: 0,
              vout: 0,
            }],
            id: 3,
          }),
        });
        const holdingsData = await holdingsResp.json();
        const holdings: NormalPoolHolding[] = [];

        if (holdingsData?.result?.execution?.data) {
          const hex = holdingsData.result.execution.data.replace('0x', '');
          const bytes = Array.from(Buffer.from(hex, 'hex'));

          if (bytes.length >= 16) {
            const count = Number(readU128LE(bytes, 0));
            // Each holding: 16 bytes block + 16 bytes tx + 16 bytes amount = 48 bytes
            for (let i = 0; i < count && 16 + i * 48 + 48 <= bytes.length; i++) {
              const offset = 16 + i * 48;
              const ftrBlock = Number(readU128LE(bytes, offset));
              const ftrTx = Number(readU128LE(bytes, offset + 16));
              const amount = readU128LE(bytes, offset + 32).toString();
              holdings.push({
                ftrId: `${ftrBlock}:${ftrTx}`,
                amount,
                dxBtcValue: '0', // Would need per-holding value query
              });
            }
          }
        }

        const hasLiquidity = BigInt(totalValue) > 0n;

        return { poolId, totalValue, totalSupply, holdings, hasLiquidity };
      } catch (err) {
        console.warn('[useNormalPool] Query failed:', err);
        return { poolId, totalValue: '0', totalSupply: '0', holdings: [], hasLiquidity: false };
      }
    },
    enabled: !!network,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
