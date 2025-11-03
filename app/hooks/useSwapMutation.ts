import { useMutation } from '@tanstack/react-query';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';

import { useWallet } from '@/app/contexts/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getSandshrewProvider } from '@/app/utils/oylProvider';
import { getConfig } from '@/app/utils/getConfig';
import { useSignerShim } from './useSignerShim';

type SwapDirection = 'sell' | 'buy';

export type SwapMutationArgs = {
  sellCurrency: string; // 'btc' or alkane id 'block:tx'
  buyCurrency: string;  // 'btc' or alkane id 'block:tx'
  sellAmount: string;   // alks string (integer)
  buyAmount: string;    // alks string (integer)
  maxSlippage: string;  // e.g., '0.05'
  deadlineBlocks?: number; // blocks
  feeRate?: number;     // sats/vB
  direction: SwapDirection;
  tokenPath?: string[]; // optional multi-hop
  isDieselMint?: boolean;
};

type AlkaneId = { block: string; tx: string };
function parseAlkaneId(id: string): AlkaneId {
  const [block, tx] = (id || '').split(':');
  return { block, tx } as AlkaneId;
}

const FACTORY_OPCODES = {
  SwapExactTokensForTokens: '13',
  SwapTokensForExactTokens: '14',
};

function toBigIntSafe(s: string) {
  const n = BigInt(String(s));
  return n < 0n ? 0n : n;
}

export const useSwapMutation = () => {
  const { getUtxos, account, network } = useWallet();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const signerShim = useSignerShim();

  return useMutation({
    mutationFn: async (args: SwapMutationArgs) => {
      const sellCurrency = args.sellCurrency;
      const buyCurrency = args.buyCurrency;

      const factoryId = parseAlkaneId(ALKANE_FACTORY_ID);

      // Resolve token path
      let tokenPath = (args.tokenPath && args.tokenPath.length ? args.tokenPath : [sellCurrency, buyCurrency]);
      const tokenList = tokenPath.map((t) => parseAlkaneId(t));

      // Simple slippage constraints
      const slippage = Math.max(0, Math.min(1, parseFloat(args.maxSlippage || '0')));
      const sellAmount = toBigIntSafe(args.sellAmount);
      const buyAmount = toBigIntSafe(args.buyAmount);
      const minAmountOut = args.direction === 'sell' ? toBigIntSafe(String(Math.floor(Number(buyAmount) * (1 - slippage)))) : buyAmount;
      const maxAmountIn = args.direction === 'buy' ? toBigIntSafe(String(Math.ceil(Number(sellAmount) * (1 + slippage)))) : sellAmount;

      // calldata
      const calldata: bigint[] = [];
      calldata.push(BigInt(factoryId.block));
      calldata.push(BigInt(factoryId.tx));
      calldata.push(
        BigInt(
          args.direction === 'sell'
            ? FACTORY_OPCODES.SwapExactTokensForTokens
            : FACTORY_OPCODES.SwapTokensForExactTokens,
        ),
      );
      calldata.push(BigInt(tokenList.length));
      tokenList.forEach((t) => {
        calldata.push(BigInt(t.block));
        calldata.push(BigInt(t.tx));
      });
      calldata.push(args.direction === 'sell' ? sellAmount : buyAmount);
      calldata.push(args.direction === 'sell' ? minAmountOut : maxAmountIn);

      const deadlineBlocks = args.deadlineBlocks ?? 3;
      // Instead of querying future block height from API, approximate by using provider height + deadlineBlocks
      const sandProvider = getSandshrewProvider(network);
      const current = await sandProvider.sandshrew.call('getblockcount', [] as any);
      const deadline = BigInt(Number(current || 0) + deadlineBlocks);
      calldata.push(deadline);

      // UTXOs
      const utxos = await getUtxos();
      let alkanesUtxos: any = undefined; // SDK can split as needed when paying sell token in BTC path

      let frbtcWrapAmount = undefined;
      let frbtcUnwrapAmount = undefined;

      const { executeResult, frbtcUnwrapResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos,
        calldata,
        feeRate: args.feeRate ?? 8,
        account,
        provider,
        signer: signerShim as any,
        frbtcWrapAmount,
        frbtcUnwrapAmount,
        addDieselMint: args.isDieselMint,
      } as any);

      return {
        success: true,
        transactionId: executeResult?.txId as string,
        frbtcUnwrapTxId: frbtcUnwrapResult?.txId as string | undefined,
      };
    },
  });
};


