'use client';

import { useState, useEffect } from 'react';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { Box, ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCw, Filter, Lock, Unlock, Scissors } from 'lucide-react';
import InscriptionRenderer from '@/app/components/InscriptionRenderer';
import SplitUtxoModal from './SplitUtxoModal';
import { useTranslation } from '@/hooks/useTranslation';

type UTXOFilterType = 'all' | 'p2wpkh' | 'p2tr' | 'protorunes' | 'runes' | 'brc20';

export default function UTXOManagement() {
  const { t } = useTranslation();
  const { utxos, isLoading, error, refresh } = useEnrichedWalletData();
  const [expandedUtxo, setExpandedUtxo] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Set<UTXOFilterType>>(new Set(['all']));
  const [frozenUtxos, setFrozenUtxos] = useState<Set<string>>(new Set());
  const [splitUtxo, setSplitUtxo] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        new Promise(resolve => setTimeout(resolve, 500)) // minimum 500ms spin
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

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

  // Toggle filter selection (multi-select, except "All" clears others)
  const toggleFilter = (filterId: UTXOFilterType) => {
    const newFilters = new Set(selectedFilters);

    if (filterId === 'all') {
      // Clicking "All" clears everything and selects only "All"
      setSelectedFilters(new Set(['all']));
      return;
    }

    // Remove 'all' when selecting other filters
    newFilters.delete('all');

    if (newFilters.has(filterId)) {
      newFilters.delete(filterId);
      // If no filters selected, default to 'all'
      if (newFilters.size === 0) {
        newFilters.add('all');
      }
    } else {
      newFilters.add(filterId);
    }

    setSelectedFilters(newFilters);
  };

  // Filter UTXOs based on selected filters (multi-select)
  const filteredUtxos = (() => {
    // If 'all' is selected, show all UTXOs
    if (selectedFilters.has('all')) {
      return utxos.all;
    }

    // Otherwise, filter by selected criteria (union of all selected filters)
    return utxos.all.filter(u => {
      if (selectedFilters.has('p2wpkh') && utxos.p2wpkh.some(p => p.txid === u.txid && p.vout === u.vout)) {
        return true;
      }
      if (selectedFilters.has('p2tr') && utxos.p2tr.some(p => p.txid === u.txid && p.vout === u.vout)) {
        return true;
      }
      if (selectedFilters.has('protorunes') && u.alkanes && Object.keys(u.alkanes).length > 0) {
        return true;
      }
      if (selectedFilters.has('runes') && u.runes && Object.keys(u.runes).length > 0) {
        return true;
      }
      if (selectedFilters.has('brc20') && u.inscriptions && u.inscriptions.length > 0) {
        return true;
      }
      return false;
    });
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-[color:var(--sf-text)]/60" size={32} />
        <div className="ml-3 text-[color:var(--sf-text)]/60">{t('utxo.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
        >
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box size={24} className="text-[color:var(--sf-primary)]" />
          <h3 className="text-lg font-bold text-[color:var(--sf-text)]">
            {t(filteredUtxos.length === 1 ? 'utxo.countSingular' : 'utxo.countPlural', { count: filteredUtxos.length })}
          </h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50"
          title={t('utxo.refresh')}
        >
          <RefreshCw size={20} className={isLoading || isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[color:var(--sf-text)]/80">
          <Filter size={16} />
          <span className="text-sm font-medium">{t('utxo.filterBy')}</span>
          <span className="text-xs text-[color:var(--sf-text)]/50">{t('utxo.multiSelect')}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: t('utxo.filterAll') },
            { id: 'p2wpkh', label: t('utxo.filterNativeSegwit') },
            { id: 'p2tr', label: t('utxo.filterTaproot') },
            { id: 'runes', label: t('utxo.filterRunes') },
            { id: 'protorunes', label: t('utxo.filterAlkanes') },
            { id: 'brc20', label: t('utxo.filterInscriptions') },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id as UTXOFilterType)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                selectedFilters.has(f.id as UTXOFilterType)
                  ? 'bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white'
                  : 'bg-[color:var(--sf-primary)]/5 text-[color:var(--sf-text)]/60 hover:bg-[color:var(--sf-primary)]/10 hover:text-[color:var(--sf-text)]/80'
              }`}
            >
              {f.label}
            </button>
          ))}
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
                className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 overflow-hidden"
              >
                <button
                  onClick={() => toggleUtxo(utxoKey)}
                  className="w-full p-4 flex items-center justify-between hover:bg-[color:var(--sf-primary)]/5 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                >
                  <div className="flex items-center gap-4">
                    <Box size={20} className="text-[color:var(--sf-primary)]" />
                    <div className="text-left">
                      <div className="text-sm flex items-center gap-2 text-[color:var(--sf-text)]">
                        <span>{utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}:{utxo.vout}</span>
                        {isFrozen(utxoKey) && (
                          <span title={t('utxo.frozen')}>
                            <Lock size={14} className="text-yellow-400" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[color:var(--sf-text)]/60">
                        {(utxo.value / 100000000).toFixed(8)} BTC
                      </div>
                    </div>
                    {utxo.alkanes && Object.keys(utxo.alkanes).length > 0 && (
                      <span className="px-2 py-1 rounded bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)] text-xs">
                        {t(Object.keys(utxo.alkanes).length === 1 ? 'utxo.protoruneCountSingular' : 'utxo.protoruneCountPlural', { count: Object.keys(utxo.alkanes).length })}
                      </span>
                    )}
                    {utxo.runes && Object.keys(utxo.runes).length > 0 && (
                      <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-500 dark:text-purple-400 text-xs">
                        {t(Object.keys(utxo.runes).length === 1 ? 'utxo.runeCountSingular' : 'utxo.runeCountPlural', { count: Object.keys(utxo.runes).length })}
                      </span>
                    )}
                    {utxo.inscriptions && utxo.inscriptions.length > 0 && (
                      <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-500 dark:text-orange-400 text-xs">
                        {t(utxo.inscriptions.length === 1 ? 'utxo.inscriptionCountSingular' : 'utxo.inscriptionCountPlural', { count: utxo.inscriptions.length })}
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={20} className="text-[color:var(--sf-text)]" /> : <ChevronDown size={20} className="text-[color:var(--sf-text)]" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[color:var(--sf-outline)] pt-3">
                    {/* UTXO Actions */}
                    <div className="flex gap-2 pb-3 border-b border-[color:var(--sf-outline)]">
                      <button
                        onClick={() => toggleFreezeUtxo(utxoKey)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                          isFrozen(utxoKey)
                            ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-[color:var(--sf-primary)]/5 text-[color:var(--sf-text)]/80 hover:bg-[color:var(--sf-primary)]/10'
                        }`}
                      >
                        {isFrozen(utxoKey) ? (
                          <>
                            <Lock size={16} />
                            {t('utxo.frozen')}
                          </>
                        ) : (
                          <>
                            <Unlock size={16} />
                            {t('utxo.freeze')}
                          </>
                        )}
                      </button>

                      {utxo.inscriptions && utxo.inscriptions.length > 0 && (
                        <button
                          onClick={() => setSplitUtxo(utxo)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--sf-primary)]/5 text-[color:var(--sf-text)]/80 hover:bg-[color:var(--sf-primary)]/10 text-sm transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                        >
                          <Scissors size={16} />
                          {t('utxo.splitOrdinals')}
                        </button>
                      )}
                    </div>

                    {/* UTXO Details */}
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-[color:var(--sf-text)]/60">{t('utxo.transactionId')}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs break-all text-[color:var(--sf-text)]">{utxo.txid}</span>
                          <a
                            href={`https://espo.sh/tx/${utxo.txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[color:var(--sf-primary)] hover:opacity-80"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>
                      <div className="text-[color:var(--sf-text)]">
                        <span className="text-[color:var(--sf-text)]/60">{t('utxo.outputIndex')}</span> {utxo.vout}
                      </div>
                      <div className="text-[color:var(--sf-text)]">
                        <span className="text-[color:var(--sf-text)]/60">{t('utxo.value')}</span> {(utxo.value / 100000000).toFixed(8)} BTC
                      </div>
                      {utxo.status.block_height && (
                        <div className="text-[color:var(--sf-text)]">
                          <span className="text-[color:var(--sf-text)]/60">{t('utxo.blockHeight')}</span> {utxo.status.block_height}
                        </div>
                      )}
                    </div>

                    {/* Protorunes/Alkanes */}
                    {utxo.alkanes && Object.keys(utxo.alkanes).length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">{t('utxo.protorunesAlkanes')}</div>
                        <div className="space-y-1">
                          {Object.entries(utxo.alkanes).map(([alkaneId, alkane]) => (
                            <div key={alkaneId} className="flex justify-between text-sm p-2 rounded bg-[color:var(--sf-primary)]/5">
                              <div>
                                <div className="font-medium text-[color:var(--sf-text)]">{alkane.symbol || alkane.name}</div>
                                <div className="text-xs text-[color:var(--sf-text)]/40">{alkaneId}</div>
                              </div>
                              <span className="text-[color:var(--sf-text)]">{alkane.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Runes */}
                    {utxo.runes && Object.keys(utxo.runes).length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">{t('utxo.runes')}</div>
                        <div className="space-y-1">
                          {Object.entries(utxo.runes).map(([runeId, rune]) => (
                            <div key={runeId} className="flex justify-between text-sm p-2 rounded bg-[color:var(--sf-primary)]/5">
                              <span className="text-[color:var(--sf-text)]">{rune.symbol}</span>
                              <span className="text-[color:var(--sf-text)]">{rune.amount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BRC20/Inscriptions */}
                    {utxo.inscriptions && utxo.inscriptions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-2">{t('utxo.brc20Inscriptions')}</div>
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
          <div className="text-center py-12 text-[color:var(--sf-text)]/60">
            {t('utxo.noneFound')}
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
