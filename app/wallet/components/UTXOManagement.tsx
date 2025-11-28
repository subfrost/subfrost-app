'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { Box, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface EnrichedUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  alkanes?: Array<{ symbol: string; amount: string }>;
  runes?: Array<{ name: string; amount: string }>;
  inscriptions?: Array<{ id: string; contentType: string }>;
}

export default function UTXOManagement() {
  const { address } = useWallet() as any;
  const [utxos, setUtxos] = useState<EnrichedUTXO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRunes, setShowRunes] = useState(true);
  const [showInscriptions, setShowInscriptions] = useState(true);
  const [expandedUtxo, setExpandedUtxo] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUTXOs() {
      setLoading(true);
      try {
        // TODO: Implement actual UTXO fetching with enrichment
        // Using placeholder data for now
        setUtxos([
          {
            txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            vout: 0,
            value: 50000,
            scriptPubKey: '001412ab3c',
            alkanes: [
              { symbol: 'ALK', amount: '100.5' },
            ],
          },
          {
            txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            vout: 1,
            value: 100000,
            scriptPubKey: '001498ab76',
            runes: [
              { name: 'EXAMPLE•RUNE', amount: '50' },
            ],
          },
        ]);
      } catch (error) {
        console.error('Failed to fetch UTXOs:', error);
      } finally {
        setLoading(false);
      }
    }

    if (address) {
      fetchUTXOs();
    }
  }, [address]);

  const toggleUtxo = (utxoKey: string) => {
    setExpandedUtxo(expandedUtxo === utxoKey ? null : utxoKey);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white/60">Loading UTXOs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showRunes}
            onChange={(e) => setShowRunes(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-white/80">Show Runes</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInscriptions}
            onChange={(e) => setShowInscriptions(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-white/80">Show Inscriptions</span>
        </label>
      </div>

      {/* UTXOs List */}
      <div className="space-y-3">
        {utxos.length > 0 ? (
          utxos.map((utxo) => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            const isExpanded = expandedUtxo === utxoKey;

            return (
              <div
                key={utxoKey}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
              >
                <button
                  onClick={() => toggleUtxo(utxoKey)}
                  className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Box size={20} className="text-blue-400" />
                    <div className="text-left">
                      <div className="font-mono text-sm">
                        {utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}:{utxo.vout}
                      </div>
                      <div className="text-xs text-white/60">
                        {(utxo.value / 100000000).toFixed(8)} BTC
                      </div>
                    </div>
                    {utxo.alkanes && utxo.alkanes.length > 0 && (
                      <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
                        {utxo.alkanes.length} Alkane{utxo.alkanes.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {showRunes && utxo.runes && utxo.runes.length > 0 && (
                      <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-xs">
                        {utxo.runes.length} Rune{utxo.runes.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {showInscriptions && utxo.inscriptions && utxo.inscriptions.length > 0 && (
                      <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-xs">
                        {utxo.inscriptions.length} Inscription{utxo.inscriptions.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                    {/* UTXO Details */}
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-white/60">Transaction ID:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-xs break-all">{utxo.txid}</span>
                          <a
                            href={`https://ordiscan.com/tx/${utxo.txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>
                      <div>
                        <span className="text-white/60">Output Index:</span> {utxo.vout}
                      </div>
                      <div>
                        <span className="text-white/60">Value:</span> {(utxo.value / 100000000).toFixed(8)} BTC
                      </div>
                      <div>
                        <span className="text-white/60">Script:</span>
                        <div className="font-mono text-xs mt-1 break-all">{utxo.scriptPubKey}</div>
                      </div>
                    </div>

                    {/* Alkanes */}
                    {utxo.alkanes && utxo.alkanes.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white/80 mb-2">Alkanes:</div>
                        <div className="space-y-1">
                          {utxo.alkanes.map((alkane, idx) => (
                            <div key={idx} className="flex justify-between text-sm p-2 rounded bg-white/5">
                              <span>{alkane.symbol}</span>
                              <span className="font-mono">{alkane.amount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Runes */}
                    {showRunes && utxo.runes && utxo.runes.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white/80 mb-2">Runes:</div>
                        <div className="space-y-1">
                          {utxo.runes.map((rune, idx) => (
                            <div key={idx} className="flex justify-between text-sm p-2 rounded bg-white/5">
                              <span>{rune.name}</span>
                              <span className="font-mono">{rune.amount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inscriptions */}
                    {showInscriptions && utxo.inscriptions && utxo.inscriptions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white/80 mb-2">Inscriptions:</div>
                        <div className="space-y-1">
                          {utxo.inscriptions.map((inscription, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm p-2 rounded bg-white/5">
                              <span className="font-mono text-xs">{inscription.id.slice(0, 16)}...</span>
                              <span className="text-white/60">{inscription.contentType}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-white/60">
            No UTXOs found
          </div>
        )}
      </div>
    </div>
  );
}
