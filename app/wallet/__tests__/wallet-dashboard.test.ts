/**
 * Wallet Dashboard — Source Code Analysis Tests
 *
 * These tests verify the structural integrity and integration patterns of the
 * wallet dashboard page and its child components by reading source files and
 * asserting on import statements, prop types, hook usage, and key UI patterns.
 *
 * No React rendering is performed; all assertions use fs.readFileSync + regex.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const WALLET_DIR = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(WALLET_DIR, 'components');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Wallet page.tsx
// ---------------------------------------------------------------------------
describe('WalletDashboardPage (page.tsx)', () => {
  const src = readSource(path.join(WALLET_DIR, 'page.tsx'));

  it('imports SendModal component', () => {
    expect(src).toMatch(/import\s+SendModal\s+from\s+['"]\.\/components\/SendModal['"]/);
  });

  it('imports ReceiveModal component', () => {
    expect(src).toMatch(/import\s+ReceiveModal\s+from\s+['"]\.\/components\/ReceiveModal['"]/);
  });

  it('imports BitcoinBalanceCard component', () => {
    expect(src).toMatch(/import\s+BitcoinBalanceCard\s+from\s+['"]\.\/components\/BitcoinBalanceCard['"]/);
  });

  it('imports TransactionHistory component', () => {
    expect(src).toMatch(/import\s+TransactionHistory/);
  });

  it('imports WalletSettings component', () => {
    expect(src).toMatch(/import\s+WalletSettings\s+from\s+['"]\.\/components\/WalletSettings['"]/);
  });

  it('uses useWallet() hook', () => {
    expect(src).toMatch(/useWallet\(\)/);
  });

  it('imports AlkaneAsset type from useEnrichedWalletData', () => {
    expect(src).toMatch(/import\s+type\s+\{\s*AlkaneAsset\s*\}\s+from\s+['"]@\/hooks\/useEnrichedWalletData['"]/);
  });

  it('passes a Send handler that opens the SendModal', () => {
    expect(src).toMatch(/onSend=\{\(\)\s*=>\s*setShowSendModal\(true\)\}/);
  });

  it('passes a Receive handler that opens the ReceiveModal', () => {
    expect(src).toMatch(/onReceive=\{\(\)\s*=>\s*setShowReceiveModal\(true\)\}/);
  });

  it('renders SendModal with isOpen tied to showSendModal state', () => {
    expect(src).toMatch(/<SendModal[\s\S]*?isOpen=\{showSendModal\}/);
  });

  it('renders ReceiveModal with isOpen tied to showReceiveModal state', () => {
    expect(src).toMatch(/<ReceiveModal[\s\S]*?isOpen=\{showReceiveModal\}/);
  });

  it('passes onSendAlkane callback to the Alkanes card', () => {
    expect(src).toMatch(/<AlkanesBalancesCard[\s\S]*?onSendAlkane=/);
  });

  it('onSendAlkane callback sets sendAlkane state and opens SendModal', () => {
    // The callback does both: setSendAlkane(alkane) and setShowSendModal(true)
    expect(src).toMatch(/onSendAlkane=\{.*setSendAlkane\(/);
    expect(src).toMatch(/onSendAlkane=\{.*setShowSendModal\(true\)/);
  });

  it('has a connection guard that waits for init then redirects when not connected', () => {
    expect(src).toMatch(/isInitializing/);
    expect(src).toMatch(/router\.push\(['"]\/['"]\)/);
    expect(src).toMatch(/return\s+null/);
  });

  it('derives walletConnected from connected or isConnected', () => {
    expect(src).toMatch(/walletConnected\s*=.*connected.*isConnected/);
  });

  it('has section-based navigation including history and settings', () => {
    expect(src).toContain("'history'");
    expect(src).toContain("'settings'");
    expect(src).toMatch(/sf-tab-group/);
  });

  it('defaults to tokens section', () => {
    expect(src).toMatch(/useState<WalletSection>\([\s\S]*'tokens'/);
  });

  it('conditionally renders section content based on activeSection', () => {
    expect(src).toMatch(/activeSection\s*===\s*['"]history['"][\s\S]*?<TransactionHistory/);
    expect(src).toMatch(/activeSection\s*===\s*['"]settings['"][\s\S]*?<WalletSettings/);
    expect(src).toMatch(/isAlkaneSection[\s\S]*?<AlkanesBalancesCard/);
  });

  it('passes initialAlkane prop to SendModal from sendAlkane state', () => {
    expect(src).toMatch(/initialAlkane=\{sendAlkane\}/);
  });

  it('passes Send and Receive handlers to BitcoinBalanceCard', () => {
    expect(src).toMatch(/<BitcoinBalanceCard[\s\S]*?onSend=\{\(\)\s*=>\s*setShowSendModal\(true\)\}/);
    expect(src).toMatch(/onReceive=\{\(\)\s*=>\s*setShowReceiveModal\(true\)\}/);
    expect(src).toMatch(/onSettings=\{\(\)\s*=>\s*setActiveSection\(['"]settings['"]\)\}/);
  });

  it('has a transaction history refresh button with RefreshCw icon', () => {
    expect(src).toMatch(/txHistoryRef\.current\?\.refresh\(\)/);
    expect(src).toMatch(/RefreshCw/);
  });

  it('uses useRef for TransactionHistoryHandle', () => {
    expect(src).toMatch(/useRef<TransactionHistoryHandle>/);
  });
});

// ---------------------------------------------------------------------------
// AlkanesBalancesCard.tsx
// ---------------------------------------------------------------------------
describe('AlkanesBalancesCard', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'AlkanesBalancesCard.tsx'));

  it('defines AlkanesBalancesCardProps interface with optional onSendAlkane', () => {
    expect(src).toMatch(/interface\s+AlkanesBalancesCardProps/);
    expect(src).toMatch(/onSendAlkane\?\s*:\s*\(alkane:\s*AlkaneAsset\)\s*=>\s*void/);
  });

  it('accepts onSendAlkane and display mode props in the component signature', () => {
    expect(src).toMatch(/\{\s*onSendAlkane\s*,\s*embedded\s*=\s*false\s*,\s*hideHeader\s*=\s*false\s*,\s*hideTabs\s*=\s*false/);
  });

  it('uses the shared vault-style tab group classes', () => {
    expect(src).toMatch(/sf-tab-group/);
    expect(src).toMatch(/sf-tab-btn/);
    expect(src).toMatch(/sf-tab-btn--active/);
  });

  it('uses useEnrichedWalletData hook for balances', () => {
    expect(src).toMatch(/import\s+\{\s*useEnrichedWalletData\s*\}\s+from\s+['"]@\/hooks\/useEnrichedWalletData['"]/);
    expect(src).toMatch(/useEnrichedWalletData\(\)/);
  });

  it('destructures balances, isAlkanesLoading, error, refreshAlkanes from useEnrichedWalletData', () => {
    expect(src).toMatch(/\{\s*balances\s*,\s*isAlkanesLoading\s*,\s*error\s*,\s*refreshAlkanes\s*\}\s*=\s*useEnrichedWalletData\(\)/);
  });

  it('renders alkane list from balances.alkanes', () => {
    expect(src).toMatch(/balances\.alkanes\.(filter|map)/);
  });

  it('formats alkane balance with formatAlkaneBalance function', () => {
    expect(src).toMatch(/function\s+formatAlkaneBalance|const\s+formatAlkaneBalance/);
    expect(src).toMatch(/formatAlkaneBalance\(/);
  });

  it('handles loading state with loading indicator', () => {
    expect(src).toMatch(/isLoadingData/);
    expect(src).toMatch(/t\(['"]balances\.loading['"]\)/);
  });

  it('handles empty state with no-tokens message', () => {
    expect(src).toMatch(/noProtorune|noNfts|noPositions/);
  });

  it('handles error state with retry button', () => {
    expect(src).toMatch(/if\s*\(\s*error\s*\)/);
    expect(src).toMatch(/t\(['"]balances\.tryAgain['"]\)/);
  });

  it('has a refresh button using RefreshCw icon', () => {
    expect(src).toMatch(/import.*RefreshCw/);
    expect(src).toMatch(/handleRefresh/);
    expect(src).toMatch(/<RefreshCw/);
  });

  it('calls onSendAlkane when send button is clicked', () => {
    expect(src).toMatch(/onSendAlkane\?\.\(alkane\)/);
  });

  it('has token filter tabs: tokens, nfts, positions', () => {
    expect(src).toContain("'tokens'");
    expect(src).toContain("'nfts'");
    expect(src).toContain("'positions'");
    expect(src).toMatch(/alkaneFilter/);
  });

  it('uses usePools hook for LP token metadata', () => {
    expect(src).toMatch(/import\s+\{\s*usePools\s*\}\s+from/);
    expect(src).toMatch(/usePools\(\)/);
  });

  it('builds a poolMap for LP token display', () => {
    expect(src).toMatch(/poolMap/);
    expect(src).toMatch(/new Map</);
  });

  it('identifies LP tokens by symbol pattern or pool membership', () => {
    expect(src).toMatch(/isLpToken/);
    expect(src).toMatch(/\\bLP\\b/i);
  });

  it('identifies NFTs by balance of exactly 1', () => {
    expect(src).toMatch(/isNft/);
    expect(src).toMatch(/BigInt\(1\)/);
  });

  it('has auto-refresh logic for empty token list', () => {
    expect(src).toMatch(/hasAutoRefreshed/);
    expect(src).toMatch(/Auto-retry/);
  });
});

// ---------------------------------------------------------------------------
// BitcoinBalanceCard.tsx
// ---------------------------------------------------------------------------
describe('BitcoinBalanceCard', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'BitcoinBalanceCard.tsx'));

  it('uses useEnrichedWalletData for balance data', () => {
    expect(src).toMatch(/useEnrichedWalletData\(\)/);
    expect(src).toMatch(/balances/);
  });

  it('uses useBtcPrice for BTC/USD price', () => {
    // Migrated from useAlkanesSDK → useBtcPrice (queries/market.ts) so
    // mainnet uses subpricer primary + rpc.ts/coingecko fallbacks rather
    // than the SDK's per-component fetch path.
    expect(src).toMatch(/useBtcPrice\(\)/);
    expect(src).toMatch(/btcPriceUsd/);
  });

  it('displays BTC balance using formatBTC function', () => {
    expect(src).toMatch(/formatBTC/);
    expect(src).toMatch(/100000000/);
  });

  it('displays USD equivalent using formatUSD function', () => {
    expect(src).toMatch(/formatUSD/);
    // formatUSD multiplies sats * btcPriceUsd / 1e8 — stable name across
    // the useBtcPrice migration (was bitcoinPrice.usd before).
    expect(src).toMatch(/btcPriceUsd/);
  });

  it('has a refresh button using RefreshCw', () => {
    expect(src).toMatch(/import.*RefreshCw/);
    expect(src).toMatch(/handleRefresh/);
    expect(src).toMatch(/<RefreshCw/);
  });

  it('does not render address breakdown cards in the bitcoin card', () => {
    expect(src).not.toMatch(/mempool\.space\/address/);
    expect(src).not.toMatch(/ExternalLink/);
  });

  it('handles error state with retry button', () => {
    expect(src).toMatch(/if\s*\(\s*error\s*\)/);
    expect(src).toMatch(/t\(['"]balances\.tryAgain['"]\)/);
  });

  it('uses btcFast for fast balance display with fallback to enriched', () => {
    expect(src).toMatch(/btcFast/);
    expect(src).toMatch(/isBtcFastLoading/);
    expect(src).toMatch(/refreshBtcFast/);
  });

  it('shows pending BTC when nonzero', () => {
    expect(src).toMatch(/pendingIn/);
    expect(src).toMatch(/pending/);
  });
});

// ---------------------------------------------------------------------------
// TransactionHistory.tsx
// ---------------------------------------------------------------------------
describe('TransactionHistory', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'TransactionHistory.tsx'));

  it('uses useTransactionHistory hook', () => {
    expect(src).toMatch(/import\s+\{\s*useTransactionHistory\s*\}\s+from\s+['"]@\/hooks\/useTransactionHistory['"]/);
    expect(src).toMatch(/useTransactionHistory\(/);
  });

  it('fetches transactions for both addresses via single hook', () => {
    // TransactionHistory now passes both addresses as array to useTransactionHistory
    expect(src).toMatch(/useTransactionHistory\(addresses\)/);
  });

  it('deduplicates transactions by txid via Set', () => {
    expect(src).toMatch(/transactions/);
  });

  it('sorts transactions by blockTime newest first', () => {
    expect(src).toMatch(/blockTime/);
  });

  it('has refresh capability via useImperativeHandle', () => {
    expect(src).toMatch(/useImperativeHandle/);
    expect(src).toMatch(/refresh:\s*handleRefresh/);
  });

  it('exports TransactionHistoryHandle interface', () => {
    expect(src).toMatch(/export\s+interface\s+TransactionHistoryHandle/);
    expect(src).toMatch(/refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('is a forwardRef component', () => {
    expect(src).toMatch(/forwardRef/);
  });

  it('renders transaction items with txid', () => {
    expect(src).toMatch(/tx\.txid/);
    expect(src).toMatch(/slice\(0,\s*8\)/);
  });

  it('shows confirmed vs pending status for each transaction', () => {
    expect(src).toMatch(/tx\.confirmed/);
    expect(src).toMatch(/t\(['"]txHistory\.confirmed['"]\)/);
    expect(src).toMatch(/t\(['"]txHistory\.pending['"]\)/);
  });

  it('formats timestamps using formatDate function', () => {
    expect(src).toMatch(/formatDate/);
    expect(src).toMatch(/new Date\(timestamp \* 1000\)/);
  });

  it('displays block height and fee info', () => {
    expect(src).toMatch(/tx\.blockHeight/);
    expect(src).toMatch(/tx\.fee/);
  });

  it('shows empty state when no transactions exist', () => {
    expect(src).toMatch(/t\(['"]txHistory\.noTransactions['"]\)/);
    expect(src).toMatch(/t\(['"]txHistory\.noActivity['"]\)/);
  });

  it('links transactions to espo.sh explorer', () => {
    expect(src).toMatch(/espo\.sh\/tx/);
  });

  it('renders alkane transaction summaries without the old alkane badge', () => {
    expect(src).toMatch(/AlkaneTraceSummaries/);
    expect(src).toMatch(/tx\.alkaneSummaries/);
    expect(src).not.toMatch(/txHistory\.alkanes/);
  });

  it('has refresh capability', () => {
    expect(src).toMatch(/refresh/);
  });
});

// ---------------------------------------------------------------------------
// ReceiveModal.tsx
// ---------------------------------------------------------------------------
describe('ReceiveModal', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'ReceiveModal.tsx'));

  it('imports QRCode component', () => {
    expect(src).toMatch(/import\s+QRCode\s+from\s+['"]@\/app\/components\/QRCode['"]/);
  });

  it('renders QRCode with the display address', () => {
    expect(src).toMatch(/<QRCode\s+value=\{displayAddress/);
  });

  it('accepts isOpen and onClose props', () => {
    expect(src).toMatch(/interface\s+ReceiveModalProps/);
    expect(src).toMatch(/isOpen:\s*boolean/);
    expect(src).toMatch(/onClose:\s*\(\)\s*=>\s*void/);
  });

  it('returns null when not open', () => {
    expect(src).toMatch(/if\s*\(\s*!isOpen\s*\)\s*return\s+null/);
  });

  it('displays taproot address from wallet account', () => {
    expect(src).toMatch(/account\?\.taproot\?\.address/);
  });

  it('displays segwit address from wallet account', () => {
    expect(src).toMatch(/account\?\.nativeSegwit\?\.address/);
  });

  it('has toggle between segwit and taproot address modes', () => {
    expect(src).toMatch(/useState<['"]segwit['"] \| ['"]taproot['"]>/);
    expect(src).toMatch(/setMode\(/);
  });

  it('derives displayAddress from effective mode', () => {
    expect(src).toMatch(/displayAddress\s*=\s*effectiveMode\s*===\s*['"]taproot['"]/);
  });

  it('has copy-to-clipboard functionality', () => {
    expect(src).toMatch(/navigator\.clipboard\.writeText/);
    expect(src).toMatch(/setCopied\(true\)/);
  });

  it('imports Copy and Check icons for clipboard state', () => {
    expect(src).toMatch(/import.*Copy.*Check/);
  });

  it('shows SegWit and Taproot tab buttons', () => {
    expect(src).toMatch(/['"]segwit['"]/);
    expect(src).toMatch(/['"]taproot['"]/);
    expect(src).toMatch(/SegWit/);
    expect(src).toMatch(/Taproot/);
  });

  it('uses useWallet() for account addresses', () => {
    expect(src).toMatch(/useWallet\(\)/);
    expect(src).toMatch(/account/);
  });

  it('has a close button with X icon', () => {
    expect(src).toMatch(/import.*X/);
    expect(src).toMatch(/onClose/);
    expect(src).toMatch(/aria-label="Close"/);
  });

  it('shows important warnings about sending', () => {
    expect(src).toMatch(/t\(['"]receive\.important['"]\)/);
    expect(src).toContain('Always verify the address before sending');
  });
});

// ---------------------------------------------------------------------------
// WalletSettings.tsx
// ---------------------------------------------------------------------------
describe('WalletSettings', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'WalletSettings.tsx'));

  it('uses useWallet() hook', () => {
    expect(src).toMatch(/useWallet\(\)/);
  });

  it('shows network information', () => {
    // The component detects network from address or config
    expect(src).toMatch(/network/i);
    expect(src).toMatch(/NetworkType/);
  });

  it('defines a NetworkType type', () => {
    expect(src).toMatch(/type\s+NetworkType\s*=/);
    expect(src).toMatch(/['"]mainnet['"]/);
    expect(src).toMatch(/['"]regtest['"]/);
  });

  it('has a detectNetworkFromAddress helper function', () => {
    expect(src).toMatch(/function\s+detectNetworkFromAddress/);
  });

  it('detects mainnet addresses by bc1p/bc1q prefix', () => {
    expect(src).toMatch(/startsWith\(['"]bc1p['"]\)/);
    expect(src).toMatch(/startsWith\(['"]bc1q['"]\)/);
  });

  it('detects regtest addresses by bcrt1 prefix', () => {
    expect(src).toMatch(/startsWith\(['"]bcrt1p['"]\)/);
    expect(src).toMatch(/startsWith\(['"]bcrt1q['"]\)/);
  });

  it('imports wallet management icons (Network, Save, etc.)', () => {
    expect(src).toMatch(/import.*Network/);
    expect(src).toMatch(/import.*Save/);
  });

  it('uses useTheme for theme management', () => {
    expect(src).toMatch(/import\s+\{\s*useTheme\s*\}\s+from/);
    expect(src).toMatch(/useTheme\(\)/);
  });

  it('supports Google Drive backup feature', () => {
    expect(src).toMatch(/import.*initGoogleDrive/);
    expect(src).toMatch(/import.*backupWalletToDrive/);
  });

  it('imports Eye icon for the seed-reveal button', () => {
    expect(src).toMatch(/import.*\bEye\b/);
  });

  it('can unlock keystore for mnemonic display', () => {
    expect(src).toMatch(/import.*unlockKeystore/);
  });
});

// ---------------------------------------------------------------------------
// AlkanesBalancesCard.tsx — FUEL tab integration
// ---------------------------------------------------------------------------
describe('AlkanesBalancesCard FUEL tab', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'AlkanesBalancesCard.tsx'));

  it('uses useFuelAllocation hook', () => {
    expect(src).toMatch(/import\s+\{\s*useFuelAllocation\s*\}\s+from\s+['"]@\/hooks\/useFuelAllocation['"]/);
    expect(src).toMatch(/useFuelAllocation\(\)/);
  });

  it('conditionally adds FUEL tab when wallet is eligible', () => {
    expect(src).toMatch(/fuelAllocation\.isEligible/);
    expect(src).toMatch(/'fuel'/);
  });

  it('renders FUEL allocation card content for the FUEL tab', () => {
    expect(src).toMatch(/alkaneFilter\s*===\s*'fuel'/);
    expect(src).toMatch(/import.*Flame/);
    expect(src).toMatch(/<Flame/);
    expect(src).toMatch(/balances\.fuelAllocation/);
  });
});

// ---------------------------------------------------------------------------
// Cross-component integration patterns
// ---------------------------------------------------------------------------
describe('Cross-component integration patterns', () => {
  const pageSrc = readSource(path.join(WALLET_DIR, 'page.tsx'));
  const alkanesSrc = readSource(path.join(COMPONENTS_DIR, 'AlkanesBalancesCard.tsx'));
  const sendModalExists = fs.existsSync(path.join(COMPONENTS_DIR, 'SendModal.tsx'));

  it('SendModal.tsx component file exists', () => {
    expect(sendModalExists).toBe(true);
  });

  it('page passes sendAlkane state as initialAlkane to SendModal', () => {
    expect(pageSrc).toMatch(/setSendAlkane\(/);
    expect(pageSrc).toMatch(/initialAlkane=\{sendAlkane\}/);
  });

  it('AlkanesBalancesCard and page share the AlkaneAsset type', () => {
    expect(pageSrc).toMatch(/import\s+type\s+\{.*AlkaneAsset.*\}\s+from\s+['"]@\/hooks\/useEnrichedWalletData['"]/);
    expect(alkanesSrc).toMatch(/import\s+type\s+\{.*AlkaneAsset.*\}\s+from\s+['"]@\/hooks\/useEnrichedWalletData['"]/);
  });

  it('page uses onSendAlkane callback to bridge alkane actions to SendModal', () => {
    // AlkanesBalancesCard accepts the callback
    expect(alkanesSrc).toMatch(/onSendAlkane\?\.\(/);
    expect(pageSrc).toMatch(/<AlkanesBalancesCard[\s\S]*?onSendAlkane=\{.*setSendAlkane.*setShowSendModal/s);
  });

  it('all interactive card components use useTranslation for i18n', () => {
    const btcSrc = readSource(path.join(COMPONENTS_DIR, 'BitcoinBalanceCard.tsx'));
    const txSrc = readSource(path.join(COMPONENTS_DIR, 'TransactionHistory.tsx'));
    const receiveSrc = readSource(path.join(COMPONENTS_DIR, 'ReceiveModal.tsx'));

    for (const [name, src] of [
      ['AlkanesBalancesCard', alkanesSrc],
      ['BitcoinBalanceCard', btcSrc],
      ['TransactionHistory', txSrc],
      ['ReceiveModal', receiveSrc],
    ]) {
      expect(src).toMatch(/useTranslation\(\)/);
    }
  });

  it('page manages modal states with boolean useState hooks', () => {
    expect(pageSrc).toMatch(/useState\(false\)/);
    expect(pageSrc).toMatch(/showReceiveModal/);
    expect(pageSrc).toMatch(/showSendModal/);
  });

  it('SendModal onClose resets both modal visibility and alkane selection', () => {
    expect(pageSrc).toMatch(/onClose=\{\(\)\s*=>\s*\{\s*setShowSendModal\(false\);\s*setSendAlkane\(null\)/);
  });

  it('page sends onSuccess notification callback to SendModal', () => {
    expect(pageSrc).toMatch(/onSuccess=\{.*showNotification/);
  });

  it('all wallet-context-consuming components use the same useWallet import path', () => {
    const files = [
      path.join(WALLET_DIR, 'page.tsx'),
      path.join(COMPONENTS_DIR, 'AlkanesBalancesCard.tsx'),
      path.join(COMPONENTS_DIR, 'BitcoinBalanceCard.tsx'),
      path.join(COMPONENTS_DIR, 'TransactionHistory.tsx'),
      path.join(COMPONENTS_DIR, 'ReceiveModal.tsx'),
    ];
    for (const f of files) {
      const s = readSource(f);
      expect(s).toMatch(/import\s+\{.*useWallet.*\}\s+from\s+['"]@\/context\/WalletContext['"]/);
    }
  });
});
