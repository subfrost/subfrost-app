/**
 * useUserOrders.ts
 *
 * Queries the Carbine controller for open order data via the ts-sdk provider.
 *
 * Opcode 25 (GetOpenOrderCount): Returns the total number of open orders
 * for a given token pair. The response is a single u128 (16 bytes LE).
 *
 * NOTE: There is currently no per-user GetUserOrders opcode in the controller.
 * Simulation context has no sender identity, so the controller can't filter
 * by user. Once a per-user opcode is added to the WASM, the `orders` array
 * in the return value will be populated. Until then, only `count` is available.
 *
 * Inputs format: [25, baseBlock, baseTx, quoteBlock, quoteTx]
 * (matches e2e test: __tests__/devnet/e2e-carbine-clob.test.ts line 292-308)
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';

export interface UserOrder {
  orderId: number;
  side: number;
  price: string;
  amount: string;
  filled: string;
}

export interface UserOrdersResult {
  count: number;
  orders: UserOrder[];
}

/** Parse a little-endian u128 from 16 bytes at offset. */
function readU128LE(bytes: number[], offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

export function useUserOrders(
  baseTokenId?: string,
  quoteTokenId?: string,
  enabled: boolean = true,
) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const controllerId = (config as any).CARBINE_CONTROLLER_ID as string | undefined;

  return useQuery({
    queryKey: ['user-orders', controllerId, baseTokenId, quoteTokenId, network],
    enabled: enabled && !!controllerId && !!baseTokenId && !!quoteTokenId && !!network && isInitialized && !!provider,
    queryFn: async (): Promise<UserOrdersResult> => {
      if (!provider || !controllerId || !baseTokenId || !quoteTokenId) {
        return { count: 0, orders: [] };
      }

      try {
        // Build calldata: opcode 25 + pair token IDs
        const [baseBlock, baseTx] = baseTokenId.split(':').map(Number);
        const [quoteBlock, quoteTx] = quoteTokenId.split(':').map(Number);
        const calldata = encodeSimulateCalldata(controllerId, [25, baseBlock, baseTx, quoteBlock, quoteTx]);

        const context = JSON.stringify({
          alkanes: [],
          calldata,
          height: 1000000,
          txindex: 0,
          pointer: 0,
          refund_pointer: 0,
          vout: 0,
          transaction: [],
          block: [],
        });

        const result = await provider.alkanesSimulate(controllerId, context, 'latest');

        if (result?.execution?.error) {
          return { count: 0, orders: [] };
        }

        if (result?.execution?.data) {
          const data = result.execution.data;
          let bytes: number[];
          if (typeof data === 'string') {
            const hex = data.replace(/^0x/, '');
            if (hex.length < 32) return { count: 0, orders: [] };
            bytes = [];
            for (let i = 0; i < hex.length; i += 2) {
              bytes.push(parseInt(hex.substring(i, i + 2), 16));
            }
          } else if (Array.isArray(data)) {
            bytes = data;
          } else {
            return { count: 0, orders: [] };
          }

          // Parse as single u128 count (16 bytes LE)
          const count = bytes.length >= 16 ? Number(readU128LE(bytes, 0)) : 0;
          return { count, orders: [] };
        }

        return { count: 0, orders: [] };
      } catch (error) {
        console.error('[useUserOrders] Query failed:', error);
        return { count: 0, orders: [] };
      }
    },
    retry: 2,
    staleTime: 15_000,
  });
}
