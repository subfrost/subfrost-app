import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { FACTORY_OPCODES } from '@/constants';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
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

/**
 * Build protostone string for AMM swap operations
 * Format: [factory_block,factory_tx,opcode,path_len,...path_tokens,amount,limit,deadline]:pointer:refund
 */
function buildSwapProtostone(params: {
  factoryId: string;
  opcode: string;
  tokenPath: string[];
  amount: string;
  limit: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const { factoryId, opcode, tokenPath, amount, limit, deadline, pointer = 'v1', refund = 'v1' } = params;
  const [factoryBlock, factoryTx] = factoryId.split(':');

  // Build cellpack: [factory_block, factory_tx, opcode, path_len, ...path_tokens, amount, limit, deadline]
  const pathTokens = tokenPath.flatMap(token => token.split(':'));
  const cellpack = [
    factoryBlock,
    factoryTx,
    opcode,
    tokenPath.length.toString(),
    ...pathTokens,
    amount,
    limit,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for alkanes execute
 * Format: "B:amount" for bitcoin, "block:tx:amount" for alkanes
 */
function buildInputRequirements(params: {
  bitcoinAmount?: string;
  alkaneInputs?: Array<{ alkaneId: string; amount: string }>;
}): string {
  const parts: string[] = [];

  if (params.bitcoinAmount && params.bitcoinAmount !== '0') {
    parts.push(`B:${params.bitcoinAmount}`);
  }

  if (params.alkaneInputs) {
    for (const input of params.alkaneInputs) {
      const [block, tx] = input.alkaneId.split(':');
      parts.push(`${block}:${tx}:${input.amount}`);
    }
  }

  return parts.join(',');
}

export function useSwapMutation() {
  const { account, network, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, FRBTC_ALKANE_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (swapData: SwapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const sellCurrency = swapData.sellCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.sellCurrency;
      const buyCurrency = swapData.buyCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.buyCurrency;

      // Adjust amounts for wrap fee when selling BTC
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

      // Build token path
      let tokenPath = swapData.tokenPath || [sellCurrency, buyCurrency];
      tokenPath = tokenPath.map((t) => (t === 'btc' ? FRBTC_ALKANE_ID : t));

      // Calculate slippage limits
      const minAmountOut = calculateMinimumFromSlippage({ amount: ammBuyAmount, maxSlippage: swapData.maxSlippage });
      const maxAmountIn = calculateMaximumFromSlippage({ amount: ammSellAmount, maxSlippage: swapData.maxSlippage });

      // Get deadline block height
      const deadlineBlocks = swapData.deadlineBlocks || 3;
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);

      // Determine opcode based on direction
      const opcode = swapData.direction === 'sell'
        ? FACTORY_OPCODES.SwapExactTokensForTokens
        : FACTORY_OPCODES.SwapTokensForExactTokens;

      // Build protostone for the swap
      const protostone = buildSwapProtostone({
        factoryId: ALKANE_FACTORY_ID,
        opcode: opcode.toString(),
        tokenPath,
        amount: swapData.direction === 'sell'
          ? new BigNumber(ammSellAmount).toFixed(0)
          : new BigNumber(ammBuyAmount).toFixed(0),
        limit: swapData.direction === 'sell'
          ? new BigNumber(minAmountOut).toFixed(0)
          : new BigNumber(maxAmountIn).toFixed(0),
        deadline: deadline.toString(),
      });

      // Build input requirements
      const isBtcSell = swapData.sellCurrency === 'btc';
      const inputRequirements = buildInputRequirements({
        bitcoinAmount: isBtcSell ? new BigNumber(swapData.sellAmount).toFixed(0) : undefined,
        alkaneInputs: !isBtcSell ? [{
          alkaneId: sellCurrency,
          amount: new BigNumber(swapData.sellAmount).toFixed(0),
        }] : undefined,
      });

      // Get recipient address (taproot for alkanes)
      const recipientAddress = account?.taproot?.address || account?.nativeSegwit?.address;
      if (!recipientAddress) throw new Error('No recipient address available');

      const toAddresses = JSON.stringify([recipientAddress]);
      const options = JSON.stringify({
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: true,
      });

      // Execute using alkanesExecuteWithStrings
      const result = await provider.alkanesExecuteWithStrings(
        toAddresses,
        inputRequirements,
        protostone,
        swapData.feeRate,
        undefined, // envelope_hex
        options
      );

      // Parse result
      const txId = result?.txid || result?.reveal_txid;

      return {
        success: true,
        transactionId: txId,
        frbtcUnwrapTxId: undefined, // TODO: Handle unwrap in separate transaction if needed
      } as {
        success: boolean;
        transactionId?: string;
        frbtcUnwrapTxId?: string;
      };
    },
  });
}
