'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { ExternalLink, Clock, CheckCircle, Code, RefreshCw, Zap } from 'lucide-react';

export default function TransactionHistory() {
  const { address } = useWallet() as any;
  const { transactions, loading, error } = useTransactionHistory(address);
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [expandedTxs, setExpandedTxs] = useState<Set<string>>(new Set());

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-white/60 mr-2" size={20} />
        <div className="text-white/60">Loading transactions...</div>
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
              ? 'bg-blue-600 text-white'
              : 'bg-white/5 text-white/60 hover:text-white/80'
          }`}
        >
          Visual
        </button>
        <button
          onClick={() => setViewMode('raw')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'raw'
              ? 'bg-blue-600 text-white'
              : 'bg-white/5 text-white/60 hover:text-white/80'
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
              className="rounded-xl border border-white/10 bg-white/5 p-6"
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
                      <span className="font-mono text-sm">
                        {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                      </span>
                      <a
                        href={`https://mempool.space/tx/${tx.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
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
                    <div className="text-xs text-white/60 mt-1">
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
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {tx.confirmed ? 'Confirmed' : 'Pending'}
                  </span>
                  {tx.fee && (
                    <span className="text-xs text-white/60">
                      Fee: {formatSats(tx.fee)} BTC
                    </span>
                  )}
                </div>
              </div>

              {viewMode === 'visual' ? (
                <>
                  {/* Inputs/Outputs Summary */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-sm font-medium text-white/60 mb-2">
                        Inputs ({tx.inputs.length})
                      </div>
                      <div className="text-lg font-mono text-white">
                        {formatSats(tx.inputs.reduce((sum, inp) => sum + (inp.amount || 0), 0))} BTC
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white/60 mb-2">
                        Outputs ({tx.outputs.length})
                      </div>
                      <div className="text-lg font-mono text-white">
                        {formatSats(tx.outputs.reduce((sum, out) => sum + out.amount, 0))} BTC
                      </div>
                    </div>
                  </div>

                  {/* Toggle Details Button */}
                  <button
                    onClick={() => toggleExpanded(tx.txid)}
                    className="text-sm text-blue-400 hover:text-blue-300 mb-4"
                  >
                    {expandedTxs.has(tx.txid) ? '▼ Hide Details' : '▶ Show Details'}
                  </button>

                  {/* Expanded Details */}
                  {expandedTxs.has(tx.txid) && (
                    <>
                      {/* Outputs */}
                      <div className="mb-4">
                        <div className="text-sm font-medium text-white/60 mb-2">Outputs:</div>
                        <div className="space-y-2">
                          {tx.outputs.map((output, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 whitespace-nowrap">
                                  #{idx}
                                </span>
                                {output.address ? (
                                  <a
                                    href={`https://mempool.space/address/${output.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-blue-400 hover:text-blue-300 truncate"
                                  >
                                    {output.address}
                                  </a>
                                ) : (
                                  <span className="font-mono text-xs text-white/40">
                                    OP_RETURN / Non-standard
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-sm whitespace-nowrap ml-3">
                                {formatSats(output.amount)} BTC
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Alkanes Traces */}
                      {tx.protostoneTraces && tx.protostoneTraces.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                            <Zap size={16} className="text-purple-400" />
                            Alkanes Execution Traces ({tx.protostoneTraces.length} protostone{tx.protostoneTraces.length !== 1 ? 's' : ''})
                          </div>
                          <div className="space-y-3">
                            {tx.protostoneTraces.map((trace, idx) => (
                              <div key={idx} className="p-4 rounded-lg bg-black/30 border border-purple-500/20">
                                <div className="text-xs font-medium text-purple-400 mb-2">
                                  Protostone #{idx + 1} (virtual vout {tx.outputs.length + 1 + idx})
                                </div>
                                <pre className="text-xs font-mono text-white/80 overflow-x-auto">
                                  {JSON.stringify(trace, null, 2)}
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
                    <Code size={16} className="text-white/40" />
                  </div>
                  <pre className="p-4 rounded-lg bg-black/30 border border-white/10 overflow-x-auto text-xs font-mono text-white/80">
                    {JSON.stringify(tx, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-white/60">
            <div className="mb-2">No transactions found</div>
            <div className="text-sm text-white/40">
              Transactions will appear here once your wallet has activity
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
