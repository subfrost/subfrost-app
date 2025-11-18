'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApiProvider } from '@/hooks/useApiProvider';
import { useAlkanesTokenPairs } from '@/hooks/useAlkanesTokenPairs';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

type AmmPageResponse<T> = {
  items: T[];
  nextPage?: number;
  total?: number;
};

export type AmmTransactionType = 'swap' | 'mint' | 'burn' | 'creation' | 'wrap' | 'unwrap';

export function useInfiniteAmmTxHistory({
  address,
  count = 50,
  enabled = true,
  transactionType,
}: {
  address?: string | null;
  count?: number;
  enabled?: boolean;
  transactionType?: AmmTransactionType;
}) {
  const api = useApiProvider();
  const { network } = useWallet();
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = getConfig(network);

  const query = useInfiniteQuery<
    AmmPageResponse<any>,
    Error,
    { pages: AmmPageResponse<any>[]; pageParams: number[] },
    (string | number | null)[],
    number
  >({
    queryKey: ['ammTxHistory', address ?? 'all', count, transactionType ?? 'all'],
    initialPageParam: 0,
    enabled,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam * count;
      const params: any = { count, offset, includeTotal: false, transactionType };
      const data = address
        ? await api.getAllAddressAmmTxHistory({ address, ...params })
        : await api.getAllAmmTxHistory(params);

      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      return {
        items,
        nextPage: items.length === count ? pageParam + 1 : undefined,
        total: (data as any)?.total ?? -1,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage as number | undefined,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Allowlist of visible LP pairs (exact label match)
  const allowedPairs = useMemo(
    () =>
      new Set([
        'DIESEL / frBTC LP',
        'frBTC / DIESEL LP',
        'METHANE / frBTC LP',
        'frBTC / METHANE LP',
        'ALKAMIST / frBTC LP',
        'frBTC / ALKAMIST LP',
        'GOLD DUST / frBTC LP',
        'frBTC / GOLD DUST LP',
        'bUSD / frBTC LP',
        'frBTC / bUSD LP',
        'DIESEL / bUSD LP',
        'bUSD / DIESEL LP',
        'METHANE / bUSD LP',
        'bUSD / METHANE LP',
      ]),
    [],
  );

  // Fetch token pairs for frBTC and bUSD to resolve allowed token ID combinations
  const { data: frbtcPairs } = useAlkanesTokenPairs(FRBTC_ALKANE_ID, 500);
  const { data: busdPairs } = useAlkanesTokenPairs(BUSD_ALKANE_ID, 500);

  const normalizeSymbol = (s?: string) => (s ?? '').replace('SUBFROST BTC', 'frBTC');
  const canonicalize = (s?: string) => {
    const t = normalizeSymbol(s).trim();
    const lower = t.toLowerCase().replace(/\s+/g, ' ');
    if (lower === 'frbtc') return 'frBTC';
    if (lower === 'busd' || lower === 'busd') return 'bUSD';
    if (lower === 'diesel') return 'DIESEL';
    if (lower === 'methane') return 'METHANE';
    if (lower === 'alkamist') return 'ALKAMIST';
    if (lower === 'gold dust' || lower === 'golddust') return 'GOLD DUST';
    return t;
  };

  // Build allowed canonical symbol pairs from the label allowlist
  const allowedCanonicalPairs = useMemo(() => {
    const out = new Set<string>();
    Array.from(allowedPairs).forEach((label) => {
      const cleaned = (label ?? '').replace(/ LP$/, '');
      const [a, b] = cleaned.split(' / ').map((x) => canonicalize(x));
      if (a && b) {
        out.add(`${a}|${b}`);
        out.add(`${b}|${a}`);
      }
    });
    return out;
  }, [allowedPairs]);

  // Build allowed token-id pairs (both directions) using the label allowlist
  const allowedIdPairs = useMemo(() => {
    const out = new Set<string>();
    const maybeAdd = (p?: { token0: { id: string; symbol: string }; token1: { id: string; symbol: string } }) => {
      if (!p) return;
      const sym0 = canonicalize(p.token0.symbol);
      const sym1 = canonicalize(p.token1.symbol);
      if (allowedCanonicalPairs.has(`${sym0}|${sym1}`)) {
        const id0 = p.token0.id;
        const id1 = p.token1.id;
        out.add(`${id0}|${id1}`);
        out.add(`${id1}|${id0}`);
      }
    };
    frbtcPairs?.forEach(maybeAdd);
    busdPairs?.forEach(maybeAdd);
    return out;
  }, [frbtcPairs, busdPairs, allowedCanonicalPairs]);

  // Filter pages to only include allowed pairs; exclude wrap/unwrap always
  const filteredData = useMemo(() => {
    if (!query.data) return query.data;
    const pages = query.data.pages.map((page) => {
      const items = Array.isArray(page.items) ? page.items : [];
      const filteredItems = items.filter((row: any) => {
        if (!row || !row.type) return false;
        // Do not apply pair filter to wrap/unwrap
        if (row.type === 'wrap' || row.type === 'unwrap') return true;

        if (row.type === 'swap') {
          const a = `${row.soldTokenBlockId}:${row.soldTokenTxId}`;
          const b = `${row.boughtTokenBlockId}:${row.boughtTokenTxId}`;
          return allowedIdPairs.has(`${a}|${b}`);
        }

        // mint / burn / creation
        const r = row as any;
        const a = `${r.token0BlockId}:${r.token0TxId}`;
        const b = `${r.token1BlockId}:${r.token1TxId}`;
        return allowedIdPairs.has(`${a}|${b}`);
      });
      return { ...page, items: filteredItems };
    });
    return { ...query.data, pages };
  }, [query.data, allowedIdPairs]);

  return { ...query, data: filteredData };
}


