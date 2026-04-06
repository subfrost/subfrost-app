'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import LockTierSelector from '../widgets/LockTierSelector';
import RewardsProjector from '../widgets/RewardsProjector';
import { useFireStakingStats } from '@/hooks/fire/useFireStakingStats';
import { useFireUserPositions } from '@/hooks/fire/useFireUserPositions';
import { useAlkaneBalance } from '@/hooks/useAlkaneBalance';
import { useFireStakeMutation } from '@/hooks/fire/useFireStakeMutation';
import { useWallet } from '@/context/WalletContext';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import { useFeeRate } from '@/hooks/useFeeRate';
import type { FeeSelection } from '@/hooks/useFeeRate';
import { useGlobalStore } from '@/stores/global';
import type { SlippageSelection } from '@/stores/global';
import BigNumber from 'bignumber.js';
const SLIPPAGE_PRESETS: Record<Exclude<SlippageSelection, 'custom'>, string> = {
  low: '1',
  medium: '5',
  high: '10',
};

interface FireStakingPanelProps {
  vaultDetailsSlot?: React.ReactNode;
}

export default function FireStakingPanel({ vaultDetailsSlot }: FireStakingPanelProps) {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: stakingStats } = useFireStakingStats();
  const { data: userPositions } = useFireUserPositions();
  const stakeMutation = useFireStakeMutation();

  // LP token balance — devnet LP token is 2:6 (matches mutation hooks pattern)
  const lpTokenId = '2:6';
  const { data: lpBalance } = useAlkaneBalance(lpTokenId);
  const lpBalanceNum = parseFloat(lpBalance || '0');
  const lpBalanceDisplay = lpBalanceNum > 0 ? new BigNumber(lpBalance || '0').toFixed(4) : '0.00';

  const { selection: feeSelection, setSelection: setFeeSelection, custom: customFee, setCustom: setCustomFee, feeRate, presets: feePresets } = useFeeRate({ storageKey: 'subfrost-fire-stake-fee-rate' });
  const { maxSlippage, setMaxSlippage, slippageSelection, setSlippageSelection } = useGlobalStore();

  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [lockTier, setLockTier] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deadlineLocal, setDeadlineLocal] = useState('3');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const emissionRate = Number(stakingStats?.emissionRate || '0') / 1e8;
  const totalWeightedStake = Number(stakingStats?.totalStaked || '0') / 1e8;
  const parsedAmount = parseFloat(amount) || 0;

  const handleStake = () => {
    if (isDemoGated || parsedAmount <= 0) return;
    const lpAmountBaseUnits = new BigNumber(parsedAmount).multipliedBy(1e8).toFixed(0);
    stakeMutation.mutate({
      lpAmount: lpAmountBaseUnits,
      lockTierIndex: lockTier,
      feeRate: Math.round(feeRate),
    });
  };


  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Stake form */}
      <div className="flex flex-col gap-4">
        <div className="sf-card p-4 sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
            {t('fire.stakeLpForEmissions')}
          </div>

          {/* Amount input */}
          <div className="relative sf-input group p-4 cursor-text mb-4" onClick={() => amountRef.current?.focus()}>
            <div className="absolute right-4 top-4 z-10">
              <div className="inline-flex items-center rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">LP</span>
              </div>
            </div>
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('fire.stakeLpTokens')}</span>
            <div className="flex items-center gap-2 mt-1 pr-20">
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
                {t('boost.balance', { amount: lpBalanceDisplay })}
              </div>
              <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${inputFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setAmount((lpBalanceNum * 0.25).toString())}
                  className="sf-percent-btn-pill"
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount((lpBalanceNum * 0.5).toString())}
                  className="sf-percent-btn-pill"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount((lpBalanceNum * 0.75).toString())}
                  className="sf-percent-btn-pill"
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(lpBalance || '0')}
                  className="sf-percent-btn-pill"
                >
                  {t('boost.max')}
                </button>
              </div>
            </div>
          </div>

          {/* Lock tier */}
          <div className="mb-4">
            <LockTierSelector selectedTier={lockTier} onSelect={setLockTier} />
          </div>

          {/* Rewards projector */}
          <div className="mb-4">
            <RewardsProjector
              amount={parsedAmount}
              lockTierIndex={lockTier}
              emissionRatePerBlock={emissionRate}
              totalWeightedStake={totalWeightedStake}
            />
          </div>

          {/* Transaction Details - collapsible */}
          <div className="sf-panel overflow-visible mb-4">
            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="sf-collapsible-trigger"
            >
              <span>{t('vaultDeposit.transactionDetails')}</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-300 ${detailsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div className={`transition-all duration-300 ease-in-out ${detailsOpen ? 'max-h-[1000px] opacity-100 pb-4 overflow-visible' : 'max-h-0 opacity-0 pb-0 overflow-hidden'}`}>
              <div className="flex flex-col gap-2.5 px-4 text-sm">
                {/* Deadline (blocks) */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                    {t('vaultDeposit.deadlineBlocks')}
                  </span>
                  <div className="relative">
                    <input
                      aria-label="Transaction deadline in blocks"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={deadlineLocal}
                      onChange={(e) => setDeadlineLocal(e.target.value)}
                      onFocus={() => setFocusedField('deadline')}
                      onBlur={() => {
                        setFocusedField(null);
                        const val = parseInt(deadlineLocal, 10);
                        if (!deadlineLocal || isNaN(val) || val < 1) {
                          setDeadlineLocal('3');
                        }
                      }}
                      placeholder="3"
                      className="sf-pill-input"
                    />
                  </div>
                </div>

                {/* Slippage Tolerance */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                    {t('vaultDeposit.slippageTolerance')}
                  </span>
                  <div className="flex items-center gap-2">
                    {slippageSelection === 'custom' ? (
                      <div className="relative">
                        <input
                          aria-label="Custom slippage tolerance"
                          type="text"
                          inputMode="numeric"
                          value={maxSlippage}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d{0,2}$/.test(val)) {
                              const num = parseInt(val, 10);
                              if (val === '' || (num >= 0 && num <= 99)) {
                                setMaxSlippage(val);
                              }
                            }
                          }}
                          onFocus={() => setFocusedField('slippage')}
                          onBlur={() => {
                            setFocusedField(null);
                            if (!maxSlippage) setMaxSlippage('5');
                          }}
                          placeholder="5"
                          style={{ outline: 'none', border: 'none' }}
                          className={`h-7 w-14 rounded-lg bg-[color:var(--sf-input-bg)] px-2 pr-5 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[200ms] ${focusedField === 'slippage' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">%</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-[color:var(--sf-text)]">
                        {maxSlippage}%
                      </span>
                    )}
                    <FireSlippageButton
                      selection={slippageSelection}
                      setSelection={setSlippageSelection}
                      setValue={setMaxSlippage}
                    />
                  </div>
                </div>

                {/* Miner Fee Rate */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                    {t('vaultDeposit.minerFeeRate')}
                  </span>
                  <div className="flex items-center gap-2">
                    {feeSelection === 'custom' && setCustomFee ? (
                      <div className="relative">
                        <input
                          aria-label="Custom miner fee rate"
                          type="number"
                          min={1}
                          max={999}
                          step={1}
                          value={customFee}
                          onChange={(e) => setCustomFee(e.target.value)}
                          onFocus={() => setFocusedField('fee')}
                          onBlur={() => {
                            setFocusedField(null);
                            if (!customFee) setCustomFee(String(feePresets.medium));
                          }}
                          placeholder="0"
                          className="sf-pill-input"
                        />
                      </div>
                    ) : (
                      <span className="font-semibold text-[color:var(--sf-text)]">
                        {Math.round(feeRate)}
                      </span>
                    )}
                    <FireMinerFeeButton
                      selection={feeSelection}
                      setSelection={setFeeSelection}
                      presets={feePresets}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stake button */}
          <button
            onClick={handleStake}
            disabled={!isConnected || parsedAmount <= 0 || isDemoGated}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)]"
          >
            {isDemoGated ? t('common.comingSoon') : !isConnected ? t('fire.connectWallet') : t('fire.stakeLp')}
          </button>
        </div>
      </div>

      {vaultDetailsSlot}

      {/* Positions — discovered via POS-{id} receipt tokens */}
      <div className="sf-card overflow-hidden flex flex-col">
        <div className="sf-card-header">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('fire.stakePositions')}</h3>
        </div>

        {!isConnected ? (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
            {t('fire.connectToViewPositions')}
          </div>
        ) : !userPositions?.positions?.length ? (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
            {t('fire.noPositions')}
          </div>
        ) : (
          <>
            <div className="sf-table-header grid grid-cols-4 gap-2 px-6">
              <div>{t('fire.lpStaked')}</div>
              <div>{t('fire.lockTier')}</div>
              <div>{t('fire.multiplier')}</div>
              <div className="text-right">{t('fire.tokenId')}</div>
            </div>

            <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(5 * 85px)' }}>
              {userPositions.positions.map((pos) => (
                <div key={pos.tokenId} className="sf-row grid grid-cols-4 items-center gap-2 px-6 py-4">
                  <div className="text-sm font-bold text-[color:var(--sf-primary)]">
                    {new BigNumber(pos.depositAmount).dividedBy(1e8).toFixed(4)}
                  </div>
                  <div className="text-sm font-bold text-orange-500">
                    {pos.lockDuration === 0 ? 'None' : `${Math.round(pos.lockDuration / 86400)}d`}
                  </div>
                  <div className="text-sm font-bold text-[color:var(--sf-primary)]">
                    {(pos.multiplier / 100).toFixed(2)}x
                  </div>
                  <div className="text-[10px] text-[color:var(--sf-primary)] text-right font-mono">
                    {pos.tokenId}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Slippage Dropdown Button ── */
function FireSlippageButton({ selection, setSelection, setValue }: {
  selection: SlippageSelection;
  setSelection: (s: SlippageSelection) => void;
  setValue: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (s: SlippageSelection) => {
    setSelection(s);
    if (s !== 'custom') setValue(SLIPPAGE_PRESETS[s]);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`sf-dropdown-trigger ${isOpen ? 'sf-dropdown-trigger--open' : ''}`}
      >
        <span>{selection === 'custom' ? t('vaultDeposit.custom') : t(`vaultDeposit.${selection}`)}</span>
        <ChevronDown size={12} className={`transition-all duration-[200ms] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="sf-dropdown absolute right-0 mt-1 z-50 w-32">
          {(['low', 'medium', 'high', 'custom'] as SlippageSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold capitalize transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{t(`vaultDeposit.${option}`)}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {SLIPPAGE_PRESETS[option]}%
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Miner Fee Dropdown Button ── */
function FireMinerFeeButton({ selection, setSelection, presets }: {
  selection: FeeSelection;
  setSelection?: (s: FeeSelection) => void;
  presets: { slow: number; medium: number; fast: number };
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (s: FeeSelection) => {
    if (setSelection) setSelection(s);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`sf-dropdown-trigger ${isOpen ? 'sf-dropdown-trigger--open' : ''}`}
      >
        <span>{selection === 'custom' ? t('vaultDeposit.custom') : t(`vaultDeposit.${selection}`)}</span>
        <ChevronDown size={12} className={`transition-all duration-[200ms] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="sf-dropdown absolute right-0 mt-1 z-50 w-32">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold capitalize transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{t(`vaultDeposit.${option}`)}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {presets[option as keyof typeof presets]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
