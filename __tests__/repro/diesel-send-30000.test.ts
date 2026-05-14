/**
 * Repro: 30000 DIESEL send hang/no-txid bug.
 *
 * User reported: send 30000 DIESEL from
 *   bc1phqvgwn7wn5e4s8g0999rtgafd07jpuuy59rkdrk4s5thw9jafkasg8umr8
 * to
 *   bc1p93vgs3ynscv78zau5gmt0h8u3xdx5qy2upcp6nrva4lw0nmnnu4qmwx344
 * The webapp hangs at "Preparing transaction…", then claims broadcast
 * but returns no txid (UI explorer link is `espo.sh/tx/` with empty
 * txid). No transfer happens on-chain.
 *
 * This script mirrors the exact sequence useAlkaneSendMutation runs:
 *   1. WebProvider construction with mainnet URL
 *   2. walletCreate() (or walletLoadMnemonic for keystore)
 *   3. buildTransferProtostone + buildTransferInputRequirements
 *   4. provider.alkanesExecuteWithStrings(...) (the PSBT-return path
 *      taken when previewBeforeBroadcast is set, as in 50afd4f6).
 *   5. Inspect the result shape — does it contain a PSBT? If not,
 *      the hook's pickTxid will return null and the UI mistakes the
 *      no-PSBT fallback for a successful broadcast.
 *
 * Run with:
 *   RUN_REPRO=1 npx vitest run __tests__/repro/diesel-send-30000.repro.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';

const RUN = process.env.RUN_REPRO === '1';
const describeRepro = RUN ? describe : describe.skip;

const FROM = 'bc1phqvgwn7wn5e4s8g0999rtgafd07jpuuy59rkdrk4s5thw9jafkasg8umr8';
const TO = 'bc1p93vgs3ynscv78zau5gmt0h8u3xdx5qy2upcp6nrva4lw0nmnnu4qmwx344';
const DIESEL = '2:0';
// 30000 DIESEL with 8 decimals
const AMOUNT_BASE = (BigInt('30000') * 10n ** 8n).toString();
// Mainnet RPC the app actually uses (mirror of getConfig.SUBFROST_API_URLS.mainnet)
const MAINNET_RPC =
  'https://mainnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75';

describeRepro('repro: 30000 DIESEL send', () => {
  let provider: any;

  beforeAll(async () => {
    const wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('mainnet', {
      jsonrpc_url: MAINNET_RPC,
      data_api_url: MAINNET_RPC,
    });
    // The hook calls `walletCreate()` for the dummy key the SDK uses
    // when building unsigned PSBTs. Real signing happens later via the
    // browser wallet adapter / keystore. For browser flows the dummy
    // suffices; for keystore the hook calls walletLoadMnemonic instead.
    provider.walletCreate();
    console.log('[repro] provider initialised, wallet loaded:', provider.walletIsLoaded?.());
  }, 60_000);

  it('alkanesExecuteWithStrings returns a parseable PSBT for the transfer', async () => {
    const protostones = `[2:0:${AMOUNT_BASE}:v1]:v0:v0`;
    const inputRequirements = `2:0:${AMOUNT_BASE}`;

    // Mirror the alkanesExecuteTyped wrapper's options — keystore-style
    // (single taproot address) since the FROM is a P2TR-only wallet.
    const options = {
      from: [FROM],
      from_addresses: [FROM],
      change_address: FROM,
      alkanes_change_address: FROM,
      ordinals_strategy: 'burn',
      protect_taproot: false,
      auto_confirm: false, // matches wantPreview branch in execute.ts
    };

    // v0 = sender alkane change (FROM), v1 = recipient (TO)
    const toAddresses = [FROM, TO];

    console.log('[repro] calling alkanesExecuteWithStrings…');
    console.log('[repro] toAddresses:', JSON.stringify(toAddresses));
    console.log('[repro] inputRequirements:', inputRequirements);
    console.log('[repro] protostones:', protostones);
    console.log('[repro] options:', JSON.stringify(options));

    let result: any;
    let err: any;
    try {
      result = await provider.alkanesExecuteWithStrings(
        JSON.stringify(toAddresses),
        inputRequirements,
        protostones,
        2, // 2 sat/vb fee rate
        null,
        JSON.stringify(options),
      );
    } catch (e: any) {
      err = e;
    }

    console.log('[repro] error:', err?.message || err);
    console.log('[repro] result type:', typeof result);
    if (result instanceof Map) {
      console.log('[repro] result is a Map. Keys:', [...result.keys()]);
    } else if (typeof result === 'string') {
      console.log('[repro] result preview:', result.slice(0, 800));
    } else if (result && typeof result === 'object') {
      console.log('[repro] top-level keys:', Object.keys(result));
      console.log(
        '[repro] result preview:',
        JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 1200),
      );
    }

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    // Mirror the FIXED extractPsbtBase64FromExecuteResult — strings
    // pass through, Uint8Array and numeric-key objects go through
    // the shared `extractPsbtBase64` helper from `lib/alkanes/helpers`.
    const { extractPsbtBase64 } = await import('@/lib/alkanes/helpers');
    const candidates = [
      parsed?.readyToSign?.psbt,
      parsed?.ready_to_sign?.psbt,
      parsed?.psbt,
      parsed?.psbtBase64,
      parsed?.psbt_base64,
      parsed?.unsigned_psbt,
    ];
    let psbtBase64: string | undefined;
    for (const c of candidates) {
      if (c == null) continue;
      if (typeof c === 'string' && c.length > 0) { psbtBase64 = c; break; }
      try { psbtBase64 = extractPsbtBase64(c); break; } catch { /* try next candidate */ }
    }

    console.log('[repro] extracted PSBT (length):', psbtBase64?.length ?? 0);
    if (psbtBase64) {
      console.log(
        '[repro] PSBT magic bytes:',
        Buffer.from(psbtBase64, 'base64').slice(0, 5).toString('hex'),
      );
    }

    expect(err).toBeUndefined();
    expect(psbtBase64).toBeTruthy();
    // PSBT magic prefix = 70 73 62 74 ff ("psbt\xff")
    const magic = Buffer.from(psbtBase64!, 'base64').slice(0, 5).toString('hex');
    expect(magic).toBe('70736274ff');
  }, 90_000);
});
