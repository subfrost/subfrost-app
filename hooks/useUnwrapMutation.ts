import { useMutation } from '@tanstack/react-query';
import { amm, unwrapBtc } from '@/ts-sdk';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { useSignerShim } from './useSignerShim';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { assertAlkaneUtxosAreClean } from '@/utils/amm';

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

const toAlks = (amount: string): string => {
  if (!amount) return '0';
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac ? frac.padStart(8, '0') : '00000000'}`;
};

export function useUnwrapMutation() {
  const { getUtxos, account, network, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const signerShim = useSignerShim();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (unwrapData: UnwrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const utxos = await getUtxos();

      const token = [
        {
          alkaneId: parseAlkaneId(FRBTC_ALKANE_ID),
          amount: toAlks(unwrapData.amount),
        },
      ];

      const { selectedUtxos } = amm.factory.splitAlkaneUtxos(token, utxos);
      assertAlkaneUtxosAreClean(selectedUtxos);

      const transaction = await unwrapBtc({
        alkaneUtxos: selectedUtxos,
        utxos,
        account,
        provider,
        signer: signerShim,
        feeRate: unwrapData.feeRate,
        unwrapAmount: BigInt(toAlks(unwrapData.amount)),
      });

      return {
        success: true,
        transactionId: transaction?.txId,
      } as { success: boolean; transactionId?: string };
    },
  });
}
