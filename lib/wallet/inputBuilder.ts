/**
 * Manual-PSBT input builder — switchboard helper for the four standard
 * Bitcoin address types (P2PKH, P2SH-P2WPKH, P2WPKH, P2TR).
 *
 * Ported from bitapeslabs/alkanesjs (src/libs/alkanes/utils.ts) with two
 * deliberate divergences:
 *
 *   1. P2TR `tapInternalKey` source. Bitapeslabs uses `script.subarray(2, 34)`
 *      — that is the BIP341 *tweaked* output key. Browser wallets (UniSat,
 *      Xverse, OYL) validate `tapInternalKey` against the *untweaked* internal
 *      pubkey they hold, so the bitapeslabs version causes UniSat to silently
 *      skip signing (infinite spinner). We require the caller to pass the
 *      x-only internal pubkey via `opts.taprootPubKeyXOnly` and refuse to fall
 *      back to script bytes.
 *
 *   2. Network detection. Bitapeslabs lumps `signet`/`regtest` into the same
 *      regex set keyed by network-name strings. Subfrost has more aliases
 *      (`regtest-local`, `subfrost-regtest`, `devnet`, `oylnet`), so we drive
 *      detection off the bitcoinjs `Network` object's `bech32` /
 *      `pubKeyHash` / `scriptHash` fields directly.
 *
 * The internal numeric `AddressType` enum here is intentionally separate from
 * the string-valued `AddressType` in `utils/types.ts` (which is SDK-facing).
 * Keeping them apart prevents accidental coupling between the SDK protocol
 * surface and the manual-PSBT internals.
 *
 * Reference: https://github.com/bitapeslabs/alkanesjs/blob/master/src/libs/alkanes/utils.ts
 */

import * as bitcoin from 'bitcoinjs-lib';
import { toXOnlyPubKeyHex, X_ONLY_HEX_LENGTH } from './pubkeyHelpers';

export enum AddressType {
  P2PKH = 0,
  P2SH_P2WPKH = 1,
  P2WPKH = 2,
  P2TR = 3,
}

export interface SubfrostUtxo {
  txid: string;
  vout: number;
  /** sats; coerced to BigInt internally */
  value: number;
  /** primary type signal — always wins via redeemTypeFromOutput */
  scriptPubKeyHex: string;
  /** fallback when scriptPubKey detection fails; '' is OK */
  address: string;
  /** REQUIRED for P2PKH (legacy needs full prev-tx); ignored otherwise */
  prevTxHex?: string;
  /**
   * nSequence for the input. Defaults to bitcoinjs-lib's default
   * (0xffffffff) when omitted. RBF callers must pass the original
   * input's sequence so the rebuilt tx preserves locktime semantics.
   */
  sequence?: number;
}

export interface AddInputDynamicOpts {
  /** 64- or 66-char hex; normalized via toXOnlyPubKeyHex */
  taprootPubKeyXOnly?: string;
  /** 66-char compressed hex; required for P2SH-P2WPKH */
  nativeSegwitPubkeyHex?: string;
}

// ---------------------------------------------------------------------------
// Address-string detection
// ---------------------------------------------------------------------------

/**
 * Classify an address by string prefix + the bitcoinjs-lib `Network` object's
 * version bytes. Returns null for unsupported / malformed inputs.
 *
 * Bech32 prefix discrimination:
 *   - 'bc'   → mainnet
 *   - 'tb'   → testnet / signet (signet uses testnet's bech32 prefix)
 *   - 'bcrt' → regtest
 *
 * Base58 discrimination uses the network's pubKeyHash (P2PKH) and scriptHash
 * (P2SH) version bytes — mainnet `0x00`/`0x05`, testnet+regtest `0x6f`/`0xc4`.
 */
export function getAddressType(
  address: string,
  network: bitcoin.Network,
): AddressType | null {
  if (!address) return null;

  const bech32Prefix = `${network.bech32}1`;
  if (address.startsWith(bech32Prefix)) {
    // Witness version is the first character after `${bech32}1`.
    // 'p' / 'q' map to v1 / v0 in bech32m / bech32 respectively (the two we care about).
    const witChar = address.charAt(bech32Prefix.length);
    if (witChar === 'p') return AddressType.P2TR;
    if (witChar === 'q') return AddressType.P2WPKH;
    return null;
  }

  // Base58: peel the version byte by attempting to decode through bitcoinjs.
  // Using bitcoin.address.fromBase58Check would let us read the version
  // directly, but it throws on invalid checksums. Prefer a leading-char
  // heuristic anchored to the network's version bytes — same approach
  // bitcoinjs uses internally.
  if (network.pubKeyHash === 0x00 && address.startsWith('1')) {
    return AddressType.P2PKH;
  }
  if (
    network.pubKeyHash === 0x6f &&
    (address.startsWith('m') || address.startsWith('n'))
  ) {
    return AddressType.P2PKH;
  }
  if (network.scriptHash === 0x05 && address.startsWith('3')) {
    return AddressType.P2SH_P2WPKH;
  }
  if (network.scriptHash === 0xc4 && address.startsWith('2')) {
    return AddressType.P2SH_P2WPKH;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Script-bytes detection (fast path)
// ---------------------------------------------------------------------------

/**
 * Classify a scriptPubKey by its byte pattern. Faster than address-string
 * matching and works without an address; always-wins path inside addInputDynamic.
 *
 * Note: P2SH detection cannot distinguish wrapped-segwit P2SH (Xverse-style
 * P2SH-P2WPKH) from arbitrary P2SH from bytes alone — we map `OP_HASH160 ||
 * <20> || OP_EQUAL` to `P2SH_P2WPKH` because that's the only P2SH shape
 * subfrost generates as a wallet payment address. Callers that handle other
 * P2SH variants must override.
 *
 * P2WSH (`OP_0 || <32>`) is intentionally NOT collapsed into P2TR even though
 * both are 34-byte witness programs — guard `script[0] === 0x51`.
 */
export function redeemTypeFromOutput(
  script: Buffer | Uint8Array,
  // network is accepted for symmetry with getAddressType — current byte
  // patterns are network-agnostic.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _network: bitcoin.Network,
): AddressType | null {
  // P2TR: OP_1 (0x51) + push 32
  if (
    script.length === 34 &&
    script[0] === 0x51 &&
    script[1] === 0x20
  ) {
    return AddressType.P2TR;
  }
  // P2WPKH: OP_0 (0x00) + push 20
  if (
    script.length === 22 &&
    script[0] === 0x00 &&
    script[1] === 0x14
  ) {
    return AddressType.P2WPKH;
  }
  // P2PKH: OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
  if (
    script.length === 25 &&
    script[0] === 0x76 &&
    script[1] === 0xa9 &&
    script[2] === 0x14 &&
    script[23] === 0x88 &&
    script[24] === 0xac
  ) {
    return AddressType.P2PKH;
  }
  // P2SH: OP_HASH160 <20> OP_EQUAL
  if (
    script.length === 23 &&
    script[0] === 0xa9 &&
    script[1] === 0x14 &&
    script[22] === 0x87
  ) {
    return AddressType.P2SH_P2WPKH;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Switchboard
// ---------------------------------------------------------------------------

/**
 * Add a UTXO to a PSBT under construction, choosing the correct input shape
 * based on the prevout's address type.
 *
 * Resolution order:
 *   1. `redeemTypeFromOutput(scriptPubKey, network)` — fast bytes path
 *   2. `getAddressType(utxo.address, network)` — string fallback
 *   3. throw
 *
 * Per-branch shape:
 *   - P2TR:        witnessUtxo + tapInternalKey (from opts.taprootPubKeyXOnly)
 *   - P2WPKH:      witnessUtxo
 *   - P2SH_P2WPKH: witnessUtxo (outer P2SH script) + redeemScript (inner P2WPKH)
 *   - P2PKH:       nonWitnessUtxo (full prev-tx hex, required)
 */
export function addInputDynamic(
  psbt: bitcoin.Psbt,
  network: bitcoin.Network,
  utxo: SubfrostUtxo,
  opts: AddInputDynamicOpts,
): void {
  const scriptBuf = Buffer.from(utxo.scriptPubKeyHex, 'hex');
  const utxoTag = `${utxo.txid}:${utxo.vout}`;

  let type = redeemTypeFromOutput(scriptBuf, network);
  if (type === null) {
    type = getAddressType(utxo.address, network);
  }
  if (type === null) {
    throw new Error(
      `addInputDynamic: unsupported address type for UTXO ${utxoTag} (address=${utxo.address || '<empty>'})`,
    );
  }

  const valueBig = BigInt(utxo.value);
  // Common header — sequence is conditionally folded in via spread.
  const seqFragment = utxo.sequence !== undefined ? { sequence: utxo.sequence } : {};

  switch (type) {
    case AddressType.P2TR: {
      const xOnlyHex = toXOnlyPubKeyHex(opts.taprootPubKeyXOnly);
      if (!xOnlyHex) {
        throw new Error(
          `addInputDynamic: P2TR input requires taprootPubKeyXOnly (utxo=${utxoTag})`,
        );
      }
      if (xOnlyHex.length !== X_ONLY_HEX_LENGTH) {
        throw new Error(
          `addInputDynamic: P2TR taprootPubKeyXOnly must be ${X_ONLY_HEX_LENGTH} hex chars (utxo=${utxoTag}, got=${xOnlyHex.length})`,
        );
      }
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        ...seqFragment,
        witnessUtxo: { script: new Uint8Array(scriptBuf), value: valueBig },
        tapInternalKey: new Uint8Array(Buffer.from(xOnlyHex, 'hex')),
      });
      return;
    }

    case AddressType.P2WPKH: {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        ...seqFragment,
        witnessUtxo: { script: new Uint8Array(scriptBuf), value: valueBig },
      });
      return;
    }

    case AddressType.P2SH_P2WPKH: {
      if (!opts.nativeSegwitPubkeyHex) {
        throw new Error(
          `addInputDynamic: P2SH-P2WPKH input requires nativeSegwitPubkeyHex (utxo=${utxoTag})`,
        );
      }
      const pubkey = new Uint8Array(
        Buffer.from(opts.nativeSegwitPubkeyHex, 'hex'),
      );
      const inner = bitcoin.payments.p2wpkh({ pubkey, network });
      const outer = bitcoin.payments.p2sh({ redeem: inner, network });
      if (!inner.output || !outer.output) {
        throw new Error(
          `addInputDynamic: P2SH-P2WPKH script construction failed (utxo=${utxoTag})`,
        );
      }
      // Sanity: derived outer P2SH must match the prevout scriptPubKey.
      // Mismatch ⇒ wallet handed us a pubkey for a different address;
      // catching it here beats a sighash mismatch at sign time.
      const outerBuf = Buffer.from(outer.output);
      if (!outerBuf.equals(scriptBuf)) {
        throw new Error(
          `addInputDynamic: P2SH-P2WPKH pubkey does not match UTXO scriptPubKey (utxo=${utxoTag})`,
        );
      }
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        ...seqFragment,
        witnessUtxo: { script: new Uint8Array(outer.output), value: valueBig },
        redeemScript: new Uint8Array(inner.output),
      });
      return;
    }

    case AddressType.P2PKH: {
      if (!utxo.prevTxHex) {
        throw new Error(
          `addInputDynamic: P2PKH input requires prevTxHex (utxo=${utxoTag})`,
        );
      }
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        ...seqFragment,
        nonWitnessUtxo: new Uint8Array(Buffer.from(utxo.prevTxHex, 'hex')),
      });
      return;
    }
  }
}
