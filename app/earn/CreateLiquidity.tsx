'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import BigNumber from 'bignumber.js';
import NumberField from '@/app/components/NumberField';
import TokenIcon from '@/app/components/TokenIcon';
import TokenSelectorModal from '@/app/components/TokenSelectorModal';
import type { TokenOption } from '@/app/components/TokenSelectorModal';
import type { TokenMeta } from '@/app/swap/types';
import { useWallet } from '@/context/WalletContext';
import { useModalStore } from '@/stores/modals';
import { useSellableCurrencies } from '@/hooks/useSellableCurrencies';
import { useBtcBalance } from '@/hooks/useBtcBalance';
import { useAlkanesTokenPairs } from '@/hooks/useAlkanesTokenPairs';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import { useCreatePoolMutation } from '@/hooks/useCreatePoolMutation';
import { useCreatePositionMutation } from '@/hooks/useCreatePositionMutation';
import { useFeeRate } from '@/hooks/useFeeRate';
import { useGlobalStore } from '@/stores/global';
import { getConfig } from '@/utils/getConfig';
import { alkaneToAlks, alksToAlkanes } from '@/utils/currencyConverters';
import { formatAlkanes } from '@/utils/formatters';
import { ChevronDown, Plus } from 'lucide-react';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';

export default function CreateLiquidity() {
  const router = useRouter();
  const { address, network, isConnected, onConnectModalOpenChange } = useWallet();
  const { feeRate } = useFeeRate();
  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const { isTokenSelectorOpen, tokenSelectorMode, closeTokenSelector, openTokenSelector } = useModalStore();

  const [token0, setToken0] = useState<TokenMeta | undefined>();
  const [token1, setToken1] = useState<TokenMeta | undefined>();
  const [amount0, setAmount0] = useState<string>('');
  const [amount1, setAmount1] = useState<string>('');
  const [error, setError] = useState<string>('');

  const { FRBTC_ALKANE_ID } = getConfig(network);

  // Get user balances
  const { data: userCurrencies = [] } = useSellableCurrencies(address);
  const { data: btcBalanceSats } = useBtcBalance();

  const idToUserCurrency = useMemo(() => {
    const map = new Map<string, any>();
    userCurrencies.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [userCurrencies]);

  // Build token options for token0
  const token0Options: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [{ id: 'btc', symbol: 'BTC', name: 'Bitcoin' }];
    userCurrencies.forEach((c: any) => {
      opts.push({ id: c.id, symbol: c.symbol || c.name || c.id, name: c.name || c.symbol || c.id });
    });
    const seen = new Set<string>();
    return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
  }, [userCurrencies]);

  // Build token options for token1 based on pools with token0
  const normalizedToken0Id = useMemo(
    () => (token0?.id === 'btc' ? FRBTC_ALKANE_ID : token0?.id) || FRBTC_ALKANE_ID,
    [token0?.id, FRBTC_ALKANE_ID],
  );
  const { data: token0Pairs } = useAlkanesTokenPairs(normalizedToken0Id);
  const poolTokenIds = useMemo(() => {
    const ids = new Set<string>();
    token0Pairs?.forEach((p) => {
      ids.add(p.token0.id === normalizedToken0Id ? p.token1.id : p.token0.id);
    });
    return Array.from(ids);
  }, [token0Pairs, normalizedToken0Id]);
  const { data: tokenDisplayMap } = useTokenDisplayMap(poolTokenIds);

  const token1Options: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    // Include tokens that pair with selected token0
    token0Pairs?.forEach((p) => {
      const other = p.token0.id === normalizedToken0Id ? p.token1.id : p.token0.id;
      const userMeta = idToUserCurrency.get(other);
      const fetched = tokenDisplayMap?.[other];
      const symbol = userMeta?.symbol || fetched?.symbol || fetched?.name || other;
      const name = userMeta?.name || fetched?.name || symbol;
      opts.push({ id: other, symbol, name });
    });
    // Unique by id
    const seen = new Set<string>();
    return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
  }, [token0Pairs, idToUserCurrency, normalizedToken0Id, tokenDisplayMap]);

  // Check if pool exists
  const token0Id = token0?.id === 'btc' ? FRBTC_ALKANE_ID : token0?.id;
  const token1Id = token1?.id === 'btc' ? FRBTC_ALKANE_ID : token1?.id;
  const existingPool = token0Pairs?.find(
    (pool) =>
      (pool.token0.id === token0Id && pool.token1.id === token1Id) ||
      (pool.token0.id === token1Id && pool.token1.id === token0Id),
  );

  // Mutations
  const { mutate: createPool, isPending: isPendingCreatePool, isSuccess: isSuccessCreatePool } = useCreatePoolMutation();
  const { mutate: createPosition, isPending: isPendingPosition, isSuccess: isSuccessPosition } = useCreatePositionMutation();

  // Format balance display
  const formatBalance = (id?: string): string => {
    if (!id) return 'Balance 0';
    if (id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = sats / 1e8;
      return `Balance ${btc.toFixed(6)}`;
    }
    const cur = idToUserCurrency.get(id);
    if (!cur?.balance) return 'Balance 0';
    const amt = Number(cur.balance) / 1e8;
    return `Balance ${amt.toFixed(6)}`;
  };

  // Handle amount changes with pool ratio calculation
  const handleAmount0Change = useCallback(
    (value: string) => {
      setAmount0(value);

      // If there's an existing pool, calculate the corresponding amount1
      if (existingPool && value && token0 && token1 && existingPool.token0.token0Amount && existingPool.token1.token1Amount) {
        try {
          const token0IsPoolToken0 = token0Id === existingPool.token0.id;
          const token0PoolAmount = new BigNumber(
            token0IsPoolToken0 ? existingPool.token0.token0Amount : existingPool.token1.token1Amount,
          );
          const token1PoolAmount = new BigNumber(
            token0IsPoolToken0 ? existingPool.token1.token1Amount : existingPool.token0.token0Amount,
          );

          let token0InputAmount = new BigNumber(value);
          if (token0.id === 'btc') {
            token0InputAmount = token0InputAmount
              .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
              .dividedBy(1000);
          }

          let token1Amount = token0InputAmount
            .multipliedBy(token1PoolAmount)
            .dividedBy(token0PoolAmount);

          if (token1.id === 'btc') {
            token1Amount = token1Amount.multipliedBy(1000 + FRBTC_WRAP_FEE_PER_1000).dividedBy(1000);
          }

          const token1AmountStr = token1Amount
            .toFixed(8, BigNumber.ROUND_DOWN)
            .replace(/(\.\d*[1-9])0+$/, '$1')
            .replace(/\.0+$/, '');

          setAmount1(token1AmountStr);
        } catch (error) {
          setAmount1('');
        }
      }
    },
    [existingPool, token0, token1, token0Id],
  );

  const handleAmount1Change = useCallback(
    (value: string) => {
      setAmount1(value);

      // If there's an existing pool, calculate the corresponding amount0
      if (existingPool && value && token0 && token1 && existingPool.token0.token0Amount && existingPool.token1.token1Amount) {
        try {
          const token0IsPoolToken0 = token0Id === existingPool.token0.id;
          const token0PoolAmount = new BigNumber(
            token0IsPoolToken0 ? existingPool.token0.token0Amount : existingPool.token1.token1Amount,
          );
          const token1PoolAmount = new BigNumber(
            token0IsPoolToken0 ? existingPool.token1.token1Amount : existingPool.token0.token0Amount,
          );

          let token1InputAmount = new BigNumber(value);
          if (token1.id === 'btc') {
            token1InputAmount = token1InputAmount
              .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
              .dividedBy(1000);
          }

          let token0Amount = token1InputAmount
            .multipliedBy(token0PoolAmount)
            .dividedBy(token1PoolAmount);

          if (token0.id === 'btc') {
            token0Amount = token0Amount.multipliedBy(1000 + FRBTC_WRAP_FEE_PER_1000).dividedBy(1000);
          }

          const token0AmountStr = token0Amount
            .toFixed(8, BigNumber.ROUND_DOWN)
            .replace(/(\.\d*[1-9])0+$/, '$1')
            .replace(/\.0+$/, '');

          setAmount0(token0AmountStr);
        } catch (error) {
          setAmount0('');
        }
      }
    },
    [existingPool, token0, token1, token0Id],
  );

  // Prepare token options for modal
  const token0TokenOptions = useMemo<TokenOption[]>(() => {
    return token0Options.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        iconUrl: token.id === 'btc' ? undefined : currency?.iconUrl,
        balance: token.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
        price: currency?.priceInfo?.price,
      };
    });
  }, [token0Options, idToUserCurrency, btcBalanceSats]);

  const token1TokenOptions = useMemo<TokenOption[]>(() => {
    return token1Options.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        iconUrl: currency?.iconUrl,
        balance: currency?.balance,
        price: currency?.priceInfo?.price,
      };
    });
  }, [token1Options, idToUserCurrency]);

  const handleTokenSelect = (tokenId: string) => {
    if (tokenSelectorMode === 'lp0') {
      const token = token0Options.find((t) => t.id === tokenId);
      if (token) {
        setToken0(token);
        setToken1(undefined);
        setAmount0('');
        setAmount1('');
      }
    } else if (tokenSelectorMode === 'lp1') {
      const token = token1Options.find((t) => t.id === tokenId);
      if (token) setToken1(token);
    }
  };

  const handleSubmit = () => {
    setError('');

    if (!token0 || !token1 || !amount0 || !amount1) {
      setError('Please select tokens and enter amounts');
      return;
    }

    const rawAmount0 = alkaneToAlks(amount0);
    const rawAmount1 = alkaneToAlks(amount1);

    const payload = {
      currencyA: token0.id,
      currencyB: token1.id,
      amountA: rawAmount0,
      amountB: rawAmount1,
      feeRate,
    };

    if (existingPool?.poolId) {
      createPosition(
        {
          ...payload,
          poolId: existingPool.poolId,
          maxSlippage,
          deadlineBlocks,
        },
        {
          onSuccess: (data) => {
            if (data.success && data.transactionId) {
              router.push(`/transaction/${data.transactionId}`);
            } else {
              setError('Failed to create position');
            }
          },
          onError: (error: Error) => {
            setError(error.message || 'Failed to create position');
          },
        },
      );
    } else {
      createPool(payload, {
        onSuccess: (data) => {
          if (data.success && data.transactionId) {
            router.push(`/transaction/${data.transactionId}`);
          } else {
            setError('Failed to create pool');
          }
        },
        onError: (error: Error) => {
          setError(error.message || 'Failed to create pool');
        },
      });
    }
  };

  const canSubmit =
    isConnected &&
    token0 &&
    token1 &&
    amount0 &&
    amount1 &&
    parseFloat(amount0) > 0 &&
    parseFloat(amount1) > 0;

  const isPending = isPendingCreatePool || isPendingPosition;
  const isSuccess = isSuccessCreatePool || isSuccessPosition;

  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="rounded-[24px] border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_12px_48px_rgba(40,67,114,0.18)] backdrop-blur-xl">
        <h2 className="mb-6 text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
          {existingPool ? 'Add Liquidity' : 'Create Pool'}
        </h2>

        {/* Token 0 Input */}
        <div className="mb-3 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md">
          <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
            Token 1
          </span>
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <NumberField placeholder="0.00" align="left" value={amount0} onChange={handleAmount0Change} />
              <button
                type="button"
                onClick={() => openTokenSelector('lp0')}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-white/90 px-3 py-2 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-white hover:shadow-md sf-focus-ring"
              >
                {token0 && <TokenIcon symbol={token0.symbol} id={token0.id} iconUrl={token0.iconUrl} size="sm" network={network} />}
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                  {token0?.symbol ?? 'Select'}
                </span>
                <ChevronDown size={16} className="text-[color:var(--sf-text)]/60" />
              </button>
              <div className="text-xs font-medium text-[color:var(--sf-text)]/50">$0.00</div>
              <div className="text-right text-xs font-medium text-[color:var(--sf-text)]/60">
                {formatBalance(token0?.id)}
              </div>
            </div>
          </div>
        </div>

        {/* Plus Icon */}
        <div className="my-2 flex justify-center">
          <div className="rounded-full border-2 border-[color:var(--sf-primary)]/20 bg-white p-2">
            <Plus size={20} className="text-[color:var(--sf-primary)]" />
          </div>
        </div>

        {/* Token 1 Input */}
        <div className="mb-4 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md">
          <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
            Token 2
          </span>
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <NumberField placeholder="0.00" align="left" value={amount1} onChange={handleAmount1Change} />
              <button
                type="button"
                onClick={() => openTokenSelector('lp1')}
                disabled={!token0}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-white/90 px-3 py-2 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-white hover:shadow-md sf-focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {token1 && <TokenIcon symbol={token1.symbol} id={token1.id} iconUrl={token1.iconUrl} size="sm" network={network} />}
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                  {token1?.symbol ?? 'Select'}
                </span>
                <ChevronDown size={16} className="text-[color:var(--sf-text)]/60" />
              </button>
              <div className="text-xs font-medium text-[color:var(--sf-text)]/50">$0.00</div>
              <div className="text-right text-xs font-medium text-[color:var(--sf-text)]/60">
                {formatBalance(token1?.id)}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={isConnected ? handleSubmit : () => onConnectModalOpenChange(true)}
          disabled={isConnected && (!canSubmit || isPending)}
          className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-4 text-base font-bold tracking-wider uppercase text-white shadow-[0_4px_16px_rgba(40,67,114,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(40,67,114,0.4)] hover:scale-[1.02] active:scale-[0.98] sf-focus-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {!isConnected
            ? 'Connect Wallet'
            : isPending
            ? existingPool
              ? 'Adding Liquidity...'
              : 'Creating Pool...'
            : isSuccess
            ? 'Success!'
            : existingPool
            ? 'Add Liquidity'
            : 'Create Pool'}
        </button>
      </div>

      <TokenSelectorModal
        isOpen={isTokenSelectorOpen}
        onClose={closeTokenSelector}
        tokens={tokenSelectorMode === 'lp0' ? token0TokenOptions : token1TokenOptions}
        onSelectToken={handleTokenSelect}
        selectedTokenId={tokenSelectorMode === 'lp0' ? token0?.id : token1?.id}
        title={tokenSelectorMode === 'lp0' ? 'Select first token' : 'Select second token'}
        network={network}
      />
    </div>
  );
}
