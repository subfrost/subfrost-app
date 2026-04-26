/**
 * Shared helper utilities for alkanes operations.
 *
 * Single source of truth — imported by both React hooks and integration tests.
 * Previously duplicated across all mutation hooks.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { SIGNER_ADDRESSES } from './constants';

/**
 * Convert Uint8Array to base64 string.
 * Works in both browser and Node.js environments.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Get the bitcoinjs-lib network object for a given network string.
 */
export function getBitcoinNetwork(network: string): bitcoin.Network {
  switch (network) {
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    case 'testnet':
    case 'signet':
      return bitcoin.networks.testnet;
    case 'regtest':
    case 'regtest-local':
    case 'subfrost-regtest':
    case 'devnet':
    case 'oylnet':
      return bitcoin.networks.regtest;
    default:
      return bitcoin.networks.bitcoin;
  }
}

/**
 * Get the frBTC signer address for a given network.
 * Throws if no signer address is configured.
 */
export function getSignerAddress(network: string): string {
  const signer = SIGNER_ADDRESSES[network];
  if (!signer) {
    throw new Error(`No signer address configured for network: ${network}`);
  }
  return signer;
}

/**
 * Dynamically query the frBTC signer address from the contract via opcode 103.
 *
 * Why dynamic: on devnet the signer key changes each boot, and on regtest-local
 * (the SSH-tunneled metabot stack) the FROST signing group may not match the
 * hardcoded `SIGNER_ADDRESSES['regtest']` value at all. Verified 2026-04-26
 * during the perf-branch QA session: hosted regtest signer is `bcrt1p466wtm…`
 * (matches `SIGNER_ADDRESSES.regtest`) but metabot regtest-local signer is
 * `bcrt1p5lushq…` (derived from x-only pubkey `7940ef3b…` returned by opcode
 * 103). Wraps to the wrong signer silently confirm but mint zero frBTC.
 *
 * Derivation: opcode 103 returns the 32-byte x-only OUTPUT pubkey of the
 * FROST signing group's P2TR address. Pass it as `internalPubkey` to
 * `bitcoin.payments.p2tr({...})` — bitcoinjs-lib applies the BIP341 even-y
 * tweak internally, which matches how the contract derived its own signer
 * address in the first place. (Do NOT manually wrap the bytes as a script
 * `0x51 0x20 <xonly>` — that produces a different, wrong address.)
 *
 * Falls back to the static `SIGNER_ADDRESSES` entry if the query fails.
 */
export async function getSignerAddressDynamic(network: string): Promise<string> {
  try {
    const { getRpcUrl } = await import('@/utils/getConfig');
    const rpcUrl = getRpcUrl(network);
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target: { block: '32', tx: '0' },
          inputs: ['103'],
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '999',
          txindex: 0,
          vout: 0,
        }],
        id: 1,
      }),
    });
    const data = await resp.json();
    const hex = data?.result?.execution?.data?.replace('0x', '') || '';
    if (hex.length === 64) {
      const bitcoin = await import('bitcoinjs-lib');
      const ecc = await import('@bitcoinerlab/secp256k1');
      bitcoin.initEccLib(ecc);
      const xOnly = Buffer.from(hex, 'hex');
      const btcNetwork = network.includes('regtest') || network === 'devnet'
        ? bitcoin.networks.regtest
        : network === 'testnet' || network === 'signet'
          ? bitcoin.networks.testnet
          : bitcoin.networks.bitcoin;
      const payment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: btcNetwork });
      if (payment.address) return payment.address;
    }
  } catch (e: any) {
    console.warn('[getSignerAddressDynamic] Failed, using static fallback:', e?.message);
  }
  return getSignerAddress(network);
}

/**
 * Parse protostones string to find the maximum vN output index referenced.
 * Used to auto-generate the correct number of to_addresses.
 */
export function parseMaxVoutFromProtostones(protostones: string): number {
  let maxVout = 0;
  const voutMatches = protostones.matchAll(/v(\d+)/g);
  for (const match of voutMatches) {
    const idx = parseInt(match[1], 10);
    if (idx > maxVout) maxVout = idx;
  }
  return maxVout;
}

/**
 * Convert display amount to alks (atomic units).
 * Default is 8 decimals for alkane tokens.
 */
export function toAlks(amount: string, decimals: number = 8): string {
  if (!amount) return '0';
  // Simple string-based conversion to avoid BigNumber dependency in shared layer
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac}`;
}

/**
 * Extract a PSBT as base64 from the various formats the WASM SDK can return.
 * Handles: Uint8Array, base64 string, and numeric-key objects.
 */
export function extractPsbtBase64(psbt: unknown): string {
  if (psbt instanceof Uint8Array) {
    return uint8ArrayToBase64(psbt);
  }
  if (typeof psbt === 'string') {
    return psbt;
  }
  if (typeof psbt === 'object' && psbt !== null) {
    const keys = Object.keys(psbt).map(Number).sort((a, b) => a - b);
    const bytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      bytes[i] = (psbt as Record<number, number>)[keys[i]];
    }
    return uint8ArrayToBase64(bytes);
  }
  throw new Error('Unexpected PSBT format: ' + typeof psbt);
}

/**
 * Pre-fetch clean BTC UTXOs for `provider.alkanesExecuteTyped({ paymentUtxos })`.
 *
 * When `paymentUtxos` is supplied the WASM SDK skips its lua
 * `spendable_utxos.lua` flow, which does an `esplora_tx()` round-trip per UTXO
 * to check coinbase maturity. Wallets with many UTXOs spend several minutes
 * inside the WASM otherwise.
 *
 * Two fast sources, in order of preference:
 *   1. UniSat `getBitcoinUtxos()` — wallet-side, already filtered.
 *   2. `provider.dataApiGetAlkanesUtxo(address)` — single HTTP call returning
 *      every UTXO at the address with full enrichment (alkanes, inscriptions,
 *      runes, satoshis). We filter to confirmed, non-dust, fully clean entries.
 *
 * Caller must only pass addresses that match the addresses the SDK will sign
 * for. Browser wallets and `useActualAddresses` networks always pass actual
 * addresses, so this is safe. For keystore on regtest/mainnet the SDK resolves
 * symbolic `p2tr:0`/`p2wpkh:0` against the WASM-loaded keystore (coinType=1 on
 * regtest), so callers must skip this helper there to avoid producing a PSBT
 * with inputs from coinType=0 (JS-derived) addresses that can't be signed.
 *
 * Returns undefined when no clean UTXOs are found, so callers let the SDK fall
 * back to its own lua-based discovery without distinguishing failure modes.
 */
export async function getCleanPaymentUtxos(opts: {
  provider: { dataApiGetAlkanesUtxo(address: string): Promise<unknown> };
  addresses: (string | undefined | null)[];
  unisat?: { getBitcoinUtxos?: () => Promise<Array<{ txid: string; vout: number; satoshis: number }>> };
}): Promise<string[] | undefined> {
  if (opts.unisat?.getBitcoinUtxos) {
    try {
      const btcUtxos = await opts.unisat.getBitcoinUtxos();
      if (btcUtxos?.length) {
        return btcUtxos.map((u) => `${u.txid}:${u.vout}:${u.satoshis}`);
      }
    } catch { /* fall through */ }
  }

  const sources = opts.addresses.filter(Boolean) as string[];
  if (sources.length === 0) return undefined;

  try {
    const lists = await Promise.all(
      sources.map((addr) => opts.provider.dataApiGetAlkanesUtxo(addr).catch(() => null)),
    );

    const cleaned: string[] = [];
    for (const list of lists) {
      const entries: any[] = (list as any)?.data ?? (Array.isArray(list) ? list : []);
      for (const u of entries) {
        const sats = Number(u.satoshis ?? u.value ?? 0);
        const alkaneCount = u.alkanes ? Object.keys(u.alkanes).length : 0;
        const runeCount = u.runes ? Object.keys(u.runes).length : 0;
        const inscriptionCount = Array.isArray(u.inscriptions) ? u.inscriptions.length : 0;
        if (sats > 1000 && alkaneCount === 0 && runeCount === 0 && inscriptionCount === 0) {
          cleaned.push(`${u.txId ?? u.txid}:${u.outputIndex ?? u.vout}:${sats}`);
        }
      }
    }
    return cleaned.length ? cleaned : undefined;
  } catch {
    return undefined;
  }
}
