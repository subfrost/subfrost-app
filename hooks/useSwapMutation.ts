import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm, executeWithBtcWrapUnwrap } from '@/ts-sdk';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { FACTORY_OPCODES } from '@/constants';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  assertAlkaneUtxosAreClean,
  calculateMaximumFromSlippage,
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';

export type SwapTransactionBaseData = {
  sellCurrency: string; // alkane id or 'btc'
  buyCurrency: string; // alkane id or 'btc'
  direction: 'sell' | 'buy';
  sellAmount: string; // alks
  buyAmount: string; // alks
  maxSlippage: string; // percent string, e.g. '0.5'
  feeRate: number; // sats/vB
  tokenPath?: string[]; // optional explicit path
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
};

export function useSwapMutation() {
  const { getUtxos, account, network, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, BUSD_ALKANE_ID, FRBTC_ALKANE_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (swapData: SwapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const sellCurrency = swapData.sellCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.sellCurrency;
      const buyCurrency = swapData.buyCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.buyCurrency;

      const ammSellAmount =
        swapData.sellCurrency === 'btc'
          ? BigNumber(swapData.sellAmount)
              .multipliedBy(1000 - wrapFee)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : swapData.sellAmount;
      const ammBuyAmount =
        swapData.sellCurrency === 'btc'
          ? BigNumber(swapData.buyAmount)
              .multipliedBy(1000 + wrapFee)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : swapData.buyAmount;

      const factoryId = parseAlkaneId(ALKANE_FACTORY_ID);

      let tokenPath = swapData.tokenPath || [sellCurrency, buyCurrency];
      tokenPath = tokenPath.map((t) => (t === 'btc' ? FRBTC_ALKANE_ID : t));
      const tokenList = tokenPath.map((t) => parseAlkaneId(t));

      const minAmountOut = calculateMinimumFromSlippage({ amount: ammBuyAmount, maxSlippage: swapData.maxSlippage });
      const maxAmountIn = calculateMaximumFromSlippage({ amount: ammSellAmount, maxSlippage: swapData.maxSlippage });

      const calldata: bigint[] = [];
      calldata.push(
        BigInt(factoryId.block),
        BigInt(factoryId.tx),
        BigInt(
          swapData.direction === 'sell'
            ? FACTORY_OPCODES.SwapExactTokensForTokens
            : FACTORY_OPCODES.SwapTokensForExactTokens,
        ),
        BigInt(tokenList.length),
      );
      tokenList.forEach((token) => {
        calldata.push(BigInt(token.block));
        calldata.push(BigInt(token.tx));
      });
      calldata.push(
        BigInt(
          swapData.direction === 'sell'
            ? new BigNumber(ammSellAmount).toFixed()
            : new BigNumber(ammBuyAmount).toFixed(),
        ),
      );
      calldata.push(
        BigInt(
          swapData.direction === 'sell'
            ? new BigNumber(minAmountOut).toFixed()
            : new BigNumber(maxAmountIn).toFixed(),
        ),
      );
      const deadlineBlocks = swapData.deadlineBlocks || 3;
      if (!provider) {
        throw new Error('Provider not available');
      }
      calldata.push(BigInt(await getFutureBlockHeight(deadlineBlocks, provider)));

      const utxos = await getUtxos();
      let alkanesUtxos = undefined as any;
      if (swapData.sellCurrency !== 'btc') {
        const swapToken = [
          {
            alkaneId: parseAlkaneId(sellCurrency),
            amount: new BigNumber(swapData.sellAmount).toFixed(),
          },
        ];
        const { selectedUtxos } = amm.factory.splitAlkaneUtxos(swapToken, utxos);
        alkanesUtxos = selectedUtxos;
        assertAlkaneUtxosAreClean(alkanesUtxos);
      }

      const frbtcWrapAmount = swapData.sellCurrency === 'btc' ? Number(swapData.sellAmount) : undefined;
      const frbtcUnwrapAmount = swapData.buyCurrency === 'btc' ? Number(ammBuyAmount) : undefined;

      const { executeResult, frbtcUnwrapResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos,
        calldata,
        feeRate: swapData.feeRate,
        account,
        provider,
        signer: signerShim,
        frbtcWrapAmount,
        frbtcUnwrapAmount,
        addDieselMint: swapData.isDieselMint,
      });

      return { success: true, transactionId: executeResult?.txId, frbtcUnwrapTxId: frbtcUnwrapResult?.txId } as {
        success: boolean;
        transactionId?: string;
        frbtcUnwrapTxId?: string;
      };
    },
  });
}
