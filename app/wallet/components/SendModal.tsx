'use client';

import { useState, useEffect } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader2, Lock, Unlock } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
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
  const { address, wallet } = useWallet() as any;
  const { provider } = useAlkanesSDK();
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

  // Filter available UTXOs (exclude frozen, inscriptions, runes, alkanes for simple BTC sends)
  const availableUtxos = utxos.all.filter((utxo) => {
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    if (frozenUtxos.has(utxoKey)) return showFrozenUtxos;
    if (utxo.inscriptions && utxo.inscriptions.length > 0) return false;
    if (utxo.runes && Object.keys(utxo.runes).length > 0) return false;
    if (utxo.alkanes && Object.keys(utxo.alkanes).length > 0) return false;
    return true;
  });

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
        // Auto-select UTXOs using simple largest-first algorithm
        const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
        let total = 0;
        const selected = new Set<string>();
        
        for (const utxo of sorted) {
          if (total >= amountSats + 1000) break; // Rough fee estimate
          selected.add(`${utxo.txid}:${utxo.vout}`);
          total += utxo.value;
        }

        if (total < amountSats) {
          setError('Insufficient funds');
          return;
        }

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
      handleBroadcast();
    }
  };

  const handleBroadcast = async () => {
    if (!provider || !wallet) {
      setError('Wallet not initialized');
      return;
    }

    setStep('broadcasting');
    setError('');

    try {
      const amountSats = Math.floor(parseFloat(amount) * 100000000);
      const feeRateNum = parseInt(feeRate);

      // Build transaction params
      const inputs = Array.from(selectedUtxos).map((key) => {
        const [txid, vout] = key.split(':');
        return { txid, vout: parseInt(vout) };
      });

      const outputs = [
        {
          address: recipientAddress,
          value: amountSats,
        },
      ];

      // Create PSBT using walletCreatePsbt
      const psbtParams = {
        inputs,
        outputs,
        changeAddress: address,
        feeRate: feeRateNum,
      };

      const psbtResult = await provider.walletCreatePsbt(JSON.stringify(psbtParams));
      const psbtBase64 = psbtResult.psbt;

      // Sign PSBT
      if (!wallet.signPsbt) {
        setError('Wallet does not support PSBT signing');
        return;
      }

      const signedPsbt = await wallet.signPsbt(psbtBase64);

      // Finalize and extract transaction
      // Note: In production, you'd use bitcoinjs-lib to finalize the PSBT
      // For now, we'll assume the signed PSBT can be broadcast directly
      
      // Broadcast transaction
      const result = await provider.broadcastTransaction(signedPsbt);
      
      setTxid(result.txid || result);
      setStep('success');
      
      // Refresh wallet data
      setTimeout(() => {
        refresh();
      }, 1000);
    } catch (err: any) {
      console.error('Transaction failed:', err);
      setError(err.message || 'Failed to broadcast transaction');
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
          <label className="block text-sm font-medium text-white/80 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="bc1q... or 1... or 3..."
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Amount (BTC)
          </label>
          <input
            type="number"
            step="0.00000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00000000"
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500"
          />
          <div className="mt-1 text-xs text-white/60">
            Available: {(availableUtxos.reduce((sum, u) => sum + u.value, 0) / 100000000).toFixed(8)} BTC
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Fee Rate (sat/vB)
          </label>
          <input
            type="number"
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            placeholder="10"
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setFeeRate('1')}
              className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs transition-colors"
            >
              Low (1)
            </button>
            <button
              onClick={() => setFeeRate('10')}
              className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs transition-colors"
            >
              Medium (10)
            </button>
            <button
              onClick={() => setFeeRate('20')}
              className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs transition-colors"
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
            <span className="text-sm text-white/80">Automatically select UTXOs</span>
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
          className="flex-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium"
        >
          {autoSelectUtxos ? 'Review & Send' : 'Select UTXOs'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white"
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
          <div className="text-sm text-white/80">
            Select UTXOs to spend ({selectedUtxos.size} selected)
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showFrozenUtxos}
              onChange={(e) => setShowFrozenUtxos(e.target.checked)}
              className="rounded"
            />
            <span className="text-white/60">Show frozen</span>
          </label>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2 border border-white/10 rounded-lg p-3 bg-white/5">
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
                    ? 'bg-blue-500/20 border-blue-500/50'
                    : isFrozen
                    ? 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-mono text-xs text-white/80">
                      {utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}:{utxo.vout}
                    </div>
                    <div className="text-sm text-white font-medium">
                      {(utxo.value / 100000000).toFixed(8)} BTC
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isFrozen && <Lock size={16} className="text-yellow-400" />}
                    {isSelected && <CheckCircle size={20} className="text-blue-400" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
          <div className="flex justify-between text-white/80">
            <span>Total Selected:</span>
            <span className="font-medium">{(totalSelectedValue / 100000000).toFixed(8)} BTC</span>
          </div>
          <div className="flex justify-between text-white/80 mt-1">
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
          className="px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={selectedUtxos.size === 0}
          className="flex-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
            <div className="flex justify-between">
              <span className="text-white/60">Recipient:</span>
              <span className="font-mono text-sm text-white break-all ml-4">
                {recipientAddress}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Amount:</span>
              <span className="font-medium text-white">{parseFloat(amount).toFixed(8)} BTC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Fee Rate:</span>
              <span className="text-white">{feeRate} sat/vB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Estimated Fee:</span>
              <span className="text-white">{(estimatedFee / 100000000).toFixed(8)} BTC</span>
            </div>
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="text-white/80 font-medium">Total:</span>
              <span className="text-white font-medium">{(total / 100000000).toFixed(8)} BTC</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-200">
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
            className="px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            className="flex-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium flex items-center justify-center gap-2"
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
      <Loader2 className="animate-spin text-blue-400 mb-4" size={48} />
      <div className="text-lg text-white/80">Broadcasting transaction...</div>
      <div className="text-sm text-white/60 mt-2">Please wait</div>
    </div>
  );

  const renderSuccess = () => (
    <>
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <CheckCircle size={64} className="text-green-400" />
        <div className="text-xl font-bold text-white">Transaction Sent!</div>
        
        <div className="w-full p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="text-sm text-green-200 mb-2">Transaction ID:</div>
          <div className="font-mono text-xs text-white break-all">{txid}</div>
        </div>

        <a
          href={`https://mempool.space/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          View on Block Explorer →
        </a>
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium"
      >
        Close
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white">Send Bitcoin</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
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
    </div>
  );
}
