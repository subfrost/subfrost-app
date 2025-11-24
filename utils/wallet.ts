import { AddressType } from './types';

/**
 * Helper function to determine Bitcoin address type.
 * This is a simplified placeholder and may need more robust implementation
 * for production use cases.
 */
export const getAddressType = (address: string): AddressType | null => {
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return AddressType.P2TR;
  }
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return AddressType.P2WPKH;
  }
  // Add other address types as needed (P2SH, P2PKH)
  return null; // Or throw an error for unsupported types
};