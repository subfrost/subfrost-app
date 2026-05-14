/**
 * useBridgeMutation — Mutation hooks for cross-chain bridge operations
 *
 * Two operations:
 *   1. useBridgeToEvm — Burns frUSD on Bitcoin, triggers USDC withdrawal on EVM
 *      frUSD opcode 5 (BurnAndBridge) with EVM recipient address
 *
 *   2. useBridgeFromEvm — Mints frUSD on Bitcoin from EVM deposit
 *      frUSD opcode 1 (Mint) — coordinator-mediated in production, auth-token in devnet
 *
 * Contract: frUSD token [4:8201]
 *
 * JOURNAL (2026-03-22): Initial implementation.
 * BurnAndBridge encodes a 20-byte EVM address into the calldata so the coordinator
 * knows where to send the USDC on the EVM side. The frUSD tokens are burned on-chain
 * and appear as a pending bridge record (queryable via opcode 6).
 *
 * Pattern follows useSwapMutation with browser wallet address safety.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { uint8ArrayToBase64, getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// ---- Types ----

export interface BridgeToEvmParams {
  /** Amount of frUSD to burn (18-decimal base units) */
  frusdAmount: string;
  /** EVM recipient address (0x-prefixed, 20 bytes) */
  evmRecipient: string;
  /** Fee rate in sats/vB */
  feeRate: number;
}

export interface BridgeFromEvmParams {
  /** Amount of frUSD to mint (18-decimal base units) */
  frusdAmount: string;
  /** Fee rate in sats/vB */
  feeRate: number;
}

// ---- Calldata builders (exported for testing) ----

/**
 * Build BurnAndBridge protostone for frUSD opcode 5.
 * The EVM address is encoded as a u128 pair: lower 16 bytes + upper 4 bytes.
 *
 * Calldata format: [frusd_block, frusd_tx, 5, evm_addr_low_u128, evm_addr_high_u128]
 */
export function buildBurnAndBridgeProtostone(
  frusdTokenId: string,
  evmRecipient: string,
): string {
  const [block, tx] = frusdTokenId.split(':');
  // Encode 20-byte EVM address as two u128 values for the calldata
  const addrHex = evmRecipient.replace('0x', '').toLowerCase().padStart(40, '0');
  // Split into low 32 hex chars (16 bytes) and high 8 hex chars (4 bytes)
  const lowHex = addrHex.slice(0, 32);
  const highHex = addrHex.slice(32, 40);
  const low = BigInt('0x' + lowHex);
  const high = BigInt('0x' + highHex);

  return `[${block},${tx},5,${low},${high}]:v0:v0`;
}

/**
 * Build Mint protostone for frUSD opcode 1.
 * Coordinator-mediated mint: requires auth token as input.
 *
 * Calldata format: [frusd_block, frusd_tx, 1, recipient_block, recipient_tx, amount]
 * recipient = (0,0) means output pointer (sends to transaction output)
 */
export function buildMintProtostone(
  frusdTokenId: string,
  amount: string,
): string {
  const [block, tx] = frusdTokenId.split(':');
  return `[${block},${tx},1,0,0,${amount}]:v0:v0`;
}

// ---- Hook: Bridge BTC-side frUSD to EVM ----

export function useBridgeToEvm() {
  const { account, network, isConnected, signTaprootPsbt, walletType, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BridgeToEvmParams) => {
      console.log('[useBridgeToEvm] Starting BurnAndBridge');
      console.log('[useBridgeToEvm] frusdAmount:', params.frusdAmount);
      console.log('[useBridgeToEvm] evmRecipient:', params.evmRecipient);

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Validate EVM address
      if (!/^0x[0-9a-fA-F]{40}$/.test(params.evmRecipient)) {
        throw new Error('Invalid EVM address. Must be 0x-prefixed, 40 hex characters.');
      }

      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) throw new Error('No wallet address available');
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      const primaryAddress = (taprootAddress || segwitAddress)!;

      const config = getConfig(network);
      const frusdTokenId = (config as any).FRUSD_TOKEN_ID;
      if (!frusdTokenId) throw new Error('frUSD token not configured for this network');

      const protostone = buildBurnAndBridgeProtostone(frusdTokenId, params.evmRecipient);
      console.log('[useBridgeToEvm] Protostone:', protostone);

      // frUSD tokens must be sent as incomingAlkanes via inputRequirements
      const inputRequirements = `${frusdTokenId}:${params.frusdAmount}`;
      console.log('[useBridgeToEvm] Input requirements:', inputRequirements);

      const isBrowserWallet = walletType === 'browser';
      const btcNetwork = getBitcoinNetwork(network);

      const toAddresses = [primaryAddress];

      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'devnet';

      const result = await provider.alkanesExecuteTyped({
        txContext,
        inputRequirements,
        protostones: protostone,
        feeRate: params.feeRate,
        autoConfirm: false,
        toAddresses,
      });

      // Auto-completed by SDK
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useBridgeToEvm] Transaction completed:', txId);
        return { success: true, transactionId: txId };
      }

      // Need manual signing
      if (result?.readyToSign) {
        const psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const patched = patchInputsOnly({
            psbtBase64,
            taprootAddress: account?.taproot?.address || '',
            segwitAddress: account?.nativeSegwit?.address,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            network: btcNetwork,
          });
          finalPsbtBase64 = patched.psbtBase64;
        }

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

        // Finalize and broadcast
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const txHex = signedPsbt.extractTransaction().toHex();
        const txId = await provider.broadcastTransaction(txHex);
        console.log('[useBridgeToEvm] Broadcast txid:', txId);

        return { success: true, transactionId: txId };
      }

      throw new Error('Unexpected SDK response');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge-state'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
    },
  });
}

// ---- Hook: Bridge from EVM (mint frUSD on Bitcoin) ----

export function useBridgeFromEvm() {
  const { account, network, isConnected, signTaprootPsbt, walletType, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BridgeFromEvmParams) => {
      console.log('[useBridgeFromEvm] Starting frUSD mint');
      console.log('[useBridgeFromEvm] frusdAmount:', params.frusdAmount);

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) throw new Error('No wallet address available');
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      const primaryAddress = (taprootAddress || segwitAddress)!;

      const config = getConfig(network);
      const frusdTokenId = (config as any).FRUSD_TOKEN_ID;
      if (!frusdTokenId) throw new Error('frUSD token not configured for this network');

      const protostone = buildMintProtostone(frusdTokenId, params.frusdAmount);
      console.log('[useBridgeFromEvm] Protostone:', protostone);

      // In production, the coordinator calls this with the auth token.
      // For devnet, the deployer wallet holds the auth token.
      // This mutation is primarily for testing — in production the mint is coordinator-mediated.
      const inputRequirements = 'B:10000:v0'; // Minimal BTC for tx fee
      const isBrowserWallet = walletType === 'browser';
      const btcNetwork = getBitcoinNetwork(network);

      const toAddresses = [primaryAddress];

      const result = await provider.alkanesExecuteTyped({
        txContext,
        inputRequirements,
        protostones: protostone,
        feeRate: params.feeRate,
        autoConfirm: false,
        toAddresses,
      });

      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useBridgeFromEvm] Transaction completed:', txId);
        return { success: true, transactionId: txId };
      }

      if (result?.readyToSign) {
        const psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const patched = patchInputsOnly({
            psbtBase64,
            taprootAddress: account?.taproot?.address || '',
            segwitAddress: account?.nativeSegwit?.address,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            network: btcNetwork,
          });
          finalPsbtBase64 = patched.psbtBase64;
        }

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const txHex = signedPsbt.extractTransaction().toHex();
        const txId = await provider.broadcastTransaction(txHex);
        console.log('[useBridgeFromEvm] Broadcast txid:', txId);

        return { success: true, transactionId: txId };
      }

      throw new Error('Unexpected SDK response');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge-state'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
    },
  });
}
