'use client';

/**
 * DevnetContext — manages the in-browser devnet lifecycle.
 *
 * When the user selects "Devnet" network:
 * 1. Shows boot modal with progress
 * 2. Loads ~15MB of WASM
 * 3. Deploys 21+ contracts
 * 4. Seeds liquidity
 * 5. Provides devnet controls (mine, faucet, reset)
 *
 * The fetch interceptor routes ALL RPC calls to the in-process devnet,
 * so the rest of the app works exactly as it does against a real network.
 *
 * JOURNAL (2026-03-22): Added IndexedDB persistence via lib/devnet/persistence.ts.
 * On boot, we check for a saved state and import it instead of mining 101 blocks.
 * After boot and after each faucet/mine action, we debounce-save the state.
 * On reset, we clear the saved state.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { DevnetState, DevnetControls, DeployedContracts } from '@/lib/devnet/types';
import { saveDevnetState, loadDevnetState, clearDevnetState } from '@/lib/devnet/persistence';
import { getBootAddresses } from '@/lib/devnet/boot';
import type { DevnetEvmProvider, MockTokenAddresses } from '@/lib/devnet/evmProvider';
import type { DevnetCoordinator } from '@/lib/devnet/coordinatorSim';

interface DevnetContextValue {
  state: DevnetState;
  controls: DevnetControls;
  isDevnet: boolean;
  boot: (mnemonic: string) => Promise<void>;
  shutdown: () => void;
  /** In-browser bridge coordinator (available after boot if EVM is ready) */
  coordinator: DevnetCoordinator | null;
}

const defaultState: DevnetState = {
  status: 'idle',
  bootProgress: '',
  bootPercent: 0,
  contracts: null,
  chainHeight: 0,
};

const DevnetContext = createContext<DevnetContextValue>({
  state: defaultState,
  controls: {
    mineBlocks: async () => {},
    faucetBtc: async () => {},
    faucetDiesel: async () => {},
    faucetFuel: async () => {},
    faucetFrbtc: async () => {},
    faucetUsdt: async () => {},
    faucetUsdc: async () => {},
    getChainHeight: () => 0,
    resetDevnet: async () => {},
  },
  isDevnet: false,
  boot: async () => {},
  shutdown: () => {},
  coordinator: null,
});

export function useDevnet() {
  return useContext(DevnetContext);
}

/** Debounce delay (ms) for saving state after actions. */
const SAVE_DEBOUNCE_MS = 2000;

export function DevnetProvider({ children, network }: { children: React.ReactNode; network: string }) {
  const [state, setState] = useState<DevnetState>(defaultState);
  const harnessRef = useRef<any>(null);
  const providerRef = useRef<any>(null);
  const evmProviderRef = useRef<DevnetEvmProvider | null>(null);
  const evmTokensRef = useRef<MockTokenAddresses | null>(null);
  const coordinatorRef = useRef<DevnetCoordinator | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDevnet = network === 'devnet';

  /**
   * Debounce-save the current devnet state to IndexedDB.
   * Called after boot, mine, faucet, etc.
   */
  const debounceSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const harness = harnessRef.current;
      if (!harness?.server?.exportState) return;
      try {
        const stateBytes = harness.server.exportState();
        const bytes = stateBytes instanceof Uint8Array
          ? stateBytes
          : new Uint8Array(stateBytes);
        console.log('[DevnetContext] Saving state to IndexedDB (%d KB)...', Math.round(bytes.length / 1024));
        saveDevnetState(bytes).then(() => {
          console.log('[DevnetContext] State saved successfully');
        }).catch((e: any) => {
          console.warn('[DevnetContext] Failed to save state:', e?.message || e);
        });
      } catch (e: any) {
        console.warn('[DevnetContext] Failed to export state:', e?.message || e);
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const boot = useCallback(async (mnemonic: string) => {
    if (state.status === 'booting' || state.status === 'ready') return;

    setState(prev => ({ ...prev, status: 'booting', bootProgress: 'Loading WASM modules...', bootPercent: 5 }));

    try {
      const { bootDevnetWithWasms } = await import('@/lib/devnet/boot');

      // Fetch indexer WASMs
      setState(prev => ({ ...prev, bootProgress: 'Fetching indexer WASMs...', bootPercent: 8 }));

      let alkanesWasm: Uint8Array;
      let esploraWasm: Uint8Array | undefined;
      let quspoWasm: Uint8Array | undefined;

      try {
        console.log('[DevnetContext] Fetching alkanes.wasm...');
        const alkanesResp = await fetch('/wasm/alkanes.wasm');
        if (alkanesResp.ok) {
          alkanesWasm = new Uint8Array(await alkanesResp.arrayBuffer());
          console.log('[DevnetContext] alkanes.wasm loaded:', Math.round(alkanesWasm.length / 1024), 'KB');
        } else {
          throw new Error(`Alkanes WASM not available: HTTP ${alkanesResp.status}`);
        }

        console.log('[DevnetContext] Fetching esplora.wasm...');
        const esploraResp = await fetch('/wasm/esplora.wasm');
        if (esploraResp.ok) {
          esploraWasm = new Uint8Array(await esploraResp.arrayBuffer());
          console.log('[DevnetContext] esplora.wasm loaded:', Math.round(esploraWasm.length / 1024), 'KB');
        } else {
          console.warn('[DevnetContext] esplora.wasm not available (optional)');
        }

        // JOURNAL (2026-03-22): quspo is loaded here but added AFTER initial
        // mining in bootDevnetWithWasms() to avoid OOM. TertiaryRuntime::run_block
        // creates a new WebAssembly.Instance per block — processing 110 blocks
        // during boot exhausts browser memory. Deferring means quspo only indexes
        // blocks mined after boot (the initial 110 are empty coinbase txs anyway).
        console.log('[DevnetContext] Fetching quspo.wasm...');
        const quspoResp = await fetch('/wasm/quspo.wasm');
        if (quspoResp.ok) {
          quspoWasm = new Uint8Array(await quspoResp.arrayBuffer());
          console.log('[DevnetContext] quspo.wasm loaded:', Math.round(quspoWasm.length / 1024), 'KB');
        } else {
          console.warn('[DevnetContext] quspo.wasm not available (optional)');
        }
      } catch (e: any) {
        console.error('[DevnetContext] WASM fetch failed:', e);
        setState(prev => ({
          ...prev,
          status: 'error',
          error: 'Devnet WASMs not available. Place alkanes.wasm in public/wasm/',
          bootPercent: 0,
        }));
        return;
      }

      // Check for saved state in IndexedDB
      let savedState: Uint8Array | undefined;
      try {
        const loaded = await loadDevnetState();
        if (loaded) {
          console.log('[DevnetContext] Found saved state in IndexedDB (%d KB)', Math.round(loaded.length / 1024));
          savedState = loaded;
        } else {
          console.log('[DevnetContext] No saved state found, will do fresh boot');
        }
      } catch (e: any) {
        console.warn('[DevnetContext] Failed to load saved state (will do fresh boot):', e?.message || e);
      }

      const result = await bootDevnetWithWasms(
        alkanesWasm,
        esploraWasm,
        quspoWasm,
        mnemonic,
        (message, percent) => {
          // Only advance — never go backwards (prevents jumpy progress bar)
          setState(prev => ({
            ...prev,
            bootProgress: message,
            bootPercent: Math.max(prev.bootPercent, percent),
          }));
        },
        savedState,
      );

      harnessRef.current = result.harness;
      providerRef.current = result.provider;

      // Initialize EVM devnet (in-process revm) for bridge testing
      setState(prev => ({ ...prev, bootProgress: 'Initializing EVM devnet...', bootPercent: 85 }));
      try {
        const { DevnetEvmProvider: EvmProvider } = await import('@/lib/devnet/evmProvider');
        const evmProvider = await EvmProvider.create();
        const mockTokens = await evmProvider.deployMockTokens();

        // Seed a default EVM user with 10,000 USDT and 10,000 USDC
        const defaultEvmUser = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        evmProvider.fundAccount(defaultEvmUser, '1000');
        await evmProvider.seedWallet(defaultEvmUser, {
          usdt: BigInt(10_000) * 10n ** 6n,
          usdc: BigInt(10_000) * 10n ** 6n,
        }, mockTokens);

        evmProviderRef.current = evmProvider;
        evmTokensRef.current = mockTokens;

        // Update contracts with EVM addresses
        result.contracts.evmUsdtAddress = mockTokens.usdtAddress;
        result.contracts.evmUsdcAddress = mockTokens.usdcAddress;

        // Create the in-browser bridge coordinator
        try {
          const { DevnetCoordinator: CoordClass } = await import('@/lib/devnet/coordinatorSim');
          const coord = new CoordClass(
            providerRef.current,
            evmProvider,
            mockTokens,
            {
              frusdId: result.contracts.frusdTokenId || '4:8201',
              synthPoolId: result.contracts.synthPoolId || '4:8202',
              authTokenId: result.contracts.frusdAuthTokenId || '2:10',
              factoryId: result.contracts.ammFactoryId || '4:65522',
            },
          );
          coordinatorRef.current = coord;
          console.log('[DevnetContext] Bridge coordinator created');
        } catch (coordErr: any) {
          console.warn('[DevnetContext] Coordinator init failed (non-fatal):', coordErr?.message || coordErr);
        }

        console.log('[DevnetContext] EVM devnet ready — USDT:', mockTokens.usdtAddress, 'USDC:', mockTokens.usdcAddress);
      } catch (evmErr: any) {
        // EVM is optional — Bitcoin devnet still works without it
        console.warn('[DevnetContext] EVM devnet init failed (non-fatal):', evmErr?.message || evmErr);
      }

      setState({
        status: 'ready',
        bootProgress: 'Devnet ready!',
        bootPercent: 100,
        contracts: result.contracts,
        chainHeight: result.harness.height,
      });

      // Save state after boot completes (if we did a fresh boot, persist it)
      if (!savedState) {
        debounceSave();
      }
    } catch (e: any) {
      const errorMsg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e)) || 'Boot failed (unknown error)';
      console.error('[DevnetContext] Boot failed:', e);
      console.error('[DevnetContext] Error type:', typeof e, 'keys:', e ? Object.keys(e) : 'null');
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMsg,
        bootPercent: 0,
      }));
    }
  }, [state.status, debounceSave]);

  const shutdown = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.dispose();
      coordinatorRef.current = null;
    }
    import('@/lib/devnet/boot').then(({ disposeDevnet }) => {
      disposeDevnet();
      harnessRef.current = null;
      providerRef.current = null;
      setState(defaultState);
    });
  }, []);

  // Auto-boot when devnet network is selected
  const bootedRef = useRef(false);
  useEffect(() => {
    if (isDevnet && state.status === 'idle' && !bootedRef.current) {
      bootedRef.current = true;
      const DEFAULT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      boot(DEFAULT_MNEMONIC);
    }
  }, [isDevnet, state.status, boot]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.dispose();
        coordinatorRef.current = null;
      }
      if (harnessRef.current) {
        import('@/lib/devnet/boot').then(({ disposeDevnet }) => disposeDevnet());
      }
    };
  }, []);

  const controls: DevnetControls = {
    mineBlocks: async (count: number) => {
      if (!harnessRef.current) return;
      // Mine 1 block at a time with yields to prevent OOM
      for (let i = 0; i < count; i++) {
        harnessRef.current.mineBlocks(1);
        if (count > 1) await new Promise(r => setTimeout(r, 50));
      }
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetBtc: async (address: string, sats: number) => {
      if (!harnessRef.current) throw new Error('Devnet not ready');
      // With devnet mapped to regtest in WalletContext, the address should already be bcrt1.
      // If it's still bc1 (mainnet), convert it.
      let devnetAddr = address;
      if (address.startsWith('bc1') && !address.startsWith('bcrt1')) {
        try {
          const bitcoin = await import('bitcoinjs-lib');
          const mainnetOutput = bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
          devnetAddr = bitcoin.address.fromOutputScript(mainnetOutput, bitcoin.networks.regtest);
          console.log('[devnet] Converted', address.slice(0, 10) + '...', '→', devnetAddr.slice(0, 12) + '...');
        } catch (e: any) {
          console.warn('[devnet] Address conversion failed, using raw:', e?.message);
        }
      }
      // Use generatetoaddress RPC — mines a block with coinbase paying to the user's address
      const result = harnessRef.current.server.handleRpc(JSON.stringify({
        jsonrpc: '2.0',
        method: 'generatetoaddress',
        params: [1, devnetAddr],
        id: 1,
      }));
      const parsed = JSON.parse(result);
      if (parsed.error) {
        console.warn('[devnet] generatetoaddress error:', parsed.error, 'addr:', devnetAddr);
      }
      await new Promise(r => setTimeout(r, 50));
      console.log('[devnet] BTC faucet: mined block with coinbase to', devnetAddr);
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetDiesel: async (address: string) => {
      if (!providerRef.current || !harnessRef.current) throw new Error('Devnet not ready');
      // Use boot wallet to fund the tx, output DIESEL to user's address
      const boot = getBootAddresses();
      harnessRef.current.mineBlocks(1);
      await new Promise(r => setTimeout(r, 50));
      await providerRef.current.alkanesExecuteFull(
        JSON.stringify([address]),
        'B:10000:v0',
        '[2,0,77]:v0:v0',
        '1', null,
        JSON.stringify({
          from_addresses: [boot.segwit, boot.taproot],
          change_address: boot.segwit,
          alkanes_change_address: address,
        }),
      );
      harnessRef.current.mineBlocks(1);
      console.log('[devnet] DIESEL minted to', address);
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetFuel: async (address: string) => {
      if (!providerRef.current || !harnessRef.current) throw new Error('Devnet not ready');
      // Mint FUEL via opcode 77 on FUEL token [4:7000], funded by boot wallet
      const boot = getBootAddresses();
      harnessRef.current.mineBlocks(1);
      await new Promise(r => setTimeout(r, 50));
      await providerRef.current.alkanesExecuteFull(
        JSON.stringify([address]),
        'B:10000:v0',
        '[4,7000,77]:v0:v0',
        '1', null,
        JSON.stringify({
          from_addresses: [boot.segwit, boot.taproot],
          change_address: boot.segwit,
          alkanes_change_address: address,
        }),
      );
      harnessRef.current.mineBlocks(1);
      console.log('[devnet] FUEL minted to', address);
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetFrbtc: async (address: string) => {
      if (!providerRef.current || !harnessRef.current) throw new Error('Devnet not ready');
      // Wrap BTC → frBTC via opcode 77 on frBTC contract [32:0]
      // First ensure we have BTC
      harnessRef.current.mineBlocks(1);
      await new Promise(r => setTimeout(r, 50));

      // Get frBTC signer address
      let signerAddr = 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';
      try {
        const signerResult = JSON.parse(harnessRef.current.server.handleRpc(JSON.stringify({
          jsonrpc: '2.0', method: 'alkanes_simulate', id: 1,
          params: [{ target: { block: '32', tx: '0' }, inputs: ['103'], alkanes: [],
            transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
        })));
        const hex = signerResult?.result?.execution?.data?.replace('0x', '') || '';
        if (hex.length === 64) {
          const bitcoin = await import('bitcoinjs-lib');
          const xOnlyPubkey = Buffer.from(hex, 'hex');
          const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: bitcoin.networks.regtest });
          if (payment.address) signerAddr = payment.address;
        }
      } catch { /* use default */ }

      // Use boot wallet to fund the wrap, frBTC output goes to user's address
      const boot = getBootAddresses();
      await providerRef.current.alkanesExecuteFull(
        JSON.stringify([signerAddr, address]),
        'B:100000:v0',
        '[32,0,77]:v1:v1',
        '1', null,
        JSON.stringify({
          from_addresses: [boot.segwit, boot.taproot],
          change_address: boot.segwit,
          alkanes_change_address: address,
        }),
      );
      harnessRef.current.mineBlocks(1);
      console.log('[devnet] frBTC wrapped to', address);
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetUsdt: async (address: string) => {
      if (!evmProviderRef.current || !evmTokensRef.current) {
        throw new Error('EVM devnet not ready');
      }
      const amount = BigInt(10_000) * 10n ** 6n; // 10,000 USDT
      await evmProviderRef.current.seedWallet(address, { usdt: amount }, evmTokensRef.current);
      console.log('[devnet] USDT faucet: minted 10,000 USDT to', address);
    },
    faucetUsdc: async (address: string) => {
      if (!evmProviderRef.current || !evmTokensRef.current) {
        throw new Error('EVM devnet not ready');
      }
      const amount = BigInt(10_000) * 10n ** 6n; // 10,000 USDC
      await evmProviderRef.current.seedWallet(address, { usdc: amount }, evmTokensRef.current);
      console.log('[devnet] USDC faucet: minted 10,000 USDC to', address);
    },
    getChainHeight: () => {
      return harnessRef.current?.height ?? 0;
    },
    resetDevnet: async () => {
      console.log('[devnet] Resetting...');
      // Clear saved state from IndexedDB before shutting down
      try {
        await clearDevnetState();
        console.log('[devnet] Cleared saved state from IndexedDB');
      } catch (e: any) {
        console.warn('[devnet] Failed to clear saved state:', e?.message || e);
      }
      shutdown();
      bootedRef.current = false;
      await new Promise(r => setTimeout(r, 500));
      const DEFAULT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      await boot(DEFAULT_MNEMONIC);
    },
  };

  return (
    <DevnetContext.Provider value={{ state, controls, isDevnet, boot, shutdown, coordinator: coordinatorRef.current }}>
      {children}
    </DevnetContext.Provider>
  );
}
