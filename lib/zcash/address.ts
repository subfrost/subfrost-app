/**
 * Zcash transparent address derivation from BIP39 mnemonic.
 *
 * Derives P2PKH (t1...) addresses using BIP44 path m/44'/133'/0'/0/0.
 * Same mnemonic, different derivation path from Bitcoin (m/86'/0'/0'/0/0).
 *
 * The address uses a 2-byte version prefix [0x1c, 0xb8] for mainnet (t1...)
 * and [0x1d, 0x25] for testnet (tm...), encoded as Base58Check.
 */

import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import { createHash } from 'crypto';

const bip32 = BIP32Factory(ecc);

// Base58 alphabet (Bitcoin/Zcash standard)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Zcash network address prefixes (2-byte Base58Check) */
export const ZEC_PREFIXES = {
  mainnet: {
    p2pkh: [0x1c, 0xb8], // t1...
    p2sh: [0x1c, 0xbd],  // t3...
  },
  testnet: {
    p2pkh: [0x1d, 0x25], // tm...
    p2sh: [0x1c, 0xba],  // t2...
  },
} as const;

/** BIP44 coin type for Zcash */
const ZEC_COIN_TYPE_MAINNET = 133;
const ZEC_COIN_TYPE_TESTNET = 1;

/**
 * Derive a Zcash transparent address (t1...) from a BIP39 mnemonic.
 *
 * Uses BIP44: m/44'/133'/0'/0/0 for mainnet, m/44'/1'/0'/0/0 for testnet.
 */
export function deriveZcashAddress(
  mnemonic: string,
  network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
): { address: string; pubkey: string; hdPath: string } {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);

  const coinType = network === 'mainnet' ? ZEC_COIN_TYPE_MAINNET : ZEC_COIN_TYPE_TESTNET;
  const hdPath = `m/44'/${coinType}'/0'/0/0`;
  const child = root.derivePath(hdPath);

  if (!child.publicKey) throw new Error('Failed to derive ZEC public key');

  const pubkeyBuf = Buffer.from(child.publicKey);
  const pubkeyHex = pubkeyBuf.toString('hex');
  const prefix = network === 'mainnet' ? ZEC_PREFIXES.mainnet.p2pkh : ZEC_PREFIXES.testnet.p2pkh;
  const address = pubkeyToZcashAddress(pubkeyBuf, prefix);

  return { address, pubkey: pubkeyHex, hdPath };
}

/**
 * Convert a compressed public key to a Zcash t-address.
 *
 * Hash160 = RIPEMD160(SHA256(pubkey)), then Base58Check with 2-byte prefix.
 */
function pubkeyToZcashAddress(pubkey: Buffer, prefix: readonly [number, number]): string {
  // Hash160: RIPEMD160(SHA256(pubkey))
  const sha256 = createHash('sha256').update(pubkey).digest();
  const hash160 = createHash('ripemd160').update(sha256).digest();

  // 2-byte prefix + 20-byte hash160
  const payload = Buffer.alloc(22);
  payload[0] = prefix[0];
  payload[1] = prefix[1];
  hash160.copy(payload, 2);

  return base58checkEncode(payload);
}

/**
 * Base58Check encoding (no external dependency).
 * Format: base58(payload + sha256d(payload)[0..4])
 */
function base58checkEncode(payload: Buffer): string {
  const checksum = sha256d(payload).slice(0, 4);
  const data = Buffer.concat([payload, checksum]);
  return base58Encode(data);
}

function sha256d(data: Buffer): Buffer {
  const first = createHash('sha256').update(data).digest();
  return createHash('sha256').update(first).digest();
}

function base58Encode(data: Buffer): string {
  // Count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < data.length && data[i] === 0; i++) {
    leadingZeros++;
  }

  // Convert to base58
  // Use BigInt for the conversion
  let num = BigInt('0x' + data.toString('hex'));
  const chars: string[] = [];
  const base = BigInt(58);

  while (num > 0n) {
    const remainder = Number(num % base);
    chars.unshift(BASE58_ALPHABET[remainder]);
    num = num / base;
  }

  // Add leading '1's for each leading zero byte
  for (let i = 0; i < leadingZeros; i++) {
    chars.unshift('1');
  }

  return chars.join('');
}

/**
 * Map subfrost network names to Zcash network type.
 */
export function toZcashNetwork(network: string): 'mainnet' | 'testnet' | 'regtest' {
  switch (network) {
    case 'mainnet':
      return 'mainnet';
    case 'testnet':
    case 'signet':
      return 'testnet';
    default:
      return 'regtest';
  }
}
