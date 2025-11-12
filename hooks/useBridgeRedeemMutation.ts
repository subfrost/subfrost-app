import {
  actualExecuteFee,
  createExecutePsbt,
} from '@oyl/sdk/lib/alkanes';
import { amm } from '@oyl/sdk';
import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { encipher, encodeRunestoneProtostone, ProtoStone } from 'alkanes';
import { SPLITTER_OPCODE, BRIDGE_TOKEN_TYPES } from '@/constants/bridge';
import { useSandshrewProvider } from './useSandshrewProvider';

interface BridgeRedeemParams {
  amount: string; // Amount in sats (bUSD uses 8 decimals)
  destinationAddress: string; // Ethereum address (0x...)
  tokenType: 'USDT' | 'USDC';
  feeRate: number;
}

/**
 * Hook to redeem bUSD for USDT/USDC on Ethereum
 * This is the "redeem" side of the bridge
 */
export function useBridgeRedeemMutation() {
  const { getUtxos, account, signPsbt, isConnected, network } = useWallet();
  const provider = useSandshrewProvider();
  const config = getConfig(network);
  const { BUSD_SPLITTER_ID, BUSD_ALKANE_ID } = config;

  return useMutation({
    mutationFn: async (redeemData: BridgeRedeemParams) => {
      if (!BUSD_SPLITTER_ID) {
        throw new Error('Bridge not available on this network');
      }

      const busdAlkaneId = parseAlkaneId(BUSD_ALKANE_ID);
      const busdSplitterId = parseAlkaneId(BUSD_SPLITTER_ID);
      
      const { amount, destinationAddress, tokenType, feeRate } = redeemData;
      
      // Validate Ethereum address
      if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
        throw new Error('Invalid Ethereum address');
      }
      
      let transactionId: string | undefined;
      let fee: number | undefined;
      
      try {
        // Split the destination address into two parts per bUSD contract spec
        const destinationAddressBytes = Buffer.from(destinationAddress.slice(2), 'hex'); // Remove '0x' prefix
        const firstHalf = destinationAddressBytes.subarray(0, 16);
        const secondHalf = destinationAddressBytes.subarray(-4);

        const tokenTypeValue = tokenType === 'USDC' 
          ? BRIDGE_TOKEN_TYPES.USDC 
          : BRIDGE_TOKEN_TYPES.USDT;

        const calldata = [
          BigInt(busdSplitterId.block),
          BigInt(busdSplitterId.tx),
          BigInt(SPLITTER_OPCODE),
          BigInt(amount),
          BigInt(tokenTypeValue), // 3 for USDC, 1 for USDT
          BigInt('0x' + firstHalf.toString('hex')), // First 16 bytes of EVM address
          BigInt('0x' + secondHalf.toString('hex')), // Last 4 bytes of EVM address
        ];

        const tokens = [{ alkaneId: busdAlkaneId, amount: BigInt(amount) }];
        const utxos = await getUtxos();
        const { utxos: alkanesUtxos } = amm.factory.splitAlkaneUtxos(
          tokens,
          utxos
        );

        if (!utxos.length) {
          throw new Error('No spendable UTXOs available.');
        }

        if (!alkanesUtxos.length) {
          throw new Error('No spendable bUSD alkanes available.');
        }

        // bUSD contract requires split amount in runestone
        const protostone = encodeRunestoneProtostone({
          protostones: [
            ProtoStone.message({
              protocolTag: BigInt(1),
              edicts: [],
              pointer: 0,
              refundPointer: 0,
              calldata: encipher(calldata),
            }),
          ],
        }).encodedRunestone;

        const { fee: calculatedFee } = await actualExecuteFee({
          utxos,
          alkanesUtxos,
          account,
          protostone,
          provider,
          feeRate,
        });

        fee = calculatedFee;

        const { psbt } = await createExecutePsbt({
          utxos,
          alkanesUtxos,
          account,
          protostone,
          provider,
          feeRate,
          fee,
        });

        const signedPsbt = await signPsbt(psbt, true, false);

        if (!signedPsbt?.signedPsbtBase64) {
          throw new Error('Failed to sign transaction');
        }

        const transaction = await provider.pushPsbt({
          psbtBase64: signedPsbt.signedPsbtBase64,
        });
        
        if (!transaction || !transaction.txId) {
          throw new Error('Failed to broadcast transaction');
        }
        
        transactionId = transaction.txId;

        // Store transaction in localStorage
        const displayData = {
          id: transactionId,
          status: 'pending',
          type: 'bridge-redeem',
          dismissed: false,
          data: {
            amount,
            destinationAddress,
            tokenType,
            feeRate,
            fee,
            fromToken: BUSD_ALKANE_ID,
          },
        };
        localStorage.setItem(`txn-${transactionId}`, JSON.stringify(displayData));
        
        return { 
          success: true,
          transactionId,
          fee,
        };
      } catch (error: any) {
        console.error('Bridge redeem failed:', error);
        
        // If we have a transactionId, mark as failed
        if (transactionId) {
          const failedData = {
            id: transactionId,
            status: 'failed',
            type: 'bridge-redeem',
            dismissed: false,
            data: {
              amount: redeemData.amount,
              destinationAddress: redeemData.destinationAddress,
              tokenType: redeemData.tokenType,
              feeRate: redeemData.feeRate,
              fee: fee || 0,
              fromToken: BUSD_ALKANE_ID,
            },
          };
          localStorage.setItem(`txn-${transactionId}`, JSON.stringify(failedData));
        }
        
        throw error;
      }
    },
    onMutate: () => {
      if (!isConnected) {
        throw new Error('Bitcoin wallet not connected');
      }
      if (!BUSD_SPLITTER_ID) {
        throw new Error('Bridge not available on this network');
      }
    },
  });
}
