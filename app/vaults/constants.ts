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
    riskLevel: 'low',
    hasBoost: true,
    boostTokenSymbol: 'vxUSD',
    boostTokenName: 'Staked USD Gauge',
    boostMultiplier: 1.5,
  },
  {
    id: 've-methane',
    name: 'veMETHANE Vault',
    description: 'Stake METHANE for boosted yield',
    tokenId: '2:16', // METHANE alkane ID
    tokenSymbol: 'METHANE',
    iconPath: '/tokens/methane.png',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'METHANE',
    outputAsset: 'veMETHANE',
    estimatedApy: '27',
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxMETHANE',
    boostTokenName: 'Staked METHANE Gauge',
    boostMultiplier: 1.5,
  },
  {
    id: 'dx-btc',
    name: 'dxBTC Token',
    description: 'Stake BTC/frBTC for pure BTC yield',
    tokenId: '32:0', // Use frBTC icon (dxBTC = yvfrBTC + derivatives obligations)
    tokenSymbol: 'BTC',
    iconPath: '/tokens/btc_snowflake.svg',
    contractAddress: '4:7936', // dxBTC at [4, 0x1f00] = [4, 7936]
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'BTC',
    outputAsset: 'dxBTC',
    estimatedApy: '5.2',
    riskLevel: 'medium',
    hasBoost: true,
    boostTokenSymbol: 'vxFROST',
    boostTokenName: 'Staked FROST',
    boostMultiplier: 1.5,
    isBoostComingSoon: true, // Grey out FROST features
    escrowNftName: 'Escrow NFT', // TODO: needs proper name
  },
  {
    id: 've-zec',
    name: 'veZEC Vault',
    description: 'Stake Zcash for boosted yield',
    tokenId: 'zec_snowflake',
    tokenSymbol: 'ZEC',
    iconPath: '/tokens/zec_snowflake.svg',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'ZEC',
    outputAsset: 'veZEC',
    estimatedApy: '8.6',
    riskLevel: 'high',
    hasBoost: true,
    boostTokenSymbol: 'vxZEC',
    boostTokenName: 'Staked ZEC Gauge',
    boostMultiplier: 1.5,
  },
  {
    id: 've-eth',
    name: 'veETH Vault',
    description: 'Stake Ethereum for boosted yield',
    tokenId: 'eth_snowflake',
    tokenSymbol: 'ETH',
    iconPath: '/tokens/eth_snowflake.svg',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'ETH',
    outputAsset: 'veETH',
    estimatedApy: '7.4',
    riskLevel: 'high',
    hasBoost: true,
    boostTokenSymbol: 'vxETH',
    boostTokenName: 'Staked ETH Gauge',
    boostMultiplier: 1.5,
  },
];
