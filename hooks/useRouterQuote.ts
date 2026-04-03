/**
 * useRouterQuote — Query the Universal Router for hybrid CLOB+AMM quotes.
 *
 * The Universal Router [4:70002] compares CLOB orderbook and AMM pool prices,
 * returning whichever source offers a better output amount.
 *
 * Quote opcode 2 returns:
 *   - 16 bytes LE: best output amount (u128)
 *   - 1 byte: source flag (1 = CLOB, 0 = AMM)
 *
 * Only active on devnet where CARBINE_CONTROLLER_ID and UNIVERSAL_ROUTER_ID
 * are configured. On mainnet/regtest this hook returns null (no-op).
 *
 * KNOWN CONTRACT ISSUE (2026-04-03 audit):
 * The router's get_clob_quote() returns `fillable` (min(amount_in, available))
 * which is in INPUT token units. It compares this against amm_out which is in
 * OUTPUT token units. These are different denominators, so the comparison
 * `clob_out > amm_out` is not a true price comparison — it's biased toward
 * whichever token has larger raw numbers. In practice, if CLOB has any buy
 * liquidity, the router will likely prefer it. This needs a contract fix to
 * compute actual output from the CLOB fill (price × fillable / 1e8).
 *
 * Source: reference/subfrost-alkanes/alkanes/universal-router/src/lib.rs:280-307
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';

export type RouterQuoteResult = {
  /** Best output amount in raw alks (u128) */
  amountOut: string;
  /** Which source provides the best price */
  source: 'clob' | 'amm';
};

/**
 * Parse the 17-byte response from router Quote opcode 2.
 * Format: [u128 LE amount_out (16 bytes), u8 source_flag (1 byte)]
 * source_flag: 1 = CLOB, 0 = AMM
 */
export function parseRouterQuoteResponse(hex: string): RouterQuoteResult | null {
  const clean = hex.replace(/^0x/, '');
  if (clean.length < 34) return null; // need at least 17 bytes = 34 hex chars

  // Parse u128 LE from first 16 bytes (32 hex chars)
  const amountHex = clean.slice(0, 32);
  const bytes = [];
  for (let i = 0; i < 32; i += 2) {
    bytes.push(parseInt(amountHex.slice(i, i + 2), 16));
  }
  // Convert LE bytes to BigInt
  let amountOut = BigInt(0);
  for (let i = bytes.length - 1; i >= 0; i--) {
    amountOut = (amountOut << BigInt(8)) | BigInt(bytes[i]);
  }

  // Source flag is byte 17 (hex chars 32-33)
  const sourceFlag = parseInt(clean.slice(32, 34), 16);
  const source: 'clob' | 'amm' = sourceFlag === 1 ? 'clob' : 'amm';

  return {
    amountOut: amountOut.toString(),
    source,
  };
}

/**
 * Fetch a router quote via alkanes_simulate (read-only, no tx needed).
 *
 * @param network   - Current network string
 * @param routerId  - Universal Router contract ID (e.g. "4:70002")
 * @param sellTokenId - Sell token in "block:tx" format
 * @param buyTokenId  - Buy token in "block:tx" format
 * @param amountIn    - Amount in raw alks (string)
 */
export async function fetchRouterQuote(
  network: string,
  routerId: string,
  sellTokenId: string,
  buyTokenId: string,
  amountIn: string,
): Promise<RouterQuoteResult | null> {
  const rpcUrl = getRpcUrl(network);
  const [routerBlock, routerTx] = routerId.split(':');
  const [sellBlock, sellTx] = sellTokenId.split(':');
  const [buyBlock, buyTx] = buyTokenId.split(':');

  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target: { block: routerBlock, tx: routerTx },
          inputs: ['2', sellBlock, sellTx, buyBlock, buyTx, amountIn],
          block_tag: 'latest',
        }],
        id: 1,
      }),
    });

    const json = await resp.json();
    const execution = json?.result?.execution;

    if (execution?.error) {
      console.warn('[useRouterQuote] Router quote error:', execution.error);
      return null;
    }

    if (!execution?.data) {
      return null;
    }

    return parseRouterQuoteResponse(execution.data);
  } catch (err) {
    console.warn('[useRouterQuote] Failed to fetch router quote:', err);
    return null;
  }
}

/**
 * React Query hook that fetches a hybrid CLOB+AMM quote from the Universal Router.
 *
 * Returns null when:
 * - Router is not configured for the current network
 * - The quote RPC call fails
 * - Amount is zero or invalid
 */
export function useRouterQuote(
  sellTokenId: string | undefined,
  buyTokenId: string | undefined,
  amountInAlks: string | undefined,
) {
  const { network } = useWallet();
  const config = getConfig(network);
  const routerId = (config as any).UNIVERSAL_ROUTER_ID as string | undefined;

  return useQuery<RouterQuoteResult | null>({
    queryKey: ['router-quote', network, routerId, sellTokenId, buyTokenId, amountInAlks],
    enabled: !!routerId && !!sellTokenId && !!buyTokenId && !!amountInAlks && amountInAlks !== '0',
    staleTime: 5_000,
    queryFn: async () => {
      if (!routerId || !sellTokenId || !buyTokenId || !amountInAlks) return null;
      return fetchRouterQuote(network, routerId, sellTokenId, buyTokenId, amountInAlks);
    },
  });
}
