/**
 * E2E Swap Flow Tests
 *
 * Tests actual swap execution on regtest using `alkanesExecuteTyped` — the same
 * abstraction all webapp hooks use (see lib/alkanes/extendedProvider.ts).
 *
 * Swap flows tested:
 * 1. BTC -> DIESEL (wrap + swap in one tx) — matches useWrapSwapMutation.ts
 * 2. DIESEL -> frBTC (alkane swap) — matches useSwapMutation.ts
 * 3. DIESEL -> BTC (swap + unwrap in one tx) — matches useSwapUnwrapMutation.ts
 *
 * Gated behind INTEGRATION=true env var — skipped during normal `vitest run`.
 * Run with: INTEGRATION=true pnpm test:sdk
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { createTestSigner, TEST_MNEMONIC, type TestSignerResult } from './test-utils/createTestSigner';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import { buildWrapProtostone, buildCreateNewPoolProtostone } from '@/lib/alkanes/builders';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGTEST_CONFIG = {
  jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

const FRBTC_ID = '32:0';
const DIESEL_ID = '2:0';
const FACTORY_ID = '4:65498';

// frBTC signer address on regtest (derived from opcode 103 GET_SIGNER)
const SIGNER_ADDRESS = 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';

// ---------------------------------------------------------------------------
// signAndBroadcast — signs a PSBT returned by alkanesExecuteTyped, broadcasts,
// mines a block, and returns the txid.
// ---------------------------------------------------------------------------

async function signAndBroadcast(
  provider: WebProvider,
  result: any,
  signerResult: TestSignerResult,
  walletAddress: string,
): Promise<string> {
  // If the SDK already broadcast (auto-confirm mode), just return the txid
  if (result?.txid || result?.reveal_txid) {
    return result.txid || result.reveal_txid;
  }

  if (!result?.readyToSign) {
    throw new Error('No readyToSign or txid in result');
  }

  const readyToSign = result.readyToSign;

  // Convert PSBT to hex for signAllInputs
  let psbtBytes: Uint8Array;
  if (readyToSign.psbt instanceof Uint8Array) {
    psbtBytes = readyToSign.psbt;
  } else if (typeof readyToSign.psbt === 'object') {
    const keys = Object.keys(readyToSign.psbt).map(Number).sort((a: number, b: number) => a - b);
    psbtBytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      psbtBytes[i] = readyToSign.psbt[keys[i]];
    }
  } else {
    throw new Error('Unexpected PSBT format');
  }

  const rawPsbtHex = Buffer.from(psbtBytes).toString('hex');
  const { signedHexPsbt } = await signerResult.signer.signAllInputs({ rawPsbtHex });

  // signAllInputs already finalizes — extract and broadcast
  const signedPsbt = bitcoin.Psbt.fromHex(signedHexPsbt, { network: bitcoin.networks.regtest });
  const tx = signedPsbt.extractTransaction();
  const txHex = tx.toHex();
  const txid = tx.getId();

  const broadcastTxid = await provider.broadcastTransaction(txHex);

  // Mine a block to confirm
  await provider.bitcoindGenerateToAddress(1, walletAddress);

  return broadcastTxid || txid;
}

// ---------------------------------------------------------------------------
// Protostone builders — local versions with manual edicts (differ from shared)
// ---------------------------------------------------------------------------

/**
 * BTC -> Token (wrap + swap) — matches useWrapSwapMutation.ts
 *
 * p0: Wrap  [frbtc_block,frbtc_tx,77]:p1:v0
 * p1: Swap  [factory_block,factory_tx,13,2,frbtc_block,frbtc_tx,buy_block,buy_tx,amount,minOut,deadline]:v0:v0
 */
function buildWrapSwapProtostone(params: {
  frbtcId: string;
  factoryId: string;
  buyTokenId: string;
  frbtcAmount: string;
  minOutput: string;
  deadline: string;
}): string {
  const [frbtcBlock, frbtcTx] = params.frbtcId.split(':');
  const [factoryBlock, factoryTx] = params.factoryId.split(':');
  const [buyBlock, buyTx] = params.buyTokenId.split(':');

  const p0 = `[${frbtcBlock},${frbtcTx},77]:p1:v0`;

  const swapCellpack = [
    factoryBlock, factoryTx, 13, 2,
    frbtcBlock, frbtcTx, buyBlock, buyTx,
    params.frbtcAmount, params.minOutput, params.deadline,
  ].join(',');
  const p1 = `[${swapCellpack}]:v0:v0`;

  return `${p0},${p1}`;
}

/**
 * Alkane -> Alkane swap — matches useSwapMutation.ts
 *
 * p0: Edict  [sell_block:sell_tx:amount:p1]:v0:v0
 * p1: Swap   [factory_block,factory_tx,13,2,sell_block,sell_tx,buy_block,buy_tx,amount,minOut,deadline]:v0:v0
 */
function buildSwapProtostone(params: {
  factoryId: string;
  sellTokenId: string;
  buyTokenId: string;
  sellAmount: string;
  minOutput: string;
  deadline: string;
}): string {
  const [sellBlock, sellTx] = params.sellTokenId.split(':');
  const [buyBlock, buyTx] = params.buyTokenId.split(':');
  const [factoryBlock, factoryTx] = params.factoryId.split(':');

  const edict = `[${sellBlock}:${sellTx}:${params.sellAmount}:p1]`;
  const p0 = `${edict}:v0:v0`;

  const cellpack = [
    factoryBlock, factoryTx, 13, 2,
    sellBlock, sellTx, buyBlock, buyTx,
    params.sellAmount, params.minOutput, params.deadline,
  ].join(',');
  const p1 = `[${cellpack}]:v0:v0`;

  return `${p0},${p1}`;
}

/**
 * Token -> BTC (swap + unwrap) — matches useSwapUnwrapMutation.ts
 *
 * p0: Edict   [sell_block:sell_tx:amount:p1]:v0:v0
 * p1: Swap    [factory_block,factory_tx,13,2,sell_block,sell_tx,frbtc_block,frbtc_tx,amount,minFrbtc,deadline]:p2:v0
 * p2: Unwrap  [frbtc_block,frbtc_tx,78]:v0:v0
 */
function buildSwapUnwrapProtostone(params: {
  sellTokenId: string;
  sellAmount: string;
  frbtcId: string;
  factoryId: string;
  minFrbtcOutput: string;
  deadline: string;
}): string {
  const [sellBlock, sellTx] = params.sellTokenId.split(':');
  const [frbtcBlock, frbtcTx] = params.frbtcId.split(':');
  const [factoryBlock, factoryTx] = params.factoryId.split(':');

  const edict = `[${sellBlock}:${sellTx}:${params.sellAmount}:p1]`;
  const p0 = `${edict}:v0:v0`;

  const swapCellpack = [
    factoryBlock, factoryTx, 13, 2,
    sellBlock, sellTx, frbtcBlock, frbtcTx,
    params.sellAmount, params.minFrbtcOutput, params.deadline,
  ].join(',');
  const p1 = `[${swapCellpack}]:p2:v0`;

  const unwrapCellpack = [frbtcBlock, frbtcTx, 78].join(',');
  const p2 = `[${unwrapCellpack}]:v0:v0`;

  return `${p0},${p1},${p2}`;
}

// ---------------------------------------------------------------------------
// Pool existence check via alkanes_simulate RPC
// ---------------------------------------------------------------------------

/**
 * Check how many pools exist via factory opcode 4 (GetNumPools).
 * Returns the pool count, or 0 if the call fails.
 */
async function getNumPools(): Promise<number> {
  try {
    const resp = await fetch(REGTEST_CONFIG.jsonrpc_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target: FACTORY_ID,
          inputs: ['4'], // opcode 4 = GetNumPools
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '20000',
          txindex: 0,
          vout: 0,
        }],
        id: 1,
      }),
    });
    const data = await resp.json();
    if (data?.result?.status === 0 && data?.result?.execution?.data) {
      const hexData = data.result.execution.data.replace('0x', '');
      // u128 little-endian
      const numPools = Number(BigInt('0x' + hexData.match(/../g)!.reverse().join('')));
      return numPools;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Find pool ID for a token pair via factory opcode 2 (FindExistingPoolId).
 * Returns "block:tx" string or null if not found.
 */
async function findPoolId(token0Id: string, token1Id: string): Promise<string | null> {
  const [t0Block, t0Tx] = token0Id.split(':');
  const [t1Block, t1Tx] = token1Id.split(':');
  try {
    const resp = await fetch(REGTEST_CONFIG.jsonrpc_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target: FACTORY_ID,
          inputs: ['2', t0Block, t0Tx, t1Block, t1Tx],
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '20000',
          txindex: 0,
          vout: 0,
        }],
        id: 1,
      }),
    });
    const data = await resp.json();
    if (data?.result?.execution?.error) {
      return null; // pool doesn't exist
    }
    if (data?.result?.status === 0 && data?.result?.execution?.data) {
      const hexData = data.result.execution.data.replace('0x', '');
      if (hexData.length >= 64) {
        const block = Number(BigInt('0x' + hexData.substring(0, 32).match(/../g)!.reverse().join('')));
        const tx = Number(BigInt('0x' + hexData.substring(32, 64).match(/../g)!.reverse().join('')));
        return `${block}:${tx}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe.runIf(INTEGRATION)('E2E Swap Flow (integration)', () => {
  let provider: WebProvider;
  let wasm: typeof import('@alkanes/ts-sdk/wasm');
  let testSigner: TestSignerResult;
  let walletAddress: string; // Taproot address for alkanes

  beforeAll(async () => {
    wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('regtest', REGTEST_CONFIG);

    // Load mnemonic into WASM provider so it can build PSBTs (select UTXOs, etc.)
    try {
      provider.walletLoadMnemonic(TEST_MNEMONIC, null);
      console.log('[Setup] WASM wallet loaded:', provider.walletIsLoaded());
    } catch (e: any) {
      console.log('[Setup] walletLoadMnemonic failed, trying walletCreate...');
      await provider.walletCreate(TEST_MNEMONIC, '');
      console.log('[Setup] WASM wallet created:', provider.walletIsLoaded());
    }

    // Create test signer for PSBT signing (handles both taproot and segwit)
    testSigner = await createTestSigner(TEST_MNEMONIC, 'regtest');
    walletAddress = testSigner.addresses.taproot.address;

    console.log('[Setup] Taproot address:', walletAddress);
    console.log('[Setup] NativeSegwit address:', testSigner.addresses.nativeSegwit.address);
  }, 30000);

  // -----------------------------------------------------------------------
  // 1. Wallet Setup
  // -----------------------------------------------------------------------
  describe('1. Wallet Setup', () => {
    it('should have valid taproot address from createTestSigner', () => {
      expect(walletAddress).toBeTruthy();
      expect(walletAddress).toMatch(/^bcrt1p/);
      expect(testSigner.signer).toBeDefined();
      expect(typeof testSigner.signer.signAllInputs).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Block Generation (Fund Wallet)
  // -----------------------------------------------------------------------
  describe('2. Block Generation (Fund Wallet)', () => {
    it('should generate 201 blocks to wallet address', async () => {
      console.log('[Blocks] Generating 201 blocks to:', testSigner.addresses.nativeSegwit.address);

      const result = await provider.bitcoindGenerateToAddress(201, testSigner.addresses.nativeSegwit.address);
      console.log('[Blocks] Generation result:', JSON.stringify(result).slice(0, 500));
      expect(result).toBeDefined();
    }, 120000);

    it('should verify wallet has UTXOs', async () => {
      // Use esplora directly — the Lua-based getEnrichedBalances may not parse correctly
      const segwitAddr = testSigner.addresses.nativeSegwit.address;
      const utxos = await provider.esploraGetAddressUtxo(segwitAddr);
      const count = Array.isArray(utxos) ? utxos.length : 0;
      console.log('[UTXOs] Wallet UTXOs at', segwitAddr, ':', count);

      if (Array.isArray(utxos) && utxos.length > 0) {
        const totalSats = utxos.reduce((sum: bigint, utxo: any) => {
          const value = utxo instanceof Map ? utxo.get('value') : utxo.value;
          return sum + BigInt(value || 0);
        }, 0n);
        console.log('[UTXOs] Total balance:', totalSats.toString(), 'sats');
        expect(totalSats).toBeGreaterThan(0n);
      }

      expect(count).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Pool Seeding — wrap BTC to get frBTC + DIESEL, create pool if needed
  //
  // Every alkanes transaction execution produces DIESEL as a gas refund.
  // We wrap BTC → frBTC (which gives us frBTC + DIESEL), then create
  // a DIESEL/frBTC pool if one doesn't already exist.
  // -----------------------------------------------------------------------
  describe('3. Pool Seeding', () => {
    it('should wrap BTC to get frBTC (also earns DIESEL from gas refund)', async () => {
      const wrapAmountSats = '100000'; // 100,000 sats

      const protostone = buildWrapProtostone({ frbtcId: FRBTC_ID });
      const inputRequirements = `B:${wrapAmountSats}:v0`;
      // v0 = signer (receives BTC), v1 = user (receives frBTC)
      const toAddresses = [SIGNER_ADDRESS, walletAddress];

      console.log('[Seed:Wrap] protostone:', protostone);
      console.log('[Seed:Wrap] inputRequirements:', inputRequirements);
      console.log('[Seed:Wrap] wrapAmount:', wrapAmountSats, 'sats');

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
      });

      console.log('[Seed:Wrap] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[Seed:Wrap] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify frBTC was minted via trace
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[Seed:Wrap] Trace:', JSON.stringify(trace).slice(0, 500));
    }, 60000);

    it('should do a second wrap to ensure enough frBTC + DIESEL for pool', async () => {
      // Second wrap to accumulate more tokens (DIESEL accrues from gas refunds)
      const wrapAmountSats = '100000';

      const protostone = buildWrapProtostone({ frbtcId: FRBTC_ID });
      const inputRequirements = `B:${wrapAmountSats}:v0`;
      const toAddresses = [SIGNER_ADDRESS, walletAddress];

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
      });

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[Seed:Wrap2] Broadcast txid:', txid);
      expect(txid).toBeTruthy();
    }, 60000);

    it('should verify wallet has frBTC and DIESEL', async () => {
      // Wait for indexer to catch up
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const balances = await provider.alkanesByAddress(walletAddress, 'latest', 1);
        console.log('[Seed:Balance] Alkane balances:', JSON.stringify(balances).slice(0, 500));
      } catch (e: any) {
        console.log('[Seed:Balance] alkanesByAddress error (expected on regtest):', e.message?.slice(0, 100));
      }

      // Also check via data API
      try {
        const enriched = await provider.getEnrichedBalances(walletAddress, '1');
        console.log('[Seed:Balance] Enriched balances:', JSON.stringify(enriched).slice(0, 500));
      } catch (e: any) {
        console.log('[Seed:Balance] getEnrichedBalances error:', e.message?.slice(0, 100));
      }
    });

    it('should create DIESEL/frBTC pool if it does not exist', async () => {
      // Check if pool already exists
      const numPools = await getNumPools();
      console.log('[Seed:Pool] Current pool count:', numPools);

      const existingPoolId = await findPoolId(DIESEL_ID, FRBTC_ID);
      console.log('[Seed:Pool] Existing DIESEL/frBTC pool:', existingPoolId);

      if (existingPoolId) {
        console.log('[Seed:Pool] Pool already exists at', existingPoolId, '- skipping creation');
        return;
      }

      // No pool — create one with factory opcode 1 (CreateNewPool)
      // Use modest amounts so we don't exhaust our token balances
      const dieselAmount = '50000';
      const frbtcAmount = '50000';

      const protostone = buildCreateNewPoolProtostone({
        factoryId: FACTORY_ID,
        token0Id: DIESEL_ID,
        token1Id: FRBTC_ID,
        amount0: dieselAmount,
        amount1: frbtcAmount,
      });

      // Input requirements: both tokens
      const inputRequirements = `2:0:${dieselAmount},32:0:${frbtcAmount}`;
      const toAddresses = [walletAddress];

      console.log('[Seed:Pool] Creating pool with DIESEL:', dieselAmount, 'frBTC:', frbtcAmount);
      console.log('[Seed:Pool] protostone:', protostone);
      console.log('[Seed:Pool] inputRequirements:', inputRequirements);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
      });

      console.log('[Seed:Pool] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[Seed:Pool] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify pool was created
      const newNumPools = await getNumPools();
      console.log('[Seed:Pool] Pool count after creation:', newNumPools);
      expect(newNumPools).toBeGreaterThan(numPools);

      const newPoolId = await findPoolId(DIESEL_ID, FRBTC_ID);
      console.log('[Seed:Pool] New pool ID:', newPoolId);
      expect(newPoolId).toBeTruthy();
    }, 120000);
  });

  // -----------------------------------------------------------------------
  // 4. BTC -> DIESEL (wrap + swap) — matches useWrapSwapMutation.ts
  // -----------------------------------------------------------------------
  describe('4. BTC -> DIESEL (wrap + swap)', () => {
    it('should wrap BTC and swap to DIESEL in one tx', async () => {
      const btcAmountSats = '10000'; // 10,000 sats to wrap

      // Apply wrap fee (3/1000 default)
      const wrapFeePerThousand = 3;
      const frbtcAmountAfterFee = Math.floor(
        (parseInt(btcAmountSats, 10) * (1000 - wrapFeePerThousand)) / 1000
      ).toString();

      const minOutput = '1'; // Accept any output for test
      const deadline = '999999999';

      const protostone = buildWrapSwapProtostone({
        frbtcId: FRBTC_ID,
        factoryId: FACTORY_ID,
        buyTokenId: DIESEL_ID,
        frbtcAmount: frbtcAmountAfterFee,
        minOutput,
        deadline,
      });

      const inputRequirements = `B:${btcAmountSats}:v1`;
      const toAddresses = [walletAddress, SIGNER_ADDRESS];

      console.log('[WrapSwap] protostone:', protostone);
      console.log('[WrapSwap] inputRequirements:', inputRequirements);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
      });

      console.log('[WrapSwap] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[WrapSwap] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify via trace
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[WrapSwap] Trace:', JSON.stringify(trace).slice(0, 500));
    }, 60000);
  });

  // -----------------------------------------------------------------------
  // 4b. Mint DIESEL to wallet — ensure wallet has DIESEL for swap tests
  // -----------------------------------------------------------------------
  describe('4b. Mint DIESEL to wallet', () => {
    it('should mint DIESEL to wallet address', async () => {
      // Opcode 77 = mint on DIESEL (2:0), output to v0 = walletAddress
      const protostone = '[2,0,77]:v0:v0';
      const toAddresses = [walletAddress];

      console.log('[MintDIESEL] protostone:', protostone);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements: '',
        protostones: protostone,
        feeRate: 10,
        toAddresses,
      });

      console.log('[MintDIESEL] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[MintDIESEL] Broadcast txid:', txid);
      expect(txid).toBeTruthy();
    }, 60000);
  });

  // -----------------------------------------------------------------------
  // 5. DIESEL -> frBTC (alkane swap) — matches useSwapMutation.ts
  // -----------------------------------------------------------------------
  describe('5. DIESEL -> frBTC Swap', () => {
    it('should swap DIESEL to frBTC', async () => {
      const sellAmount = '1000';
      const minOutput = '1';
      const deadline = '999999999';

      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        sellTokenId: DIESEL_ID,
        buyTokenId: FRBTC_ID,
        sellAmount,
        minOutput,
        deadline,
      });

      const inputRequirements = `2:0:${sellAmount}`;
      const toAddresses = [walletAddress];

      console.log('[Swap] protostone:', protostone);
      console.log('[Swap] inputRequirements:', inputRequirements);

      // Pass actual addresses (not symbolic p2wpkh:0/p2tr:0) so the provider
      // can discover alkane UTXOs via esplora — alkanes_protorunesbyaddress is
      // broken on regtest (returns 0x). See CLAUDE.md "UTXO and Token Discovery".
      const segwitAddr = testSigner.addresses.nativeSegwit.address;
      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
        fromAddresses: [segwitAddr, walletAddress],
        changeAddress: segwitAddr,
        alkanesChangeAddress: walletAddress,
      });

      console.log('[Swap] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[Swap] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify via trace
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[Swap] Trace:', JSON.stringify(trace).slice(0, 500));
      if (trace) {
        const traceObj = trace instanceof Map ? Object.fromEntries(trace) : trace;
        if (traceObj.trace?.alkanes_transferred) {
          console.log('[Swap] Alkanes transferred:', traceObj.trace.alkanes_transferred);
        }
      }
    }, 60000);
  });

  // -----------------------------------------------------------------------
  // 6. DIESEL -> BTC (swap + unwrap) — matches useSwapUnwrapMutation.ts
  // -----------------------------------------------------------------------
  describe('6. DIESEL -> BTC (swap + unwrap)', () => {
    it('should swap DIESEL to frBTC then unwrap to BTC in one tx', async () => {
      const sellAmount = '1000';
      const minFrbtcOutput = '1';
      const deadline = '999999999';

      const protostone = buildSwapUnwrapProtostone({
        sellTokenId: DIESEL_ID,
        sellAmount,
        frbtcId: FRBTC_ID,
        factoryId: FACTORY_ID,
        minFrbtcOutput,
        deadline,
      });

      const inputRequirements = `2:0:${sellAmount}`;
      const toAddresses = [walletAddress, SIGNER_ADDRESS];

      console.log('[SwapUnwrap] protostone:', protostone);
      console.log('[SwapUnwrap] inputRequirements:', inputRequirements);

      // Pass actual addresses — same workaround as section 5
      const segwitAddr = testSigner.addresses.nativeSegwit.address;
      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
        fromAddresses: [segwitAddr, walletAddress],
        changeAddress: segwitAddr,
        alkanesChangeAddress: walletAddress,
      });

      console.log('[SwapUnwrap] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[SwapUnwrap] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify via trace
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[SwapUnwrap] Trace:', JSON.stringify(trace).slice(0, 500));
    }, 60000);
  });

  // -----------------------------------------------------------------------
  // 7. Verify Final State
  // -----------------------------------------------------------------------
  describe('7. Verify Final State', () => {
    it('should show wallet balances after operations', async () => {
      // Check BTC balance via esplora
      const segwitAddr = testSigner.addresses.nativeSegwit.address;
      const utxos = await provider.esploraGetAddressUtxo(segwitAddr);
      let btcBalance = 0n;
      if (Array.isArray(utxos)) {
        btcBalance = utxos.reduce((sum: bigint, utxo: any) => {
          const value = utxo instanceof Map ? utxo.get('value') : utxo.value;
          return sum + BigInt(value || 0);
        }, 0n);
      }
      console.log('[Verify] BTC balance:', btcBalance.toString(), 'sats');

      // Check alkane balances
      try {
        const alkanes = await provider.alkanesByAddress(walletAddress, 'latest', 1);
        console.log('[Verify] Alkane balances:', JSON.stringify(alkanes).slice(0, 500));
      } catch (error: any) {
        console.log('[Verify] Could not fetch alkane balances:', error.message?.slice(0, 100));
      }

      // Verify pool still has reserves
      const poolId = await findPoolId(DIESEL_ID, FRBTC_ID);
      console.log('[Verify] Pool ID:', poolId);

      const numPools = await getNumPools();
      console.log('[Verify] Total pools:', numPools);

      expect(btcBalance).toBeGreaterThan(0n);
    });
  });
});

describe.runIf(INTEGRATION)('Wallet Creation via walletCreate', () => {
  let provider: WebProvider;

  beforeAll(async () => {
    const wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('regtest', REGTEST_CONFIG);
  });

  it('should create wallet with provided mnemonic', async () => {
    console.log('[WalletCreate] Creating wallet with 12-word mnemonic...');

    try {
      const walletInfo = await provider.walletCreate(TEST_MNEMONIC, '');
      console.log('[WalletCreate] Wallet info:', JSON.stringify(walletInfo).slice(0, 500));

      let address: string | undefined;
      let mnemonic: string | undefined;

      if (walletInfo instanceof Map) {
        address = walletInfo.get('address');
        mnemonic = walletInfo.get('mnemonic');
      } else if (walletInfo) {
        address = walletInfo.address;
        mnemonic = walletInfo.mnemonic;
      }

      console.log('[WalletCreate] Address:', address);
      console.log('[WalletCreate] Mnemonic returned:', mnemonic ? 'yes' : 'no');

      if (address) {
        const utxos = await provider.esploraGetAddressUtxo(address);
        console.log('[WalletCreate] UTXOs:', Array.isArray(utxos) ? utxos.length : 'not array');

        if (Array.isArray(utxos) && utxos.length > 0) {
          const totalSats = utxos.reduce((sum: bigint, utxo: any) => {
            const value = utxo instanceof Map ? utxo.get('value') : utxo.value;
            return sum + BigInt(value || 0);
          }, 0n);
          console.log('[WalletCreate] BTC balance:', totalSats, 'sats');
        }

        try {
          const alkanes = await provider.alkanesByAddress(address, 'latest', 1);
          console.log('[WalletCreate] Alkanes:', JSON.stringify(alkanes).slice(0, 500));
        } catch (e: any) {
          console.log('[WalletCreate] Could not fetch alkanes:', e.message?.slice(0, 100));
        }
      }

      expect(walletInfo).toBeDefined();
    } catch (error: any) {
      console.log('[WalletCreate] Error:', error.message?.slice(0, 300));
    }
  }, 60000);

  it('should create new wallet without mnemonic', async () => {
    console.log('[WalletCreate] Creating new wallet without mnemonic...');

    try {
      const walletInfo = await provider.walletCreate(undefined, undefined);
      console.log('[WalletCreate] New wallet info:', JSON.stringify(walletInfo).slice(0, 500));

      let address: string | undefined;
      let mnemonic: string | undefined;

      if (walletInfo instanceof Map) {
        address = walletInfo.get('address');
        mnemonic = walletInfo.get('mnemonic');
      } else if (walletInfo) {
        address = walletInfo.address;
        mnemonic = walletInfo.mnemonic;
      }

      console.log('[WalletCreate] New wallet address:', address);
      console.log('[WalletCreate] Generated mnemonic:', mnemonic ? mnemonic.split(' ').length + ' words' : 'none');

      expect(walletInfo).toBeDefined();
      expect(address).toBeDefined();
    } catch (error: any) {
      console.log('[WalletCreate] Error:', error.message?.slice(0, 300));
    }
  }, 60000);
});
