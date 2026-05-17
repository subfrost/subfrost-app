/**
 * Network configuration for Subfrost app
 *
 * All API calls should go through @alkanes/ts-sdk which is configured
 * with the correct URLs in AlkanesSDKContext. This config file only
 * contains static configuration values like contract IDs and block explorer URLs.
 */

// Subfrost API base URLs per network
export const SUBFROST_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  testnet: 'https://testnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  signet: 'https://signet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  regtest: 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  oylnet: 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  devnet: 'http://localhost:18888', // Intercepted by DevnetProvider fetch interceptor
};

// Block explorer URLs per network
export const BLOCK_EXPLORER_URLS: Record<string, string> = {
  mainnet: 'https://espo.subfrost.io/mainnet',
  testnet: 'https://espo.subfrost.io/testnet',
  signet: 'https://espo.subfrost.io/signet',
  regtest: 'https://espo.subfrost.io/regtest',
  'regtest-local': 'http://localhost:50010',
  'qubitcoin-regtest': '', // No separate esplora — qubitcoin has it built-in
  'subfrost-regtest': 'https://espo.subfrost.io/regtest',
  oylnet: 'https://espo.subfrost.io/mainnet',
  devnet: '', // No external block explorer for devnet
};

/**
 * Get the RPC URL for a network. For devnet, returns the localhost URL
 * that the fetch interceptor routes to the in-process server.
 * For other networks, returns the API proxy route.
 *
 * Server-side note: Node `fetch` rejects relative paths ("Invalid URL").
 * Routes that run in the Next.js server runtime (e.g. `/api/wallet-state`
 * which fans out to `getCurrentTipHash`, `getHeight`, `getAddressUtxos`,
 * `metashrewView`, all of which live in `lib/alkanes/rpc.ts` and call
 * `getRpcUrl` to build their target URL) need an absolute self-call URL.
 * We hit 127.0.0.1 on the same instance's PORT so the routing logic in
 * `app/api/rpc/[[...segments]]/route.ts` stays the single source of
 * truth — no per-helper "if (server) hit upstream directly" branching.
 *
 * History (2026-05-17): `/api/wallet-state` was silently returning
 * `{utxos:[], height:null, tipHash:""}` for weeks because every helper
 * threw "Invalid URL" → was swallowed by per-call `.catch(() => 0)` /
 * `Promise.allSettled` failure shoulders. Surfaced when the swap path's
 * `cachedUtxos` ended up empty → utxo_source fell back to espo → the
 * SDK still ran provider.sync()'s 30s poll loop because alkanes_needed
 * was non-empty but prefetched_utxos was empty.
 */
export function getRpcUrl(network: string): string {
  if (network === 'devnet') return 'http://localhost:18888';
  const path = `/api/rpc/${network}`;
  if (typeof window === 'undefined') {
    const port = process.env.PORT || '3000';
    return `http://127.0.0.1:${port}${path}`;
  }
  return path;
}

export function getConfig(network: string) {
  const host = (typeof window !== 'undefined' && window.location?.host) || '';

  // Get API URL for network (defaults to mainnet)
  const apiUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;
  const blockExplorerUrl = BLOCK_EXPLORER_URLS[network] || BLOCK_EXPLORER_URLS.mainnet;

  switch (network) {
    case 'oylnet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '', // Deployed frZEC contract [4:n] — set after deployment
        FRETH_ALKANE_ID: '', // Deployed frETH contract [4:n] — set after deployment
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2082',
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2088',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '', // Deployed frZEC contract [4:n] — set after deployment
        FRETH_ALKANE_ID: '', // Deployed frETH contract [4:n] — set after deployment
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://sepolia.etherscan.io',
        BOUND_API_URL: 'https://signet.bound.money/api/v1',
      } as const;
    case 'regtest':
    case 'subfrost-regtest':
      return {
        ALKANE_FACTORY_ID: '4:65498',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '', // Deployed frZEC contract [4:n] — set after deployment on regtest
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'devnet':
      return {
        ALKANE_FACTORY_ID: '4:65498', // working factory — oyl-amm source build (65522 = old broken)
        BUSD_ALKANE_ID: '2:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '4:43520', // Deployed fr_zec.wasm at slot 0xAA00 on devnet
        FRETH_ALKANE_ID: '4:52224', // Deployed fr_eth.wasm at slot 0xCC00 on devnet
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        FUEL_TOKEN_ID: '4:7000',
        FTRBTC_TEMPLATE_ID: '4:7010',
        DXBTC_VAULT_ID: '4:7020',
        DXBTC_NORMAL_POOL_ID: '4:7021',
        VX_FUEL_GAUGE_ID: '4:7030',
        VX_BTCUSD_GAUGE_ID: '4:7031',
        SYNTH_POOL_ID: '4:8202',
        FRUSD_TOKEN_ID: '4:8201',
        FUJIN_FACTORY_ID: '4:7107',
        FUJIN_MASTER_ID: '4:7112',
        CARBINE_CONTROLLER_ID: '4:70000',
        CARBINE_TEMPLATE_ID: '4:70001',
        UNIVERSAL_ROUTER_ID: '4:70002',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: '',
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'regtest-local':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '',
        FRETH_ALKANE_ID: '',
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        FIRE_LP_TOKEN_ID: '2:3',
        // Fujin difficulty futures (DIESEL market)
        FUJIN_FACTORY_ID: '2:165',
        FUJIN_VAULT_ID: '2:167',
        FUJIN_ZAP_ID: '2:168',
        FUJIN_ESPO_URL: 'http://localhost:8082/rpc',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'qubitcoin-regtest':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '',
        FRETH_ALKANE_ID: '',
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'mainnet':
      if (host.startsWith('localhost') || host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_SPLITTER_ID: '4:76',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '', // Deployed frZEC contract [4:n] — set after deployment
        FRETH_ALKANE_ID: '', // Deployed frETH contract [4:n] — set after deployment
          DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
          FIRE_TOKEN_ID: '4:256',
          FIRE_STAKING_ID: '4:257',
          FIRE_TREASURY_ID: '4:258',
          FIRE_BONDING_ID: '4:259',
          FIRE_REDEMPTION_ID: '4:260',
          FIRE_DISTRIBUTOR_ID: '4:261',
          API_URL: apiUrl,
          BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
          BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
          BOUND_API_URL: 'https://api.bound.money/api/v1',
        } as const;
      }
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:56801',
        BUSD_SPLITTER_ID: '4:76',
        FRBTC_ALKANE_ID: '32:0',
        FRZEC_ALKANE_ID: '', // Deployed frZEC contract [4:n] — set after deployment
        FRETH_ALKANE_ID: '', // Deployed frETH contract [4:n] — set after deployment
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        BOUND_API_URL: 'https://api.bound.money/api/v1',
      } as const;
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:25982',
        FRBTC_ALKANE_ID: '',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:69997',
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      } as const;
  }
}
