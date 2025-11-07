import BigNumber from 'bignumber.js';
import { ALKS_IN_ALKANE } from '@/constants/alkanes';

/**
 * Formats a value in Alkanes (1 Alkane = 1e8 "Alks").
 *
 * @param value - The value to format, in "Alks".
 * @param smallNumberDecimalPlaces - (Default: 8) Number of decimal places for small values (less than 0.01 Alkane).
 * @param mediumNumberDecimalPlaces - (Default: 6) Number of decimal places for medium values (between 0.01 and 1000 Alkane).
 * @returns The formatted value in Alkanes.
 */
export const formatAlkanes = (
  value: number | string,
  smallNumberDecimalPlaces = 8,
  mediumNumberDecimalPlaces = 6,
) => {
  const num = new BigNumber(value);
  const alkaneValue = num.dividedBy(ALKS_IN_ALKANE); // Convert to Alkanes

  // If the value is large enough, use simplified format
  if (alkaneValue.isGreaterThanOrEqualTo(1000)) {
    if (alkaneValue.isGreaterThanOrEqualTo(1000000)) {
      return alkaneValue.dividedBy(1000000).toFixed(2) + 'M';
    }
    return alkaneValue.dividedBy(1000).toFixed(2) + 'K';
  }

  // If the value is between 0.01 and 1000
  if (alkaneValue.isGreaterThanOrEqualTo(0.01)) {
    return alkaneValue.toFixed(mediumNumberDecimalPlaces);
  }

  // For small numbers (less than 0.01)
  return alkaneValue.toFixed(smallNumberDecimalPlaces).replace(/\.?0+$/, '');
};
