/**
 * AMM (Automated Market Maker) module for @alkanes/ts-sdk
 * Provides compatibility with @oyl/sdk AMM functions
 */

import type { FormattedUtxo } from '../types';

/**
 * Token allocation for UTXO splitting
 */
export interface AlkaneTokenAllocation {
  alkaneId: { block: string; tx: string };
  amount: string;
}

/**
 * Result of splitAlkaneUtxos operation
 */
export interface SplitAlkaneUtxosResult {
  selectedUtxos: FormattedUtxo[];
  totalAmount: Record<string, bigint>;
}

/**
 * Split and select UTXOs containing specific alkane tokens
 * Compatible with @oyl/sdk amm.factory.splitAlkaneUtxos
 */
export function splitAlkaneUtxos(
  tokens: AlkaneTokenAllocation[],
  utxos: FormattedUtxo[]
): SplitAlkaneUtxosResult {
  const selectedUtxos: FormattedUtxo[] = [];
  const totalAmount: Record<string, bigint> = {};

  // Initialize totals for each requested token
  for (const token of tokens) {
    const alkaneIdStr = `${token.alkaneId.block}:${token.alkaneId.tx}`;
    totalAmount[alkaneIdStr] = BigInt(0);
  }

  // Iterate through UTXOs and find those containing requested tokens
  for (const utxo of utxos) {
    if (!utxo.alkanes || typeof utxo.alkanes !== 'object') continue;

    let hasRequestedToken = false;

    for (const token of tokens) {
      const alkaneIdStr = `${token.alkaneId.block}:${token.alkaneId.tx}`;
      const alkaneEntry = utxo.alkanes[alkaneIdStr];

      if (alkaneEntry && alkaneEntry.value) {
        hasRequestedToken = true;
        totalAmount[alkaneIdStr] += BigInt(alkaneEntry.value);
      }
    }

    if (hasRequestedToken) {
      selectedUtxos.push(utxo);
    }
  }

  return { selectedUtxos, totalAmount };
}

/**
 * Factory namespace for AMM operations
 */
export const factory = {
  splitAlkaneUtxos,
};

/**
 * AMM namespace export (compatible with @oyl/sdk)
 */
export const amm = {
  factory,
};

export default amm;
