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

  it('imports AlkanesBalancesCard component', () => {
    expect(src).toMatch(/import\s+AlkanesBalancesCard\s+from\s+['"]\.\/components\/AlkanesBalancesCard['"]/);
  });

  it('imports TransactionHistory component', () => {
    expect(src).toMatch(/import\s+TransactionHistory/);
  });

  it('imports BalancesPanel component', () => {
    expect(src).toMatch(/import\s+BalancesPanel\s+from\s+['"]\.\/components\/BalancesPanel['"]/);
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

  it('has a Send button that opens the SendModal', () => {
    // The handler sets showSendModal to true
    expect(src).toMatch(/onClick=\{.*setShowSendModal\(true\)/);
  });

  it('has a Receive button that opens the ReceiveModal', () => {
    expect(src).toMatch(/onClick=\{.*setShowReceiveModal\(true\)/);
  });

  it('renders SendModal with isOpen tied to showSendModal state', () => {
    expect(src).toMatch(/<SendModal[\s\S]*?isOpen=\{showSendModal\}/);
  });

  it('renders ReceiveModal with isOpen tied to showReceiveModal state', () => {
    expect(src).toMatch(/<ReceiveModal[\s\S]*?isOpen=\{showReceiveModal\}/);
  });

  it('passes onSendAlkane callback to AlkanesBalancesCard', () => {
    expect(src).toMatch(/<AlkanesBalancesCard\s+onSendAlkane=/);
  });

  it('onSendAlkane callback sets sendAlkane state and opens SendModal', () => {
    // The callback does both: setSendAlkane(alkane) and setShowSendModal(true)
    expect(src).toMatch(/onSendAlkane=\{.*setSendAlkane\(/);
    expect(src).toMatch(/onSendAlkane=\{.*setShowSendModal\(true\)/);
  });

  it('has a connection guard that redirects when not connected', () => {
    expect(src).toMatch(/if\s*\(\s*!walletConnected\s*\)/);
    expect(src).toMatch(/router\.push\(['"]\/['"]\)/);
    expect(src).toMatch(/return\s+null/);
  });

  it('derives walletConnected from connected or isConnected', () => {
    expect(src).toMatch(/walletConnected\s*=.*connected.*isConnected/);
  });

  it('has tab-based navigation including balances, transactions, and settings', () => {
    expect(src).toContain("'balances'");
    expect(src).toContain("'transactions'");
    expect(src).toContain("'settings'");
  });

  it('conditionally renders tab content based on activeTab', () => {
    expect(src).toMatch(/activeTab\s*===\s*['"]balances['"]\s*&&\s*<BalancesPanel/);
    expect(src).toMatch(/activeTab\s*===\s*['"]transactions['"]\s*&&\s*<TransactionHistory/);
    expect(src).toMatch(/activeTab\s*===\s*['"]settings['"]\s*&&\s*<WalletSettings/);
  });

  it('passes initialAlkane prop to SendModal from sendAlkane state', () => {
    expect(src).toMatch(/initialAlkane=\{sendAlkane\}/);
  });

  it('renders BitcoinBalanceCard without props', () => {
    expect(src).toMatch(/<BitcoinBalanceCard\s*\/>/);
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

  it('accepts onSendAlkane prop in the component signature', () => {
    expect(src).toMatch(/\{\s*onSendAlkane\s*\}\s*:\s*AlkanesBalancesCardProps/);
  });

  it('uses useEnrichedWalletData hook for balances', () => {
    expect(src).toMatch(/import\s+\{\s*useEnrichedWalletData\s*\}\s+from\s+['"]@\/hooks\/useEnrichedWalletData['"]/);
    expect(src).toMatch(/useEnrichedWalletData\(\)/);
  });

  it('destructures balances, isLoading, error, refresh from useEnrichedWalletData', () => {
    expect(src).toMatch(/\{\s*balances\s*,\s*isLoading\s*,\s*error\s*,\s*refresh\s*\}\s*=\s*useEnrichedWalletData\(\)/);
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
    expect(src).toMatch(/Auto-refreshing alkanes after 15s/);
  });
});

// ---------------------------------------------------------------------------
// BitcoinBalanceCard.tsx
// ---------------------------------------------------------------------------
describe('BitcoinBalanceCard', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'BitcoinBalanceCard.tsx'));

  it('uses useWallet() for account data', () => {
    expect(src).toMatch(/useWallet\(\)/);
    expect(src).toMatch(/account/);
  });

  it('uses useEnrichedWalletData for balance data', () => {
    expect(src).toMatch(/useEnrichedWalletData\(\)/);
    expect(src).toMatch(/balances/);
  });

  it('uses useAlkanesSDK for bitcoinPrice', () => {
    expect(src).toMatch(/useAlkanesSDK\(\)/);
    expect(src).toMatch(/bitcoinPrice/);
  });

  it('displays BTC balance using formatBTC function', () => {
    expect(src).toMatch(/formatBTC/);
    expect(src).toMatch(/100000000/);
  });

  it('displays USD equivalent using formatUSD function', () => {
    expect(src).toMatch(/formatUSD/);
    expect(src).toMatch(/bitcoinPrice\.usd/);
  });

  it('shows both SegWit and Taproot address sections', () => {
    expect(src).toMatch(/nativeSegwit/i);
    expect(src).toMatch(/taproot/i);
    expect(src).toMatch(/Native SegWit/);
  });

  it('shows SegWit (p2wpkh) balance', () => {
    expect(src).toMatch(/balances\.bitcoin\.p2wpkh/);
  });

  it('shows Taproot (p2tr) balance', () => {
    expect(src).toMatch(/balances\.bitcoin\.p2tr/);
  });

  it('has a refresh button using RefreshCw', () => {
    expect(src).toMatch(/import.*RefreshCw/);
    expect(src).toMatch(/handleRefresh/);
    expect(src).toMatch(/<RefreshCw/);
  });

  it('links to mempool.space for address exploration', () => {
    expect(src).toMatch(/mempool\.space\/address/);
  });

  it('uses ExternalLink icon for mempool links', () => {
    expect(src).toMatch(/import.*ExternalLink/);
    expect(src).toMatch(/<ExternalLink/);
  });

  it('handles error state with retry button', () => {
    expect(src).toMatch(/if\s*\(\s*error\s*\)/);
    expect(src).toMatch(/t\(['"]balances\.tryAgain['"]\)/);
  });

  it('shows pending BTC differences when nonzero', () => {
    expect(src).toMatch(/pendingDiff/);
    expect(src).toMatch(/pending/);
  });

  it('adjusts confirmed balance to account for pending outgoing', () => {
    expect(src).toMatch(/adjustedConfirmed\s*=\s*balances\.bitcoin\.total\s*\+\s*balances\.bitcoin\.pendingOutgoingTotal/);
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

  it('fetches transactions for both p2wpkh and p2tr addresses', () => {
    expect(src).toMatch(/p2wpkhAddress/);
    expect(src).toMatch(/p2trAddress/);
    expect(src).toMatch(/useTransactionHistory\(p2wpkhAddress\)/);
    expect(src).toMatch(/useTransactionHistory\(p2trAddress\)/);
  });

  it('merges and deduplicates transactions by txid', () => {
    expect(src).toMatch(/\[\.\.\.p2wpkhTxs,\s*\.\.\.p2trTxs\]/);
    expect(src).toMatch(/\.filter\(/);
    expect(src).toMatch(/findIndex/);
  });

  it('sorts transactions by blockTime newest first', () => {
    expect(src).toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*\(b\.blockTime/);
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

  it('shows alkanes badge for transactions with protostones', () => {
    expect(src).toMatch(/tx\.hasProtostones/);
    expect(src).toMatch(/Zap/);
  });

  it('refreshes both address histories in parallel', () => {
    expect(src).toMatch(/Promise\.all\(\[[\s\S]*?refreshP2wpkh\(\)[\s\S]*?refreshP2tr\(\)/);
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

  it('derives displayAddress from current mode', () => {
    expect(src).toMatch(/displayAddress\s*=\s*mode\s*===\s*['"]taproot['"]/);
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
    expect(src).toMatch(/t\(['"]receive\.verifyAddress['"]\)/);
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

  it('imports wallet management icons (Key, Save, etc.)', () => {
    expect(src).toMatch(/import.*Network/);
    expect(src).toMatch(/import.*Key/);
  });

  it('uses useTheme for theme management', () => {
    expect(src).toMatch(/import\s+\{\s*useTheme\s*\}\s+from/);
    expect(src).toMatch(/useTheme\(\)/);
  });

  it('has derivation configuration support', () => {
    expect(src).toMatch(/interface\s+DerivationConfig/);
    expect(src).toMatch(/accountIndex/);
    expect(src).toMatch(/changeIndex/);
    expect(src).toMatch(/addressIndex/);
  });

  it('supports Google Drive backup feature', () => {
    expect(src).toMatch(/import.*initGoogleDrive/);
    expect(src).toMatch(/import.*backupWalletToDrive/);
  });

  it('has password visibility toggle functionality', () => {
    expect(src).toMatch(/import.*Eye.*EyeOff/);
  });

  it('can unlock keystore for mnemonic display', () => {
    expect(src).toMatch(/import.*unlockKeystore/);
  });
});

// ---------------------------------------------------------------------------
// BalancesPanel.tsx
// ---------------------------------------------------------------------------
describe('BalancesPanel', () => {
  const src = readSource(path.join(COMPONENTS_DIR, 'BalancesPanel.tsx'));

  it('uses useDemoGate() for feature gating', () => {
    expect(src).toMatch(/import\s+\{\s*useDemoGate\s*\}\s+from\s+['"]@\/hooks\/useDemoGate['"]/);
    expect(src).toMatch(/useDemoGate\(\)/);
  });

  it('assigns isDemoGated from useDemoGate', () => {
    expect(src).toMatch(/isDemoGated\s*=\s*useDemoGate\(\)/);
  });

  it('uses useWallet() for network info', () => {
    expect(src).toMatch(/useWallet\(\)/);
    expect(src).toMatch(/network/);
  });

  it('has tab structure for inscription asset types: brc20, runes, ordinals', () => {
    expect(src).toContain("'brc20'");
    expect(src).toContain("'runes'");
    expect(src).toContain("'ordinals'");
    expect(src).toMatch(/inscriptionFilter/);
  });

  it('uses useState for inscription filter state', () => {
    expect(src).toMatch(/useState<['"]brc20['"] \| ['"]runes['"] \| ['"]ordinals['"]>/);
  });

  it('shows coming soon messages for inscription tabs', () => {
    expect(src).toMatch(/brc20ComingSoon/);
    expect(src).toMatch(/runesComingSoon/);
    expect(src).toMatch(/ordinalsComingSoon/);
  });

  it('uses useFuelAllocation hook', () => {
    expect(src).toMatch(/import\s+\{\s*useFuelAllocation\s*\}\s+from\s+['"]@\/hooks\/useFuelAllocation['"]/);
    expect(src).toMatch(/useFuelAllocation\(\)/);
  });

  it('conditionally renders FUEL allocation section for eligible wallets', () => {
    expect(src).toMatch(/fuelAllocation\.isEligible/);
    expect(src).toMatch(/FUEL/);
  });

  it('uses Flame icon for FUEL allocation display', () => {
    expect(src).toMatch(/import.*Flame/);
    expect(src).toMatch(/<Flame/);
  });

  it('uses useTranslation for i18n', () => {
    expect(src).toMatch(/useTranslation\(\)/);
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

  it('page uses onSendAlkane callback to bridge AlkanesBalancesCard actions to SendModal', () => {
    // AlkanesBalancesCard accepts the callback
    expect(alkanesSrc).toMatch(/onSendAlkane\?\.\(/);
    // page.tsx wires it to set state + open modal
    expect(pageSrc).toMatch(/onSendAlkane=\{.*setSendAlkane.*setShowSendModal/s);
  });

  it('all card components use useTranslation for i18n', () => {
    const btcSrc = readSource(path.join(COMPONENTS_DIR, 'BitcoinBalanceCard.tsx'));
    const txSrc = readSource(path.join(COMPONENTS_DIR, 'TransactionHistory.tsx'));
    const receiveSrc = readSource(path.join(COMPONENTS_DIR, 'ReceiveModal.tsx'));
    const balanceSrc = readSource(path.join(COMPONENTS_DIR, 'BalancesPanel.tsx'));

    for (const [name, src] of [
      ['AlkanesBalancesCard', alkanesSrc],
      ['BitcoinBalanceCard', btcSrc],
      ['TransactionHistory', txSrc],
      ['ReceiveModal', receiveSrc],
      ['BalancesPanel', balanceSrc],
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
      path.join(COMPONENTS_DIR, 'BalancesPanel.tsx'),
    ];
    for (const f of files) {
      const s = readSource(f);
      expect(s).toMatch(/import\s+\{.*useWallet.*\}\s+from\s+['"]@\/context\/WalletContext['"]/);
    }
  });
});
