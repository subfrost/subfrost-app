// Vault configuration data
export interface VaultConfig {
  id: string;
  name: string;
  description: string;
  tokenId: string; // Alkane ID like "2:0"
  tokenSymbol: string;
  iconPath?: string; // Direct path to token icon (e.g., "/tokens/btc_snowflake.svg")
  contractAddress: string;
  badge?: string;
  type: 'unit-vault';
  inputAsset: string;
  outputAsset: string;
  estimatedApy?: string;
  historicalApy?: string;
  apyHistory?: number[]; // 30-day APY history for sparkline
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
  // Boost configuration
  hasBoost: boolean;
  boostTokenSymbol?: string; // e.g., "vxDIESEL"
  boostTokenName?: string;
  boostMultiplier?: number; // Boost multiplier value (e.g., 1.5 for 1.5x)
  isBoostComingSoon?: boolean; // For FROST-based boosts
  escrowNftName?: string; // For special vaults like dxBTC
}

export const AVAILABLE_VAULTS: VaultConfig[] = [
  {
    id: 'yv-frbtc',
    name: 'yvfrBTC Vault',
    description: 'Earn yield on frBTC',
    tokenId: '32:0',
    tokenSymbol: 'frBTC',
    contractAddress: '4:7937', // yv-fr-btc Vault at [4, 0x1f01] = [4, 7937]
    badge: 'BTC Yield',
    type: 'unit-vault',
    inputAsset: 'frBTC',
    outputAsset: 'yvfrBTC',
    estimatedApy: '4.2',
    apyHistory: [3.8, 3.9, 4.0, 3.9, 4.1, 4.2, 4.0, 4.1, 4.3, 4.2, 4.1, 4.0, 4.2, 4.3, 4.1, 4.0, 4.2, 4.3, 4.4, 4.2, 4.1, 4.3, 4.2, 4.1, 4.0, 4.2, 4.3, 4.1, 4.2, 4.2],
    riskLevel: 'medium',
    hasBoost: false, // No boost for yvfrBTC
  },
  {
    id: 've-diesel',
    name: 'veDIESEL Vault',
    description: 'Stake DIESEL for boosted yield',
    tokenId: '2:0',
    tokenSymbol: 'DIESEL',
    iconPath: 'https://asset.oyl.gg/alkanes/mainnet/2-0.png',
    contractAddress: '0xBe53A1...F6204',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'DIESEL',
    outputAsset: 'veDIESEL',
    estimatedApy: '21',
    apyHistory: [18, 19, 20, 22, 21, 23, 24, 22, 20, 19, 21, 22, 23, 21, 20, 22, 23, 24, 22, 21, 20, 21, 22, 23, 21, 20, 21, 22, 21, 21],
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxDIESEL',
    boostTokenName: 'Staked DIESEL Gauge',
    boostMultiplier: 1.5,
  },
  {
    id: 've-ordi',
    name: 'veORDI Vault',
    description: 'Stake ORDI for boosted yield',
    tokenId: 'ordi',
    tokenSymbol: 'ORDI',
    iconPath: '/tokens/ordi.svg',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'ORDI',
    outputAsset: 'veORDI',
    estimatedApy: '24',
    apyHistory: [22, 23, 24, 25, 24, 23, 22, 24, 25, 26, 24, 23, 24, 25, 24, 23, 24, 25, 26, 25, 24, 23, 24, 25, 24, 23, 24, 25, 24, 24],
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxORDI',
    boostTokenName: 'Staked ORDI Gauge',
    boostMultiplier: 1.5,
  },
  {
    id: 've-usd',
    name: 'veUSD Vault',
    description: 'Stake USD for boosted yield',
    tokenId: 'usdt_snowflake',
    tokenSymbol: 'USD',
    iconPath: '/tokens/usdt_snowflake.svg',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'bUSD',
    outputAsset: 'veUSD',
    estimatedApy: '3.8',
    apyHistory: [3.5, 3.6, 3.7, 3.6, 3.7, 3.8, 3.7, 3.8, 3.9, 3.8, 3.7, 3.8, 3.9, 3.8, 3.7, 3.8, 3.9, 3.8, 3.7, 3.8, 3.9, 3.8, 3.7, 3.8, 3.9, 3.8, 3.7, 3.8, 3.8, 3.8],
    riskLevel: 'low',
    hasBoost: true,
    boostTokenSymbol: 'vxUSD',
    boostTokenName: 'Staked USD Gauge',
    boostMultiplier: 1.5,
  },
  {
    id: 'dx-btc',
    name: 'dxBTC Token',
    description: 'Stake BTC or frBTC for pure BTC yield',
    tokenId: '32:0', // Use frBTC icon (dxBTC = yvfrBTC + derivatives obligations)
    tokenSymbol: 'BTC',
    iconPath: '/tokens/btc_snowflake.svg',
    contractAddress: '4:7936', // dxBTC at [4, 0x1f00] = [4, 7936]
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'BTC',
    outputAsset: 'dxBTC',
    estimatedApy: '5.2',
    apyHistory: [4.8, 4.9, 5.0, 5.1, 5.0, 5.2, 5.1, 5.0, 5.2, 5.3, 5.2, 5.1, 5.0, 5.2, 5.3, 5.2, 5.1, 5.2, 5.3, 5.2, 5.1, 5.2, 5.3, 5.2, 5.1, 5.2, 5.3, 5.2, 5.2, 5.2],
    riskLevel: 'medium',
    hasBoost: true,
    boostTokenSymbol: 'vxFROST',
    boostTokenName: 'Staked FROST',
    boostMultiplier: 1.5,
    isBoostComingSoon: true, // Grey out FROST features
    escrowNftName: 'Escrow NFT', // TODO: needs proper name
  },
];
