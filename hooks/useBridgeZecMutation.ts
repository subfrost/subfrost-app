/**
 * useBridgeZecMutation — Mutation hook for ZEC cross-chain bridge operations
 *
 * Provides bridgeToZec mutation:
 *   Burns frZEC on Bitcoin, encodes the user's ZEC t-address into the protostone,
 *   and the coordinator releases ZEC via CGGMP21 threshold ECDSA signing.
 *
 * Contract: frZEC [4:n] (FRZEC_ALKANE_ID from network config)
 * Opcode: 5 (BurnAndBridge) — encodes ZEC t-address (hash160 + prefix bytes)
 *
 * ZEC recipient default:
 *   For keystore wallets, if no recipient is specified, the hook derives a ZEC
 *   t-address from the session mnemonic via BIP44 m/44'/133'/0'/0/0.
 *   Browser wallets must always provide an explicit ZEC recipient.
 *
 * JOURNAL (2026-03-27): Initial implementation.
 * Pattern follows useUnwrapZecMutation and useBridgeMutation.
 * ZEC address validation rejects z-addresses (zs.../zc...) since the bridge
 * only supports transparent addresses.
 *
 * BROWSER WALLET: Must use ACTUAL addresses, not symbolic ('p2tr:0').
 * See useSwapMutation.ts header for full documentation of this critical bug.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { getBitcoinNetwork, extractPsbtBase64, toAlks } from '@/lib/alkanes/helpers';
import { buildBurnAndBridgeZecProtostone } from '@/lib/bridge/protostoneBuilder';
import { deriveZcashAddress, toZcashNetwork } from '@/lib/zcash/address';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// ---- Types ----

export interface BridgeToZecParams {
  /** Amount of frZEC to burn (display units, 8 decimals) */
  frzecAmount: string;
  /** ZEC transparent address (t1.../t3.../tm.../t2...). Optional for keystore wallets. */
  zecRecipient?: string;
  /** Fee rate in sats/vB */
  feeRate: number;
}

// ---- Address validation ----

/**
 * Validate a ZEC transparent address.
 * Accepts: t1... (P2PKH mainnet), t3... (P2SH mainnet), tm... (P2PKH testnet), t2... (P2SH testnet)
 * Rejects: z-addresses (zs.../zc...), invalid prefixes
 */
function validateZecTAddress(address: string): string | null {
  if (!address || address.length === 0) {
    return 'ZEC address is required';
  }
  if (address.startsWith('zs') || address.startsWith('zc')) {
    return 'Shielded z-addresses are not supported. Please use a transparent t-address (t1.../t3...).';
  }
  if (!/^t[123m]/.test(address)) {
    return 'Invalid ZEC address. Must start with t1, t3, tm, or t2.';
  }
  // Basic length check: t-addresses are 35 characters (mainnet) or 35 (testnet)
  if (address.length < 25 || address.length > 40) {
    return 'Invalid ZEC address length.';
  }
  return null;
}

// ---- Hook ----

export function useBridgeZecMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();

  const bridgeToZec = useMutation({
    mutationFn: async (params: BridgeToZecParams) => {
      console.log('[useBridgeZec] Starting BurnAndBridge frZEC -> ZEC');
      console.log('[useBridgeZec] frzecAmount:', params.frzecAmount);

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available');
      }
      const primaryAddress = taprootAddress || segwitAddress;

      const config = getConfig(network);
      const frzecTokenId = (config as any).FRZEC_ALKANE_ID as string;
      if (!frzecTokenId) {
        throw new Error('frZEC token not configured for this network');
      }

      // Resolve ZEC recipient address
      let zecRecipient = params.zecRecipient;

      if (!zecRecipient) {
        // For keystore wallets, derive from session mnemonic
        if (walletType === 'keystore') {
          const sessionMnemonic = typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('subfrost_session_mnemonic')
            : null;

          if (sessionMnemonic) {
            const zecNetwork = toZcashNetwork(network || 'mainnet');
            const derived = deriveZcashAddress(sessionMnemonic, zecNetwork);
            zecRecipient = derived.address;
            console.log('[useBridgeZec] Derived ZEC address:', zecRecipient, 'path:', derived.hdPath);
          } else {
            throw new Error('No ZEC recipient specified and session mnemonic not available. Please enter a ZEC t-address.');
          }
        } else {
          throw new Error('ZEC recipient address is required for browser wallets.');
        }
      }

      // Validate ZEC t-address
      const validationError = validateZecTAddress(zecRecipient);
      if (validationError) {
        throw new Error(validationError);
      }
      console.log('[useBridgeZec] zecRecipient:', zecRecipient);

      // Convert display units to alkane base units (8 decimals)
      const burnAmount = toAlks(params.frzecAmount);
      if (burnAmount === '0') {
        throw new Error('Burn amount must be greater than zero');
      }

      // Build the BurnAndBridge protostone with ZEC t-address encoding
      const protostone = buildBurnAndBridgeZecProtostone(frzecTokenId, zecRecipient);
      console.log('[useBridgeZec] Protostone:', protostone);

      // frZEC tokens must be sent as incomingAlkanes via inputRequirements
      const inputRequirements = `${frzecTokenId}:${burnAmount}`;
      console.log('[useBridgeZec] Input requirements:', inputRequirements);

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';
      const btcNetwork = getBitcoinNetwork(network);

      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      const toAddresses = useActualAddresses
        ? [primaryAddress!]
        : ['p2tr:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';

      const result = await provider.alkanesExecuteTyped({
        inputRequirements,
        protostones: protostone,
        feeRate: params.feeRate,
        autoConfirm: false,
        fromAddresses,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
        ordinalsStrategy: 'burn',
      });

      // Auto-completed by SDK
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useBridgeZec] Transaction completed:', txId);
        return { success: true as const, transactionId: txId, zecRecipient };
      }

      // Need manual signing
      if (result?.readyToSign) {
        let psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        if (isBrowserWallet) {
          const patched = patchInputsOnly({
            psbtBase64,
            taprootAddress: account?.taproot?.address || '',
            segwitAddress: account?.nativeSegwit?.address,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            network: btcNetwork,
          });
          psbtBase64 = patched.psbtBase64;
        }

        // Keystore confirmation dialog
        if (walletType === 'keystore') {
          const approved = await requestConfirmation({
            type: 'unwrap',
            title: 'Confirm Bridge frZEC to ZEC',
            fromAmount: params.frzecAmount,
            fromSymbol: 'frZEC',
            toAmount: params.frzecAmount,
            toSymbol: 'ZEC',
            feeRate: params.feeRate,
            description: `Recipient: ${zecRecipient}`,
          });
          if (!approved) throw new Error('Transaction rejected by user');
        }

        // Sign
        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
        } else {
          signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        // Finalize and broadcast
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        const alreadyFinalized = signedPsbt.data.inputs.every(input =>
          input.finalScriptWitness || input.finalScriptSig
        );
        if (!alreadyFinalized) {
          signedPsbt.finalizeAllInputs();
        }

        const tx = signedPsbt.extractTransaction();
        const broadcastTxid = await provider.broadcastTransaction(tx.toHex());
        console.log('[useBridgeZec] Broadcast:', broadcastTxid || tx.getId());

        return { success: true as const, transactionId: broadcastTxid || tx.getId(), zecRecipient };
      }

      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true as const, transactionId: txId, zecRecipient };
      }

      throw new Error('Unexpected SDK response');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge-state'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.refetchQueries({ queryKey: ['btc-balance'] });
      queryClient.refetchQueries({ queryKey: ['enriched-wallet'] });
    },
  });

  return { bridgeToZec };
}
