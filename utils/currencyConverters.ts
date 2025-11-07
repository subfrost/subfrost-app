/**
 * Utility functions for converting between different currency formats
 */
import BigNumber from 'bignumber.js';
import { ALKS_IN_ALKANE } from '@/constants/alkanes';

/**
 * Convert Alkanes (display value) to alks (smallest unit) for SDK operations
 * @param alkanes - Amount in Alkanes format (e.g., 1.5)
 * @returns Amount in alks as string (e.g., "150000000")
 */
export const alkaneToAlks = (alkanes: string): string => {
  if (!alkanes || alkanes === '0' || alkanes === '') return '0';

  return new BigNumber(alkanes)
    .multipliedBy(ALKS_IN_ALKANE)
    .integerValue(BigNumber.ROUND_DOWN)
    .toString();
};

/**
 * Convert alks (smallest unit) to Alkanes (display value)
 * @param alks - Amount in alks format (e.g., "150000000")
 * @returns Amount in Alkanes as string (e.g., "1.5")
 */
export const alksToAlkanes = (alks: string): string => {
  if (!alks || alks === '0') return '0';

  return new BigNumber(alks).dividedBy(ALKS_IN_ALKANE).toString();
};
