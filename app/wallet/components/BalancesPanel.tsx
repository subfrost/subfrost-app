'use client';

import { useWallet } from '@/context/WalletContext';
import { Flame } from 'lucide-react';
import { useFuelAllocation } from '@/hooks/useFuelAllocation';

export default function BalancesPanel() {
  const fuelAllocation = useFuelAllocation();

  return (
    <div className="space-y-6">
      {/* FUEL Allocation - only visible to wallets on the allocation list */}
      {fuelAllocation.isEligible && (
        <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                <Flame size={20} className="text-amber-400" />
              </div>
              <div>
                <div className="text-sm text-[color:var(--sf-text)]/60 mb-1">FUEL Allocation</div>
                <div className="text-lg sm:text-xl font-bold text-[color:var(--sf-text)]">
                  {fuelAllocation.amount.toLocaleString()} FUEL
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-amber-500/20">
            <p className="text-xs text-[color:var(--sf-text)]/60 leading-relaxed">
              FUEL tokens will be claimable when the governance module launches.
            </p>
          </div>
        </div>
      )}

      {!fuelAllocation.isEligible && (
        <div className="text-center py-8 text-[color:var(--sf-text)]/40 text-sm">
          No additional balances to display.
        </div>
      )}
    </div>
  );
}
