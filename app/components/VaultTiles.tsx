'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { AVAILABLE_VAULTS } from '@/app/vaults/constants';

function getHistoricalApy(apyHistory?: number[]): string {
  if (!apyHistory || apyHistory.length === 0) return '-';
  const avg = apyHistory.reduce((sum, val) => sum + val, 0) / apyHistory.length;
  return `${avg.toFixed(1)}%`;
}

export default function VaultTiles() {
  const { t } = useTranslation();
  const VAULT_NAME_KEYS: Record<string, string> = {
    'yv-frbtc': 'vault.yvfrbtc',
    've-diesel': 'vault.veDiesel',
    've-ordi': 'vault.veOrdi',
    've-usd': 'vault.veUsd',
    'dx-btc': 'vault.dxBtc',
  };
  const filteredVaults = AVAILABLE_VAULTS
    .filter(vault => vault.id !== 'yv-frbtc')
    .sort((a, b) => {
      if (a.id === 've-diesel') return -1;
      if (b.id === 've-diesel') return 1;
      return 0;
    });
  const featured = filteredVaults.slice(0, 3);

  return (
    <div className="sf-card">
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('vaults.trending')}</h3>
        <Link href="/vaults" className="sf-card-header-action">{t('vaults.viewAll')}</Link>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {featured.map((v) => {
            const isActive = v.id === 'dx-btc' || v.id === 've-diesel';
            const tileClasses = `sf-tile p-5 focus:outline-none ${isActive ? '' : 'opacity-40 grayscale cursor-default pointer-events-none'}`;
            const content = (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 flex items-center justify-center flex-shrink-0">
                    <img
                      src={v.iconPath || `/tokens/${v.tokenSymbol.toLowerCase()}.svg`}
                      alt={`${v.tokenSymbol} icon`}
                      className="object-contain rounded-full w-full h-full"
                    />
                  </div>
                  <span className="text-sm font-bold text-[color:var(--sf-text)]">{VAULT_NAME_KEYS[v.id] ? t(VAULT_NAME_KEYS[v.id]) : v.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('vaults.deposits')}</div>
                    <div className="text-[color:var(--sf-text)]">-</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('vaults.histApy')}</div>
                    <div className="text-[color:var(--sf-text)]">{getHistoricalApy(v.apyHistory)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('vaults.estApy')}</div>
                    <span className="sf-badge-apy">{v.estimatedApy ? `${v.estimatedApy}%` : '-'}</span>
                  </div>
                </div>
              </>
            );
            return isActive ? (
              <Link key={v.id} href={`/vaults?vault=${v.id}`} className={tileClasses}>
                {content}
              </Link>
            ) : (
              <div key={v.id} className={tileClasses}>
                {content}
              </div>
            );
          })}
      </div>
    </div>
  );
}


