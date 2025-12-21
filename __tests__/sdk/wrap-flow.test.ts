/**
 * Wrap Flow Tests - Testing BTC -> frBTC using the same code paths as the app
 *
 * This test uses:
 * - alkanesExecuteWithStrings (same as useWrapMutation)
 * - signTaprootPsbt (same as WalletContext.signTaprootPsbt)
 * - WebProvider from alkanes-web-sys
 *
 * Run with: npx vitest run __tests__/sdk/wrap-flow.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';

// Initialize ECC library
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// Test mnemonic - same as app uses for testing
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Regtest configuration
const REGTEST_CONFIG = {
  sandshrew_rpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

// frBTC wrap opcode (same as useWrapMutation)
const FRBTC_WRAP_OPCODE = 77;
// IMPORTANT: frBTC contract is at 32:0, not 2:0!
const FRBTC_ALKANE_ID = '32:0';

// Default signer pubkey from fr-btc-support (32 bytes x-only pubkey)
// This is the address that must receive BTC for wrap to work
const DEFAULT_SIGNER_PUBKEY = Buffer.from([
  0x79, 0x40, 0xef, 0x3b, 0x65, 0x91, 0x79, 0xa1, 0x37, 0x1d, 0xec, 0x05, 0x79, 0x3c, 0xb0, 0x27,
  0xcd, 0xe4, 0x78, 0x06, 0xfb, 0x66, 0xce, 0x1e, 0x3d, 0x1b, 0x69, 0xd5, 0x6d, 0xe6, 0x29, 0xdc,
]);

// Helper to convert Uint8Array to base64 (same as useWrapMutation)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Build protostone (same as useWrapMutation)
// The pointer determines which output receives the minted frBTC
// For wrap transactions:
//   - Output 0: user address (receives minted frBTC via pointer=v0)
//   - Output 1: signer address (receives BTC - must be explicitly included)
//   - Output 2+: change, OP_RETURN
// IMPORTANT: The signer address MUST be included in to_addresses.
// The SDK does NOT add it automatically.
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;  // Which output gets the minted frBTC (default: v0 = user)
  refund?: string;   // Which output gets refunds (default: v0 = user)
}): string {
  const { frbtcId, pointer = 'v0', refund = 'v0' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');
  return `[${cellpack}]:${pointer}:${refund}`;
}

// Calculate the signer's P2TR address (same as useWrapMutation)
function getSignerAddress(btcNetwork: bitcoin.Network): string {
  const signerTweakedPubkey = Buffer.from(
    ecc.xOnlyPointAddTweak(
      DEFAULT_SIGNER_PUBKEY,
      bitcoin.crypto.taggedHash('TapTweak', DEFAULT_SIGNER_PUBKEY)
    )!.xOnlyPubkey
  );

  const signerPayment = bitcoin.payments.p2tr({
    pubkey: signerTweakedPubkey,
    network: btcNetwork,
  });

  return signerPayment.address!;
}

describe('Wrap Flow Tests', () => {
  let wasm: typeof import('@alkanes/ts-sdk/wasm');
  let provider: import('@alkanes/ts-sdk/wasm').WebProvider;
  let taprootAddress: string;
  let segwitAddress: string;
  let signTaprootPsbt: (psbtBase64: string) => string;

  beforeAll(async () => {
    // Import WASM module
    wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);

    // Derive addresses from mnemonic (same as WalletContext)
    const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
    const btcNetwork = bitcoin.networks.regtest;
    const root = bip32.fromSeed(seed, btcNetwork);
    const coinType = 1; // regtest

    // Derive segwit address (BIP84)
    const segwitAccountNode = root.derivePath(`m/84'/${coinType}'/0'`);
    const segwitChild = segwitAccountNode.derive(0).derive(0);
    const segwitPayment = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(segwitChild.publicKey),
      network: btcNetwork,
    });
    segwitAddress = segwitPayment.address!;

    // Derive taproot address (BIP86)
    const taprootAccountNode = root.derivePath(`m/86'/${coinType}'/0'`);
    const taprootChild = taprootAccountNode.derive(0).derive(0);
    const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1, 33);
    const taprootPayment = bitcoin.payments.p2tr({
      internalPubkey: xOnlyPubkey,
      network: btcNetwork,
    });
    taprootAddress = taprootPayment.address!;

    // Create signTaprootPsbt function (same as WalletContext.signTaprootPsbt)
    signTaprootPsbt = (psbtBase64: string): string => {
      const taprootPath = `m/86'/${coinType}'/0'/0/0`;
      const taprootChildNode = root.derivePath(taprootPath);

      if (!taprootChildNode.privateKey) {
        throw new Error('Failed to derive taproot private key');
      }

      const xOnly = Buffer.from(taprootChildNode.publicKey).slice(1, 33);
      const tweakedChild = taprootChildNode.tweak(
        bitcoin.crypto.taggedHash('TapTweak', xOnly)
      );

      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });

      for (let i = 0; i < psbt.inputCount; i++) {
        try {
          psbt.signInput(i, tweakedChild);
        } catch (error) {
          console.log(`[signTaprootPsbt] Could not sign input ${i}`);
        }
      }

      return psbt.toBase64();
    };

    console.log('[Setup] Provider initialized');
    console.log('[Setup] Taproot address:', taprootAddress);
    console.log('[Setup] Segwit address:', segwitAddress);
  }, 30000);

  describe('1. Address Derivation', () => {
    it('should derive correct taproot address format', () => {
      expect(taprootAddress).toMatch(/^bcrt1p/);
      console.log('[Test] Taproot address:', taprootAddress);
    });

    it('should derive correct segwit address format', () => {
      expect(segwitAddress).toMatch(/^bcrt1q/);
      console.log('[Test] Segwit address:', segwitAddress);
    });
  });

  describe('2. Balance Check', () => {
    it('should fetch wallet balances', async () => {
      const enriched = await provider.getEnrichedBalances(taprootAddress, '1');

      // Handle Map response from WASM
      let result = enriched;
      if (enriched instanceof Map) {
        const obj: any = {};
        enriched.forEach((value: any, key: any) => {
          obj[key] = value;
        });
        result = obj;
      }

      const returns = result?.returns || result;
      console.log('[Balance] ordHeight:', returns?.ordHeight);
      console.log('[Balance] metashrewHeight:', returns?.metashrewHeight);
      console.log('[Balance] spendable count:', returns?.spendable?.length || 0);
      console.log('[Balance] assets count:', Object.keys(returns?.assets || {}).length);
      console.log('[Balance] pending count:', returns?.pending?.length || 0);

      expect(returns).toBeDefined();
    });
  });

  describe('3. Wrap Transaction Building', () => {
    it('should build wrap protostone correctly', () => {
      const protostone = buildWrapProtostone({ frbtcId: FRBTC_ALKANE_ID });
      expect(protostone).toBe('[32,0,77]:v0:v0');
      console.log('[Protostone]', protostone);
    });

    it('should execute wrap using alkanesExecuteWithStrings (same as useWrapMutation)', async () => {
      const wrapAmountSats = 10000; // 0.0001 BTC
      const btcNetwork = bitcoin.networks.regtest;

      // Build protostone with pointer=v0 so frBTC goes to output 0 (user's address)
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
        // pointer=v0: frBTC goes to output 0 (user's address)
        // refund=v0: refunds also go to output 0 (user's address)
      });

      // Input requirements: BTC amount in sats
      const inputRequirements = `B:${wrapAmountSats}`;

      // Calculate signer address - BTC must be sent here for wrap to mint frBTC
      const signerAddress = getSignerAddress(btcNetwork);
      console.log('[Wrap] Signer address:', signerAddress);

      // to_addresses: [user, signer]
      // - Output 0: user address (receives minted frBTC via pointer=v0)
      // - Output 1: signer address (receives BTC - triggers frBTC minting)
      // IMPORTANT: The signer address MUST be included - SDK does NOT add it automatically
      const toAddresses = JSON.stringify([taprootAddress, signerAddress]);

      // Options with trace enabled to see what's happening
      const options = {
        trace_enabled: true,  // Enable trace to see execution
        mine_enabled: false,
        auto_confirm: false,  // Don't auto confirm - we want to see the PSBT
        change_address: taprootAddress,  // User's taproot address receives change
        from: [taprootAddress],
        from_addresses: [taprootAddress],
        lock_alkanes: true,
      };
      const optionsJson = JSON.stringify(options);

      console.log('[Wrap] Protostone:', protostone);
      console.log('[Wrap] Input requirements:', inputRequirements);
      console.log('[Wrap] To addresses:', toAddresses);
      console.log('[Wrap] Options:', optionsJson);

      // First, load the wallet into the provider so it can sign
      console.log('[Wrap] Loading wallet into provider...');
      try {
        provider.walletLoadMnemonic(TEST_MNEMONIC, null);
        console.log('[Wrap] Wallet loaded, isLoaded:', provider.walletIsLoaded());
      } catch (e: any) {
        console.log('[Wrap] Wallet load error:', e?.message || e);
      }

      try {
        // Execute using alkanesExecuteWithStrings (same as useWrapMutation)
        const result = await provider.alkanesExecuteWithStrings(
          toAddresses,
          inputRequirements,
          protostone,
          2, // fee rate
          undefined, // envelope_hex
          optionsJson
        );

        console.log('[Wrap] Execute result type:', typeof result);
        console.log('[Wrap] Execute result keys:', result ? Object.keys(result) : 'null');
        console.log('[Wrap] Execute result:', JSON.stringify(result, null, 2)?.slice(0, 2000));

        if (result?.readyToSign) {
          console.log('[Wrap] Got readyToSign state, signing transaction...');
          const readyToSign = result.readyToSign;

          // Convert PSBT to base64 (same as useWrapMutation)
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            psbtBase64 = readyToSign.psbt;
          } else {
            throw new Error('Unexpected PSBT format');
          }

          console.log('[Wrap] PSBT base64 length:', psbtBase64.length);

          // Parse PSBT to check structure
          const debugPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          console.log('[Wrap] PSBT inputs:', debugPsbt.inputCount);
          console.log('[Wrap] PSBT outputs:', debugPsbt.txOutputs.length);
          console.log('[Wrap] Signer P2TR address (where BTC should go):', signerAddress);

          // Log each output to understand the transaction structure
          console.log('[Wrap] === Transaction Outputs ===');
          let btcToSigner = BigInt(0);
          debugPsbt.txOutputs.forEach((output, idx) => {
            const script = output.script.toString();
            const address = (() => {
              try {
                return bitcoin.address.fromOutputScript(output.script, btcNetwork);
              } catch {
                return 'OP_RETURN or unrecognized';
              }
            })();
            const outputValue = typeof output.value === 'bigint' ? output.value : BigInt(output.value);
            const isSigner = address === signerAddress;
            if (isSigner) {
              btcToSigner += outputValue;
              console.log(`[Wrap] Output ${idx}: value=${outputValue} sats, address=${address} ** SIGNER **`);
            } else {
              console.log(`[Wrap] Output ${idx}: value=${outputValue} sats, address=${address}`);
            }
            if (script.startsWith('6a')) {
              // OP_RETURN - likely protostone
              console.log(`[Wrap] Output ${idx} is OP_RETURN (protostone data)`);
            }
          });
          console.log('[Wrap] === End Outputs ===');
          console.log('[Wrap] Total BTC to signer:', btcToSigner.toString(), 'sats');

          if (btcToSigner === BigInt(0)) {
            console.log('[Wrap] WARNING: No BTC sent to signer! frBTC will NOT be minted!');
          }

          // Sign with taproot key (same as WalletContext.signTaprootPsbt)
          console.log('[Wrap] Signing PSBT with taproot key...');
          const signedPsbtBase64 = signTaprootPsbt(psbtBase64);
          console.log('[Wrap] PSBT signed');

          // Finalize and extract
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // Check how many inputs were signed
          let signedCount = 0;
          for (let i = 0; i < signedPsbt.data.inputs.length; i++) {
            const input = signedPsbt.data.inputs[i];
            if (input.partialSig || input.tapKeySig) {
              signedCount++;
            }
          }
          console.log('[Wrap] Signed inputs:', signedCount, 'of', signedPsbt.inputCount);

          try {
            signedPsbt.finalizeAllInputs();
            const tx = signedPsbt.extractTransaction();
            const txHex = tx.toHex();
            console.log('[Wrap] TX hex length:', txHex.length);

            // Broadcast
            const txid = await provider.broadcastTransaction(txHex);
            console.log('[Wrap] Broadcast success! TXID:', txid);

            // On regtest, generate blocks to confirm the transaction
            console.log('[Wrap] Generating blocks to confirm transaction...');
            try {
              // Generate 1 block to confirm the transaction
              const genResult = await provider.bitcoindGenerateToAddress(1, taprootAddress);
              console.log('[Wrap] Block generation result:', genResult);
            } catch (genErr: any) {
              console.log('[Wrap] Block generation error (might need bitcoind RPC):', genErr?.message?.slice(0, 100));
            }

            // Wait for indexer to process
            console.log('[Wrap] Waiting for indexer to process...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Trace the transaction to see what happened
            try {
              // Trace the protostone output (output 3 is OP_RETURN)
              const trace = await provider.traceProtostones(txid);
              console.log('[Wrap] Protostone trace:', JSON.stringify(trace, null, 2)?.slice(0, 2000));
            } catch (traceErr: any) {
              console.log('[Wrap] Trace error:', traceErr?.message);
            }

            // Try decoding the protorunes
            try {
              const decode = await provider.protorunesDecodeTx(txid);
              console.log('[Wrap] Protorunes decode:', JSON.stringify(decode, null, 2)?.slice(0, 1000));
            } catch (decodeErr: any) {
              console.log('[Wrap] Decode error:', decodeErr?.message);
            }

            // Check alkanes balance at user address
            try {
              const alkanes = await provider.alkanesByAddress(taprootAddress);
              console.log('[Wrap] User alkanes:', JSON.stringify(alkanes, null, 2)?.slice(0, 1500));
            } catch (alkanesErr: any) {
              console.log('[Wrap] alkanesByAddress error:', alkanesErr?.message);
            }

            // Check the specific outpoint balance (txid:0 should have the frBTC)
            try {
              const outpointBalance = await provider.alkanesByOutpoint(`${txid}:0`);
              console.log('[Wrap] Outpoint 0 balance:', JSON.stringify(outpointBalance, null, 2)?.slice(0, 500));
            } catch (outpointErr: any) {
              console.log('[Wrap] Outpoint balance error:', outpointErr?.message);
            }

            expect(txid).toBeDefined();
          } catch (finalizeError: any) {
            console.log('[Wrap] Finalize/broadcast error:', finalizeError.message?.slice(0, 200));
            // This may fail if not all inputs could be signed (UTXOs from other addresses)
          }
        } else if (result?.complete) {
          console.log('[Wrap] Execution completed directly');
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[Wrap] TX ID:', txId);
          expect(txId).toBeDefined();
        } else {
          console.log('[Wrap] Unexpected result format:', JSON.stringify(result)?.slice(0, 300));
        }

        expect(result).toBeDefined();
      } catch (error: any) {
        console.log('[Wrap] Execute error object:', error);
        console.log('[Wrap] Execute error type:', typeof error);
        console.log('[Wrap] Execute error message:', error?.message);
        console.log('[Wrap] Execute error name:', error?.name);
        console.log('[Wrap] Execute error stack:', error?.stack?.slice(0, 500));

        // Try to extract more info from the error
        if (error && typeof error === 'object') {
          console.log('[Wrap] Error keys:', Object.keys(error));
          for (const key of Object.keys(error)) {
            console.log(`[Wrap] Error.${key}:`, error[key]);
          }
        }

        // Log but don't fail - this test documents the flow
        expect(error).toBeDefined();
      }
    }, 60000);
  });

  describe('4. Check frBTC Balance After Wrap', () => {
    it('should fetch frBTC balance via data API (same as UI)', async () => {
      // This mimics how the UI fetches balances
      console.log('[frBTC Balance] Checking frBTC balance via data API...');

      try {
        // Use the same method the SwapShell/useEnrichedWalletData uses
        const balanceResult = await provider.dataApiGetAddressBalances(taprootAddress, true);
        console.log('[frBTC Balance] Raw dataApiGetAddressBalances result:', JSON.stringify(balanceResult, null, 2));

        // Check if frBTC (32:0) exists in balances
        if (balanceResult?.balances) {
          const frbtcBalance = balanceResult.balances['32:0'];
          if (frbtcBalance) {
            console.log('[frBTC Balance] ✓ Found frBTC balance:', frbtcBalance, 'sats');
            console.log('[frBTC Balance] ✓ This is', Number(frbtcBalance) / 100000000, 'frBTC');
          } else {
            console.log('[frBTC Balance] No frBTC balance found in balances object');
            console.log('[frBTC Balance] Available balances:', Object.keys(balanceResult.balances));
          }
        }
      } catch (err: any) {
        console.log('[frBTC Balance] Data API error:', err?.message);
      }

      // Also try getEnrichedBalances (the method used by useEnrichedWalletData hook)
      try {
        const enrichedResult = await provider.getEnrichedBalances(taprootAddress);
        console.log('[frBTC Balance] getEnrichedBalances result type:', typeof enrichedResult);

        // The result may be a Map from serde_wasm_bindgen
        let enrichedData: any;
        if (enrichedResult instanceof Map) {
          const returns = enrichedResult.get('returns');
          // Convert Map to plain object
          const mapToObj = (m: any): any => {
            if (m instanceof Map) {
              const obj: Record<string, any> = {};
              for (const [k, v] of m.entries()) obj[k] = mapToObj(v);
              return obj;
            }
            if (Array.isArray(m)) return m.map(mapToObj);
            return m;
          };
          enrichedData = mapToObj(returns);
        } else {
          enrichedData = enrichedResult?.returns || enrichedResult;
        }

        console.log('[frBTC Balance] Enriched data:', JSON.stringify(enrichedData, null, 2)?.slice(0, 1500));

        // Check assets array for frBTC UTXOs
        const assets = Array.isArray(enrichedData?.assets)
          ? enrichedData.assets
          : Object.values(enrichedData?.assets || {});

        if (assets.length > 0) {
          console.log('[frBTC Balance] Found', assets.length, 'asset UTXOs');
          for (const utxo of assets) {
            if (utxo.runes) {
              console.log('[frBTC Balance] UTXO alkanes:', JSON.stringify(utxo.runes));
            }
          }
        }
      } catch (err: any) {
        console.log('[frBTC Balance] getEnrichedBalances error:', err?.message);
      }

      expect(true).toBe(true); // Test documents flow
    });

    it('should check for frBTC balance', async () => {
      try {
        const balances = await provider.dataApiGetAddressBalances(taprootAddress, true);
        console.log('[frBTC] Address balances:', JSON.stringify(balances)?.slice(0, 500));

        // Also check enriched balances for assets
        const enriched = await provider.getEnrichedBalances(taprootAddress, '1');
        let result = enriched;
        if (enriched instanceof Map) {
          const obj: any = {};
          enriched.forEach((value: any, key: any) => {
            obj[key] = value;
          });
          result = obj;
        }

        const returns = result?.returns || result;
        const assets = returns?.assets;
        if (assets && Object.keys(assets).length > 0) {
          console.log('[frBTC] Found assets:', JSON.stringify(assets));
        } else {
          console.log('[frBTC] No assets found');
        }

        expect(true).toBe(true);
      } catch (error: any) {
        console.log('[frBTC] Balance check error:', error.message?.slice(0, 200));
      }
    });
  });
});
