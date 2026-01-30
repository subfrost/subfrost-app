'use client';

import { useState, useEffect } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader2, Lock } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { useFeeRate, FeeSelection } from '@/hooks/useFeeRate';
import { useTranslation } from '@/hooks/useTranslation';

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function SendModal({ isOpen, onClose }: SendModalProps) {
  const { address, network } = useWallet() as any;
  const { provider, isInitialized } = useAlkanesSDK();
  const { t } = useTranslation();
  const { utxos, refresh } = useEnrichedWalletData();
  const { selection: feeSelection, setSelection: setFeeSelection, custom: customFeeRate, setCustom: setCustomFeeRate, feeRate, presets } = useFeeRate({ storageKey: 'subfrost-send-fee-rate' });

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedUtxos, setSelectedUtxos] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'input' | 'utxo-selection' | 'confirm' | 'broadcasting' | 'success'>('input');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [autoSelectUtxos, setAutoSelectUtxos] = useState(true);
  const [showFrozenUtxos, setShowFrozenUtxos] = useState(false);
  const [showFeeWarning, setShowFeeWarning] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState(0);
  const [estimatedFeeRate, setEstimatedFeeRate] = useState(0);

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

  // Filter available UTXOs (only from current address, exclude frozen, inscriptions, runes, alkanes for simple BTC sends)
  const availableUtxos = utxos.all.filter((utxo) => {
    // Only include UTXOs from the current address
    if (utxo.address !== address) return false;
    
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    if (frozenUtxos.has(utxoKey)) return showFrozenUtxos;
    if (utxo.inscriptions && utxo.inscriptions.length > 0) return false;
    if (utxo.runes && Object.keys(utxo.runes).length > 0) return false;
    if (utxo.alkanes && Object.keys(utxo.alkanes).length > 0) return false;
    return true;
  });

  // Debug: Log UTXO distribution
  console.log('[SendModal] Current address:', address);
  console.log('[SendModal] Total UTXOs:', utxos.all.length);
  console.log('[SendModal] UTXOs by address:', {
    currentAddress: utxos.all.filter(u => u.address === address).length,
    otherAddresses: utxos.all.filter(u => u.address !== address).length,
  });
  console.log('[SendModal] Available UTXOs for current address:', availableUtxos.length);
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
      setAutoSelectUtxos(true);
    }
  }, [isOpen]);

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

      if (autoSelectUtxos) {
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
              `Cannot send this amount using auto-select (hit ${MAX_UTXOS} UTXO limit). ` +
              `Need ${(required / 100000000).toFixed(8)} BTC, but can only use ${(total / 100000000).toFixed(8)} BTC with ${MAX_UTXOS} UTXOs. ` +
              `Total available: ${(totalAvailable / 100000000).toFixed(8)} BTC. ` +
              `Try manual UTXO selection or send a smaller amount.`
            );
          } else {
            setError(`Insufficient funds. Need ${(required / 100000000).toFixed(8)} BTC, have ${(totalAvailable / 100000000).toFixed(8)} BTC`);
          }
          return;
        }

        console.log(`[SendModal] Auto-selected ${selected.size} UTXOs, total: ${(total / 100000000).toFixed(8)} BTC, estimated fee: ${(finalFee / 100000000).toFixed(8)} BTC`);

        setSelectedUtxos(selected);
        setStep('confirm');
      } else {
        setStep('utxo-selection');
      }
    } else if (step === 'utxo-selection') {
      const amountSats = Math.floor(parseFloat(amount) * 100000000);
      if (totalSelectedValue < amountSats) {
        setError('Selected UTXOs do not cover the amount');
        return;
      }
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
    } else {
      handleBroadcast();
    }
  };

  const proceedWithHighFee = () => {
    setShowFeeWarning(false);
    handleBroadcast();
  };

  const handleBroadcast = async () => {
    setStep('broadcasting');
    setError('');

    try {
      if (!provider || !isInitialized) {
        throw new Error('Provider not initialized. Please wait and try again.');
      }

      // Check if wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded. Please reconnect your wallet.');
      }

      const amountSats = Math.floor(parseFloat(amount) * 100000000);

      console.log('[SendModal] Sending via WASM provider...');
      console.log('[SendModal] Recipient:', recipientAddress);
      console.log('[SendModal] Amount:', amount, 'BTC (', amountSats, 'sats)');
      console.log('[SendModal] Fee rate:', feeRate, 'sat/vB');
      console.log('[SendModal] From address:', address);

      // Use WASM provider's walletSend method
      // Field names must match alkanes-web-sys SendParams struct:
      // - address (recipient)
      // - amount (in satoshis)
      // - fee_rate (optional)
      // - from (optional array of addresses to spend from)
      // - lock_alkanes (protect UTXOs with alkane assets)
      const sendParams = {
        address: recipientAddress,  // Recipient address
        amount: amountSats,         // Amount in satoshis
        fee_rate: feeRate,          // Fee rate in sat/vB
        from: [address],            // Spend from this address
        lock_alkanes: true,         // Protect alkane UTXOs
        auto_confirm: true,         // Skip confirmation prompt
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

  const toggleUtxo = (txid: string, vout: number) => {
    const key = `${txid}:${vout}`;
    const newSelected = new Set(selectedUtxos);
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    
    setSelectedUtxos(newSelected);
  };

  const renderInput = () => (
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
            placeholder="bc1q... or 1... or 3..."
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-base transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
            {t('send.amountBtc')}
          </label>
          <input
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

        <div>
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">
            {t('send.feeRate')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {(['slow', 'medium', 'fast'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFeeSelection(s)}
                className={`rounded-xl px-4 py-2 text-sm font-bold capitalize shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  feeSelection === s
                    ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)] shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                    : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                }`}
              >
                {t(`send.${s}`)} ({presets[s]} sat/vB)
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFeeSelection('custom')}
              className={`rounded-xl px-4 py-2 text-sm font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                feeSelection === 'custom'
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)] shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                  : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
              }`}
            >
              {t('send.custom')}
            </button>
            {feeSelection === 'custom' && (
              <div className="relative">
                <input
                  aria-label="Custom fee rate"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={customFeeRate}
                  onChange={(e) => setCustomFeeRate(e.target.value)}
                  placeholder="10"
                  className="h-10 w-36 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-3 pr-20 text-base font-semibold text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">sat/vB</span>
              </div>
            )}
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[color:var(--sf-primary)]/10 px-3 py-1.5 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
            <span className="font-semibold text-[color:var(--sf-text)]/70">{t('send.selected')}</span>
            <span className="font-bold text-[color:var(--sf-primary)]">{feeRate} sat/vB</span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSelectUtxos}
              onChange={(e) => setAutoSelectUtxos(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-[color:var(--sf-text)]/80">{t('send.autoSelectUtxos')}</span>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleNext}
          className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide"
        >
          {autoSelectUtxos ? t('send.reviewAndSend') : t('send.selectUtxosBtn')}
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

  const renderUtxoSelection = () => (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[color:var(--sf-text)]/80">
            {t('send.selectUtxos', { count: selectedUtxos.size })}
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showFrozenUtxos}
              onChange={(e) => setShowFrozenUtxos(e.target.checked)}
              className="rounded"
            />
            <span className="text-[color:var(--sf-text)]/60">{t('send.showFrozen')}</span>
          </label>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2 rounded-xl p-3 bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          {availableUtxos.map((utxo) => {
            const key = `${utxo.txid}:${utxo.vout}`;
            const isSelected = selectedUtxos.has(key);
            const isFrozen = frozenUtxos.has(key);

            return (
              <button
                key={key}
                onClick={() => !isFrozen && toggleUtxo(utxo.txid, utxo.vout)}
                disabled={isFrozen}
                className={`w-full p-3 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-left ${
                  isSelected
                    ? 'bg-[color:var(--sf-primary)]/20 shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
                    : isFrozen
                    ? 'bg-[color:var(--sf-input-bg)] opacity-50 cursor-not-allowed'
                    : 'bg-[color:var(--sf-input-bg)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-xs text-[color:var(--sf-text)]/80">
                      {utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}:{utxo.vout}
                    </div>
                    <div className="text-sm text-[color:var(--sf-text)] font-medium">
                      {(utxo.value / 100000000).toFixed(8)} BTC
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isFrozen && <Lock size={16} className="text-yellow-400" />}
                    {isSelected && <CheckCircle size={20} className="text-[color:var(--sf-primary)]" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-[color:var(--sf-primary)]/10 shadow-[0_2px_8px_rgba(0,0,0,0.1)] text-sm">
          <div className="flex justify-between text-[color:var(--sf-text)]/80">
            <span>{t('send.totalSelected')}</span>
            <span className="font-medium">{(totalSelectedValue / 100000000).toFixed(8)} BTC</span>
          </div>
          <div className="flex justify-between text-[color:var(--sf-text)]/80 mt-1">
            <span>{t('send.amountToSend')}</span>
            <span className="font-medium">{parseFloat(amount).toFixed(8)} BTC</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep('input')}
          className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
        >
          {t('send.back')}
        </button>
        <button
          onClick={handleNext}
          disabled={selectedUtxos.size === 0}
          className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('send.reviewAndSend')}
        </button>
      </div>
    </>
  );

  const renderConfirm = () => {
    const amountSats = Math.floor(parseFloat(amount) * 100000000);
    const estimatedFee = 150 * feeRate; // Rough estimate
    const total = amountSats + estimatedFee;

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
              <span className="text-[color:var(--sf-text)]">{(estimatedFee / 100000000).toFixed(8)} BTC</span>
            </div>
            <div className="border-t border-[color:var(--sf-text)]/10 pt-2 flex justify-between">
              <span className="text-[color:var(--sf-text)]/80 font-medium">{t('send.total')}</span>
              <span className="text-[color:var(--sf-text)] font-medium">{(total / 100000000).toFixed(8)} BTC</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[color:var(--sf-info-yellow-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm text-[color:var(--sf-info-yellow-text)]">
            {t('send.verifyWarning')}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep(autoSelectUtxos ? 'input' : 'utxo-selection')}
            className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
          >
            {t('send.back')}
          </button>
          <button
            onClick={handleNext}
            className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <Send size={18} />
            {t('send.sendTransaction')}
          </button>
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
          <div className="text-xs text-[color:var(--sf-text)] break-all">{txid}</div>
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
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{t('send.title')}</h2>
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
          {step === 'input' && renderInput()}
          {step === 'utxo-selection' && renderUtxoSelection()}
          {step === 'confirm' && renderConfirm()}
          {step === 'broadcasting' && renderBroadcasting()}
          {step === 'success' && renderSuccess()}
        </div>
      </div>

      {/* Fee Warning Modal */}
      {showFeeWarning && (
        <div className="fixed inset-0 z-[60] grid place-items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl w-full max-w-md m-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-red-500">
                <AlertCircle size={32} />
                <h3 className="text-xl font-extrabold tracking-wider uppercase">{t('send.highFeeWarning')}</h3>
              </div>

              <div className="space-y-2 text-[color:var(--sf-text)]/80">
                <p className="text-sm">
                  {t('send.highFeeDescription')}
                </p>

                <div className="bg-red-500/10 rounded-xl p-3 space-y-1 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">{t('send.estimatedFee')}</span>
                    <span className="text-red-400">
                      {(estimatedFee / 100000000).toFixed(8)} BTC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">{t('send.feeRateLabel')}</span>
                    <span className="text-red-400">{feeRate} sat/vB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">Number of Inputs:</span>
                    <span className="text-red-400">{selectedUtxos.size}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">Fee Percentage:</span>
                    <span className="text-red-400">
                      {((estimatedFee / (parseFloat(amount) * 100000000)) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="bg-[color:var(--sf-info-yellow-bg)] rounded-xl p-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                  <p className="text-xs text-[color:var(--sf-info-yellow-text)]">
                    <strong>⚠️ Recommendations:</strong>
                  </p>
                  <ul className="text-xs text-[color:var(--sf-info-yellow-text)]/80 mt-1 space-y-1 list-disc list-inside">
                    {selectedUtxos.size > 100 && (
                      <li>{t('send.reduceUtxos')} ({selectedUtxos.size})</li>
                    )}
                    {feeRate > 1000 && (
                      <li>{t('send.lowerFeeRate')} ({feeRate} sat/vB)</li>
                    )}
                    {estimatedFee > 0.01 * 100000000 && (
                      <li>{t('send.smallerAmount')}</li>
                    )}
                    <li>Manually select fewer UTXOs instead of using auto-select</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowFeeWarning(false)}
                  className="flex-1 px-4 py-3 bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-[color:var(--sf-text)] rounded-xl transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none font-bold uppercase tracking-wide"
                >
                  {t('send.back')}
                </button>
                <button
                  onClick={proceedWithHighFee}
                  className="flex-1 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none font-bold uppercase tracking-wide"
                >
                  {t('send.proceedAnyway')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
