/**
 * Source-string spec for the pending-tx HUD widget. Pins the
 * load-bearing behaviour:
 *   - Hidden when no pending tx
 *   - Hidden on the /wallet page (user is already viewing the list)
 *   - Click → router.push('/wallet')
 *   - Mounted via providers.tsx alongside WalletStatePrewarmer
 *
 * Avoids React-rendering the component (no jsdom + next/navigation
 * stub needed) — we just assert the source contains the load-bearing
 * shape. New violations flip red the moment someone removes the
 * empty-list early-return or breaks the route.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../PendingTxHUD.tsx'),
  'utf-8',
);

describe('PendingTxHUD source contract', () => {
  it('imports usePendingTxs', () => {
    expect(SRC).toMatch(/from ['"]@\/hooks\/usePendingTxs['"]/);
  });

  it('returns null when no pending tx', () => {
    expect(SRC).toMatch(/if \(!pendingTxs\.length\) return null/);
  });

  it('returns null on the /wallet page (avoid duplicate UI)', () => {
    expect(SRC).toMatch(/pathname === ['"]\/wallet['"]/);
  });

  it('navigates to /wallet on click', () => {
    expect(SRC).toMatch(/router\.push\(['"]\/wallet['"]\)/);
  });

  it('uses fixed positioning + non-blocking z-index', () => {
    expect(SRC).toMatch(/fixed/);
    expect(SRC).toMatch(/z-40/);
  });

  it('uses an animated indicator (Loader2 spin)', () => {
    expect(SRC).toMatch(/Loader2/);
    expect(SRC).toMatch(/animate-spin/);
  });
});

describe('PendingTxHUD mount point', () => {
  it('is mounted in providers.tsx inside WalletProvider', () => {
    const providers = fs.readFileSync(
      path.resolve(__dirname, '../../app/providers.tsx'),
      'utf-8',
    );
    expect(providers).toMatch(/<PendingTxHUD\s*\/>/);
    const providerIdx = providers.indexOf('<WalletProvider');
    const hudIdx = providers.indexOf('<PendingTxHUD');
    const closeIdx = providers.indexOf('</WalletProvider>');
    expect(providerIdx).toBeLessThan(hudIdx);
    expect(hudIdx).toBeLessThan(closeIdx);
  });
});
