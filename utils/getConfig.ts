/**
 * Network configuration for Subfrost app
 *
 * All API calls should go through @alkanes/ts-sdk which is configured
 * with the correct URLs in AlkanesSDKContext. This config file only
 * contains static configuration values like contract IDs and block explorer URLs.
 */

// Subfrost API base URLs per network
export const SUBFROST_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  devnet: 'http://localhost:18888', // Intercepted by DevnetProvider fetch interceptor
};

// Block explorer URLs per network
export const BLOCK_EXPLORER_URLS: Record<string, string> = {
  mainnet: 'https://espo.subfrost.io/mainnet',
  testnet: 'https://espo.subfrost.io/testnet',
  signet: 'https://espo.subfrost.io/signet',
  regtest: 'https://espo.subfrost.io/regtest',
  'regtest-local': 'http://localhost:50010',
  'subfrost-regtest': 'https://espo.subfrost.io/regtest',
  oylnet: 'https://espo.subfrost.io/mainnet',
  devnet: '', // No external block explorer for devnet
};

/**
 * Returns true for networks that run on localhost and cannot use the remote
 * data API. On these networks, alkane balance queries must go through the
 * local RPC node (alkanes_protorunesbyaddress) instead of dataApiGetAlkanesByAddress.
 *  - 'devnet'       — in-browser WASM indexer (fetch interceptor), no server access
 *  - 'regtest-local' — Docker stack at localhost:18888, reachable by server proxy
 */
export function isLocalOnlyNetwork(network: string): boolean {
  return network === 'devnet' || network === 'regtest-local';
}

/**
 * Get the RPC URL for a network. For devnet, returns the localhost URL
 * that the fetch interceptor routes to the in-process server.
 * For other networks, returns the API proxy route.
 */
export function getRpcUrl(network: string): string {
  if (network === 'devnet') return 'http://localhost:18888';
  return `/api/rpc/${network}`;
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
        CARBINE_ORDER_TOKEN_ID: '4:80003',
        UNIVERSAL_ROUTER_ID: '4:70002',
        FIRE_POSITION_TOKEN_ID: '4:262',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: '',
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'regtest-local':
      // ---------------------------------------------------------------------------
      // Local docker stack — deploy-regtest.sh slot assignments (2026-04-15)
      // Run: cd ~/subfrost && docker compose up -d
      //      cd ~/Documents/github/alkanes-rs && bash scripts/deploy-regtest.sh
      // RPC: http://localhost:18888  (jsonrpc proxy)
      // Explorer: http://localhost:50010  (esplora)
      //
      // Contract slots match deploy-regtest.sh defaults:
      //   AMM_FACTORY_PROXY_TX   = 65522
      //   CARBINE_CONTROLLER_TX  = 8260
      //   CARBINE_TEMPLATE_TX    = 8202
      //   CARBINE_ORDER_TOKEN_TX = 8211  (order-token NFT)
      //   FRUSD_AUTH_TOKEN_TX    = 8200
      //   FRUSD_TOKEN_TX         = 8210  (patched, has name/symbol/decimals)
      //   DXBTC_TX               = 8270  (rebuilt from current source)
      //   FROST Token            = 0x1f13 = 7955
      //   vxFROST Gauge          = 0x1f14 = 7956
      //   Gauge Contract         = 100
      // ---------------------------------------------------------------------------
      return {
        ALKANE_FACTORY_ID: '4:65522',
        FRBTC_ALKANE_ID: '32:0',
        BUSD_ALKANE_ID: '2:0', // DIESEL — no bUSD on regtest-local
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRZEC_ALKANE_ID: '',
        FRETH_ALKANE_ID: '',
        // frUSD
        FRUSD_AUTH_TOKEN_ID: '4:8200',
        FRUSD_TOKEN_ID: '4:8210',
        // Carbine CLOB
        CARBINE_CONTROLLER_ID: '4:8260',
        CARBINE_TEMPLATE_ID: '4:8202',
        CARBINE_ORDER_TOKEN_ID: '4:8211',
        // DxBTC vault (current source build)
        DXBTC_VAULT_ID: '4:8270',
        // FROST / gauge
        FROST_TOKEN_ID: '4:7955',
        VXFROST_GAUGE_ID: '4:7956',
        GAUGE_ID: '4:100',
        // FIRE Protocol — Phase 13 of deploy-regtest.sh (2026-04-15)
        // Proxy slots: 256-261 | Impl slots: 10256-10261 | Position token: 262
        FIRE_TOKEN_ID: '4:256',
        FIRE_STAKING_ID: '4:257',
        FIRE_TREASURY_ID: '4:258',
        FIRE_BONDING_ID: '4:259',
        FIRE_REDEMPTION_ID: '4:260',
        FIRE_DISTRIBUTOR_ID: '4:261',
        FIRE_POSITION_TOKEN_ID: '4:262',
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
