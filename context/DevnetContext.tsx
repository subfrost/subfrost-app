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

interface DevnetContextValue {
  state: DevnetState;
  controls: DevnetControls;
  isDevnet: boolean;
  boot: (mnemonic: string) => Promise<void>;
  shutdown: () => void;
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
    getChainHeight: () => 0,
    resetDevnet: async () => {},
  },
  isDevnet: false,
  boot: async () => {},
  shutdown: () => {},
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
          setState(prev => ({ ...prev, bootProgress: message, bootPercent: percent }));
        },
        savedState,
      );

      harnessRef.current = result.harness;
      providerRef.current = result.provider;

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
      if (!harnessRef.current || !providerRef.current) throw new Error('Devnet not ready');
      // Mine a block to create spendable UTXOs (coinbase → loaded wallet key)
      harnessRef.current.mineBlocks(1);
      await new Promise(r => setTimeout(r, 100));
      // Send BTC from the loaded wallet to the user's address using the SDK.
      // The provider has the same mnemonic loaded, so it can spend the coinbase.
      // We use a minimal alkanes execute with no alkane operations — just a BTC send.
      try {
        // Get the boot addresses (derived from the mnemonic)
        const { getBootAddresses } = await import('@/lib/devnet/boot');
        const bootAddrs = getBootAddresses();
        await providerRef.current.alkanesExecuteFull(
          JSON.stringify([address]),  // toAddresses: send to user
          `B:${sats}:v0`,            // BTC output to v0 (user's address)
          '[0,0,0]:v0:v0',           // dummy cellpack (no-op, will fail but BTC still moves)
          '1', null,
          JSON.stringify({
            from_addresses: [bootAddrs.segwit, bootAddrs.taproot],
            change_address: bootAddrs.segwit,
            alkanes_change_address: bootAddrs.taproot,
          }),
        );
      } catch (e: any) {
        // The alkanes execute might fail (no contract at 0:0) but the BTC
        // output should still be created. If it totally fails, just mine.
        console.warn('[devnet] BTC faucet execute:', e?.message?.slice(0, 80));
      }
      harnessRef.current.mineBlocks(1);
      console.log('[devnet] BTC faucet: sent', sats, 'sats to', address);
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetDiesel: async (address: string) => {
      if (!providerRef.current || !harnessRef.current) throw new Error('Devnet not ready');
      harnessRef.current.mineBlocks(1);
      await new Promise(r => setTimeout(r, 50));
      await providerRef.current.alkanesExecuteFull(
        JSON.stringify([address]),
        'B:10000:v0',
        '[2,0,77]:v0:v0',
        '1', null,
        JSON.stringify({
          from_addresses: [address],
          change_address: address,
          alkanes_change_address: address,
        }),
      );
      harnessRef.current.mineBlocks(1);
      console.log('[devnet] DIESEL minted to', address);
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
    },
    faucetFuel: async (address: string) => {
      if (!harnessRef.current) throw new Error('Devnet not ready');
      // FUEL mint — mine blocks for now (coinbase contains BTC)
      harnessRef.current.mineBlocks(3);
      console.log('[devnet] FUEL faucet: mined 3 blocks');
      setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      debounceSave();
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
    <DevnetContext.Provider value={{ state, controls, isDevnet, boot, shutdown }}>
      {children}
    </DevnetContext.Provider>
  );
}
