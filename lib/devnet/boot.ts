/**
 * Devnet Boot Sequence
 *
 * Initializes an in-browser Bitcoin+EVM devnet with the full protocol stack.
 * Loads ~15MB of WASM, deploys 21+ contracts, seeds liquidity.
 *
 * This runs in the browser's main thread (could be moved to a web worker
 * for better UX if boot time becomes problematic).
 *
 * JOURNAL (2026-03-22): Added savedState parameter to bootDevnetWithWasms.
 * When a previously exported state blob is provided, the boot skips mining
 * 101 blocks and instead calls DevnetServer.importState() to restore the
 * indexer KV stores + chain height. This cuts boot from ~5s to <0.5s.
 *
 * JOURNAL (2026-03-23): Replaced TODO placeholder with full protocol deployment.
 * Ported from __tests__/devnet/amm-deploy.ts, fire-deploy.ts, deploy-full-stack.ts.
 * Uses browser fetch() for WASMs instead of Node.js readFileSync.
 * Deployment order: std WASMs -> AMM -> DIESEL mint -> frBTC wrap -> pool creation ->
 * FIRE protocol -> core protocol (FUEL, ftrBTC, dxBTC, gauges) -> Fujin.
 *
 * JOURNAL (2026-04-01): Carbine CLOB trie bug fixed — WASM upgrade procedure.
 *
 * ## Root cause
 * SparseTrie in carbine-traits/src/trie.rs used `1u128 << byte` for branch masks.
 * For sell-side keys (price_token_id = MAX - price, byte 0 = 0xFF = 255),
 * `1u128 << 255` = 0 in WASM release mode (shift overflow). Sell orders were
 * stored in the level pointer but the trie branch mask was never updated, so
 * next(MAX/2) could never find any sell key. Result: GetBestAsk returned garbage,
 * GetOrderbookDepth showed 0 asks, and crossing orders never matched.
 *
 * ## Fix
 * Replaced u128 branch mask with Mask256 (two u128 words: lo=bits 0-127,
 * hi=bits 128-255). Source: reference/subfrost-alkanes/crates/carbine-traits/src/trie.rs.
 * 30 unit tests cover all edge cases including high-byte keys (bytes 128-255).
 *
 * ## Storage path change — NOT backward compatible
 * Old: /branches/{depth}/{partial_key}       → u128
 * New: /branches/{depth}/{partial_key}/lo    → u128 (bytes 0-127)
 *      /branches/{depth}/{partial_key}/hi    → u128 (bytes 128-255)
 * Any devnet state from before 2026-04-01 has wrong trie paths. Old sell orders
 * are permanently invisible to the new binary (level pointers exist but no branch
 * bits). Old orders cannot be cancelled (remove() reads/writes new paths too).
 *
 * ## Required procedure after deploying fixed WASM
 * 1. Updated WASMs: public/wasm/carbine_controller.wasm (272K) — built 2026-04-01
 *    Also prod_wasms/carbine_controller.wasm (same binary, for devnet harness tests).
 * 2. In browser: DevTools → Application → IndexedDB → delete all, OR use
 *    the "Clear & Reload" button in the devnet UI (calls resetDevnet() below).
 *    This triggers clearDevnetState() + a fresh boot() from block 0.
 * 3. After fresh boot: all contract deployments happen with the new binary.
 *    New sell orders will correctly appear in GetBestAsk / GetOrderbookDepth.
 * 4. Do NOT use importState() to restore a snapshot from before this fix —
 *    the snapshot's trie data is incompatible.
 *
 * ## Verification after fresh boot
 * 1. Place a sell order at any price via the CLOB UI.
 * 2. Open browser DevTools console; look for no errors from useOrderbook.
 * 3. The asks panel must show the order at the correct display price.
 * 4. Run: npx vitest run __tests__/devnet/carbine-orderbook-parsing.test.ts
 *    All 16 tests (10 unit + 6 integration) must pass.
 */

import type { DeployedContracts } from './types';

// Progress callback type
type ProgressCallback = (message: string, percent: number) => void;

// The harness and provider are stored globally so the fetch interceptor
// routes all RPC calls to the in-process devnet.
let _harness: any = null;
let _provider: any = null;
let _bootAddresses: { segwit: string; taproot: string } | null = null;

/**
 * Boot the in-browser devnet.
 *
 * This is the SAME code path as our vitest tests — we reuse the exact
 * deployment logic that's proven to work in the test suite.
 */
export async function bootDevnet(
  onProgress: ProgressCallback,
): Promise<{
  harness: any;
  provider: any;
  contracts: DeployedContracts;
  taprootAddress: string;
  segwitAddress: string;
}> {
  onProgress('Loading WASM modules...', 5);

  // Dynamic import of qubitcoin SDK
  // Import qubitcoin SDK from public dir (served as static ESM).
  // Cannot use bare '@qubitcoin/sdk' — browser can't resolve npm specifiers.
  // @ts-expect-error - runtime URL import, not resolvable by TypeScript
  const sdk = await import(/* webpackIgnore: true */ '/sdk/qubitcoin/index.js');

  // Load indexer WASMs from the app's public directory or bundled assets
  // In production, these would be served as static files
  onProgress('Initializing Bitcoin node...', 10);

  // For now, we'll need the indexer WASM to be available.
  // In the browser, we fetch it from a URL or bundle it.
  // The DevnetContext will need to provide the WASM bytes.
  // This is a placeholder — the actual WASM loading depends on
  // how we serve the files (public dir, CDN, or bundled).

  // Create the harness
  // NOTE: This requires the WASM bytes to be passed in.
  // The DevnetContext will handle fetching them.
  throw new Error(
    'bootDevnet requires WASM bytes — use DevnetContext which handles fetching'
  );
}

/**
 * Boot devnet with pre-loaded WASM bytes.
 * Called by DevnetContext after fetching all required WASMs.
 *
 * @param savedState - If provided, skip mining and import this state blob
 *   (produced by DevnetServer.exportState()). This restores the indexer
 *   KV stores and chain height without re-indexing.
 */
export async function bootDevnetWithWasms(
  alkanesWasm: Uint8Array,
  esploraWasm: Uint8Array | undefined,
  quspoWasm: Uint8Array | undefined,
  mnemonic: string,
  onProgress: ProgressCallback,
  savedState?: Uint8Array,
): Promise<{
  harness: any;
  provider: any;
  contracts: DeployedContracts;
  taprootAddress: string;
  segwitAddress: string;
}> {
  // Install console interceptor: relay all [devnet-boot] lines to /api/boot-log
  // so they can be tailed from the server side without needing Chrome DevTools open.
  // Batches up to 10 lines per POST, flushed every 300ms or when buffer fills.
  {
    const _origLog = console.log.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origError = console.error.bind(console);
    let _buf: string[] = [];
    let _timer: ReturnType<typeof setTimeout> | null = null;
    const _flush = () => {
      if (_buf.length === 0) return;
      const lines = _buf.splice(0);
      fetch('/api/boot-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      }).catch(() => {/* best-effort */});
    };
    const _intercept = (level: string, args: any[]) => {
      const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      if (msg.includes('[devnet-boot]') || msg.includes('[devnet]') || msg.includes('devnet-boot')) {
        _buf.push(`[${level}] ${msg}`);
        if (_buf.length >= 10) { if (_timer) clearTimeout(_timer); _timer = null; _flush(); }
        else if (!_timer) { _timer = setTimeout(() => { _timer = null; _flush(); }, 300); }
      }
    };
    console.log = (...args: any[]) => { _origLog(...args); _intercept('LOG', args); };
    console.warn = (...args: any[]) => { _origWarn(...args); _intercept('WARN', args); };
    console.error = (...args: any[]) => { _origError(...args); _intercept('ERROR', args); };
  }

  // Import qubitcoin SDK from public dir (served as static ESM).
  // Cannot use bare '@qubitcoin/sdk' — browser can't resolve npm specifiers.
  console.log('[devnet-boot] Importing SDK from /sdk/qubitcoin/index.js...');
  // @ts-expect-error - runtime URL import, not resolvable by TypeScript
  const sdk = await import(/* webpackIgnore: true */ '/sdk/qubitcoin/index.js');
  console.log('[devnet-boot] SDK imported, exports:', Object.keys(sdk));

  onProgress('Deriving wallet keys...', 10);

  // Derive coinbase key from mnemonic
  console.log('[devnet-boot] Importing crypto libs...');
  const bip39 = await import('bip39');
  const bip32Lib = await import('bip32');
  const ecc = await import('@bitcoinerlab/secp256k1');
  const bip32 = bip32Lib.default(ecc);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  // coinType=1 for regtest — matches the WASM provider's walletLoadMnemonic derivation.
  // NOTE: This differs from createWalletFromMnemonic (coinType=0). See address derivation
  // comment below for how we reconcile this difference.
  const child = root.derivePath("m/84'/1'/0'/0/0");
  const secretKey = new Uint8Array(child.privateKey!);
  console.log('[devnet-boot] Keys derived, creating harness...');

  onProgress('Initializing Bitcoin node (loading WASM)...', 15);

  // JOURNAL (2026-03-26): Esplora + OOM — the constraints and solution.
  //
  // Constraint 1: Esplora MUST be enabled. The SDK's alkanesExecuteTyped()
  // internally calls essentials.get_address_outpoints() for UTXO discovery.
  // Without esplora, swaps fail with "Insufficient alkanes: have 0".
  // The DevnetEsploraBackend block-scan fallback does NOT satisfy this —
  // the SDK makes a different RPC call that requires the esplora indexer.
  //
  // Constraint 2: 101 blocks × 2 indexers = 202 WASM instances. Mining all
  // at once OOMs at block ~71-80. FinalizationRegistry can't reclaim fast enough.
  //
  // Solution: Mine in batches of 25 with setTimeout(0) yields between batches.
  // This lets GC reclaim instances from completed batches before the next starts.
  // See mineInitialBlocks() below.
  //
  // Future fix: qubitcoin addSecondary('esplora') — load esplora AFTER mining.
  // Rust source is ready but WASM can't be recompiled (alkanes-rpc-core is private).
  // boot.ts has hasAddSecondary feature detection ready for when the WASM ships.
  //
  // DO NOT disable esplora — swaps will break.
  // DO NOT remove batched mining — OOM will return.
  // DO NOT add waitForDevnetSync / extra generatetoaddress calls — the indexer
  // is synchronous in-process WASM, extra blocks CREATE desync, not fix it.
  const useEsplora = true;

  console.log('[devnet-boot] Creating DevnetTestHarness with alkanesWasm=%dKB esplora=%s quspo=deferred',
    Math.round(alkanesWasm.length / 1024),
    useEsplora ? Math.round((esploraWasm?.length || 0) / 1024) + 'KB' : 'disabled',
  );

  _harness = await sdk.DevnetTestHarness.create({
    alkanesWasm,
    esploraWasm: useEsplora ? esploraWasm : undefined,
    secretKey,
  });
  console.log('[devnet-boot] Harness created successfully (without quspo)');

  // Install fetch interceptor — all RPC calls now go in-process
  _harness.installFetchInterceptor();

  // JOURNAL (2026-04-30): SDK presign-RBF path uses Bitcoin Core's batch
  // `sendrawtransactions` (plural) RPC, but the qubitcoin in-browser harness
  // only supports `sendrawtransaction` (singular). Wrap fetch to translate
  // batch calls into N singular calls in order. Without this, every
  // commit/reveal envelope deploy (FIRE Bonding, FIRE Token, etc.) fails
  // with "Bitcoin method not supported in devnet: sendrawtransactions".
  if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    const harnessFetch = globalThis.fetch;
    const sendrawTranslator: typeof fetch = async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
      const method = init?.method?.toUpperCase() ?? 'GET';
      const isHarness = url?.startsWith('http://localhost:18888') || url?.startsWith('http://127.0.0.1:18888');
      if (method === 'POST' && isHarness && init?.body) {
        try {
          const body = typeof init.body === 'string' ? init.body : await new Response(init.body).text();
          const parsed = JSON.parse(body);
          if (
            parsed.method === 'submitpackage' ||
            parsed.method === 'btc_submitpackage' ||
            parsed.method === 'sendrawtransactions' ||
            parsed.method === 'btc_sendrawtransactions'
          ) {
            const txHexes: string[] = Array.isArray(parsed.params?.[0]) ? parsed.params[0] : parsed.params;
            const results: string[] = [];
            for (const txHex of txHexes) {
              const r = await harnessFetch.call(globalThis, url, {
                ...init,
                body: JSON.stringify({ jsonrpc: '2.0', method: 'btc_sendrawtransaction', params: [txHex], id: parsed.id }),
              });
              const j: any = await r.json();
              if (j.error) {
                return new Response(JSON.stringify({ jsonrpc: '2.0', error: j.error, id: parsed.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              results.push(j.result);
            }
            return new Response(JSON.stringify({ jsonrpc: '2.0', result: results, id: parsed.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        } catch {
          // Fall through to harness fetch on parse error
        }
      }
      return harnessFetch.call(globalThis, input, init);
    };
    globalThis.fetch = sendrawTranslator;
    if (globalThis.window) globalThis.window.fetch = sendrawTranslator;
    console.log('[devnet-boot] Installed sendrawtransactions → sendrawtransaction translator');
  }

  // If we have a saved state, import it instead of mining blocks
  if (savedState) {
    onProgress('Restoring saved state...', 20);
    console.log('[devnet-boot] Importing saved state (%d KB)...', Math.round(savedState.length / 1024));
    try {
      _harness.server.importState(savedState);
      console.log('[devnet-boot] State imported, chain height:', _harness.height);
      onProgress('State restored!', 50);
    } catch (e: any) {
      console.warn('[devnet-boot] Failed to import saved state, falling back to fresh boot:', e?.message || e);
      // Fall through to normal mining path
      await mineInitialBlocks(onProgress);
    }
  } else {
    await mineInitialBlocks(onProgress);
  }

  // quspo tertiary indexer is deferred until AFTER all deployments.
  // Adding it here causes each deploy's mine+index cycle to also run quspo,
  // making the metashrew indexer fall behind and triggering sync timeouts.

  // Create provider
  const wasm = await import('@alkanes/ts-sdk/wasm');
  _provider = new wasm.WebProvider('subfrost-regtest', {
    jsonrpc_url: 'http://localhost:18888',
    data_api_url: 'http://localhost:18888',
  });
  _provider.walletLoadMnemonic(mnemonic, null);

  // Derive addresses using coinType=1 for regtest — matching the WASM provider's
  // walletLoadMnemonic. WalletContext also overrides to coinType=1 on devnet.
  //
  // ⚠️ ADDRESS MISMATCH WARNING:
  // The WASM provider (walletLoadMnemonic) uses coinType=1 for regtest derivation.
  // The JS SDK (createWalletFromMnemonic in WalletContext) uses coinType=0 always.
  // These produce DIFFERENT addresses from the same mnemonic.
  //
  // Boot.ts MUST use coinType=1 here because the WASM provider's alkanesExecuteFull
  // resolves from_addresses against its internal keystore (coinType=1). Using coinType=0
  // causes "Address not found in keystore" errors on every transaction.
  //
  // WalletContext overrides to coinType=1 on devnet so UI addresses match boot.
  // Boot-seeded state (orders, LP, tokens) lives at coinType=1 addresses.
  // DO NOT change to coinType=0 — breaks WASM keystore resolution.
  const bitcoin = await import('bitcoinjs-lib');
  bitcoin.initEccLib(ecc);
  const network = bitcoin.networks.regtest;
  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const segwitPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(segwitChild.publicKey),
    network,
  });
  const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1);
  const taprootPayment = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network,
  });
  const segwitAddress = segwitPayment.address!;
  const taprootAddress = taprootPayment.address!;
  _bootAddresses = { segwit: segwitAddress, taproot: taprootAddress };

  console.log('[devnet-boot] Boot wallet segwit:', segwitAddress);
  console.log('[devnet-boot] Boot wallet taproot:', taprootAddress);

  // =========================================================================
  // Full protocol deployment — only on FRESH boot (no saved state).
  // When restoring from saved state, contracts are already deployed.
  // Re-deploying on top of restored state would create duplicate/corrupt entries.
  // =========================================================================

  let contracts: DeployedContracts;
  if (savedState) {
    // State restored — contracts already deployed, just need contract IDs
    console.log('[devnet-boot] Skipping deployment (restored from saved state)');
    onProgress('Contracts ready (from saved state)', 95);
    // Return default contract IDs from the deployment constants
    contracts = getDefaultContractIds();
  } else {
    contracts = await deployFullProtocol(
      _provider, _harness, segwitAddress, taprootAddress, onProgress,
      /* ammOnly= */ true,
      quspoWasm,
    );
  }

  // Add quspo tertiary indexer after state restore (fresh boot adds it inside deployFullProtocol).
  // On savedState restore, contracts were already deployed — add quspo now so the UI can
  // discover pool UTXOs and alkane balances.
  if (savedState && quspoWasm) {
    onProgress('Loading quspo indexer...', 98);
    try {
      _harness.server.addTertiary('quspo', quspoWasm);
      _harness.mineBlocks(1);
      console.log('[devnet-boot] quspo tertiary indexer added (state-restore path)');
    } catch (e: any) {
      console.warn('[devnet-boot] Failed to add quspo (non-fatal):', e?.message || e);
    }
  }

  onProgress('Devnet ready!', 100);

  return {
    harness: _harness,
    provider: _provider,
    contracts,
    taprootAddress,
    segwitAddress,
  };
}

// ===========================================================================
// Deployment Constants
//
// UPGRADE ARCHITECTURE (2026-03-28):
// Every contract except fr-btc is deployed behind an upgradeable proxy.
//
// Standalone contracts: impl at IMPL slot, upgradeable proxy at PROXY slot.
//   - Users interact with PROXY slot. Proxy delegatecalls to impl.
//   - Upgrade: send auth token + call opcode 32766 on proxy with new impl ID.
//
// Template contracts (multiple instances): impl at IMPL slot, beacon at BEACON slot,
//   instances are beacon-proxy contracts pointing to the beacon.
//   - Upgrade beacon once (opcode 32766) → all instances get new impl.
//
// Slot convention:
//   PROXY/instance slots = user-facing IDs (unchanged from before)
//   IMPL slots = original + 10000
//   BEACON slots = original + 20000
// ===========================================================================

// AMM slot assignments (already has proxy/beacon — unchanged)
const AMM_SLOTS = {
  AUTH_TOKEN_FACTORY: 0xffed,   // 65517
  POOL_BEACON_PROXY: 780993,
  FACTORY_LOGIC:     0xfff4,    // 65524 — NOTE: prod_wasms build, missing opcodes 0/1/2
  POOL_LOGIC:        0xfff0,    // 65520 — NOTE: missing Swap opcode 3 (use factory router op 13)
  // JOURNAL (2026-04-02): 65522 = OLD broken factory proxy (missing CreateNewPool, Swap).
  // 65498 = working factory proxy (built from oyl-amm source). All swap/pool ops route via 65498.
  // Universal Router MUST point at 65498, not 65522, or hybrid routing silently fails.
  FACTORY_PROXY:     65498,     // working factory (oyl-amm source build)
  BEACON:            0xfff3,    // 65523
};

// FIRE contract slots — proxy at original, impl at +10000
const FIRE_SLOTS = {
  TOKEN_PROXY:       256,   TOKEN_IMPL:       10256,
  STAKING_PROXY:     257,   STAKING_IMPL:     10257,
  TREASURY_PROXY:    258,   TREASURY_IMPL:    10258,
  BONDING_PROXY:     259,   BONDING_IMPL:     10259,
  REDEMPTION_PROXY:  260,   REDEMPTION_IMPL:  10260,
  DISTRIBUTOR_PROXY: 261,   DISTRIBUTOR_IMPL: 10261,
};

// Core protocol + Fujin slots
const PROTOCOL_SLOTS = {
  // Standalone: proxy at original, impl at +10000
  FUEL_TOKEN_PROXY:    7000,  FUEL_TOKEN_IMPL:    17000,
  YV_FRBTC_VAULT_PROXY: 7937, YV_FRBTC_VAULT_IMPL: 17937,  // yvfrBTC vault (dependency of dxBTC)
  DXBTC_VAULT_PROXY:   7020,  DXBTC_VAULT_IMPL:   17020,
  CARBINE_CTRL_PROXY:  70000, CARBINE_CTRL_IMPL:  80000,
  UNIVERSAL_ROUTER_PROXY: 70002, UNIVERSAL_ROUTER_IMPL: 80002,
  FRZEC_PROXY:         43520, FRZEC_IMPL:         53520,  // 0xAA00 / 0xD130
  FRETH_PROXY:         52224, FRETH_IMPL:         62224,  // 0xCC00 / 0xF330

  // Template: impl at +10000, beacon at +20000, instances at original
  FTRBTC_IMPL:         17010, FTRBTC_BEACON:      27010,
  VX_GAUGE_IMPL:       17030, VX_GAUGE_BEACON:    27030,
  VX_FUEL_GAUGE:       7030,  // beacon proxy instance
  VX_BTCUSD_GAUGE:     7031,  // beacon proxy instance
  CARBINE_TMPL_IMPL:   80001, CARBINE_TMPL_BEACON: 90001,
  CARBINE_TEMPLATE:    70001, // beacon proxy instance
  SYNTH_POOL_IMPL:     66576, SYNTH_POOL_BEACON:  76576,  // impl/beacon for all synth pools
  SYNTH_FRBTC_FRZEC:   0xDD00, // 56576 — beacon proxy instance, A=100
  SYNTH_FRBTC_FRETH:   0xDD01, // 56577 — A=15
  SYNTH_FRBTC_FRUSD:   0xDD02, // 56578 — A=8
  SYNTH_FRZEC_FRUSD:   0xDD03, // 56579 — A=8
  SYNTH_FRZEC_FRETH:   0xDD04, // 56580 — A=30
  SYNTH_FRETH_FRUSD:   0xDD05, // 56581 — A=8

  // Fujin (already has proxy/beacon — unchanged)
  FUJIN_AUTH_TOKEN:           7100,
  FUJIN_BEACON_PROXY:        7101,
  FUJIN_POOL_TEMPLATE:       7102,
  FUJIN_RUNTIME_POOL:        7103,
  FUJIN_RUNTIME_FACTORY:     7104,
  FUJIN_BEACON:              7105,
  FUJIN_UPGRADEABLE_TEMPLATE:7106,
  FUJIN_FACTORY_LOGIC:       7107,
  FUJIN_TOKEN_TEMPLATE:      7108,
  FUJIN_ZAP:                 7109,
  FUJIN_LP_VAULT:            7110,
  FUJIN_MASTER_LOGIC:        7111,
  FUJIN_MASTER_PROXY:        7112,
};

/**
 * Helper to build an UpgradeableInfo with empty auth token (filled during deploy).
 */
function upgradeableInfo(proxySlot: number, implSlot: number): import('./types').UpgradeableInfo {
  return { proxyId: `4:${proxySlot}`, implId: `4:${implSlot}`, authTokenId: '' };
}

/**
 * Helper to build a BeaconInfo.
 */
function beaconInfo(
  implSlot: number, beaconSlot: number, instances: Record<string, number>,
): import('./types').BeaconInfo {
  const inst: Record<string, string> = {};
  for (const [k, v] of Object.entries(instances)) inst[k] = `4:${v}`;
  return { implId: `4:${implSlot}`, beaconId: `4:${beaconSlot}`, authTokenId: '', instances: inst };
}

/**
 * Returns default contract IDs when restoring from saved state (no deployment needed).
 * IDs are derived from the slot constants — same slots used during fresh deployment.
 */
function getDefaultContractIds(): DeployedContracts {
  const S = PROTOCOL_SLOTS;
  return {
    ammFactoryId: `4:${AMM_SLOTS.FACTORY_PROXY}`,
    ammPoolId: '2:3',

    // Upgradeable standalone contracts
    fireToken:       upgradeableInfo(FIRE_SLOTS.TOKEN_PROXY,       FIRE_SLOTS.TOKEN_IMPL),
    fireStaking:     upgradeableInfo(FIRE_SLOTS.STAKING_PROXY,     FIRE_SLOTS.STAKING_IMPL),
    fireTreasury:    upgradeableInfo(FIRE_SLOTS.TREASURY_PROXY,    FIRE_SLOTS.TREASURY_IMPL),
    fireBonding:     upgradeableInfo(FIRE_SLOTS.BONDING_PROXY,     FIRE_SLOTS.BONDING_IMPL),
    fireRedemption:  upgradeableInfo(FIRE_SLOTS.REDEMPTION_PROXY,  FIRE_SLOTS.REDEMPTION_IMPL),
    fireDistributor: upgradeableInfo(FIRE_SLOTS.DISTRIBUTOR_PROXY, FIRE_SLOTS.DISTRIBUTOR_IMPL),
    fuelToken:       upgradeableInfo(S.FUEL_TOKEN_PROXY,           S.FUEL_TOKEN_IMPL),
    yvFrbtcVault:    upgradeableInfo(S.YV_FRBTC_VAULT_PROXY,      S.YV_FRBTC_VAULT_IMPL),
    dxBtcVault:      upgradeableInfo(S.DXBTC_VAULT_PROXY,         S.DXBTC_VAULT_IMPL),
    carbineController: upgradeableInfo(S.CARBINE_CTRL_PROXY,       S.CARBINE_CTRL_IMPL),
    universalRouter: upgradeableInfo(S.UNIVERSAL_ROUTER_PROXY,     S.UNIVERSAL_ROUTER_IMPL),
    frzec:           upgradeableInfo(S.FRZEC_PROXY,                S.FRZEC_IMPL),
    freth:           upgradeableInfo(S.FRETH_PROXY,                S.FRETH_IMPL),

    // Beacon templates
    ftrBtcTemplate: beaconInfo(S.FTRBTC_IMPL, S.FTRBTC_BEACON, {}),
    vxGaugeTemplate: beaconInfo(S.VX_GAUGE_IMPL, S.VX_GAUGE_BEACON, {
      vxFuel: S.VX_FUEL_GAUGE, vxBtcUsd: S.VX_BTCUSD_GAUGE,
    }),
    synthPoolTemplate: beaconInfo(S.SYNTH_POOL_IMPL, S.SYNTH_POOL_BEACON, {
      frbtcFrzec: S.SYNTH_FRBTC_FRZEC, frbtcFreth: S.SYNTH_FRBTC_FRETH,
      frbtcFrusd: S.SYNTH_FRBTC_FRUSD, frzecFrusd: S.SYNTH_FRZEC_FRUSD,
      frzecFreth: S.SYNTH_FRZEC_FRETH, frethFrusd: S.SYNTH_FRETH_FRUSD,
    }),
    carbineTemplate: beaconInfo(S.CARBINE_TMPL_IMPL, S.CARBINE_TMPL_BEACON, {
      default: S.CARBINE_TEMPLATE,
    }),

    synthPools: {
      frbtcFrzec: `4:${S.SYNTH_FRBTC_FRZEC}`,
      frbtcFreth: `4:${S.SYNTH_FRBTC_FRETH}`,
      frbtcFrusd: `4:${S.SYNTH_FRBTC_FRUSD}`,
      frzecFrusd: `4:${S.SYNTH_FRZEC_FRUSD}`,
      frzecFreth: `4:${S.SYNTH_FRZEC_FRETH}`,
      frethFrusd: `4:${S.SYNTH_FRETH_FRUSD}`,
    },
    synthPoolId: `4:${S.SYNTH_FRBTC_FRUSD}`,

    frusdTokenId: '4:8201',
    frusdAuthTokenId: '',
    fujinFactoryId: `4:${S.FUJIN_FACTORY_LOGIC}`,
    fujinMasterId: `4:${S.FUJIN_MASTER_PROXY}`,

    // Legacy flat IDs — point to proxy (user-facing) slots
    fireTokenId:       `4:${FIRE_SLOTS.TOKEN_PROXY}`,
    fireStakingId:     `4:${FIRE_SLOTS.STAKING_PROXY}`,
    fireTreasuryId:    `4:${FIRE_SLOTS.TREASURY_PROXY}`,
    fireBondingId:     `4:${FIRE_SLOTS.BONDING_PROXY}`,
    fireRedemptionId:  `4:${FIRE_SLOTS.REDEMPTION_PROXY}`,
    fireDistributorId: `4:${FIRE_SLOTS.DISTRIBUTOR_PROXY}`,
    fuelTokenId:       `4:${S.FUEL_TOKEN_PROXY}`,
    ftrBtcTemplateId:  `4:${S.FTRBTC_BEACON}`, // beacon is the user-facing entry point for templates
    dxBtcVaultId:      `4:${S.DXBTC_VAULT_PROXY}`,
    vxFuelGaugeId:     `4:${S.VX_FUEL_GAUGE}`,
    vxBtcUsdGaugeId:   `4:${S.VX_BTCUSD_GAUGE}`,
    frzecId:           `4:${S.FRZEC_PROXY}`,
    frethId:           `4:${S.FRETH_PROXY}`,
    carbineControllerId: `4:${S.CARBINE_CTRL_PROXY}`,
  };
}

// ===========================================================================
// Browser WASM loading + deploy helpers
// ===========================================================================

/**
 * Fetch a WASM file from /wasm/{name}.wasm and return its hex encoding.
 * Runs in the browser — uses fetch() instead of Node.js readFileSync.
 */
/**
 * Fetch-deploy-release: fetch a WASM, deploy it, then let the hex string be GC'd.
 * Reduces peak memory by ~60% compared to fetching all WASMs upfront.
 */
async function fetchAndDeploy(
  provider: any, harness: any, segwit: string, taproot: string,
  name: string, slot: number, initArgs: (number | bigint)[],
  label: string, onProgress: ProgressCallback, pct: number,
): Promise<void> {
  const hex = await fetchWasmHex(name);
  await deployWasm(provider, harness, segwit, taproot, hex, slot, initArgs, label, onProgress, pct);
  // hex string is now eligible for GC — no reference retained
}

async function fetchWasmHex(name: string): Promise<string> {
  const resp = await fetch(`/wasm/${name}.wasm`);
  if (!resp.ok) throw new Error(`WASM not found: ${name}.wasm (HTTP ${resp.status})`);

  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Convert to hex string
  const hexChars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    hexChars[i] = bytes[i].toString(16).padStart(2, '0');
  }
  return hexChars.join('');
}

/**
 * Deploy a WASM contract via alkanesExecuteFull (handles commit/reveal internally).
 * Mines 1 block after deploy and yields to GC.
 *
 * CRITICAL: CREATERESERVED ATOMIC ROLLBACK BEHAVIOR
 * During CREATERESERVED [3, slot, ...args], the alkanes indexer:
 *   1. Stores the WASM binary at [4:slot] in the atomic transaction
 *   2. Executes the WASM with `args` as the cellpack inputs
 *   3. If execution REVERTS (e.g., unrecognized opcode), the entire
 *      atomic transaction is rolled back — INCLUDING the binary storage
 *
 * This means `initArgs` MUST contain a valid opcode that the contract
 * accepts. Common patterns:
 *   - Std contracts (upgradeable, beacon): [0x7fff, 4, implSlot, authUnits]
 *     These have dedicated proxy init handlers for 0x7fff/0x8fff opcodes
 *   - Custom impl contracts: Use opcode 0 (Initialize) with safe defaults,
 *     OR a read-only opcode (e.g., query) that succeeds without state deps
 *   - NEVER use an unrecognized opcode (e.g., [50]) — it will revert and
 *     the binary will NOT be stored, silently failing the deployment
 *
 * Source: alkanes-rs/src/message.rs — handle_message() returns Err on revert,
 * which prevents atomic.commit(), rolling back ptr.set() from run_special_cellpacks()
 */
/**
 * ⚠️ ALKANE UTXO DESTRUCTION WARNING ⚠️
 *
 * deployWasm uses from_addresses: [segwit, taproot] to find BTC for fee inputs.
 * The SDK picks ANY UTXO with sufficient BTC value — including dust UTXOs that
 * carry alkane tokens (DIESEL, frBTC, LP, FIRE, etc.). Since alkane tokens are
 * encoded as protorunes on Bitcoin UTXOs, spending a UTXO for fees DESTROYS
 * the alkane tokens it carries.
 *
 * NO ordinals_strategy is set, so the SDK does NOT protect alkane-bearing UTXOs.
 *
 * Consequence: After 50+ sequential deployWasm calls, ALL alkane UTXOs from
 * prior operations (minting, wrapping, pool creation) have been consumed as
 * fee inputs. Any getAlkaneBalance() call returns 0 for every token.
 *
 * Fix: Re-mint/re-wrap tokens AFTER all deployments complete (see Phase 10a).
 * Do NOT rely on alkane balances surviving across deployment phases.
 *
 * This behavior was discovered 2026-04-03 after 6+ hours debugging why CLOB
 * order seeding always reported "Insufficient alkanes: have 0".
 */
async function deployWasm(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  wasmHex: string,
  slot: number,
  initArgs: (number | bigint)[],
  label: string,
  onProgress: ProgressCallback,
  pct: number,
): Promise<void> {
  onProgress(`Deploying ${label}...`, pct);
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[3,${slot},${argsStr}]:v0:v0`;
  console.log(`[devnet-boot] Deploy ${label} → [4:${slot}] protostone=${protostone.slice(0, 100)}`);

  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([taproot]),
      'B:100000:v0',
      protostone,
      '1',
      wasmHex,
      JSON.stringify({
        from_addresses: [segwit, taproot],
        change_address: segwit,
        alkanes_change_address: taproot,
        mine_enabled: true,
      }),
    );
    harness.mineBlocks(1);
    await new Promise(r => setTimeout(r, 200)); // GC yield + let indexer catch up
    console.log(`[devnet-boot] ${label} deployed OK → [4:${slot}]`);
  } catch (e: any) {
    console.error(`[devnet-boot] ${label} deploy FAILED:`, e?.message || e);
  }
}

/**
 * Execute a non-envelope alkane call (init, mint, swap, etc.)
 * Uses alkanesExecuteFull with no envelope.
 */
/**
 * Execute a non-envelope alkane call (init, admin ops, token operations, etc.)
 *
 * ⚠️ ALKANE UTXO RISK: Like deployWasm(), this function does NOT set
 * ordinals_strategy, so the SDK may consume alkane-bearing UTXOs as BTC fee
 * inputs. If you need to preserve alkane balances across multiple executeCall
 * invocations, re-mint tokens before the operations that need them.
 * See deployWasm() comment for the full explanation.
 */
let _lastTxid = '';

async function executeCall(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  protostone: string,
  inputRequirements: string,
  toAddresses?: string[],
  fromAddressesOverride?: string[],
): Promise<void> {
  try {
    const t0 = Date.now();
    console.log(`[devnet-boot] executeCall START: ${protostone.slice(0, 70)}`);
    // fromAddressesOverride: pass [taproot] to avoid UTXO-bloat hang on late-boot txns.
    // By the time router init runs, segwit has 300+ UTXOs from all prior deploys — the
    // WASM PSBT builder is O(n²) and blocks the JS thread indefinitely with both addresses.
    // Taproot has ~5 UTXOs (dust from alkane ops), completes in ~200ms.
    const fromAddresses = fromAddressesOverride ?? [segwit, taproot];
    // JOURNAL (2026-04-30): when from_addresses is taproot-only (used to avoid
    // UTXO-bloat hangs in late-boot txns), the SDK's default protect_taproot=true
    // makes taproot UTXOs ineligible for fees, leaving zero candidates and
    // failing with "Insufficient funds: have 0 (protect_taproot=true)". When
    // we're explicitly funding from taproot, we must opt out of the protection.
    const isTaprootOnly = fromAddresses.length === 1 && fromAddresses[0] === taproot;
    const options: any = {
      from_addresses: fromAddresses,
      change_address: fromAddresses[0] === taproot ? taproot : segwit,
      alkanes_change_address: taproot,
      mine_enabled: true,
    };
    if (isTaprootOnly) options.protect_taproot = false;
    const result = await provider.alkanesExecuteFull(
      JSON.stringify(toAddresses || [taproot]),
      inputRequirements,
      protostone,
      '1',
      null,
      JSON.stringify(options),
    );
    const txid = result?.txid || result?.reveal_txid || result?.revealTxid || '';
    _lastTxid = txid;
    console.log(`[devnet-boot] executeCall DONE in ${Date.now() - t0}ms: ${protostone.slice(0, 50)}${txid ? ' txid=' + txid.slice(0, 16) : ''}`);
    harness.mineBlocks(1);
    await new Promise(r => setTimeout(r, 200)); // GC yield + let indexer catch up
  } catch (e: any) {
    console.error(`[devnet-boot] executeCall failed (${protostone.slice(0, 60)}):`, e?.message || e);
  }
}

/**
 * RPC call to the devnet (routed in-process via fetch interceptor).
 */
let _rpcId = 1;
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch('http://localhost:18888', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: _rpcId++ }),
  });
  return response.json();
}

/**
 * Parse a little-endian u128 from a hex string at a given byte offset.
 * Browser-safe — does NOT use Buffer.readBigUInt64LE (Node.js only).
 * Returns a plain number (safe for values < Number.MAX_SAFE_INTEGER).
 */
function parseLeU128FromHex(hex: string, byteOffset: number): number {
  // Each byte = 2 hex chars. Read 16 bytes (u128) in LE order.
  let value = 0;
  for (let i = 15; i >= 0; i--) {
    const hexOffset = (byteOffset + i) * 2;
    const byte = parseInt(hex.slice(hexOffset, hexOffset + 2), 16) || 0;
    value = value * 256 + byte;
  }
  return value;
}

/**
 * Parse a little-endian u128 from hex as BigInt (for large values).
 * Browser-safe — no Buffer.readBigUInt64LE.
 */
function parseLeU128BigInt(hex: string, byteOffset: number): bigint {
  let value = BigInt(0);
  for (let i = 15; i >= 0; i--) {
    const hexOffset = (byteOffset + i) * 2;
    const byte = parseInt(hex.slice(hexOffset, hexOffset + 2), 16) || 0;
    value = value * BigInt(256) + BigInt(byte);
  }
  return value;
}

/**
 * Simulate an alkane call (read-only query).
 */
async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx }, inputs, alkanes: [],
    transaction: '0x', block: '0x', height: '999', txindex: 0, vout: 0,
  }]);
}

/**
 * Get alkane balance for a specific token at an address.
 */
async function getAlkaneBalance(
  provider: any,
  address: string,
  alkaneId: string,
): Promise<bigint> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' },
  ]);
  const [targetBlock, targetTx] = alkaneId.split(':').map(Number);
  if (!result?.result?.outpoints) return BigInt(0);
  let total = BigInt(0);
  for (const outpoint of result.result.outpoints) {
    const balances = outpoint.balance_sheet?.cached?.balances
      || outpoint.runes || [];
    for (const entry of balances) {
      const block = parseInt(entry.block ?? '0', 10);
      const tx = parseInt(entry.tx ?? '0', 10);
      if (block === targetBlock && tx === targetTx) {
        total += BigInt(entry.amount || '0');
      }
    }
  }
  return total;
}

/**
 * Discover auth tokens ([2:N] with balance > 0) at an address.
 */
async function discoverAuthTokens(address: string): Promise<string[]> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' },
  ]);
  const tokens: string[] = [];
  if (!result?.result?.outpoints) return tokens;
  for (const outpoint of result.result.outpoints) {
    const balances = outpoint.balance_sheet?.cached?.balances
      || outpoint.runes || [];
    for (const entry of balances) {
      const block = parseInt(entry.block ?? '0', 10);
      const tx = parseInt(entry.tx ?? '0', 10);
      const amount = parseInt(entry.amount ?? '0', 10);
      if (block === 2 && amount > 0) {
        const id = `${block}:${tx}`;
        if (!tokens.includes(id)) tokens.push(id);
      }
    }
  }
  return tokens;
}

/** Shorthand: discover the most recently minted auth token. */
async function discoverLastAuthToken(address: string): Promise<string> {
  const tokens = await discoverAuthTokens(address);
  const t = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (t) console.log(`[devnet-boot]   Auth token: ${t}`);
  return t;
}

// ===========================================================================
// Full Protocol Deployment
// ===========================================================================

/**
 * Deploy an implementation WASM + upgradeable proxy pointing to it.
 * Returns the auth token ID discovered after proxy deployment.
 */
async function deployWithProxy(
  provider: any, harness: any, segwit: string, taproot: string,
  upgradeableWasm: string,
  wasmName: string, implSlot: number, proxySlot: number,
  label: string, onProgress: ProgressCallback, pct: number,
  implInitArgs?: (number | bigint)[],
): Promise<string> {
  // Step 1: Deploy implementation WASM to [4:implSlot]
  // WARNING: The init arg [50] is passed as cellpack input during CREATERESERVED.
  // If the contract's opcode dispatcher doesn't handle opcode 50, the deploy
  // reverts and the binary is NOT stored (atomic rollback). Contracts that
  // support opcode 50 as a no-op/forward marker will deploy successfully.
  // For contracts without opcode 50 support, pass implInitArgs with a valid opcode:
  //   - A read-only query opcode (e.g., get-name=99 for dx-btc)
  //   - opcode 0 (Initialize) with safe defaults
  // See: CREATERESERVED ATOMIC ROLLBACK BEHAVIOR docs on deployWasm()
  await fetchAndDeploy(provider, harness, segwit, taproot,
    wasmName, implSlot, implInitArgs ?? [50],
    `${label} Impl`, onProgress, pct);

  // Step 2: Deploy upgradeable proxy → impl, mint 1 auth token
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, proxySlot,
    [0x7fff, 4, implSlot, 1],
    `${label} Proxy`, onProgress, pct);

  // Step 3: Discover auth token
  const tokens = await discoverAuthTokens(taproot);
  const authToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (authToken) {
    console.log(`[devnet-boot]   ${label} auth token: ${authToken}`);
  }
  return authToken;
}

/**
 * Deploy an implementation WASM + upgradeable beacon for it.
 * Used for template contracts where multiple beacon-proxy instances share one impl.
 * Returns the auth token ID for the beacon.
 */
async function deployWithBeacon(
  provider: any, harness: any, segwit: string, taproot: string,
  upgradeableBeaconWasm: string,
  wasmName: string, implSlot: number, beaconSlot: number,
  label: string, onProgress: ProgressCallback, pct: number,
  implInitArgs?: (number | bigint)[],
): Promise<string> {
  // Step 1: Deploy implementation
  // Default [50] works for contracts where opcode 50 is a no-op/admin fn.
  // For contracts where opcode 50 requires auth (e.g., frSIGIL check) or
  // params, pass implInitArgs with a safe read-only opcode.
  await fetchAndDeploy(provider, harness, segwit, taproot,
    wasmName, implSlot, implInitArgs ?? [50],
    `${label} Impl`, onProgress, pct);

  // Step 2: Deploy upgradeable beacon → impl, mint 1 auth token
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, beaconSlot,
    [0x7fff, 4, implSlot, 1],
    `${label} Beacon`, onProgress, pct);

  const tokens = await discoverAuthTokens(taproot);
  const authToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (authToken) {
    console.log(`[devnet-boot]   ${label} beacon auth token: ${authToken}`);
  }
  return authToken;
}

/**
 * Deploy a beacon-proxy instance pointing to an existing beacon.
 * Used for each instance of a template (e.g., each synth pool, each gauge).
 */
async function deployBeaconInstance(
  provider: any, harness: any, segwit: string, taproot: string,
  beaconProxyWasm: string, instanceSlot: number, beaconSlot: number,
  label: string, onProgress: ProgressCallback, pct: number,
): Promise<void> {
  // ⚠️ MUST be 0x7fff (32767). NEVER use 0x8fff.
  // alkanes_std_beacon_proxy.wasm: initialize=0x7fff (stores beacon), forward=0x8fff (no-op)
  // Using 0x8fff here means beacon pointer is NEVER set → ALL delegatecalls fail silently
  // → CLOB orders empty, gauge stakes fail, synth pools broken.
  // See CLAUDE.md "Proxy & Beacon Init Opcodes" for full documentation.
  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, instanceSlot,
    [0x7fff, 4, beaconSlot],
    `${label} (beacon-proxy)`, onProgress, pct);
}

/**
 * Initialize a contract THROUGH its proxy using delegatecall.
 * The proxy's fallback routes all unknown opcodes to the implementation.
 */
async function initThroughProxy(
  provider: any, harness: any, segwit: string, taproot: string,
  proxySlot: number, initArgs: (number | bigint)[],
  label: string,
  fromAddressesOverride?: string[],
): Promise<void> {
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[4,${proxySlot},${argsStr}]:v0:v0`;
  console.log(`[devnet-boot]   Init ${label} through proxy: ${protostone.slice(0, 80)}`);
  await executeCall(provider, harness, segwit, taproot,
    protostone, 'B:100000:v0', undefined, fromAddressesOverride);
}

/**
 * Initialize a beacon-proxy instance (business init routed through beacon → impl).
 */
async function initBeaconInstance(
  provider: any, harness: any, segwit: string, taproot: string,
  instanceSlot: number, initArgs: (number | bigint)[],
  label: string,
): Promise<void> {
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[4,${instanceSlot},${argsStr}]:v0:v0`;
  console.log(`[devnet-boot]   Init ${label} instance: ${protostone.slice(0, 80)}`);
  await executeCall(provider, harness, segwit, taproot,
    protostone, 'B:100000:v0');
}

async function deployFullProtocol(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  onProgress: ProgressCallback,
  ammOnly = false,
  quspoWasm?: Uint8Array,
): Promise<DeployedContracts> {
  const S = PROTOCOL_SLOTS;
  const contracts = getDefaultContractIds();

  // -----------------------------------------------------------------------
  // Phase 0: Fetch reusable standard WASMs (small, reused across all phases)
  // -----------------------------------------------------------------------
  onProgress('Loading standard WASMs...', 30);
  const [authTokenWasm, beaconProxyWasm, upgradeableWasm, upgradeableBeaconWasm] = await Promise.all([
    fetchWasmHex('alkanes_std_auth_token'),
    fetchWasmHex('alkanes_std_beacon_proxy'),
    fetchWasmHex('alkanes_std_upgradeable'),
    fetchWasmHex('alkanes_std_upgradeable_beacon'),
  ]);

  // -----------------------------------------------------------------------
  // Phase 1: AMM Infrastructure (already has proxy/beacon — unchanged)
  // -----------------------------------------------------------------------
  console.log('[devnet-boot] Phase 1: Deploying AMM contracts...');

  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, AMM_SLOTS.AUTH_TOKEN_FACTORY, [100],
    'Auth Token Factory', onProgress, 32);

  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, AMM_SLOTS.POOL_BEACON_PROXY, [0x8fff],
    'Beacon Proxy Template', onProgress, 33);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'factory', AMM_SLOTS.FACTORY_LOGIC, [50],
    'AMM Factory Logic', onProgress, 34);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'pool', AMM_SLOTS.POOL_LOGIC, [50],
    'AMM Pool Logic', onProgress, 35);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, AMM_SLOTS.FACTORY_PROXY,
    [0x7fff, 4, AMM_SLOTS.FACTORY_LOGIC, 5],
    'AMM Factory Proxy', onProgress, 36);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, AMM_SLOTS.BEACON,
    [0x7fff, 4, AMM_SLOTS.POOL_LOGIC, 5],
    'AMM Beacon', onProgress, 37);

  // Initialize AMM Factory
  onProgress('Initializing AMM factory...', 38);
  let authTokens = await discoverAuthTokens(taproot);
  if (authTokens.length === 0) authTokens = await discoverAuthTokens(segwit);
  if (authTokens.length > 0) {
    const factoryAuthToken = authTokens[0];
    console.log('[devnet-boot] Factory auth token:', factoryAuthToken);
    await executeCall(provider, harness, segwit, taproot,
      `[4,${AMM_SLOTS.FACTORY_PROXY},0,${AMM_SLOTS.POOL_BEACON_PROXY},4,${AMM_SLOTS.BEACON}]:v0:v0`,
      `${factoryAuthToken}:1`);
  }

  const factoryId = `4:${AMM_SLOTS.FACTORY_PROXY}`;
  contracts.ammFactoryId = factoryId;

  // -----------------------------------------------------------------------
  // Add quspo BEFORE Phase 2 so the SDK's alkane UTXO selector can find
  // the DIESEL/frBTC dust UTXOs when building the CreateNewPool transaction.
  // Without quspo, `get_address_outpoints` returns empty → SDK reports
  // "Insufficient alkanes: have 0" even though the tokens exist on-chain.
  // We add it here (after Phase 1 deploys) rather than at boot start to
  // avoid quspo adding per-block overhead during the 6 deploy transactions.
  // -----------------------------------------------------------------------
  if (quspoWasm) {
    try {
      harness.server.addTertiary('quspo', quspoWasm);
      harness.mineBlocks(1);
      await new Promise(r => setTimeout(r, 200));
      console.log('[devnet-boot] quspo tertiary indexer added (pre-Phase2)');
    } catch (e: any) {
      console.warn('[devnet-boot] Failed to add quspo before Phase 2 (non-fatal):', e?.message || e);
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2: Mint DIESEL + wrap frBTC + create AMM pool
  // -----------------------------------------------------------------------
  onProgress('Minting DIESEL...', 40);
  console.log('[devnet-boot] Phase 2: Seeding tokens...');

  for (let i = 0; i < 3; i++) {
    harness.mineBlocks(1);
    await executeCall(provider, harness, segwit, taproot,
      '[2,0,77]:v0:v0', 'B:10000:v0');
  }
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  // Wrap BTC → frBTC
  onProgress('Wrapping BTC to frBTC...', 42);
  let signerAddr = taproot;
  try {
    const signerResult = await simulate('32:0', ['103']);
    if (signerResult?.result?.execution?.data) {
      const hex = signerResult.result.execution.data.replace('0x', '');
      if (hex.length === 64) {
        const bitcoin = await import('bitcoinjs-lib');
        const ecc = await import('@bitcoinerlab/secp256k1');
        bitcoin.initEccLib(ecc);
        const xOnly = Buffer.from(hex, 'hex');
        const payment = bitcoin.payments.p2tr({
          internalPubkey: xOnly,
          network: bitcoin.networks.regtest,
        });
        if (payment.address) signerAddr = payment.address;
      }
    }
  } catch (e: any) {
    console.warn('[devnet-boot] Failed to get frBTC signer, using taproot:', e?.message);
  }
  await executeCall(provider, harness, segwit, taproot,
    '[32,0,77]:v1:v1', 'B:1000000:v0', [signerAddr, taproot]);
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  // Create AMM pool
  onProgress('Creating AMM pool...', 44);
  // Check both taproot and segwit — alkane change can land at either address
  // depending on which UTXOs the SDK selected. protorunesbyaddress has known
  // phantom-balance issues so we sum from both addresses defensively.
  const dieselBalTaproot = await getAlkaneBalance(provider, taproot, '2:0');
  const dieselBalSegwit = await getAlkaneBalance(provider, segwit, '2:0');
  const frbtcBalTaproot = await getAlkaneBalance(provider, taproot, '32:0');
  const frbtcBalSegwit = await getAlkaneBalance(provider, segwit, '32:0');
  const dieselBal = dieselBalTaproot + dieselBalSegwit;
  const frbtcBal = frbtcBalTaproot + frbtcBalSegwit;
  console.log('[devnet-boot] DIESEL taproot:', dieselBalTaproot.toString(), 'segwit:', dieselBalSegwit.toString(), 'total:', dieselBal.toString());
  console.log('[devnet-boot] frBTC taproot:', frbtcBalTaproot.toString(), 'segwit:', frbtcBalSegwit.toString(), 'total:', frbtcBal.toString());

  // Fallback: if balance query returns 0 (protorunesbyaddress phantom issue),
  // use conservative fixed amounts. 3x mints of 10000 DIESEL = 30000 total;
  // wrap of 1000000 sats frBTC should yield ~1000000 units.
  const effectiveDiesel = dieselBal > BigInt(0) ? dieselBal : BigInt(10000);
  const effectiveFrbtc = frbtcBal > BigInt(0) ? frbtcBal : BigInt(500000);
  if (dieselBal === BigInt(0) || frbtcBal === BigInt(0)) {
    console.warn('[devnet-boot] Balance query returned 0 — using fallback amounts for pool creation. diesel=', effectiveDiesel.toString(), 'frbtc=', effectiveFrbtc.toString());
  }

  let poolId = '';
  const dieselAmount = effectiveDiesel / BigInt(3);
  const frbtcAmount = effectiveFrbtc / BigInt(2);
  const [fBlock, fTx] = factoryId.split(':');
  console.log('[devnet-boot] Creating pool with DIESEL:', dieselAmount.toString(), 'frBTC:', frbtcAmount.toString());
  // Use taproot-only from_addresses so protect_taproot=false is set (isTaprootOnly path
  // in executeCall). DIESEL and frBTC both live on taproot dust UTXOs — with the default
  // [segwit, taproot] + protect_taproot=true, the SDK treats taproot UTXOs as ineligible
  // for spending and reports "Insufficient alkanes: have 0" even though they exist.
  await executeCall(provider, harness, segwit, taproot,
    `[${fBlock},${fTx},1,2,0,32,0,${dieselAmount},${frbtcAmount}]:v0:v0`,
    `2:0:${dieselAmount},32:0:${frbtcAmount}`,
    undefined,
    [taproot]);
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  try {
    const findPool = await simulate(factoryId, ['2', '2', '0', '32', '0']);
    const poolData = findPool?.result?.execution?.data?.replace('0x', '') || '';
    console.log('[devnet-boot] FindPool response data length:', poolData.length, 'raw:', poolData.slice(0, 64));
    if (poolData.length >= 64) {
      // Parse two u128 LE values (pool block and tx) from hex.
      // Browser Buffer polyfill may not support readBigUInt64LE, so parse manually.
      const poolBlock128 = parseLeU128FromHex(poolData, 0);
      const poolTx128 = parseLeU128FromHex(poolData, 16);
      poolId = `${poolBlock128}:${poolTx128}`;
      console.log('[devnet-boot] AMM pool created:', poolId);
    } else {
      console.warn('[devnet-boot] Pool creation may have failed — FindPool returned empty data. Check executeCall error above.');
    }
  } catch (e: any) {
    console.warn('[devnet-boot] Pool discovery failed:', e?.message);
  }
  contracts.ammPoolId = poolId;
  const [poolBlock, poolTx] = poolId ? poolId.split(':').map(Number) : [2, 0];

  // -----------------------------------------------------------------------
  // AMM-only mode: skip all phases beyond 2 (CLOB, FIRE, Fujin, Bridge,
  // Synth, Vaults, seeding). This cuts boot time from ~5 min to ~45 sec.
  // -----------------------------------------------------------------------
  if (ammOnly) {
    onProgress('AMM devnet ready!', 100);
    console.log('[devnet-boot] ammOnly=true — skipping phases 3–10');
    return contracts;
  }

  // -----------------------------------------------------------------------
  // Phase 3a: Carbine CLOB — deployed early so logs are visible before
  // console overflow from later phases. No dependency on FIRE/Fujin/bridges.
  // -----------------------------------------------------------------------
  // CRITICAL: Carbine contracts do NOT support opcode 50 (the default init
  // arg in deployWithProxy/deployWithBeacon). Using [50] causes CREATERESERVED
  // to revert atomically — the WASM binary is never stored, and the proxy
  // points at an empty slot. Every extcall then fails with "unexpected end
  // of file". The fix: deploy impls with contract-specific safe opcodes.
  //
  // Verified init args (from __tests__/devnet/carbine-orderbook-parsing.test.ts):
  //   Controller impl: [0, 0, 0]  — opcode 0 (Initialize) with dummy template [0:0]
  //   Template impl:   [3]        — opcode 3 (query_metadata), read-only
  //   Router impl:     [0]        — opcode 0 (Initialize)
  //
  // ⚠ WASM VERSION PINNED: public/wasm/carbine_controller.wasm contains the
  //   Mask256 fix (2026-04-01). This fixes sell orders (side=1) being invisible
  //   in GetOrderbookDepth. The old u128 branch mask caused 1u128<<255==0 in
  //   WASM release mode, making all sell-side trie keys unnavigable.
  //
  // ⚠ STORAGE INCOMPATIBILITY: The Mask256 fix changes trie branch storage paths
  //   from /branches/{depth}/{partial_key}       (single u128 key, old)
  //   to   /branches/{depth}/{partial_key}/lo    (bits 0-127)
  //        /branches/{depth}/{partial_key}/hi    (bits 128-255)
  //   Old devnet state CANNOT be read by the new WASM. If the app was booted
  //   before this WASM update, use "Clear & Reload" in DevnetControlPanel.
  //   A fresh boot always deploys the correct binary, so new devnets are fine.
  // -----------------------------------------------------------------------
  onProgress('Deploying Carbine CLOB...', 40);
  console.log('[devnet-boot] Phase 3a: Carbine CLOB (proxied)...');
  try {
    // 1. Controller impl [4:80000] — opcode 0 = Initialize(template_block=0, template_tx=0)
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'carbine_controller', S.CARBINE_CTRL_IMPL, [0, 0, 0],
      'Carbine Controller Impl', onProgress, 40);
    // 2. Controller proxy [4:70000]
    await deployWasm(provider, harness, segwit, taproot,
      upgradeableWasm, S.CARBINE_CTRL_PROXY,
      [0x7fff, 4, S.CARBINE_CTRL_IMPL, 1],
      'Carbine Controller Proxy', onProgress, 41);
    contracts.carbineController.authTokenId = await discoverLastAuthToken(taproot);

    // 3. Template impl [4:80001] — opcode 3 = query_metadata (read-only, safe)
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'carbine_template', S.CARBINE_TMPL_IMPL, [3],
      'Carbine Template Impl', onProgress, 42);
    // 4. Template beacon [4:90001]
    await deployWasm(provider, harness, segwit, taproot,
      upgradeableBeaconWasm, S.CARBINE_TMPL_BEACON,
      [0x7fff, 4, S.CARBINE_TMPL_IMPL, 1],
      'Carbine Template Beacon', onProgress, 42);
    contracts.carbineTemplate.authTokenId = await discoverLastAuthToken(taproot);

    // 5. Template beacon-proxy instance [4:70001]
    await deployBeaconInstance(provider, harness, segwit, taproot,
      beaconProxyWasm, S.CARBINE_TEMPLATE, S.CARBINE_TMPL_BEACON,
      'Carbine Default', onProgress, 43);

    // 6. Router impl [4:80002] — opcode 0 = Initialize
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'universal_router', S.UNIVERSAL_ROUTER_IMPL, [0],
      'Universal Router Impl', onProgress, 43);
    // 7. Router proxy [4:70002]
    await deployWasm(provider, harness, segwit, taproot,
      upgradeableWasm, S.UNIVERSAL_ROUTER_PROXY,
      [0x7fff, 4, S.UNIVERSAL_ROUTER_IMPL, 1],
      'Universal Router Proxy', onProgress, 44);
    contracts.universalRouter.authTokenId = await discoverLastAuthToken(taproot);

    // Initialize controller through proxy with real template reference.
    // Opcode 0 = Initialize, args = [4, CARBINE_TEMPLATE] = template at [4:70001]
    await initThroughProxy(provider, harness, segwit, taproot,
      S.CARBINE_CTRL_PROXY, [0, 4, S.CARBINE_TEMPLATE],
      'Carbine Controller');

    // Initialize Universal Router through proxy.
    // Pre-flight: check heights, UTXO counts, and simulate before committing to alkanesExecuteFull.
    try {
      const heightRes = await rpcCall('metashrew_height', []);
      const blockCountRes = await rpcCall('getblockcount', []);
      console.log('[devnet-boot] Router pre-flight: metashrew=%s, bitcoind=%s',
        JSON.stringify(heightRes?.result), JSON.stringify(blockCountRes?.result));

      // Simulate the router init call to verify it would succeed
      const simRes = await simulate(
        `4:${S.UNIVERSAL_ROUTER_PROXY}`,
        ['0', '4', String(S.CARBINE_CTRL_PROXY), '4', String(AMM_SLOTS.FACTORY_PROXY)],
      );
      console.log('[devnet-boot] Router init sim: err=%s data=%s',
        simRes?.result?.execution?.error?.slice(0, 80) || 'null',
        simRes?.result?.execution?.data?.slice(0, 40) || 'null');

      console.log('[devnet-boot] Calling initThroughProxy for Universal Router (taproot-only from_addresses)...');
      // CRITICAL: Pass [taproot] only — segwit has 300+ UTXOs at this point in boot.
      // WASM PSBT builder is O(n²); both addresses cause an indefinite hang.
      // Taproot has ~5 UTXOs (dust from alkane ops), completes in ~200ms.
      // Verified in router-init-isolated.test.ts: 75ms with 118 UTXOs.
      await initThroughProxy(provider, harness, segwit, taproot,
        S.UNIVERSAL_ROUTER_PROXY,
        [0, 4, S.CARBINE_CTRL_PROXY, 4, AMM_SLOTS.FACTORY_PROXY],
        'Universal Router',
        [taproot],  // taproot-only to avoid UTXO-bloat hang
      );
      console.log('[devnet-boot] Universal Router initialized!');
    } catch (routerErr: any) {
      console.error('[devnet-boot] Router init error:', routerErr?.message?.slice(0, 200));
    }

    // NOTE: CLOB order seeding moved to Phase 10 (after all deployments complete).
    // The alkanes indexer needs time to process the pool creation tx before
    // alkanes_protorunesbyaddress can discover the DIESEL/frBTC change UTXOs.
    // During Phase 3a the indexer is still catching up → balance queries return 0
    // → "Insufficient alkanes" on every order placement. Phase 10 runs after
    // 50+ additional deploys have mined blocks, giving the indexer time to sync.

    console.log('[devnet-boot] Carbine CLOB deployed and initialized');
  } catch (e: any) {
    console.warn('[devnet-boot] Carbine deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 3: FIRE Protocol — 6 contracts, each behind upgradeable proxy
  // Deploy impl at +10000 slot, proxy at original slot.
  // Business init happens THROUGH proxy (delegatecall).
  // -----------------------------------------------------------------------
  onProgress('Deploying FIRE protocol...', 46);
  console.log('[devnet-boot] Phase 3: FIRE protocol (impl+proxy for each)...');
  const F = FIRE_SLOTS;

  // Deploy all 6 FIRE impls + proxies
  contracts.fireTreasury.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_treasury', F.TREASURY_IMPL, F.TREASURY_PROXY,
    'FIRE Treasury', onProgress, 47);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.TREASURY_PROXY,
    [0, 4, F.TOKEN_PROXY, 32, 0, poolBlock, poolTx, poolBlock, poolTx],
    'FIRE Treasury');

  contracts.fireToken.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_token', F.TOKEN_IMPL, F.TOKEN_PROXY,
    'FIRE Token', onProgress, 49);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.TOKEN_PROXY,
    [0, 4, F.STAKING_PROXY],
    'FIRE Token');

  contracts.fireStaking.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_staking', F.STAKING_IMPL, F.STAKING_PROXY,
    'FIRE Staking', onProgress, 51);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.STAKING_PROXY,
    [0, poolBlock, poolTx, 4, F.TOKEN_PROXY],
    'FIRE Staking');

  contracts.fireBonding.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_bonding', F.BONDING_IMPL, F.BONDING_PROXY,
    'FIRE Bonding', onProgress, 53);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.BONDING_PROXY,
    [0, 4, F.TOKEN_PROXY, poolBlock, poolTx, 4, F.TREASURY_PROXY, 4, F.TOKEN_PROXY],
    'FIRE Bonding');

  contracts.fireRedemption.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_redemption', F.REDEMPTION_IMPL, F.REDEMPTION_PROXY,
    'FIRE Redemption', onProgress, 55);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.REDEMPTION_PROXY,
    [0, 4, F.TOKEN_PROXY, 4, F.TREASURY_PROXY],
    'FIRE Redemption');

  contracts.fireDistributor.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_distributor', F.DISTRIBUTOR_IMPL, F.DISTRIBUTOR_PROXY,
    'FIRE Distributor', onProgress, 57);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.DISTRIBUTOR_PROXY,
    [0, 4, F.TOKEN_PROXY, 32, 0, 4, F.TREASURY_PROXY],
    'FIRE Distributor');

  // -----------------------------------------------------------------------
  // Phase 4: Core Protocol — standalone proxies + template beacons
  // -----------------------------------------------------------------------
  onProgress('Deploying core protocol...', 60);
  console.log('[devnet-boot] Phase 4: Core protocol (proxied)...');

  // FUEL Token — standalone proxy
  contracts.fuelToken.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'frost_token', S.FUEL_TOKEN_IMPL, S.FUEL_TOKEN_PROXY,
    'FUEL Token', onProgress, 61);
  await initThroughProxy(provider, harness, segwit, taproot,
    S.FUEL_TOKEN_PROXY,
    [0, 1000000000000000, 4, S.FUEL_TOKEN_PROXY],
    'FUEL Token');

  // ftrBTC — beacon template (instances created on demand)
  contracts.ftrBtcTemplate.authTokenId = await deployWithBeacon(
    provider, harness, segwit, taproot, upgradeableBeaconWasm,
    'ftr_btc', S.FTRBTC_IMPL, S.FTRBTC_BEACON,
    'ftrBTC Template', onProgress, 63);

  // yvfrBTC Vault — rebuilt with deposit=opcode 2, withdraw=opcode 3
  // VAULT CHAIN: dxBTC → yv-fr-btc-vault → vxFUEL gauge
  // All three accept the DIESEL/frBTC pool LP token (poolBlock:poolTx).
  //
  // yv-fr-btc-vault init: (yv_fr_btc, yv_boost_id, fr_btc_diesel_lp_id, gauge_contract_id)
  //   yv_fr_btc         = pool LP — the token the vault accepts for deposit
  //   yv_boost_id       = self (placeholder, yv-boost not deployed on devnet)
  //   fr_btc_diesel_lp_id = pool LP (same token)
  //   gauge_contract_id = vxFUEL gauge
  contracts.yvFrbtcVault = contracts.yvFrbtcVault || { proxyId: '', implId: '', authTokenId: '' };
  contracts.yvFrbtcVault.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'yv_fr_btc_vault', S.YV_FRBTC_VAULT_IMPL, S.YV_FRBTC_VAULT_PROXY,
    'yvfrBTC Vault', onProgress, 64,
    [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  await initThroughProxy(provider, harness, segwit, taproot,
    S.YV_FRBTC_VAULT_PROXY,
    [0, poolBlock, poolTx, 4, S.YV_FRBTC_VAULT_PROXY, poolBlock, poolTx, 4, S.VX_FUEL_GAUGE],
    'yvfrBTC Vault');

  // dxBTC Vault — rebuilt from kungfuflex/vaults, 2-field AlkaneId
  // dx-btc init: (asset_id=poolLP, yv_fr_btc_vault_id=yv-vault)
  // asset_id = pool LP so PolyVault swap() finds it in incoming_alkanes
  contracts.dxBtcVault.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'dx_btc', S.DXBTC_VAULT_IMPL, S.DXBTC_VAULT_PROXY,
    'dxBTC Vault', onProgress, 65,
    [11]);
  await initThroughProxy(provider, harness, segwit, taproot,
    S.DXBTC_VAULT_PROXY,
    [0, poolBlock, poolTx, 4, S.YV_FRBTC_VAULT_PROXY],
    'dxBTC Vault');

  // vx gauge template — beacon (shared impl for vxFUEL + vxBTCUSD instances)
  // The rebuilt gauge (from gauge-contract/) only has opcodes 0-4,10.
  // Use opcode 3 (ClaimRewards, no params, no auth) for safe CREATERESERVED init.
  // Note: prod gauge had opcodes 20-55 but rebuilt gauge has fewer opcodes.
  contracts.vxGaugeTemplate.authTokenId = await deployWithBeacon(
    provider, harness, segwit, taproot, upgradeableBeaconWasm,
    'vx_token_gauge_template', S.VX_GAUGE_IMPL, S.VX_GAUGE_BEACON,
    'vxGauge Template', onProgress, 67,
    [3]);

  // vxFUEL gauge — beacon proxy instance
  // lp_token = DIESEL/frBTC pool LP — matches what yv-vault forwards through the chain.
  // Init: (lp_token=poolLP, reward_token=dxBTC, yve_token_nft_id=self, reward_rate=100000, fr_sigil_id=self)
  await deployBeaconInstance(provider, harness, segwit, taproot,
    beaconProxyWasm, S.VX_FUEL_GAUGE, S.VX_GAUGE_BEACON,
    'vxFUEL Gauge', onProgress, 68);
  await initBeaconInstance(provider, harness, segwit, taproot,
    S.VX_FUEL_GAUGE,
    [0, poolBlock, poolTx, 4, S.DXBTC_VAULT_PROXY, 4, S.VX_FUEL_GAUGE, 100000, 4, S.VX_FUEL_GAUGE],
    'vxFUEL Gauge');

  // Diagnostic: simulate gauge stake to verify impl has bytecode
  {
    const gSim = await simulate(`4:${S.VX_FUEL_GAUGE}`, ['1', '1000']);
    console.log('[devnet-boot] Gauge stake simulate:',
      'err=', gSim?.result?.execution?.error?.slice(0, 120) || 'NONE',
      'data=', (gSim?.result?.execution?.data || '').slice(0, 40));
  }

  // vxBTCUSD gauge — beacon proxy instance
  await deployBeaconInstance(provider, harness, segwit, taproot,
    beaconProxyWasm, S.VX_BTCUSD_GAUGE, S.VX_GAUGE_BEACON,
    'vxBTCUSD Gauge', onProgress, 69);
  await initBeaconInstance(provider, harness, segwit, taproot,
    S.VX_BTCUSD_GAUGE,
    [0, poolBlock, poolTx, 4, F.TOKEN_PROXY, 4, S.VX_BTCUSD_GAUGE, 100000, 4, S.VX_BTCUSD_GAUGE],
    'vxBTCUSD Gauge');

  // -----------------------------------------------------------------------
  // Phase 5: Fujin Difficulty Futures (already has proxy/beacon — unchanged)
  // -----------------------------------------------------------------------
  onProgress('Deploying Fujin...', 72);
  console.log('[devnet-boot] Phase 5: Deploying Fujin...');

  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, S.FUJIN_AUTH_TOKEN, [100],
    'Fujin Auth Token', onProgress, 73);

  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, S.FUJIN_BEACON_PROXY, [0x8fff],
    'Fujin Beacon Proxy', onProgress, 74);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_pool', S.FUJIN_POOL_TEMPLATE, [50],
    'Fujin Pool Template', onProgress, 75);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_runtime_pool', S.FUJIN_RUNTIME_POOL, [50],
    'Fujin Runtime Pool', onProgress, 76);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_runtime_factory', S.FUJIN_RUNTIME_FACTORY, [50],
    'Fujin Runtime Factory', onProgress, 77);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, S.FUJIN_BEACON,
    [0x7fff, 4, S.FUJIN_POOL_TEMPLATE, 1],
    'Fujin Beacon', onProgress, 78);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_UPGRADEABLE_TEMPLATE, [0x8fff],
    'Fujin Upgradeable Template', onProgress, 79);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_factory', S.FUJIN_FACTORY_LOGIC, [50],
    'Fujin Factory Logic', onProgress, 80);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_token_template', S.FUJIN_TOKEN_TEMPLATE, [50],
    'Fujin Token Template', onProgress, 81);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_zap', S.FUJIN_ZAP, [50],
    'Fujin Zap', onProgress, 82);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_lp', S.FUJIN_LP_VAULT, [50],
    'Fujin LP Vault', onProgress, 83);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_master', S.FUJIN_MASTER_LOGIC, [50],
    'Fujin Master Logic', onProgress, 84);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_MASTER_PROXY,
    [0x7fff, 4, S.FUJIN_MASTER_LOGIC, 1],
    'Fujin Master Proxy', onProgress, 85);

  onProgress('Initializing MasterFujin...', 86);
  await executeCall(provider, harness, segwit, taproot,
    `[4,${S.FUJIN_MASTER_PROXY},0,` +
    `4,${S.FUJIN_FACTORY_LOGIC},` +
    `${S.FUJIN_UPGRADEABLE_TEMPLATE},` +
    `${S.FUJIN_BEACON_PROXY},` +
    `4,${S.FUJIN_BEACON},` +
    `${S.FUJIN_TOKEN_TEMPLATE},` +
    `${S.FUJIN_LP_VAULT},` +
    `${S.FUJIN_ZAP}` +
    `]:v0:v0`,
    'B:100000:v0');
  console.log('[devnet-boot] MasterFujin initialized');

  // Phase 6 slot intentionally left empty — Carbine moved to Phase 3a (above FIRE)

  // -----------------------------------------------------------------------
  // Phase 7: Bridge contracts — each behind upgradeable proxy
  // -----------------------------------------------------------------------
  onProgress('Deploying bridge contracts...', 91);
  console.log('[devnet-boot] Phase 7: Bridge contracts (proxied)...');
  try {
    contracts.frzec.authTokenId = await deployWithProxy(
      provider, harness, segwit, taproot, upgradeableWasm,
      'fr_zec', S.FRZEC_IMPL, S.FRZEC_PROXY,
      'frZEC', onProgress, 91);

    contracts.freth.authTokenId = await deployWithProxy(
      provider, harness, segwit, taproot, upgradeableWasm,
      'fr_eth', S.FRETH_IMPL, S.FRETH_PROXY,
      'frETH', onProgress, 92);
  } catch (e: any) {
    console.warn('[devnet-boot] Bridge deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 8: Synth Pools — beacon template + 6 beacon-proxy instances
  // All pools share one synth_pool implementation via a single beacon.
  // Upgrade the beacon once → all 6 pools get the new implementation.
  // -----------------------------------------------------------------------
  onProgress('Deploying synth pools...', 94);
  console.log('[devnet-boot] Phase 8: Synth pools (beacon pattern)...');

  const FRUSD_BLOCK = 4;
  const FRUSD_TX = 8201;

  try {
    // Deploy synth_pool impl + beacon
    contracts.synthPoolTemplate.authTokenId = await deployWithBeacon(
      provider, harness, segwit, taproot, upgradeableBeaconWasm,
      'synth_pool', S.SYNTH_POOL_IMPL, S.SYNTH_POOL_BEACON,
      'Synth Pool', onProgress, 94);

    // Deploy 6 beacon-proxy instances + initialize each with its token pair + A coefficient
    const poolDefs: [number, number, number, number, number, number, string][] = [
      [S.SYNTH_FRBTC_FRZEC, 32, 0, 4, S.FRZEC_PROXY, 100, 'frBTC/frZEC'],
      [S.SYNTH_FRBTC_FRETH, 32, 0, 4, S.FRETH_PROXY, 15,  'frBTC/frETH'],
      [S.SYNTH_FRBTC_FRUSD, 32, 0, FRUSD_BLOCK, FRUSD_TX, 8, 'frBTC/frUSD'],
      [S.SYNTH_FRZEC_FRUSD, 4, S.FRZEC_PROXY, FRUSD_BLOCK, FRUSD_TX, 8, 'frZEC/frUSD'],
      [S.SYNTH_FRZEC_FRETH, 4, S.FRZEC_PROXY, 4, S.FRETH_PROXY, 30, 'frZEC/frETH'],
      [S.SYNTH_FRETH_FRUSD, 4, S.FRETH_PROXY, FRUSD_BLOCK, FRUSD_TX, 8, 'frETH/frUSD'],
    ];

    for (const [slot, aBlk, aTx, bBlk, bTx, amp, label] of poolDefs) {
      try {
        await deployBeaconInstance(provider, harness, segwit, taproot,
          beaconProxyWasm, slot, S.SYNTH_POOL_BEACON,
          label, onProgress, 96);
        await initBeaconInstance(provider, harness, segwit, taproot,
          slot, [0, aBlk, aTx, bBlk, bTx, amp], label);
        console.log(`[devnet-boot]   Pool ${label} at 4:${slot}`);
      } catch (poolErr: any) {
        console.warn(`[devnet-boot] Pool ${label} failed:`, poolErr?.message?.substring(0, 60));
      }
    }
    console.log('[devnet-boot] Synth pools deployed (beacon pattern)');
  } catch (e: any) {
    console.warn('[devnet-boot] Synth pool deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 9: Verify key contracts
  // -----------------------------------------------------------------------
  onProgress('Verifying deployments...', 98);
  console.log('[devnet-boot] Phase 9: Verifying...');
  const checks: [string, string, string][] = [
    ['AMM Factory', factoryId, '4'],
    ['FIRE Token (proxy)', `4:${F.TOKEN_PROXY}`, '99'],
    ['FUEL Token (proxy)', `4:${S.FUEL_TOKEN_PROXY}`, '99'],
    ['Fujin Master', `4:${S.FUJIN_MASTER_PROXY}`, '32765'],
    ['vxFUEL (beacon-proxy)', `4:${S.VX_FUEL_GAUGE}`, '99'],
  ];
  for (const [name, id, opcode] of checks) {
    try {
      const check = await simulate(id, [opcode]);
      const err = check?.result?.execution?.error || '';
      const status = err.includes('unexpected end of file') ? 'NOT DEPLOYED' :
                     err ? 'deployed' : 'OK';
      console.log(`[devnet-boot]   ${name} [${id}]: ${status}`);
    } catch {
      console.log(`[devnet-boot]   ${name} [${id}]: check failed`);
    }
  }

  console.log('[devnet-boot] Full protocol deployment complete (all contracts upgradeable)!');

  // Fill in legacy flat IDs
  contracts.fireTokenId       = contracts.fireToken.proxyId;
  contracts.fireStakingId     = contracts.fireStaking.proxyId;
  contracts.fireTreasuryId    = contracts.fireTreasury.proxyId;
  contracts.fireBondingId     = contracts.fireBonding.proxyId;
  contracts.fireRedemptionId  = contracts.fireRedemption.proxyId;
  contracts.fireDistributorId = contracts.fireDistributor.proxyId;
  contracts.fuelTokenId       = contracts.fuelToken.proxyId;
  contracts.dxBtcVaultId      = contracts.dxBtcVault.proxyId;
  contracts.frzecId           = contracts.frzec.proxyId;
  contracts.frethId           = contracts.freth.proxyId;
  contracts.vxFuelGaugeId     = `4:${S.VX_FUEL_GAUGE}`;
  contracts.vxBtcUsdGaugeId   = `4:${S.VX_BTCUSD_GAUGE}`;
  contracts.ftrBtcTemplateId  = `4:${S.FTRBTC_BEACON}`;
  contracts.carbineControllerId = contracts.carbineController.proxyId;
  contracts.fujinFactoryId    = `4:${S.FUJIN_FACTORY_LOGIC}`;
  contracts.fujinMasterId     = `4:${S.FUJIN_MASTER_PROXY}`;
  contracts.frusdTokenId      = `${FRUSD_BLOCK}:${FRUSD_TX}`;
  contracts.frusdAuthTokenId  = '';

  // Phase 9: Vault seeding moved to Phase 10a (after fresh token mint).
  // See "alkane UTXOs consumed by deployWasm" comment in Phase 10a.

  // -----------------------------------------------------------------------
  // Phase 10a: Seed CLOB Orderbook — moved here from Phase 3a because the
  // alkanes indexer needs time to process pool creation before balance queries
  // return non-zero. By Phase 10 the indexer has caught up from 50+ deploy txs.
  //
  // Places buy orders (side=0, frBTC as input) and sell orders (side=1, DIESEL as input)
  // at prices computed from actual AMM pool reserves.
  // -----------------------------------------------------------------------
  onProgress('Seeding CLOB orderbook...', 97);
  try {
    console.log('[devnet-boot] Phase 10a: Seeding CLOB orderbook...');
    const ctrlProxy = S.CARBINE_CTRL_PROXY;

    // Re-mint DIESEL + re-wrap frBTC for seeding.
    // The original alkane UTXOs from Phase 2 were consumed as BTC fee inputs
    // by the 50+ deployWasm() calls between Phase 2 and Phase 10. Each deploy
    // uses from_addresses: [segwit, taproot] and picks ANY UTXO for fees —
    // including dust UTXOs that carry alkane tokens. By Phase 10, all alkane
    // change UTXOs have been spent as deployment fee inputs, destroying the
    // DIESEL and frBTC balances.
    //
    // Fix: mint fresh tokens specifically for seeding.
    console.log('[devnet-boot] Minting fresh DIESEL for CLOB seeding...');
    await executeCall(provider, harness, segwit, taproot,
      '[2,0,77]:v0:v0', 'B:10000:v0', [taproot]);

    // Wrap fresh frBTC
    console.log('[devnet-boot] Wrapping fresh frBTC for CLOB seeding...');
    let signerAddr = taproot;
    try {
      const sigResult = await simulate('32:0', ['103']);
      if (sigResult?.result?.execution?.data) {
        const hex = sigResult.result.execution.data.replace('0x', '');
        if (hex.length === 64) {
          const bitcoin = await import('bitcoinjs-lib');
          const ecc = await import('@bitcoinerlab/secp256k1');
          bitcoin.initEccLib(ecc);
          const xOnly = Buffer.from(hex, 'hex');
          const p = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: bitcoin.networks.regtest });
          if (p.address) signerAddr = p.address;
        }
      }
    } catch {}
    await executeCall(provider, harness, segwit, taproot,
      '[32,0,77]:v1:v1', 'B:500000:v0', [signerAddr, taproot]);
    harness.mineBlocks(2);
    await new Promise(r => setTimeout(r, 300));

    // Now check balances
    const dieselBefore = await getAlkaneBalance(provider, taproot, '2:0');
    const frbtcBefore = await getAlkaneBalance(provider, taproot, '32:0');
    console.log('[devnet-boot] CLOB pre-seed balances after fresh mint: DIESEL=', dieselBefore.toString(), 'frBTC=', frbtcBefore.toString());

    // Compute spot price from pool reserves
    let spotPrice = BigInt(0);
    if (poolId) {
      const reservesResult = await simulate(poolId, ['97']);
      const resHex = reservesResult?.result?.execution?.data?.replace('0x', '') || '';
      if (resHex.length >= 64) {
        const reserve0 = parseLeU128BigInt(resHex, 0);
        const reserve1 = parseLeU128BigInt(resHex, 16);
        if (reserve0 > BigInt(0)) {
          spotPrice = (reserve1 * BigInt(100000000)) / reserve0;
        }
        console.log('[devnet-boot] Pool reserves: r0=', reserve0.toString(), 'r1=', reserve1.toString(),
          'spot=', spotPrice.toString());
      }
    }

    if (spotPrice > BigInt(0) && dieselBefore > BigInt(0) && frbtcBefore > BigInt(0)) {
      // Buy orders: offer frBTC to buy DIESEL at/above spot
      const buyPremiums = [100, 105, 110];
      const buyAmounts = ['500000000', '300000000', '200000000']; // 5, 3, 2 DIESEL
      for (let i = 0; i < buyPremiums.length; i++) {
        const price = (spotPrice * BigInt(buyPremiums[i]) / BigInt(100)).toString();
        const amount = buyAmounts[i];
        const frbtcCost = (BigInt(price) * BigInt(amount) / BigInt(100000000)).toString();
        await executeCall(provider, harness, segwit, taproot,
          `[4,${ctrlProxy},20,2,0,32,0,0,${price},${amount}]:v0:v0`,
          `32:0:${frbtcCost}`, [taproot]);
        console.log(`[devnet-boot] CLOB buy #${i + 1}: ${amount} DIESEL @ ${price}, cost=${frbtcCost} frBTC`);
      }

      // Sell orders: offer DIESEL, want frBTC at above-spot prices
      const sellPremiums = [105, 110, 120];
      const sellAmounts = ['500000000', '300000000', '200000000'];
      for (let i = 0; i < sellPremiums.length; i++) {
        const price = (spotPrice * BigInt(sellPremiums[i]) / BigInt(100)).toString();
        const amount = sellAmounts[i];
        await executeCall(provider, harness, segwit, taproot,
          `[4,${ctrlProxy},20,2,0,32,0,1,${price},${amount}]:v0:v0`,
          `2:0:${amount}`, [taproot]);
        console.log(`[devnet-boot] CLOB sell #${i + 1}: ${amount} DIESEL @ ${price}`);
      }
      console.log('[devnet-boot] CLOB orderbook seeded with 3 buy + 3 sell orders');
    } else {
      console.warn('[devnet-boot] Skipping CLOB seeding — spot=', spotPrice.toString(),
        'DIESEL=', dieselBefore.toString(), 'frBTC=', frbtcBefore.toString());
    }

    // Vault seeding: deposit LP tokens into dxBTC vault (opcode 1 = swap).
    // All three contracts accept DIESEL/frBTC pool LP: dxBTC → yv-vault → gauge.
    // First add liquidity to create LP tokens, then deposit LP into dxBTC.
    const vDiesel = await getAlkaneBalance(provider, taproot, '2:0');
    const vFrbtc = await getAlkaneBalance(provider, taproot, '32:0');
    if (vDiesel > BigInt(0) && vFrbtc > BigInt(0) && poolId) {
      const [pB, pT] = poolId.split(':');
      // Add liquidity to get LP tokens
      const addD = vDiesel / BigInt(3);
      const addF = vFrbtc / BigInt(3);
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${pB},${pT},1]:v0:v0`,
          `2:0:${addD},32:0:${addF}`, [taproot]);
        const lpBal = await getAlkaneBalance(provider, taproot, poolId);
        console.log('[devnet-boot] Created LP for vault deposit, balance:', lpBal.toString());

        if (lpBal > BigInt(0)) {
          const depositAmount = lpBal / BigInt(3);
          console.log('[devnet-boot] Depositing', depositAmount.toString(), 'LP into dxBTC vault...');

          // Simulate to check for errors before broadcasting
          const simSwap = await rpcCall('alkanes_simulate', [{
            target: { block: '4', tx: String(S.DXBTC_VAULT_PROXY) },
            inputs: ['1', '0'],
            alkanes: [{ id: { block: pB, tx: pT }, value: String(depositAmount) }],
            transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0,
          }]);
          console.log('[devnet-boot] dxBTC swap simulate:',
            'err=', simSwap?.result?.execution?.error?.slice(0, 200) || 'NONE',
            'data=', (simSwap?.result?.execution?.data || '').slice(0, 60));

          try {
            await executeCall(provider, harness, segwit, taproot,
              `[4,${S.DXBTC_VAULT_PROXY},1,0]:v0:v0`,
              `${pB}:${pT}:${depositAmount}`, [taproot]);
            console.log('[devnet-boot] dxBTC vault LP deposit complete, txid:', _lastTxid.slice(0, 32));

            const assetsCheck = await simulate(`4:${S.DXBTC_VAULT_PROXY}`, ['11']);
            const assets = assetsCheck?.result?.execution?.data
              ? parseLeU128BigInt(assetsCheck.result.execution.data.replace('0x', ''), 0) : BigInt(0);
            console.log('[devnet-boot] dxBTC vault state: totalAssets=', assets.toString(),
              'err=', assetsCheck?.result?.execution?.error || 'none');
          } catch (e: any) {
            console.warn('[devnet-boot] dxBTC vault deposit failed:', e?.message?.slice(0, 120));
          }
        }
      } catch (e: any) {
        console.warn('[devnet-boot] Add liquidity for vault failed:', e?.message?.slice(0, 80));
      }
    }
  } catch (e: any) {
    console.warn('[devnet-boot] CLOB/vault seeding failed (non-fatal):', e?.message?.slice(0, 120));
  }

  // -----------------------------------------------------------------------
  // Phase 10b: Seed FIRE Protocol State — full lifecycle seeding so every
  // FIRE dashboard tab has non-zero metrics and every user flow is testable.
  //
  // Auth token pattern: deployWithProxy() discovers auth tokens via
  // discoverAuthTokens() and stores them in contracts.fireTreasury.authTokenId.
  // Treasury opcode 1 (SetAuthorizedContract) requires this auth token as
  // incomingAlkanes. Pattern verified in e2e-fire.test.ts line 413-487.
  //
  // All opcodes verified against constants/index.ts and e2e-fire.test.ts.
  // -----------------------------------------------------------------------
  onProgress('Seeding FIRE protocol...', 98);
  try {
    console.log('[devnet-boot] Phase 10b: Seeding FIRE protocol state...');
    const treasuryAuth = contracts.fireTreasury.authTokenId;
    console.log('[devnet-boot] Treasury auth token:', treasuryAuth || 'NOT FOUND');

    // Step 0: Re-mint DIESEL + frBTC + add liquidity to get LP tokens.
    // Same alkane UTXO destruction issue as Phase 10a — all prior LP tokens
    // were consumed by deployWasm fee inputs. Must create fresh ones.
    console.log('[devnet-boot] Minting fresh tokens for FIRE seeding...');
    for (let i = 0; i < 3; i++) {
      await executeCall(provider, harness, segwit, taproot,
        '[2,0,77]:v0:v0', 'B:10000:v0', [taproot]);
    }
    await executeCall(provider, harness, segwit, taproot,
      '[32,0,77]:v1:v1', 'B:500000:v0', [signerAddr, taproot]);
    harness.mineBlocks(2);
    await new Promise(r => setTimeout(r, 300));

    // Add liquidity to create LP tokens
    const freshDiesel = await getAlkaneBalance(provider, taproot, '2:0');
    const freshFrbtc = await getAlkaneBalance(provider, taproot, '32:0');
    console.log('[devnet-boot] FIRE pre-seed: DIESEL=', freshDiesel.toString(), 'frBTC=', freshFrbtc.toString());
    let freshLp = BigInt(0);
    if (freshDiesel > BigInt(0) && freshFrbtc > BigInt(0) && poolId) {
      const addDiesel = freshDiesel / BigInt(2);
      const addFrbtc = freshFrbtc / BigInt(2);
      const [pB, pT] = poolId.split(':');
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${pB},${pT},1]:v0:v0`,
          `2:0:${addDiesel},32:0:${addFrbtc}`, [taproot]);
        harness.mineBlocks(1);
        freshLp = await getAlkaneBalance(provider, taproot, poolId);
        console.log('[devnet-boot] Added liquidity, LP balance:', freshLp.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] Add liquidity failed:', e?.message?.slice(0, 80));
      }
    }

    // Step 1: Authorize bonding, redemption, and distributor on treasury.
    // Treasury opcode 1 (SetAuthorizedContract): [1, type, block, tx]
    //   type 0 = bonding, type 1 = redemption, type 2 = distributor
    // Requires treasury auth token as incomingAlkanes: "authTokenId:1"
    // Verified in e2e-fire.test.ts: "should set authorized contracts on treasury"
    if (treasuryAuth) {
      const authCalls = [
        { type: 0, block: 4, tx: F.BONDING_PROXY,     label: 'Bonding' },
        { type: 1, block: 4, tx: F.REDEMPTION_PROXY,   label: 'Redemption' },
        { type: 2, block: 4, tx: F.DISTRIBUTOR_PROXY,  label: 'Distributor' },
      ];
      for (const auth of authCalls) {
        try {
          await executeCall(provider, harness, segwit, taproot,
            `[4,${F.TREASURY_PROXY},1,${auth.type},${auth.block},${auth.tx}]:v0:v0`,
            `${treasuryAuth}:1`, [taproot], [taproot]);
          console.log(`[devnet-boot] Treasury authorized: ${auth.label} [${auth.block}:${auth.tx}]`);
        } catch (e: any) {
          console.warn(`[devnet-boot] Treasury auth ${auth.label} failed:`, e?.message?.slice(0, 80));
        }
      }
    } else {
      console.warn('[devnet-boot] Skipping treasury authorization — no auth token');
    }

    // Step 2: Deposit LP tokens into treasury as backing for bonding/redemption.
    // Treasury opcode 10 (Deposit): send LP tokens as incomingAlkanes
    const lpForTreasury = await getAlkaneBalance(provider, taproot, `${poolBlock}:${poolTx}`);
    if (lpForTreasury > BigInt(0)) {
      const treasuryDeposit = lpForTreasury / BigInt(10); // 10% of LP
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[4,${F.TREASURY_PROXY},10]:v0:v0`,
          `${poolBlock}:${poolTx}:${treasuryDeposit}`, [taproot], [taproot]);
        console.log('[devnet-boot] Treasury LP deposit:', treasuryDeposit.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] Treasury deposit failed:', e?.message?.slice(0, 80));
      }
    }

    // Step 3: Stake LP in FIRE staking (no lock) to start emission.
    // Staking opcode 1 (Stake): [1, lock_duration=0] + LP as incomingAlkanes
    // Verified in e2e-fire.test.ts: "should stake LP tokens with no lock"
    const lpForStaking = await getAlkaneBalance(provider, taproot, `${poolBlock}:${poolTx}`);
    if (lpForStaking > BigInt(0)) {
      const stakeAmount = lpForStaking / BigInt(5); // 20% of remaining LP
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[4,${F.STAKING_PROXY},1,0]:v0:v0`,
          `${poolBlock}:${poolTx}:${stakeAmount}`, [taproot], [taproot]);
        console.log('[devnet-boot] FIRE staked LP:', stakeAmount.toString(), 'txid:', _lastTxid.slice(0, 32));
        // Check protorune outputs of the working FIRE staking tx for comparison
        if (_lastTxid) {
          try {
            const fp0 = await rpcCall('alkanes_protorunesbyoutpoint', [{ txid: _lastTxid, vout: 0 }]);
            console.log('[devnet-boot] FIRE protorunesbyoutpoint vout0:', JSON.stringify(fp0?.result ?? 'null').slice(0, 300));
          } catch {}
        }
        // Mine blocks to accrue rewards
        harness.mineBlocks(10);
      } catch (e: any) {
        console.warn('[devnet-boot] FIRE staking failed:', e?.message?.slice(0, 80));
      }
    }

    // Step 3b: Stake more LP with a 1-week lock (lock_duration=604800)
    // Gives the staking UI two positions: one unlocked, one locked (1.25x multiplier)
    const lpForLock = await getAlkaneBalance(provider, taproot, `${poolBlock}:${poolTx}`);
    if (lpForLock > BigInt(0)) {
      const lockAmount = lpForLock / BigInt(5);
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[4,${F.STAKING_PROXY},1,604800]:v0:v0`,  // 604800 = 1 week in seconds
          `${poolBlock}:${poolTx}:${lockAmount}`, [taproot], [taproot]);
        console.log('[devnet-boot] FIRE staked LP (1-week lock):', lockAmount.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] FIRE locked staking failed:', e?.message?.slice(0, 80));
      }
    }

    // Step 4: Claim FIRE rewards so user has FIRE tokens for bonding/redemption.
    // Staking opcode 3 (ClaimRewards): no token input required
    // Verified in e2e-fire.test.ts: "should claim rewards standalone"
    try {
      await executeCall(provider, harness, segwit, taproot,
        `[4,${F.STAKING_PROXY},3]:v0:v0`,
        'B:10000:v0', [taproot], [taproot]);
      const fireBalance = await getAlkaneBalance(provider, taproot, `4:${F.TOKEN_PROXY}`);
      console.log('[devnet-boot] FIRE claimed, balance:', fireBalance.toString());
    } catch (e: any) {
      console.warn('[devnet-boot] FIRE claim failed:', e?.message?.slice(0, 80));
    }

    // Step 5: Bond LP tokens for discounted FIRE (creates an active bond).
    // Bonding opcode 1 (Bond): LP tokens as incomingAlkanes
    // Verified in e2e-fire.test.ts: "should bond LP tokens for discounted FIRE"
    const lpForBond = await getAlkaneBalance(provider, taproot, `${poolBlock}:${poolTx}`);
    if (lpForBond > BigInt(0)) {
      const bondAmount = lpForBond / BigInt(10); // 10% of remaining LP
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[4,${F.BONDING_PROXY},1]:v0:v0`,
          `${poolBlock}:${poolTx}:${bondAmount}`, [taproot], [taproot]);
        console.log('[devnet-boot] FIRE bonded LP:', bondAmount.toString());
        // Mine blocks for partial vesting
        harness.mineBlocks(5);
      } catch (e: any) {
        console.warn('[devnet-boot] FIRE bonding failed:', e?.message?.slice(0, 80));
      }
    }

    // Step 6: Contribute frBTC to distributor (phase 0).
    // Distributor opcode 1 (Contribute): frBTC as incomingAlkanes
    // Verified in e2e-fire.test.ts: "should contribute frBTC during contribution phase"
    const frbtcForDist = await getAlkaneBalance(provider, taproot, '32:0');
    if (frbtcForDist > BigInt(1000)) {
      const contributeAmount = frbtcForDist / BigInt(20); // 5% of frBTC
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[4,${F.DISTRIBUTOR_PROXY},1]:v0:v0`,
          `32:0:${contributeAmount}`, [taproot], [taproot]);
        console.log('[devnet-boot] Distributor contribution:', contributeAmount.toString(), 'frBTC');
      } catch (e: any) {
        console.warn('[devnet-boot] Distributor contribution failed:', e?.message?.slice(0, 80));
      }
    }

    console.log('[devnet-boot] FIRE protocol seeding complete');
  } catch (e: any) {
    console.warn('[devnet-boot] FIRE seeding failed (non-fatal):', e?.message?.slice(0, 120));
  }

  // -----------------------------------------------------------------------
  // Phase 10c: Seed Fujin Difficulty Futures — create a market so the futures
  // page has data. MasterFujin opcode 1 (CreateMarket) orchestrates everything:
  // clones factory proxy, vault, zap; initializes factory with templates.
  //
  // After CreateMarket, query MasterFujin opcode 90 (GetMarket) to get the
  // dynamically created factory ID. Then call factory opcode 1 (InitEpoch) to
  // create the first epoch's pool + LONG/SHORT tokens.
  //
  // Source: reference/Fujin-contracts/alkanes/fujin-master/src/lib.rs
  // Pattern: e2e-futures-protocols.test.ts line 656-688
  // -----------------------------------------------------------------------
  onProgress('Seeding Fujin futures...', 99);
  try {
    console.log('[devnet-boot] Phase 10c: Seeding Fujin difficulty futures...');

    // CreateMarket: base_token = DIESEL (2:0), duration = 52 epochs (~1 year)
    // MasterFujin opcode 1: CreateMarket(base_token: AlkaneId, duration: u128)
    await executeCall(provider, harness, segwit, taproot,
      `[4,${S.FUJIN_MASTER_PROXY},1,2,0,52]:v0:v0`,
      'B:100000:v0', [taproot], [taproot]);
    console.log('[devnet-boot] Fujin CreateMarket(DIESEL, 52) complete');

    // Query MasterFujin to get the created factory/vault/zap IDs
    // Opcode 90: GetMarket(base_token, duration) → 96 bytes (factory+vault+zap)
    const marketResult = await simulate(`4:${S.FUJIN_MASTER_PROXY}`, ['90', '2', '0', '52']);
    const marketHex = marketResult?.result?.execution?.data?.replace('0x', '') || '';
    const marketErr = marketResult?.result?.execution?.error || '';
    if (marketHex.length >= 192 && !marketErr) {
      const factoryBlock = parseLeU128FromHex(marketHex, 0);
      const factoryTx = parseLeU128FromHex(marketHex, 16);
      const vaultBlock = parseLeU128FromHex(marketHex, 32);
      const vaultTx = parseLeU128FromHex(marketHex, 48);
      const zapBlock = parseLeU128FromHex(marketHex, 64);
      const zapTx = parseLeU128FromHex(marketHex, 80);
      console.log('[devnet-boot] Fujin market: factory=%s:%s vault=%s:%s zap=%s:%s',
        factoryBlock, factoryTx, vaultBlock, vaultTx, zapBlock, zapTx);

      // InitEpoch on the created factory to create the first pool + LONG/SHORT tokens
      // Factory opcode 1: InitEpoch (no args — uses current block height)
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${factoryBlock},${factoryTx},1]:v0:v0`,
          'B:100000:v0', [taproot], [taproot]);
        console.log('[devnet-boot] Fujin InitEpoch complete — pool + LONG/SHORT tokens created');
      } catch (e: any) {
        console.warn('[devnet-boot] Fujin InitEpoch failed:', e?.message?.slice(0, 80));
      }

      // Query market count to verify
      const countResult = await simulate(`4:${S.FUJIN_MASTER_PROXY}`, ['91']);
      const countHex = countResult?.result?.execution?.data?.replace('0x', '') || '';
      const count = countHex.length >= 32 ? parseLeU128FromHex(countHex, 0) : 0;
      console.log('[devnet-boot] Fujin market count:', count);
    } else {
      console.warn('[devnet-boot] Fujin market query failed: err=', marketErr.slice(0, 80));
    }
  } catch (e: any) {
    console.warn('[devnet-boot] Fujin seeding failed (non-fatal):', e?.message?.slice(0, 120));
  }

  // -----------------------------------------------------------------------
  // Phase 10d: Seed Activity Feeds — execute real swap/mint/burn transactions
  // so Global Trades, Positions, and My Activity tabs have data on boot.
  //
  // quspo indexes the full chain retroactively when addTertiary is called
  // (after deployFullProtocol returns). All transactions from Phase 10
  // will appear in the quspo trace history.
  //
  // We need:
  //   - AMM swaps (factory opcode 13) → Global Trades + My Activity
  //   - Add liquidity (pool opcode 1) → Positions + My Activity
  //   - Wrap BTC→frBTC (frBTC opcode 77) → My Activity
  //
  // All operations use freshly minted tokens (same UTXO destruction pattern).
  // -----------------------------------------------------------------------
  onProgress('Seeding activity feeds...', 99);
  try {
    console.log('[devnet-boot] Phase 10d: Seeding activity feeds...');

    // Fresh mint for activity seeding (prior tokens consumed by Phase 10a-c)
    for (let i = 0; i < 2; i++) {
      await executeCall(provider, harness, segwit, taproot,
        '[2,0,77]:v0:v0', 'B:10000:v0', [taproot]);
    }
    await executeCall(provider, harness, segwit, taproot,
      '[32,0,77]:v1:v1', 'B:300000:v0', [signerAddr, taproot]);
    harness.mineBlocks(2);
    await new Promise(r => setTimeout(r, 300));

    const actDiesel = await getAlkaneBalance(provider, taproot, '2:0');
    const actFrbtc = await getAlkaneBalance(provider, taproot, '32:0');
    console.log('[devnet-boot] Activity seed balances: DIESEL=', actDiesel.toString(), 'frBTC=', actFrbtc.toString());

    if (actDiesel > BigInt(0) && actFrbtc > BigInt(0) && poolId) {
      const [fBlock, fTx] = factoryId.split(':');
      const [pBlock, pTx] = poolId.split(':');

      // Swap 1: DIESEL → frBTC via factory opcode 13
      const swapAmount1 = actDiesel / BigInt(20); // 5% of DIESEL
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${fBlock},${fTx},13,2,2,0,32,0,${swapAmount1},0,999999]:v0:v0`,
          `2:0:${swapAmount1}`, [taproot]);
        console.log('[devnet-boot] Swap DIESEL→frBTC:', swapAmount1.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] Swap 1 failed:', e?.message?.slice(0, 80));
      }

      // Swap 2: frBTC → DIESEL via factory opcode 13
      const swapAmount2 = actFrbtc / BigInt(20);
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${fBlock},${fTx},13,2,32,0,2,0,${swapAmount2},0,999999]:v0:v0`,
          `32:0:${swapAmount2}`, [taproot]);
        console.log('[devnet-boot] Swap frBTC→DIESEL:', swapAmount2.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] Swap 2 failed:', e?.message?.slice(0, 80));
      }

      // Swap 3: Another DIESEL → frBTC (different size for variety)
      const swapAmount3 = actDiesel / BigInt(10);
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${fBlock},${fTx},13,2,2,0,32,0,${swapAmount3},0,999999]:v0:v0`,
          `2:0:${swapAmount3}`, [taproot]);
        console.log('[devnet-boot] Swap DIESEL→frBTC (2):', swapAmount3.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] Swap 3 failed:', e?.message?.slice(0, 80));
      }

      // Add Liquidity — pool opcode 1 (creates LP position for Positions tab)
      const lpDiesel = actDiesel / BigInt(10);
      const lpFrbtc = actFrbtc / BigInt(10);
      try {
        await executeCall(provider, harness, segwit, taproot,
          `[${pBlock},${pTx},1]:v0:v0`,
          `2:0:${lpDiesel},32:0:${lpFrbtc}`, [taproot]);
        console.log('[devnet-boot] AddLiquidity: DIESEL=', lpDiesel.toString(), 'frBTC=', lpFrbtc.toString());
      } catch (e: any) {
        console.warn('[devnet-boot] AddLiquidity failed:', e?.message?.slice(0, 80));
      }

      console.log('[devnet-boot] Activity feeds seeded with 3 swaps + 1 LP mint');
    } else {
      console.warn('[devnet-boot] Skipping activity seeding — no tokens available');
    }
  } catch (e: any) {
    console.warn('[devnet-boot] Activity seeding failed (non-fatal):', e?.message?.slice(0, 120));
  }

  return contracts;
}

/**
 * Mine 101 blocks one at a time with GC-friendly delays.
 * Extracted to share between fresh boot and fallback after import failure.
 */
async function mineInitialBlocks(onProgress: ProgressCallback): Promise<void> {
  onProgress('Mining initial blocks...', 20);
  // ⚠️ CRITICAL (2026-03-26): The alkanes indexer creates a WebAssembly.Instance
  // per block. Mining 101 blocks with pauses (50ms-1000ms) between individual
  // blocks still OOMs at ~70-80 blocks. FinalizationRegistry cannot keep up
  // regardless of pause duration.
  //
  // Solution: mine ALL blocks in a single synchronous call. mineBlocks(N) runs
  // synchronously in WASM, creating and destroying instances within the same
  // call frame. The WASM runtime's internal allocator can reuse memory without
  // relying on JS FinalizationRegistry. This is how the vitest harness works
  // (createDevnetTestContext calls mineBlocks(201) in one shot without OOM).
  //
  // After mining completes, a single yield lets the browser process pending work.
  // Subsequent boots skip mining via IndexedDB importState (<1s).
  // Mine in batches of 25 with GC yields between them.
  // With esplora loaded, each block creates 2 WASM instances. 101 blocks =
  // 202 instances. Mining all at once OOMs at ~71-80 blocks. Batching with
  // setTimeout(0) yields lets FinalizationRegistry reclaim instances.
  const BATCH = 25;
  const TOTAL = 101;
  for (let mined = 0; mined < TOTAL; ) {
    const n = Math.min(BATCH, TOTAL - mined);
    onProgress(`Mining blocks ${mined + 1}-${mined + n} of ${TOTAL}...`, 20 + Math.round((mined / TOTAL) * 30));
    _harness.mineBlocks(n);
    mined += n;
    // Yield to let FinalizationRegistry / GC reclaim WASM instances
    await new Promise(r => setTimeout(r, 0));
  }
  onProgress('Mining complete', 50);
}

/**
 * Get the current harness (for devnet controls).
 */
export function getHarness() {
  return _harness;
}

/**
 * Get the current provider.
 */
export function getProvider() {
  return _provider;
}

/**
 * Get the boot addresses (derived from the mnemonic during boot).
 */
export function getBootAddresses(): { segwit: string; taproot: string } {
  if (!_bootAddresses) throw new Error('Devnet not booted');
  return _bootAddresses;
}

/**
 * Dispose the devnet and restore original fetch.
 */
export function disposeDevnet() {
  if (_harness) {
    _harness.restoreFetch();
    _harness.dispose();
    _harness = null;
  }
  _provider = null;
}
