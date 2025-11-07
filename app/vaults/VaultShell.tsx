"use client";

import { useState } from "react";
import { AVAILABLE_VAULTS, AVAILABLE_GAUGES, VaultConfig } from "./constants";
import VaultListItem from "./components/VaultListItem";
import VaultDetail from "./components/VaultDetail";
import GaugeVault from "./components/GaugeVault";

export default function VaultShell() {
  const [view, setView] = useState<'vaults' | 'gauges'>('vaults');
  const [selectedVault, setSelectedVault] = useState<VaultConfig | null>(null);

  const allVaults = view === 'vaults' ? AVAILABLE_VAULTS : AVAILABLE_GAUGES;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[color:var(--sf-text)]">Vaults</h1>
        
        {/* View Toggle */}
        <div className="flex gap-2 rounded-xl border border-[color:var(--sf-outline)] bg-white/60 p-1.5 backdrop-blur-sm">
          <button
            onClick={() => {
              setView('vaults');
              setSelectedVault(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              view === 'vaults'
                ? 'bg-[color:var(--sf-primary)] text-white shadow-md'
                : 'text-[color:var(--sf-text)] hover:bg-black/5'
            }`}
          >
            Vaults
          </button>
          <button
            onClick={() => {
              setView('gauges');
              setSelectedVault(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              view === 'gauges'
                ? 'bg-[color:var(--sf-primary)] text-white shadow-md'
                : 'text-[color:var(--sf-text)] hover:bg-black/5'
            }`}
          >
            Gauges
          </button>
        </div>
      </div>

      {/* Content */}
      {selectedVault ? (
        <div className="space-y-4">
          {/* Back Button */}
          <button
            onClick={() => setSelectedVault(null)}
            className="flex items-center gap-2 text-[color:var(--sf-text)] hover:text-[color:var(--sf-primary)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm font-semibold">Back to {view === 'vaults' ? 'Vaults' : 'Gauges'}</span>
          </button>

          {/* Vault Detail */}
          {view === 'vaults' ? (
            <VaultDetail vault={selectedVault} />
          ) : (
            <GaugeVault />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Vault List */}
          {allVaults.map((vault) => (
            <VaultListItem
              key={vault.id}
              vault={vault}
              isSelected={false}
              onClick={() => setSelectedVault(vault)}
            />
          ))}

          {allVaults.length === 0 && (
            <div className="text-center py-12 text-[color:var(--sf-text)]/60">
              No {view} available yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
