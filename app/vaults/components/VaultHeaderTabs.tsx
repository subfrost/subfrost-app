"use client";

type Props = {
  activeTab: 'yve-diesel' | 'gauge';
  onTabChange: (tab: 'yve-diesel' | 'gauge') => void;
};

import { useTranslation } from '@/hooks/useTranslation';

export default function VaultHeaderTabs({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[color:var(--sf-text)]">{t('vaultTabs.vaults')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-1.5 backdrop-blur-sm">
        <button
          onClick={() => onTabChange('yve-diesel')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
            activeTab === 'yve-diesel'
              ? 'bg-[color:var(--sf-primary)] text-white shadow-md'
              : 'text-[color:var(--sf-text)] hover:bg-black/5'
          }`}
        >
          {t('vaultTabs.yveDieselVault')}
        </button>
        <button
          onClick={() => onTabChange('gauge')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
            activeTab === 'gauge'
              ? 'bg-[color:var(--sf-primary)] text-white shadow-md'
              : 'text-[color:var(--sf-text)] hover:bg-black/5'
          }`}
        >
          {t('vaultTabs.gaugeStaking')}
        </button>
      </div>
    </div>
  );
}
