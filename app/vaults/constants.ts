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
  boostTokenSymbol?: string; // e.g., "vxFIRE"
  boostTokenName?: string;
  boostTokenId?: string; // Alkane ID for boost token icon
  boostIconPath?: string; // Direct path to boost token icon
  boostMultiplier?: number; // Boost multiplier value (e.g., 1.5 for 1.5x)
  isBoostComingSoon?: boolean; // For FUEL-based boosts
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
    apyHistory: [3.9, 3.9, 4.0, 4.0, 4.0, 4.1, 4.1, 4.1, 4.1, 4.2, 4.2, 4.2, 4.1, 4.2, 4.2, 4.2, 4.2, 4.3, 4.3, 4.2, 4.3, 4.3, 4.3, 4.3, 4.2, 4.3, 4.3, 4.3, 4.4, 4.3],
    riskLevel: 'medium',
    hasBoost: false, // No boost for yvfrBTC
  },
  {
    id: 've-diesel',
    name: 'FIRE Vault',
    description: 'First of its kind DeFi vault on Bitcoin',
    tokenId: '2:0',
    tokenSymbol: 'DIESEL',
    iconPath: 'https://cdn.ordiscan.com/alkanes/2_0',
    contractAddress: '0xBe53A1...F6204',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'DIESEL',
    outputAsset: 'FIRE',
    estimatedApy: '21',
    apyHistory: [17, 18, 19, 19, 18, 19, 20, 21, 20, 20, 21, 21, 22, 21, 20, 21, 22, 22, 21, 22, 23, 22, 22, 23, 23, 22, 23, 22, 23, 22],
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxFIRE',
    boostTokenName: 'Staked DIESEL Gauge',
    boostTokenId: '2:0', // Uses DIESEL icon from Oyl CDN
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
    apyHistory: [21, 21, 21, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 25, 25, 25, 25, 24, 25, 25, 25, 25],
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxORDI',
    boostTokenName: 'Staked ORDI Gauge',
    boostIconPath: '/tokens/ordi.svg', // Uses ORDI local icon
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
    apyHistory: [3.5, 3.5, 3.5, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.7, 3.7, 3.7, 3.7, 3.7, 3.7, 3.7, 3.8, 3.8, 3.8, 3.8, 3.8, 3.8, 3.8, 3.8, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9],
    riskLevel: 'low',
    hasBoost: true,
    boostTokenSymbol: 'vxUSD',
    boostTokenName: 'Staked USD Gauge',
    boostIconPath: '/tokens/usdt_snowflake.svg', // Uses USD snowflake icon
    boostMultiplier: 1.5,
  },
  {
    id: 'dx-btc',
    name: 'dxBTC Token',
    description: 'Stake BTC for pure BTC yield',
    tokenId: '32:0', // Use frBTC icon (dxBTC = yvfrBTC + derivatives obligations)
    tokenSymbol: 'BTC',
    iconPath: '/tokens/btc_snowflake.svg',
    contractAddress: '4:xxxx',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'BTC',
    outputAsset: 'dxBTC',
    estimatedApy: '5.2',
    apyHistory: [4.9, 5.0, 5.0, 5.1, 5.1, 5.2, 5.1, 5.0, 4.9, 4.9, 5.0, 5.0, 5.1, 5.1, 5.2, 5.2, 5.2, 5.3, 5.3, 5.3, 5.4, 5.4, 5.3, 5.4, 5.4, 5.4, 5.5, 5.4, 5.5, 5.4],
    riskLevel: 'medium',
    hasBoost: true,
    boostTokenSymbol: 'vxFUEL',
    boostTokenName: 'Staked FUEL',
    boostIconPath: '/tokens/btc_snowflake.svg', // Uses BTC snowflake icon as placeholder
    boostMultiplier: 1.5,
    isBoostComingSoon: true, // Grey out FUEL features
    escrowNftName: 'Escrow NFT', // TODO: needs proper name
  },
];
