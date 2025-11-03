'use client';

import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, Settings } from 'lucide-react';

import { TokenSelect, type TokenOption } from './TokenSelect';
import { useWallet } from '@/app/contexts/WalletContext';
import { useSellableCurrencies } from '@/app/hooks/useSellableCurrencies';
import { useAlkanesTokenPairs } from '@/app/hooks/useAlkanesTokenPairs';
import { useSwapController } from '@/app/components/swap/useSwapController';
import { useBtcBalance } from '@/app/hooks/useBtcBalance';
import { getConfig } from '@/app/utils/getConfig';
import { useSwapMutation } from '@/app/hooks/useSwapMutation';

export function SwapHeader({
  slippage,
  onOpenSettings,
  onPairChange,
  presetPair,
}: {
  slippage: number; // percentage (e.g., 5)
  onOpenSettings: () => void;
  onPairChange?: (sell: string, buy: string) => void;
  presetPair?: { sell: string; buy: string } | null;
}) {
  const { isConnected, address, network } = useWallet();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  // BTC balance in sats (spendable)
  const { data: btcBalanceSats } = useBtcBalance();

  // Tokens owned by wallet (sellable), plus synthetic BTC
  const { data: sellable = [] } = useSellableCurrencies(isConnected ? address : undefined);
  const sellOptions: TokenOption[] = useMemo(() => {
    const owned = sellable.map((c: any) => ({ id: c.id, name: c.name, symbol: c.symbol }));
    const btc = [{ id: 'btc', name: 'Bitcoin', symbol: 'BTC' }];
    return [...btc, ...owned];
  }, [sellable]);

  // Controller state
  const noOpValidate = () => ({ errorMessage: '' });
  const [from, to] = [null, null];
  const [sellAmountQS, buyAmountQS] = [null, null];
  const controller = useSwapController(
    'btc',
    noOpValidate,
    btcBalanceSats ?? 0,
    from,
    to,
    sellAmountQS,
    buyAmountQS,
    () => {},
    () => {},
    () => {},
    () => {},
    String((slippage || 0) / 100),
  );

  // Buy options derive from pairs against current sell token (or FRBTC when selling BTC)
  const sellIdForPairs = controller.state.sellCurrency === 'btc' ? FRBTC_ALKANE_ID : (controller.state.sellCurrency ?? '');
  const { data: pairs } = useAlkanesTokenPairs(sellIdForPairs, 100, 0, undefined, undefined);
  const buyOptions: TokenOption[] = useMemo(() => {
    const opts: TokenOption[] = [];
    if (!pairs) return opts;
    for (const p of pairs as any[]) {
      const is0 = p.token0.id === sellIdForPairs;
      const other = is0 ? p.token1 : p.token0;
      opts.push({ id: other.id, name: other.name, symbol: other.symbol });
    }
    // ensure frBTC is present when selling BTC
    if (controller.state.sellCurrency === 'btc') {
      if (!opts.find((o) => o.id === FRBTC_ALKANE_ID)) {
        opts.unshift({ id: FRBTC_ALKANE_ID, name: 'frBTC', symbol: 'frBTC' });
      }
    }
    // unique by id
    const seen = new Set<string>();
    return opts.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  }, [pairs, sellIdForPairs, controller.state.sellCurrency, FRBTC_ALKANE_ID]);

  // Default to BTC -> frBTC on mount if empty
  useEffect(() => {
    if (!controller.state.sellCurrency) controller.setSellCurrency('btc');
  }, [controller.state.sellCurrency]);
  useEffect(() => {
    if (controller.state.sellCurrency && !controller.state.buyCurrency) {
      // default buy to frBTC for BTC sells; otherwise pick first option
      if (controller.state.sellCurrency === 'btc') {
        controller.setBuyCurrency(FRBTC_ALKANE_ID);
      } else if (buyOptions.length) {
        controller.setBuyCurrency(buyOptions[0].id);
      }
    }
  }, [controller.state.sellCurrency, controller.state.buyCurrency, buyOptions]);

  // Apply externally selected pair
  useEffect(() => {
    if (presetPair?.sell) controller.setSellCurrency(presetPair.sell);
    if (presetPair?.buy) controller.setBuyCurrency(presetPair.buy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPair?.sell, presetPair?.buy]);

  // Notify parent when pair changes
  useEffect(() => {
    if (onPairChange && controller.state.sellCurrency && controller.state.buyCurrency) {
      onPairChange(controller.state.sellCurrency, controller.state.buyCurrency);
    }
  }, [controller.state.sellCurrency, controller.state.buyCurrency]);

  const { mutate: swap, isPending } = useSwapMutation();

  const st = controller.state;
  const quote = controller.quote;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">From</span></label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={st.sellAmount}
            onChange={(e) => controller.setSellAmount(e.target.value)}
            placeholder="0.00"
            className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
          />
          <TokenSelect
            value={st.sellCurrency ?? 'btc'}
            options={sellOptions}
            onChange={(id) => controller.setSellCurrency(id)}
            className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-44 token-button-text"
          />
        </div>
      </div>

      <div className="flex items-center justify-center">
        <Button variant="secondary" size="icon" onClick={() => controller.invertCurrencies()} aria-label="Swap direction">
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">To</span></label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={st.buyAmount || (quote?.displayBuyAmount ?? '')}
            onChange={(e) => controller.setBuyAmount(e.target.value)}
            placeholder="0.00"
            className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
          />
          <TokenSelect
            value={st.buyCurrency ?? ''}
            options={buyOptions}
            onChange={(id) => controller.setBuyCurrency(id)}
            className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-44 token-button-text"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Slippage Tolerance: {slippage.toFixed(1)}%</span></p>
          <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Open slippage settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        {st.sellCurrency && st.buyCurrency ? (
          <div className="flex items-center mb-2">
            <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Expected: </span>{quote?.displayBuyAmount ?? '0.00'}</p>
          </div>
        ) : null}
        <Button
          onClick={() => {
            if (!st.sellCurrency || !st.buyCurrency || !quote) return;
            swap({
              sellCurrency: st.sellCurrency,
              buyCurrency: st.buyCurrency,
              sellAmount: quote.sellAmount,
              buyAmount: quote.buyAmount,
              maxSlippage: String((slippage || 0) / 100),
              direction: quote.direction,
              tokenPath: (quote as any)?.route || [st.sellCurrency, st.buyCurrency],
            });
          }}
          disabled={!st.sellCurrency || !st.buyCurrency || !(st.sellAmount || st.buyAmount) || isPending}
          className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size relative z-10"
        >
          {isPending ? 'Swapping…' : 'Swap'}
        </Button>
      </div>
    </div>
  );
}


