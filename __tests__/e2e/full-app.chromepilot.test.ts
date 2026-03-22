/**
 * Full Application E2E Test — ChromePilot / Playwright-style
 *
 * Tests every page and major feature of the subfrost app on the devnet.
 * Requires chromepilot daemon running on port 9223.
 *
 * Run: pnpm vitest run __tests__/e2e/full-app.chromepilot.test.ts --testTimeout=120000
 *
 * Prerequisites:
 *   /home/ubuntu/hellcat/target/release/chromepilot serve --port 9223 --stealth-mode hellcat --xvfb
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const CHROMEPILOT = 'http://localhost:9223';
const STAGING_URL = 'https://staging-app.subfrost.io';
const TIMEOUT = 30000;

let sessionId: string;

// --- Helpers ---

async function createSession(): Promise<string> {
  const resp = await fetch(`${CHROMEPILOT}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stealth: true, human_like: true }),
  });
  const data = await resp.json();
  if (!data.session_id) throw new Error('Failed to create session: ' + JSON.stringify(data));
  return data.session_id;
}

async function navigate(url: string): Promise<void> {
  await fetch(`${CHROMEPILOT}/api/sessions/${sessionId}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, timeout_ms: TIMEOUT }),
  });
}

async function evaluate(expression: string): Promise<any> {
  try {
    const resp = await fetch(`${CHROMEPILOT}/api/sessions/${sessionId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    });
    const data = await resp.json();
    if (data.error) {
      console.warn('[evaluate] Error:', typeof data.error === 'string' ? data.error.substring(0, 100) : JSON.stringify(data.error).substring(0, 100));
      return '';
    }
    return data.result ?? '';
  } catch (e: any) {
    console.warn('[evaluate] Fetch error:', e?.message);
    return '';
  }
}

async function waitForText(text: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
    if (found === true || found === 'true') return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function waitForDevnet(timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await evaluate(
      `(()=>{` +
      `var btns=[...document.querySelectorAll("button")];` +
      `if(btns.some(b=>b.textContent.includes("Devnet H:")))return "ready";` +
      `var t=document.body.innerText;` +
      `if(t.includes("Devnet Error"))return "error";` +
      `if(t.includes("Application error"))return "crash";` +
      `return "waiting"` +
      `})()`
    );
    if (String(status) === 'ready') return true;
    if (String(status) === 'error' || String(status) === 'crash') return false;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function dismissModal(): Promise<void> {
  await evaluate(
    `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Understand"));if(b)b.click();return "ok"})()`
  );
  await new Promise(r => setTimeout(r, 1000));
}

async function clickButton(text: string): Promise<boolean> {
  const safe = JSON.stringify(text);
  const result = await evaluate(
    `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()===${safe}||x.textContent.includes(${safe}));if(b){b.click();return "clicked"}return "not_found"})()`
  );
  return String(result) === 'clicked';
}

async function hasText(text: string): Promise<boolean> {
  const result = await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
  return result === true || result === 'true';
}

async function hasButton(text: string): Promise<boolean> {
  const safe = JSON.stringify(text);
  const result = await evaluate(
    `[...document.querySelectorAll("button")].some(b => b.textContent.includes(${safe}))`
  );
  return result === true || result === 'true';
}

async function getHeight(): Promise<number> {
  const result = await evaluate(
    `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Devnet H:"));if(!b)return "0";var m=b.textContent.match(/H:(\\d+)/);return m?m[1]:"0"})()`
  );
  return parseInt(result) || 0;
}

async function screenshot(name: string): Promise<void> {
  const resp = await fetch(`${CHROMEPILOT}/api/sessions/${sessionId}/screenshot`);
  const buffer = await resp.arrayBuffer();
  const fs = await import('fs');
  fs.writeFileSync(`/tmp/e2e-${name}.png`, Buffer.from(buffer));
}

// --- Test Suite ---

describe('Full App E2E (ChromePilot)', () => {

  beforeAll(async () => {
    // Check if chromepilot is running
    try {
      const health = await fetch(`${CHROMEPILOT}/api/sessions`, { method: 'GET' });
      if (!health.ok) throw new Error('ChromePilot not healthy');
    } catch {
      console.log('ChromePilot not running on port 9223 — skipping E2E tests');
      return;
    }
    sessionId = await createSession();
  }, 30000);

  afterAll(async () => {
    if (sessionId) {
      await fetch(`${CHROMEPILOT}/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    }
  });

  // -----------------------------------------------
  // Home Page
  // -----------------------------------------------

  describe('Home Page', () => {
    it('should load and boot devnet', async () => {
      if (!sessionId) return;
      await navigate(STAGING_URL);
      const booted = await waitForDevnet(60000);
      expect(booted).toBe(true);
      await dismissModal();
    }, 90000);

    it('should show devnet banner', async () => {
      if (!sessionId) return;
      expect(await hasText('In-Browser Devnet')).toBe(true);
    });

    it('should show trending vaults', async () => {
      if (!sessionId) return;
      expect(await hasText('dxBTC Vault')).toBe(true);
    });

    it('should have navigation links', async () => {
      if (!sessionId) return;
      expect(await hasText('Swap')).toBe(true);
      expect(await hasText('Vaults')).toBe(true);
      expect(await hasText('Futures')).toBe(true);
    });
  });

  // -----------------------------------------------
  // Devnet Controls
  // -----------------------------------------------

  describe('Devnet Controls', () => {
    it('should show devnet badge with height', async () => {
      if (!sessionId) return;
      const h = await getHeight();
      expect(h).toBeGreaterThan(0);
    });

    it('should mine blocks on +1 click', async () => {
      if (!sessionId) return;
      const before = await getHeight();
      await clickButton('Devnet H:');
      await new Promise(r => setTimeout(r, 500));
      await clickButton('+1');
      await new Promise(r => setTimeout(r, 3000));
      // Close panel
      await clickButton('✕');
      await new Promise(r => setTimeout(r, 500));
      const after = await getHeight();
      expect(after).toBeGreaterThan(before);
    }, 10000);
  });

  // -----------------------------------------------
  // Swap Page — Spot
  // -----------------------------------------------

  describe('Swap Page (Spot)', () => {
    it('should load unified trading view', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      await screenshot('swap-spot');
    }, 15000);

    it('should show Market/Limit tabs', async () => {
      if (!sessionId) return;
      expect(await hasButton('Market')).toBe(true);
      expect(await hasButton('Limit')).toBe(true);
    });

    it('should show Spot/Futures toggle', async () => {
      if (!sessionId) return;
      expect(await hasButton('Spot')).toBe(true);
      expect(await hasButton('Futures')).toBe(true);
    });

    it('should show swap form inputs', async () => {
      if (!sessionId) return;
      expect(await hasText('YOU SEND')).toBe(true);
      expect(await hasText('YOU RECEIVE')).toBe(true);
    });

    it('should show LP button', async () => {
      if (!sessionId) return;
      expect(await hasText('Add / Remove Liquidity')).toBe(true);
    });

    it('should show mobile data panels', async () => {
      if (!sessionId) return;
      expect(await hasButton('Chart')).toBe(true);
      expect(await hasButton('Book')).toBe(true);
      expect(await hasButton('Trades')).toBe(true);
    });

    it('should show bottom panel tabs', async () => {
      if (!sessionId) return;
      expect(await hasButton('Positions')).toBe(true);
      expect(await hasButton('Activity')).toBe(true);
    });
  });

  // -----------------------------------------------
  // Swap Page — Limit Order
  // -----------------------------------------------

  describe('Swap Page (Limit)', () => {
    it('should switch to Limit tab', async () => {
      if (!sessionId) return;
      await clickButton('Limit');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('BUY')).toBe(true);
      expect(await hasText('SELL')).toBe(true);
      await screenshot('swap-limit');
    });
  });

  // -----------------------------------------------
  // Swap Page — Futures Mode
  // -----------------------------------------------

  describe('Swap Page (Futures)', () => {
    it('should switch to futures mode', async () => {
      if (!sessionId) return;
      await clickButton('Futures');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('DIFFICULTY FUTURES')).toBe(true);
      await screenshot('swap-futures');
    });

    it('should show LONG/SHORT toggle', async () => {
      if (!sessionId) return;
      expect(await hasText('LONG')).toBe(true);
      expect(await hasText('SHORT')).toBe(true);
    });

    it('should show difficulty stats', async () => {
      if (!sessionId) return;
      expect(await hasText('Forecast')).toBe(true);
      expect(await hasText('Epoch')).toBe(true);
    });

    it('should show volBTC pool', async () => {
      if (!sessionId) return;
      expect(await hasText('volBTC')).toBe(true);
    });
  });

  // -----------------------------------------------
  // Orderbook
  // -----------------------------------------------

  describe('Orderbook', () => {
    it('should show orderbook when Book tab clicked', async () => {
      if (!sessionId) return;
      // Switch back to Spot first
      await clickButton('Spot');
      await new Promise(r => setTimeout(r, 1000));
      await clickButton('Book');
      await new Promise(r => setTimeout(r, 2000));
      // Check for spread indicator (mid price)
      expect(await hasText('mid')).toBe(true);
      await screenshot('orderbook');
    });
  });

  // -----------------------------------------------
  // Vaults Page
  // -----------------------------------------------

  describe('Vaults Page', () => {
    it('should load vault list', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/vaults`);
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('DeFi Vaults')).toBe(true);
      await screenshot('vaults-list');
    }, 15000);

    it('should show filter buttons', async () => {
      if (!sessionId) return;
      expect(await hasButton('All') || await hasButton('ALL')).toBe(true);
      expect(await hasButton('Mains') || await hasButton('MAINS')).toBe(true);
      expect(await hasButton('Alts') || await hasButton('ALTS')).toBe(true);
    });

    it('should show dxBTC vault', async () => {
      if (!sessionId) return;
      expect(await hasText('dxBTC')).toBe(true);
    });

    it('should navigate to dxBTC detail', async () => {
      if (!sessionId) return;
      await clickButton('dxBTC');
      await new Promise(r => setTimeout(r, 3000));
      expect(await hasText('Back to')).toBe(true);
      await screenshot('vault-dxbtc');
    });

    it('should go back to vault list', async () => {
      if (!sessionId) return;
      await clickButton('Back to');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('DeFi Vaults')).toBe(true);
    });

    it('should show FIRE vault', async () => {
      if (!sessionId) return;
      expect(await hasText('FIRE')).toBe(true);
    });
  });

  // -----------------------------------------------
  // Futures Page
  // -----------------------------------------------

  describe('Futures Page', () => {
    it('should load futures page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/futures`);
      await new Promise(r => setTimeout(r, 5000));
      await dismissModal();
      expect(await hasText('MARKETS')).toBe(true);
      await screenshot('futures');
    }, 15000);

    it('should have all tabs', async () => {
      if (!sessionId) return;
      expect(await hasText('MARKETS')).toBe(true);
      expect(await hasText('POSITIONS')).toBe(true);
      expect(await hasButton('difficul')).toBe(true);
    });

    it('should show difficulty panel', async () => {
      if (!sessionId) return;
      await clickButton('difficul');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('Forecast')).toBe(true);
      expect(await hasText('Difficulty')).toBe(true);
      expect(await hasText('Epoch')).toBe(true);
      await screenshot('futures-difficulty');
    });

    it('should show synth pool', async () => {
      if (!sessionId) return;
      expect(await hasText('Synth Pool')).toBe(true);
    });

    it('should show volBTC pool', async () => {
      if (!sessionId) return;
      expect(await hasText('volBTC Pool')).toBe(true);
    });
  });

  // -----------------------------------------------
  // URL Parameters
  // -----------------------------------------------

  describe('URL Parameters', () => {
    it('should support ?type=futures on swap page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap?type=futures`);
      await new Promise(r => setTimeout(r, 6000));
      expect(await hasText('DIFFICULTY FUTURES')).toBe(true);
    }, 15000);
  });
});
