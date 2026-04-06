/**
 * useLpTokenId — discovers the DIESEL/frBTC LP token ID from the AMM factory.
 *
 * Queries FindExistingPoolId (opcode 2) on the AMM factory contract with
 * DIESEL (2:0) and frBTC (32:0) as the pair. Returns the pool's AlkaneId
 * which IS the LP token ID.
 *
 * This replaces the hardcoded '2:6' which only works on specific boot sequences.
 * The pool ID varies per devnet boot depending on the sequence counter.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getRpcUrl, getConfig } from '@/utils/getConfig';

function readU64LE(hex: string, byteOffset: number): number {
  let val = 0n;
  for (let i = 0; i < 8; i++) {
    const pos = (byteOffset + i) * 2;
    const byte = parseInt(hex.substring(pos, pos + 2), 16);
    val |= BigInt(byte) << BigInt(i * 8);
  }
  return Number(val);
}

export function useLpTokenId() {
  const { network } = useWallet();
  const config = getConfig(network || 'mainnet');
  const factoryId = config.ALKANE_FACTORY_ID;

  return useQuery({
    queryKey: ['lp-token-id', factoryId, network],
    enabled: !!factoryId && !!network,
    staleTime: 60_000, // Pool ID doesn't change after boot
    queryFn: async (): Promise<string | null> => {
      if (!factoryId) return null;

      const [fBlock, fTx] = factoryId.split(':');
      const rpcUrl = getRpcUrl(network);

      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{
            target: { block: fBlock, tx: fTx },
            // FindExistingPoolId: opcode 2, args: DIESEL(2,0), frBTC(32,0)
            inputs: ['2', '2', '0', '32', '0'],
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: '999',
            txindex: 0,
            vout: 0,
          }],
          id: 1,
        }),
      });
      const json = await resp.json();
      const data = json?.result?.execution?.data?.replace('0x', '') || '';
      if (data.length < 64 || json?.result?.execution?.error) return null;

      const poolBlock = readU64LE(data, 0);
      const poolTx = readU64LE(data, 16);
      if (poolBlock === 0 && poolTx === 0) return null;

      return `${poolBlock}:${poolTx}`;
    },
  });
}
