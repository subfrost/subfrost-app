'use client';

/**
 * SendModal — BTC and Alkane Token Transfer Component
 *
 * This modal handles sending BTC and Alkane tokens from browser wallets (OYL, Xverse, UniSat, OKX)
 * and keystore wallets. It includes comprehensive UTXO management, fee estimation, and multi-wallet
 * signing support.
 *
 * ============================================================================
 * CRITICAL WALLET COMPATIBILITY NOTES (2026-03-01)
 * ============================================================================
 *
 * **UTXO Aggregation:**
 * - BTC sends aggregate UTXOs from BOTH SegWit and Taproot addresses
 * - This prevents "insufficient funds" errors when balance is split across address types
 * - Special UTXOs (inscriptions, alkanes, runes) are automatically excluded
 *
 * **Fresh UTXO Verification:**
 * - Before signing, we fetch fresh UTXOs via `/api/esplora/address/{addr}/utxo`
 * - DO NOT use JSON-RPC `esplora_address::utxo` — it returns 0 results on mainnet!
 * - If selected UTXOs are stale (spent/pending), user is returned to input step
 *
 * **Taproot Input Signing (CRITICAL):**
 * - Taproot inputs MUST include `tapInternalKey` in the PSBT input data
 * - Without this, wallets fail with "Can not sign for input #N with the key..."
 * - The tapInternalKey is the x-only pubkey from `account.taproot.pubKeyXOnly`
 *
 * **Fee Warning Loop Prevention:**
 * - Small amounts (e.g., 1000 sats) always trigger high fee warnings (>2% ratio)
 * - `feeWarningAcknowledged` flag prevents repeated warnings on retry
 * - Flag is reset when amount changes or modal closes
 *
 * ============================================================================
 * WALLET-SPECIFIC SIGNING BEHAVIORS
 * ============================================================================
 *
 * **OYL Wallet:**
 * - Shows one signature popup PER INPUT (not batched)
 * - `isConnected()` returns false even when signing works — don't gate on it
 * - No `connect()` method — connection established via `getAddresses()`
 * - Use SDK adapter's `signPsbt()`, not direct `window.oyl` calls
 *
 * **Xverse Wallet:**
 * - P2SH-P2WPKH addresses (starting with '3') need redeemScript injection
 * - Use `injectRedeemScripts()` from lib/psbt-patching.ts before signing
 * - Direct signing call via `signTaprootPsbt()` includes Xverse bypass
 *
 * **UniSat Wallet (2026-03-03 — VERIFIED WORKING):**
 * - Verified tx: 81b3d4d2c04e163c0ba791963b7569eaa2196814b4d3a5afa8d62719d0a3df69
 * - Single-address wallet — user chooses Taproot OR SegWit in settings
 * - Code handles: `primaryAddress = taprootAddress || segwitAddress`
 * - Don't require both addresses — check for at least one
 * - CRITICAL PITFALLS (see WalletContext.tsx for full documentation):
 *   1. SDK adapter returns null → use direct window.unisat bypass
 *   2. toSignInputs MUST have `address` field for each input
 *   3. Use signPsbts (plural) with array format (SDK pattern)
 *   4. Use autoFinalized: true for taproot inputs
 *   5. PSBT may be pre-finalized — use smart extraction pattern
 *
 * **OKX Wallet:**
 * - Similar to UniSat — single-address mode
 * - Same handling: prefer Taproot, fall back to SegWit
 *
 * ============================================================================
 * PSBT CONSTRUCTION CHECKLIST
 * ============================================================================
 *
 * For each input:
 * 1. Add `witnessUtxo` with script from the transaction output being spent
 * 2. If Taproot address (bc1p/tb1p/bcrt1p): Add `tapInternalKey`
 * 3. If P2SH address (starts with '3' or '2'): Inject redeemScript
 *
 * For outputs:
 * 1. Use actual address strings, NOT symbolic refs like 'p2tr:0' (browser wallets)
 * 2. Symbolic refs only work for keystore wallets with loaded mnemonics
 *
 * ============================================================================
 * VERIFIED WORKING (2026-03-01)
 * ============================================================================
 * - OYL mainnet send: txid d450245756a5e24b28756889ad60ea91c04195671edad7c65453ed04c7427cad
 * - Taproot UTXO (bc1p...) spent with tapInternalKey
 * - Fee: 141 sats, ~1.08 sat/vB
 *
 * ============================================================================
 * ALKANE TRANSFER — SDK PATH (replaces 650 LOC of manual PSBT construction)
 * ============================================================================
 *
 * Alkane sends now route through `alkanesExecuteTyped` (lib/alkanes/execute.ts),
 * the same path used by every other mutation hook in this app and by the
 * tier-1 integration test (`__tests__/tier1/send-alkane.test.ts`).
 *
 * Inscription/rune protection is delegated to the SDK via `ordinalsStrategy`:
 *   - `'preserve'` (default — driven by the WalletSettings toggle): SDK splits
 *     inscribed/rune-bearing UTXOs into two outputs so the asset stays intact.
 *   - `'burn'`: SDK is allowed to spend inscribed UTXOs as fee inputs.
 *
 * Historical context: a previous ad-hoc implementation (deleted) bundled ALL
 * dust UTXOs as inputs and shipped a "collateral warning" UI to ask users for
 * consent — both responsibilities now live in the SDK.
 */

import { useState, useEffect, useRef, useMemo, forwardRef } from 'react';
import SfPopup, { type SfPopupHandle } from '@/app/components/SfPopup';
import { X, Send, AlertCircle, CheckCircle, Loader2, ChevronDown, Coins, ExternalLink } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useNotification } from '@/context/NotificationContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import TokenIcon from '@/app/components/TokenIcon';
import { useFeeRate, FeeSelection } from '@/hooks/useFeeRate';
import { usePools } from '@/hooks/usePools';
import { useTranslation } from '@/hooks/useTranslation';
import { computeSendFee, estimateSelectionFee, DUST_THRESHOLD } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { useBtcSendMutation, BtcSendStaleUtxosError } from '@/hooks/useBtcSendMutation';
import { useAlkaneSendMutation } from '@/hooks/useAlkaneSendMutation';
import { getHeight as rpcGetHeight, getAddressUtxos as rpcGetAddressUtxos } from '@/lib/alkanes/rpc';
import { getAlkanesDataSource } from '@/lib/alkanes/dataSource';
import { selectAvailableUtxos } from '@/lib/walletState/sendModalFilter';
import { getSendableAlkane } from '@/lib/walletState/sendableAlkane';
import { usePendingTxs } from '@/hooks/usePendingTxs';
import { useWalletUtxoCache } from '@/hooks/useWalletUtxoCache';

bitcoin.initEccLib(ecc);

import { usePositionMetadata, isEnrichablePosition } from '@/hooks/usePositionMetadata';

import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAlkane?: AlkaneAsset | null;
  onSuccess?: (txid: string) => void;
}

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  address: string;
  status: { confirmed: boolean; block_height?: number };
  alkanes?: any;
  runes?: any;
  inscriptions?: any[];
  frozen?: boolean;
}

/**
 * Detect address type from a Bitcoin address string.
 * Returns the address type and the corresponding SDK address reference.
 */
type AddressTypeInfo = {
  type: 'p2tr' | 'p2wpkh' | 'p2sh' | 'p2pkh' | 'unknown';
  sdkRef: string; // e.g., 'p2tr:0', 'p2wpkh:0'
  signingMethod: 'taproot' | 'segwit' | 'legacy';
};

function detectAddressType(address: string): AddressTypeInfo {
  const lower = address.toLowerCase();

  // Taproot (P2TR): bc1p, tb1p, bcrt1p
  if (lower.startsWith('bc1p') || lower.startsWith('tb1p') || lower.startsWith('bcrt1p')) {
    return { type: 'p2tr', sdkRef: 'p2tr:0', signingMethod: 'taproot' };
  }

  // Native SegWit (P2WPKH): bc1q, tb1q, bcrt1q
  if (lower.startsWith('bc1q') || lower.startsWith('tb1q') || lower.startsWith('bcrt1q')) {
    return { type: 'p2wpkh', sdkRef: 'p2wpkh:0', signingMethod: 'segwit' };
  }

  // Nested SegWit (P2SH-P2WPKH): starts with 3 (mainnet) or 2 (testnet/regtest)
  if (address.startsWith('3') || address.startsWith('2')) {
    return { type: 'p2sh', sdkRef: 'p2sh:0', signingMethod: 'segwit' };
  }

  // Legacy (P2PKH): starts with 1 (mainnet) or m/n (testnet/regtest)
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return { type: 'p2pkh', sdkRef: 'p2pkh:0', signingMethod: 'legacy' };
  }

  return { type: 'unknown', sdkRef: 'p2tr:0', signingMethod: 'taproot' };
}

/**
 * Build protostone for alkane transfer using Factory Forward (opcode 50).
 *
 * IMPORTANT: Do NOT use a manual edict here. The SDK's `alkanesExecuteWithStrings`
 * auto-generates edicts from `inputRequirements`. Adding a manual edict causes a
 * double-edict bug where protostone indices shift and tokens go to wrong outputs.
 * (Same bug fixed for swaps in 2026-02-01 — see useSwapMutation.ts lines 131-146.)
 *
 * Pattern: [factory_block,factory_tx,50]:v0:v1
 *   - Cellpack calls Factory Forward (opcode 50), which passes incomingAlkanes through
 *   - v0 = pointer: recipient gets the forwarded alkanes
 *   - v1 = refund: sender change address (safe failure path)
 *
 * The SDK's auto-edict from `inputRequirements` handles token delivery:
 *   1. inputRequirements selects the alkane UTXO and routes exact amount to cellpack
 *   2. If UTXO has excess, SDK splits: needed → cellpack, excess → alkanesChangeAddress
 *   3. Factory Forward receives exactly the needed amount as incomingAlkanes
 *   4. Forward passes them to pointer output (v0 = recipient)
 *
 * toAddresses must be: [recipientAddress, senderChangeAddress]
 *
 * JOURNAL (2026-02-09): P2SH-P2WPKH redeemScript injection fix
 * The SDK's WASM builds PSBTs with a dummy wallet (walletCreate()), so witnessUtxo.script
 * contains the DUMMY wallet's P2WPKH hash (0014<dummy_hash>), not the user's. The original
 * redeemScript injection compared exact bytes against the user's P2SH scriptPubKey and
 * user's P2WPKH redeemScript — neither matched the dummy hash, so redeemScript was never
 * injected. Fix: match by script TYPE PATTERN (script[0]===0x00 && length===22) instead
 * of exact bytes, same approach used for output patching. When matched, replace witnessUtxo
 * with P2SH scriptPubKey and inject redeemScript.
 *
 * JOURNAL (2026-02-09): Refactored all PSBT patching into lib/psbt-patching.ts.
 * ~483 lines of duplicated output/input patching code across 7 hooks + SendModal
 * consolidated into patchPsbtForBrowserWallet() and injectRedeemScripts(). The utility
 * handles: output patching by script type, fixed output overrides (signer/recipient),
 * and P2SH-P2WPKH redeemScript injection with pattern-based matching.
 * First mainnet tx with this fix: f9e7eaf2c548647f99f5a1b72ef37fed5771191b9f30adab2
 */
/**
 * Map a Bitcoin address to a symbolic SDK reference to avoid LegacyAddressTooLong.
 * The WASM SDK tries base58 parsing first; bech32/bech32m addresses (bc1p, bc1q)
 * are longer than expected for base58 and trigger the error.
 * P2SH/P2PKH addresses are base58-encoded and can be passed directly.
 */
function addressToSymbolic(address: string): string {
  const l = address.toLowerCase();
  if (l.startsWith('bc1p') || l.startsWith('tb1p') || l.startsWith('bcrt1p')) return 'p2tr:0';
  if (l.startsWith('bc1q') || l.startsWith('tb1q') || l.startsWith('bcrt1q')) return 'p2wpkh:0';
  return address;
}

export default function SendModal({ isOpen, onClose, initialAlkane, onSuccess }: SendModalProps) {
  const { address: taprootAddress, paymentAddress, network, walletType, account, signTaprootPsbt, signSegwitPsbt, browserWallet, txContext } = useWallet() as any;
  // Address strategy:
  // - BTC sends: Use UTXOs from BOTH SegWit and Taproot addresses (excluding those with alkanes/inscriptions/runes).
  //   Change goes to SegWit if available, otherwise Taproot.
  // - Alkane sends: Taproot (address) for token send/change, SegWit (paymentAddress) for BTC fees/change
  //
  // JOURNAL (2026-03-01): Previously only used SegWit UTXOs for BTC sends, but this caused
  // "insufficient funds" errors when most BTC was on Taproot address. Now we aggregate UTXOs
  // from both addresses while still protecting special UTXOs (inscriptions, alkanes, runes).
  const btcChangeAddress = paymentAddress || taprootAddress; // Prefer SegWit for change
  // BTC sends source UTXOs ONLY from the segwit "payment" address on
  // dual-address browser wallets (Xverse / OYL / Leather). Taproot is
  // reserved for alkanes — picking a taproot UTXO for a BTC fee risks
  // burning alkanes that share the dust output. Single-address wallets
  // (UniSat / OKX) and keystore use whichever address they have.
  const isDualAddressBrowser =
    walletType === 'browser' && !!paymentAddress && !!taprootAddress && paymentAddress !== taprootAddress;
  const btcFromAddresses = isDualAddressBrowser
    ? [paymentAddress as string]
    : ([paymentAddress, taprootAddress].filter(Boolean) as string[]);
  const alkaneSendAddress = taprootAddress;
  // Legacy alias for compatibility with existing code paths (alkane transfers)
  const btcSendAddress = btcChangeAddress;
  const { provider, isInitialized } = useAlkanesSDK();
  const alkaneProvider = useSandshrewProvider();
  const { requestConfirmation } = useTransactionConfirm();
  const { showError } = useNotification();
  const { t } = useTranslation();
  const { balances, mempoolLockedAlkanes: serverMempoolLockedAlkanes, refresh } = useEnrichedWalletData();
  const { alkaneDeltas: pendingAlkaneDeltas } = usePendingTxs();
  // mork1e (2026-05-18 FB6): user-facing inputs (send modal, swap inputs)
  // MUST display "available" — the spendable amount after subtracting
  // alkane UTXOs already locked in pending mempool transactions. Showing
  // raw confirmed total lets the user try to spend mempool-locked amounts
  // and gets them an "Insufficient alkanes" error at broadcast time. The
  // wallet card displays total/available/mempool as three separate lines
  // (the user can SEE the lock-up); user-facing INPUTS are gated on
  // available only.
  const pendingByAlkaneSend = useMemo(() => {
    const map = new Map<string, { delta: bigint }>();
    // Server-side mempool locks first (authoritative for outgoing).
    for (const [id, amount] of Object.entries(serverMempoolLockedAlkanes)) {
      try { map.set(id, { delta: -BigInt(amount) }); } catch { /* skip */ }
    }
    // Browser predictions merge — positive (incoming) deltas add, negative
    // only fill in alkanes the server hasn't reported yet.
    for (const d of pendingAlkaneDeltas) {
      const key = `${d.alkaneId.block}:${d.alkaneId.tx}`;
      const existing = map.get(key);
      if (existing) {
        if (d.delta > 0n) map.set(key, { delta: existing.delta + d.delta });
      } else {
        map.set(key, { delta: d.delta });
      }
    }
    return map;
  }, [pendingAlkaneDeltas, serverMempoolLockedAlkanes]);
  const dataSource = getAlkanesDataSource(network || 'mainnet');
  const walletUtxoCache = useWalletUtxoCache();
  const btcSendMutation = useBtcSendMutation();
  const alkaneSendMutation = useAlkaneSendMutation();

  // Translate raw broadcast/signing errors into user-readable toast messages.
  // Mirrors SwapShell.humanizeError for consistent error UX across the app.
  const humanizeError = (raw: string): string => {
    if (!raw) return t('send.failedBroadcast');
    if (raw.includes('User rejected') || raw.includes('User denied') || raw.includes('user rejected') || raw.includes('cancelled') || raw.includes('Transaction rejected')) {
      return t('errors.userCancelled');
    }
    if (raw.includes('Insufficient alkanes')) {
      const match = raw.match(/need (\d+) of ([\d:]+), have (\d+)/);
      if (match) {
        const [, needed, tokenId, available] = match;
        return t('errors.insufficientBalance', {
          tokenId,
          needed: (Number(needed) / 1e8).toFixed(4),
          available: (Number(available) / 1e8).toFixed(4),
        });
      }
    }
    if (raw.includes('Insufficient funds') || raw.includes('insufficient funds')) {
      const fundsMatch = raw.match(/need (\d+) sats/);
      const needed = fundsMatch ? (Number(fundsMatch[1]) / 1e8).toFixed(6) : null;
      return needed
        ? t('errors.insufficientBtcWithAmount', { needed })
        : t('errors.insufficientBtcGeneric');
    }
    if (raw.includes('dust') || raw.includes('dust limit')) {
      return t('errors.dustAmount');
    }
    if (raw.includes('timeout') || raw.includes('Timeout')) {
      return t('errors.requestTimeout');
    }
    return raw;
  };

  // Track txids the user broadcast in this session via the SDK's
  // PendingTxStore (auto-populated by broadcast_transaction inside
  // alkanes-web-sys — single source of truth). Unconfirmed UTXOs
  // whose txid is in this set are treated as available for the next
  // send — the SDK's selector also accepts them, this overlay just
  // mirrors that decision into the wallet UI's pre-flight check.
  //
  // Without this, "send back-to-back" UX is broken: tx 1's change
  // UTXO is mempool-only until ~10min confirmation, and the
  // confirmed-alkane-carriers don't have enough sats for tx 2.
  const [ourPendingTxids, setOurPendingTxids] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    if (!provider) return;
    let cancelled = false;
    (async () => {
      try {
        // Try SDK-side list first (auto-populated). Falls back to
        // IndexedDB store if the SDK method isn't available (older
        // SDK build).
        let hexes: string[] = [];
        const sdkList = (provider as any).pendingTxStoreList;
        if (typeof sdkList === 'function') {
          hexes = (await sdkList.call(provider)) || [];
        } else {
          const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
          hexes = await pendingTxStore.list();
        }
        const { Transaction } = await import('bitcoinjs-lib');
        const ids = new Set(hexes.map((h) => Transaction.fromHex(h).getId()));
        if (!cancelled) setOurPendingTxids(ids);
      } catch (e) {
        console.warn('[SendModal] pending-tx-store load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, provider]);

  // Fetch UTXOs via esplora when modal opens.
  const [esploraUtxos, setEsploraUtxos] = useState<any[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    if (dataSource === 'espo') return;
    const addresses = [account?.taproot?.address, account?.nativeSegwit?.address].filter(Boolean) as string[];
    if (addresses.length === 0) return;
    const isRegtest = network === 'regtest' || network === 'regtest-local' || network === 'subfrost-regtest' || network === 'qubitcoin-regtest';

    (async () => {
    // SDK-mediated reads — see lib/alkanes/rpc.ts for the canonical layer.
    // No raw fetch / metashrew_view calls in app code.
    const [heightResult, utxoResults] = await Promise.all([
      rpcGetHeight(network || 'mainnet').catch(() => 0),
      Promise.all(addresses.map(async (addr) => {
        try {
          const utxos = await rpcGetAddressUtxos(network || 'mainnet', addr);
          return utxos.map((u) => ({ ...u, _addr: addr }));
        } catch { return []; }
      })),
    ]);

    const currentHeight = heightResult;
    setEsploraUtxos(utxoResults.flat().map((u: any) => {
      const height = u.status?.block_height || 0;
      const confirmations = currentHeight > 0 && height > 0 ? currentHeight - height + 1 : 0;
      return {
        txid: u.txid, vout: u.vout, value: u.value, address: u._addr,
        status: { confirmed: u.status?.confirmed ?? true, block_height: height },
        _immature: isRegtest && confirmations > 0 && confirmations < 100,
      };
    }).filter((u: any) => !u._immature));
    })();
  }, [isOpen, account, network, dataSource]);

  const walletCacheUtxos = useMemo(() => {
    return walletUtxoCache.utxos.map((utxo) => {
      const alkanes = Object.fromEntries(
        (utxo.alkanes ?? []).map((alkane) => [
          `${alkane.block}:${alkane.tx}`,
          { value: alkane.amount.toString(), name: '', symbol: '' },
        ]),
      );
      return {
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        address: utxo.address,
        status: {
          // Gate on BITCOIND confirmation (blockHeight !== null), NOT on
          // metashrew `confirmations >= 1`. Metashrew is the alkane
          // indexer; using its catch-up status to gate BTC spendability
          // surfaces as "Available: <wrong-small-number> BTC" in the
          // Send modal whenever metashrew lags bitcoind by even one
          // block. mork1e 2026-05-17: 211k-sat UTXO at block 949865
          // dropped from Send-modal "Available" because metashrew was
          // at 949862 → confirmations=0 → confirmed=false → filtered
          // out at line 510. Same fix already shipped for the
          // wallet-state `spendable` aggregate in 4270ea1a; this is
          // the second consumer that maintains its own filter chain.
          confirmed: (utxo.blockHeight ?? null) !== null,
          block_height: utxo.blockHeight ?? undefined,
        },
        alkanes,
        runes: Array.isArray(utxo.runes) ? utxo.runes : [],
        inscriptions: [],
      };
    });
  }, [walletUtxoCache.utxos]);

  const utxos = useMemo(() => {
    const all = dataSource === 'espo' ? walletCacheUtxos : esploraUtxos;
    return {
      p2wpkh: all.filter((u: any) => u.address === account?.nativeSegwit?.address),
      p2tr: all.filter((u: any) => u.address === account?.taproot?.address),
      all,
    };
  }, [account?.nativeSegwit?.address, account?.taproot?.address, dataSource, esploraUtxos, walletCacheUtxos]);
  const { selection: feeSelection, setSelection: setFeeSelection, custom: customFeeRate, setCustom: setCustomFeeRate, feeRate, presets } = useFeeRate({ storageKey: 'subfrost-send-fee-rate' });

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedUtxos, setSelectedUtxos] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'input' | 'confirm' | 'broadcasting' | 'success'>('input');
  const popupRef = useRef<SfPopupHandle>(null);
  const handleClose = () => popupRef.current?.close();
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [sendMode, setSendMode] = useState<'btc' | 'alkanes'>('btc');
  const [selectedAlkaneId, setSelectedAlkaneId] = useState<string | null>(null);
  const [showFrozenUtxos, setShowFrozenUtxos] = useState(false);
  const [showFeeWarning, setShowFeeWarning] = useState(false);
  const [feeWarningCountdown, setFeeWarningCountdown] = useState(0);
  // Track if user already acknowledged the high fee warning to prevent looping
  // JOURNAL (2026-03-01): The fee warning was triggering every time user clicked
  // SEND TRANSACTION because small amounts (1000 sats) always have >2% fee ratio.
  // If user already clicked "PROCEED ANYWAY", we bypass the check on retry.
  const [feeWarningAcknowledged, setFeeWarningAcknowledged] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState(0);
  const [estimatedFeeRate, setEstimatedFeeRate] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [alkaneFilter, setAlkaneFilter] = useState<'tokens' | 'nfts' | 'positions'>('tokens');
  const [isProcessing, setIsProcessing] = useState(false);
  const selectedAlkaneRef = useRef<HTMLButtonElement>(null);

  // Normalize Bech32 addresses to lowercase (BIP-173: case-insensitive)
  const normalizedRecipientAddress = useMemo(() => {
    const addr = recipientAddress.trim();
    const lower = addr.toLowerCase();
    if (lower.startsWith('bc1') || lower.startsWith('tb1') || lower.startsWith('bcrt1')) {
      return lower;
    }
    return addr; // Keep original case for legacy addresses
  }, [recipientAddress]);

  const { data: poolsData } = usePools();
  const { data: positionMeta } = usePositionMetadata(balances.alkanes);
  const poolMap = useMemo(() => {
    const map = new Map<string, any>();
    if (poolsData?.items) {
      for (const pool of poolsData.items) {
        map.set(pool.id, pool);
      }
    }
    return map;
  }, [poolsData]);

  const isLpToken = (alkane: { symbol: string; name: string; alkaneId?: string }) =>
    /\bLP\b/i.test(alkane.symbol) || /\bLP\b/i.test(alkane.name) || (alkane.alkaneId ? poolMap.has(alkane.alkaneId) : false);
  const isStakedPosition = (alkane: { symbol: string; name: string }) =>
    alkane.symbol.startsWith('POS-') || alkane.name.startsWith('POS-');
  const isPosition = (alkane: { symbol: string; name: string; alkaneId?: string }) =>
    isLpToken(alkane) || isStakedPosition(alkane);
  const isNft = (balance: string) => BigInt(balance) === BigInt(1);
  const isSendNft = (alkane: { balance: string; symbol: string; name: string; alkaneId?: string }) =>
    isNft(alkane.balance) && !isPosition(alkane);

  const getAlkaneSendAmountBaseUnits = (alkane: AlkaneAsset): bigint | null => {
    if (isSendNft(alkane)) return 1n;

    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) return null;

    const decimals = alkane.decimals || 8;
    return BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
  };

  const getAlkaneSendDisplayAmount = (alkane: AlkaneAsset): string => {
    return isSendNft(alkane) ? '1' : amount;
  };

  // Load frozen UTXOs from localStorage
  const getFrozenUtxos = (): Set<string> => {
    const stored = localStorage.getItem('subfrost_frozen_utxos');
    if (stored) {
      try {
        return new Set(JSON.parse(stored));
      } catch (err) {
        return new Set();
      }
    }
    return new Set();
  };

  const frozenUtxos = getFrozenUtxos();

  // BTC-send UTXO candidates: confirmed, on a btcFromAddresses entry, not
  // frozen. Logic delegated to the pure `selectAvailableUtxos` helper in
  // `lib/walletState/sendModalFilter.ts` — same function the headless
  // display-verification harness (`scripts/verify-display-mainnet.ts`)
  // calls against live mainnet. Refactor 2026-05-18: extracted out of
  // an inline closure so changes here can never silently drift from
  // what the harness asserts before push to develop.
  const availableUtxos = selectAvailableUtxos({
    utxos: utxos.all as any,
    ourPendingTxids,
    frozenUtxos,
    showFrozenUtxos,
    btcFromAddresses,
    isDualAddressBrowser,
  }) as typeof utxos.all;

  // UTXO distribution logged only in dev when data actually changes


  const totalSelectedValue = Array.from(selectedUtxos)
    .map((key) => {
      const [txid, vout] = key.split(':');
      const utxo = availableUtxos.find((u) => u.txid === txid && u.vout.toString() === vout);
      return utxo ? utxo.value : 0;
    })
    .reduce((sum, val) => sum + val, 0);

  useEffect(() => {
    if (isOpen) {
      // Clear any stale errors when modal opens
      setError('');
    } else {
      // Reset state when modal closes (fee selection is persisted via useFeeRate)
      setStep('input');
      setRecipientAddress('');
      setAmount('');
      setSelectedUtxos(new Set());
      setError('');
      setTxid('');
      setSendMode('btc');
      setSelectedAlkaneId(null);
      setAlkaneFilter('tokens');
      setIsProcessing(false);
      setFeeWarningAcknowledged(false);
      setShowFeeWarning(false);
    }
  }, [isOpen]);

  // Switch to alkanes tab and pre-select when an initial alkane is provided
  useEffect(() => {
    if (isOpen && initialAlkane) {
      setSendMode('alkanes');
      setSelectedAlkaneId(initialAlkane.alkaneId);
      // Switch to the correct filter tab for this alkane
      if (isPosition(initialAlkane)) {
        setAlkaneFilter('positions');
      } else if (isNft(initialAlkane.balance)) {
        setAlkaneFilter('nfts');
      } else {
        setAlkaneFilter('tokens');
      }
    }
  }, [isOpen, initialAlkane]);

  // Scroll the pre-selected alkane into view within the list
  useEffect(() => {
    if (isOpen && selectedAlkaneId && selectedAlkaneRef.current) {
      selectedAlkaneRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isOpen, selectedAlkaneId, alkaneFilter]);

  // Countdown timer for fee warning
  useEffect(() => {
    if (feeWarningCountdown > 0) {
      const timer = setTimeout(() => {
        setFeeWarningCountdown(feeWarningCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [feeWarningCountdown]);


  const validateAddress = (addr: string): boolean => {
    // Basic Bitcoin address validation
    if (!addr) return false;

    // Normalize to lowercase for Bech32 validation (BIP-173: case-insensitive)
    const normalizedAddr = addr.toLowerCase();

    // Bech32 (native segwit)
    if (normalizedAddr.startsWith('bc1') || normalizedAddr.startsWith('tb1') || normalizedAddr.startsWith('bcrt1')) {
      return normalizedAddr.length >= 42 && normalizedAddr.length <= 90;
    }

    // Legacy/P2SH
    if (addr.startsWith('1') || addr.startsWith('3') || addr.startsWith('m') || addr.startsWith('n') || addr.startsWith('2')) {
      return addr.length >= 26 && addr.length <= 35;
    }

    return false;
  };

  const handleNext = () => {
    setError('');

    // Handle alkane sends
    if (sendMode === 'alkanes') {
      if (step === 'input') {
        // Validate alkane send inputs
        if (!validateAddress(recipientAddress)) {
          setError(t('send.invalidAddress'));
          return;
        }

        if (!selectedAlkaneId) {
          setError(t('send.selectAlkane'));
          return;
        }

        const selectedAlkane = balances.alkanes.find(a => a.alkaneId === selectedAlkaneId);
        if (!selectedAlkane) {
          setError(t('send.selectedAlkaneNotFound'));
          return;
        }

        const amountBaseUnits = getAlkaneSendAmountBaseUnits(selectedAlkane);
        if (amountBaseUnits === null || amountBaseUnits <= 0n) {
          setError(t('send.invalidAmount'));
          return;
        }

        // Gate on AVAILABLE, not total — mempool-locked alkanes can't be
        // spent again until the prior pending tx mines or replaces.
        const sendable = getSendableAlkane(
          selectedAlkane.balance,
          pendingByAlkaneSend.get(selectedAlkane.alkaneId),
        );
        if (amountBaseUnits > sendable.availableRaw) {
          setError(t('send.insufficientBalance'));
          return;
        }

        if (feeRate < 1) {
          setError(t('send.invalidFeeRate'));
          return;
        }

        // For alkane sends, go directly to broadcasting (no confirm step for now)
        // The confirmation happens via requestConfirmation modal for keystore wallets
        handleAlkaneBroadcast();
      }
      return;
    }

    // Handle BTC sends
    if (step === 'input') {
      // Validate inputs
      if (!validateAddress(recipientAddress)) {
        setError(t('send.invalidAddress'));
        return;
      }

      const amountSats = Math.floor(parseFloat(amount) * 100000000);
      if (isNaN(amountSats) || amountSats <= 0) {
        setError(t('send.invalidAmount'));
        return;
      }

      // JOURNAL (2026-03-03): Bitcoin Core rejects outputs below dust threshold (546 sats)
      // with error "dust, tx with dust output must be 0-fee". Validate before building PSBT.
      if (amountSats < DUST_THRESHOLD) {
        setError(t('send.amountBelowDust', { threshold: DUST_THRESHOLD }));
        return;
      }

      if (feeRate < 1) {
        setError(t('send.invalidFeeRate'));
        return;
      }
      const feeRateNum = feeRate;

      // Auto-select UTXOs using smart algorithm
      // Strategy: Use largest UTXOs first, but limit total count to keep tx size reasonable
      const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
      let total = 0;
      const selected = new Set<string>();

      // Estimate fee based on number of inputs (for UTXO accumulation loop)
      const estimateFee = (numInputs: number) => estimateSelectionFee(numInputs, feeRateNum);

      const MAX_UTXOS = 100; // Hard limit to keep transaction size reasonable

      for (const utxo of sorted) {
        const potentialFee = estimateFee(selected.size + 1);
        const needed = amountSats + 546 + potentialFee; // +546 for alkane safety output

        selected.add(`${utxo.txid}:${utxo.vout}`);
        total += utxo.value;

        // Stop if we have enough + fee buffer
        if (total >= needed + 10000) break; // 10k sats buffer

        // Hard limit: Don't select more than MAX_UTXOS
        if (selected.size >= MAX_UTXOS) {
          console.warn(`[SendModal] Hit ${MAX_UTXOS} UTXO limit, checking if sufficient...`);
          break;
        }
      }

      // Compute accurate fee. +546 for the alkane safety output (always present).
      const SAFETY_SATS = 546;
      const feeResult = computeSendFee({ inputCount: selected.size, sendAmount: amountSats + SAFETY_SATS, totalInputValue: total, feeRate: feeRateNum });
      const required = amountSats + SAFETY_SATS + feeResult.fee;

      if (total < required) {
        // Check if we have enough total balance
        const totalAvailable = availableUtxos.reduce((sum, u) => sum + u.value, 0);
        if (totalAvailable >= required) {
          setError(
            t('send.utxoLimitError', {
              limit: MAX_UTXOS,
              need: (required / 100000000).toFixed(8),
              have: (total / 100000000).toFixed(8),
              total: (totalAvailable / 100000000).toFixed(8),
            })
          );
        } else {
          setError(t('send.insufficientFundsDetailed', {
            need: (required / 100000000).toFixed(8),
            have: (totalAvailable / 100000000).toFixed(8),
          }));
        }
        return;
      }

      console.log(`[SendModal] Auto-selected ${selected.size} UTXOs, total: ${(total / 100000000).toFixed(8)} BTC, fee: ${(feeResult.fee / 100000000).toFixed(8)} BTC (${feeResult.numOutputs} outputs, ${feeResult.effectiveFeeRate.toFixed(2)} sat/vB effective)`);

      setSelectedUtxos(selected);
      setEstimatedFee(feeResult.fee);
      setEstimatedFeeRate(feeResult.effectiveFeeRate);
      setStep('confirm');
    } else if (step === 'confirm') {
      // Check if fee looks suspicious before broadcasting
      checkFeeAndBroadcast();
    }
  };

  const checkFeeAndBroadcast = () => {
    const amountSats = Math.floor(parseFloat(amount) * 100000000);
    const feeRateNum = feeRate;

    const numInputs = selectedUtxos.size;
    const feeResult = computeSendFee({ inputCount: numInputs, sendAmount: amountSats, totalInputValue: totalSelectedValue, feeRate: feeRateNum });

    setEstimatedFee(feeResult.fee);
    setEstimatedFeeRate(feeResult.effectiveFeeRate);

    const estimatedFeeSats = feeResult.fee;

    // Safety checks: warn only on genuinely irrational fees.
    // (A fee/amount % check is not useful — for small sends the minimum-size tx
    // always produces a high ratio, so it would warn on every legitimate dust send.)
    const feeTooHigh = estimatedFeeSats > 0.01 * 100000000; // > 0.01 BTC absolute
    const feeRateTooHigh = feeRateNum > 1000;               // > 1000 sat/vB
    const tooManyInputs = numInputs > 100;                   // bloated tx

    // Skip fee warning if user already acknowledged it (prevents looping on retry)
    if (!feeWarningAcknowledged && (feeTooHigh || feeRateTooHigh || tooManyInputs)) {
      setShowFeeWarning(true);
      setFeeWarningCountdown(3);
    } else {
      handleBroadcast();
    }
  };

  const proceedWithHighFee = () => {
    if (feeWarningCountdown > 0) return; // Prevent clicking during countdown
    setShowFeeWarning(false);
    // Mark that user already acknowledged the fee warning - prevents looping
    // if broadcast fails and user has to retry
    setFeeWarningAcknowledged(true);
    handleBroadcast();
  };

  const handleBroadcast = async () => {
    setError('');

    const amountSats = Math.floor(parseFloat(amount) * 100000000);

    // Keystore wallets show an in-app confirmation modal (browser wallets
    // surface their own popup at sign time, so we don't double-prompt).
    if (walletType === 'keystore') {
      if (!provider || !isInitialized) {
        setError(t('send.providerNotInitialized'));
        return;
      }
      if (!provider.walletIsLoaded()) {
        setError(t('send.walletNotLoaded'));
        return;
      }

      const approved = await requestConfirmation({
        type: 'send',
        title: t('send.confirmSend'),
        fromAmount: amount,
        fromSymbol: 'BTC',
        recipient: recipientAddress,
        feeRate: feeRate,
      });
      if (!approved) {
        setError(t('send.transactionRejected'));
        return;
      }
    }

    setStep('broadcasting');

    btcSendMutation.mutate(
      {
        recipientAddress: normalizedRecipientAddress,
        amountSats,
        feeRate,
        selectedUtxoKeys: Array.from(selectedUtxos),
        fromAddresses: btcFromAddresses,
      },
      {
        onSuccess: (result) => {
          const finalTxid = result.transactionId || '';
          setTxid(finalTxid);
          setStep('success');
          onSuccess?.(finalTxid);
          // Explicit refresh in addition to the mutation's queryClient
          // invalidation — useEnrichedWalletData has its own polling cycle
          // and benefits from an immediate nudge after a send.
          setTimeout(() => {
            refresh();
          }, 1000);
        },
        onError: (err: any) => {
          console.error('[SendModal] BTC send failed:', err);

          // Selected UTXOs disappeared between auto-select and broadcast
          // (likely spent by another session). Reset UI for re-selection.
          if (err instanceof BtcSendStaleUtxosError) {
            refresh();
            setSelectedUtxos(new Set());
            setShowFeeWarning(false);
            setStep('input');
            setError(t('send.utxosStale'));
            return;
          }

          const rawMessage = err?.message || String(err) || t('send.failedBroadcast');
          const friendlyMessage = humanizeError(rawMessage);
          showError(friendlyMessage);
          setError(friendlyMessage);
          // Go back to input step so user can re-select UTXOs and retry
          // without bouncing between confirm and error states.
          setSelectedUtxos(new Set());
          setShowFeeWarning(false);
          setStep('input');
        },
      },
    );
  };

  /**
   * Handle alkane token transfer
   * Uses factory Forward opcode (50) to transfer alkanes to recipient
   * Address strategy: Taproot for tokens, SegWit for BTC fees/change
   */
  const handleAlkaneBroadcast = async () => {
    setError('');
    setIsProcessing(true);

    try {
      if (!selectedAlkaneId) throw new Error(t('send.noAlkaneSelected'));

      const selectedAlkane = balances.alkanes.find(a => a.alkaneId === selectedAlkaneId);
      if (!selectedAlkane) throw new Error(t('send.alkaneNotFoundInBalances'));

      if (!validateAddress(recipientAddress)) throw new Error(t('send.invalidAddress'));

      const amountBaseUnits = getAlkaneSendAmountBaseUnits(selectedAlkane);
      if (amountBaseUnits === null || amountBaseUnits <= 0n) throw new Error(t('send.invalidAmount'));

      const sendable = getSendableAlkane(
        selectedAlkane.balance,
        pendingByAlkaneSend.get(selectedAlkane.alkaneId),
      );
      if (amountBaseUnits > sendable.availableRaw) {
        throw new Error(t('send.insufficientBalanceDetailed', {
          have: sendable.availableRaw.toString(),
          need: amountBaseUnits.toString(),
        }));
      }

      // Keystore confirmation modal — browser wallets surface their own popup at sign time.
      if (walletType === 'keystore') {
        const approved = await requestConfirmation({
          type: 'send',
          title: t('send.confirmAlkaneSend'),
          fromAmount: getAlkaneSendDisplayAmount(selectedAlkane),
          fromSymbol: selectedAlkane.symbol || 'ALKANE',
          recipient: recipientAddress,
          feeRate: feeRate,
        });
        if (!approved) {
          setError(t('send.transactionRejected'));
          return;
        }
      }

      const result = await alkaneSendMutation.mutateAsync({
        alkaneId: selectedAlkaneId,
        amountBaseUnits: amountBaseUnits.toString(),
        recipientAddress: normalizedRecipientAddress,
        feeRate,
      });

      // Browser wallets show the broadcasting spinner once signing completes.
      // Keystore goes straight to success since the SDK handled it internally.
      setStep('success');
      const finalTxid = result.transactionId || '';
      setTxid(finalTxid);
      onSuccess?.(finalTxid);
      setTimeout(() => { refresh(); }, 1000);
    } catch (err: any) {
      console.error('[SendModal] Alkane transfer failed:', err);

      const rawMessage = err?.message || String(err) || t('send.failedSendAlkanes');
      const friendlyMessage = humanizeError(rawMessage);
      showError(friendlyMessage);
      setError(friendlyMessage);
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDepositAmount = (amount: string, decs: number, symbol: string): string => {
    const val = BigInt(amount);
    const divisor = BigInt(10 ** decs);
    const whole = val / divisor;
    const remainder = val % divisor;
    const wholeStr = whole.toString();
    const remainderStr = remainder.toString().padStart(decs, '0');
    let formatted: string;
    if (whole >= BigInt(10000)) {
      formatted = wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    } else {
      const dp = wholeStr.length >= 3 ? 2 : 4;
      formatted = `${wholeStr}.${remainderStr.slice(0, dp)}`;
    }
    return symbol ? `${formatted} ${symbol}` : formatted;
  };

  const formatAlkaneBalance = (balance: string, decimals: number = 8, alkane?: { symbol: string; name: string; alkaneId?: string }): string => {
    const value = BigInt(balance);

    if (value === BigInt(1)) {
      if (alkane && alkane.alkaneId && isEnrichablePosition(alkane) && positionMeta?.[alkane.alkaneId]) {
        const meta = positionMeta[alkane.alkaneId];
        return formatDepositAmount(meta.depositAmount, meta.depositTokenDecimals, meta.depositTokenSymbol);
      }
      if (alkane && isStakedPosition(alkane)) return '1 Position';
      if (alkane && isLpToken(alkane)) return '1 Position';
      return '1 NFT';
    }

    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const remainder = value % divisor;
    const wholeStr = whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, '0');

    const isFrbtc = alkane && (alkane.symbol === 'frBTC' || alkane.name === 'frBTC');
    if (isFrbtc) {
      return `${wholeStr}.${remainderStr.slice(0, 8)}`;
    }

    if (whole >= BigInt(10000)) {
      return wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    const decimalPlaces = wholeStr.length >= 3 ? 2 : 4;
    const truncatedRemainder = remainderStr.slice(0, decimalPlaces);

    return `${wholeStr}.${truncatedRemainder}`;
  };

  const renderInput = () => (
    <>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
            {t('send.recipientAddress')}
          </label>
          <input
            data-testid="recipient-input"
            type="text"
            value={recipientAddress}
            onChange={(e) => {
              setRecipientAddress(e.target.value);
              // Clear any previous error when user starts typing
              if (error) setError('');
            }}
            placeholder="bc1q..."
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-base transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
            {t('send.amountBtc')}
          </label>
          <input
            data-testid="amount-input"
            type="number"
            step="0.00000001"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              // Reset fee warning acknowledgment when amount changes
              // so user sees warning again for new fee ratio
              setFeeWarningAcknowledged(false);
              // Clear any previous error when user starts typing
              if (error) setError('');
            }}
            placeholder="0.00000000"
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          />
          <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
            {t('send.available')} {(availableUtxos.reduce((sum, u) => sum + u.value, 0) / 100000000).toFixed(8)} BTC
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
            {t('send.feeRate')}
          </span>
          <div className="flex items-center gap-2">
            {feeSelection === 'custom' ? (
              <div className="relative">
                <input
                  aria-label="Custom fee rate"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={customFeeRate}
                  onChange={(e) => setCustomFeeRate(e.target.value)}
                  onFocus={() => setFocusedField('fee')}
                  onBlur={() => {
                    setFocusedField(null);
                    if (!customFeeRate) {
                      setCustomFeeRate(String(presets.medium));
                    }
                  }}
                  placeholder="0"
                  className="sf-pill-input"
                />
              </div>
            ) : (
              <span className="font-semibold text-[color:var(--sf-text)]">
                {Math.round(feeRate)}
              </span>
            )}
            <SendMinerFeeButton
              selection={feeSelection}
              setSelection={setFeeSelection}
              presets={presets}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-[color:var(--sf-info-red-bg)] p-4 text-sm text-[color:var(--sf-info-red-text)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <AlertCircle size={16} className="inline mr-2" />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          data-testid="send-submit"
          onClick={() => { handleNext(); }}
          className={`flex-1 px-4 py-3 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none font-bold uppercase tracking-wide bg-[color:var(--sf-primary)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-white`}
        >
          {t('send.reviewAndSend')}
        </button>
        <button
          onClick={handleClose}
          className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
        >
          {t('send.cancel')}
        </button>
      </div>
    </>
  );

  const renderAlkanesInput = () => (
    <>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
            {t('send.recipientAddress')}
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="bc1p..."
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-base transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          />
        </div>

        {/* Alkane Balances */}
        {balances.alkanes.length > 0 ? (
          <div>
            <label className="block mt-[25px] mb-[20px] text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60">
              <span className="flex items-center gap-1.5">
                <Coins size={14} />
                {t('send.selectAlkanes')}
              </span>
            </label>
            <div className="flex gap-4 mb-2">
              {(['tokens', 'positions', 'nfts'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAlkaneFilter(tab)}
                  className={`pb-2 px-1 text-xs font-semibold ${
                    alkaneFilter === tab
                      ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                      : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
                  }`}
                >
                  {tab === 'tokens' ? t('balances.tabTokens') : tab === 'nfts' ? t('balances.tabNfts') : t('balances.tabPositions')}
                </button>
              ))}
            </div>
            {(() => {
              let filtered = balances.alkanes.filter((a) => {
                if (alkaneFilter === 'positions') return isPosition(a);
                if (alkaneFilter === 'nfts') return isNft(a.balance) && !isPosition(a);
                return !isNft(a.balance) && !isPosition(a);
              });
              // Sort positions: LP tokens first, then alphabetically, then by number
              if (alkaneFilter === 'positions') {
                filtered = [...filtered].sort((a, b) => {
                  const aIsLp = isLpToken(a) ? 0 : 1;
                  const bIsLp = isLpToken(b) ? 0 : 1;
                  if (aIsLp !== bIsLp) return aIsLp - bIsLp;
                  const parsePositionName = (name: string) => {
                    const match = name.match(/^(.*?)(\d+)\s*$/);
                    if (match) return { prefix: match[1].trim(), num: parseInt(match[2], 10) };
                    return { prefix: name.trim(), num: -1 };
                  };
                  const pa = parsePositionName(a.name);
                  const pb = parsePositionName(b.name);
                  const cmp = pa.prefix.localeCompare(pb.prefix);
                  if (cmp !== 0) return cmp;
                  return pa.num - pb.num;
                });
              }
              if (alkaneFilter === 'nfts') {
                filtered = [...filtered].sort((a, b) => {
                  const parseNftName = (name: string) => {
                    const match = name.match(/^(.*?)(\d+)\s*$/);
                    if (match) return { prefix: match[1].trim(), num: parseInt(match[2], 10) };
                    return { prefix: name.trim(), num: -1 };
                  };
                  const pa = parseNftName(a.name);
                  const pb = parseNftName(b.name);
                  const cmp = pa.prefix.localeCompare(pb.prefix);
                  if (cmp !== 0) return cmp;
                  return pa.num - pb.num;
                });
              }
              return filtered.length > 0 ? (
                alkaneFilter === 'nfts' ? (
                <div className="overflow-y-auto max-h-[180px] rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] p-2">
                  <div className="grid grid-cols-4 gap-2">
                    {filtered.map((alkane) => {
                      const isSelected = selectedAlkaneId === alkane.alkaneId;
                      return (
                        <SendNftCard
                          key={alkane.alkaneId}
                          alkane={alkane}
                          isSelected={isSelected}
                          ref={isSelected ? selectedAlkaneRef : undefined}
                          onSelect={() => setSelectedAlkaneId(isSelected ? null : alkane.alkaneId)}
                          network={network}
                        />
                      );
                    })}
                  </div>
                </div>
                ) : (
                <div className="overflow-y-auto max-h-[180px] rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] p-2 space-y-1">
                  {filtered.map((alkane) => {
                    const isSelected = selectedAlkaneId === alkane.alkaneId;
                    return (
                      <button
                        key={alkane.alkaneId}
                        ref={isSelected ? selectedAlkaneRef : undefined}
                        type="button"
                        onClick={() => setSelectedAlkaneId(isSelected ? null : alkane.alkaneId)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-left ${
                          isSelected
                            ? 'bg-[color:var(--sf-primary)]/15'
                            : 'hover:bg-[color:var(--sf-primary)]/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {(() => {
                            const pool = poolMap.get(alkane.alkaneId);
                            if (pool) {
                              return (
                                <div className="flex -space-x-1.5">
                                  <div className="relative z-10">
                                    <TokenIcon symbol={pool.token0?.symbol} id={pool.token0?.id} size="sm" network={network} />
                                  </div>
                                  <div className="relative">
                                    <TokenIcon symbol={pool.token1?.symbol} id={pool.token1?.id} size="sm" network={network} />
                                  </div>
                                </div>
                              );
                            }
                            return <TokenIcon symbol={alkane.symbol} id={alkane.alkaneId} size="sm" network={network} />;
                          })()}
                          <div>
                            <div className="text-sm font-medium text-[color:var(--sf-text)]">
                              {(() => {
                                const pool = poolMap.get(alkane.alkaneId);
                                if (pool) return `${pool.token0?.symbol} / ${pool.token1?.symbol} LP`;
                                if (isEnrichablePosition(alkane) && positionMeta?.[alkane.alkaneId])
                                  return `${positionMeta[alkane.alkaneId].depositTokenName} ${alkane.name}`;
                                return alkane.name;
                              })()}
                            </div>
                            <div className="text-[10px] text-[color:var(--sf-text)]/40">{alkane.alkaneId}</div>
                          </div>
                        </div>
                        <div className="text-sm font-bold text-[color:var(--sf-text)]">
                          {formatAlkaneBalance(alkane.balance, alkane.decimals, alkane)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                )
              ) : (
                <div className="rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] p-4">
                  <div className="flex flex-col items-center justify-center gap-2 py-2">
                    <Coins size={24} className="text-blue-400/40" />
                    <span className="text-xs text-[color:var(--sf-text)]/40">
                      {alkaneFilter === 'tokens' ? t('balances.noProtorune') : alkaneFilter === 'nfts' ? t('balances.noNfts') : t('balances.noPositions')}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col items-center justify-center gap-3 py-4">
              <Coins size={32} className="text-blue-400/60" />
              <span className="text-sm font-semibold text-[color:var(--sf-text)]/60">{t('send.noAlkanes')}</span>
            </div>
          </div>
        )}

        {(() => {
          const selected = selectedAlkaneId ? balances.alkanes.find(a => a.alkaneId === selectedAlkaneId) : null;
          const selectedIsNft = selected ? isSendNft(selected) : false;
          return (
            <div>
              {!selectedIsNft && (
                <>
                  <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
                    {t('send.amountAlkanes')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    disabled={!selected}
                    className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </>
              )}
              {selected && (() => {
                // "Available" label MUST reflect spendable amount, not the
                // raw confirmed total. mork1e 2026-05-18: showing total
                // lets users try to send mempool-locked amounts, which then
                // fails at broadcast with cryptic "Insufficient alkanes".
                const sendable = getSendableAlkane(
                  selected.balance,
                  pendingByAlkaneSend.get(selected.alkaneId),
                );
                return (
                  <div className={`${selectedIsNft ? 'mt-0' : 'mt-1'} text-xs text-[color:var(--sf-text)]/60`}>
                    {t('send.available')} {formatAlkaneBalance(sendable.availableRaw.toString(), selected.decimals, selected)} {selected.name}
                    {sendable.mempoolRaw > 0n && (
                      <span className="ml-2 text-yellow-400/70">
                        ({formatAlkaneBalance(sendable.mempoolRaw.toString(), selected.decimals, selected)} {t('balances.mempool') || 'mempool'})
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        <div className="flex items-center justify-between rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
            {t('send.feeRate')}
          </span>
          <div className="flex items-center gap-2">
            {feeSelection === 'custom' ? (
              <div className="relative">
                <input
                  aria-label="Custom fee rate"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={customFeeRate}
                  onChange={(e) => setCustomFeeRate(e.target.value)}
                  onFocus={() => setFocusedField('fee')}
                  onBlur={() => {
                    setFocusedField(null);
                    if (!customFeeRate) {
                      setCustomFeeRate(String(presets.medium));
                    }
                  }}
                  placeholder="0"
                  className="sf-pill-input"
                />
              </div>
            ) : (
              <span className="font-semibold text-[color:var(--sf-text)]">
                {Math.round(feeRate)}
              </span>
            )}
            <SendMinerFeeButton
              selection={feeSelection}
              setSelection={setFeeSelection}
              presets={presets}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-[color:var(--sf-info-red-bg)] p-4 text-sm text-[color:var(--sf-info-red-text)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <AlertCircle size={16} className="inline mr-2" />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => { if (!isProcessing) { handleNext(); } }}
          disabled={(() => {
            if (!selectedAlkaneId || isProcessing) return true;
            const selected = balances.alkanes.find(a => a.alkaneId === selectedAlkaneId);
            return selected ? !isSendNft(selected) && !amount : true;
          })()}
          className={`flex-1 px-4 py-3 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--sf-primary)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-white`}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              {t('send.preparing')}
            </span>
          ) : t('send.reviewAndSend')}
        </button>
        <button
          onClick={handleClose}
          className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
        >
          {t('send.cancel')}
        </button>
      </div>
    </>
  );

  const renderConfirm = () => {
    const amountSats = Math.floor(parseFloat(amount) * 100000000);
    const total = amountSats + estimatedFee;

    return (
      <>
        <div className="space-y-4">
          {/* Inline High Fee Warning - shown above transaction details */}
          {showFeeWarning && (
            <div className={`rounded-xl bg-[color:var(--sf-info-red-bg)] border border-[color:var(--sf-info-red-border)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] ${feeWarningCountdown > 0 ? 'animate-pulse' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={20} className="text-[color:var(--sf-info-red-title)]" />
                <span className="font-bold text-[color:var(--sf-info-red-title)] uppercase tracking-wide">
                  {t('send.highFeeWarning')}
                </span>
              </div>
              <p className="text-sm text-[color:var(--sf-info-red-text)]">
                {t('send.highFeeDescription', { percent: total > 0 ? ((estimatedFee / total) * 100).toFixed(1) : '0.0' })}
              </p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] space-y-3">
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">{t('send.recipient')}</span>
              <span className="text-sm text-[color:var(--sf-text)] break-all ml-4">
                {recipientAddress}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">{t('send.amount')}</span>
              <span className="font-medium text-[color:var(--sf-text)]">{parseFloat(amount).toFixed(8)} BTC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">{t('send.feeRateLabel')}</span>
              <span className="text-[color:var(--sf-text)]">
                {estimatedFeeRate > 0 && Math.abs(estimatedFeeRate - feeRate) > 0.05
                  ? `~${estimatedFeeRate.toFixed(2)} sat/vB`
                  : `${feeRate} sat/vB`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">{t('send.estimatedFee')}</span>
              <span className="text-[color:var(--sf-text)]">{(estimatedFee / 100000000).toFixed(8)} BTC</span>
            </div>
            <div className="border-t border-[color:var(--sf-text)]/10 pt-2 flex justify-between">
              <span className="text-[color:var(--sf-text)]/80 font-medium">{t('send.total')}</span>
              <span className="text-[color:var(--sf-text)] font-medium">{(total / 100000000).toFixed(8)} BTC</span>
            </div>
          </div>

          {!showFeeWarning && (
            <div className="p-3 rounded-xl bg-[color:var(--sf-info-yellow-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm text-[color:var(--sf-info-yellow-text)]">
              {t('send.verifyWarning')}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-[color:var(--sf-info-red-bg)] p-4 text-sm text-[color:var(--sf-info-red-text)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <AlertCircle size={16} className="inline mr-2" />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setStep('input'); setShowFeeWarning(false); }}
            className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
          >
            {t('send.back')}
          </button>
          {showFeeWarning ? (
            <button
              onClick={proceedWithHighFee}
              disabled={feeWarningCountdown > 0}
              className={`flex-1 px-4 py-3 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)] font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] ${
                feeWarningCountdown > 0
                  ? 'bg-[color:var(--sf-info-red-bg)] text-[color:var(--sf-info-red-title)] cursor-not-allowed opacity-70'
                  : 'bg-[color:var(--sf-fee-warning-proceed-bg)] text-[color:var(--sf-fee-warning-proceed-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:transition-none'
              }`}
            >
              <Send size={18} />
              {feeWarningCountdown > 0 ? `${t('send.proceedAnyway')} (${feeWarningCountdown})` : t('send.proceedAnyway')}
            </button>
          ) : (
            <button
              onClick={() => { handleNext(); }}
              className={`flex-1 px-4 py-3 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none font-bold uppercase tracking-wide flex items-center justify-center gap-2 bg-[color:var(--sf-primary)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-white`}
            >
              <Send size={18} />
              {t('send.sendTransaction')}
            </button>
          )}
        </div>
      </>
    );
  };

  const renderBroadcasting = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="animate-spin text-[color:var(--sf-primary)] mb-4" size={48} />
      <div className="text-lg text-[color:var(--sf-text)]/80">{t('send.broadcasting')}</div>
      <div className="text-sm text-[color:var(--sf-text)]/60 mt-2">{t('send.pleaseWait')}</div>
    </div>
  );

  const renderSuccess = () => (
    <>
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <CheckCircle size={64} className="text-green-400" />
        <div className="text-xl font-bold text-[color:var(--sf-text)]">{t('send.transactionSent')}</div>

        <a
          href={`https://espo.sh/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3 hover:brightness-110 transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer relative"
        >
          <ExternalLink size={12} className="absolute top-3 right-3 text-[color:var(--sf-info-green-text)]/60" />
          <div className="text-xs text-[color:var(--sf-info-green-title)] mb-1">{t('send.transactionIdLabel')}</div>
          <div data-testid="txid" className="text-sm text-[color:var(--sf-info-green-text)] break-all pr-6">{txid}</div>
        </a>
      </div>

      <button
        onClick={handleClose}
        className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide"
      >
        {t('send.close')}
      </button>
    </>
  );

  return (
    <SfPopup
      ref={popupRef}
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="p-4"
      panelClassName="w-full max-w-md max-h-[90vh]"
      testId="send-modal"
      trackHeight
    >
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{sendMode === 'btc' ? t('send.title') : t('send.titleAlkanes')}</h2>
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* BTC / Alkanes toggle */}
          {(step === 'input') && (
            <div className="flex gap-4">
              {(['btc', 'alkanes'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab !== sendMode) {
                      setSendMode(tab);
                      setRecipientAddress('');
                      setAmount('');
                      setError('');
                      setSelectedUtxos(new Set());
                      setSelectedAlkaneId(null);
                    }
                  }}
                  className={`pb-1 px-1 text-sm font-semibold ${
                    sendMode === tab
                      ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                      : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
                  }`}
                >
                  {tab === 'btc' ? t('send.btcTab') : t('send.alkanesTab')}
                </button>
              ))}
            </div>
          )}

          {sendMode === 'btc' && (
            <>
              {step === 'input' && renderInput()}
              {step === 'confirm' && renderConfirm()}
              {step === 'broadcasting' && renderBroadcasting()}
              {step === 'success' && renderSuccess()}
            </>
          )}
          {sendMode === 'alkanes' && (
            <>
              {step === 'input' && renderAlkanesInput()}
              {step === 'confirm' && renderConfirm()}
              {step === 'broadcasting' && renderBroadcasting()}
              {step === 'success' && renderSuccess()}
            </>
          )}
        </div>
    </SfPopup>
  );
}

// --- NFT card helpers for SendModal ---

const SEND_NFT_GRADIENTS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-green-400 to-green-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-indigo-400 to-indigo-600',
  'from-teal-400 to-teal-600',
  'from-red-400 to-red-600',
];

function getSendNftImagePaths(symbol: string, id: string, _network: string): string[] {
  const paths: string[] = [];
  const symbolLower = symbol?.toLowerCase() || '';
  if (symbolLower === 'frbtc' || id === '32:0') { paths.push('/tokens/frbtc.svg'); return paths; }
  if (id === '2:0' || symbolLower === 'diesel') { paths.push('https://cdn.subfrost.io/alkanes/2_0'); return paths; }
  if (id && /^\d+:\d+/.test(id)) {
    const urlSafeId = id.replace(/:/g, '_');
    paths.push(`https://cdn.subfrost.io/alkanes/${urlSafeId}`);
  }
  return paths;
}

const SendNftCard = forwardRef<HTMLButtonElement, {
  alkane: AlkaneAsset;
  isSelected: boolean;
  onSelect: () => void;
  network: string;
}>(function SendNftCard({ alkane, isSelected, onSelect, network }, ref) {
  const [imgError, setImgError] = useState(false);
  const [pathIndex, setPathIndex] = useState(0);
  const paths = useMemo(() => getSendNftImagePaths(alkane.symbol, alkane.alkaneId, network), [alkane.symbol, alkane.alkaneId, network]);
  const currentSrc = paths[pathIndex];
  const hash = (alkane.symbol || alkane.alkaneId || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradient = SEND_NFT_GRADIENTS[hash % SEND_NFT_GRADIENTS.length];

  useEffect(() => { setPathIndex(0); setImgError(false); }, [alkane.alkaneId]);

  const handleImgError = () => {
    if (pathIndex < paths.length - 1) setPathIndex(pathIndex + 1);
    else setImgError(true);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={`rounded-lg overflow-hidden transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
        isSelected
          ? 'ring-2 ring-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/15'
          : 'hover:bg-[color:var(--sf-primary)]/5'
      }`}
    >
      <div className="aspect-square relative overflow-hidden">
        {!imgError && currentSrc ? (
          <img
            src={currentSrc}
            alt={alkane.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={handleImgError}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-white text-sm font-bold opacity-60">
              {(alkane.symbol || alkane.alkaneId || '??').slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-1 text-left">
        <div className="text-[10px] font-medium text-[color:var(--sf-text)] truncate">{alkane.name}</div>
        <div className="text-[8px] text-[color:var(--sf-text)]/40 truncate">{alkane.alkaneId}</div>
      </div>
    </button>
  );
});

function SendMinerFeeButton({ selection, setSelection, presets }: { selection: FeeSelection; setSelection: (s: FeeSelection) => void; presets: { slow: number; medium: number; fast: number } }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (s: FeeSelection) => {
    setSelection(s);
    setIsOpen(false);
  };

  const feeDisplayMap: Record<string, string> = {
    slow: t('send.slow'),
    medium: t('send.medium'),
    fast: t('send.fast'),
    custom: t('send.custom'),
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`sf-dropdown-trigger ${isOpen ? 'sf-dropdown-trigger--open' : ''}`}
      >
        <span>{feeDisplayMap[selection] || selection}</span>
        <ChevronDown size={12} className={`transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{feeDisplayMap[option] || option}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {presets[option as keyof typeof presets]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
