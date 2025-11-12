"use client";

import { useState } from "react";
import { ALL_VAULTS, VaultConfig } from "./constants";
import VaultListItem from "./components/VaultListItem";
import VaultDetail from "./components/VaultDetail";
import GaugeVault from "./components/GaugeVault";

export default function VaultShell() {
  const [selectedVault, setSelectedVault] = useState<VaultConfig | null>(null);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[color:var(--sf-text)]">Vaults</h1>
          <p className="mt-1 text-sm text-[color:var(--sf-text)]/60">
            Deposit assets to earn yield through automated strategies
          </p>
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
            <span className="text-sm font-semibold">Back to Vaults</span>
          </button>

          {/* Vault Detail */}
          {selectedVault.type === 'gauge' ? (
            <GaugeVault />
          ) : (
            <VaultDetail vault={selectedVault} />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Vault List */}
          {ALL_VAULTS.map((vault) => (
            <VaultListItem
              key={vault.id}
              vault={vault}
              isSelected={false}
              onClick={() => setSelectedVault(vault)}
            />
          ))}

          {ALL_VAULTS.length === 0 && (
            <div className="text-center py-12 text-[color:var(--sf-text)]/60">
              No vaults available yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
