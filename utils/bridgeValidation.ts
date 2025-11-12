import { VIRTUAL_TOKEN_IDS } from '@/constants/bridge';

/**
 * Check if a token is a bridge token (USDT/USDC)
 */
export function isBridgeToken(tokenId?: string): boolean {
  return tokenId === VIRTUAL_TOKEN_IDS.USDT || tokenId === VIRTUAL_TOKEN_IDS.USDC;
}

/**
 * Validate if LP creation is allowed for given token pair
 * USDT/USDC cannot be used in LP pairs - users must use bUSD instead
 */
export function canCreateLPWithTokens(token0Id?: string, token1Id?: string): {
  allowed: boolean;
  reason?: string;
} {
  if (isBridgeToken(token0Id) || isBridgeToken(token1Id)) {
    return {
      allowed: false,
      reason: 'USDT and USDC cannot be used for liquidity pools. Please use bUSD for USD pairs.',
    };
  }
  
  return { allowed: true };
}

/**
 * Get human-readable token symbol from ID
 */
export function getTokenSymbol(tokenId?: string): string {
  if (tokenId === VIRTUAL_TOKEN_IDS.USDT) return 'USDT';
  if (tokenId === VIRTUAL_TOKEN_IDS.USDC) return 'USDC';
  return tokenId || 'Unknown';
}
