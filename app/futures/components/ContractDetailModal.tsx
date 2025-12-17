'use client';

import { useEffect, useRef, useState } from 'react';
import NumberField from '@/app/components/NumberField';
import { useTheme } from '@/context/ThemeContext';

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
    underlyingYield: string;
    vaultFreeCapital: number;
    liquidityDepth: number;
    dxBTCStatus: string;
  };
  onClose: () => void;
};

export default function ContractDetailModal({
  contractId,
  blocksLeft,
  data,
  onClose,
}: ContractDetailModalProps) {
  const [amount, setAmount] = useState('1.00');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  
  // Calculate exercise values
  const exercisePremium = calculateExercisePremium(blocksLeft);
  const exercisePrice = calculateExercisePrice(blocksLeft);
  
  // Mock calculations
  const timeLeft = `${blocksLeft} blocks`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto mx-4 rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">{contractId}</h2>
            <p className="text-sm text-[color:var(--sf-text)]/70 mt-1">
              Expiry in {timeLeft}, exercise value: {exerciseValue}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[color:var(--sf-text)]"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Chart Section */}
          <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
            <h3 className="text-lg font-semibold text-[color:var(--sf-text)] mb-4">
              Unlock Value Over Time
            </h3>
            {/* Simple chart visualization */}
            <div className="h-48 flex items-end justify-between gap-2">
              {chartData.map((point, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t bg-[color:var(--sf-primary)]/60 transition-all hover:bg-[color:var(--sf-primary)]"
                    style={{ height: `${point.value * 100}%` }}
                  />
                  <div className="text-xs text-[color:var(--sf-text)]/70">{point.time}d</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-[color:var(--sf-text)]/70 text-center">
              Time → 1.00 BTC
            </div>
          </div>

          {/* Buy / Sell Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">Exercise Price (poly):</span>
                  <span className="font-medium text-[color:var(--sf-text)]">{exerciseValue}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">Exercise Premium:</span>
                  <span className="font-medium text-[color:var(--sf-text)]">{exercisePremium.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">Market Price (secondary):</span>
                  <span className="font-medium text-[color:var(--sf-text)]">{marketPrice}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[color:var(--sf-text)] mb-2">
                  Amount to buy:
                </label>
                <div className="rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4">
                  <NumberField
                    value={amount}
                    onChange={setAmount}
                    placeholder="0.00"
                    align="left"
                  />
                  <div className="text-xs text-[color:var(--sf-text)]/70 mt-1">ftrBTC</div>
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">Estimated cost:</span>
                  <span className="font-medium text-[color:var(--sf-text)]">
                    {estimatedCost} BTC
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  className="flex-1 px-6 py-3 rounded-lg bg-[color:var(--sf-primary)] text-white font-bold tracking-[0.08em] uppercase shadow-[0_2px_8px_rgba(0,0,0,0.2)] hover:opacity-90 transition-opacity"
                >
                  Buy ftrBTC
                </button>
                <button
                  type="button"
                  className={`flex-1 px-6 py-3 rounded-lg font-bold tracking-[0.08em] uppercase transition-colors ${
                    theme === 'dark'
                      ? 'border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10'
                      : 'border-2 border-[color:var(--sf-primary)] bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/5'
                  }`}
                >
                  Sell ftrBTC
                </button>
              </div>
            </div>

            {/* Advanced Info */}
            <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-sm font-semibold text-[color:var(--sf-text)] mb-4"
              >
                <span>Advanced Info</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showAdvanced && (
                <div className="space-y-3 text-xs text-[color:var(--sf-text)]/80">
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Expiry Block:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">
                      {data.expiryBlock.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Created:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{data.created}</div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Exercise Premium:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{exercisePremium.toFixed(2)}%</div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Exercise Price (per 1 BTC):</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{exerciseValue}</div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Vault free capital:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">
                      {data.vaultFreeCapital} BTC
                    </div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Liquidity depth:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">
                      {data.liquidityDepth} BTC
                    </div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">dxBTC status:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{data.dxBTCStatus}</div>
                  </div>
                  <div>
                    <span className="text-[color:var(--sf-text)]/70">Underlying yield:</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{data.underlyingYield}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

