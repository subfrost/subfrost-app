// Ethereum contract addresses for USDT/USDC bridge
export const ETHEREUM_CONTRACTS = {
  mainnet: {
    USDC_ADDRESS: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT_ADDRESS: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    CHAIN_ID: 1,
  },
  sepolia: {
    USDC_ADDRESS: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
    USDT_ADDRESS: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', // Sepolia USDT
    CHAIN_ID: 11155111,
  },
  regtest: {
    USDC_ADDRESS: process.env.NEXT_PUBLIC_REGTEST_USDC_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    USDT_ADDRESS: process.env.NEXT_PUBLIC_REGTEST_USDT_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    CHAIN_ID: 31337, // Anvil/Hardhat default chain ID
  },
} as const;

export function getConfig(network: string) {
  const host = typeof window !== 'undefined' ? window.location.host : '';

  switch (network) {
    case 'regtest':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0',
        BUSD_SPLITTER_ID: undefined,
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:0',
        VEDIESEL_VAULT_ID: '2:1',
        DXBTC_VAULT_ID: '2:2',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'http://localhost:3001',
        BLOCK_EXPLORER_URL_BTC: 'http://localhost:8080',
        BLOCK_EXPLORER_URL_ETH: 'http://localhost:8545',
        BOUND_API_URL: process.env.NEXT_PUBLIC_BOUND_API_URL ?? 'http://localhost:3002/api/v1',
        ETHEREUM_NETWORK: 'regtest',
      } as const;
    case 'oylnet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        BUSD_SPLITTER_ID: undefined,
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2082',
        VEDIESEL_VAULT_ID: '', // TODO: Add when available
        DXBTC_VAULT_ID: '', // TODO: Add when available
        OYL_API_URL:
          process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://ladder-chain-sieve.sandshrew.io',
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        ETHEREUM_NETWORK: 'mainnet',
      };
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        BUSD_SPLITTER_ID: undefined,
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2088',
        FRBTC_ALKANE_ID: '32:0',
        VEDIESEL_VAULT_ID: '', // TODO: Add when available
        DXBTC_VAULT_ID: '', // TODO: Add when available
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://signet-api.oyl.gg',
        BLOCK_EXPLORER_URL_BTC: 'https://mempool.space/signet',
        BLOCK_EXPLORER_URL_ETH: 'https://sepolia.etherscan.io',
        BOUND_API_URL: 'https://signet.bound.money/api/v1',
        ETHEREUM_NETWORK: 'sepolia',
      } as const;
    case 'mainnet':
      if (host.startsWith('localhost') || host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_SPLITTER_ID: '4:76',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
          DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
          VEDIESEL_VAULT_ID: '', // TODO: Add when available
          DXBTC_VAULT_ID: '', // TODO: Add when available
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://staging-api.oyl.gg',
          BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
          BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
          BOUND_API_URL: 'https://api.bound.money/api/v1',
          ETHEREUM_NETWORK: 'mainnet',
        } as const;
      }
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:56801',
        BUSD_SPLITTER_ID: '4:76',
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
        VEDIESEL_VAULT_ID: '', // TODO: Add when available
        DXBTC_VAULT_ID: '', // TODO: Add when available
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        BOUND_API_URL: 'https://api.bound.money/api/v1',
        ETHEREUM_NETWORK: 'mainnet',
      } as const;
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:25982',
        BUSD_SPLITTER_ID: undefined,
        FRBTC_ALKANE_ID: '',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:69997',
        VEDIESEL_VAULT_ID: '', // TODO: Add when available
        DXBTC_VAULT_ID: '', // TODO: Add when available
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        ETHEREUM_NETWORK: 'mainnet',
      } as const;
  }
}


