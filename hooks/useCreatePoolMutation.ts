import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm } from '@oyl/sdk';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { FACTORY_OPCODES } from '@/constants';
import { assertAlkaneUtxosAreClean } from '@/utils/amm';

export type CreatePoolBaseData = {
  currencyA: string; // alkane id or 'btc'
  currencyB: string; // alkane id or 'btc'
  amountA: string; // alks
  amountB: string; // alks
  feeRate: number; // sats/vB
  isDieselMint?: boolean;
};

export function useCreatePoolMutation() {
  const { getUtxos, account, network, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (poolData: CreatePoolBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      // Pre-validate amounts to avoid zero tokens error
      if (poolData.amountA === '0' || poolData.amountB === '0') {
        throw new Error('Cannot create pool with zero token amount');
      }

      // Check if amounts can be converted to BigInt
      try {
        BigInt(poolData.amountA);
        BigInt(poolData.amountB);
      } catch (e) {
        throw new Error(`Invalid amount format: ${e instanceof Error ? e.message : String(e)}`);
      }

      const factoryId = parseAlkaneId(ALKANE_FACTORY_ID);
      const token0 = parseAlkaneId(
        poolData.currencyA === 'btc' ? FRBTC_ALKANE_ID : poolData.currencyA,
      );
      const token1 = parseAlkaneId(
        poolData.currencyB === 'btc' ? FRBTC_ALKANE_ID : poolData.currencyB,
      );

      const calldata = [
        BigInt(factoryId.block),
        BigInt(factoryId.tx),
        BigInt(FACTORY_OPCODES.CreateNewPool),
        BigInt(token0.block),
        BigInt(token0.tx),
        BigInt(token1.block),
        BigInt(token1.tx),
        BigInt(poolData.amountA),
        BigInt(poolData.amountB),
      ];

      const ammAmountA =
        poolData.currencyA === 'btc'
          ? BigNumber(poolData.amountA)
              .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : poolData.amountA;
      const ammAmountB =
        poolData.currencyB === 'btc'
          ? BigNumber(poolData.amountB)
              .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : poolData.amountB;

      const tokens = [];
      if (poolData.currencyA !== 'btc') {
        tokens.push({
          alkaneId: token0,
          amount: BigInt(new BigNumber(ammAmountA).toFixed()),
        });
      }
      if (poolData.currencyB !== 'btc') {
        tokens.push({
          alkaneId: token1,
          amount: BigInt(new BigNumber(ammAmountB).toFixed()),
        });
      }

      const frbtcWrapAmount =
        poolData.currencyA === 'btc'
          ? Number(poolData.amountA)
          : poolData.currencyB === 'btc'
          ? Number(poolData.amountB)
          : undefined;

      const utxos = await getUtxos();

      if (!utxos.length) {
        throw new Error('No UTXOs available.');
      }

      const { utxos: alkanesUtxos } = amm.factory.splitAlkaneUtxos(tokens, utxos);
      assertAlkaneUtxosAreClean(alkanesUtxos);

      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos,
        calldata,
        feeRate: poolData.feeRate,
        account,
        provider,
        signer: signerShim,
        frbtcWrapAmount,
        addDieselMint: poolData.isDieselMint,
      });

      if (!executeResult?.txId) {
        throw new Error('Failed to sign transaction');
      }

      return {
        success: true,
        transactionId: executeResult.txId,
      };
    },
  });
}
