'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { AVAILABLE_VAULTS } from '@/app/vaults/constants';

export default function VaultTiles() {
  const { t } = useTranslation();
  const router = useRouter();
  const VAULT_NAME_KEYS: Record<string, string> = {
    'yv-frbtc': 'vault.yvfrbtc',
    've-diesel': 'vault.veDiesel',
    've-ordi': 'vault.veOrdi',
    've-usd': 'vault.veUsd',
    'dx-btc': 'vault.dxBtc',
  };
  const fireVault = AVAILABLE_VAULTS.find(v => v.id === 've-diesel');

  return (
    <div className="sf-card h-full">
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('vaults.trending')}</h3>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {fireVault && (
          <Link
            key={fireVault.id}
            href={`/vaults?vault=${fireVault.id}`}
            className="sf-tile p-5 focus:outline-none"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 flex items-center justify-center flex-shrink-0">
                <img
                  src={fireVault.iconPath || `/tokens/${fireVault.tokenSymbol.toLowerCase()}.svg`}
                  alt={`${fireVault.tokenSymbol} icon`}
                  className="object-contain rounded-full w-full h-full"
                />
              </div>
              <span className="text-sm font-bold text-[color:var(--sf-text)]">
                {VAULT_NAME_KEYS[fireVault.id] ? t(VAULT_NAME_KEYS[fireVault.id]) : fireVault.name}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">7D APY</div>
                  <div className="font-bold text-[color:var(--sf-text)]">TBD</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">30D APY</div>
                  <div className="font-bold text-[color:var(--sf-text)]">TBD</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('vaults.deposits')}</div>
                <div className="font-bold text-[color:var(--sf-text)]">-</div>
              </div>
            </div>
          </Link>
        )}
        <button
          onClick={() => router.push('/vaults')}
          className="sf-tab-btn flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]">
            Other Vaults
          </span>
          <ChevronRight size={14} className="text-[color:var(--sf-text)]/60" />
        </button>
      </div>
    </div>
  );
}


