'use client';

import { useState, useEffect, useRef, useMemo, forwardRef } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader2, ChevronDown, Coins, ExternalLink } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import TokenIcon from '@/app/components/TokenIcon';
import { useFeeRate, FeeSelection } from '@/hooks/useFeeRate';
import { usePools } from '@/hooks/usePools';
import { useTranslation } from '@/hooks/useTranslation';
import { computeSendFee, estimateSelectionFee, DUST_THRESHOLD } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { injectRedeemScripts } from '@/lib/psbt-patching';
import { buildAlkaneTransferPsbt } from '@/lib/alkanes/buildAlkaneTransferPsbt';
import { buildTransferProtostone } from '@/lib/alkanes/builders';
import { getBitcoinNetwork } from '@/lib/alkanes/helpers';

bitcoin.initEccLib(ecc);

import { usePositionMetadata, isEnrichablePosition } from '@/hooks/usePositionMetadata';

import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAlkane?: AlkaneAsset | null;
}

interface UTXO {
  txid: string;
  vout: number;
  value: number;
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

export default function SendModal({ isOpen, onClose, initialAlkane }: SendModalProps) {
  const { address: taprootAddress, paymentAddress, network, walletType, account, signTaprootPsbt, signSegwitPsbt } = useWallet() as any;
  const { theme } = useTheme();
  // Address strategy:
  // - BTC sends: SegWit (paymentAddress) preferred for both send and change.
  //   For browser extension wallets that only expose a taproot address (e.g. Unisat
  //   in taproot mode), paymentAddress is empty — fall back to taprootAddress so the
  //   UTXO filter, esplora fetch, and change output all use the correct address.
  // - Alkane sends: Taproot (address) for token send/change, SegWit (paymentAddress) for BTC fees/change
  const btcSendAddress = paymentAddress || taprootAddress;
  const alkaneSendAddress = taprootAddress;
  const { provider, isInitialized } = useAlkanesSDK();
  const alkaneProvider = useSandshrewProvider();
  const { requestConfirmation } = useTransactionConfirm();
  const { t } = useTranslation();
  const { utxos, balances, refresh } = useEnrichedWalletData();
  const { selection: feeSelection, setSelection: setFeeSelection, custom: customFeeRate, setCustom: setCustomFeeRate, feeRate, presets } = useFeeRate({ storageKey: 'subfrost-send-fee-rate' });

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedUtxos, setSelectedUtxos] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'input' | 'confirm' | 'broadcasting' | 'success'>('input');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [sendMode, setSendMode] = useState<'btc' | 'alkanes'>('btc');
  const [selectedAlkaneId, setSelectedAlkaneId] = useState<string | null>(null);
  const [showFrozenUtxos, setShowFrozenUtxos] = useState(false);
  const [showFeeWarning, setShowFeeWarning] = useState(false);
  const [feeWarningCountdown, setFeeWarningCountdown] = useState(0);
  const [estimatedFee, setEstimatedFee] = useState(0);
  const [estimatedFeeRate, setEstimatedFeeRate] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [activePercent, setActivePercent] = useState<number | null>(null);

  // Progress bar helpers (matches SwapInputs pattern)
  const calculateBalanceUsage = () => {
    if (!amount) return 0;
    const amountNum = parseFloat(amount);
    if (!amountNum) return 0;

    if (sendMode === 'btc') {
      const totalBtc = availableUtxos.reduce((sum, u) => sum + u.value, 0) / 100000000;
      if (!totalBtc) return 0;
      return Math.min(100, Math.max(0, (amountNum / totalBtc) * 100));
    } else {
      const selected = selectedAlkaneId ? balances.alkanes.find(a => a.alkaneId === selectedAlkaneId) : null;
      if (!selected) return 0;
      const raw = parseFloat(selected.balance) / Math.pow(10, selected.decimals || 8);
      if (!raw) return 0;
      return Math.min(100, Math.max(0, (amountNum / raw) * 100));
    }
  };

  const balanceUsage = calculateBalanceUsage();

  const getBalanceColor = () => {
    if (balanceUsage === 0) return 'bg-green-500/20';
    if (balanceUsage < 25) return 'bg-green-500/40';
    if (balanceUsage < 50) return 'bg-green-500/60';
    if (balanceUsage < 75) return 'bg-green-500/80';
    if (balanceUsage < 95) return 'bg-green-500/90';
    return 'bg-green-500';
  };

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

  // Filter available UTXOs (only confirmed, from SegWit address, exclude frozen, inscriptions, runes, alkanes for simple BTC sends)
  const availableUtxos = utxos.all.filter((utxo) => {
    // Only include confirmed UTXOs - pending UTXOs cannot be reliably spent
    if (!utxo.status.confirmed) return false;
    // Only include UTXOs from the SegWit (payment) address for BTC sends
    if (utxo.address !== btcSendAddress) return false;

    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    if (frozenUtxos.has(utxoKey)) return showFrozenUtxos;
    if (utxo.inscriptions && utxo.inscriptions.length > 0) return false;
    if (utxo.runes && Object.keys(utxo.runes).length > 0) return false;
    if (utxo.alkanes && Object.keys(utxo.alkanes).length > 0) return false;
    return true;
  });

  // Debug: Log UTXO distribution
  console.log('[SendModal] BTC send address:', btcSendAddress);
  console.log('[SendModal] Total UTXOs:', utxos.all.length);
  console.log('[SendModal] UTXOs by address:', {
    btcSendAddress: utxos.all.filter(u => u.address === btcSendAddress).length,
    otherAddresses: utxos.all.filter(u => u.address !== btcSendAddress).length,
  });
  console.log('[SendModal] Available UTXOs for SegWit address:', availableUtxos.length);
  console.log('[SendModal] Total value available:', (availableUtxos.reduce((sum, u) => sum + u.value, 0) / 1e8).toFixed(8), 'BTC');

  const totalSelectedValue = Array.from(selectedUtxos)
    .map((key) => {
      const [txid, vout] = key.split(':');
      const utxo = availableUtxos.find((u) => u.txid === txid && u.vout.toString() === vout);
      return utxo ? utxo.value : 0;
    })
    .reduce((sum, val) => sum + val, 0);

  useEffect(() => {
    if (!isOpen) {
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

  if (!isOpen) return null;

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

        const amountFloat = parseFloat(amount);
        if (isNaN(amountFloat) || amountFloat <= 0) {
          setError(t('send.invalidAmount'));
          return;
        }

        // Convert to base units and check balance
        const decimals = selectedAlkane.decimals || 8;
        const amountBaseUnits = BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
        const balanceBaseUnits = BigInt(selectedAlkane.balance);

        if (amountBaseUnits > balanceBaseUnits) {
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
        const needed = amountSats + potentialFee;

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

      // Compute accurate fee accounting for dust threshold on change output
      const feeResult = computeSendFee({ inputCount: selected.size, sendAmount: amountSats, totalInputValue: total, feeRate: feeRateNum });
      const required = amountSats + feeResult.fee;

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

    // Safety checks:
    // 1. Fee is more than 2% of amount
    // 2. Fee is more than 0.01 BTC
    // 3. Fee rate is more than 1000 sat/vbyte
    // 4. Using more than 100 UTXOs
    const feePercentage = (estimatedFeeSats / amountSats) * 100;
    const feeTooHigh = estimatedFeeSats > 0.01 * 100000000; // 0.01 BTC
    const feeRateTooHigh = feeRateNum > 1000;
    const tooManyInputs = numInputs > 100;
    const feePercentageTooHigh = feePercentage > 2;

    if (feeTooHigh || feeRateTooHigh || tooManyInputs || feePercentageTooHigh) {
      setShowFeeWarning(true);
      setFeeWarningCountdown(3);
    } else {
      handleBroadcast();
    }
  };

  const proceedWithHighFee = () => {
    if (feeWarningCountdown > 0) return; // Prevent clicking during countdown
    setShowFeeWarning(false);
    handleBroadcast();
  };

  const handleBroadcast = async () => {
    setError('');

    try {
      const amountSats = Math.floor(parseFloat(amount) * 100000000);

      // For browser wallets, build and sign PSBT manually
      if (walletType === 'browser') {
        console.log('[SendModal] Browser wallet - building PSBT...');
        console.log('[SendModal] Recipient:', recipientAddress);
        console.log('[SendModal] Amount:', amount, 'BTC (', amountSats, 'sats)');
        console.log('[SendModal] Fee rate:', feeRate, 'sat/vB');
        console.log('[SendModal] From address:', btcSendAddress);

        // Fetch fresh UTXOs directly from esplora API to avoid stale cache issues
        console.log('[SendModal] Fetching fresh UTXOs from esplora...');
        const freshUtxosResponse = await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'esplora_address::utxo',
            params: [btcSendAddress],
            id: 1,
          }),
        });
        const freshUtxosJson = await freshUtxosResponse.json();
        const freshUtxos: Array<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }> =
          (freshUtxosJson.result || []).map((u: any) => ({
            txid: u.txid,
            vout: u.vout,
            value: u.value,
            status: u.status || { confirmed: true },
          }));

        console.log('[SendModal] Fresh UTXOs fetched:', freshUtxos.length);

        // Verify selected UTXOs still exist in fresh data
        const freshUtxoKeys = new Set(freshUtxos.map(u => `${u.txid}:${u.vout}`));
        const missingUtxos = Array.from(selectedUtxos).filter(key => !freshUtxoKeys.has(key));

        if (missingUtxos.length > 0) {
          console.error('[SendModal] Selected UTXOs no longer exist:', missingUtxos);
          // Invalidate cache and throw error so user can retry with fresh data
          await refresh();
          throw new Error(t('send.utxosStale'));
        }

        // Determine Bitcoin network
        const btcNetwork = getBitcoinNetwork(network);

        // Create PSBT
        const psbt = new bitcoin.Psbt({ network: btcNetwork });

        // Add inputs from selected UTXOs (now verified to exist in fresh data)
        let totalInputValue = 0;
        for (const utxoKey of Array.from(selectedUtxos)) {
          const [txid, voutStr] = utxoKey.split(':');
          const vout = parseInt(voutStr);

          // Use fresh UTXO data
          const freshUtxo = freshUtxos.find(u => u.txid === txid && u.vout === vout);
          if (!freshUtxo) {
            throw new Error(`UTXO not found in fresh data: ${utxoKey}`);
          }

          // Fetch transaction hex for witness UTXO via local API proxy (avoids CORS)
          const txHexUrl = `/api/esplora/tx/${txid}/hex?network=${network}`;
          console.log('[SendModal] Fetching tx hex from:', txHexUrl);

          const txHexResponse = await fetch(txHexUrl);
          if (!txHexResponse.ok) {
            throw new Error(`Failed to fetch transaction ${txid}: ${txHexResponse.statusText}`);
          }
          const txHex = await txHexResponse.text();
          const tx = bitcoin.Transaction.fromHex(txHex);

          psbt.addInput({
            hash: txid,
            index: vout,
            witnessUtxo: {
              script: tx.outs[vout].script,
              value: BigInt(freshUtxo.value),
            },
          });

          totalInputValue += freshUtxo.value;
        }

        // Add recipient output
        psbt.addOutput({
          address: normalizedRecipientAddress,
          value: BigInt(amountSats),
        });

        // Compute fee and change, accounting for dust threshold
        const txFeeResult = computeSendFee({ inputCount: psbt.txInputs.length, sendAmount: amountSats, totalInputValue, feeRate });

        if (txFeeResult.numOutputs === 2 && txFeeResult.change > 0) {
          psbt.addOutput({
            address: btcSendAddress,
            value: BigInt(txFeeResult.change),
          });
        }

        // Convert PSBT to base64 for signing
        let psbtBase64 = psbt.toBase64();
        console.log('[SendModal] PSBT created, signing with browser wallet...');

        // Inject redeemScript for P2SH-P2WPKH wallets (see lib/psbt-patching.ts)
        if (account?.nativeSegwit?.pubkey && btcSendAddress) {
          const psbtForPatch = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          const patched = injectRedeemScripts(psbtForPatch, {
            paymentAddress: btcSendAddress,
            pubkeyHex: account.nativeSegwit.pubkey,
            network: btcNetwork,
          });
          if (patched > 0) {
            console.log('[SendModal] BTC send: patched', patched, 'P2SH inputs with redeemScript');
          }
          psbtBase64 = psbtForPatch.toBase64();
        }

        // Browser wallets sign all input types in a single call.
        // Use signTaprootPsbt which has the Xverse direct-call bypass.
        const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

        // Show broadcasting spinner now that signing is complete
        setStep('broadcasting');

        // Finalize and extract transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const txObj = signedPsbt.extractTransaction();
        const txHex = txObj.toHex();
        const computedTxid = txObj.getId();

        // Log actual vsize and effective fee rate for verification
        const actualVsize = txObj.virtualSize();
        const actualFee = totalInputValue - amountSats - (txFeeResult.numOutputs === 2 ? txFeeResult.change : 0);
        console.log(`[SendModal] Actual vsize: ${actualVsize}, fee: ${actualFee} sats, effective rate: ${(actualFee / actualVsize).toFixed(2)} sat/vB`);
        console.log('[SendModal] Broadcasting...');

        // Broadcast using provider
        if (!alkaneProvider) {
          throw new Error(t('send.providerNotInitialized'));
        }

        const broadcastTxid = await alkaneProvider.broadcastTransaction(txHex);
        console.log('[SendModal] Transaction broadcast successful, txid:', broadcastTxid);

        setTxid(broadcastTxid || computedTxid);
        setStep('success');

        setTimeout(() => {
          refresh();
        }, 1000);

        return;
      }

      // For keystore wallets, use WASM provider
      if (!provider || !isInitialized) {
        throw new Error(t('send.providerNotInitialized'));
      }

      // Check if wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error(t('send.walletNotLoaded'));
      }

      // Request user confirmation before broadcasting
      console.log('[SendModal] Keystore wallet - requesting user confirmation...');
      const approved = await requestConfirmation({
        type: 'send',
        title: t('send.confirmSend'),
        fromAmount: amount,
        fromSymbol: 'BTC',
        recipient: recipientAddress,
        feeRate: feeRate,
      });

      if (!approved) {
        console.log('[SendModal] User rejected transaction');
        setError(t('send.transactionRejected'));
        return;
      }
      console.log('[SendModal] User approved transaction');

      setStep('broadcasting');

      console.log('[SendModal] Sending via WASM provider...');
      console.log('[SendModal] Recipient:', recipientAddress);
      console.log('[SendModal] Amount:', amount, 'BTC (', amountSats, 'sats)');
      console.log('[SendModal] Fee rate:', feeRate, 'sat/vB');
      console.log('[SendModal] From address:', btcSendAddress);

      // Use WASM provider's walletSend method
      const sendParams = {
        address: normalizedRecipientAddress,
        amount: amountSats,
        fee_rate: feeRate,
        from: [btcSendAddress],
        lock_alkanes: true,
        auto_confirm: true,
      };

      const result = await provider.walletSend(JSON.stringify(sendParams));

      console.log('[SendModal] Transaction broadcast result:', result);

      // Extract txid from result
      const txidResult = typeof result === 'string' ? result : result?.txid || result?.tx_id;
      if (!txidResult) {
        throw new Error(t('send.noTxidReturned'));
      }

      setTxid(txidResult);
      setStep('success');

      // Refresh wallet data
      setTimeout(() => {
        refresh();
      }, 1000);
    } catch (err: any) {
      console.error('[SendModal] Transaction failed:', err);

      let errorMessage = err.message || t('send.failedBroadcast');

      setError(errorMessage);
      setStep('confirm');
    }
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
      if (!alkaneProvider) {
        throw new Error(t('send.providerNotInitialized'));
      }

      if (!selectedAlkaneId) {
        throw new Error(t('send.noAlkaneSelected'));
      }

      const selectedAlkane = balances.alkanes.find(a => a.alkaneId === selectedAlkaneId);
      if (!selectedAlkane) {
        throw new Error(t('send.alkaneNotFoundInBalances'));
      }

      // Validate recipient address (should be Taproot for alkane receives)
      if (!validateAddress(recipientAddress)) {
        throw new Error(t('send.invalidAddress'));
      }

      // Convert amount to base units (respecting decimals)
      const decimals = selectedAlkane.decimals || 8;
      const amountFloat = parseFloat(amount);
      if (isNaN(amountFloat) || amountFloat <= 0) {
        throw new Error(t('send.invalidAmount'));
      }

      const amountBaseUnits = BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
      const balanceBaseUnits = BigInt(selectedAlkane.balance);

      if (amountBaseUnits > balanceBaseUnits) {
        throw new Error(t('send.insufficientBalanceDetailed', {
          have: selectedAlkane.balance,
          need: amountBaseUnits.toString(),
        }));
      }

      console.log('[SendModal] Starting alkane transfer...');
      console.log('[SendModal] Alkane:', selectedAlkaneId, selectedAlkane.symbol);
      console.log('[SendModal] Amount:', amountBaseUnits.toString(), 'base units');
      console.log('[SendModal] Recipient:', recipientAddress);
      console.log('[SendModal] Fee rate:', feeRate, 'sat/vB');

      // For keystore wallets, request user confirmation before signing
      if (walletType === 'keystore') {
        console.log('[SendModal] Keystore wallet - requesting user confirmation...');
        const approved = await requestConfirmation({
          type: 'send',
          title: t('send.confirmAlkaneSend'),
          fromAmount: amount,
          fromSymbol: selectedAlkane.symbol || 'ALKANE',
          recipient: recipientAddress,
          feeRate: feeRate,
        });

        if (!approved) {
          console.log('[SendModal] User rejected transaction');
          setError(t('send.transactionRejected'));
          return;
        }
        console.log('[SendModal] User approved transaction');
      }

      // Determine Bitcoin network for PSBT operations
      const btcNetwork = getBitcoinNetwork(network);

      // Determine wallet mode
      const hasBothAddresses = !!btcSendAddress && !!alkaneSendAddress && btcSendAddress !== alkaneSendAddress;
      const isSingleAddressMode = !hasBothAddresses;
      const primaryAddress = alkaneSendAddress || btcSendAddress;
      const primaryAddressType = detectAddressType(primaryAddress);

      console.log('[SendModal] Wallet mode:', isSingleAddressMode
        ? `Single-address (${primaryAddressType.type})`
        : `Dual-address`);

      // Build PSBT in pure JS (bypasses WASM/metashrew entirely)
      const { psbtBase64: rawPsbtBase64, estimatedFee } = await buildAlkaneTransferPsbt({
        alkaneId: selectedAlkaneId,
        amount: amountBaseUnits,
        senderTaprootAddress: alkaneSendAddress,
        senderPaymentAddress: hasBothAddresses ? btcSendAddress : undefined,
        recipientAddress: normalizedRecipientAddress,
        tapInternalKeyHex: account?.taproot?.pubKeyXOnly,
        paymentPubkeyHex: account?.nativeSegwit?.pubkey,
        feeRate,
        network: btcNetwork,
        networkName: network,
      });

      console.log('[SendModal] Built PSBT (JS), estimated fee:', estimatedFee, 'sats');

      // Inject redeemScripts for P2SH-P2WPKH wallets (Xverse) if needed
      let psbtBase64 = rawPsbtBase64;
      if (btcSendAddress && account?.nativeSegwit?.pubkey &&
          (btcSendAddress.startsWith('3') || btcSendAddress.startsWith('2'))) {
        const psbtObj = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
        const patched = injectRedeemScripts(psbtObj, {
          paymentAddress: btcSendAddress,
          pubkeyHex: account.nativeSegwit.pubkey,
          network: btcNetwork,
        });
        if (patched > 0) {
          console.log('[SendModal] Injected redeemScript into', patched, 'P2SH inputs');
        }
        psbtBase64 = psbtObj.toBase64();
      }

      const isBrowserWallet = walletType === 'browser';

      // Sign the PSBT
      let signedPsbtBase64: string;
      if (isBrowserWallet) {
        console.log('[SendModal] Browser wallet: signing all inputs in single call...');
        signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
      } else if (isSingleAddressMode) {
        console.log(`[SendModal] Signing PSBT with ${primaryAddressType.signingMethod} key (single-address mode)...`);
        if (primaryAddressType.signingMethod === 'taproot') {
          signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
        } else {
          signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
        }
      } else {
        console.log('[SendModal] Keystore: signing with both keys...');
        signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
        signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
      }

      // Show broadcasting spinner now that signing is complete
      setStep('broadcasting');

      // Parse the signed PSBT, finalize, and extract the raw transaction
      const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
      signedPsbt.finalizeAllInputs();

      const tx = signedPsbt.extractTransaction();
      const txHex = tx.toHex();
      const computedTxid = tx.getId();

      console.log('[SendModal] Transaction ID:', computedTxid);

      // Broadcast the transaction
      console.log('[SendModal] Broadcasting transaction...');
      const broadcastTxid = await alkaneProvider.broadcastTransaction(txHex);
      console.log('[SendModal] Transaction broadcast successful, txid:', broadcastTxid);

      setTxid(broadcastTxid || computedTxid);
      setStep('success');

      setTimeout(() => {
        refresh();
      }, 1000);

    } catch (err: any) {
      console.error('[SendModal] Alkane transfer failed:', err);

      let errorMessage = err.message || t('send.failedSendAlkanes');
      setError(errorMessage);
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
            onChange={(e) => setRecipientAddress(e.target.value)}
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
            onChange={(e) => { setAmount(e.target.value); setActivePercent(null); }}
            placeholder="0.00000000"
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          />
          <div className="mt-1 flex flex-col items-end gap-1">
            <div className="flex items-center justify-between w-full">
              <div
                className={`max-w-[45%] flex-1 mr-3 h-1 rounded-full overflow-hidden ${
                  balanceUsage > 0
                    ? theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                    : ''
                }`}
              >
                {balanceUsage > 0 && (
                  <div
                    className={`h-full ${getBalanceColor()} transition-all duration-[200ms]`}
                    style={{ width: `${balanceUsage}%` }}
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {[0.25, 0.5, 0.75].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      const totalSats = availableUtxos.reduce((sum, u) => sum + u.value, 0);
                      setAmount((totalSats * pct / 100000000).toFixed(8));
                      setActivePercent(pct);
                    }}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                      activePercent === pct
                        ? "bg-[color:var(--sf-primary)]/20"
                        : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`
                    }`}
                  >
                    {pct * 100}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const totalSats = availableUtxos.reduce((sum, u) => sum + u.value, 0);
                    setAmount((totalSats / 100000000).toFixed(8));
                    setActivePercent(1);
                  }}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                    activePercent === 1
                      ? "bg-[color:var(--sf-primary)]/20"
                      : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`
                  }`}
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/60">
              {t('send.available')} {(availableUtxos.reduce((sum, u) => sum + u.value, 0) / 100000000).toFixed(8)} BTC
            </div>
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
                  style={{ outline: 'none', border: 'none' }}
                  className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[200ms] ${focusedField === 'fee' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
          onClick={onClose}
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
            <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
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
          return (
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
                {t('send.amountAlkanes')}
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setActivePercent(null); }}
                placeholder="0"
                disabled={!selected}
                className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {selected && (
                <div className="mt-1 flex flex-col items-end gap-1">
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`max-w-[45%] flex-1 mr-3 h-1 rounded-full overflow-hidden ${
                        balanceUsage > 0
                          ? theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                          : ''
                      }`}
                    >
                      {balanceUsage > 0 && (
                        <div
                          className={`h-full ${getBalanceColor()} transition-all duration-[200ms]`}
                          style={{ width: `${balanceUsage}%` }}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[0.25, 0.5, 0.75].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            const raw = parseFloat(selected.balance) / Math.pow(10, selected.decimals || 8);
                            setAmount((raw * pct).toString());
                            setActivePercent(pct);
                          }}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                            activePercent === pct
                              ? "bg-[color:var(--sf-primary)]/20"
                              : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`
                          }`}
                        >
                          {pct * 100}%
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const raw = parseFloat(selected.balance) / Math.pow(10, selected.decimals || 8);
                          setAmount(raw.toString());
                          setActivePercent(1);
                        }}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                          activePercent === 1
                            ? "bg-[color:var(--sf-primary)]/20"
                            : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`
                        }`}
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--sf-text)]/60">
                    {t('send.available')} {formatAlkaneBalance(selected.balance, selected.decimals, selected)} {selected.name}
                  </div>
                </div>
              )}
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
                  style={{ outline: 'none', border: 'none' }}
                  className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[200ms] ${focusedField === 'fee' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
          disabled={!selectedAlkaneId || !amount || isProcessing}
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
          onClick={onClose}
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
        onClick={onClose}
        className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide"
      >
        {t('send.close')}
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div data-testid="send-modal" className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{sendMode === 'btc' ? t('send.title') : t('send.titleAlkanes')}</h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
      </div>

    </div>
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
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all duration-[200ms] focus:outline-none ${isOpen ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
