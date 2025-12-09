import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

// frBTC unwrap opcode (exchange frBTC for BTC)
const FRBTC_UNWRAP_OPCODE = 78;

const toAlks = (amount: string): string => {
  if (!amount) return '0';
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac ? frac.padStart(8, '0') : '00000000'}`;
};

/**
 * Build protostone string for frBTC -> BTC unwrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(78)]:pointer:refund
 * Opcode 78 is the unwrap opcode for frBTC contract
 */
function buildUnwrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { frbtcId, pointer = 'v1', refund = 'v1' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(78)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_UNWRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for unwrap
 * Format: "block:tx:amount" for the frBTC being unwrapped
 */
function buildUnwrapInputRequirements(params: {
  frbtcId: string;
  amount: string;
}): string {
  const [block, tx] = params.frbtcId.split(':');
  return `${block}:${tx}:${params.amount}`;
}

export function useUnwrapMutation() {
  const { account, network, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (unwrapData: UnwrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const unwrapAmount = toAlks(unwrapData.amount);

      // Build protostone for unwrap operation
      const protostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      // Input requirements: frBTC amount to unwrap
      const inputRequirements = buildUnwrapInputRequirements({
        frbtcId: FRBTC_ALKANE_ID,
        amount: unwrapAmount,
      });

      // Get recipient address (taproot for alkanes, but BTC goes to segwit)
      const recipientAddress = account?.nativeSegwit?.address || account?.taproot?.address;
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
        unwrapData.feeRate,
        undefined, // envelope_hex
        options
      );

      // Parse result
      const txId = result?.txid || result?.reveal_txid;

      return {
        success: true,
        transactionId: txId,
      } as { success: boolean; transactionId?: string };
    },
  });
}
