'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteAmmTxHistory } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import TokenIcon from '@/app/components/TokenIcon';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';
import { useTranslation } from '@/hooks/useTranslation';
import type { Network } from '@/utils/constants';

type AmmRow =
  | ({ type: 'swap'; soldAmount: string; boughtAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; soldTokenBlockId: string; soldTokenTxId: string; boughtTokenBlockId: string; boughtTokenTxId: string; address?: string; sellerAddress?: string })
  | ({ type: 'mint'; token0Amount: string; token1Amount: string; lpTokenAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; minterAddress?: string })
  | ({ type: 'burn'; token0Amount: string; token1Amount: string; lpTokenAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; burnerAddress?: string })
  | ({ type: 'creation'; token0Amount: string; token1Amount: string; tokenSupply: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; creatorAddress?: string })
  | ({ type: 'wrap'; address?: string; transactionId: string; timestamp: string; amount: string })
  | ({ type: 'unwrap'; address?: string; transactionId: string; timestamp: string; amount: string });

function formatAmount(raw: string, decimals = 8, tokenSymbol?: string) {
  const n = Number(raw ?? '0');
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return '0';

  // Use 4 decimals for BTC/frBTC, 2 for other tokens
  const fractionDigits = (tokenSymbol === 'BTC' || tokenSymbol === 'frBTC') ? 5 : 2;

  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${(Math.pow(10, -fractionDigits)).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
}


export default function MyWalletSwaps() {
  const { t } = useTranslation();
  const { address, network } = useWallet();

  const {
    data,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = useInfiniteAmmTxHistory({
    address,
    count: 50,
    enabled: !!address,
    transactionType: undefined
  });

  const items: AmmRow[] = useMemo(() => {
    return (data?.pages ?? [])
      .flatMap((p) => (p.items as AmmRow[]));
  }, [data?.pages]);

  const tokenIds = useMemo(() => {
    const out = new Set<string>();
    items.forEach((row) => {
      if (row.type === 'swap') {
        out.add(`${row.soldTokenBlockId}:${row.soldTokenTxId}`);
        out.add(`${row.boughtTokenBlockId}:${row.boughtTokenTxId}`);
      } else if (row.type === 'mint' || row.type === 'burn' || row.type === 'creation') {
        const r: any = row;
        if (r.token0BlockId && r.token0TxId) {
          out.add(`${r.token0BlockId}:${r.token0TxId}`);
        }
        if (r.token1BlockId && r.token1TxId) {
          out.add(`${r.token1BlockId}:${r.token1TxId}`);
        }
      }
    });
    return Array.from(out);
  }, [items]);
  const { data: displayMap } = useTokenDisplayMap(tokenIds);

  const loadingRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadingRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first && first.isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const KNOWN_TOKEN_NAMES: Record<string, string> = {
    '32:0': 'frBTC',
    '2:0': 'DIESEL',
    '2:56801': 'bUSD',
    'btc': 'BTC',
    'frbtc': 'frBTC',
  };

  const getName = (id: string | undefined) => {
    if (!id) return '';
    const d = displayMap?.[id];
    return d?.name || d?.symbol || KNOWN_TOKEN_NAMES[id] || '';
  };

  return (
    <div className="flex flex-col">
      {!address ? (
        <div className="px-6 py-4 text-center text-sm text-[color:var(--sf-text)]/60 flex items-center justify-center min-h-[72px]">
          {t('myActivity.connectWallet')}
        </div>
      ) : (
        <>
          {/* Column Headers */}
          <div className="sf-table-header grid grid-cols-[0.6fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 px-3 py-2">
            <span>Type</span>
            <span>From</span>
            <span>To</span>
            <span className="text-right">{t('myActivity.amounts')}</span>
            <span className="text-right">Date</span>
          </div>

          <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(8 * 40px)' }}>
            {items.length === 0 && !isLoading ? (
              <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
                {t('myActivity.noActivity')}
              </div>
            ) : (
              <>
                {items.map((row, idx) => {
                  const time = new Date(row.timestamp);
                  const timeLabel = `${String(time.getMonth() + 1).padStart(2, '0')}/${String(time.getDate()).padStart(2, '0')}/${String(time.getFullYear()).slice(-2)}`;

                  const typeLabel =
                    row.type === 'swap' ? t('myActivity.swap') :
                    row.type === 'mint' ? t('myActivity.supply') :
                    row.type === 'burn' ? t('myActivity.withdraw') :
                    row.type === 'creation' ? t('myActivity.create') :
                    row.type === 'wrap' ? t('myActivity.wrap') : t('myActivity.unwrap');

                  const pairNames = (() => {
                    if (row.type === 'swap') {
                      const leftId = `${row.soldTokenBlockId}:${row.soldTokenTxId}`;
                      const rightId = `${row.boughtTokenBlockId}:${row.boughtTokenTxId}`;
                      return {
                        leftId, rightId,
                        leftName: getName(leftId),
                        rightName: getName(rightId),
                      };
                    } else if (row.type === 'mint' || row.type === 'burn' || row.type === 'creation') {
                      const r: any = row;
                      const hasTokenIds = r.token0BlockId && r.token0TxId && r.token1BlockId && r.token1TxId;
                      if (hasTokenIds) {
                        const leftId = `${r.token0BlockId}:${r.token0TxId}`;
                        const rightId = `${r.token1BlockId}:${r.token1TxId}`;
                        return {
                          leftId, rightId,
                          leftName: getName(leftId),
                          rightName: getName(rightId),
                        };
                      } else {
                        const poolId = `${r.poolBlockId}:${r.poolTxId}`;
                        return {
                          leftId: poolId,
                          rightId: poolId,
                          leftName: 'LP',
                          rightName: `Pool ${poolId}`,
                        };
                      }
                    } else {
                      return {
                        leftId: 'btc',
                        rightId: 'frbtc',
                        leftName: row.type === 'wrap' ? 'BTC' : 'frBTC',
                        rightName: row.type === 'wrap' ? 'frBTC' : 'BTC',
                      };
                    }
                  })();

                  // Build amounts string parts with colors
                  const amountParts = (() => {
                    if (row.type === 'swap') {
                      return {
                        left: `-${formatAmount(row.soldAmount, 8, pairNames.leftName)} ${pairNames.leftName}`,
                        leftColor: '',
                        right: `+${formatAmount(row.boughtAmount, 8, pairNames.rightName)} ${pairNames.rightName}`,
                        rightColor: 'text-green-400',
                      };
                    } else if (row.type === 'mint') {
                      return {
                        left: `-${formatAmount((row as any).token0Amount, 8, pairNames.leftName)} ${pairNames.leftName}`,
                        leftColor: '',
                        right: `-${formatAmount((row as any).token1Amount, 8, pairNames.rightName)} ${pairNames.rightName}`,
                        rightColor: '',
                      };
                    } else if (row.type === 'burn' || row.type === 'creation') {
                      return {
                        left: `+${formatAmount((row as any).token0Amount, 8, pairNames.leftName)} ${pairNames.leftName}`,
                        leftColor: 'text-green-400',
                        right: `+${formatAmount((row as any).token1Amount, 8, pairNames.rightName)} ${pairNames.rightName}`,
                        rightColor: 'text-green-400',
                      };
                    } else if (row.type === 'wrap') {
                      return {
                        left: `-${formatAmount((row as any).amount, 8, 'BTC')} BTC`,
                        leftColor: '',
                        right: `+${formatAmount((row as any).amount, 8, 'frBTC')} frBTC`,
                        rightColor: 'text-green-400',
                      };
                    } else {
                      return {
                        left: `-${formatAmount((row as any).amount, 8, 'frBTC')} frBTC`,
                        leftColor: '',
                        right: `+${formatAmount((row as any).amount, 8, 'BTC')} BTC`,
                        rightColor: 'text-green-400',
                      };
                    }
                  })();

                  return (
                    <Link
                      key={(row as any).transactionId + '-' + idx}
                      href={`https://espo.sh/tx/${(row as any).transactionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sf-row block"
                    >
                      <div className="grid grid-cols-[0.6fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 text-[11px] leading-[20px] px-3 py-1.5 items-center">
                        {/* TXN */}
                        <span className="text-[color:var(--sf-text)]/40">{typeLabel}</span>

                        {/* From */}
                        <div className="flex items-center gap-1 min-w-0">
                          <TokenIcon symbol={pairNames.leftName} id={pairNames.leftId} size="sm" network={network} />
                          <span className="text-[color:var(--sf-text)]/60 truncate">{pairNames.leftName}</span>
                        </div>

                        {/* To */}
                        <div className="flex items-center gap-1 min-w-0">
                          <TokenIcon symbol={pairNames.rightName} id={pairNames.rightId} size="sm" network={network} />
                          <span className="text-[color:var(--sf-text)]/60 truncate">{pairNames.rightName}</span>
                        </div>

                        {/* Amounts (single line) */}
                        <span className="text-right tabular-nums truncate">
                          <span className={amountParts.leftColor || 'text-[color:var(--sf-text)]/60'}>{amountParts.left}</span>
                          <span className="text-[color:var(--sf-text)]/25">{', '}</span>
                          <span className={amountParts.rightColor || 'text-[color:var(--sf-text)]/60'}>{amountParts.right}</span>
                        </span>

                        {/* Time */}
                        <span className="text-[color:var(--sf-text)]/25 tabular-nums text-right">
                          {timeLabel}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </>
            )}
            {(isLoading || isFetchingNextPage) && (
              <div className="px-4 py-3 text-center text-[color:var(--sf-text)]/60">{t('activity.loading')}</div>
            )}
            <div ref={loadingRef} className="h-6" />
          </div>
        </>
      )}
    </div>
  );
}
