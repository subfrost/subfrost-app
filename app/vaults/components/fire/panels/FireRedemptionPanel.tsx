'use client';

import { useState, useMemo, useRef } from 'react';
import FloorPriceIndicator from '../widgets/FloorPriceIndicator';
import { useFireRedemption } from '@/hooks/fire/useFireRedemption';
import { useFireTokenStats } from '@/hooks/fire/useFireTokenStats';
import { useFireTreasury } from '@/hooks/fire/useFireTreasury';
import { useAlkaneBalance } from '@/hooks/useAlkaneBalance';
import { useFireRedeemMutation } from '@/hooks/fire/useFireRedeemMutation';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

export default function FireRedemptionPanel() {
  const { t } = useTranslation();
  const { isConnected, network } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: redemption } = useFireRedemption();
  const { data: tokenStats } = useFireTokenStats();
  const { data: treasury } = useFireTreasury();
  const redeemMutation = useFireRedeemMutation();

  const config = getConfig(network || 'mainnet');
  const fireTokenId = (config as any).FIRE_TOKEN_ID as string | undefined;
  const { data: fireBalance } = useAlkaneBalance(fireTokenId);
  const fireBalanceNum = parseFloat(fireBalance || '0');
  const fireBalanceDisplay = fireBalanceNum > 0 ? new BigNumber(fireBalance || '0').toFixed(4) : '0.00';

  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const parsedAmount = parseFloat(amount) || 0;

  const cooldownBlocks = Number(redemption?.cooldownRemaining || '0');
  const feeBps = Number(redemption?.fee || '0');
  const feePct = feeBps / 100;
  const totalRedeemed = new BigNumber(redemption?.totalRedeemed || '0').dividedBy(1e8);

  const preview = useMemo(() => {
    if (parsedAmount <= 0) return { lpOut: '0', feeAmount: '0' };
    const backingPerFire = new BigNumber(treasury?.totalBacking || '0')
      .dividedBy(new BigNumber(tokenStats?.circulatingSupply || '1'));
    const grossLp = backingPerFire.multipliedBy(parsedAmount);
    const fee = grossLp.multipliedBy(feePct / 100);
    const netLp = grossLp.minus(fee);
    return {
      lpOut: netLp.dividedBy(1e8).toFixed(6),
      feeAmount: fee.dividedBy(1e8).toFixed(6),
    };
  }, [parsedAmount, treasury, tokenStats, feePct]);

  const handleRedeem = () => {
    if (isDemoGated || parsedAmount <= 0) return;
    const fireAmountBaseUnits = new BigNumber(parsedAmount).multipliedBy(1e8).toFixed(0);
    redeemMutation.mutate({ fireAmount: fireAmountBaseUnits, feeRate: 1 });
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Floor price */}
      <FloorPriceIndicator
        totalBacking={treasury?.totalBacking || '0'}
        circulatingSupply={tokenStats?.circulatingSupply || '0'}
        cooldownBlocks={cooldownBlocks}
      />

      {/* Redeem form */}
      <div className="sf-card p-4 sm:p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
          {t('fire.burnFireForBacking')}
        </div>

        {/* Amount input */}
        <div className="relative sf-input group p-4 cursor-text mb-4" onClick={() => amountRef.current?.focus()}>
          <div className="absolute right-4 top-4 z-10">
            <div className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-[0_2px_8px_rgba(249,115,22,0.35)] flex-shrink-0">
                <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
                </svg>
              </div>
              <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">FIRE</span>
            </div>
          </div>
          <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('fire.fireAmount')}</span>
          <div className="flex items-center gap-2 mt-1 pr-32">
            <input
              ref={amountRef}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className="w-full bg-transparent text-2xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/30 !outline-none !ring-0 !border-none focus:!outline-none focus:!ring-0 focus:!border-none focus-visible:!outline-none focus-visible:!ring-0"
              style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
              {t('boost.balance', { amount: fireBalanceDisplay })}
            </div>
            <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${inputFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setAmount((fireBalanceNum * 0.25).toString())}
                className="sf-percent-btn-pill"
              >
                25%
              </button>
              <button
                type="button"
                onClick={() => setAmount((fireBalanceNum * 0.5).toString())}
                className="sf-percent-btn-pill"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setAmount((fireBalanceNum * 0.75).toString())}
                className="sf-percent-btn-pill"
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setAmount(fireBalance || '0')}
                className="sf-percent-btn-pill"
              >
                {t('boost.max')}
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="sf-panel p-3 sm:p-4 mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[color:var(--sf-muted)]">{t('fire.youReceive')}</span>
            <span className="font-bold text-[color:var(--sf-text)]">{preview.lpOut} LP</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[color:var(--sf-muted)]">{t('fire.fee')} ({feePct.toFixed(1)}%)</span>
            <span className="text-red-400">{preview.feeAmount} LP</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[color:var(--sf-muted)]">{t('fire.totalRedeemedAllTime')}</span>
            <span className="text-[color:var(--sf-text)]/70">{totalRedeemed.toFixed(2)} FIRE</span>
          </div>
        </div>

        <button
          onClick={handleRedeem}
          disabled={!isConnected || parsedAmount <= 0 || cooldownBlocks > 0 || isDemoGated || redeemMutation.isPending}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-red-500 to-red-600 hover:shadow-[0_4px_16px_rgba(239,68,68,0.3)]"
        >
          {isDemoGated ? t('common.comingSoon') : redeemMutation.isPending ? t('fire.redeeming') : cooldownBlocks > 0 ? t('fire.cooldownActive') : !isConnected ? t('fire.connectWallet') : t('fire.redeemFire')}
        </button>
        {redeemMutation.isError && (
          <div className="text-xs text-red-400 mt-2 text-center">{(redeemMutation.error as Error)?.message}</div>
        )}
      </div>
    </div>
  );
}
