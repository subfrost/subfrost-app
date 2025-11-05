import BigNumber from 'bignumber.js';
import type { FormattedUtxo, Provider } from '@oyl/sdk';

export function calculateMinimumFromSlippage({
  amount,
  maxSlippage,
}: {
  amount: string;
  maxSlippage: string | number;
}): string {
  const slippageFraction = BigNumber(maxSlippage).dividedBy(100);
  return BigNumber(amount)
    .times(BigNumber(1).minus(slippageFraction))
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
}

export function calculateMaximumFromSlippage({
  amount,
  maxSlippage,
}: {
  amount: string;
  maxSlippage: string | number;
}): string {
  const slippageFraction = BigNumber(maxSlippage).dividedBy(100);
  return BigNumber(amount)
    .times(BigNumber(1).plus(slippageFraction))
    .integerValue(BigNumber.ROUND_CEIL)
    .toString();
}

export const getFutureBlockHeight = async (blocks = 0, provider: Provider) => {
  const currentBlockHeight = await provider.sandshrew.bitcoindRpc.getBlockCount!();
  return currentBlockHeight + blocks;
};

const alkaneUtxohasInscriptionsOrRunes = (u: FormattedUtxo): boolean =>
  (u.inscriptions?.length ?? 0) > 0 || Object.keys(u.runes ?? {}).length > 0;

export const assertAlkaneUtxosAreClean = (utxos: FormattedUtxo[]): void => {
  const offendingIndex = utxos.findIndex(alkaneUtxohasInscriptionsOrRunes);

  if (offendingIndex !== -1) {
    throw new Error(
      `UTXO at index ${offendingIndex} contains Inscriptions or Runes; ` +
        `split it from your Alkane UTXO set before proceeding.`,
    );
  }
};


