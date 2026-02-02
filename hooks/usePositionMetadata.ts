import { useQuery } from '@tanstack/react-query';

/**
 * Position metadata fetched from essentials.get_keys RPC.
 * Used to enrich staked position display with deposit token name and amount.
 *
 * For positions where name = "Position #N" and symbol = "POS-N", we fetch
 * /deposit-token-alkane-id and /deposit_amount from the on-chain key store
 * to show e.g. "DIESEL Position #73" and the actual deposit amount instead
 * of the generic "1 Position" label.
 */
export interface PositionMeta {
  depositTokenId: string;
  depositTokenName: string;
  depositTokenSymbol: string;
  depositAmount: string; // raw u128 as string
  depositTokenDecimals: number;
}

const POSITION_NAME_RE = /^Position #\d+$/;
const POSITION_SYM_RE = /^POS-\d+$/;

/** Detect whether an alkane is a staked position that should be enriched. */
export function isEnrichablePosition(alkane: { name: string; symbol: string }): boolean {
  return POSITION_NAME_RE.test(alkane.name) && POSITION_SYM_RE.test(alkane.symbol);
}

/** Parse two little-endian u128 values from a 32-byte hex string into "block:tx" */
function parseAlkaneIdFromHex(hex: string): string | null {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 64) return null;
  const block = parseU128LE(clean.slice(0, 32));
  const tx = parseU128LE(clean.slice(32, 64));
  return `${block}:${tx}`;
}

function parseU128LE(hex: string): bigint {
  const bytes: string[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(hex.slice(i, i + 2));
  }
  bytes.reverse();
  return BigInt('0x' + bytes.join(''));
}

interface GetKeysResult {
  items: Record<string, { value_hex?: string; value_u128?: string | null }>;
}

async function fetchPositionKeys(alkaneId: string): Promise<{ depositTokenId: string; depositAmount: string } | null> {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'essentials.get_keys',
      params: { alkane: alkaneId, limit: 10, page: 1, try_decode_utf8: true },
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const result: GetKeysResult | undefined = json?.result;
  if (!result?.items) return null;

  const depositTokenEntry = result.items['/deposit-token-alkane-id'];
  const depositAmountEntry = result.items['/deposit_amount'];

  if (!depositTokenEntry?.value_hex) return null;

  const depositTokenId = parseAlkaneIdFromHex(depositTokenEntry.value_hex);
  if (!depositTokenId) return null;

  // Use value_u128 if available, otherwise parse from hex
  let depositAmount = '0';
  if (depositAmountEntry?.value_u128) {
    depositAmount = depositAmountEntry.value_u128;
  } else if (depositAmountEntry?.value_hex) {
    const clean = depositAmountEntry.value_hex.startsWith('0x')
      ? depositAmountEntry.value_hex.slice(2)
      : depositAmountEntry.value_hex;
    depositAmount = parseU128LE(clean).toString();
  }

  return { depositTokenId, depositAmount };
}

async function fetchTokenInfoBatch(tokenIds: string[]): Promise<Record<string, { name: string; symbol: string; decimals: number }>> {
  if (tokenIds.length === 0) return {};

  const batch = tokenIds.map((id, i) => ({
    jsonrpc: '2.0',
    id: i,
    method: 'essentials.get_alkane_info',
    params: { alkane: id },
  }));

  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (!res.ok) return {};
  const results: Array<{ id: number; result?: { name?: string; symbol?: string; decimals?: number }; error?: any }> = await res.json();

  const map: Record<string, { name: string; symbol: string; decimals: number }> = {};
  for (const r of results) {
    const tokenId = tokenIds[r.id];
    if (!tokenId || !r.result) continue;
    map[tokenId] = {
      name: (r.result.name || '').replace('SUBFROST BTC', 'frBTC'),
      symbol: r.result.symbol || '',
      decimals: r.result.decimals ?? 8,
    };
  }
  return map;
}

/**
 * Fetch enriched metadata for staked positions.
 * Returns a map: positionAlkaneId → PositionMeta
 */
export function usePositionMetadata(alkanes: Array<{ alkaneId: string; name: string; symbol: string }> | undefined) {
  const positionIds = (alkanes || [])
    .filter((a) => isEnrichablePosition(a))
    .map((a) => a.alkaneId);

  return useQuery<Record<string, PositionMeta>>({
    queryKey: ['position-metadata', positionIds.sort().join(',')],
    enabled: positionIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const meta: Record<string, PositionMeta> = {};

      // Step 1: Fetch keys for each position in parallel
      const keysResults = await Promise.all(
        positionIds.map(async (id) => ({ id, result: await fetchPositionKeys(id) }))
      );

      // Collect unique deposit token IDs
      const depositTokenIds = new Set<string>();
      const positionKeyMap = new Map<string, { depositTokenId: string; depositAmount: string }>();
      for (const { id, result } of keysResults) {
        if (!result) continue;
        positionKeyMap.set(id, result);
        depositTokenIds.add(result.depositTokenId);
      }

      // Step 2: Batch-fetch deposit token info
      const tokenInfo = await fetchTokenInfoBatch(Array.from(depositTokenIds));

      // Step 3: Assemble metadata
      for (const [posId, keys] of positionKeyMap) {
        const info = tokenInfo[keys.depositTokenId];
        meta[posId] = {
          depositTokenId: keys.depositTokenId,
          depositTokenName: info?.name || keys.depositTokenId,
          depositTokenSymbol: info?.symbol || '',
          depositAmount: keys.depositAmount,
          depositTokenDecimals: info?.decimals ?? 8,
        };
      }

      return meta;
    },
  });
}
