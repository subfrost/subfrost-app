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

// Combined list of all vaults and gauges
export const ALL_VAULTS: VaultConfig[] = [
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
  {
    id: 've-diesel',
    name: 'veDIESEL Vault',
    description: 'Vote-escrowed DIESEL vault for governance and rewards',
    tokenId: '2:0',
    tokenSymbol: 'DIESEL',
    contractAddress: '', // TODO: Add contract address when available
    badge: 'Governance',
    type: 'unit-vault',
    inputAsset: 'DIESEL',
    outputAsset: 'veDIESEL',
    estimatedApy: '8.5',
    historicalApy: '9.2',
    riskLevel: 'medium',
  },
  {
    id: 'dx-btc',
    name: 'dxBTC Vault',
    description: 'Bitcoin derivative vault with enhanced yield strategies',
    tokenId: '32:0',
    tokenSymbol: 'frBTC',
    contractAddress: '', // TODO: Add contract address when available
    badge: 'New',
    type: 'unit-vault',
    inputAsset: 'frBTC',
    outputAsset: 'dxBTC',
    estimatedApy: '6.8',
    historicalApy: '7.5',
    riskLevel: 'medium',
  },
  {
    id: 'diesel-frbtc-gauge',
    name: 'DIESEL/frBTC Gauge',
    description: 'Stake LP tokens to earn yvBOOST rewards',
    tokenId: '2:0',
    tokenSymbol: 'LP',
    contractAddress: '0x...',
    badge: 'Gauge',
    type: 'gauge',
    inputAsset: 'LP Tokens',
    outputAsset: 'yvBOOST',
    estimatedApy: '12.5',
    historicalApy: '15.2',
    riskLevel: 'medium',
  },
];

// Legacy exports for backward compatibility
export const AVAILABLE_VAULTS = ALL_VAULTS.filter(v => v.type === 'unit-vault');
export const AVAILABLE_GAUGES = ALL_VAULTS.filter(v => v.type === 'gauge');
