// Vault configuration data
export interface VaultConfig {
  id: string;
  name: string;
  description: string;
  tokenId: string; // Alkane ID like "2:0"
  tokenSymbol: string;
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
    contractAddress: '0xAb12C3...D4567',
    badge: 'BTC Yield',
    type: 'unit-vault',
    inputAsset: 'frBTC',
    outputAsset: 'yvfrBTC',
    estimatedApy: '4.2',
    historicalApy: '6.1',
    riskLevel: 'medium',
    hasBoost: false, // No boost for yvfrBTC
  },
  {
    id: 've-diesel',
    name: 'veDIESEL Vault',
    description: 'Stake DIESEL for boosted yield',
    tokenId: '2:0',
    tokenSymbol: 'DIESEL',
    contractAddress: '0xBe53A1...F6204',
    type: 'unit-vault',
    inputAsset: 'DIESEL',
    outputAsset: 'veDIESEL',
    estimatedApy: '3.95',
    historicalApy: '5.61',
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxDIESEL',
    boostTokenName: 'Staked DIESEL Gauge',
  },
  {
    id: 've-usd',
    name: 'veUSD Vault',
    description: 'Stake USD for boosted yield',
    tokenId: 'usd', // Use custom USD icon (green $ sign)
    tokenSymbol: 'USD',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'bUSD',
    outputAsset: 'veUSD',
    estimatedApy: '3.8',
    historicalApy: '4.5',
    riskLevel: 'low',
    hasBoost: true,
    boostTokenSymbol: 'vxUSD',
    boostTokenName: 'Staked USD Gauge',
  },
  {
    id: 've-methane',
    name: 'veMETHANE Vault',
    description: 'Stake METHANE for boosted yield',
    tokenId: '2:16', // METHANE alkane ID
    tokenSymbol: 'METHANE',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'METHANE',
    outputAsset: 'veMETHANE',
    estimatedApy: '4.5',
    historicalApy: '5.2',
    riskLevel: 'very-high',
    hasBoost: true,
    boostTokenSymbol: 'vxMETHANE',
    boostTokenName: 'Staked METHANE Gauge',
  },
  {
    id: 'dx-btc',
    name: 'dxBTC Token',
    description: 'Hold Tokenized BTC Yield',
    tokenId: '32:0', // Use frBTC icon (dxBTC = yvfrBTC + derivatives obligations)
    tokenSymbol: 'BTC',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'BTC',
    outputAsset: 'dxBTC',
    estimatedApy: '5.2',
    historicalApy: '6.8',
    riskLevel: 'medium',
    hasBoost: true,
    boostTokenSymbol: 'vxFROST',
    boostTokenName: 'Staked FROST',
    isBoostComingSoon: true, // Grey out FROST features
    escrowNftName: 'Escrow NFT', // TODO: needs proper name
  },
  {
    id: 've-zec',
    name: 'veZEC Vault',
    description: 'Stake Zcash for boosted yield',
    tokenId: 'zec_empty',
    tokenSymbol: 'ZEC',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'ZEC',
    outputAsset: 'veZEC',
    estimatedApy: '10.0',
    riskLevel: 'high',
    hasBoost: true,
    boostTokenSymbol: 'vxZEC',
    boostTokenName: 'Staked ZEC Gauge',
  },
  {
    id: 've-eth',
    name: 'veETH Vault',
    description: 'Stake Ethereum for boosted yield',
    tokenId: 'eth_empty',
    tokenSymbol: 'ETH',
    contractAddress: '0x...',
    badge: 'Coming Soon',
    type: 'unit-vault',
    inputAsset: 'ETH',
    outputAsset: 'veETH',
    estimatedApy: '8.0',
    riskLevel: 'high',
    hasBoost: true,
    boostTokenSymbol: 'vxETH',
    boostTokenName: 'Staked ETH Gauge',
  },
];
