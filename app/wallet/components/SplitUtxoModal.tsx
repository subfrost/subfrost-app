'use client';

import { useState } from 'react';
import { X, Scissors, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { useTranslation } from '@/hooks/useTranslation';
import * as bitcoin from 'bitcoinjs-lib';

interface SplitUtxoModalProps {
  isOpen: boolean;
  onClose: () => void;
  utxo: {
    txid: string;
    vout: number;
    value: number;
    inscriptions?: Array<{
      id: string;
      number: number;
      offset?: number;
    }>;
  } | null;
}

export default function SplitUtxoModal({ isOpen, onClose, utxo }: SplitUtxoModalProps) {
  const { t } = useTranslation();
  const { provider } = useAlkanesSDK();
  const { address, wallet } = useWallet() as any;
  const [splitAmount, setSplitAmount] = useState('546'); // Dust limit
  const [numOutputs, setNumOutputs] = useState('2');
  const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');

  if (!isOpen || !utxo) return null;

  const dustLimit = 546; // sats

  const handleSplit = async () => {
    if (!provider || !wallet) {
      setError(t('splitUtxo.walletNotInitialized'));
      return;
    }

    setStep('processing');
    setError('');

    try {
      const outputs = parseInt(numOutputs);
      const splitSats = parseInt(splitAmount);

      if (splitSats < dustLimit) {
        setError(t('splitUtxo.amountTooSmall', { dustLimit }));
        setStep('input');
        return;
      }

      if (splitSats * outputs > utxo.value - 1000) {
        setError(t('splitUtxo.notEnoughValue'));
        setStep('input');
        return;
      }

      // Build transaction to split UTXO
      // Create multiple outputs: 
      // - One for each split (ordinal safe)
      // - One for change
      const txOutputs = [];

      // Create split outputs (for ordinals)
      for (let i = 0; i < outputs; i++) {
        txOutputs.push({
          address: address,
          value: splitSats,
        });
      }

      // Add change output
      const totalSplit = splitSats * outputs;
      const estimatedFee = 150 * 10; // Rough estimate: 150 vB * 10 sat/vB
      const change = utxo.value - totalSplit - estimatedFee;

      if (change >= dustLimit) {
        txOutputs.push({
          address: address,
          value: change,
        });
      }

      // Create PSBT
      const psbtParams = {
        inputs: [
          {
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            address: address, // The address that owns this UTXO
          },
        ],
        outputs: txOutputs,
        changeAddress: address,
        feeRate: 10,
      };

      console.log('[SplitUtxoModal] Creating PSBT with params:', psbtParams);

      // wallet.createPsbt returns a signed PSBT base64 string
      const signedPsbt = await wallet.createPsbt(psbtParams);

      console.log('[SplitUtxoModal] PSBT created and signed');

      // Extract transaction from signed PSBT and broadcast
      const psbt = bitcoin.Psbt.fromBase64(signedPsbt);
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      console.log('[SplitUtxoModal] Broadcasting transaction:', tx.getId());

      const result = await provider.broadcastTransaction(txHex);

      console.log('[SplitUtxoModal] Transaction broadcast result:', result);

      setTxid(tx.getId());
      setStep('success');
    } catch (err: any) {
      console.error('UTXO split failed:', err);
      setError(err.message || t('splitUtxo.failed'));
      setStep('input');
    }
  };

  const handleClose = () => {
    setStep('input');
    setSplitAmount('546');
    setNumOutputs('2');
    setError('');
    setTxid('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[color:var(--sf-surface)] rounded-2xl border border-[color:var(--sf-outline)] max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[color:var(--sf-outline)]">
          <div className="flex items-center gap-3">
            <Scissors size={24} className="text-purple-500 dark:text-purple-400" />
            <h2 className="text-xl font-bold text-[color:var(--sf-text)]">{t('splitUtxo.title')}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'input' && (
            <div className="space-y-6">
              {/* UTXO Info */}
              <div className="p-4 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)]">
                <div className="text-sm text-[color:var(--sf-text)]/60 mb-2">{t('splitUtxo.utxoToSplit')}</div>
                <div className="text-xs text-[color:var(--sf-text)]/80 mb-2">
                  {utxo.txid.slice(0, 16)}...:{utxo.vout}
                </div>
                <div className="text-sm text-[color:var(--sf-text)]">
                  {t('utxo.value')} {(utxo.value / 100000000).toFixed(8)} BTC ({utxo.value.toLocaleString()} sats)
                </div>
                {utxo.inscriptions && utxo.inscriptions.length > 0 && (
                  <div className="mt-2 text-xs text-orange-500 dark:text-orange-400">
                    {t(utxo.inscriptions.length === 1 ? 'splitUtxo.containsInscriptionSingular' : 'splitUtxo.containsInscriptionPlural', { count: utxo.inscriptions.length })}
                  </div>
                )}
              </div>

              {/* Configuration */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">
                    {t('splitUtxo.numberOfOutputs')}
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={numOutputs}
                    onChange={(e) => setNumOutputs(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                  />
                  <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
                    {t('splitUtxo.splitIntoOutputs', { count: numOutputs })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">
                    {t('splitUtxo.amountPerOutput')}
                  </label>
                  <input
                    type="number"
                    min={dustLimit}
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                  />
                  <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
                    {t('splitUtxo.minimumDust', { dustLimit })}
                  </div>
                </div>

                {/* Preview */}
                <div className="p-4 rounded-lg bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-primary)]/20">
                  <div className="text-sm font-medium text-[color:var(--sf-primary)] mb-2">{t('splitUtxo.preview')}</div>
                  <div className="space-y-1 text-xs text-[color:var(--sf-text)]/80">
                    <div>{t('splitUtxo.previewOutputs', { count: numOutputs, amount: parseInt(splitAmount).toLocaleString(), total: (parseInt(numOutputs) * parseInt(splitAmount)).toLocaleString() })}</div>
                    <div>{t('splitUtxo.estimatedFee', { amount: '1,500' })}</div>
                    <div>{t('splitUtxo.change', { amount: (utxo.value - (parseInt(numOutputs) * parseInt(splitAmount)) - 1500).toLocaleString() })}</div>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-600 dark:text-yellow-200">
                <div className="font-medium mb-2">{t('receive.important')}</div>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>{t('splitUtxo.warningCreatesSmaller')}</li>
                  <li>{t('splitUtxo.warningEachOutput', { amount: parseInt(splitAmount).toLocaleString() })}</li>
                  <li>{t('splitUtxo.warningInscriptionsStay')}</li>
                  <li>{t('splitUtxo.warningUseBeforeSending')}</li>
                </ul>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleSplit}
                  className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-medium flex items-center justify-center gap-2"
                >
                  <Scissors size={18} />
                  {t('splitUtxo.split')}
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="animate-spin text-[color:var(--sf-primary)] mb-4" size={48} />
              <div className="text-lg text-[color:var(--sf-text)]/80">{t('splitUtxo.splitting')}</div>
              <div className="text-sm text-[color:var(--sf-text)]/60 mt-2">{t('common.pleaseWait')}</div>
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle size={64} className="text-green-400 mb-4" />
                <div className="text-xl font-bold text-[color:var(--sf-text)] mb-2">{t('splitUtxo.success')}</div>

                <div className="w-full p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="text-sm text-green-600 dark:text-green-200 mb-2">{t('success.transactionId')}</div>
                  <div className="text-xs text-[color:var(--sf-text)] break-all">{txid}</div>
                </div>

                <a
                  href={`https://mempool.space/tx/${txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--sf-primary)] hover:opacity-80 text-sm mt-4"
                >
                  {t('common.viewOnBlockExplorer')}
                </a>
              </div>

              <button
                onClick={handleClose}
                className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
