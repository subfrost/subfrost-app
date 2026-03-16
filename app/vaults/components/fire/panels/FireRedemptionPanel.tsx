'use client';

import { useState, useMemo, useRef } from 'react';
import FloorPriceIndicator from '../widgets/FloorPriceIndicator';
import { useFireRedemption } from '@/hooks/fire/useFireRedemption';
import { useFireTokenStats } from '@/hooks/fire/useFireTokenStats';
import { useFireTreasury } from '@/hooks/fire/useFireTreasury';
import { useWallet } from '@/context/WalletContext';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

export default function FireRedemptionPanel() {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: redemption } = useFireRedemption();
  const { data: tokenStats } = useFireTokenStats();
  const { data: treasury } = useFireTreasury();

  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
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
    if (isDemoGated) return;
    console.log('[FireRedemptionPanel] Redeem:', { amount });
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
      <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
          {t('fire.burnFireForBacking')}
        </div>

        {/* Amount input */}
        <div
          className={`rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[200ms] cursor-text mb-4 ${
            amountFocused
              ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]'
              : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'
          }`}
          onClick={() => amountRef.current?.focus()}
        >
          <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('fire.fireAmount')}</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              ref={amountRef}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              placeholder="0.00"
              className="w-full bg-transparent text-2xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/30 !outline-none !ring-0 !border-none focus:!outline-none focus:!ring-0 focus:!border-none focus-visible:!outline-none focus-visible:!ring-0"
              style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
            />
            <span className="text-sm font-bold text-[color:var(--sf-muted)] flex-shrink-0">FIRE</span>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-3 sm:p-4 mb-4 space-y-2">
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
          disabled={!isConnected || parsedAmount <= 0 || cooldownBlocks > 0 || isDemoGated}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-red-500 to-red-600 hover:shadow-[0_4px_16px_rgba(239,68,68,0.3)]"
        >
          {isDemoGated ? t('common.comingSoon') : cooldownBlocks > 0 ? t('fire.cooldownActive') : !isConnected ? t('fire.connectWallet') : t('fire.redeemFire')}
        </button>
      </div>
    </div>
  );
}
