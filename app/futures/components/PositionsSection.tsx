'use client';

import { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useWallet } from '@/context/WalletContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { useFutures } from '@/hooks/useFutures';

type FtrPosition = {
  contract: string;
  amount: string;        // in ftrBTC
  exerciseValue: string; // deterministic polynomial value in BTC
  lastTrade?: string;    // optional: last secondary market trade
  timeLeft: string;      // blocks left
};

export default function PositionsSection() {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const walletData = useEnrichedWalletData();
  const { futures } = useFutures();

  // Derive ftrBTC positions from wallet alkane balances matched against on-chain futures
  const ftrBTCPositions: FtrPosition[] = useMemo(() => {
    if (!isConnected || !walletData?.balances?.alkanes || futures.length === 0) return [];

    const futureIds = new Set(futures.map(f => f.id));
    const alkanes = walletData.balances.alkanes ?? [];

    return alkanes
      .filter((a) => futureIds.has(a.alkaneId))
      .map((a) => {
        const future = futures.find(f => f.id === a.alkaneId);
        const amountBtc = (Number(a.balance) / 1e8).toFixed(4);
        return {
          contract: a.alkaneId,
          amount: amountBtc,
          exerciseValue: future ? `${(future.marketPrice * Number(amountBtc)).toFixed(4)} BTC` : '--',
          timeLeft: future ? `${future.blocksLeft} blocks` : '--',
        };
      });
  }, [isConnected, walletData, futures]);

  return (
    <div className="sf-card overflow-hidden flex flex-col">
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">My ftrBTC Holdings</h3>
      </div>

      {!isConnected ? (
        <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
          Connect wallet to view positions
        </div>
      ) : ftrBTCPositions.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
          No ftrBTC positions found in wallet
        </div>
      ) : (
        <>
          {/* Desktop header */}
          <div className="sf-table-header hidden sm:grid grid-cols-5 gap-2 px-6">
            <div>{t('positions.contract')}</div>
            <div>{t('positions.amount')}</div>
            <div>{t('positions.exerciseValue')}</div>
            <div>{t('positions.blocksLeft')}</div>
            <div className="text-right">{t('positions.actions')}</div>
          </div>

          {/* Mobile header */}
          <div className="sf-table-header sm:hidden grid grid-cols-3 gap-2 px-4">
            <div>{t('positions.contract')}</div>
            <div>{t('positions.exerciseValue')}</div>
            <div className="text-right">{t('positions.actions')}</div>
          </div>

          <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(5 * 85px)' }}>
            {ftrBTCPositions.map((position) => (
              <div key={position.contract}>
                {/* Desktop row */}
                <div className="sf-row hidden sm:grid grid-cols-5 items-center gap-2 px-6 py-4">
                  <div className="text-sm font-bold text-[color:var(--sf-primary)] truncate">
                    {position.contract}
                  </div>
                  <div className="text-sm font-bold text-[color:var(--sf-text)]">
                    {position.amount}
                  </div>
                  <div className="text-sm font-bold text-[color:var(--sf-primary)]">
                    {position.exerciseValue}
                  </div>
                  <div className="text-sm text-[color:var(--sf-text)]">
                    {position.timeLeft}
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      className="sf-btn-primary px-3 py-1.5 text-[10px]"
                    >
                      {t('positions.exercise')}
                    </button>
                  </div>
                </div>

                {/* Mobile row */}
                <div className="sf-row sm:hidden grid grid-cols-3 items-center gap-2 px-4 py-4">
                  <div>
                    <div className="text-sm font-bold text-[color:var(--sf-primary)] truncate">
                      {position.contract}
                    </div>
                    <div className="text-[10px] text-[color:var(--sf-text)]/50 mt-0.5">
                      {position.amount} ftrBTC · {position.timeLeft}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[color:var(--sf-primary)]">
                    {position.exerciseValue}
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      className="sf-btn-primary px-2.5 py-1.5 text-[10px]"
                    >
                      {t('positions.exercise')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
