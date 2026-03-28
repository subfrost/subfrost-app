/**
 * WASM Bridge Adapters — JS callbacks for the in-process bridge coordinator.
 *
 * These functions create the callback implementations that the WASM
 * WasmBridgeCoordinator calls via JsFuture. Each callback routes to
 * the appropriate in-page engine:
 *
 * - Bitcoin: DevnetTestHarness (qubitcoin WASM)
 * - EVM: DevnetEvmProvider (revm WASM)
 * - ZEC: quzec-web-sys WASM (transparent-only)
 * - FROST signing: frost-web-sys WASM
 * - CGGMP21 signing: subzero-cggmp21 (compiled into subzero-web-sys)
 *
 * The coordinator logic (poll → sign → broadcast) runs in Rust WASM.
 * Only the I/O crosses the JS/WASM boundary via these callbacks.
 */

import type { DevnetEvmProvider } from './evmProvider';

// Types matching subzero-bridge-traits Rust types (serialized as JSON)
export interface ChainEvent {
  chain: string;  // "btc" | "zec" | "evm"
  kind: string;   // "Deposit" | "BurnAndBridge" | "Confirmation"
  block: number;
  tx_id: string;
  data: number[]; // byte array
}

export interface BridgeAdapterCallbacks {
  poll: (chain: string, fromBlock: number) => Promise<string>;   // JSON array of ChainEvent
  height: (chain: string) => Promise<number>;
  sign: (scheme: string, sighashHex: string) => Promise<string>; // hex signature
  broadcast: (chain: string, txHex: string) => Promise<string>;  // txid
}

/**
 * Create the poll callback — routes chain event queries to in-page engines.
 */
function createPollCallback(
  btcHarness: any,
  evmProvider: DevnetEvmProvider | null,
): (chain: string, fromBlock: number) => Promise<string> {
  return async (chain: string, fromBlock: number): Promise<string> => {
    const events: ChainEvent[] = [];

    if (chain === 'btc' && btcHarness) {
      // Poll alkanes indexer for pending bridge events
      try {
        const resp = btcHarness.handleRpc(JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{
            // Query frETH/frZEC/frUSD alkanes for PendingBridges (opcode 6)
            target: { block: 4, tx: 0 }, // placeholder — real impl queries specific alkane
            inputs: ['6'],
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: String(btcHarness.height),
            txindex: 0,
            vout: 0,
          }],
          id: 1,
        }));
        // Parse any pending bridges into ChainEvents
        // For now, return empty (coordinator will process when events arrive)
      } catch { /* non-fatal */ }
    }

    if (chain === 'evm' && evmProvider) {
      // Poll EVM for PaymentQueued events on vault contracts
      // The revm provider tracks events internally
      try {
        // In a full implementation, this would call eth_getLogs on the vault
        // For now, the EVM provider doesn't expose event logs directly
        // Events are surfaced via the coordinator simulation
      } catch { /* non-fatal */ }
    }

    if (chain === 'zec') {
      // Poll quzec for transparent UTXO changes at the CGGMP21 signer address
      // quzec-web-sys provides the chain state
      // For now, placeholder — quzec integration is Phase 6
    }

    return JSON.stringify(events);
  };
}

/**
 * Create the height callback — returns current chain heights.
 */
function createHeightCallback(
  btcHarness: any,
  evmProvider: DevnetEvmProvider | null,
): (chain: string) => Promise<number> {
  return async (chain: string): Promise<number> => {
    if (chain === 'btc' && btcHarness) {
      return btcHarness.height;
    }
    if (chain === 'evm' && evmProvider) {
      return Number(evmProvider.getBlockNumber?.() ?? 0n);
    }
    if (chain === 'zec') {
      return 0; // quzec height — to be wired
    }
    return 0;
  };
}

/**
 * Create the sign callback — routes signing requests to FROST/CGGMP21 WASMs.
 */
function createSignCallback(
  frostWasm: any | null,
  cggmp21Wasm: any | null,
): (scheme: string, sighashHex: string) => Promise<string> {
  return async (scheme: string, sighashHex: string): Promise<string> => {
    if (scheme === 'FrostSchnorr' && frostWasm) {
      // Use frost-web-sys for threshold Schnorr signing
      try {
        const sighashBytes = hexToBytes(sighashHex);
        const sigBytes = frostWasm.sign_sighash(frostWasm.keys_json, sighashBytes);
        return bytesToHex(sigBytes);
      } catch (e: any) {
        console.warn('[bridge-adapter] FROST sign failed:', e?.message);
      }
    }

    if (scheme === 'Cggmp21Ecdsa' && cggmp21Wasm) {
      // Use subzero-cggmp21 WASM for threshold ECDSA signing
      try {
        const sighashBytes = hexToBytes(sighashHex);
        const sigBytes = cggmp21Wasm.sign_sighash(sighashBytes);
        return bytesToHex(sigBytes);
      } catch (e: any) {
        console.warn('[bridge-adapter] CGGMP21 sign failed:', e?.message);
      }
    }

    if (scheme === 'EvmEcdsa') {
      // Use a deterministic test key for EVM ECDSA in devnet
      // In production, this goes through the FROST-signed vault authenticatedCall
      return '00'.repeat(65); // placeholder — 65-byte ECDSA signature
    }

    throw new Error(`Unsupported signing scheme: ${scheme}`);
  };
}

/**
 * Create the broadcast callback — sends signed txs to in-page chains.
 */
function createBroadcastCallback(
  btcHarness: any,
  evmProvider: DevnetEvmProvider | null,
): (chain: string, txHex: string) => Promise<string> {
  return async (chain: string, txHex: string): Promise<string> => {
    if (chain === 'btc' && btcHarness) {
      // Broadcast to in-page Bitcoin node
      const resp = btcHarness.handleRpc(JSON.stringify({
        jsonrpc: '2.0',
        method: 'btc_sendrawtransaction',
        params: [txHex],
        id: 1,
      }));
      const parsed = JSON.parse(resp);
      if (parsed.result) {
        // Mine a block to confirm
        btcHarness.mineBlocks(1);
        return parsed.result;
      }
      throw new Error(parsed.error?.message || 'BTC broadcast failed');
    }

    if (chain === 'evm' && evmProvider) {
      // Broadcast to in-page EVM
      // For devnet, broadcast is a direct call to the EVM
      // In a real implementation, this would submit a signed tx
      // For now, return a placeholder txid — the coordinator sim handles actual EVM calls
      return 'evm-' + Date.now().toString(16);
    }

    if (chain === 'zec') {
      // Broadcast to in-page Zcash node (quzec)
      // Will be wired when quzec is integrated
      return 'zec-' + Date.now().toString(16);
    }

    throw new Error(`Unsupported chain for broadcast: ${chain}`);
  };
}

/**
 * Create all four callbacks for the WasmBridgeCoordinator.
 */
export function createBridgeAdapterCallbacks(
  btcHarness: any,
  evmProvider: DevnetEvmProvider | null,
  frostWasm: any | null,
  cggmp21Wasm: any | null,
): BridgeAdapterCallbacks {
  return {
    poll: createPollCallback(btcHarness, evmProvider),
    height: createHeightCallback(btcHarness, evmProvider),
    sign: createSignCallback(frostWasm, cggmp21Wasm),
    broadcast: createBroadcastCallback(btcHarness, evmProvider),
  };
}

// ── Hex utilities (no Buffer dependency for browser compat) ──

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
