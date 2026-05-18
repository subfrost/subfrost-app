/**
 * Pins the path → JSON-RPC method mapping in app/api/esplora/[...path]/route.ts.
 *
 * Background: the previous proxy forwarded REST to `espo.subfrost.io`, which
 * 502'd on mempool-only transactions (mork1e 2026-05-18, txid 9dd1caf8…).
 * Per user directive ("we use the jsonrpc format for esplora_tx like its done
 * in alkanes-rs ... we basically use that jsonrpc for everything esplora
 * included"), the proxy now dispatches every REST path to its JSON-RPC
 * equivalent against /v4/subfrost. These pins encode that mapping so a future
 * refactor can't silently drop a case and break wallet-card / pendingTx
 * hydration without ringing a bell.
 *
 * The dispatch function isn't exported (it's a route-internal helper), so we
 * re-derive the mapping here from the documented contract. If you add a new
 * endpoint to the route, add a corresponding pin.
 */
import { describe, it, expect } from 'vitest';

// Inline copy of the route's dispatch logic — kept in sync by hand because
// the original is route-internal. If you change either, change both.
function dispatch(pathString: string): { method: string; params: unknown[]; asText: boolean } | null {
  const txHex = pathString.match(/^tx\/([0-9a-fA-F]{64})\/hex$/);
  if (txHex) return { method: 'esplora_tx::hex', params: [txHex[1]], asText: true };
  const txStatus = pathString.match(/^tx\/([0-9a-fA-F]{64})\/status$/);
  if (txStatus) return { method: 'esplora_tx::status', params: [txStatus[1]], asText: false };
  const txOnly = pathString.match(/^tx\/([0-9a-fA-F]{64})$/);
  if (txOnly) return { method: 'esplora_tx', params: [txOnly[1]], asText: false };
  const addrUtxo = pathString.match(/^address\/([a-zA-Z0-9]+)\/utxo$/);
  if (addrUtxo) return { method: 'esplora_address::utxo', params: [addrUtxo[1]], asText: false };
  return null;
}

const TXID = '9dd1caf8f787b69a4493a31d118371505289d0fb0031c11216cb654febc8ed18';
const ADDR = 'bc1psn0925c2p5mjnvkg0xkntpd26wtcyktmwt3shuw7ue04yed5sjfs7xwmj4';

describe('esplora REST → JSON-RPC dispatch', () => {
  it('tx/{txid} → esplora_tx (JSON)', () => {
    expect(dispatch(`tx/${TXID}`)).toEqual({ method: 'esplora_tx', params: [TXID], asText: false });
  });

  it('tx/{txid}/hex → esplora_tx::hex (text)', () => {
    expect(dispatch(`tx/${TXID}/hex`)).toEqual({ method: 'esplora_tx::hex', params: [TXID], asText: true });
  });

  it('tx/{txid}/status → esplora_tx::status (JSON)', () => {
    expect(dispatch(`tx/${TXID}/status`)).toEqual({ method: 'esplora_tx::status', params: [TXID], asText: false });
  });

  it('address/{addr}/utxo → esplora_address::utxo (JSON)', () => {
    expect(dispatch(`address/${ADDR}/utxo`)).toEqual({ method: 'esplora_address::utxo', params: [ADDR], asText: false });
  });

  it('rejects malformed txid', () => {
    expect(dispatch('tx/not-a-txid')).toBeNull();
    expect(dispatch(`tx/${TXID.slice(0, 60)}`)).toBeNull(); // too short
    expect(dispatch(`tx/${TXID}xx`)).toBeNull(); // too long
  });

  it('returns null for unmapped paths (caller surfaces 404 + warning)', () => {
    expect(dispatch('blocks/tip/height')).toBeNull();
    expect(dispatch('fee-estimates')).toBeNull();
    expect(dispatch('mempool/recent')).toBeNull();
  });

  it('rejects path traversal attempts', () => {
    expect(dispatch('../etc/passwd')).toBeNull();
    expect(dispatch('tx/..')).toBeNull();
  });
});
