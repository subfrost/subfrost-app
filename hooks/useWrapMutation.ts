import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';

// Helper to recursively convert serde_wasm_bindgen Maps to plain objects
// The WASM SDK returns nested Maps that need to be converted
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  // Handle objects with numeric keys (WASM sometimes returns these for arrays)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    // Check if this looks like an array (all numeric keys)
    if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
      // Could be a pseudo-array, check if sequential
      const numKeys = keys.map(Number).sort((a, b) => a - b);
      if (numKeys[0] === 0 && numKeys[numKeys.length - 1] === numKeys.length - 1) {
        // It's a pseudo-array, convert to real array
        return numKeys.map(k => mapToObject(value[k]));
      }
    }
    // Regular object, convert each property
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  return value;
}

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

// Opcode to query signer pubkey from frBTC contract
// The deployed contracts use opcode 103 (not 100001 from source code)
// Returns: 32-byte x-only pubkey that we convert to P2TR address
const GET_SIGNER_OPCODE = 103;

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Fallback signer addresses per network (used if dynamic fetch fails)
//
// Available opcodes in deployed frBTC contracts (verified via metashrew_view simulate):
// - 0: initialize (one-time setup)
// - 77: wrap (exchange BTC for frBTC)
// - 99: name() -> "frBTC"
// - 100: symbol() -> "frBTC"
// - 102: decimals() -> 8
// - 103: signer() -> 32-byte x-only pubkey
// - 104: premium() -> u128 (100000 = 0.1%)
// - 105: totalSupply() -> u128
//
// Opcode 103 returns the signer pubkey as a 32-byte x-only pubkey.
// We convert this to a bech32m P2TR address using the network-appropriate prefix.
// Pubkey from opcode 103: 7940ef3b659179a1371dec05793cb027cde47806fb66ce1e3d1b69d56de629dc
const SIGNER_ADDRESSES: Record<string, string> = {
  'mainnet': 'bc1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqcdrpr6',
  'regtest': 'bcrt1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqzulgv0',
  'subfrost-regtest': 'bcrt1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqzulgv0',
  'oylnet': 'bcrt1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqzulgv0',
  'signet': 'tb1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqstjlmh',
  'testnet': 'tb1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqstjlmh',
};

// RPC URLs for metashrew_view calls per network
const RPC_URLS: Record<string, string> = {
  'mainnet': 'https://mainnet.subfrost.io/v4/subfrost',
  'signet': 'https://signet.subfrost.io/v4/subfrost',
  'testnet': 'https://testnet.subfrost.io/v4/subfrost',
  'regtest': 'https://regtest.subfrost.io/v4/subfrost',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  'oylnet': 'https://regtest.subfrost.io/v4/subfrost',
};

/**
 * Encode a number as a protobuf varint (LEB128)
 */
function encodeVarint(n: number): number[] {
  const bytes: number[] = [];
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return bytes;
}

/**
 * Build a protobuf-encoded payload for metashrew_view simulate call.
 *
 * The payload structure (matching what works for DIESEL totalSupply):
 * - Field 4 (height): varint
 * - Field 5 (embedded target+opcode): length-delimited [block, tx, opcode as varints]
 * - Field 6 (pointer): varint
 *
 * @param block - Contract block number
 * @param tx - Contract tx number
 * @param opcode - Opcode to call
 * @returns Hex-encoded protobuf payload with 0x prefix
 */
function buildSimulatePayload(block: number, tx: number, opcode: number): string {
  const blockBytes = encodeVarint(block);
  const txBytes = encodeVarint(tx);
  const opcodeBytes = encodeVarint(opcode);

  const embedded = [...blockBytes, ...txBytes, ...opcodeBytes];
  const height = 927587; // Standard height used in other payloads
  const heightBytes = encodeVarint(height);

  const payload = [
    0x20, ...heightBytes,           // Field 4: height
    0x2a, embedded.length, ...embedded,  // Field 5: embedded [block, tx, opcode]
    0x30, 0x01                       // Field 6: pointer
  ];

  return '0x' + payload.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse the simulate response to extract the data field.
 *
 * Response format is protobuf with field 1 containing the execution result,
 * and within that, field 3 contains the data bytes.
 *
 * @param hexResponse - Hex string response from metashrew_view
 * @returns The data bytes as a Buffer, or null if parsing fails
 */
function parseSimulateResponse(hexResponse: string): Buffer | null {
  try {
    const hex = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;
    const bytes = Buffer.from(hex, 'hex');

    // Check for error response (starts with 0x1a which is field 3 = error)
    if (bytes[0] === 0x1a) {
      const errorLen = bytes[1];
      const errorMsg = bytes.slice(2, 2 + errorLen).toString('utf8');
      if (errorMsg.includes('Unrecognized opcode') || errorMsg.includes('revert')) {
        return null;
      }
    }

    // Success response format: 0a [outer_len] ... 1a [data_len] [data_bytes] ...
    // Field 1 (0x0a) contains the execution result
    // Within that, field 3 (0x1a) contains the data

    // Find field 3 (0x1a) which contains the data
    let pos = 0;
    while (pos < bytes.length) {
      const tag = bytes[pos];
      const fieldNum = tag >> 3;
      const wireType = tag & 0x7;

      if (fieldNum === 3 && wireType === 2) {
        // Found field 3, length-delimited
        const dataLen = bytes[pos + 1];
        const data = bytes.slice(pos + 2, pos + 2 + dataLen);
        return data;
      }

      // Skip to next field
      if (wireType === 0) {
        // Varint - find end
        pos++;
        while (pos < bytes.length && (bytes[pos] & 0x80)) pos++;
        pos++;
      } else if (wireType === 2) {
        // Length-delimited - skip length + data
        pos++;
        const len = bytes[pos];
        pos += 1 + len;
      } else {
        // Unknown wire type, advance
        pos++;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Bech32m encoding helpers for converting pubkey to P2TR address
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function convertBits(data: Buffer, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    result.push((acc << (toBits - bits)) & maxv);
  }
  return result;
}

function bech32mPolymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function bech32mHrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5);
  }
  result.push(0);
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 31);
  }
  return result;
}

function bech32mCreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32mHrpExpand(hrp), ...data];
  const polymod = bech32mPolymod([...values, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31);
  }
  return checksum;
}

/**
 * Encode a 32-byte x-only pubkey as a bech32m P2TR address
 */
function pubkeyToP2TRAddress(pubkey: Buffer, hrp: string): string {
  const witnessVersion = 1; // P2TR uses witness version 1
  const words = [witnessVersion, ...convertBits(pubkey, 8, 5, true)];
  const checksum = bech32mCreateChecksum(hrp, words);
  let result = hrp + '1';
  for (const w of [...words, ...checksum]) {
    result += BECH32_CHARSET[w];
  }
  return result;
}

/**
 * Get the bech32 HRP (human-readable part) for a network
 */
function getNetworkHRP(network: string): string {
  switch (network) {
    case 'mainnet':
      return 'bc';
    case 'testnet':
    case 'signet':
      return 'tb';
    case 'regtest':
    case 'subfrost-regtest':
    case 'oylnet':
    default:
      return 'bcrt';
  }
}

/**
 * Fetch the signer address dynamically from the frBTC contract.
 *
 * Uses opcode 103 via metashrew_view with protobuf-encoded payload.
 * The opcode returns a 32-byte x-only pubkey which we convert to a P2TR address.
 *
 * @param network - Network name for RPC URL and address prefix
 * @param frbtcAlkaneId - Alkane ID like "32:0"
 * @returns Signer address or null if fetch fails
 */
async function fetchSignerAddressFromContract(
  network: string,
  frbtcAlkaneId: string,
): Promise<string | null> {
  try {
    const rpcUrl = RPC_URLS[network];
    if (!rpcUrl) return null;

    const [block, tx] = frbtcAlkaneId.split(':').map(Number);
    const payload = buildSimulatePayload(block, tx, GET_SIGNER_OPCODE);

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'metashrew_view',
        params: ['simulate', payload, 'latest'],
        id: 1
      })
    });

    const result = await response.json();

    if (result.error) {
      return null;
    }

    const data = parseSimulateResponse(result.result);
    if (!data) return null;

    // Opcode 103 returns a 32-byte x-only pubkey
    if (data.length === 32) {
      const hrp = getNetworkHRP(network);
      const address = pubkeyToP2TRAddress(data, hrp);
      console.log('[WRAP] Got signer address from contract:', address);
      return address;
    }

    // Fallback: try to interpret as UTF-8 address (for future compatibility)
    const utf8 = data.toString('utf8');
    if (utf8.startsWith('bc') || utf8.startsWith('tb') || utf8.startsWith('bcrt')) {
      console.log('[WRAP] Got signer address from contract (utf8):', utf8);
      return utf8;
    }

    return null;
  } catch {
    // Silently fail - caller will use fallback
    return null;
  }
}

/**
 * Get the signer address for the frBTC contract.
 *
 * First tries to fetch dynamically from the contract using opcode 103.
 * Falls back to hardcoded addresses if the RPC call fails.
 *
 * Opcode 103 returns a 32-byte x-only pubkey which we convert to a P2TR address.
 */
async function getSignerAddress(
  frbtcAlkaneId: string,
  network: string
): Promise<string> {
  // Try to fetch dynamically from contract
  const dynamicSigner = await fetchSignerAddressFromContract(network, frbtcAlkaneId);
  if (dynamicSigner) {
    return dynamicSigner;
  }

  // Fall back to hardcoded address
  const signer = SIGNER_ADDRESSES[network];
  if (signer) {
    console.log('[WRAP] Using fallback signer address:', signer);
    return signer;
  }

  throw new Error(`No signer address available for network: ${network}`);
}

/**
 * Build protostone string for BTC -> frBTC wrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(77)]:pointer:refund
 * Opcode 77 is the exchange/wrap opcode for frBTC contract
 *
 * For wrap transactions (output ordering):
 *   - Output 0 (v0): signer address (receives BTC - triggers frBTC minting)
 *   - Output 1 (v1): user address (receives minted frBTC via pointer=v1)
 *   - Output 2+: change, OP_RETURN
 *
 * IMPORTANT: The signer address must receive the full BTC wrap amount.
 * NEW OUTPUT ORDER: User at v0 (receives frBTC), Signer at v1 (receives BTC).
 * The frBTC contract checks BTC sent to signer and mints frBTC to pointer output (v0=user).
 */
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  // pointer: output index where minted frBTC should go
  // refund: output index where refunds should go
  //
  // NEW OUTPUT ORDERING - user first, signer second:
  //   - Output 0 (v0): user address (receives frBTC via pointer=v0)
  //   - Output 1 (v1): signer address (receives BTC via B:amount:v1)
  //
  // pointer=v0 ensures frBTC goes to user at output 0
  const { frbtcId, pointer = 'v0', refund = 'v0' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(77)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');

  // Format: [cellpack]:pointer:refund
  return `[${cellpack}]:${pointer}:${refund}`;
}

export function useWrapMutation() {
  const { account, network, isConnected, signTaprootPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  // Get bitcoin network for PSBT parsing
  const getBitcoinNetwork = () => {
    switch (network) {
      case 'mainnet':
        return bitcoin.networks.bitcoin;
      case 'testnet':
      case 'signet':
        return bitcoin.networks.testnet;
      case 'regtest':
      case 'subfrost-regtest':
      case 'oylnet':
        return bitcoin.networks.regtest;
      default:
        return bitcoin.networks.bitcoin;
    }
  };

  return useMutation({
    mutationFn: async (wrapData: WrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Check if WASM provider wallet is loaded for signing
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      const wrapAmountSats = Math.floor(parseFloat(wrapData.amount) * 100000000);
      console.log('[WRAP] Starting wrap:', wrapAmountSats, 'sats');

      // Build protostone for wrap operation
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });
      console.log('[WRAP] Protostone:', protostone, '(frbtcId:', FRBTC_ALKANE_ID, ')');

      // Input requirements: BTC amount in sats directed to specific output
      // Format is "B:amount:v1" - direct all BTC to output v1 (signer address)
      // Output v0 (user) receives dust (546 sats) to hold the minted frBTC
      // Output v1 (signer) receives the full wrap amount
      const inputRequirements = `B:${wrapAmountSats}:v1`;

      // Get user's taproot address (receives minted frBTC)
      const userTaprootAddress = account?.taproot?.address;
      if (!userTaprootAddress) throw new Error('No taproot address available');

      // Get bitcoin network for PSBT parsing
      const btcNetwork = getBitcoinNetwork();

      // Get the signer address dynamically from contract or fall back to hardcoded
      const signerAddress = await getSignerAddress(FRBTC_ALKANE_ID, network);

      // to_addresses: [user, signer]
      // - Output 0 (v0): user address (receives minted frBTC via pointer=v0)
      // - Output 1 (v1): signer address (receives full wrap BTC amount via B:amount:v1)
      // NOTE: User is FIRST (v0) so pointer=v0 sends frBTC to user
      const toAddresses = JSON.stringify([userTaprootAddress, signerAddress]);

      // Get taproot address for UTXOs - this is where the funds are
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available for UTXOs');

      // Fetch UTXOs for the wallet
      let walletUtxos: any[] = [];
      try {
        const utxoResult = await provider.getAddressUtxos(taprootAddress);
        const convertedResult = mapToObject(utxoResult);

        if (Array.isArray(convertedResult)) {
          walletUtxos = convertedResult;
        } else if (convertedResult?.utxos) {
          walletUtxos = convertedResult.utxos;
        } else if (convertedResult instanceof Map) {
          walletUtxos = Array.from(convertedResult.values());
        }

        walletUtxos = walletUtxos.filter((utxo: any) => utxo && utxo.txid && typeof utxo.value === 'number');
      } catch (e) {
        console.error('[WRAP] Failed to fetch UTXOs:', e);
      }

      // If we have wallet UTXOs, include them in options
      // Use the actual taproot address for change (not symbolic notation which may cause issues)
      const options: Record<string, any> = {
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: false,  // We'll handle signing ourselves
        change_address: taprootAddress,  // Use actual taproot address for change
        from: [taprootAddress],
        from_addresses: [taprootAddress],
        lock_alkanes: true,
      };

      // Pass explicit UTXOs if available
      if (walletUtxos.length > 0) {
        // Format UTXOs for the SDK
        const formattedUtxos = walletUtxos.map((utxo: any) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          script: utxo.scriptpubkey || utxo.script,
        }));
        options.utxos = formattedUtxos;
        options.explicit_utxos = formattedUtxos;
      }

      const optionsJson = JSON.stringify(options);

      try {
        // Execute using alkanesExecuteWithStrings
        const result = await provider.alkanesExecuteWithStrings(
          toAddresses,
          inputRequirements,
          protostone,
          wrapData.feeRate,
          undefined, // envelope_hex
          optionsJson
        );

        // Check if execution completed (auto_confirm: true path)
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[WRAP] Complete (auto_confirm), txid:', txId);
          return {
            success: true,
            transactionId: txId,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
        }

        // Check if we got a readyToSign state (auto_confirm: false path)
        if (result?.readyToSign) {
          const readyToSign = result.readyToSign;

          // The PSBT comes as Uint8Array from serde_wasm_bindgen
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            psbtBase64 = readyToSign.psbt;
          } else {
            throw new Error('Unexpected PSBT format');
          }

          // Sign the PSBT
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          // Log transaction outputs for debugging frBTC balance issue
          console.log('[WRAP] Transaction built:', txid);
          console.log('[WRAP] Outputs:');
          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            if (script.startsWith('6a')) {
              console.log(`  [${idx}] OP_RETURN (protostone)`);
            } else {
              try {
                const addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
                const label = addr === userTaprootAddress ? 'USER (receives frBTC)' :
                             addr === signerAddress ? 'SIGNER (receives BTC)' : 'OTHER';
                console.log(`  [${idx}] ${label}: ${output.value} sats -> ${addr}`);
              } catch {
                console.log(`  [${idx}] Unknown: ${output.value} sats`);
              }
            }
          });

          // Broadcast the transaction
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[WRAP] Broadcast successful:', broadcastTxid);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
            wrapAmountSats,
            txHex,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number; txHex?: string };
        }

        // Check if execution completed directly
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[WRAP] Complete, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[WRAP] Transaction ID:', txId);

        return {
          success: true,
          transactionId: txId,
          wrapAmountSats,
        } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
      } catch (error) {
        console.error('[WRAP] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[WRAP] Success! txid:', data.transactionId, 'amount:', data.wrapAmountSats, 'sats');

      // Invalidate balance queries - balance will update when indexer processes the transaction
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });

      console.log('[WRAP] Balance queries invalidated - waiting for indexer to process block');
    },
  });
}
