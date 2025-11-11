import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm } from '@oyl/sdk';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { assertAlkaneUtxosAreClean } from '@/utils/amm';
import { GAUGE_OPCODES } from '@/constants';

export type GaugeDepositRewardsData = {
  gaugeContractId: string; // e.g., "2:456" for gauge contract
  rewardTokenId: string; // e.g., "2:0" for DIESEL or "2:789" for frBTC
  amount: string; // Amount of reward tokens to deposit
  feeRate: number; // sats/vB
};

/**
 * Hook to deposit rewards to a gauge (strategist operation)
 * 
 * IMPORTANT: This is opcode 10 (DepositRewards), NOT opcode 4!
 * The amount is read from incoming_alkanes, not passed as a parameter.
 * 
 * This allows strategists to subsidize gauges with external DIESEL or frBTC rewards.
 * The gauge automatically reads the amount from the transaction inputs.
 * 
 * @see https://github.com/subfrost/subfrost-alkanes/docs/strategist-operations.md
 */
export function useGaugeDepositRewards() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (depositData: GaugeDepositRewardsData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const gaugeId = parseAlkaneId(depositData.gaugeContractId);
      const rewardTokenId = parseAlkaneId(depositData.rewardTokenId);

      // Build calldata for gauge deposit rewards
      // Format: [gaugeBlock, gaugeTx, opcode(10)]
      // NOTE: Amount is NOT in calldata - it's read from incoming_alkanes!
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(gaugeId.block),
        BigInt(gaugeId.tx),
        BigInt(GAUGE_OPCODES.DepositRewards),
      );

      // Get all UTXOs
      const allUtxos = await getUtxos();
      if (!allUtxos || allUtxos.length === 0) {
        throw new Error('No UTXOs available');
      }

      // Get alkane UTXOs for the reward token
      const alkanesUtxos = allUtxos.filter(
        (utxo: any) => utxo.inscriptions?.length > 0
      );

      assertAlkaneUtxosAreClean(alkanesUtxos);

      // Execute the deposit rewards transaction
      const response = await executeWithBtcWrapUnwrap({
        signer: signerShim,
        provider,
        cells: [
          {
            data: calldata,
            runes: [],
            alkanes: [
              {
                block: rewardTokenId.block,
                tx: rewardTokenId.tx,
                amount: new BigNumber(depositData.amount),
              },
            ],
          },
        ],
        address: account.taproot,
        paymentAddress: account.payment,
        feeRate: depositData.feeRate,
        alkanesUtxos,
      });

      // Parse the transaction result
      const txId = response?.transactionId;
      if (!txId) {
        throw new Error('Transaction failed - no transaction ID returned');
      }

      return {
        success: true,
        transactionId: txId,
        message: `Deposited ${depositData.amount} rewards to gauge`,
      };
    },
  });
}
