/**
 * Source-analysis tests for wallet data hooks:
 *   - useEnrichedWalletData
 *   - useDemoGate
 *   - useFuelAllocation
 *   - useTransactionHistory
 *   - useBtcBalance
 *   - useLPPositions
 *
 * These tests read source files and verify structural contracts, type exports,
 * query plumbing, and safety invariants WITHOUT rendering React components.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = path.resolve(__dirname, '../..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8');
}

// ---------------------------------------------------------------------------
// useEnrichedWalletData
// ---------------------------------------------------------------------------

describe('useEnrichedWalletData', () => {
  const src = readSrc('hooks/useEnrichedWalletData.ts');
  const querySrc = readSrc('queries/account.ts');

  // --- Hook structure ---

  it('imports useWallet for address access', () => {
    expect(src).toContain("useWallet");
    expect(src).toContain("@/context/WalletContext");
  });

  it('imports useAlkanesSDK for provider', () => {
    expect(src).toContain("useAlkanesSDK");
    expect(src).toContain("@/context/AlkanesSDKContext");
  });

  it('uses useQuery from @tanstack/react-query', () => {
    expect(src).toContain("useQuery");
    expect(src).toContain("@tanstack/react-query");
  });

  it('uses enrichedWalletQueryOptions from queries/account', () => {
    expect(src).toContain("enrichedWalletQueryOptions");
    expect(src).toContain("@/queries/account");
  });

  it('destructures isConnected and account from useWallet', () => {
    expect(src).toMatch(/const\s*\{[^}]*account[^}]*isConnected[^}]*\}\s*=\s*useWallet/);
  });

  it('provides a refresh callback wrapping refetch', () => {
    expect(src).toContain('useCallback');
    expect(src).toMatch(/refresh\s*=\s*useCallback\s*\(\s*async\s*\(\)\s*=>\s*\{/);
    expect(src).toContain('refetch');
  });

  // --- Return shape ---

  it('returns balances, utxos, isLoading, error, and refresh', () => {
    expect(src).toContain('balances:');
    expect(src).toContain('utxos:');
    expect(src).toContain('isLoading');
    expect(src).toContain('error:');
    expect(src).toContain('refresh');
  });

  it('falls back to EMPTY_BALANCES when data is null', () => {
    expect(src).toContain('EMPTY_BALANCES');
    expect(src).toMatch(/data\?\.balances\s*\?\?\s*EMPTY_BALANCES/);
  });

  it('falls back to EMPTY_UTXOS when data is null', () => {
    expect(src).toContain('EMPTY_UTXOS');
    expect(src).toMatch(/data\?\.utxos\s*\?\?\s*EMPTY_UTXOS/);
  });

  // --- Type exports ---

  it('exports AlkaneAsset interface with required fields', () => {
    expect(src).toContain('export interface AlkaneAsset');
    expect(src).toContain('alkaneId: string');
    expect(src).toContain('name: string');
    expect(src).toContain('symbol: string');
    expect(src).toContain('balance: string');
    expect(src).toContain('decimals: number');
  });

  it('exports EnrichedUTXO interface with txid, vout, value, address, status', () => {
    expect(src).toContain('export interface EnrichedUTXO');
    expect(src).toContain('txid: string');
    expect(src).toContain('vout: number');
    expect(src).toContain('value: number');
    expect(src).toContain('address: string');
    expect(src).toContain('confirmed: boolean');
  });

  it('exports WalletBalances with bitcoin and alkanes sections', () => {
    expect(src).toContain('export interface WalletBalances');
    expect(src).toContain('bitcoin:');
    expect(src).toContain('alkanes: AlkaneAsset[]');
  });

  it('exports EnrichedWalletData interface', () => {
    expect(src).toContain('export interface EnrichedWalletData');
    expect(src).toContain('balances: WalletBalances');
    expect(src).toContain('isLoading: boolean');
    expect(src).toContain('error: string | null');
    expect(src).toContain('refresh: () => Promise<void>');
  });

  it('WalletBalances bitcoin section has p2wpkh, p2tr, total, spendable, pending fields', () => {
    expect(src).toContain('p2wpkh: number');
    expect(src).toContain('p2tr: number');
    expect(src).toContain('total: number');
    expect(src).toContain('spendable: number');
    expect(src).toContain('pendingP2wpkh: number');
    expect(src).toContain('pendingP2tr: number');
    expect(src).toContain('pendingTotal: number');
  });

  it('EnrichedUTXO has optional alkanes, inscriptions, and runes fields', () => {
    expect(src).toMatch(/alkanes\?:/);
    expect(src).toMatch(/inscriptions\?:/);
    expect(src).toMatch(/runes\?:/);
  });

  // --- EMPTY defaults ---

  it('EMPTY_BALANCES has zeroed bitcoin and empty alkanes/runes arrays', () => {
    expect(src).toContain('p2wpkh: 0, p2tr: 0, total: 0, spendable: 0');
    expect(src).toContain('alkanes: []');
    expect(src).toContain('runes: []');
  });

  it('EMPTY_UTXOS has p2wpkh, p2tr, and all as empty arrays', () => {
    expect(src).toMatch(/EMPTY_UTXOS\s*=\s*\{/);
    expect(src).toContain('p2wpkh: []');
    expect(src).toContain('p2tr: []');
    expect(src).toContain('all: []');
  });

  // --- Error formatting ---

  it('formats error as string or fallback message', () => {
    expect(src).toContain('error instanceof Error');
    expect(src).toContain('error.message');
    expect(src).toContain("'Failed to fetch wallet data'");
  });

  // --- Query options plumbing (queries/account.ts) ---

  describe('enrichedWalletQueryOptions (queries/account.ts)', () => {
    it('collects addresses from both nativeSegwit and taproot', () => {
      expect(querySrc).toContain('account?.nativeSegwit?.address');
      expect(querySrc).toContain('account?.taproot?.address');
    });

    it('sorts addresses for stable cache key', () => {
      expect(querySrc).toContain('addresses.sort().join');
    });

    it('query is enabled only when initialized, provider, account, connected, and addresses present', () => {
      expect(querySrc).toContain('deps.isInitialized');
      expect(querySrc).toContain('!!deps.provider');
      expect(querySrc).toContain('!!deps.account');
      expect(querySrc).toContain('deps.isConnected');
      expect(querySrc).toContain('addresses.length > 0');
    });

    it('uses queryKeys.account.enrichedWallet for the key', () => {
      expect(querySrc).toContain('queryKeys.account.enrichedWallet');
    });

    it('has withTimeout helper for resilience against slow RPC', () => {
      expect(querySrc).toContain('withTimeout');
      expect(querySrc).toContain('Request timed out');
    });

    it('calls provider.getEnrichedBalances for UTXO data', () => {
      expect(querySrc).toContain('provider.getEnrichedBalances(address)');
    });

    it('has esplora fallback when getEnrichedBalances fails', () => {
      expect(querySrc).toContain('fetchUtxosViaEsplora');
      expect(querySrc).toContain('esplora fallback');
    });

    it('fetches alkane balances via /api/alkane-balances endpoint', () => {
      expect(querySrc).toContain('/api/alkane-balances');
    });

    it('aggregates alkane balances across multiple addresses using BigInt', () => {
      expect(querySrc).toContain('BigInt(existing.balance)');
      expect(querySrc).toContain('BigInt(amountStr)');
    });

    it('processes spendable, assets, and pending UTXO categories', () => {
      expect(querySrc).toContain('data.spendable');
      expect(querySrc).toContain('data.assets');
      expect(querySrc).toContain('data.pending');
    });

    it('tracks pending outgoing BTC via mempool spent fetch', () => {
      expect(querySrc).toContain('fetchMempoolSpent');
      expect(querySrc).toContain('pendingOutgoingP2wpkh');
      expect(querySrc).toContain('pendingOutgoingP2tr');
    });

    it('handles Map responses from provider (WASM returns)', () => {
      expect(querySrc).toContain('instanceof Map');
      expect(querySrc).toContain('mapToObject');
    });

    it('merges alkane metadata (name, symbol, price) from API and KNOWN_TOKENS', () => {
      expect(querySrc).toContain('KNOWN_TOKENS');
      expect(querySrc).toContain('knownInfo');
      expect(querySrc).toContain('entry.name || knownInfo?.name');
    });

    it('accumulates rune balances from UTXOs', () => {
      expect(querySrc).toContain('runeMap');
      expect(querySrc).toContain('ord_runes');
    });

    it('separates UTXOs into p2wpkh and p2tr arrays', () => {
      expect(querySrc).toContain('p2wpkhUtxos');
      expect(querySrc).toContain('p2trUtxos');
      expect(querySrc).toContain('allUtxos');
    });

    it('network defaults to mainnet when null', () => {
      // In the hook itself
      expect(src).toContain("network || 'mainnet'");
    });
  });
});

// ---------------------------------------------------------------------------
// useDemoGate
// ---------------------------------------------------------------------------

describe('useDemoGate', () => {
  const src = readSrc('hooks/useDemoGate.ts');
  const demoSrc = readSrc('utils/demoMode.ts');

  it('imports DEMO_MODE_ENABLED from utils/demoMode', () => {
    expect(src).toContain('DEMO_MODE_ENABLED');
    expect(src).toContain('@/utils/demoMode');
  });

  it('imports useWallet for network detection', () => {
    expect(src).toContain('useWallet');
  });

  it('returns false early when DEMO_MODE_ENABLED is false', () => {
    expect(src).toContain('!DEMO_MODE_ENABLED');
    expect(src).toMatch(/if\s*\(\s*!DEMO_MODE_ENABLED/);
  });

  it('returns false early when network is not mainnet', () => {
    expect(src).toContain("network !== 'mainnet'");
  });

  it('returns true only when demo mode is on AND network is mainnet', () => {
    // The final return statement should be `return true` — reached only if demo && mainnet
    expect(src).toMatch(/return\s+true\s*;?\s*\}/);
  });

  it('DEMO_MODE_ENABLED reads from NEXT_PUBLIC_DEMO_MODE env var', () => {
    expect(demoSrc).toContain("process.env.NEXT_PUBLIC_DEMO_MODE === '1'");
  });

  it('has UNGATED_WALLET_IDS set for okx and unisat', () => {
    expect(src).toContain('UNGATED_WALLET_IDS');
    expect(src).toContain("'okx'");
    expect(src).toContain("'unisat'");
  });

  it('ungates OKX and UniSat wallets even on mainnet with demo mode', () => {
    expect(src).toContain('UNGATED_WALLET_IDS.has(walletId)');
    expect(src).toMatch(/if\s*\(walletId\s*&&\s*UNGATED_WALLET_IDS\.has\(walletId\)\)\s*return\s+false/);
  });

  it('reads browserWallet info id for wallet identification', () => {
    expect(src).toContain('browserWallet?.info?.id');
  });
});

// ---------------------------------------------------------------------------
// useFuelAllocation
// ---------------------------------------------------------------------------

describe('useFuelAllocation', () => {
  const src = readSrc('hooks/useFuelAllocation.ts');

  it('imports useWallet for address and connection state', () => {
    expect(src).toContain('useWallet');
    expect(src).toContain('address');
    expect(src).toContain('paymentAddress');
    expect(src).toContain('isConnected');
  });

  it('exports FuelAllocation interface with isEligible and amount', () => {
    expect(src).toContain('export interface FuelAllocation');
    expect(src).toContain('isEligible: boolean');
    expect(src).toContain('amount: number');
  });

  it('fetches from /api/fuel endpoint', () => {
    expect(src).toContain('/api/fuel?address=');
  });

  it('returns default { isEligible: false, amount: 0 } when not connected', () => {
    expect(src).toContain('if (!isConnected)');
    expect(src).toContain('isEligible: false, amount: 0');
  });

  it('checks taproot address first, then payment address', () => {
    // The order is: check `address` first, then `paymentAddress`
    const addressCheckIdx = src.indexOf('if (address)');
    const paymentCheckIdx = src.indexOf('if (paymentAddress');
    expect(addressCheckIdx).toBeGreaterThan(-1);
    expect(paymentCheckIdx).toBeGreaterThan(-1);
    expect(addressCheckIdx).toBeLessThan(paymentCheckIdx);
  });

  it('skips paymentAddress check if it equals the taproot address', () => {
    expect(src).toContain('paymentAddress !== address');
  });

  it('uses useEffect with address/paymentAddress/isConnected deps', () => {
    expect(src).toContain('useEffect');
    expect(src).toMatch(/\[\s*address\s*,\s*paymentAddress\s*,\s*isConnected\s*\]/);
  });

  it('has cancellation cleanup to avoid stale state updates', () => {
    expect(src).toContain('let cancelled = false');
    expect(src).toContain('if (cancelled) return');
    expect(src).toContain('cancelled = true');
  });

  it('handles fetch errors gracefully by returning 0', () => {
    expect(src).toContain('catch');
    expect(src).toContain('return 0');
  });

  it('uses useState for local allocation state', () => {
    expect(src).toContain('useState');
    expect(src).toContain('setAllocation');
  });

  it('encodes address in URL parameter', () => {
    expect(src).toContain('encodeURIComponent(addr)');
  });
});

// ---------------------------------------------------------------------------
// useTransactionHistory
// ---------------------------------------------------------------------------

describe('useTransactionHistory', () => {
  const src = readSrc('hooks/useTransactionHistory.ts');
  const querySrc = readSrc('queries/history.ts');

  it('uses useQuery with transactionHistoryQueryOptions', () => {
    expect(src).toContain('useQuery');
    expect(src).toContain('transactionHistoryQueryOptions');
  });

  it('accepts optional address and excludeCoinbase params', () => {
    expect(src).toMatch(/useTransactionHistory\s*\(\s*address\?\s*:\s*string/);
    expect(src).toContain('excludeCoinbase');
  });

  it('defaults excludeCoinbase to true', () => {
    expect(src).toContain('excludeCoinbase: boolean = true');
  });

  it('returns transactions, loading, error, and refresh', () => {
    expect(src).toContain('transactions:');
    expect(src).toContain('loading:');
    expect(src).toContain('error:');
    expect(src).toContain('refresh');
  });

  it('falls back to empty array when data is null', () => {
    expect(src).toContain('data ?? []');
  });

  it('provides refresh via useCallback wrapping refetch', () => {
    expect(src).toContain('useCallback');
    expect(src).toContain('refetch');
  });

  it('formats error as string or fallback message', () => {
    expect(src).toContain('error instanceof Error');
    expect(src).toContain("'Failed to fetch transactions'");
  });

  // --- Type exports ---

  it('exports EnrichedTransaction interface with txid, confirmed, inputs, outputs', () => {
    expect(src).toContain('export interface EnrichedTransaction');
    expect(src).toContain('txid: string');
    expect(src).toContain('confirmed: boolean');
    expect(src).toContain('inputs: TransactionInput[]');
    expect(src).toContain('outputs: TransactionOutput[]');
  });

  it('exports TransactionInput with txid, vout, address, amount', () => {
    expect(src).toContain('export interface TransactionInput');
  });

  it('exports TransactionOutput with address, amount, scriptPubKey', () => {
    expect(src).toContain('export interface TransactionOutput');
    expect(src).toContain('scriptPubKey: string');
  });

  it('EnrichedTransaction has metaprotocol fields: hasOpReturn, hasProtostones, runestone, alkanesTraces', () => {
    expect(src).toContain('hasOpReturn: boolean');
    expect(src).toContain('hasProtostones: boolean');
    expect(src).toContain('runestone?: RunestoneData');
    expect(src).toContain('alkanesTraces?: AlkanesTrace[]');
  });

  it('EnrichedTransaction has isRbf and isCoinbase flags', () => {
    expect(src).toContain('isRbf: boolean');
    expect(src).toContain('isCoinbase: boolean');
  });

  // --- Query options (queries/history.ts) ---

  describe('transactionHistoryQueryOptions', () => {
    it('uses queryKeys.history.transactions for the key', () => {
      expect(querySrc).toContain('queryKeys.history.transactions');
    });

    it('is enabled only when address, provider, and isInitialized are truthy', () => {
      expect(querySrc).toContain('!!address');
      expect(querySrc).toContain('!!provider');
      expect(querySrc).toContain('isInitialized');
    });

    it('calls provider.getAddressTxsWithTraces', () => {
      expect(querySrc).toContain('provider.getAddressTxsWithTraces');
    });

    it('handles Map results via mapToObject', () => {
      expect(querySrc).toContain('mapToObject');
      expect(querySrc).toContain('instanceof Map');
    });

    it('parses vin and vout from raw transactions', () => {
      expect(querySrc).toContain('tx.vin');
      expect(querySrc).toContain('tx.vout');
    });

    it('detects coinbase transactions', () => {
      expect(querySrc).toContain('is_coinbase');
    });

    it('detects RBF by checking sequence numbers', () => {
      expect(querySrc).toContain('sequence');
      expect(querySrc).toContain('0xfffffffe');
    });

    it('detects OP_RETURN outputs', () => {
      expect(querySrc).toContain("'op_return'");
    });

    it('extracts runestone and alkanes_traces from raw tx', () => {
      expect(querySrc).toContain('tx.runestone');
      expect(querySrc).toContain('tx.alkanes_traces');
    });
  });
});

// ---------------------------------------------------------------------------
// useBtcBalance
// ---------------------------------------------------------------------------

describe('useBtcBalance', () => {
  const src = readSrc('hooks/useBtcBalance.ts');
  const querySrc = readSrc('queries/account.ts');

  it('uses useQuery with btcBalanceQueryOptions', () => {
    expect(src).toContain('useQuery');
    expect(src).toContain('btcBalanceQueryOptions');
  });

  it('imports useWallet for isConnected, address, network', () => {
    expect(src).toContain('useWallet');
    expect(src).toContain('isConnected');
    expect(src).toContain('address');
    expect(src).toContain('network');
  });

  it('passes getSpendableTotalBalance to query options', () => {
    expect(src).toContain('getSpendableTotalBalance');
  });

  describe('btcBalanceQueryOptions', () => {
    it('uses queryKeys.account.btcBalance for the key', () => {
      expect(querySrc).toContain('queryKeys.account.btcBalance');
    });

    it('is enabled only when connected and address present', () => {
      expect(querySrc).toContain('Boolean(isConnected && address)');
    });

    it('calls getSpendableTotalBalance and returns number', () => {
      expect(querySrc).toContain('getSpendableTotalBalance()');
      expect(querySrc).toContain('Number(satoshis || 0)');
    });

    it('returns 0 on error instead of throwing', () => {
      expect(querySrc).toContain('return 0');
    });
  });
});

// ---------------------------------------------------------------------------
// useLPPositions
// ---------------------------------------------------------------------------

describe('useLPPositions', () => {
  const src = readSrc('hooks/useLPPositions.ts');

  it('uses useEnrichedWalletData for alkane balances', () => {
    expect(src).toContain('useEnrichedWalletData');
    expect(src).toContain('balances');
  });

  it('uses usePools for pool data lookup', () => {
    expect(src).toContain('usePools');
  });

  it('uses useBtcPrice for USD valuation', () => {
    expect(src).toContain('useBtcPrice');
  });

  it('defines BASE_TOKEN_IDS to exclude known non-LP tokens', () => {
    expect(src).toContain('BASE_TOKEN_IDS');
    expect(src).toContain("'32:0'");    // frBTC
    expect(src).toContain("'2:0'");     // DIESEL
    expect(src).toContain("'2:56801'"); // bUSD
  });

  it('builds a pool map for fast lookup of alkane ID to pool', () => {
    expect(src).toContain('poolMap');
    expect(src).toContain('new Map');
    expect(src).toContain('pool.id');
  });

  it('has fallback heuristic: non-base tokens treated as LP when no pool data', () => {
    expect(src).toContain('!hasPoolData && !isBaseToken');
  });

  it('parses LP token symbol from pattern like "TOKEN0/TOKEN1 LP"', () => {
    expect(src).toContain("symbol.match(/^(.+?)\\/(.+?)\\s*LP$/i)");
  });

  it('formats balance with BigInt division and 4 decimal places', () => {
    expect(src).toContain('BigInt(alkane.balance)');
    expect(src).toContain('remainderStr.slice(0, 4)');
  });

  it('returns positions, isLoading, and refresh', () => {
    expect(src).toContain('positions,');
    expect(src).toContain('isLoading:');
    expect(src).toContain('refresh');
  });

  it('isLoading combines wallet and pools loading states', () => {
    expect(src).toContain('isLoadingWallet || isLoadingPools');
  });

  it('uses useMemo for positions computation', () => {
    expect(src).toContain('useMemo');
  });

  it('adds network-specific base tokens from config', () => {
    expect(src).toContain('config.FRBTC_ALKANE_ID');
    expect(src).toContain('config.BUSD_ALKANE_ID');
  });

  it('returns empty array when no alkanes data', () => {
    expect(src).toContain('if (!balances.alkanes)');
    expect(src).toContain('return []');
  });

  it('calculates USD value using btcPrice', () => {
    expect(src).toContain('btcPrice');
    expect(src).toContain('valueUSD');
  });

  it('includes gain/loss placeholder in each position', () => {
    expect(src).toContain('gainLoss');
    expect(src).toContain("amount: '0'");
  });

  it('includes token IDs from pool data when available', () => {
    expect(src).toContain('token0Id = pool.token0.id');
    expect(src).toContain('token1Id = pool.token1.id');
  });
});

// ---------------------------------------------------------------------------
// Query keys structure
// ---------------------------------------------------------------------------

describe('Query keys (queries/keys.ts)', () => {
  const src = readSrc('queries/keys.ts');

  it('includes network in enrichedWallet key for per-network caching', () => {
    expect(src).toMatch(/enrichedWallet:\s*\(\s*network:\s*string/);
  });

  it('includes network in btcBalance key', () => {
    expect(src).toMatch(/btcBalance:\s*\(\s*network:\s*string/);
  });

  it('includes network in transaction history key', () => {
    expect(src).toMatch(/transactions:\s*\(\s*network:\s*string/);
  });

  it('all key factories return readonly tuples', () => {
    const asConstCount = (src.match(/as\s+const/g) || []).length;
    // Each key factory has `as const`
    expect(asConstCount).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting concerns
// ---------------------------------------------------------------------------

describe('Cross-cutting: disconnected / not-connected handling', () => {
  it('useEnrichedWalletData query disabled when not connected', () => {
    const querySrc = readSrc('queries/account.ts');
    expect(querySrc).toContain('deps.isConnected');
  });

  it('useFuelAllocation resets allocation when disconnected', () => {
    const src = readSrc('hooks/useFuelAllocation.ts');
    expect(src).toContain('if (!isConnected)');
    expect(src).toContain('isEligible: false, amount: 0');
  });

  it('useTransactionHistory query disabled when no address', () => {
    const querySrc = readSrc('queries/history.ts');
    expect(querySrc).toContain('!!address');
  });

  it('useBtcBalance query disabled when not connected', () => {
    const querySrc = readSrc('queries/account.ts');
    expect(querySrc).toContain('Boolean(isConnected && address)');
  });
});

describe('Cross-cutting: error handling patterns', () => {
  it('useEnrichedWalletData formats errors safely', () => {
    const src = readSrc('hooks/useEnrichedWalletData.ts');
    expect(src).toContain('error instanceof Error');
    expect(src).toContain('error.message');
  });

  it('useTransactionHistory formats errors safely', () => {
    const src = readSrc('hooks/useTransactionHistory.ts');
    expect(src).toContain('error instanceof Error');
    expect(src).toContain('error.message');
  });

  it('useFuelAllocation catches fetch errors', () => {
    const src = readSrc('hooks/useFuelAllocation.ts');
    expect(src).toContain('catch');
    expect(src).toContain('return 0');
  });

  it('enrichedWalletQueryOptions has per-address try/catch with esplora fallback', () => {
    const querySrc = readSrc('queries/account.ts');
    expect(querySrc).toContain('getEnrichedBalances failed');
    expect(querySrc).toContain('esplora fallback');
  });
});

describe('Cross-cutting: React Query caching', () => {
  it('useEnrichedWalletData uses queryOptions from @tanstack/react-query', () => {
    const querySrc = readSrc('queries/account.ts');
    expect(querySrc).toContain("import { queryOptions } from '@tanstack/react-query'");
  });

  it('useTransactionHistory uses queryOptions from @tanstack/react-query', () => {
    const querySrc = readSrc('queries/history.ts');
    expect(querySrc).toContain("import { queryOptions } from '@tanstack/react-query'");
  });

  it('useBtcBalance uses queryOptions from @tanstack/react-query', () => {
    const querySrc = readSrc('queries/account.ts');
    // btcBalanceQueryOptions is in the same file
    expect(querySrc).toContain('btcBalanceQueryOptions');
  });

  it('all hooks separate query config from hook consumption', () => {
    // Query options are defined in queries/ files, not inline in hooks
    expect(readSrc('hooks/useEnrichedWalletData.ts')).toContain('enrichedWalletQueryOptions');
    expect(readSrc('hooks/useTransactionHistory.ts')).toContain('transactionHistoryQueryOptions');
    expect(readSrc('hooks/useBtcBalance.ts')).toContain('btcBalanceQueryOptions');
  });
});

describe('Cross-cutting: timeout / resilience', () => {
  it('enrichedWalletQueryOptions has 15s timeout on getEnrichedBalances', () => {
    const querySrc = readSrc('queries/account.ts');
    expect(querySrc).toContain('15000');
    expect(querySrc).toContain('withTimeout(provider.getEnrichedBalances');
  });

  it('enrichedWalletQueryOptions has 15s timeout on alkane balance fetch', () => {
    const querySrc = readSrc('queries/account.ts');
    // The second withTimeout call is for alkane balances
    const timeoutMatches = querySrc.match(/withTimeout\(/g) || [];
    expect(timeoutMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('enrichedWalletQueryOptions has 10s timeout on mempool spent fetch', () => {
    const querySrc = readSrc('queries/account.ts');
    expect(querySrc).toContain('10000');
    expect(querySrc).toContain('withTimeout(fetchMempoolSpent');
  });
});
