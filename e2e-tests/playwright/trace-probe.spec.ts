import { test, chromium } from '@playwright/test';
import * as fs from 'fs';

const TXIDS = [
  { name: 'btc_to_diesel',       txid: 'fab168921791f8c3c105860090db44f8e18ed91ded6c1edf4332b327cddaf013' },
  { name: 'diesel_to_btc',       txid: '0204e2c25d8291e3c1aeb1b26a6d9685358395aba4d0640fb3713ab48fc00c93' },
  { name: 'btc_to_frbtc_wrap',   txid: '9e09bb00b6506065e3d4fb769a0cb95f0f3aa388b36b56adf331662a1b030320' },
  { name: 'frbtc_to_btc_unwrap', txid: 'c9f7113147111188dd53a80a5db1e7d2889ff1d17526aab8d74486c7362a26a6' },
  { name: 'add_liquidity',       txid: '38c62184e954e80542298e0f6fa7892835706c247d42e3fd1a20adf3b06de192' },
];

test('probe devnet traces', async () => {
  test.setTimeout(600_000);

  const lockFiles = [
    '/tmp/playwright-devnet-smoke/SingletonLock',
    '/tmp/playwright-devnet-smoke/SingletonCookie',
    '/tmp/playwright-devnet-smoke/SingletonSocket',
  ];
  for (const f of lockFiles) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

  const context = await chromium.launchPersistentContext('/tmp/playwright-devnet-smoke', {
    headless: false, baseURL: 'http://localhost:3000', locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('subfrost_selected_network', 'devnet');
    localStorage.removeItem('subfrost_selected_network');
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Dismiss disclaimer if present
  await page.evaluate(() => {
    const u = Array.from(document.querySelectorAll('button')).find(b => /understand/i.test(b.textContent || ''));
    if (u) (u as HTMLButtonElement).click();
  });

  // Wait for devnet badge
  await page.waitForSelector('button:has-text("Devnet H:")', { timeout: 300_000 });
  console.log('[trace-probe] Devnet ready');

  // Give quspo/indexer time to finish syncing
  await page.waitForTimeout(15_000);

  // Probe what RPC methods are available for tx lookup
  const methodProbe = await page.evaluate(async () => {
    const rpc = async (method: string, params: unknown[]) => {
      try {
        const r = await fetch('http://localhost:18888', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
        });
        const d = await r.json() as { result?: unknown; error?: unknown };
        return { result: d.result, error: d.error };
      } catch (e) { return { result: null, error: String(e) }; }
    };
    const testTxid = 'fab168921791f8c3c105860090db44f8e18ed91ded6c1edf4332b327cddaf013';
    return {
      esplora_tx:          (await rpc('esplora_tx',          [testTxid])),
      btc_getrawtransaction: (await rpc('btc_getrawtransaction', [testTxid, 1])),
      getrawtransaction:   (await rpc('getrawtransaction',   [testTxid, 1])),
    };
  });
  console.log('[trace-probe] method probe:', JSON.stringify(methodProbe));

  const results: Record<string, unknown>[] = [];

  for (const { name, txid } of TXIDS) {
    const result = await page.evaluate(async (txid: string) => {
      const rpc = async (method: string, params: unknown[]) => {
        const r = await fetch('http://localhost:18888', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
        });
        return r.json() as Promise<{ result?: unknown; error?: unknown }>;
      };

      // Build LE txid bytes for metashrew_view payload
      const leBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        leBytes[i] = parseInt(txid.slice((31 - i) * 2, (31 - i) * 2 + 2), 16);
      }
      const leHex = Array.from(leBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');

      // Probe shadow vouts 3..12 blindly (no vout count needed)
      const shadows: Record<string, string | null> = {};
      const fullHexes: Record<string, string> = {};
      for (let sv = 3; sv <= 12; sv++) {
        // varint encoding for vout (single byte for values < 128)
        const voutByte = sv.toString(16).padStart(2, '0');
        const hexInput = '0a20' + leHex + '10' + voutByte;
        const r = await rpc('metashrew_view', ['trace', '0x' + hexInput, 'latest']);
        const res = (r as { result?: string }).result;
        if (res && res !== '' && res !== '0x' && res.length > 4) {
          shadows[`vout_${sv}`] = `${(res.length - 2) / 2} bytes`;
          fullHexes[`vout_${sv}`] = res;
        } else {
          shadows[`vout_${sv}`] = null;
        }
      }

      return { txid, shadows, fullHexes };
    }, txid);

    // Save non-null trace hex files
    const r = result as { txid: string; shadows: Record<string, string|null>; fullHexes: Record<string, string> };
    for (const [voutKey, hex] of Object.entries(r.fullHexes || {})) {
      const txShort = txid.slice(0, 8);
      const voutNum = voutKey.replace('vout_', '');
      const hexPath = `/tmp/sf_trace_${txShort}_v${voutNum}.hex`;
      fs.writeFileSync(hexPath, hex);
      console.log(`[trace-probe] Saved trace: ${hexPath} (${(hex.length - 2) / 2} bytes)`);
    }

    console.log(`[trace-probe] ${name}: shadows=${JSON.stringify(r.shadows)}`);
    results.push({ name, txid, shadows: r.shadows });
  }

  fs.writeFileSync('/tmp/devnet-traces.json', JSON.stringify(results, null, 2));
  console.log('[trace-probe] Wrote /tmp/devnet-traces.json');

  await context.close();
});
