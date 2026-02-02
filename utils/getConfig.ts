// OYL Alkanode API base URL for alkane balance queries
const OYL_ALKANODE_URL = process.env.NEXT_PUBLIC_OYL_ALKANODE_URL ?? 'https://oyl.alkanode.com';

export function getConfig(network: string) {
  const host = typeof window !== 'undefined' ? window.location.host : '';

  switch (network) {
    case 'oylnet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2082',
        OYL_API_URL:
          process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://ladder-chain-sieve.sandshrew.io',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2088',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://signet-api.oyl.gg',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://mempool.space/signet',
        BLOCK_EXPLORER_URL_ETH: 'https://sepolia.etherscan.io',
        BOUND_API_URL: 'https://signet.bound.money/api/v1',
      } as const;
    case 'regtest':
    case 'subfrost-regtest':
      return {
        ALKANE_FACTORY_ID: '4:65498',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0', // frBTC (hardcoded in indexer)
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'http://localhost:18888',
        OYL_ALKANODE_URL,
        API_URL: 'https://regtest.subfrost.io/v4/subfrost',
        BLOCK_EXPLORER_URL_BTC: 'http://localhost:50010',
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'regtest-local':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0', // frBTC (hardcoded in indexer)
        OYL_API_URL: 'http://localhost:18888',
        OYL_ALKANODE_URL,
        API_URL: 'http://localhost:4000',
        BLOCK_EXPLORER_URL_BTC: 'http://localhost:50010',
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'mainnet':
      if (host.startsWith('localhost') || host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_SPLITTER_ID: '4:76',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
          DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://staging-api.oyl.gg',
          OYL_ALKANODE_URL,
          BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
          BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
          BOUND_API_URL: 'https://api.bound.money/api/v1',
        } as const;
      }
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:56801',
        BUSD_SPLITTER_ID: '4:76',
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        BOUND_API_URL: 'https://api.bound.money/api/v1',
      } as const;
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:25982',
        FRBTC_ALKANE_ID: '',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:69997',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      } as const;
  }
}

// OYL Alkanode API types
export interface OylAlkaneBalance {
  name: string;
  symbol: string;
  balance: string;
  alkaneId: { block: string; tx: string };
  floorPrice?: number | string;
  frbtcPoolPriceInSats?: number | string;
  busdPoolPriceInUsd?: number | string;
  priceUsd?: number | string;
  priceInSatoshi?: number | string;
  tokenImage?: string | null;
  idClubMarketplace?: boolean;
}

// Espo RPC URL — essentials.get_address_balances lives here.
// oyl.alkanode.com/get-alkanes-by-address also runs on espo (oylapi module).
const ESPO_RPC_URL = process.env.NEXT_PUBLIC_ESPO_RPC_URL || 'https://api.alkanode.com/rpc';

/**
 * Fetch alkane token balances for an address.
 *
 * Strategy (ordered by priority):
 *   1. Espo essentials.get_address_balances (api.alkanode.com/rpc) — fast, clean format.
 *      Returns { balances: { "2:0": "amount", ... } }. Currently mainnet-only;
 *      rejects bcrt1 addresses with { ok: false, error: "invalid_address_format" }.
 *      When regtest espo is available, this will work for bcrt1 too.
 *   2. OYL Alkanode REST (oyl.alkanode.com/get-alkanes-by-address) — richer metadata
 *      (name, symbol, price). Also runs on espo (oylapi module). Mainnet-only.
 *   3. alkanes_protorunesbyaddress RPC — direct indexer query via /api/rpc proxy.
 *      Route chain: Browser → /api/rpc → regtest.subfrost.io → jsonrpc → metashrew
 *      Works for regtest (bcrt1). Universal fallback.
 */
export async function fetchAlkaneBalances(
  address: string,
  alkanodeUrl: string = OYL_ALKANODE_URL,
): Promise<OylAlkaneBalance[]> {
  // --- Priority 1: Espo essentials.get_address_balances ---
  // Espo returns balances quickly but with no token metadata (name, symbol, price).
  // When Espo succeeds, we enrich with OYL Alkanode metadata in the background.
  try {
    const espoResult = await fetchAlkaneBalancesViaEspo(address);
    if (espoResult.length > 0) {
      // Espo has no names — try to enrich from OYL Alkanode
      try {
        const response = await fetch(`${alkanodeUrl}/get-alkanes-by-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        if (response.ok) {
          const json = await response.json();
          const alkanodeData: OylAlkaneBalance[] = json.data ?? [];
          if (alkanodeData.length > 0) {
            // Build lookup: "block:tx" → metadata
            const metaMap = new Map<string, OylAlkaneBalance>();
            for (const item of alkanodeData) {
              metaMap.set(`${item.alkaneId.block}:${item.alkaneId.tx}`, item);
            }
            // Merge metadata into Espo results (Espo balances are authoritative)
            for (const entry of espoResult) {
              const key = `${entry.alkaneId.block}:${entry.alkaneId.tx}`;
              const meta = metaMap.get(key);
              if (meta) {
                entry.name = meta.name || entry.name;
                entry.symbol = meta.symbol || entry.symbol;
                entry.priceUsd = meta.priceUsd;
                entry.priceInSatoshi = meta.priceInSatoshi;
                entry.tokenImage = meta.tokenImage;
                entry.floorPrice = meta.floorPrice;
                entry.frbtcPoolPriceInSats = meta.frbtcPoolPriceInSats;
                entry.busdPoolPriceInUsd = meta.busdPoolPriceInUsd;
              }
            }
          }
        }
      } catch {
        // Enrichment failed — return Espo results with no metadata
      }
      return espoResult;
    }
  } catch {
    // Fall through to OYL Alkanode
  }

  // --- Priority 2: OYL Alkanode REST (oylapi on espo) ---
  try {
    const response = await fetch(`${alkanodeUrl}/get-alkanes-by-address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    if (response.ok) {
      const json = await response.json();
      const data = json.data ?? [];
      if (data.length > 0) return data;
    }
  } catch {
    // Fall through to RPC
  }

  // --- Priority 3: alkanes_protorunesbyaddress RPC (regtest/universal fallback) ---
  return fetchAlkaneBalancesViaRpc(address);
}

/**
 * Fetch alkane balances via espo essentials.get_address_balances.
 * Returns aggregated balances per alkane ID (no per-outpoint detail).
 *
 * Response format: { ok: true, address, balances: { "2:0": "30950001348973", ... } }
 * Error format:    { ok: false, error: "invalid_address_format" }
 */
async function fetchAlkaneBalancesViaEspo(address: string): Promise<OylAlkaneBalance[]> {
  const response = await fetch(ESPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'essentials.get_address_balances',
      params: { address },
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Espo HTTP error: ${response.status}`);
  }

  const json = await response.json();
  const result = json.result;

  // Espo returns { ok: false, error: "..." } for invalid/unsupported addresses
  if (!result?.ok || !result.balances) {
    throw new Error(result?.error || 'espo returned no balances');
  }

  const entries: OylAlkaneBalance[] = [];
  for (const [alkaneId, amount] of Object.entries(result.balances)) {
    const [block, tx] = alkaneId.split(':');
    entries.push({
      name: '',
      symbol: '',
      balance: String(amount),
      alkaneId: { block, tx },
    });
  }

  return entries;
}

/**
 * Fetch alkane balances via alkanes_protorunesbyaddress RPC.
 * Aggregates balances across all outpoints returned by the indexer.
 *
 * Route chain (browser):
 *   Browser → /api/rpc Next.js proxy → regtest.subfrost.io/v4/subfrost
 *     → jsonrpc pod (18888) → metashrew-0 indexer (8080)
 *
 * Route chain (server-side):
 *   Next.js server → regtest.subfrost.io/v4/subfrost directly
 */
async function fetchAlkaneBalancesViaRpc(address: string): Promise<OylAlkaneBalance[]> {
  const rpcUrl = typeof window !== 'undefined' ? '/api/rpc' : (
    process.env.REGTEST_RPC_URL || 'https://regtest.subfrost.io/v4/subfrost'
  );

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_protorunesbyaddress',
      params: [{ address }],
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const result = json.result;
  if (!result?.outpoints) return [];

  // Aggregate balances across all outpoints
  const balanceMap = new Map<string, bigint>();
  for (const outpoint of result.outpoints) {
    const balances = outpoint?.balance_sheet?.cached?.balances ?? [];
    for (const bal of balances) {
      const key = `${bal.block}:${bal.tx}`;
      const prev = balanceMap.get(key) ?? 0n;
      balanceMap.set(key, prev + BigInt(bal.amount));
    }
  }

  // Convert to OylAlkaneBalance format
  const entries: OylAlkaneBalance[] = [];
  for (const [alkaneId, amount] of balanceMap) {
    const [block, tx] = alkaneId.split(':');
    entries.push({
      name: '',
      symbol: '',
      balance: amount.toString(),
      alkaneId: { block, tx },
    });
  }

  return entries;
}


