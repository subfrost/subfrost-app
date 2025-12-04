'use client';

import { useState, useEffect } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader2, Lock } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';

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
  const { utxos, refresh } = useEnrichedWalletData();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('10');
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
      // Reset state when modal closes
      setStep('input');
      setRecipientAddress('');
      setAmount('');
      setFeeRate('10');
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
        setError('Invalid Bitcoin address');
        return;
      }

      const amountSats = Math.floor(parseFloat(amount) * 100000000);
      if (isNaN(amountSats) || amountSats <= 0) {
        setError('Invalid amount');
        return;
      }

      const feeRateNum = parseInt(feeRate);
      if (isNaN(feeRateNum) || feeRateNum < 1) {
        setError('Invalid fee rate');
        return;
      }

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
    const feeRateNum = parseInt(feeRate);
    
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
      // Get mnemonic from session storage (set by WalletContext on unlock)
      const mnemonic = sessionStorage.getItem('subfrost_session_mnemonic');
      if (!mnemonic) {
        throw new Error('Wallet session not found. Please reconnect your wallet.');
      }

      const feeRateNum = parseInt(feeRate);

      console.log('[SendModal] Sending via CLI API...');
      console.log('[SendModal] Recipient:', recipientAddress);
      console.log('[SendModal] Amount:', amount, 'BTC');
      console.log('[SendModal] Fee rate:', feeRateNum, 'sat/vB');
      console.log('[SendModal] From address:', address);

      // Call the CLI-based API route
      const response = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mnemonic,
          recipient: recipientAddress,
          amount: amount, // BTC as string
          feeRate: feeRateNum,
          fromAddresses: [address], // Send from current address
          lockAlkanes: true, // Protect alkane UTXOs
          network: network || 'regtest',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send transaction');
      }

      console.log('[SendModal] Transaction broadcast result:', result);

      setTxid(result.txid);
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
          <label className="block text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="bc1q... or 1... or 3..."
            className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">
            Amount (BTC)
          </label>
          <input
            type="number"
            step="0.00000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00000000"
            className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
          />
          <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
            Available: {(availableUtxos.reduce((sum, u) => sum + u.value, 0) / 100000000).toFixed(8)} BTC
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">
            Fee Rate (sat/vB)
          </label>
          <input
            type="number"
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            placeholder="10"
            className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setFeeRate('1')}
              className="px-3 py-1 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 text-xs text-[color:var(--sf-text)] transition-colors"
            >
              Low (1)
            </button>
            <button
              onClick={() => setFeeRate('10')}
              className="px-3 py-1 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 text-xs text-[color:var(--sf-text)] transition-colors"
            >
              Medium (10)
            </button>
            <button
              onClick={() => setFeeRate('20')}
              className="px-3 py-1 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 text-xs text-[color:var(--sf-text)] transition-colors"
            >
              High (20)
            </button>
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
            <span className="text-sm text-[color:var(--sf-text)]/80">Automatically select UTXOs</span>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleNext}
          className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium"
        >
          {autoSelectUtxos ? 'Review & Send' : 'Select UTXOs'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
        >
          Cancel
        </button>
      </div>
    </>
  );

  const renderUtxoSelection = () => (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[color:var(--sf-text)]/80">
            Select UTXOs to spend ({selectedUtxos.size} selected)
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showFrozenUtxos}
              onChange={(e) => setShowFrozenUtxos(e.target.checked)}
              className="rounded"
            />
            <span className="text-[color:var(--sf-text)]/60">Show frozen</span>
          </label>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2 border border-[color:var(--sf-outline)] rounded-lg p-3 bg-[color:var(--sf-primary)]/5">
          {availableUtxos.map((utxo) => {
            const key = `${utxo.txid}:${utxo.vout}`;
            const isSelected = selectedUtxos.has(key);
            const isFrozen = frozenUtxos.has(key);

            return (
              <button
                key={key}
                onClick={() => !isFrozen && toggleUtxo(utxo.txid, utxo.vout)}
                disabled={isFrozen}
                className={`w-full p-3 rounded-lg border transition-colors text-left ${
                  isSelected
                    ? 'bg-[color:var(--sf-primary)]/20 border-[color:var(--sf-primary)]/50'
                    : isFrozen
                    ? 'bg-[color:var(--sf-primary)]/5 border-[color:var(--sf-outline)] opacity-50 cursor-not-allowed'
                    : 'bg-[color:var(--sf-primary)]/5 border-[color:var(--sf-outline)] hover:bg-[color:var(--sf-primary)]/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-mono text-xs text-[color:var(--sf-text)]/80">
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

        <div className="p-3 rounded-lg bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-primary)]/20 text-sm">
          <div className="flex justify-between text-[color:var(--sf-text)]/80">
            <span>Total Selected:</span>
            <span className="font-medium">{(totalSelectedValue / 100000000).toFixed(8)} BTC</span>
          </div>
          <div className="flex justify-between text-[color:var(--sf-text)]/80 mt-1">
            <span>Amount to Send:</span>
            <span className="font-medium">{parseFloat(amount).toFixed(8)} BTC</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep('input')}
          className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={selectedUtxos.size === 0}
          className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review & Send
        </button>
      </div>
    </>
  );

  const renderConfirm = () => {
    const amountSats = Math.floor(parseFloat(amount) * 100000000);
    const estimatedFee = 150 * parseInt(feeRate); // Rough estimate
    const total = amountSats + estimatedFee;

    return (
      <>
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] space-y-3">
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">Recipient:</span>
              <span className="font-mono text-sm text-[color:var(--sf-text)] break-all ml-4">
                {recipientAddress}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">Amount:</span>
              <span className="font-medium text-[color:var(--sf-text)]">{parseFloat(amount).toFixed(8)} BTC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">Fee Rate:</span>
              <span className="text-[color:var(--sf-text)]">{feeRate} sat/vB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--sf-text)]/60">Estimated Fee:</span>
              <span className="text-[color:var(--sf-text)]">{(estimatedFee / 100000000).toFixed(8)} BTC</span>
            </div>
            <div className="border-t border-[color:var(--sf-outline)] pt-2 flex justify-between">
              <span className="text-[color:var(--sf-text)]/80 font-medium">Total:</span>
              <span className="text-[color:var(--sf-text)] font-medium">{(total / 100000000).toFixed(8)} BTC</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-600 dark:text-yellow-200">
            ⚠️ Please verify the recipient address before sending. Transactions cannot be reversed.
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep(autoSelectUtxos ? 'input' : 'utxo-selection')}
            className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium flex items-center justify-center gap-2"
          >
            <Send size={18} />
            Send Transaction
          </button>
        </div>
      </>
    );
  };

  const renderBroadcasting = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="animate-spin text-[color:var(--sf-primary)] mb-4" size={48} />
      <div className="text-lg text-[color:var(--sf-text)]/80">Broadcasting transaction...</div>
      <div className="text-sm text-[color:var(--sf-text)]/60 mt-2">Please wait</div>
    </div>
  );

  const renderSuccess = () => (
    <>
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <CheckCircle size={64} className="text-green-400" />
        <div className="text-xl font-bold text-[color:var(--sf-text)]">Transaction Sent!</div>

        <div className="w-full p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="text-sm text-green-600 dark:text-green-200 mb-2">Transaction ID:</div>
          <div className="font-mono text-xs text-[color:var(--sf-text)] break-all">{txid}</div>
        </div>

        <a
          href={`https://mempool.space/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--sf-primary)] hover:opacity-80 text-sm"
        >
          View on Block Explorer →
        </a>
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium"
      >
        Close
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[color:var(--sf-surface)] rounded-2xl border border-[color:var(--sf-outline)] max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[color:var(--sf-outline)]">
          <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">Send Bitcoin</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {step === 'input' && renderInput()}
          {step === 'utxo-selection' && renderUtxoSelection()}
          {step === 'confirm' && renderConfirm()}
          {step === 'broadcasting' && renderBroadcasting()}
          {step === 'success' && renderSuccess()}
        </div>
      </div>

      {/* Fee Warning Modal */}
      {showFeeWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
          <div className="relative bg-[color:var(--sf-surface)] border-2 border-red-500/50 rounded-lg w-full max-w-md m-4 shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-red-500">
                <AlertCircle size={32} />
                <h3 className="text-xl font-bold">High Fee Warning!</h3>
              </div>

              <div className="space-y-2 text-[color:var(--sf-text)]/80">
                <p className="text-sm">
                  This transaction has unusually high fees. Please review carefully:
                </p>

                <div className="bg-red-500/10 border border-red-500/30 rounded p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">Estimated Fee:</span>
                    <span className="text-red-400 font-mono">
                      {(estimatedFee / 100000000).toFixed(8)} BTC
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">Fee Rate:</span>
                    <span className="text-red-400 font-mono">{feeRate} sat/vB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">Number of Inputs:</span>
                    <span className="text-red-400 font-mono">{selectedUtxos.size}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--sf-text)]/60">Fee Percentage:</span>
                    <span className="text-red-400 font-mono">
                      {((estimatedFee / (parseFloat(amount) * 100000000)) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    <strong>⚠️ Recommendations:</strong>
                  </p>
                  <ul className="text-xs text-yellow-600/80 dark:text-yellow-300/80 mt-1 space-y-1 list-disc list-inside">
                    {selectedUtxos.size > 100 && (
                      <li>Reduce the number of UTXOs ({selectedUtxos.size} selected)</li>
                    )}
                    {parseInt(feeRate) > 1000 && (
                      <li>Lower the fee rate (currently {feeRate} sat/vB)</li>
                    )}
                    {estimatedFee > 0.01 * 100000000 && (
                      <li>Consider sending a smaller amount</li>
                    )}
                    <li>Manually select fewer UTXOs instead of using auto-select</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowFeeWarning(false)}
                  className="flex-1 px-4 py-3 bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-text)] rounded-lg transition-colors font-medium"
                >
                  Go Back
                </button>
                <button
                  onClick={proceedWithHighFee}
                  className="flex-1 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg transition-colors font-medium"
                >
                  Proceed Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
