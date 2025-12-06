"use client";
import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import { useGlobalStore } from '@/stores/global';

export default function SettingsPage() {
  const { maxSlippage, setMaxSlippage, deadlineBlocks, setDeadlineBlocks } = useGlobalStore();

  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title="Settings" />}> 
        <div className="grid max-w-xl gap-6 rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-[color:var(--sf-text)]">Max slippage (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={maxSlippage}
              onChange={(e) => setMaxSlippage(e.target.value)}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] focus:outline-none"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-[color:var(--sf-text)]">Deadline (blocks)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={deadlineBlocks}
              onChange={(e) => setDeadlineBlocks(Number(e.target.value || 0))}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] focus:outline-none"
            />
          </div>
        </div>
      </AlkanesMainWrapper>
    </PageContent>
  );
}


