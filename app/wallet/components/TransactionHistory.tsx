'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { ExternalLink, Clock, CheckCircle, Code, RefreshCw, Zap, Search, Sparkles } from 'lucide-react';

export default function TransactionHistory() {
  const { account } = useWallet() as any;
  const { provider } = useAlkanesSDK();

  // Get transaction history for both addresses
  const p2wpkhAddress = account?.nativeSegwit?.address;
  const p2trAddress = account?.taproot?.address;

  const { transactions: p2wpkhTxs, loading: p2wpkhLoading, error: p2wpkhError } = useTransactionHistory(p2wpkhAddress);
  const { transactions: p2trTxs, loading: p2trLoading, error: p2trError } = useTransactionHistory(p2trAddress);

  // Merge and dedupe transactions by txid, sort by block time (newest first)
  const transactions = [...p2wpkhTxs, ...p2trTxs]
    .filter((tx, idx, arr) => arr.findIndex(t => t.txid === tx.txid) === idx)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));

  const loading = p2wpkhLoading || p2trLoading;
  const error = p2wpkhError || p2trError;
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [expandedTxs, setExpandedTxs] = useState<Set<string>>(new Set());
  const [inspectingTx, setInspectingTx] = useState<string | null>(null);
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatSats = (sats: number) => {
    return (sats / 100000000).toFixed(8);
  };

  const toggleExpanded = (txid: string) => {
    const newExpanded = new Set(expandedTxs);
    if (newExpanded.has(txid)) {
      newExpanded.delete(txid);
    } else {
      newExpanded.add(txid);
    }
    setExpandedTxs(newExpanded);
  };

  const inspectTransaction = async (txid: string) => {
    setInspectingTx(txid);
    setInspectionLoading(true);
    setInspectionError(null);
    setInspectionData(null);

    try {
      // Helper to safely call provider methods that may not exist
      const safeCall = async (fn: any, ...args: any[]) => {
        if (typeof fn !== 'function') return null;
        try {
          return await fn(...args);
        } catch {
          return null;
        }
      };

      // Try both runestone and protorunes analysis if provider exists
      const [runestoneDecode, protorunesDecode, runestoneAnalyze, protorunesAnalyze] = await Promise.allSettled([
        safeCall(provider?.runestoneDecodeTx?.bind(provider), txid),
        safeCall(provider?.protorunesDecodeTx?.bind(provider), txid),
        safeCall(provider?.runestoneAnalyzeTx?.bind(provider), txid),
        safeCall(provider?.protorunesAnalyzeTx?.bind(provider), txid),
      ]);

      const data = {
        runestone: {
          decode: runestoneDecode.status === 'fulfilled' ? runestoneDecode.value : null,
          analyze: runestoneAnalyze.status === 'fulfilled' ? runestoneAnalyze.value : null,
        },
        protorunes: {
          decode: protorunesDecode.status === 'fulfilled' ? protorunesDecode.value : null,
          analyze: protorunesAnalyze.status === 'fulfilled' ? protorunesAnalyze.value : null,
        },
      };

      setInspectionData(data);
    } catch (err: any) {
      console.error('Transaction inspection failed:', err);
      setInspectionError(err.message || 'Failed to inspect transaction');
    } finally {
      setInspectionLoading(false);
    }
  };

  const closeInspection = () => {
    setInspectingTx(null);
    setInspectionData(null);
    setInspectionError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-[color:var(--sf-text)]/60 mr-2" size={20} />
        <div className="text-[color:var(--sf-text)]/60">Loading transactions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('visual')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'visual'
              ? 'bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white'
              : 'bg-[color:var(--sf-primary)]/5 text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80'
          }`}
        >
          Visual
        </button>
        <button
          onClick={() => setViewMode('raw')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'raw'
              ? 'bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white'
              : 'bg-[color:var(--sf-primary)]/5 text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80'
          }`}
        >
          Raw JSON
        </button>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <div
              key={tx.txid}
              className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-6"
            >
              {/* Transaction Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  {tx.confirmed ? (
                    <CheckCircle size={20} className="text-green-400 mt-0.5" />
                  ) : (
                    <Clock size={20} className="text-yellow-400 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-[color:var(--sf-text)]">
                        {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                      </span>
                      <a
                        href={`https://mempool.space/tx/${tx.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[color:var(--sf-primary)] hover:opacity-80"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {tx.hasProtostones && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                          <Zap size={12} />
                          Alkanes
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[color:var(--sf-text)]/60 mt-1">
                      {tx.blockTime ? formatDate(tx.blockTime) : 'Pending'}
                      {tx.blockHeight && (
                        <span className="ml-2">• Block {tx.blockHeight}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      tx.confirmed
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                        : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                    }`}
                  >
                    {tx.confirmed ? 'Confirmed' : 'Pending'}
                  </span>
                  {tx.fee && (
                    <span className="text-xs text-[color:var(--sf-text)]/60">
                      Fee: {formatSats(tx.fee)} BTC
                    </span>
                  )}
                </div>
              </div>

              {viewMode === 'visual' ? (
                <>
                  {/* Inputs/Outputs Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                        Inputs ({tx.inputs.length})
                      </div>
                      <div className="text-lg font-mono text-[color:var(--sf-text)]">
                        {formatSats(tx.inputs.reduce((sum, inp) => sum + (inp.amount || 0), 0))} BTC
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                        Outputs ({tx.outputs.length})
                      </div>
                      <div className="text-lg font-mono text-[color:var(--sf-text)]">
                        {formatSats(tx.outputs.reduce((sum, out) => sum + out.amount, 0))} BTC
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => toggleExpanded(tx.txid)}
                      className="text-sm text-[color:var(--sf-primary)] hover:opacity-80"
                    >
                      {expandedTxs.has(tx.txid) ? '▼ Hide Details' : '▶ Show Details'}
                    </button>
                    <button
                      onClick={() => inspectTransaction(tx.txid)}
                      className="flex items-center gap-1 text-sm text-purple-500 dark:text-purple-400 hover:opacity-80"
                    >
                      <Search size={14} />
                      Inspect Runes/Alkanes
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {expandedTxs.has(tx.txid) && (
                    <>
                      {/* Outputs */}
                      <div className="mb-4">
                        <div className="text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">Outputs:</div>
                        <div className="space-y-2">
                          {tx.outputs.map((output, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/5"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-xs px-2 py-1 rounded bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)] whitespace-nowrap">
                                  #{idx}
                                </span>
                                {output.address ? (
                                  <a
                                    href={`https://mempool.space/address/${output.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-[color:var(--sf-primary)] hover:opacity-80 truncate"
                                  >
                                    {output.address}
                                  </a>
                                ) : (
                                  <span className="font-mono text-xs text-[color:var(--sf-text)]/40">
                                    OP_RETURN / Non-standard
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-sm text-[color:var(--sf-text)] whitespace-nowrap ml-3">
                                {formatSats(output.amount)} BTC
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Runestone Data */}
                      {tx.runestone && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-[color:var(--sf-text)]/60 mb-2 flex items-center gap-2">
                            <Zap size={16} className="text-orange-400" />
                            Runestone Data
                          </div>
                          <div className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-orange-500/20">
                            <pre className="text-xs font-mono text-[color:var(--sf-text)]/80 overflow-x-auto">
                              {JSON.stringify(tx.runestone, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Alkanes Traces */}
                      {tx.alkanesTraces && tx.alkanesTraces.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-[color:var(--sf-text)]/60 mb-2 flex items-center gap-2">
                            <Sparkles size={16} className="text-purple-400" />
                            Alkanes Execution Traces ({tx.alkanesTraces.length} protostone{tx.alkanesTraces.length !== 1 ? 's' : ''})
                          </div>
                          <div className="space-y-3">
                            {tx.alkanesTraces.map((trace: any, idx: number) => (
                              <div key={idx} className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-purple-500/20">
                                <div className="text-xs font-medium text-purple-500 dark:text-purple-400 mb-2">
                                  Protostone #{trace.protostone_index + 1} (vout {trace.vout})
                                </div>
                                <div className="font-mono text-xs text-[color:var(--sf-text)]/60 mb-2">
                                  Outpoint: {trace.outpoint}
                                </div>
                                <pre className="text-xs font-mono text-[color:var(--sf-text)]/80 overflow-x-auto max-h-64 overflow-y-auto">
                                  {JSON.stringify(trace.trace, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                /* Raw JSON View */
                <div className="relative">
                  <div className="absolute top-2 right-2">
                    <Code size={16} className="text-[color:var(--sf-text)]/40" />
                  </div>
                  <pre className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] overflow-x-auto text-xs font-mono text-[color:var(--sf-text)]/80">
                    {JSON.stringify(tx, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-[color:var(--sf-text)]/60">
            <div className="mb-2">No transactions found</div>
            <div className="text-sm text-[color:var(--sf-text)]/40">
              Transactions will appear here once your wallet has activity
            </div>
          </div>
        )}
      </div>

      {/* Transaction Inspection Modal */}
      {inspectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[color:var(--sf-surface)] rounded-2xl border border-[color:var(--sf-outline)] max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[color:var(--sf-outline)] sticky top-0 bg-[color:var(--sf-surface)] z-10">
              <div className="flex items-center gap-3">
                <Sparkles size={24} className="text-purple-400" />
                <div>
                  <h2 className="text-xl font-bold text-[color:var(--sf-text)]">Transaction Analysis</h2>
                  <div className="font-mono text-xs text-[color:var(--sf-text)]/60 mt-1">
                    {inspectingTx.slice(0, 16)}...{inspectingTx.slice(-16)}
                  </div>
                </div>
              </div>
              <button
                onClick={closeInspection}
                className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {inspectionLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="animate-spin text-purple-400 mr-2" size={20} />
                  <div className="text-[color:var(--sf-text)]/60">Analyzing transaction...</div>
                </div>
              ) : inspectionError ? (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                  {inspectionError}
                </div>
              ) : inspectionData ? (
                <div className="space-y-6">
                  {/* Runestone Analysis */}
                  {(inspectionData.runestone.decode || inspectionData.runestone.analyze) && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Zap size={20} className="text-orange-400" />
                        <h3 className="text-lg font-bold text-[color:var(--sf-text)]">Runestone Data</h3>
                      </div>

                      {inspectionData.runestone.decode && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">Decoded:</div>
                          <pre className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] overflow-x-auto text-xs font-mono text-[color:var(--sf-text)]/80">
                            {JSON.stringify(inspectionData.runestone.decode, null, 2)}
                          </pre>
                        </div>
                      )}

                      {inspectionData.runestone.analyze && (
                        <div>
                          <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">Analysis:</div>
                          <pre className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] overflow-x-auto text-xs font-mono text-[color:var(--sf-text)]/80">
                            {JSON.stringify(inspectionData.runestone.analyze, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Protorunes/Alkanes Analysis */}
                  {(inspectionData.protorunes.decode || inspectionData.protorunes.analyze) && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles size={20} className="text-purple-400" />
                        <h3 className="text-lg font-bold text-[color:var(--sf-text)]">Alkanes/Protorunes Data</h3>
                      </div>

                      {inspectionData.protorunes.decode && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">Decoded:</div>
                          <pre className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] overflow-x-auto text-xs font-mono text-[color:var(--sf-text)]/80">
                            {JSON.stringify(inspectionData.protorunes.decode, null, 2)}
                          </pre>
                        </div>
                      )}

                      {inspectionData.protorunes.analyze && (
                        <div>
                          <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">Analysis:</div>
                          <pre className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] overflow-x-auto text-xs font-mono text-[color:var(--sf-text)]/80">
                            {JSON.stringify(inspectionData.protorunes.analyze, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* No data found */}
                  {!inspectionData.runestone.decode &&
                    !inspectionData.runestone.analyze &&
                    !inspectionData.protorunes.decode &&
                    !inspectionData.protorunes.analyze && (
                      <div className="p-8 text-center text-[color:var(--sf-text)]/60">
                        <div className="mb-2">No Runes or Alkanes data found</div>
                        <div className="text-sm text-[color:var(--sf-text)]/40">
                          This transaction does not contain runestone or protostone data
                        </div>
                      </div>
                    )}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[color:var(--sf-outline)] sticky bottom-0 bg-[color:var(--sf-surface)]">
              <button
                onClick={closeInspection}
                className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)] font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
