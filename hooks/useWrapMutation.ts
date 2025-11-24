import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { useSignerShim } from './useSignerShim';
import { wrapBtc } from '@/ts-sdk/src/alkanes';

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

const toAlks = (amount: string): string => {
  if (!amount) return '0';
  // 8 decimal places for alks/sats
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
  // remove leading zeros from whole to avoid Number parsing issues later
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac ? frac.padStart(8, '0') : '00000000'}`;
};

export function useWrapMutation() {
  const { getSpendableUtxos, account, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const signerShim = useSignerShim();

  return useMutation({
    mutationFn: async (wrapData: WrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const utxos = await getSpendableUtxos();

      const transaction = await wrapBtc({
        utxos,
        account,
        provider,
        signer: signerShim,
        feeRate: wrapData.feeRate,
        wrapAmount: Number(toAlks(wrapData.amount)),
      });

      return {
        success: true,
        transactionId: transaction?.txId,
      } as { success: boolean; transactionId?: string };
    },
  });
}
