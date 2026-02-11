import { useQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

/**
 * Position metadata fetched via SDK's espoGetKeys / espoGetAlkaneInfo.
 * Used to enrich staked position display with deposit token name and amount.
 *
 * For positions where name = "Position #N" and symbol = "POS-N", we fetch
 * /deposit-token-alkane-id and /deposit_amount from the on-chain key store
 * to show e.g. "DIESEL Position #73" and the actual deposit amount instead
 * of the generic "1 Position" label.
 *
 * JOURNAL ENTRY (2026-02-10):
 * Replaced raw essentials.get_keys and essentials.get_alkane_info fetch
 * calls with SDK espoGetKeys() and espoGetAlkaneInfo() methods.
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

// Convert Map instances (from WASM serde) to plain objects
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

async function fetchPositionKeys(
  provider: WebProvider,
  alkaneId: string,
): Promise<{ depositTokenId: string; depositAmount: string } | null> {
  const raw = await provider.espoGetKeys(alkaneId, 1, 10);
  const result = mapToObject(raw);
  const items = result?.items ?? result?.result?.items;
  if (!items) return null;

  const depositTokenEntry = items['/deposit-token-alkane-id'];
  const depositAmountEntry = items['/deposit_amount'];

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

async function fetchTokenInfoBatch(
  provider: WebProvider,
  tokenIds: string[],
): Promise<Record<string, { name: string; symbol: string; decimals: number }>> {
  if (tokenIds.length === 0) return {};

  const results = await Promise.all(
    tokenIds.map(async (id) => {
      try {
        const raw = await provider.espoGetAlkaneInfo(id);
        const info = mapToObject(raw);
        // Response may be wrapped in result or direct
        const data = info?.result ?? info;
        return {
          id,
          name: (data?.name || '').replace('SUBFROST BTC', 'frBTC'),
          symbol: data?.symbol || '',
          decimals: data?.decimals ?? 8,
        };
      } catch {
        return { id, name: '', symbol: '', decimals: 8 };
      }
    }),
  );

  const map: Record<string, { name: string; symbol: string; decimals: number }> = {};
  for (const r of results) {
    map[r.id] = { name: r.name, symbol: r.symbol, decimals: r.decimals };
  }
  return map;
}

/**
 * Fetch enriched metadata for staked positions.
 * Returns a map: positionAlkaneId → PositionMeta
 */
export function usePositionMetadata(alkanes: Array<{ alkaneId: string; name: string; symbol: string }> | undefined) {
  const { provider, isInitialized } = useAlkanesSDK();

  const positionIds = (alkanes || [])
    .filter((a) => isEnrichablePosition(a))
    .map((a) => a.alkaneId);

  return useQuery<Record<string, PositionMeta>>({
    queryKey: ['position-metadata', positionIds.sort().join(',')],
    enabled: positionIds.length > 0 && isInitialized && !!provider,
    queryFn: async () => {
      if (!provider) return {};
      const meta: Record<string, PositionMeta> = {};

      // Step 1: Fetch keys for each position in parallel
      const keysResults = await Promise.all(
        positionIds.map(async (id) => ({ id, result: await fetchPositionKeys(provider, id).catch(() => null) }))
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
      const tokenInfo = await fetchTokenInfoBatch(provider, Array.from(depositTokenIds));

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
