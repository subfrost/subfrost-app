'use client';

import { useState, useEffect } from 'react';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { Box, ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCw, Filter, Lock, Unlock, Scissors } from 'lucide-react';
import InscriptionRenderer from '@/app/components/InscriptionRenderer';
import SplitUtxoModal from './SplitUtxoModal';

type UTXOFilterType = 'all' | 'p2wpkh' | 'p2tr' | 'alkanes' | 'runes' | 'inscriptions';

export default function UTXOManagement() {
  const { utxos, isLoading, error, refresh } = useEnrichedWalletData();
  const [showRunes, setShowRunes] = useState(true);
  const [showInscriptions, setShowInscriptions] = useState(true);
  const [expandedUtxo, setExpandedUtxo] = useState<string | null>(null);
  const [filter, setFilter] = useState<UTXOFilterType>('all');
  const [frozenUtxos, setFrozenUtxos] = useState<Set<string>>(new Set());
  const [splitUtxo, setSplitUtxo] = useState<any | null>(null);

  // Load frozen UTXOs from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('subfrost_frozen_utxos');
    if (stored) {
      try {
        setFrozenUtxos(new Set(JSON.parse(stored)));
      } catch (err) {
        console.error('Failed to load frozen UTXOs:', err);
      }
    }
  }, []);

  // Save frozen UTXOs to localStorage
  useEffect(() => {
    localStorage.setItem('subfrost_frozen_utxos', JSON.stringify(Array.from(frozenUtxos)));
  }, [frozenUtxos]);

  const toggleUtxo = (utxoKey: string) => {
    setExpandedUtxo(expandedUtxo === utxoKey ? null : utxoKey);
  };

  const toggleFreezeUtxo = (utxoKey: string) => {
    const newFrozen = new Set(frozenUtxos);
    if (newFrozen.has(utxoKey)) {
      newFrozen.delete(utxoKey);
    } else {
      newFrozen.add(utxoKey);
    }
    setFrozenUtxos(newFrozen);
  };

  const isFrozen = (utxoKey: string) => frozenUtxos.has(utxoKey);

  // Filter UTXOs based on selected filter
  const filteredUtxos = (() => {
    let baseList = utxos.all;
    
    switch (filter) {
      case 'p2wpkh':
        baseList = utxos.p2wpkh;
        break;
      case 'p2tr':
        baseList = utxos.p2tr;
        break;
      case 'alkanes':
        baseList = utxos.all.filter(u => u.alkanes && Object.keys(u.alkanes).length > 0);
        break;
      case 'runes':
        baseList = utxos.all.filter(u => u.runes && Object.keys(u.runes).length > 0);
        break;
      case 'inscriptions':
        baseList = utxos.all.filter(u => u.inscriptions && u.inscriptions.length > 0);
        break;
      default:
        baseList = utxos.all;
    }
    
    return baseList;
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-white/60" size={32} />
        <div className="ml-3 text-white/60">Loading UTXOs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box size={24} className="text-blue-400" />
          <h3 className="text-lg font-bold text-white">
            {filteredUtxos.length} UTXO{filteredUtxos.length !== 1 ? 's' : ''}
          </h3>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors text-white/60 hover:text-white/80 disabled:opacity-50"
          title="Refresh UTXOs"
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-white/80">
          <Filter size={16} />
          <span className="text-sm font-medium">Filter by:</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: 'All' },
            { id: 'p2wpkh', label: 'P2WPKH' },
            { id: 'p2tr', label: 'P2TR' },
            { id: 'alkanes', label: 'Alkanes' },
            { id: 'runes', label: 'Runes' },
            { id: 'inscriptions', label: 'Inscriptions' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as UTXOFilterType)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-[color:var(--sf-primary)]/5 text-white/60 hover:bg-[color:var(--sf-primary)]/10 hover:text-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
      </div>

      {/* UTXOs List */}
      <div className="space-y-3">
        {filteredUtxos.length > 0 ? (
          filteredUtxos.map((utxo) => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            const isExpanded = expandedUtxo === utxoKey;

            return (
              <div
                key={utxoKey}
                className="rounded-xl border border-white/10 bg-[color:var(--sf-primary)]/5 overflow-hidden"
              >
                <button
                  onClick={() => toggleUtxo(utxoKey)}
                  className="w-full p-4 flex items-center justify-between hover:bg-[color:var(--sf-primary)]/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Box size={20} className="text-blue-400" />
                    <div className="text-left">
                      <div className="font-mono text-sm flex items-center gap-2">
                        <span>{utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}:{utxo.vout}</span>
                        {isFrozen(utxoKey) && (
                          <span title="Frozen UTXO">
                            <Lock size={14} className="text-yellow-400" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/60">
                        {(utxo.value / 100000000).toFixed(8)} BTC
                      </div>
                    </div>
                    {utxo.alkanes && Object.keys(utxo.alkanes).length > 0 && (
                      <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
                        {Object.keys(utxo.alkanes).length} Alkane{Object.keys(utxo.alkanes).length > 1 ? 's' : ''}
                      </span>
                    )}
                    {showRunes && utxo.runes && Object.keys(utxo.runes).length > 0 && (
                      <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-xs">
                        {Object.keys(utxo.runes).length} Rune{Object.keys(utxo.runes).length > 1 ? 's' : ''}
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
                    {/* UTXO Actions */}
                    <div className="flex gap-2 pb-3 border-b border-white/10">
                      <button
                        onClick={() => toggleFreezeUtxo(utxoKey)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isFrozen(utxoKey)
                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-white/5 text-white/80 hover:bg-white/10'
                        }`}
                      >
                        {isFrozen(utxoKey) ? (
                          <>
                            <Lock size={16} />
                            Frozen
                          </>
                        ) : (
                          <>
                            <Unlock size={16} />
                            Freeze
                          </>
                        )}
                      </button>

                      {utxo.inscriptions && utxo.inscriptions.length > 0 && (
                        <button
                          onClick={() => setSplitUtxo(utxo)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-white/80 hover:bg-white/10 text-sm transition-colors"
                        >
                          <Scissors size={16} />
                          Split Ordinals
                        </button>
                      )}
                    </div>

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
                      {utxo.status.block_height && (
                        <div>
                          <span className="text-white/60">Block Height:</span> {utxo.status.block_height}
                        </div>
                      )}
                    </div>

                    {/* Alkanes */}
                    {utxo.alkanes && Object.keys(utxo.alkanes).length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white/80 mb-2">Alkanes:</div>
                        <div className="space-y-1">
                          {Object.entries(utxo.alkanes).map(([alkaneId, alkane]) => (
                            <div key={alkaneId} className="flex justify-between text-sm p-2 rounded bg-[color:var(--sf-primary)]/5">
                              <div>
                                <div className="font-medium text-white">{alkane.symbol || alkane.name}</div>
                                <div className="text-xs text-white/40">{alkaneId}</div>
                              </div>
                              <span className="font-mono text-white">{alkane.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Runes */}
                    {showRunes && utxo.runes && Object.keys(utxo.runes).length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white/80 mb-2">Runes:</div>
                        <div className="space-y-1">
                          {Object.entries(utxo.runes).map(([runeId, rune]) => (
                            <div key={runeId} className="flex justify-between text-sm p-2 rounded bg-[color:var(--sf-primary)]/5">
                              <span className="text-white">{rune.symbol}</span>
                              <span className="font-mono text-white">{rune.amount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inscriptions */}
                    {showInscriptions && utxo.inscriptions && utxo.inscriptions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white/80 mb-2">Inscriptions:</div>
                        <div className="space-y-3">
                          {utxo.inscriptions.map((inscription, idx) => (
                            <InscriptionRenderer
                              key={idx}
                              inscriptionId={inscription.id}
                              inscriptionNumber={inscription.number}
                              showMetadata={true}
                            />
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

      {/* Split UTXO Modal */}
      <SplitUtxoModal
        isOpen={splitUtxo !== null}
        onClose={() => {
          setSplitUtxo(null);
          refresh(); // Refresh UTXOs after splitting
        }}
        utxo={splitUtxo}
      />
    </div>
  );
}
