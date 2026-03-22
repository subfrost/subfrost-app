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
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { DevnetState, DevnetControls, DeployedContracts } from '@/lib/devnet/types';

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

export function DevnetProvider({ children, network }: { children: React.ReactNode; network: string }) {
  const [state, setState] = useState<DevnetState>(defaultState);
  const harnessRef = useRef<any>(null);
  const providerRef = useRef<any>(null);

  const isDevnet = network === 'devnet';

  const boot = useCallback(async (mnemonic: string) => {
    if (state.status === 'booting' || state.status === 'ready') return;

    setState(prev => ({ ...prev, status: 'booting', bootProgress: 'Loading WASM modules...', bootPercent: 5 }));

    try {
      const { bootDevnetWithWasms } = await import('@/lib/devnet/boot');

      // Fetch indexer WASMs
      // In production these would be served from a CDN or public dir
      // For now, we check if they're available at known paths
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
        // If WASMs aren't served from public dir, the devnet can't boot
        setState(prev => ({
          ...prev,
          status: 'error',
          error: 'Devnet WASMs not available. Place alkanes.wasm in public/wasm/',
          bootPercent: 0,
        }));
        return;
      }

      const result = await bootDevnetWithWasms(
        alkanesWasm,
        esploraWasm,
        quspoWasm,
        mnemonic,
        (message, percent) => {
          setState(prev => ({ ...prev, bootProgress: message, bootPercent: percent }));
        },
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
  }, [state.status]);

  const shutdown = useCallback(() => {
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
      if (harnessRef.current) {
        import('@/lib/devnet/boot').then(({ disposeDevnet }) => disposeDevnet());
      }
    };
  }, []);

  const controls: DevnetControls = {
    mineBlocks: async (count: number) => {
      if (harnessRef.current) {
        harnessRef.current.mineBlocks(count);
        setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      }
    },
    faucetBtc: async (address: string, sats: number) => {
      // Mine a block to the user — the coinbase goes to the harness key
      // Then use a tx to send BTC to the user's address
      if (harnessRef.current) {
        harnessRef.current.mineBlocks(1);
        setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      }
    },
    faucetDiesel: async (address: string) => {
      // Mint DIESEL via opcode 77
      if (providerRef.current && harnessRef.current) {
        harnessRef.current.mineBlocks(1);
        try {
          await providerRef.current.alkanesExecuteFull(
            JSON.stringify([address]),
            'B:10000:v0',
            '[2,0,77]:v0:v0',
            '1', null,
            JSON.stringify({ from_addresses: [address], change_address: address, alkanes_change_address: address }),
          );
          harnessRef.current.mineBlocks(1);
        } catch { /* best effort */ }
        setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      }
    },
    faucetFuel: async (address: string) => {
      // FUEL tokens would need to be transferred from treasury
      if (harnessRef.current) {
        harnessRef.current.mineBlocks(1);
        setState(prev => ({ ...prev, chainHeight: harnessRef.current.height }));
      }
    },
    getChainHeight: () => {
      return harnessRef.current?.height ?? 0;
    },
    resetDevnet: async () => {
      shutdown();
      // Re-boot would need the mnemonic — caller should trigger boot() again
    },
  };

  return (
    <DevnetContext.Provider value={{ state, controls, isDevnet, boot, shutdown }}>
      {children}
    </DevnetContext.Provider>
  );
}
