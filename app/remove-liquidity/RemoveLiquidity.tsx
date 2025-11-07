'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BigNumber from 'bignumber.js';
import NumberField from '@/app/components/NumberField';
import TokenIcon from '@/app/components/TokenIcon';
import { useWallet } from '@/context/WalletContext';
import { useWithdrawLiquidityMutation } from '@/hooks/useWithdrawLiquidityMutation';
import { useAddressPosition } from '@/hooks/useAddressPositions';
import { usePreviewRemoveLiquidity } from '@/hooks/usePreviewRemoveLiquidity';
import { useFeeRate } from '@/hooks/useFeeRate';
import { useGlobalStore } from '@/stores/global';
import { alkaneToAlks, alksToAlkanes } from '@/utils/currencyConverters';
import { formatAlkanes } from '@/utils/formatters';
import { calculateMinimumFromSlippage } from '@/utils/amm';
import { ArrowDown } from 'lucide-react';

export default function RemoveLiquidity() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poolId = searchParams.get('poolId');

  const { address, network, isConnected, onConnectModalOpenChange } = useWallet();
  const { feeRate } = useFeeRate();
  const { maxSlippage, deadlineBlocks } = useGlobalStore();

  const [amount, setAmount] = useState<string>('');
  const [rawAmount, setRawAmount] = useState<string>('0');
  const [error, setError] = useState<string>('');

  // Get position details
  const position = useAddressPosition(address, poolId ?? '');

  // Update raw amount when display amount changes
  useEffect(() => {
    if (amount) {
      setRawAmount(alkaneToAlks(amount));
    } else {
      setRawAmount('0');
    }
  }, [amount]);

  // Preview the expected token amounts
  const poolIdSplit = poolId?.split(':');
  const { tokenA, tokenB, isLoading: isPreviewLoading } = usePreviewRemoveLiquidity({
    poolId: poolIdSplit && poolIdSplit.length === 2 ? { block: poolIdSplit[0], tx: poolIdSplit[1] } : null,
    amount: rawAmount,
    enabled: !!poolId && !!rawAmount && rawAmount !== '0',
  });

  // Validate amount
  const amountValidation = useMemo(() => {
    if (!amount) {
      return { isValid: true, errorMessage: '' };
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return { isValid: false, errorMessage: 'Invalid amount' };
    }

    if (numAmount <= 0) {
      return { isValid: false, errorMessage: 'Amount must be greater than 0' };
    }

    // Balance validation
    if (position?.balance && amount) {
      const amountInAlks = alkaneToAlks(amount);
      const isValid = new BigNumber(position.balance).gte(amountInAlks);

      if (!isValid) {
        return { isValid: false, errorMessage: 'Insufficient LP token balance' };
      }
    }

    return { isValid: true, errorMessage: '' };
  }, [amount, position?.balance]);

  // Mutation
  const { mutate: withdrawLiquidity, isPending, isSuccess } = useWithdrawLiquidityMutation();

  const handleWithdraw = () => {
    setError('');

    if (!amount || !poolId || !poolIdSplit || poolIdSplit.length !== 2) {
      setError('Invalid pool or amount');
      return;
    }

    const [block, tx] = poolIdSplit;

    withdrawLiquidity(
      {
        poolId: { block, tx },
        amount: rawAmount,
        feeRate,
        maxSlippage,
        deadlineBlocks,
      },
      {
        onSuccess: (data) => {
          if (data.success && data.transactionId) {
            router.push(`/transaction/${data.transactionId}`);
          } else {
            setError('Failed to remove liquidity');
          }
        },
        onError: (error: Error) => {
          setError(error.message || 'Failed to remove liquidity');
        },
      },
    );
  };

  const handleMax = () => {
    if (position?.balance) {
      const maxAmount = alksToAlkanes(position.balance);
      setAmount(maxAmount);
    }
  };

  const canSubmit =
    isConnected &&
    amount &&
    parseFloat(amount) > 0 &&
    amountValidation.isValid &&
    !isPending;

  // Calculate minimum received amounts
  const minimumReceivedA = useMemo(() => {
    if (!tokenA.amount || tokenA.amount === '0') return '0';
    return alksToAlkanes(
      calculateMinimumFromSlippage({
        amount: alkaneToAlks(tokenA.amount),
        maxSlippage,
      }),
    );
  }, [tokenA.amount, maxSlippage]);

  const minimumReceivedB = useMemo(() => {
    if (!tokenB.amount || tokenB.amount === '0') return '0';
    return alksToAlkanes(
      calculateMinimumFromSlippage({
        amount: alkaneToAlks(tokenB.amount),
        maxSlippage,
      }),
    );
  }, [tokenB.amount, maxSlippage]);

  if (!poolId) {
    return (
      <div className="mx-auto w-full max-w-[540px]">
        <div className="rounded-[24px] border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-center shadow-[0_12px_48px_rgba(40,67,114,0.18)] backdrop-blur-xl">
          <p className="text-[color:var(--sf-text)]">No pool selected. Please select a position to remove liquidity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="rounded-[24px] border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_12px_48px_rgba(40,67,114,0.18)] backdrop-blur-xl">
        <h2 className="mb-6 text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
          Remove Liquidity
        </h2>

        {/* LP Token Input */}
        <div className="mb-3 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md">
          <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
            LP Tokens to Remove
          </span>
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3">
            <div className="mb-3">
              <NumberField
                placeholder="0.00"
                align="left"
                value={amount}
                onChange={setAmount}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[color:var(--sf-text)]/50">$0.00</span>
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--sf-text)]/60">
                  Balance: {position?.balance ? formatAlkanes(position.balance) : '0'}
                </span>
                <button
                  type="button"
                  onClick={handleMax}
                  className="font-semibold text-[color:var(--sf-primary)] hover:underline sf-focus-ring rounded px-2 py-0.5"
                >
                  MAX
                </button>
              </div>
            </div>
            {amountValidation.errorMessage && (
              <p className="mt-2 text-xs text-red-500">{amountValidation.errorMessage}</p>
            )}
          </div>
          {position && (
            <div className="mt-3 text-xs text-[color:var(--sf-text)]/60">
              Pool: {position.currencyA.name} / {position.currencyB.name}
            </div>
          )}
        </div>

        {/* Arrow Down */}
        <div className="my-2 flex justify-center">
          <div className="rounded-full border-2 border-[color:var(--sf-primary)]/20 bg-white p-2">
            <ArrowDown size={20} className="text-[color:var(--sf-primary)]" />
          </div>
        </div>

        {/* Output Tokens Preview */}
        <div className="mb-4 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md">
          <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
            You Will Receive
          </span>

          {/* Token A */}
          <div className="mb-3 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-[color:var(--sf-text)]">
                {isPreviewLoading ? '...' : tokenA.amount || '0'}
              </span>
              <div className="flex items-center gap-2">
                {tokenA.info && (
                  <>
                    <TokenIcon symbol={tokenA.info.symbol || tokenA.info.name} id={tokenA.info.id} size="sm" network={network} />
                    <span className="font-bold text-sm text-[color:var(--sf-text)]">
                      {tokenA.info.name}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Token B */}
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-[color:var(--sf-text)]">
                {isPreviewLoading ? '...' : tokenB.amount || '0'}
              </span>
              <div className="flex items-center gap-2">
                {tokenB.info && (
                  <>
                    <TokenIcon symbol={tokenB.info.symbol || tokenB.info.name} id={tokenB.info.id} size="sm" network={network} />
                    <span className="font-bold text-sm text-[color:var(--sf-text)]">
                      {tokenB.info.name}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Minimum Received Info */}
        {amount && parseFloat(amount) > 0 && (
          <div className="mb-4 rounded-xl border border-[color:var(--sf-outline)] bg-white/40 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">
              Minimum Received (with {maxSlippage}% slippage)
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[color:var(--sf-text)]">
                <span>{tokenA.info?.name}:</span>
                <span className="font-semibold">{minimumReceivedA}</span>
              </div>
              <div className="flex justify-between text-[color:var(--sf-text)]">
                <span>{tokenB.info?.name}:</span>
                <span className="font-semibold">{minimumReceivedB}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={isConnected ? handleWithdraw : () => onConnectModalOpenChange(true)}
          disabled={isConnected && !canSubmit}
          className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-4 text-base font-bold tracking-wider uppercase text-white shadow-[0_4px_16px_rgba(40,67,114,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(40,67,114,0.4)] hover:scale-[1.02] active:scale-[0.98] sf-focus-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {!isConnected
            ? 'Connect Wallet'
            : isPending
            ? 'Removing Liquidity...'
            : isSuccess
            ? 'Success!'
            : 'Remove Liquidity'}
        </button>
      </div>
    </div>
  );
}
