// Vault configuration data
export interface VaultConfig {
  id: string;
  name: string;
  description: string;
  tokenId: string; // Alkane ID like "2:0"
  tokenSymbol: string;
  contractAddress: string;
  badge?: string;
  type: 'unit-vault' | 'gauge';
  inputAsset: string;
  outputAsset: string;
  estimatedApy?: string;
  historicalApy?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export const AVAILABLE_VAULTS: VaultConfig[] = [
  {
    id: 'yve-diesel',
    name: 'yveDIESEL Vault',
    description: 'Vault Bridge DIESEL',
    tokenId: '2:0',
    tokenSymbol: 'DIESEL',
    contractAddress: '0xBe53A1...F6204',
    badge: 'Migrate',
    type: 'unit-vault',
    inputAsset: 'DIESEL',
    outputAsset: 'yveDIESEL',
    estimatedApy: '3.95',
    historicalApy: '5.61',
    riskLevel: 'medium',
  },
  {
    id: 'yve-frbtc',
    name: 'yvfrBTC Vault',
    description: 'Vault Bridge frBTC',
    tokenId: '32:0',
    tokenSymbol: 'frBTC',
    contractAddress: '0xAb12C3...D4567',
    badge: 'Bitcoin',
    type: 'unit-vault',
    inputAsset: 'frBTC',
    outputAsset: 'yvfrBTC',
    estimatedApy: '4.2',
    historicalApy: '6.1',
    riskLevel: 'medium',
  },
  // Future vaults can be added here:
  // {
  //   id: 'yve-busd',
  //   name: 'yveBUSD Vault',
  //   description: 'Vault Bridge BUSD',
  //   tokenId: '1:0',
  //   tokenSymbol: 'BUSD',
  //   contractAddress: '0x...',
  //   badge: 'New',
  //   type: 'unit-vault',
  //   inputAsset: 'BUSD',
  //   outputAsset: 'yveBUSD',
  //   estimatedApy: '4.2',
  //   historicalApy: '4.8',
  //   riskLevel: 'low',
  // },
];

export const AVAILABLE_GAUGES: VaultConfig[] = [
  {
    id: 'diesel-frbtc-gauge',
    name: 'DIESEL/frBTC Gauge',
    description: 'Stake LP tokens',
    tokenId: '2:0', // Use DIESEL icon for now
    tokenSymbol: 'LP',
    contractAddress: '0x...',
    badge: 'Ethereum',
    type: 'gauge',
    inputAsset: 'LP Tokens',
    outputAsset: 'Gauge Tokens',
    estimatedApy: '12.5',
    historicalApy: '15.2',
    riskLevel: 'medium',
  },
];
