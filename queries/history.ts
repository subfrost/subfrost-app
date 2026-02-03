/**
 * History query options.
 *
 * - ammTxHistory: infinite query for AMM activity feed
 * - transactionHistory: converted from useEffect to useQuery
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import type { EnrichedTransaction } from '@/hooks/useTransactionHistory';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// ---------------------------------------------------------------------------
// Transaction history (was useEffect+setState, now useQuery)
// ---------------------------------------------------------------------------

function mapToObject(item: any): any {
  if (item instanceof Map) {
    const obj: any = {};
    item.forEach((value: any, key: any) => { obj[key] = mapToObject(value); });
    return obj;
  }
  if (Array.isArray(item)) return item.map(mapToObject);
  return item;
}

export function transactionHistoryQueryOptions(
  network: string,
  address: string | undefined,
  provider: WebProvider | null,
  isInitialized: boolean,
  excludeCoinbase: boolean = true,
) {
  return queryOptions<EnrichedTransaction[]>({
    queryKey: queryKeys.history.transactions(network, address || ''),
    enabled: !!address && !!provider && isInitialized,
    queryFn: async (): Promise<EnrichedTransaction[]> => {
      if (!address || !provider) return [];

      const rawTxs = await provider.getAddressTxsWithTraces(address, excludeCoinbase);
      const txList = (rawTxs || []).map(mapToObject);
      const parsedTxs: EnrichedTransaction[] = [];

      for (const tx of txList) {
        if (!tx?.txid) continue;
        const vin = tx.vin || [];
        const vout = tx.vout || [];
        const isCoinbase = vin.some((v: any) => v.is_coinbase);

        parsedTxs.push({
          txid: tx.txid,
          blockHeight: tx.status?.block_height,
          blockTime: tx.status?.block_time,
          confirmed: tx.status?.confirmed || false,
          fee: tx.fee,
          weight: tx.weight,
          size: tx.size,
          inputs: vin.map((inp: any) => ({
            txid: inp.txid,
            vout: inp.vout,
            address: inp.prevout?.scriptpubkey_address || '',
            amount: inp.prevout?.value || 0,
            isCoinbase: inp.is_coinbase || false,
          })),
          outputs: vout.map((out: any) => ({
            address: out.scriptpubkey_address || '',
            amount: out.value || 0,
            scriptPubKey: out.scriptpubkey || '',
            scriptPubKeyType: out.scriptpubkey_type || '',
          })),
          hasOpReturn: vout.some((v: any) => v.scriptpubkey_type === 'op_return'),
          hasProtostones: !!(tx.runestone?.protostones?.length > 0),
          isRbf: vin.some((v: any) => v.sequence < 0xfffffffe),
          isCoinbase,
          runestone: tx.runestone,
          alkanesTraces: tx.alkanes_traces || [],
        });
      }

      return parsedTxs;
    },
  });
}
