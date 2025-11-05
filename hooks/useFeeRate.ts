import { useEffect, useMemo, useState } from 'react';
import { useBaseTxFeeRates } from '@/hooks/useBaseTxFeeRates';

export type FeeSelection = 'slow' | 'medium' | 'fast' | 'custom';

type UseFeeRateOptions = {
  storageKey?: string;
};

export function useFeeRate(options: UseFeeRateOptions = {}) {
  const storageKey = options.storageKey ?? 'subfrost-fee-rate';
  const { data: base } = useBaseTxFeeRates();
  const [selection, setSelection] = useState<FeeSelection>('medium');
  const [custom, setCustom] = useState<string>('');

  // hydrate from localStorage once
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { selection?: FeeSelection; custom?: string };
        if (parsed.selection) setSelection(parsed.selection);
        if (typeof parsed.custom === 'string') setCustom(parsed.custom);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist on change
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(storageKey, JSON.stringify({ selection, custom }));
    } catch {}
  }, [selection, custom, storageKey]);

  const preset = useMemo(() => {
    if (!base) return 8;
    if (selection === 'slow') return base.slow;
    if (selection === 'fast') return base.fast;
    return base.medium;
  }, [base, selection]);

  const parsedCustom = useMemo(() => {
    const num = Number(custom);
    if (!Number.isFinite(num)) return 1;
    return Math.max(1, Math.min(999, Math.floor(num)));
  }, [custom]);

  const feeRate = selection === 'custom' ? parsedCustom : preset;

  return {
    selection,
    setSelection,
    custom,
    setCustom,
    feeRate,
    presets: base ?? { slow: 2, medium: 8, fast: 25 },
  } as const;
}


