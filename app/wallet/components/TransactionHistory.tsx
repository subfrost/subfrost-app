'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { Activity, ExternalLink, Clock, CheckCircle, Code } from 'lucide-react';

interface Transaction {
  txid: string;
  timestamp: number;
  status: 'confirmed' | 'pending';
  recipients: Array<{ address: string; amount: number; type: string }>;
  runestoneTrace?: any; // Will be JSON from runestone trace output
}

export default function TransactionHistory() {
  const { address } = useWallet() as any;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const pageSize = 50;

  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      try {
        // TODO: Implement actual transaction fetching with runestone traces
        // Similar to: alkanes-cli esplora address-txs --runestone-trace
        setTransactions([
          {
            txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            timestamp: Date.now() - 3600000,
            status: 'confirmed',
            recipients: [
              { address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', amount: 50000, type: 'p2wpkh' },
              { address: 'tb1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', amount: 25000, type: 'p2tr' },
            ],
            runestoneTrace: {
              protostones: [
                {
                  pointer: 0,
                  refund: null,
                  edicts: [],
                },
              ],
            },
          },
          {
            txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            timestamp: Date.now() - 7200000,
            status: 'confirmed',
            recipients: [
              { address: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', amount: 100000, type: 'p2wsh' },
            ],
          },
        ]);
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      } finally {
        setLoading(false);
      }
    }

    if (address) {
      fetchTransactions();
    }
  }, [address, page]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getAddressType = (type: string) => {
    const types: Record<string, string> = {
      p2wpkh: 'Native SegWit',
      p2wsh: 'SegWit Script',
      p2tr: 'Taproot',
      p2pkh: 'Legacy',
      p2sh: 'Script Hash',
    };
    return types[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white/60">Loading transactions...</div>
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
                  {tx.status === 'confirmed' ? (
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
                        href={`https://ordiscan.com/tx/${tx.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {formatDate(tx.timestamp)}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    tx.status === 'confirmed'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {tx.status}
                </span>
              </div>

              {viewMode === 'visual' ? (
                <>
                  {/* Recipients */}
                  <div className="mb-4">
                    <div className="text-sm font-medium text-white/60 mb-2">Recipients:</div>
                    <div className="space-y-2">
                      {tx.recipients.map((recipient, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 whitespace-nowrap">
                              {getAddressType(recipient.type)}
                            </span>
                            <a
                              href={`https://ordiscan.com/address/${recipient.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-blue-400 hover:text-blue-300 truncate"
                            >
                              {recipient.address}
                            </a>
                          </div>
                          <span className="font-mono text-sm whitespace-nowrap ml-3">
                            {(recipient.amount / 100000000).toFixed(8)} BTC
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Runestone Trace */}
                  {tx.runestoneTrace && (
                    <div>
                      <div className="text-sm font-medium text-white/60 mb-2">Runestone Trace:</div>
                      <div className="p-4 rounded-lg bg-black/30 border border-white/10">
                        <div className="text-xs font-mono text-white/80">
                          <div className="mb-2">
                            <span className="text-purple-400">Protostones:</span> {tx.runestoneTrace.protostones.length}
                          </div>
                          {tx.runestoneTrace.protostones.map((ps: any, idx: number) => (
                            <div key={idx} className="ml-4 mt-2">
                              <div>• Pointer: {ps.pointer ?? 'none'}</div>
                              <div>• Refund: {ps.refund ?? 'none'}</div>
                              <div>• Edicts: {ps.edicts.length}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
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
            No transactions found
          </div>
        )}
      </div>

      {/* Pagination */}
      {transactions.length === pageSize && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-white/60">
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
