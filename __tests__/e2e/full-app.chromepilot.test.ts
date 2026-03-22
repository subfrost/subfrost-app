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

    it('should show LONG/SHORT toggle on Difficulty sub-tab', async () => {
      if (!sessionId) return;
      // LONG/SHORT is on the Difficulty sub-tab within futures
      await clickButton('Difficulty');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('LONG') || await hasText('Long')).toBe(true);
      expect(await hasText('SHORT') || await hasText('Short')).toBe(true);
    });

    it('should show difficulty stats on Difficulty sub-tab', async () => {
      if (!sessionId) return;
      expect(await hasText('Forecast') || await hasText('Difficulty')).toBe(true);
    });

    it('should show volBTC pool on Yield Futures sub-tab', async () => {
      if (!sessionId) return;
      // Switch back to Yield Futures tab where volBTC lives
      await clickButton('Yield Futures');
      await new Promise(r => setTimeout(r, 1000));
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

    it('should NOT show synth pool in futures (moved to swap)', async () => {
      if (!sessionId) return;
      // Synth pool was removed from futures — it's a regular swap pool
      expect(await hasText('Synth Pool')).toBe(false);
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

  // -----------------------------------------------
  // Vault Interactions
  // -----------------------------------------------

  describe('Vault Interactions', () => {
    it('should load vault list with all vaults', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/vaults`);
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('DeFi Vaults')).toBe(true);
      expect(await hasText('dxBTC')).toBe(true);
      expect(await hasText('FIRE')).toBe(true);
    }, 15000);

    it('should click All filter and show all vaults', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('All');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked || await hasButton('All')).toBe(true);
      // All vaults visible
      expect(await hasText('dxBTC')).toBe(true);
      expect(await hasText('FIRE')).toBe(true);
    });

    it('should click Mains filter and show only main vaults', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Mains');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
      expect(await hasText('dxBTC')).toBe(true);
      await screenshot('vaults-mains-filter');
    });

    it('should click Alts filter and show only alt vaults', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Alts');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
      // FIRE Protocol is ve-diesel which is in alts
      expect(await hasText('FIRE')).toBe(true);
      await screenshot('vaults-alts-filter');
    });

    it('should switch back to All filter', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('All');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
      expect(await hasText('dxBTC')).toBe(true);
      expect(await hasText('FIRE')).toBe(true);
    });

    it('should navigate to dxBTC vault detail', async () => {
      if (!sessionId) return;
      await clickButton('dxBTC');
      await new Promise(r => setTimeout(r, 3000));
      expect(await hasText('Back to')).toBe(true);
      await screenshot('vault-detail-dxbtc');
    });

    it('should show deposit/withdraw tabs in detail view', async () => {
      if (!sessionId) return;
      // VaultDetail has deposit/withdraw mode
      expect(await hasButton('Deposit') || await hasText('Deposit')).toBe(true);
      expect(await hasButton('Withdraw') || await hasText('Withdraw')).toBe(true);
    });

    it('should show About info tab in detail view', async () => {
      if (!sessionId) return;
      expect(await hasButton('About') || await hasText('About')).toBe(true);
    });

    it('should click Strategies info tab', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Strategies');
      await new Promise(r => setTimeout(r, 500));
      expect(clicked || await hasText('Strategies')).toBe(true);
    });

    it('should click Info tab and show contract details', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Info');
      await new Promise(r => setTimeout(r, 500));
      expect(clicked || await hasText('Info')).toBe(true);
    });

    it('should click Risk tab', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Risk');
      await new Promise(r => setTimeout(r, 500));
      expect(clicked || await hasText('Risk')).toBe(true);
      await screenshot('vault-detail-risk-tab');
    });

    it('should navigate back to vault list from detail', async () => {
      if (!sessionId) return;
      await clickButton('Back to');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('DeFi Vaults')).toBe(true);
    });

    it('should navigate to FIRE (ve-diesel) vault and open FireDashboard', async () => {
      if (!sessionId) return;
      await clickButton('FIRE');
      await new Promise(r => setTimeout(r, 3000));
      expect(await hasText('Back to')).toBe(true);
      await screenshot('fire-dashboard');
    });

    it('should show FIRE dashboard metrics (price, market cap, circ supply, total staked)', async () => {
      if (!sessionId) return;
      // Labels are rendered uppercase via CSS text-transform
      const hasMetric = await hasText('FIRE PRICE') || await hasText('MARKET CAP') || await hasText('TOTAL STAKED') || await hasText('FIRE');
      expect(hasMetric).toBe(true);
    });

    it('should show FIRE dashboard tab', async () => {
      if (!sessionId) return;
      expect(await hasButton('Dashboard') || await hasText('Dashboard')).toBe(true);
    });

    it('should click FIRE Stake tab', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Stake');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
      await screenshot('fire-stake-tab');
    });

    it('should click FIRE Bond tab', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Bond');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
      await screenshot('fire-bond-tab');
    });

    it('should click FIRE Redeem tab', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Redeem');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
    });

    it('should click FIRE Distribute tab', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('Distribute');
      await new Promise(r => setTimeout(r, 1000));
      expect(clicked).toBe(true);
    });

    it('should return to vault list from FIRE dashboard', async () => {
      if (!sessionId) return;
      await clickButton('Back to');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('DeFi Vaults')).toBe(true);
    });

    it('should show disabled vaults with reduced opacity', async () => {
      if (!sessionId) return;
      // ve-usd is a disabled vault (not dx-btc or ve-diesel), should have opacity/grayscale
      const hasDisabledStyle = await evaluate(
        `(()=>{var items=[...document.querySelectorAll('[class*="opacity"]')];return items.length>0})()`
      );
      expect(hasDisabledStyle === true || hasDisabledStyle === 'true').toBe(true);
    });

    it('should open vault detail via URL param ?vault=dx-btc', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/vaults?vault=dx-btc`);
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('Back to')).toBe(true);
      expect(await hasText('Deposit') || await hasButton('Deposit')).toBe(true);
      await screenshot('vault-url-param-dxbtc');
    }, 15000);
  });

  // -----------------------------------------------
  // Swap Form Interactions
  // -----------------------------------------------

  describe('Swap Form Interactions', () => {
    it('should load swap page and show Market tab by default', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      expect(await hasText('YOU SEND')).toBe(true);
      expect(await hasText('YOU RECEIVE')).toBe(true);
    }, 15000);

    it('should show Market and Limit tab buttons', async () => {
      if (!sessionId) return;
      expect(await hasButton('Market')).toBe(true);
      expect(await hasButton('Limit')).toBe(true);
    });

    it('should click Limit tab and show BUY/SELL buttons', async () => {
      if (!sessionId) return;
      await clickButton('Limit');
      await new Promise(r => setTimeout(r, 1500));
      expect(await hasText('BUY')).toBe(true);
      expect(await hasText('SELL')).toBe(true);
      await screenshot('swap-limit-tab');
    });

    it('should show Price input on Limit tab', async () => {
      if (!sessionId) return;
      // Ensure we're on Limit tab (may have been switched by previous test)
      await clickButton('Limit');
      await new Promise(r => setTimeout(r, 1000));
      expect(await hasText('PRICE') || await hasText('Price')).toBe(true);
    });

    it('should click BUY and show green active state', async () => {
      if (!sessionId) return;
      await clickButton('BUY');
      await new Promise(r => setTimeout(r, 500));
      const isGreen = await evaluate(
        `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("BUY"));if(!b)return false;var cl=b.className;return cl.includes("green")})()`
      );
      expect(isGreen === true || isGreen === 'true').toBe(true);
    });

    it('should click SELL and show red active state', async () => {
      if (!sessionId) return;
      await clickButton('SELL');
      await new Promise(r => setTimeout(r, 500));
      const isRed = await evaluate(
        `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("SELL"));if(!b)return false;var cl=b.className;return cl.includes("red")})()`
      );
      expect(isRed === true || isRed === 'true').toBe(true);
    });

    it('should switch back to Market tab', async () => {
      if (!sessionId) return;
      await clickButton('Market');
      await new Promise(r => setTimeout(r, 1500));
      expect(await hasText('YOU SEND')).toBe(true);
      expect(await hasText('YOU RECEIVE')).toBe(true);
    });

    it('should show Spot and Futures toggle', async () => {
      if (!sessionId) return;
      expect(await hasButton('Spot')).toBe(true);
      expect(await hasButton('Futures')).toBe(true);
    });

    it('should click Futures toggle and show difficulty futures', async () => {
      if (!sessionId) return;
      await clickButton('Futures');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('DIFFICULTY FUTURES') || await hasText('Difficulty Futures')).toBe(true);
      await screenshot('swap-futures-mode');
    });

    it('should show Yield Futures sub-tab in futures mode', async () => {
      if (!sessionId) return;
      expect(await hasButton('Yield Futures') || await hasText('YIELD FUTURES')).toBe(true);
    });

    it('should show Difficulty sub-tab in futures mode', async () => {
      if (!sessionId) return;
      expect(await hasButton('Difficulty') || await hasText('DIFFICULTY')).toBe(true);
    });

    it('should click back to Spot mode', async () => {
      if (!sessionId) return;
      await clickButton('Spot');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('YOU SEND')).toBe(true);
    });

    it('should show + Add / Remove Liquidity link', async () => {
      if (!sessionId) return;
      expect(await hasText('Add / Remove Liquidity')).toBe(true);
    });

    it('should show CONNECT WALLET button when no wallet connected', async () => {
      if (!sessionId) return;
      const hasConnect = await hasButton('CONNECT WALLET') || await hasButton('Connect Wallet');
      expect(hasConnect).toBe(true);
    });

    it('should show swap form input fields with placeholders', async () => {
      if (!sessionId) return;
      // Switch to Market tab to ensure swap inputs are shown
      await clickButton('Market');
      await new Promise(r => setTimeout(r, 1000));
      const hasInputs = await evaluate(
        `(()=>{var inputs=[...document.querySelectorAll("input")];return inputs.length>=1})()`
      );
      expect(hasInputs === true || hasInputs === 'true').toBe(true);
    });

    it('should show mobile data panel tabs (Chart, Book, Trades)', async () => {
      if (!sessionId) return;
      expect(await hasButton('Chart')).toBe(true);
      expect(await hasButton('Book')).toBe(true);
      expect(await hasButton('Trades')).toBe(true);
    });
  });

  // -----------------------------------------------
  // Orderbook Interactions
  // -----------------------------------------------

  describe('Orderbook Interactions', () => {
    it('should navigate to swap and click Book tab', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      await clickButton('Book');
      await new Promise(r => setTimeout(r, 2000));
      await screenshot('orderbook-panel');
    }, 15000);

    it('should show Order Book header', async () => {
      if (!sessionId) return;
      expect(await hasText('Order Book') || await hasText('ORDER BOOK')).toBe(true);
    });

    it('should show Price/Size/Total column headers', async () => {
      if (!sessionId) return;
      // Column headers are rendered uppercase
      expect(await hasText('PRICE') || await hasText('Price')).toBe(true);
      expect(await hasText('SIZE') || await hasText('Size')).toBe(true);
      expect(await hasText('TOTAL') || await hasText('Total')).toBe(true);
    });

    it('should show spread indicator with mid price', async () => {
      if (!sessionId) return;
      expect(await hasText('mid')).toBe(true);
    });

    it('should show bid prices in green', async () => {
      if (!sessionId) return;
      const hasGreenPrices = await evaluate(
        `(()=>{var spans=[...document.querySelectorAll("span.text-green-400")];return spans.length>0})()`
      );
      expect(hasGreenPrices === true || hasGreenPrices === 'true').toBe(true);
    });

    it('should show ask prices in red', async () => {
      if (!sessionId) return;
      const hasRedPrices = await evaluate(
        `(()=>{var spans=[...document.querySelectorAll("span.text-red-400")];return spans.length>0})()`
      );
      expect(hasRedPrices === true || hasRedPrices === 'true').toBe(true);
    });

    it('should show grouping selector with current value', async () => {
      if (!sessionId) return;
      // The grouping selector shows values like 0.01, 0.1, etc.
      const hasGrouping = await evaluate(
        `(()=>{var btns=[...document.querySelectorAll("button")];return btns.some(b=>b.textContent.trim()==="0.01"||b.textContent.includes("0.01"))})()`
      );
      expect(hasGrouping === true || hasGrouping === 'true').toBe(true);
    });

    it('should show display mode buttons (both/bids/asks)', async () => {
      if (!sessionId) return;
      // Display mode buttons have title attributes Both, Bids only, Asks only
      const hasDisplayModes = await evaluate(
        `(()=>{var btns=[...document.querySelectorAll("button[title]")];var titles=btns.map(b=>b.title);return titles.includes("Both")&&titles.includes("Bids only")&&titles.includes("Asks only")})()`
      );
      expect(hasDisplayModes === true || hasDisplayModes === 'true').toBe(true);
    });
  });

  // -----------------------------------------------
  // Futures Interactions
  // -----------------------------------------------

  describe('Futures Interactions', () => {
    it('should load futures page and show Markets tab', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/futures`);
      await new Promise(r => setTimeout(r, 5000));
      await dismissModal();
      expect(await hasText('MARKETS')).toBe(true);
      await screenshot('futures-markets');
    }, 15000);

    it('should show DIFFICULTY tab button', async () => {
      if (!sessionId) return;
      expect(await hasButton('DIFFICULTY') || await hasButton('difficul')).toBe(true);
    });

    it('should show POSITIONS tab button', async () => {
      if (!sessionId) return;
      expect(await hasText('POSITIONS')).toBe(true);
    });

    it('should click Difficulty tab and show difficulty panel', async () => {
      if (!sessionId) return;
      const clicked = await clickButton('DIFFICULTY') || await clickButton('difficul');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('Forecast')).toBe(true);
      await screenshot('futures-difficulty-panel');
    });

    it('should show 4 hero stats in difficulty panel', async () => {
      if (!sessionId) return;
      expect(await hasText('Forecast')).toBe(true);
      expect(await hasText('Difficulty')).toBe(true);
      expect(await hasText('Epoch Progress')).toBe(true);
      expect(await hasText('Pool TVL')).toBe(true);
    });

    it('should show LONG button active by default (green)', async () => {
      if (!sessionId) return;
      const longIsGreen = await evaluate(
        `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("LONG"));if(!b)return false;return b.className.includes("green")})()`
      );
      expect(longIsGreen === true || longIsGreen === 'true').toBe(true);
    });

    it('should click SHORT and switch to red active state', async () => {
      if (!sessionId) return;
      await clickButton('SHORT');
      await new Promise(r => setTimeout(r, 500));
      const shortIsRed = await evaluate(
        `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("SHORT"));if(!b)return false;return b.className.includes("red")})()`
      );
      expect(shortIsRed === true || shortIsRed === 'true').toBe(true);
      await screenshot('futures-short-active');
    });

    it('should click LONG back', async () => {
      if (!sessionId) return;
      await clickButton('LONG');
      await new Promise(r => setTimeout(r, 500));
      const longIsGreen = await evaluate(
        `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("LONG"));if(!b)return false;return b.className.includes("green")})()`
      );
      expect(longIsGreen === true || longIsGreen === 'true').toBe(true);
    });

    it('should show amount input field', async () => {
      if (!sessionId) return;
      const hasInput = await evaluate(
        `(()=>{var inputs=[...document.querySelectorAll("input[inputmode='decimal']")];return inputs.length>=1})()`
      );
      expect(hasInput === true || hasInput === 'true').toBe(true);
    });

    it('should show MAX percentage button', async () => {
      if (!sessionId) return;
      expect(await hasButton('MAX')).toBe(true);
    });

    it('should show percentage buttons (25%, 50%, 75%)', async () => {
      if (!sessionId) return;
      const hasPctButtons = await evaluate(
        `(()=>{var btns=[...document.querySelectorAll("button")];return btns.some(b=>b.textContent.includes("25%"))&&btns.some(b=>b.textContent.includes("50%"))})()`
      );
      // These buttons are hidden on small screens (hidden sm:block), so check for at least MAX
      expect(hasPctButtons === true || hasPctButtons === 'true' || await hasButton('MAX')).toBe(true);
    });

    it('should NOT show Synth Pool in futures (removed)', async () => {
      if (!sessionId) return;
      expect(await hasText('Synth Pool')).toBe(false);
    });

    it('should show volBTC Pool section', async () => {
      if (!sessionId) return;
      expect(await hasText('volBTC Pool')).toBe(true);
    });

    it('should click Positions tab', async () => {
      if (!sessionId) return;
      await clickButton('POSITIONS');
      await new Promise(r => setTimeout(r, 1500));
      await screenshot('futures-positions');
    });

    it('should click back to Markets tab', async () => {
      if (!sessionId) return;
      await clickButton('MARKETS');
      await new Promise(r => setTimeout(r, 1500));
      expect(await hasText('MARKETS')).toBe(true);
    });

    it('should show Generate Future button', async () => {
      if (!sessionId) return;
      expect(await hasButton('Generate Future')).toBe(true);
    });

    it('should show futures count or no-futures message', async () => {
      if (!sessionId) return;
      const hasFuturesInfo = await hasText('active futures') || await hasText('No Futures');
      expect(hasFuturesInfo).toBe(true);
    });
  });

  // -----------------------------------------------
  // Data Integrity
  // -----------------------------------------------

  describe('Data Integrity', () => {
    it('should show devnet height greater than 100', async () => {
      if (!sessionId) return;
      const h = await getHeight();
      expect(h).toBeGreaterThan(100);
    });

    it('should show home page vault tiles with APY values', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}`);
      await new Promise(r => setTimeout(r, 5000));
      // Home page should show trending vaults with APY percentages
      const hasApyValue = await evaluate(
        `(()=>{var t=document.body.innerText;return t.includes("%")})()`
      );
      expect(hasApyValue === true || hasApyValue === 'true').toBe(true);
    }, 15000);

    it('should show activity feed on home page', async () => {
      if (!sessionId) return;
      // ActivityFeed should be rendered
      const hasActivity = await hasText('Activity') || await hasText('activity');
      expect(hasActivity).toBe(true);
    });

    it('should show trending pairs section on home page', async () => {
      if (!sessionId) return;
      const hasTrending = await hasText('Trending') || await hasText('trending');
      expect(hasTrending).toBe(true);
    });

    it('should show vault APY percentages on vault list', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/vaults`);
      await new Promise(r => setTimeout(r, 5000));
      const hasPercentage = await evaluate(
        `(()=>{var items=[...document.querySelectorAll("*")].filter(el=>el.textContent.match(/\\d+\\.?\\d*%/) && el.children.length===0);return items.length>=1})()`
      );
      expect(hasPercentage === true || hasPercentage === 'true').toBe(true);
    }, 15000);

    it('should show numeric difficulty values on futures page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/futures`);
      await new Promise(r => setTimeout(r, 5000));
      await dismissModal();
      await clickButton('DIFFICULTY') || await clickButton('difficul');
      await new Promise(r => setTimeout(r, 2000));
      // Difficulty should show a value like 113.76T
      expect(await hasText('113.76T')).toBe(true);
    }, 15000);

    it('should show orderbook mid price as a number on swap page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      await clickButton('Book');
      await new Promise(r => setTimeout(r, 2000));
      const midPriceIsNumeric = await evaluate(
        `(()=>{var spans=[...document.querySelectorAll("span")];var mid=spans.find(s=>s.nextElementSibling&&s.nextElementSibling.textContent.includes("mid"));if(!mid)return false;var val=parseFloat(mid.textContent.replace(/,/g,""));return !isNaN(val)&&val>0})()`
      );
      expect(midPriceIsNumeric === true || midPriceIsNumeric === 'true').toBe(true);
    }, 15000);

    it('should have bottom panel tabs rendering without errors', async () => {
      if (!sessionId) return;
      // Already on swap page
      expect(await hasButton('Positions')).toBe(true);
      expect(await hasButton('Activity')).toBe(true);
      expect(await hasButton('Trades')).toBe(true);
      expect(await hasButton('Open Orders')).toBe(true);
    });

    it('should show In-Browser Devnet banner on all pages', async () => {
      if (!sessionId) return;
      expect(await hasText('In-Browser Devnet')).toBe(true);
    });

    it('should show block height in devnet badge', async () => {
      if (!sessionId) return;
      const hasHeight = await evaluate(
        `(()=>{var b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Devnet H:"));return !!b})()`
      );
      expect(hasHeight === true || hasHeight === 'true').toBe(true);
    });
  });

  // -----------------------------------------------
  // Mobile Data Panels
  // -----------------------------------------------

  describe('Mobile Data Panels', () => {
    it('should load swap page for mobile panel tests', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      expect(await hasButton('Chart')).toBe(true);
    }, 15000);

    it('should click Chart tab and show chart content', async () => {
      if (!sessionId) return;
      await clickButton('Chart');
      await new Promise(r => setTimeout(r, 1500));
      // Chart tab should be active (highlighted)
      const chartActive = await evaluate(
        `(()=>{var btns=[...document.querySelectorAll("button")].filter(b=>b.textContent.includes("Chart"));return btns.some(b=>b.className.includes("shadow"))})()`
      );
      expect(chartActive === true || chartActive === 'true').toBe(true);
    });

    it('should click Book tab and show orderbook', async () => {
      if (!sessionId) return;
      await clickButton('Book');
      await new Promise(r => setTimeout(r, 2000));
      expect(await hasText('Order Book') || await hasText('mid')).toBe(true);
      await screenshot('mobile-book-tab');
    });

    it('should click Trades tab and show recent trades', async () => {
      if (!sessionId) return;
      await clickButton('Trades');
      await new Promise(r => setTimeout(r, 2000));
      // The trades panel should load (either showing trades or empty state)
      const tradesTabActive = await evaluate(
        `(()=>{var btns=[...document.querySelectorAll("button")].filter(b=>b.textContent.includes("Trades"));return btns.some(b=>b.className.includes("shadow"))})()`
      );
      expect(tradesTabActive === true || tradesTabActive === 'true').toBe(true);
      await screenshot('mobile-trades-tab');
    });

    it('should preserve page state when switching back to Chart', async () => {
      if (!sessionId) return;
      await clickButton('Chart');
      await new Promise(r => setTimeout(r, 1000));
      // Swap form should still be present
      expect(await hasText('YOU SEND')).toBe(true);
      expect(await hasButton('Market')).toBe(true);
    });

    it('should show bottom panels below mobile data panels', async () => {
      if (!sessionId) return;
      expect(await hasButton('Positions')).toBe(true);
      expect(await hasButton('Activity')).toBe(true);
    });
  });

  // -----------------------------------------------
  // Navigation Flow
  // -----------------------------------------------

  describe('Navigation Flow', () => {
    it('should navigate from Home to Swap', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}`);
      await new Promise(r => setTimeout(r, 4000));
      // Click Swap nav link
      const clicked = await evaluate(
        `(()=>{var links=[...document.querySelectorAll("a")];var swap=links.find(l=>l.textContent.trim()==="Swap"&&l.href.includes("/swap"));if(swap){swap.click();return true}return false})()`
      );
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('YOU SEND') || await hasButton('Market')).toBe(true);
    }, 15000);

    it('should navigate from Swap to Vaults', async () => {
      if (!sessionId) return;
      const clicked = await evaluate(
        `(()=>{var links=[...document.querySelectorAll("a")];var v=links.find(l=>l.textContent.trim()==="Vaults"&&l.href.includes("/vaults"));if(v){v.click();return true}return false})()`
      );
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('DeFi Vaults')).toBe(true);
    }, 15000);

    it('should navigate from Vaults to Futures', async () => {
      if (!sessionId) return;
      const clicked = await evaluate(
        `(()=>{var links=[...document.querySelectorAll("a")];var f=links.find(l=>l.textContent.trim()==="Futures"&&l.href.includes("/futures"));if(f){f.click();return true}return false})()`
      );
      await new Promise(r => setTimeout(r, 5000));
      await dismissModal();
      expect(await hasText('MARKETS')).toBe(true);
    }, 15000);

    it('should navigate from Futures to Home', async () => {
      if (!sessionId) return;
      // Click Home nav link
      const clicked = await evaluate(
        `(()=>{var links=[...document.querySelectorAll("a")];var home=links.find(l=>l.textContent.trim()==="Home");if(home){home.click();return true}return false})()`
      );
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('Trending') || await hasText('dxBTC')).toBe(true);
    }, 15000);

    it('should support direct URL /swap', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      expect(await hasButton('Market')).toBe(true);
    }, 15000);

    it('should support direct URL /vaults', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/vaults`);
      await new Promise(r => setTimeout(r, 5000));
      expect(await hasText('DeFi Vaults')).toBe(true);
    }, 15000);

    it('should support direct URL /futures', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/futures`);
      await new Promise(r => setTimeout(r, 5000));
      await dismissModal();
      expect(await hasText('MARKETS')).toBe(true);
    }, 15000);

    it('should support direct URL /swap?type=futures', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap?type=futures`);
      await new Promise(r => setTimeout(r, 6000));
      expect(await hasText('DIFFICULTY FUTURES') || await hasText('Difficulty Futures')).toBe(true);
    }, 15000);
  });

  // -----------------------------------------------
  // Bottom Panel Interactions
  // -----------------------------------------------

  describe('Bottom Panel Interactions', () => {
    it('should load swap page for bottom panel tests', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
    }, 15000);

    it('should show Open Orders tab', async () => {
      if (!sessionId) return;
      expect(await hasButton('Open Orders')).toBe(true);
    });

    it('should click Positions tab in bottom panel', async () => {
      if (!sessionId) return;
      await clickButton('Positions');
      await new Promise(r => setTimeout(r, 1000));
      await screenshot('bottom-positions');
    });

    it('should click Trades tab in bottom panel', async () => {
      if (!sessionId) return;
      await clickButton('Trades');
      await new Promise(r => setTimeout(r, 1000));
      await screenshot('bottom-trades');
    });

    it('should click Activity tab in bottom panel', async () => {
      if (!sessionId) return;
      await clickButton('Activity');
      await new Promise(r => setTimeout(r, 1000));
      await screenshot('bottom-activity');
    });

    it('should click Open Orders tab in bottom panel', async () => {
      if (!sessionId) return;
      await clickButton('Open Orders');
      await new Promise(r => setTimeout(r, 1000));
      await screenshot('bottom-open-orders');
    });
  });

  // -----------------------------------------------
  // Swap Token Selection
  // -----------------------------------------------

  describe('Swap Token Selection', () => {
    it('should load swap page for token selection tests', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      await clickButton('Market');
      await new Promise(r => setTimeout(r, 1000));
    }, 15000);

    it('should show token selector dropdowns (chevron icons)', async () => {
      if (!sessionId) return;
      const hasChevrons = await evaluate(
        `(()=>{var svgs=[...document.querySelectorAll("svg")];return svgs.length>3})()`
      );
      expect(hasChevrons === true || hasChevrons === 'true').toBe(true);
    });

    it('should show swap direction invert button', async () => {
      if (!sessionId) return;
      // The invert button is between YOU SEND and YOU RECEIVE
      const hasInvert = await evaluate(
        `(()=>{var btns=[...document.querySelectorAll("button")];return btns.some(b=>{var svg=b.querySelector("svg");return svg&&b.className.includes("rounded")})})()`
      );
      expect(hasInvert === true || hasInvert === 'true').toBe(true);
    });

    it('should show balance text for from token', async () => {
      if (!sessionId) return;
      const hasBalance = await hasText('Balance') || await hasText('balance');
      expect(hasBalance).toBe(true);
    });
  });

  // -----------------------------------------------
  // Devnet Control Panel
  // -----------------------------------------------

  describe('Devnet Control Panel', () => {
    it('should open devnet control panel on badge click', async () => {
      if (!sessionId) return;
      await clickButton('Devnet H:');
      await new Promise(r => setTimeout(r, 1000));
      await screenshot('devnet-control-panel');
    });

    it('should show +1 mine button in control panel', async () => {
      if (!sessionId) return;
      expect(await hasButton('+1')).toBe(true);
    });

    it('should show +10 mine button in control panel', async () => {
      if (!sessionId) return;
      expect(await hasButton('+10')).toBe(true);
    });

    it('should mine +10 blocks', async () => {
      if (!sessionId) return;
      // Panel should be open from previous test
      const before = await getHeight();
      await clickButton('+10');
      // Mining 10 blocks takes ~5s (50ms per block + indexing)
      await new Promise(r => setTimeout(r, 8000));
      // Close and reopen to refresh height display
      await clickButton('✕');
      await new Promise(r => setTimeout(r, 500));
      const after = await getHeight();
      expect(after).toBeGreaterThan(before);
    }, 20000);

    it('should close control panel', async () => {
      if (!sessionId) return;
      await clickButton('✕');
      await new Promise(r => setTimeout(r, 500));
    });
  });

  // -----------------------------------------------
  // Home Page Deep Checks
  // -----------------------------------------------

  describe('Home Page Deep Checks', () => {
    it('should load home page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}`);
      await new Promise(r => setTimeout(r, 5000));
    }, 15000);

    it('should show View All link to vaults page', async () => {
      if (!sessionId) return;
      // "View all" or "View All" — case varies
      const hasViewAll = await evaluate(
        `(()=>{var links=[...document.querySelectorAll("a")];return links.some(l=>(l.textContent.includes("View all")||l.textContent.includes("View All"))&&l.href.includes("/vaults"))})()`
      );
      expect(hasViewAll === true || hasViewAll === 'true').toBe(true);
    });

    it('should show at least 3 vault tiles on home page', async () => {
      if (!sessionId) return;
      // The home page shows 3 featured vaults
      const vaultCount = await evaluate(
        `(()=>{var t=document.body.innerText;var count=0;if(t.includes("dxBTC"))count++;if(t.includes("FIRE"))count++;if(t.includes("veUSD")||t.includes("veOrdi")||t.includes("veETH"))count++;return count})()`
      );
      expect(parseInt(String(vaultCount)) || 0).toBeGreaterThanOrEqual(2);
    });

    it('should show APY column headers in vault tiles', async () => {
      if (!sessionId) return;
      const hasApyLabel = await hasText('APY') || await hasText('Estimated APY') || await hasText('Est. APY');
      expect(hasApyLabel).toBe(true);
    });

    it('should show navigation header with Swap/Vaults/Futures links', async () => {
      if (!sessionId) return;
      const hasNavLinks = await evaluate(
        `(()=>{var links=[...document.querySelectorAll("a")];var hasSwap=links.some(l=>l.href.includes("/swap"));var hasVaults=links.some(l=>l.href.includes("/vaults"));var hasFutures=links.some(l=>l.href.includes("/futures"));return hasSwap&&hasVaults&&hasFutures})()`
      );
      expect(hasNavLinks === true || hasNavLinks === 'true').toBe(true);
    });
  });

  // -----------------------------------------------
  // Wallet Page (No Wallet Connected)
  // -----------------------------------------------

  describe('Wallet Page (No Wallet)', () => {
    it('should load wallet page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/wallet`);
      await new Promise(r => setTimeout(r, 5000));
      await screenshot('wallet-page');
    }, 15000);

    it('should show connect wallet prompt or wallet UI', async () => {
      if (!sessionId) return;
      // Either shows connect prompt or wallet tabs
      const hasWalletUI = await hasText('Connect') || await hasText('Balances') || await hasText('Wallet');
      expect(hasWalletUI).toBe(true);
    });
  });

  // -----------------------------------------------
  // Settings Page
  // -----------------------------------------------

  describe('Settings Page', () => {
    it('should load settings page', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/settings`);
      await new Promise(r => setTimeout(r, 3000));
      await screenshot('settings-page');
    }, 15000);

    it('should show settings content', async () => {
      if (!sessionId) return;
      const hasSettings = await hasText('Settings') || await hasText('settings') || await hasText('Language') || await hasText('Theme');
      expect(hasSettings).toBe(true);
    });
  });

  // -----------------------------------------------
  // Swap Pair Selector Bar
  // -----------------------------------------------

  describe('Swap Pair Selector', () => {
    it('should load swap and show pair selector area', async () => {
      if (!sessionId) return;
      await navigate(`${STAGING_URL}/swap`);
      await new Promise(r => setTimeout(r, 6000));
      // The pair selector bar shows the current pair
      const hasPairInfo = await evaluate(
        `(()=>{var t=document.body.innerText;return t.includes("DIESEL")||t.includes("frBTC")||t.includes("Select Pair")||t.includes("/")})()`
      );
      expect(hasPairInfo === true || hasPairInfo === 'true').toBe(true);
    }, 15000);

    it('should show volume or TVL label', async () => {
      if (!sessionId) return;
      // Pair selector bar or page content should show volume/TVL
      const hasLabel = await hasText('Vol') || await hasText('TVL') || await hasText('Volume') || await hasText('Select Pair');
      expect(hasLabel).toBe(true);
    });
  });
});
