'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader2, ChevronDown, Coins } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import TokenIcon from '@/app/components/TokenIcon';
import { useFeeRate, FeeSelection } from '@/hooks/useFeeRate';
import { usePools } from '@/hooks/usePools';
import { useTranslation } from '@/hooks/useTranslation';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

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

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Build protostone for alkane transfer using factory Forward opcode (50)
 * The Forward opcode simply passes incoming alkanes to the specified output
 */
function buildTransferProtostone(params: {
  factoryId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { factoryId, pointer = 'v0', refund = 'v0' } = params;
  const [factoryBlock, factoryTx] = factoryId.split(':');

  // Factory opcode 50 = Forward (passes incoming alkanes to output)
  const cellpack = [factoryBlock, factoryTx, 50].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

export default function SendModal({ isOpen, onClose, initialAlkane }: SendModalProps) {
  const { address: taprootAddress, paymentAddress, network, walletType, signTaprootPsbt, signSegwitPsbt } = useWallet() as any;
  // Address strategy:
  // - BTC sends: SegWit only (paymentAddress) for both send and change
  // - Alkane sends: Taproot (address) for token send/change, SegWit (paymentAddress) for BTC fees/change
  const btcSendAddress = paymentAddress;
  const alkaneSendAddress = taprootAddress;
  const { provider, isInitialized } = useAlkanesSDK();
  const alkaneProvider = useSandshrewProvider();
  const { requestConfirmation } = useTransactionConfirm();
  const { ALKANE_FACTORY_ID } = getConfig(network);
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
  const [alkaneFilter, setAlkaneFilter] = useState<'tokens' | 'nfts' | 'positions'>('tokens');
  const selectedAlkaneRef = useRef<HTMLButtonElement>(null);

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

  // Filter available UTXOs (only from SegWit address, exclude frozen, inscriptions, runes, alkanes for simple BTC sends)
  const availableUtxos = utxos.all.filter((utxo) => {
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
  console.log('[SendModal] BTC send address (SegWit):', btcSendAddress);
  console.log('[SendModal] Total UTXOs:', utxos.all.length);
  console.log('[SendModal] UTXOs by address:', {
    segwitAddress: utxos.all.filter(u => u.address === btcSendAddress).length,
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

  if (!isOpen) return null;

  const validateAddress = (addr: string): boolean => {
    // Basic Bitcoin address validation
    if (!addr) return false;
    
    // Bech32 (native segwit)
    if (addr.startsWith('bc1') || addr.startsWith('tb1') || addr.startsWith('bcrt1')) {
      return addr.length >= 42 && addr.length <= 90;
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
          setError(t('send.selectAlkane') || 'Please select an alkane to send');
          return;
        }

        const selectedAlkane = balances.alkanes.find(a => a.alkaneId === selectedAlkaneId);
        if (!selectedAlkane) {
          setError('Selected alkane not found');
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
          setError(t('send.insufficientBalance') || 'Insufficient balance');
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

      // Estimate fee based on number of inputs
      // Each input is ~180 vbytes, output is ~34 vbytes
      const estimateFee = (numInputs: number) => {
        const size = numInputs * 180 + 2 * 34 + 10; // 2 outputs (recipient + change)
        return size * feeRateNum;
      };

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

      const finalFee = estimateFee(selected.size);
      const required = amountSats + finalFee;

      if (total < required) {
        // Check if we have enough total balance
        const totalAvailable = availableUtxos.reduce((sum, u) => sum + u.value, 0);
        if (totalAvailable >= required) {
          setError(
            `Cannot send this amount (hit ${MAX_UTXOS} UTXO limit). ` +
            `Need ${(required / 100000000).toFixed(8)} BTC, but can only use ${(total / 100000000).toFixed(8)} BTC with ${MAX_UTXOS} UTXOs. ` +
            `Total available: ${(totalAvailable / 100000000).toFixed(8)} BTC. ` +
            `Try sending a smaller amount.`
          );
        } else {
          setError(`Insufficient funds. Need ${(required / 100000000).toFixed(8)} BTC, have ${(totalAvailable / 100000000).toFixed(8)} BTC`);
        }
        return;
      }

      console.log(`[SendModal] Auto-selected ${selected.size} UTXOs, total: ${(total / 100000000).toFixed(8)} BTC, estimated fee: ${(finalFee / 100000000).toFixed(8)} BTC`);

      setSelectedUtxos(selected);
      setStep('confirm');
    } else if (step === 'confirm') {
      // Check if fee looks suspicious before broadcasting
      checkFeeAndBroadcast();
    }
  };

  const checkFeeAndBroadcast = () => {
    const amountSats = Math.floor(parseFloat(amount) * 100000000);
    const feeRateNum = feeRate;
    
    // Estimate transaction size: ~180 bytes per input + ~34 bytes per output + ~10 bytes overhead
    const numInputs = selectedUtxos.size;
    const numOutputs = 2; // recipient + change
    const estimatedSize = numInputs * 180 + numOutputs * 34 + 10;
    const estimatedFeeSats = estimatedSize * feeRateNum;
    const calculatedFeeRate = totalSelectedValue > amountSats 
      ? estimatedFeeSats / (totalSelectedValue - amountSats) 
      : 0;

    setEstimatedFee(estimatedFeeSats);
    setEstimatedFeeRate(calculatedFeeRate);

    // Safety checks:
    // 1. Fee is more than 1% of amount
    // 2. Fee is more than 0.01 BTC
    // 3. Fee rate is more than 1000 sat/vbyte
    // 4. Using more than 100 UTXOs
    const feePercentage = (estimatedFeeSats / amountSats) * 100;
    const feeTooHigh = estimatedFeeSats > 0.01 * 100000000; // 0.01 BTC
    const feeRateTooHigh = feeRateNum > 1000;
    const tooManyInputs = numInputs > 100;
    const feePercentageTooHigh = feePercentage > 1;

    if (feeTooHigh || feeRateTooHigh || tooManyInputs || feePercentageTooHigh) {
      setShowFeeWarning(true);
      setFeeWarningCountdown(3);
    } else {
      handleBroadcast();
    }
  };

  // Countdown timer for fee warning
  useEffect(() => {
    if (feeWarningCountdown > 0) {
      const timer = setTimeout(() => {
        setFeeWarningCountdown(feeWarningCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [feeWarningCountdown]);

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
        console.log('[SendModal] From address (SegWit):', btcSendAddress);

        setStep('broadcasting');

        // Determine Bitcoin network
        let btcNetwork: bitcoin.Network;
        switch (network) {
          case 'mainnet':
            btcNetwork = bitcoin.networks.bitcoin;
            break;
          case 'testnet':
          case 'signet':
            btcNetwork = bitcoin.networks.testnet;
            break;
          case 'regtest':
          case 'regtest-local':
          case 'subfrost-regtest':
          case 'oylnet':
          default:
            btcNetwork = bitcoin.networks.regtest;
            break;
        }

        // Create PSBT
        const psbt = new bitcoin.Psbt({ network: btcNetwork });

        // Calculate total needed (amount + estimated fee)
        const estimatedFeeForCalculation = selectedUtxos.size * 180 * feeRate + 2 * 34 * feeRate + 10 * feeRate;
        const totalNeeded = amountSats + estimatedFeeForCalculation;

        // Add inputs from selected UTXOs
        let totalInputValue = 0;
        for (const utxoKey of Array.from(selectedUtxos)) {
          const [txid, voutStr] = utxoKey.split(':');
          const vout = parseInt(voutStr);
          const utxo = availableUtxos.find(u => u.txid === txid && u.vout === vout);

          if (!utxo) {
            throw new Error(`UTXO not found: ${utxoKey}`);
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
              value: BigInt(utxo.value),
            },
          });

          totalInputValue += utxo.value;
        }

        // Add recipient output
        psbt.addOutput({
          address: recipientAddress,
          value: BigInt(amountSats),
        });

        // Add change output if needed
        const actualFee = Math.ceil(psbt.txInputs.length * 180 * feeRate + 2 * 34 * feeRate + 10 * feeRate);
        const change = totalInputValue - amountSats - actualFee;

        if (change > 546) { // Dust threshold
          psbt.addOutput({
            address: btcSendAddress,
            value: BigInt(change),
          });
        }

        // Convert PSBT to base64 for signing
        const psbtBase64 = psbt.toBase64();
        console.log('[SendModal] PSBT created, signing with browser wallet...');

        // Sign with browser wallet (SegWit)
        const signedPsbtBase64 = await signSegwitPsbt(psbtBase64);

        // Finalize and extract transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const computedTxid = tx.getId();

        console.log('[SendModal] Transaction signed, txid:', computedTxid);
        console.log('[SendModal] Broadcasting...');

        // Broadcast using provider
        if (!alkaneProvider) {
          throw new Error('Provider not initialized');
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
        throw new Error('Provider not initialized. Please wait and try again.');
      }

      // Check if wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded. Please reconnect your wallet.');
      }

      // Request user confirmation before broadcasting
      console.log('[SendModal] Keystore wallet - requesting user confirmation...');
      const approved = await requestConfirmation({
        type: 'send',
        title: 'Confirm Send',
        fromAmount: amount,
        fromSymbol: 'BTC',
        recipient: recipientAddress,
        feeRate: feeRate,
      });

      if (!approved) {
        console.log('[SendModal] User rejected transaction');
        setError('Transaction rejected by user');
        return;
      }
      console.log('[SendModal] User approved transaction');

      setStep('broadcasting');

      console.log('[SendModal] Sending via WASM provider...');
      console.log('[SendModal] Recipient:', recipientAddress);
      console.log('[SendModal] Amount:', amount, 'BTC (', amountSats, 'sats)');
      console.log('[SendModal] Fee rate:', feeRate, 'sat/vB');
      console.log('[SendModal] From address (SegWit):', btcSendAddress);

      // Use WASM provider's walletSend method
      const sendParams = {
        address: recipientAddress,
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
        throw new Error('Transaction sent but no txid returned');
      }

      setTxid(txidResult);
      setStep('success');

      // Refresh wallet data
      setTimeout(() => {
        refresh();
      }, 1000);
    } catch (err: any) {
      console.error('[SendModal] Transaction failed:', err);

      let errorMessage = err.message || 'Failed to broadcast transaction';

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

    try {
      if (!alkaneProvider) {
        throw new Error('Provider not initialized. Please wait and try again.');
      }

      if (!selectedAlkaneId) {
        throw new Error('No alkane selected');
      }

      const selectedAlkane = balances.alkanes.find(a => a.alkaneId === selectedAlkaneId);
      if (!selectedAlkane) {
        throw new Error('Selected alkane not found in balances');
      }

      // Validate recipient address (should be Taproot for alkane receives)
      if (!validateAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }

      // Convert amount to base units (respecting decimals)
      const decimals = selectedAlkane.decimals || 8;
      const amountFloat = parseFloat(amount);
      if (isNaN(amountFloat) || amountFloat <= 0) {
        throw new Error('Invalid amount');
      }

      const amountBaseUnits = BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
      const balanceBaseUnits = BigInt(selectedAlkane.balance);

      if (amountBaseUnits > balanceBaseUnits) {
        throw new Error(`Insufficient balance. Have ${selectedAlkane.balance}, need ${amountBaseUnits.toString()}`);
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
          title: 'Confirm Alkane Send',
          fromAmount: amount,
          fromSymbol: selectedAlkane.symbol || 'ALKANE',
          recipient: recipientAddress,
          feeRate: feeRate,
        });

        if (!approved) {
          console.log('[SendModal] User rejected transaction');
          setError('Transaction rejected by user');
          return;
        }
        console.log('[SendModal] User approved transaction');
      }

      setStep('broadcasting');

      // Build the protostone for alkane transfer using factory Forward opcode
      const protostone = buildTransferProtostone({
        factoryId: ALKANE_FACTORY_ID,
        pointer: 'v0', // Output to recipient
        refund: 'v0',  // Refund to recipient (or we could use a separate change address)
      });

      // Build input requirements: alkaneId:amount
      const [alkaneBlock, alkaneTx] = selectedAlkaneId.split(':');
      const inputRequirements = `${alkaneBlock}:${alkaneTx}:${amountBaseUnits.toString()}`;

      console.log('[SendModal] Protostone:', protostone);
      console.log('[SendModal] Input requirements:', inputRequirements);

      // Determine Bitcoin network for PSBT operations
      let btcNetwork: bitcoin.Network;
      switch (network) {
        case 'mainnet':
          btcNetwork = bitcoin.networks.bitcoin;
          break;
        case 'testnet':
        case 'signet':
          btcNetwork = bitcoin.networks.testnet;
          break;
        case 'regtest':
        case 'regtest-local':
        case 'subfrost-regtest':
        case 'oylnet':
        default:
          btcNetwork = bitcoin.networks.regtest;
          break;
      }

      // Build from addresses array - use both Taproot (for alkanes) and SegWit (for fees)
      const fromAddresses: string[] = [];
      if (btcSendAddress) fromAddresses.push(btcSendAddress); // SegWit for fees
      if (alkaneSendAddress) fromAddresses.push(alkaneSendAddress); // Taproot for alkanes

      console.log('[SendModal] From addresses:', fromAddresses);
      console.log('[SendModal] Recipient (toAddresses[0]):', recipientAddress);

      // Execute the alkane transfer
      const result = await alkaneProvider.alkanesExecuteTyped({
        inputRequirements,
        protostones: protostone,
        feeRate,
        autoConfirm: false, // We handle signing manually
        fromAddresses,
        toAddresses: [recipientAddress], // Alkanes go to recipient
        changeAddress: btcSendAddress, // BTC change to SegWit
        alkanesChangeAddress: alkaneSendAddress, // Alkane change to Taproot
      });

      console.log('[SendModal] Execute result:', JSON.stringify(result, null, 2));

      // Check if we got a readyToSign state (need to sign PSBT manually)
      if (result?.readyToSign) {
        console.log('[SendModal] Got readyToSign state, signing transaction...');
        const readyToSign = result.readyToSign;

        // Convert PSBT to base64
        let psbtBase64: string;
        if (readyToSign.psbt instanceof Uint8Array) {
          psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
        } else if (typeof readyToSign.psbt === 'string') {
          psbtBase64 = readyToSign.psbt;
        } else if (typeof readyToSign.psbt === 'object') {
          // PSBT came back as object with numeric keys
          const keys = Object.keys(readyToSign.psbt).map(Number).sort((a, b) => a - b);
          const bytes = new Uint8Array(keys.length);
          for (let i = 0; i < keys.length; i++) {
            bytes[i] = readyToSign.psbt[keys[i]];
          }
          psbtBase64 = uint8ArrayToBase64(bytes);
        } else {
          throw new Error('Unexpected PSBT format: ' + typeof readyToSign.psbt);
        }

        console.log('[SendModal] PSBT base64 length:', psbtBase64.length);

        // Sign the PSBT with both keys (SegWit for fees, Taproot for alkanes)
        console.log('[SendModal] Signing PSBT with SegWit key first, then Taproot key...');
        let signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
        signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        console.log('[SendModal] PSBT signed with both keys');

        // Parse the signed PSBT, finalize, and extract the raw transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

        // Finalize all inputs
        console.log('[SendModal] Finalizing PSBT...');
        signedPsbt.finalizeAllInputs();

        // Extract the raw transaction
        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const computedTxid = tx.getId();

        console.log('[SendModal] Transaction ID:', computedTxid);
        console.log('[SendModal] Transaction hex length:', txHex.length);

        // Broadcast the transaction
        console.log('[SendModal] Broadcasting transaction...');
        const broadcastTxid = await alkaneProvider.broadcastTransaction(txHex);
        console.log('[SendModal] Transaction broadcast successful');
        console.log('[SendModal] Broadcast returned txid:', broadcastTxid);

        setTxid(broadcastTxid || computedTxid);
        setStep('success');

        // Refresh wallet data
        setTimeout(() => {
          refresh();
        }, 1000);

        return;
      }

      // Check if SDK auto-completed the transaction
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[SendModal] Transaction auto-completed, txid:', txId);
        setTxid(txId);
        setStep('success');

        setTimeout(() => {
          refresh();
        }, 1000);

        return;
      }

      // Check if execution completed directly
      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        console.log('[SendModal] Execution complete, txid:', txId);
        setTxid(txId);
        setStep('success');

        setTimeout(() => {
          refresh();
        }, 1000);

        return;
      }

      // No txid found
      console.error('[SendModal] No txid found in result:', result);
      throw new Error('Alkane transfer did not return a transaction ID');

    } catch (err: any) {
      console.error('[SendModal] Alkane transfer failed:', err);

      let errorMessage = err.message || 'Failed to send alkanes';
      setError(errorMessage);
      setStep('input');
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
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-base transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
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
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00000000"
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
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
                  style={{ outline: 'none', border: 'none' }}
                  className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'fee' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
          onClick={handleNext}
          className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide"
        >
          {t('send.reviewAndSend')}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
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
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-base transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
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
              // Sort positions: LP tokens first, then staked positions
              if (alkaneFilter === 'positions') {
                filtered = [...filtered].sort((a, b) => {
                  const aIsLp = isLpToken(a) ? 0 : 1;
                  const bIsLp = isLpToken(b) ? 0 : 1;
                  return aIsLp - bIsLp;
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
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-left ${
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
                                return alkane.symbol || alkane.name;
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
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                disabled={!selected}
                className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {selected && (
                <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
                  {t('send.available')} {formatAlkaneBalance(selected.balance, selected.decimals, selected)} {selected.symbol}
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
                  className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'fee' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleNext}
          disabled={!selectedAlkaneId || !amount}
          className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('send.reviewAndSend')}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
        >
          {t('send.cancel')}
        </button>
      </div>
    </>
  );

  const renderConfirm = () => {
    const amountSats = Math.floor(parseFloat(amount) * 100000000);
    const localEstimatedFee = 150 * feeRate; // Rough estimate for display before warning
    const total = amountSats + (showFeeWarning ? estimatedFee : localEstimatedFee);
    const feePercentage = showFeeWarning ? ((estimatedFee / amountSats) * 100).toFixed(2) : null;

    return (
      <>
        <div className="space-y-4">
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
              <span className="text-[color:var(--sf-text)]">{feeRate} sat/vB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">{t('send.estimatedFee')}</span>
              <span className="text-[color:var(--sf-text)]">{((showFeeWarning ? estimatedFee : localEstimatedFee) / 100000000).toFixed(8)} BTC</span>
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

          {/* Inline High Fee Warning */}
          {showFeeWarning && (
            <div className={`rounded-xl bg-[color:var(--sf-info-red-bg)] border border-[color:var(--sf-info-red-border)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] ${feeWarningCountdown > 0 ? 'animate-pulse' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={20} className="text-[color:var(--sf-info-red-title)]" />
                <span className="font-bold text-[color:var(--sf-info-red-title)] uppercase tracking-wide">
                  {t('send.highFeeWarning')}
                </span>
              </div>
              <p className="text-sm text-[color:var(--sf-info-red-text)] mb-3">
                {t('send.highFeeDescription')}
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[color:var(--sf-info-red-text)]">{t('send.estimatedFee')}</span>
                  <span className="text-[color:var(--sf-info-red-title)] font-semibold">{(estimatedFee / 100000000).toFixed(8)} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--sf-info-red-text)]">Fee Percentage:</span>
                  <span className="text-[color:var(--sf-info-red-title)] font-semibold">{feePercentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--sf-info-red-text)]">Number of Inputs:</span>
                  <span className="text-[color:var(--sf-info-red-title)] font-semibold">{selectedUtxos.size}</span>
                </div>
              </div>
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
            className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
          >
            {t('send.back')}
          </button>
          {showFeeWarning ? (
            <button
              onClick={proceedWithHighFee}
              disabled={feeWarningCountdown > 0}
              className={`flex-1 px-4 py-3 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)] font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] ${
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
              onClick={handleNext}
              className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide flex items-center justify-center gap-2"
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

        <div className="w-full p-4 rounded-xl bg-green-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="text-sm text-green-600 dark:text-green-200 mb-2">{t('send.transactionIdLabel')}</div>
          <div data-testid="txid" className="text-xs text-[color:var(--sf-text)] break-all">{txid}</div>
        </div>

        <a
          href={`https://mempool.space/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--sf-primary)] hover:opacity-80 text-sm"
        >
          {t('send.viewOnExplorer')}
        </a>
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide"
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
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
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

function getSendNftImagePaths(symbol: string, id: string, network: string): string[] {
  const paths: string[] = [];
  const symbolLower = symbol?.toLowerCase() || '';
  if (symbolLower === 'frbtc' || id === '32:0') { paths.push('/tokens/frbtc.svg'); return paths; }
  if (id === '2:0' || symbolLower === 'diesel') { paths.push('https://asset.oyl.gg/alkanes/mainnet/2-0.png'); return paths; }
  if (id && /^\d+:\d+/.test(id)) {
    const urlSafeId = id.replace(/:/g, '-');
    paths.push(`https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`);
  }
  return paths;
}

import { forwardRef } from 'react';

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
      className={`rounded-lg overflow-hidden transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
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
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all duration-[400ms] focus:outline-none ${isOpen ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
      >
        <span>{feeDisplayMap[selection] || selection}</span>
        <ChevronDown size={12} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
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
