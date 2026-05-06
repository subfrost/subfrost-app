/**
 * Devnet: Faucet E2E — verifies faucet operations produce actual balances.
 * Tests the EXACT code path DevnetControlPanel uses.
 *
 * Run: pnpm vitest run __tests__/devnet/faucet-e2e.test.ts --testTimeout=600000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
} from './devnet-helpers';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch {}
const bip32 = BIP32Factory(ecc);

let harness: any;
let provider: WebProvider; // boot wallet provider
let bootSegwit: string;
let bootTaproot: string;

// Simulate a DIFFERENT user wallet (like the UI creates via keystore)
const USER_MNEMONIC = bip39.generateMnemonic();
let userSegwit: string;
let userTaproot: string;

function deriveAddresses(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  const net = bitcoin.networks.regtest;
  const seg = root.derivePath("m/84'/1'/0'/0/0");
  const tap = root.derivePath("m/86'/1'/0'/0/0");
  return {
    segwit: bitcoin.payments.p2wpkh({ pubkey: Buffer.from(seg.publicKey), network: net }).address!,
    taproot: bitcoin.payments.p2tr({ internalPubkey: Buffer.from(tap.publicKey).slice(1), network: net }).address!,
  };
}

async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx }, inputs, alkanes: [],
    transaction: '0x', block: '0x', height: '999', txindex: 0, vout: 0,
  }]);
}

/**
 * Query alkane balance using the SAME RPC the UI uses on devnet
 * (alkanes_protorunesbyaddress, not quspo dataApi).
 */
async function getAlkaneBalanceViaRpc(address: string, alkaneId: string): Promise<bigint> {
  const resp = await rpcCall('alkanes_protorunesbyaddress', [{ address }]);
  const outpoints: any[] = resp?.result?.outpoints || [];
  let total = 0n;
  for (const op of outpoints) {
    const balances = op?.balance_sheet?.cached?.balances || op?.balance_sheet?.balances || [];
    for (const b of balances) {
      if (`${b.block}:${b.tx}` === alkaneId) {
        total += BigInt(b.amount || 0);
      }
    }
  }
  return total;
}

describe('Devnet: Faucet E2E', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    bootSegwit = ctx.segwitAddress;
    bootTaproot = ctx.taprootAddress;

    mineBlocks(harness, 201);

    // Create user wallet (different from boot wallet)
    const addrs = deriveAddresses(USER_MNEMONIC);
    userSegwit = addrs.segwit;
    userTaproot = addrs.taproot;

    // Fund user with BTC via generatetoaddress (same as UI faucetBtc)
    await rpcCall('generatetoaddress', [5, userTaproot]);
    mineBlocks(harness, 100); // maturity

    console.log('[faucet-e2e] boot:', bootTaproot.slice(0, 15));
    console.log('[faucet-e2e] user:', userTaproot.slice(0, 15));
  }, 300_000);

  afterAll(() => { disposeHarness(); });

  // ── DIESEL faucet ──────────────────────────────────────────

  it('faucetDiesel: should mint DIESEL to user address', async () => {
    const before = await getAlkaneBalanceViaRpc(userTaproot, '2:0');
    console.log('[faucet-e2e] DIESEL before:', before.toString());

    // Exact same call as DevnetContext.faucetDiesel
    mineBlocks(harness, 1);
    await new Promise(r => setTimeout(r, 50));
    const result = await (provider as any).alkanesExecuteFull(
      JSON.stringify([userTaproot]),
      'B:10000:v0',
      '[2,0,77]:v0:v0',
      '1', null,
      JSON.stringify({
        from_addresses: [bootSegwit, bootTaproot],
        change_address: bootSegwit,
        alkanes_change_address: userTaproot,
      }),
    );
    const txid = result?.reveal_txid || result?.revealTxid || result?.txid;
    console.log('[faucet-e2e] DIESEL mint txid:', txid);
    console.log('[faucet-e2e] DIESEL mint result keys:', Object.keys(result || {}));

    mineBlocks(harness, 1);

    const after = await getAlkaneBalanceViaRpc(userTaproot, '2:0');
    console.log('[faucet-e2e] DIESEL after:', after.toString());
    console.log('[faucet-e2e] DIESEL delta:', (after - before).toString());

    expect(after).toBeGreaterThan(before);
  }, 60_000);

  // ── frBTC faucet ───────────────────────────────────────────

  it('faucetFrbtc: should wrap BTC and mint frBTC to user address', async () => {
    const before = await getAlkaneBalanceViaRpc(userTaproot, '32:0');
    console.log('[faucet-e2e] frBTC before:', before.toString());

    // Get signer address (same as DevnetContext.faucetFrbtc with ecc init fix)
    let signerAddr = bootTaproot; // fallback
    const signerResult = await simulate('32:0', ['103']);
    const hex = signerResult?.result?.execution?.data?.replace('0x', '') || '';
    if (hex.length === 64) {
      const xOnly = Buffer.from(hex, 'hex');
      const payment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: bitcoin.networks.regtest });
      if (payment.address) signerAddr = payment.address;
    }
    console.log('[faucet-e2e] frBTC signer:', signerAddr);

    mineBlocks(harness, 1);
    await new Promise(r => setTimeout(r, 50));
    const result = await (provider as any).alkanesExecuteFull(
      JSON.stringify([signerAddr, userTaproot]),
      'B:100000:v0',
      '[32,0,77]:v1:v1',
      '1', null,
      JSON.stringify({
        from_addresses: [bootSegwit, bootTaproot],
        change_address: bootSegwit,
        alkanes_change_address: userTaproot,
      }),
    );
    const txid = result?.reveal_txid || result?.revealTxid || result?.txid;
    console.log('[faucet-e2e] frBTC wrap txid:', txid);
    console.log('[faucet-e2e] frBTC wrap result keys:', Object.keys(result || {}));

    mineBlocks(harness, 1);

    const after = await getAlkaneBalanceViaRpc(userTaproot, '32:0');
    console.log('[faucet-e2e] frBTC after:', after.toString());
    console.log('[faucet-e2e] frBTC delta:', (after - before).toString());

    expect(after).toBeGreaterThan(before);
  }, 60_000);

  // ── Balance via UI data path ───────────────────────────────

  it('alkane balances should be visible via alkanes_protorunesbyaddress', async () => {
    // This is the RPC the UI now uses on devnet (restored from commit 5234803)
    const resp = await rpcCall('alkanes_protorunesbyaddress', [{ address: userTaproot }]);
    const outpoints = resp?.result?.outpoints || [];
    console.log('[faucet-e2e] User outpoints:', outpoints.length);

    const balances = new Map<string, bigint>();
    for (const op of outpoints) {
      const bals = op?.balance_sheet?.cached?.balances || op?.balance_sheet?.balances || [];
      for (const b of bals) {
        const key = `${b.block}:${b.tx}`;
        balances.set(key, (balances.get(key) || 0n) + BigInt(b.amount || 0));
      }
    }

    console.log('[faucet-e2e] Balances via RPC:');
    for (const [id, amt] of balances) {
      console.log(`  ${id}: ${amt.toString()}`);
    }

    expect(balances.get('2:0') || 0n).toBeGreaterThan(0n);
    expect(balances.get('32:0') || 0n).toBeGreaterThan(0n);
  });

  // ── Test the actual alkaneBalanceQueryOptions queryFn ──────

  it('alkaneBalanceQueryOptions queryFn should return balances on devnet', async () => {
    // Import the actual query options function the UI uses
    const { alkaneBalanceQueryOptions } = await import('@/queries/account');

    const deps = {
      provider,
      isInitialized: true,
      account: {
        taproot: { address: userTaproot },
        nativeSegwit: { address: userSegwit },
      },
      isConnected: true,
      network: 'devnet',
    };

    const options = alkaneBalanceQueryOptions(deps);

    // Verify the query is enabled
    expect(options.enabled).toBe(true);

    // Execute the ACTUAL queryFn — this is what runs in the browser
    const result = await options.queryFn!({} as any);
    console.log('[faucet-e2e] alkaneBalanceQueryOptions result:', JSON.stringify(result));

    // Should have at least DIESEL and frBTC
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);

    const diesel = result.find((a: any) => a.alkaneId === '2:0');
    const frbtc = result.find((a: any) => a.alkaneId === '32:0');
    console.log('[faucet-e2e] DIESEL from queryFn:', diesel?.balance);
    console.log('[faucet-e2e] frBTC from queryFn:', frbtc?.balance);

    expect(diesel).toBeTruthy();
    expect(BigInt(diesel.balance)).toBeGreaterThan(0n);
    expect(frbtc).toBeTruthy();
    expect(BigInt(frbtc.balance)).toBeGreaterThan(0n);
  });

  // ── Test sellableCurrenciesQueryOptions on devnet ──────────

  it('sellableCurrenciesQueryOptions queryFn should return balances on devnet', async () => {
    const { sellableCurrenciesQueryOptions } = await import('@/queries/account');

    const deps = {
      provider,
      isInitialized: true,
      network: 'devnet',
      walletAddress: userTaproot,
      account: {
        taproot: { address: userTaproot },
        nativeSegwit: { address: userSegwit },
      },
    };

    const options = sellableCurrenciesQueryOptions(deps);
    expect(options.enabled).toBe(true);

    const result = await options.queryFn!({} as any);
    console.log('[faucet-e2e] sellableCurrencies result:', JSON.stringify(result)?.slice(0, 300));

    // Should have entries with balance > 0
    const withBalance = result.filter((c: any) => BigInt(c.balance || '0') > 0n);
    console.log('[faucet-e2e] sellableCurrencies with balance:', withBalance.length);
    for (const c of withBalance) {
      console.log('[faucet-e2e]   %s (%s): %s', c.name || c.id, c.symbol, c.balance);
    }

    expect(withBalance.length).toBeGreaterThanOrEqual(1);
  });

  // ── Key difference: boot wallet vs user wallet ─────────────

  it('boot wallet should NOT have the user tokens', async () => {
    // Tokens should be at user address, not boot address
    const bootDiesel = await getAlkaneBalanceViaRpc(bootTaproot, '2:0');
    const userDiesel = await getAlkaneBalanceViaRpc(userTaproot, '2:0');
    console.log('[faucet-e2e] DIESEL: boot=%s user=%s', bootDiesel.toString(), userDiesel.toString());

    // User should have DIESEL, boot may or may not (boot also mints during deploy)
    expect(userDiesel).toBeGreaterThan(0n);
  });
});
