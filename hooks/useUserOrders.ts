/**
 * useUserOrders — discovers open limit orders via ORD-{id} receipt tokens.
 *
 * Architecture: Order receipt tokens (ORD-{id}) are alkane NFTs minted to the
 * user's wallet on place_limit_order(). Each carries order metadata queryable
 * via GetAllDetails (opcode 23). We discover them via alkanes_protorunesbyaddress,
 * then staticcall each to read order details.
 *
 * This replaces the old approach that called opcode 25 (GetOpenOrderCount) which
 * only returned a global count, not per-user orders. The Carbine controller has
 * no per-user query — receipt tokens solve this.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getRpcUrl, getConfig } from '@/utils/getConfig';

export interface UserOrder {
  /** The order token's AlkaneId (e.g. "2:8") — needed for cancel */
  tokenId: string;
  orderId: number;
  side: number;
  price: string;
  amount: string;
  baseBlock: number;
  baseTx: number;
  quoteBlock: number;
  quoteTx: number;
}

function parseU128FromHex(hex: string, byteOffset: number): bigint {
  if (!hex || hex.length < (byteOffset + 16) * 2) return 0n;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    const pos = (byteOffset + i) * 2;
    bytes.push(parseInt(hex.substring(pos, pos + 2), 16));
  }
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

export function useUserOrders(enabled: boolean = true) {
  const { network, account, isConnected } = useWallet();
  const taprootAddress = account?.taproot?.address;
  const config = getConfig(network || 'mainnet');
  const controllerId = (config as any).CARBINE_CONTROLLER_ID as string | undefined;

  return useQuery({
    queryKey: ['user-orders', taprootAddress, controllerId, network],
    enabled: enabled && !!taprootAddress && !!controllerId && !!network && isConnected,
    staleTime: 15_000,
    queryFn: async (): Promise<UserOrder[]> => {
      if (!taprootAddress || !controllerId) return [];

      const rpcUrl = getRpcUrl(network);

      // Step 1: Find all alkane tokens at user's taproot address
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_protorunesbyaddress',
          params: [{ address: taprootAddress, protocolTag: '1' }],
          id: 1,
        }),
      });
      const json = await resp.json();

      // Step 2: Filter for order token candidates (block=2, amount=1)
      const candidates: Array<{ block: number; tx: number }> = [];
      for (const outpoint of json?.result?.outpoints || []) {
        const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
        for (const entry of balances) {
          const block = parseInt(entry.block ?? '0', 10);
          const tx = parseInt(entry.tx ?? '0', 10);
          const amount = parseInt(entry.amount || '0', 10);
          if (block === 2 && amount === 1) {
            candidates.push({ block, tx });
          }
        }
      }

      if (candidates.length === 0) return [];

      // Step 3: For each candidate, check if it's a registered order with the controller
      // and query GetAllDetails (opcode 23)
      const [ctrlBlock, ctrlTx] = controllerId.split(':');
      const orders: UserOrder[] = [];

      for (const cand of candidates) {
        try {
          // Check IsRegisteredOrder (opcode 26) on the controller
          const regResp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{
                target: { block: ctrlBlock, tx: ctrlTx },
                inputs: ['26', String(cand.block), String(cand.tx)],
                alkanes: [], transaction: '0x', block: '0x',
                height: '999', txindex: 0, vout: 0,
              }],
              id: 2,
            }),
          });
          const regJson = await regResp.json();
          const regData = regJson?.result?.execution?.data?.replace('0x', '') || '';
          if (!regData || regData.length < 32) continue;
          const isRegistered = parseU128FromHex(regData, 0);
          if (isRegistered !== 1n) continue;

          // Query GetAllDetails (opcode 23) on the order token
          const detailsResp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{
                target: { block: String(cand.block), tx: String(cand.tx) },
                inputs: ['23'],
                alkanes: [], transaction: '0x', block: '0x',
                height: '999', txindex: 0, vout: 0,
              }],
              id: 3,
            }),
          });
          const detailsJson = await detailsResp.json();
          const data = detailsJson?.result?.execution?.data?.replace('0x', '') || '';
          // 8 × u128 = 128 bytes = 256 hex chars
          if (data.length < 256) continue;

          orders.push({
            tokenId: `${cand.block}:${cand.tx}`,
            orderId: Number(parseU128FromHex(data, 0)),
            side: Number(parseU128FromHex(data, 16)),
            price: parseU128FromHex(data, 32).toString(),
            amount: parseU128FromHex(data, 48).toString(),
            baseBlock: Number(parseU128FromHex(data, 64)),
            baseTx: Number(parseU128FromHex(data, 80)),
            quoteBlock: Number(parseU128FromHex(data, 96)),
            quoteTx: Number(parseU128FromHex(data, 112)),
          });
        } catch {
          continue;
        }
      }

      return orders;
    },
    retry: 2,
  });
}
