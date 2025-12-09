import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

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

/**
 * Build protostone string for BTC -> frBTC wrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(77)]:pointer:refund
 * Opcode 77 is the exchange/wrap opcode for frBTC contract
 */
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { frbtcId, pointer = 'v1', refund = 'v1' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(77)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

export function useWrapMutation() {
  const { account, network, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (wrapData: WrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const wrapAmount = toAlks(wrapData.amount);

      // Build protostone for wrap operation
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      // Input requirements: Bitcoin amount to wrap
      const inputRequirements = `B:${wrapAmount}`;

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
        wrapData.feeRate,
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
