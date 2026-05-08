/**
 * Smoke test — boots the relay against a localhost Redis (run with
 * `redis-server` on default port) and exercises the full flow:
 *
 *   webapp WSS init → mobile POST accept → webapp WSS receives `accepted`
 *   webapp POST req → mobile GET req     → mobile POST resp
 *   webapp WSS receives `response`
 *
 * No encryption layer yet; the ciphertext/nonce fields are placeholder
 * strings. Pass 3 swaps in real ChaCha20-Poly1305.
 */

import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { setTimeout as sleep } from 'timers/promises';
import { v4 as uuid } from 'uuid';

const PORT = 18800;
const URL  = `http://127.0.0.1:${PORT}`;

async function main(): Promise<void> {
  // Boot the relay as a child process so we can kill it cleanly.
  const proc = spawn('ts-node', ['src/index.ts'], {
    env: { ...process.env, PORT: String(PORT), VERBOSE: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    // Wait for healthz.
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${URL}/healthz`);
        if (r.ok) break;
      } catch {}
      await sleep(200);
    }

    const topic = uuid();
    const webappPub = 'WEBAPP_PUB_PLACEHOLDER';
    const mobilePub = 'MOBILE_PUB_PLACEHOLDER';

    // 1. Webapp opens WSS + sends init.
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
    await once(ws, 'open');
    ws.send(JSON.stringify({ event: 'init', topic, webapp_pub: webappPub }));

    // 2. Wait for init_ack.
    const ack = JSON.parse((await once(ws, 'message')) as string);
    assert(ack.event === 'init_ack' && ack.topic === topic, 'init_ack');
    console.log('OK init_ack');

    // 3. Mobile POST /accept.
    const acceptResp = await fetch(`${URL}/v1/sessions/${topic}/accept`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mobile_pub:  mobilePub,
        fcm_token:   '',
        origin:      'https://app.subfrost.io',
        permissions: ['psbt', 'msg', 'accts'],
      }),
    });
    assert(acceptResp.ok, 'accept ok');
    console.log('OK accept');

    // 4. Webapp gets `accepted` event.
    const accepted = JSON.parse((await once(ws, 'message')) as string);
    assert(
      accepted.event === 'accepted' && accepted.mobile_pub === mobilePub,
      'accepted',
    );
    console.log('OK accepted');

    // 5. Webapp POST /req with placeholder ciphertext.
    const requestId = uuid();
    const reqResp = await fetch(`${URL}/v1/sessions/${topic}/req`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request_id: requestId,
        ciphertext: 'CT-1',
        nonce:      'NN-1',
        origin:     'https://app.subfrost.io',
      }),
    });
    assert(reqResp.ok, 'req ok');
    console.log('OK req');

    // 6. Mobile GET /req.
    const fetchResp = await fetch(`${URL}/v1/sessions/${topic}/req/${requestId}`);
    assert(fetchResp.ok, 'fetch req');
    const fetched = await fetchResp.json() as { ciphertext: string };
    assert(fetched.ciphertext === 'CT-1', 'fetched ciphertext');
    console.log('OK fetch req');

    // 7. Second fetch should 404 (single-shot).
    const fetchResp2 = await fetch(`${URL}/v1/sessions/${topic}/req/${requestId}`);
    assert(fetchResp2.status === 404, 'second fetch 404');
    console.log('OK single-shot');

    // 8. Mobile POST /resp.
    const respResp = await fetch(`${URL}/v1/sessions/${topic}/resp/${requestId}`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ciphertext: 'CT-resp', nonce: 'NN-resp' }),
    });
    assert(respResp.ok, 'resp ok');
    console.log('OK resp');

    // 9. Webapp gets `response` event.
    const responded = JSON.parse((await once(ws, 'message')) as string);
    assert(
      responded.event === 'response' && responded.ciphertext === 'CT-resp',
      'response received',
    );
    console.log('OK response');

    // 10. Origin mismatch on /req.
    const wrongOrigin = await fetch(`${URL}/v1/sessions/${topic}/req`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        request_id: uuid(),
        ciphertext: 'CT-2',
        nonce:      'NN-2',
        origin:     'https://evil.example',
      }),
    });
    assert(wrongOrigin.status === 403, 'origin mismatch rejected');
    console.log('OK origin guard');

    ws.close();
    console.log('\nALL SMOKE TESTS PASSED');
  } finally {
    proc.kill('SIGTERM');
    await sleep(200);
  }
}

function once(ws: WebSocket, event: 'open' | 'message'): Promise<string | void> {
  return new Promise((resolve, reject) => {
    if (event === 'open') {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    } else {
      ws.once('message', (d) => resolve(d.toString()));
      ws.once('error', reject);
    }
  });
}

function assert(cond: any, label: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

main().catch((e) => {
  console.error('SMOKE FAIL:', e);
  process.exit(1);
});
