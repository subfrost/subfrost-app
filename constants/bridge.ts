// Bridge-related constants for USDT/USDC <-> bUSD conversion

// Opcodes
export const SPLITTER_OPCODE = 66;

// Token type identifiers for bUSD splitter contract
export const BRIDGE_TOKEN_TYPES = {
  USDT: 1,
  USDC: 3,
} as const;

export type BridgeTokenType = typeof BRIDGE_TOKEN_TYPES[keyof typeof BRIDGE_TOKEN_TYPES];

// Virtual token IDs for USDT/USDC (these are not real alkane IDs)
export const VIRTUAL_TOKEN_IDS = {
  USDT: 'ethereum:usdt',
  USDC: 'ethereum:usdc',
} as const;

// Token metadata for display
export const BRIDGE_TOKEN_META = {
  [VIRTUAL_TOKEN_IDS.USDT]: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    iconUrl: '/assets/usdt.svg',
  },
  [VIRTUAL_TOKEN_IDS.USDC]: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    iconUrl: '/assets/usdc.svg',
  },
} as const;

// ERC20 ABI for USDT/USDC interactions (minimal interface)
export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) public view returns (uint256)',
  'function balanceOf(address account) public view returns (uint256)',
  'function decimals() public view returns (uint8)',
  'function symbol() public view returns (string)',
  'function transfer(address to, uint256 amount) public returns (bool)',
] as const;
