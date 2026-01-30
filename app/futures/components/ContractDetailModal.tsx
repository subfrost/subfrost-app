'use client';

import { useEffect, useRef, useState } from 'react';
import NumberField from '@/app/components/NumberField';
import TokenIcon from '@/app/components/TokenIcon';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useTranslation } from '@/hooks/useTranslation';

// Calculate exercise cost premium (fee percentage) based on blocks left
// Premiums: ~5% at start (100 blocks left), 3% at 30 blocks left, 0.1% at expiry (0 blocks left)
function calculateExercisePremium(blocksLeft: number): number {
  const x = Math.max(0, Math.min(100, blocksLeft));
  const a = -0.000681;
  const b = 0.117097;
  const c = 0.1;
  const premium = a * x * x + b * x + c;
  return Math.max(0.1, Math.min(5.0, Math.round(premium * 100) / 100));
}

// Calculate exercise price (what you get per 1 BTC) = 1 - premium%
function calculateExercisePrice(blocksLeft: number, notionalBtc: number = 1.0): number {
  const premiumPercent = calculateExercisePremium(blocksLeft);
  return notionalBtc * (1 - premiumPercent / 100);
}

type ContractDetailModalProps = {
  contractId: string;
  blocksLeft: number;
  data: {
    expiryBlock: number;
    created: string;
    totalSupply: number;
    remaining: number;
    exercised: number;
    vaultFreeCapital: number;
    liquidityDepth: number;
  };
  onClose: () => void;
};

export default function ContractDetailModal({
  contractId,
  blocksLeft,
  data,
  onClose,
}: ContractDetailModalProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('1.00');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showBuyComingSoon, setShowBuyComingSoon] = useState(false);
  const [showSellComingSoon, setShowSellComingSoon] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const { data: btcPrice } = useBtcPrice();

  // Calculate exercise values
  const exercisePremium = calculateExercisePremium(blocksLeft);
  const exercisePrice = calculateExercisePrice(blocksLeft);
  
  // Mock calculations
  const timeLeft = t('futures.nBlocks', { count: blocksLeft });
  const exerciseValue = `${exercisePrice.toFixed(3)} BTC`;
  const marketPrice = '0.948 BTC';
  const estimatedCost = (parseFloat(amount) * 0.948).toFixed(3);

  // Mock chart data (simple trend)
  const chartData = [
    { time: 0, value: 0.5 },
    { time: 2, value: 0.6 },
    { time: 4, value: 0.75 },
    { time: 6, value: 0.942 },
    { time: 8, value: 1.0 },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl max-h-[90vh] flex flex-col rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="shrink-0 bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)] rounded-t-3xl flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{contractId}</h2>
            <p className="text-xs sm:text-sm font-medium text-[color:var(--sf-text)]/60 mt-1">
              {t('contractModal.expiryIn', { timeLeft, block: data.expiryBlock.toLocaleString(), value: exerciseValue })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Chart Section */}
          <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <h3 className="text-base sm:text-lg font-semibold text-[color:var(--sf-text)] mb-4">
              {t('contractModal.unlockValueOverTime')}
            </h3>
            {/* Simple chart visualization */}
            <div className="h-36 flex items-end justify-between gap-2">
              {chartData.map((point, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t bg-[color:var(--sf-primary)]/60 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-primary)]"
                    style={{ height: `${point.value * 100}%` }}
                  />
                  <div className="text-xs text-[color:var(--sf-text)]/70">{point.time}d</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-[color:var(--sf-text)]/70 text-center">
              {t('contractModal.timeToFullBtc')}
            </div>
          </div>

          {/* Buy / Sell Panel */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="sm:col-span-2 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.15)] space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.exercisePrice')}</span>
                  <span className="font-medium text-[color:var(--sf-text)]">{exerciseValue}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.exercisePremium')}</span>
                  <span className="font-medium text-[color:var(--sf-text)]">{exercisePremium.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.marketPrice')}</span>
                  <span className="font-medium text-[color:var(--sf-text)]">{marketPrice}</span>
                </div>
              </div>

              <div className="relative rounded-2xl bg-[color:var(--sf-input-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                {/* Token display - floating top-right */}
                <div className="absolute right-4 top-4 z-10">
                  <div className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                    <TokenIcon
                      symbol="BTC"
                      id="btc"
                      size="sm"
                    />
                    <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                      ftrBTC
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 pr-32">
                  <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('contractModal.amountToBuy')}</span>
                  <NumberField
                    value={amount}
                    onChange={setAmount}
                    placeholder="0.00"
                    align="left"
                  />
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/50">
                    ${amount && parseFloat(amount) > 0 && btcPrice ? (parseFloat(amount) * btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-[color:var(--sf-primary)]/20 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.estimatedCost')}</span>
                  <span className="font-medium text-[color:var(--sf-text)]">
                    {estimatedCost} BTC
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!showBuyComingSoon) {
                      setShowBuyComingSoon(true);
                      setTimeout(() => setShowBuyComingSoon(false), 1000);
                    }
                  }}
                  className="px-4 sm:px-6 py-3 rounded-xl bg-[color:var(--sf-primary)] text-white font-bold text-sm sm:text-base tracking-[0.08em] uppercase shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_16px_rgba(0,0,0,0.25)] hover:scale-[1.02] active:scale-[0.98] opacity-50 grayscale cursor-not-allowed"
                >
                  {showBuyComingSoon ? (
                    <span className="animate-pulse">{t('badge.comingSoon')}</span>
                  ) : (
                    t('contractModal.buyFtrBtc')
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!showSellComingSoon) {
                      setShowSellComingSoon(true);
                      setTimeout(() => setShowSellComingSoon(false), 1000);
                    }
                  }}
                  className="px-4 sm:px-6 py-3 rounded-xl font-bold text-sm sm:text-base tracking-[0.08em] uppercase transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none bg-[color:var(--sf-input-bg)] text-[color:var(--sf-text)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:scale-[1.02] active:scale-[0.98] opacity-50 grayscale cursor-not-allowed"
                >
                  {showSellComingSoon ? (
                    <span className="animate-pulse">{t('badge.comingSoon')}</span>
                  ) : (
                    t('contractModal.sellFtrBtc')
                  )}
                </button>
              </div>
            </div>

            {/* Advanced Info */}
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.15)] self-end">
              {/* Dropdown toggle - only visible on small screens */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="sm:hidden w-full flex items-center justify-between text-sm font-semibold text-[color:var(--sf-text)] mb-4"
              >
                <span>{t('contractModal.advancedInfo')}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${showAdvanced ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* Title - only visible on sm+ screens */}
              <div className="hidden sm:block text-sm font-semibold text-[color:var(--sf-text)] mb-4">
                {t('contractModal.advancedInfo')}
              </div>

              {/* Content - dropdown on small screens, always visible on sm+ */}
              <div className={`space-y-3 text-xs text-[color:var(--sf-text)]/80 ${showAdvanced ? 'block' : 'hidden'} sm:block`}>
                <div>
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.totalSupply')}</span>
                  <div className="font-medium text-[color:var(--sf-text)]">
                    {data.totalSupply.toFixed(1)} BTC
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.remaining')}</span>
                  <div className="font-medium text-[color:var(--sf-text)]">
                    {data.remaining.toFixed(1)} BTC
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.exercised')}</span>
                  <div className="font-medium text-[color:var(--sf-text)]">
                    {data.exercised.toFixed(1)} BTC
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.vaultFreeCapital')}</span>
                  <div className="font-medium text-[color:var(--sf-text)]">
                    {data.vaultFreeCapital} BTC
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.liquidityDepth')}</span>
                  <div className="font-medium text-[color:var(--sf-text)]">
                    {data.liquidityDepth} BTC
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--sf-text)]/70">{t('contractModal.created')}</span>
                  <div className="font-medium text-[color:var(--sf-text)]">{t('futures.blocksAgo', { count: parseInt(data.created) || data.created })}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

