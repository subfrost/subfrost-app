import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm } from '@oyl/sdk';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import type { AlkaneId } from '@oyl/sdk';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { FACTORY_OPCODES } from '@/constants';
import { assertAlkaneUtxosAreClean, calculateMinimumFromSlippage, getFutureBlockHeight } from '@/utils/amm';

export type CreatePositionBaseData = {
  currencyA: string; // alkane id or 'btc'
  currencyB: string; // alkane id or 'btc'
  amountA: string; // alks
  amountB: string; // alks
  feeRate: number; // sats/vB
  poolId: AlkaneId; // existing pool ID
  maxSlippage?: string; // percent string, e.g. '0.5'
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
};

export function useCreatePositionMutation() {
  const { getUtxos, account, network, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (positionData: CreatePositionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      // Pre-validate amounts to avoid zero tokens error
      if (positionData.amountA === '0' || positionData.amountB === '0') {
        throw new Error('Cannot create position with zero token amount');
      }

      const factoryId = parseAlkaneId(ALKANE_FACTORY_ID);
      const token0 = parseAlkaneId(
        positionData.currencyA === 'btc' ? FRBTC_ALKANE_ID : positionData.currencyA,
      );
      const token1 = parseAlkaneId(
        positionData.currencyB === 'btc' ? FRBTC_ALKANE_ID : positionData.currencyB,
      );

      const ammAmountA =
        positionData.currencyA === 'btc'
          ? BigNumber(positionData.amountA)
              .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : positionData.amountA;
      const ammAmountB =
        positionData.currencyB === 'btc'
          ? BigNumber(positionData.amountB)
              .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : positionData.amountB;

      const maxSlippage = positionData.maxSlippage || '0.5';
      const deadlineBlocks = positionData.deadlineBlocks || 3;

      const calldata = [
        BigInt(factoryId.block),
        BigInt(factoryId.tx),
        BigInt(FACTORY_OPCODES.AddLiquidity),
        BigInt(token0.block),
        BigInt(token0.tx),
        BigInt(token1.block),
        BigInt(token1.tx),
        BigInt(ammAmountA),
        BigInt(ammAmountB),
        BigInt(calculateMinimumFromSlippage({ amount: ammAmountA, maxSlippage })), // amount_a_min
        BigInt(calculateMinimumFromSlippage({ amount: ammAmountB, maxSlippage })), // amount_b_min
        BigInt(await getFutureBlockHeight(deadlineBlocks, provider)), // deadline
      ];

      const tokens = [];
      if (positionData.currencyA !== 'btc') {
        tokens.push({
          alkaneId: token0,
          amount: BigInt(new BigNumber(ammAmountA).toFixed()),
        });
      }
      if (positionData.currencyB !== 'btc') {
        tokens.push({
          alkaneId: token1,
          amount: BigInt(new BigNumber(ammAmountB).toFixed()),
        });
      }

      const frbtcWrapAmount =
        positionData.currencyA === 'btc'
          ? Number(positionData.amountA)
          : positionData.currencyB === 'btc'
          ? Number(positionData.amountB)
          : undefined;

      const utxos = await getUtxos();

      const { utxos: alkanesUtxos } = amm.factory.splitAlkaneUtxos(tokens, utxos);
      assertAlkaneUtxosAreClean(alkanesUtxos);

      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos,
        calldata,
        feeRate: positionData.feeRate,
        account,
        provider,
        signer: signerShim,
        frbtcWrapAmount,
        addDieselMint: positionData.isDieselMint,
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
