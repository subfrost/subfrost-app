/**
 * useUserOrders.ts
 *
 * Read-only hook that queries a user's open limit orders from the Carbine controller.
 * Uses alkanes_simulate with opcode 25 (GetUserOrders).
 *
 * The controller returns a serialized list of orders as bytes. Each order is
 * encoded as 5 consecutive u128 values (80 bytes per order):
 *   - orderId (u128)
 *   - side (u128): 0 = buy, 1 = sell
 *   - price (u128): scaled price in quote tokens per base token
 *   - amount (u128): total base token amount
 *   - filled (u128): amount already filled
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

/** Parse a little-endian u128 from 16 bytes. Returns as string to avoid precision loss. */
function parseU128LE(bytes: number[], offset: number): string {
  if (!bytes || bytes.length < offset + 16) return '0';
  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value.toString();
}

/** Parse the full order list from simulation response data. */
function parseOrderList(data: number[]): UserOrder[] {
  if (!data || data.length === 0) return [];

  const BYTES_PER_ORDER = 80; // 5 u128 values = 5 * 16 bytes
  const orderCount = Math.floor(data.length / BYTES_PER_ORDER);
  const orders: UserOrder[] = [];

  for (let i = 0; i < orderCount; i++) {
    const base = i * BYTES_PER_ORDER;
    const orderIdStr = parseU128LE(data, base);
    const sideStr = parseU128LE(data, base + 16);
    const price = parseU128LE(data, base + 32);
    const amount = parseU128LE(data, base + 48);
    const filled = parseU128LE(data, base + 64);

    orders.push({
      orderId: Number(orderIdStr),
      side: Number(sideStr),
      price,
      amount,
      filled,
    });
  }

  return orders;
}

export function useUserOrders(enabled: boolean = true) {
  const { network, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const controllerId = (config as any).CARBINE_CONTROLLER_ID as string | undefined;

  const taprootAddress = account?.taproot?.address;

  return useQuery({
    queryKey: ['user-orders', controllerId, taprootAddress, network],
    enabled: enabled && !!controllerId && !!taprootAddress && isInitialized && !!provider,
    queryFn: async (): Promise<UserOrder[]> => {
      if (!provider || !controllerId || !taprootAddress) {
        throw new Error('Provider, config, or address not ready');
      }

      try {
        // Opcode 25: GetUserOrders
        // The user address is implicitly derived from the transaction context.
        // In simulation, we pass it via the context fields.
        const context = JSON.stringify({
          alkanes: [],
          calldata: encodeSimulateCalldata(controllerId, [25]),
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
          console.warn('[useUserOrders] Simulation error:', result.execution.error);
          return [];
        }

        if (result?.execution?.data) {
          const data = result.execution.data;
          // Handle both hex string and byte array response formats
          let bytes: number[];
          if (typeof data === 'string') {
            const hex = data.replace('0x', '');
            bytes = [];
            for (let i = 0; i < hex.length; i += 2) {
              bytes.push(parseInt(hex.substring(i, i + 2), 16));
            }
          } else if (Array.isArray(data)) {
            bytes = data;
          } else {
            console.warn('[useUserOrders] Unexpected data format:', typeof data);
            return [];
          }

          const orders = parseOrderList(bytes);
          console.log('[useUserOrders] Parsed', orders.length, 'orders');
          return orders;
        }

        return [];
      } catch (error) {
        console.error('[useUserOrders] Query failed:', error);
        return [];
      }
    },
    retry: 2,
    staleTime: 15_000, // 15s -- orders can change frequently
  });
}
