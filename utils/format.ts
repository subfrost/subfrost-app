export const SATS_PER_BTC = 100_000_000;

export function satsToBtc(satoshis: number): number {
  const safeSats = Number.isFinite(satoshis) ? satoshis : 0;
  return safeSats / SATS_PER_BTC;
}

export function formatBtc(amountBtc: number): string {
  if (!Number.isFinite(amountBtc) || amountBtc === 0) {
    return '0.00000000';
  }

  const absolute = Math.abs(amountBtc);
  if (absolute < 0.000001) {
    const sats = Math.round(amountBtc * SATS_PER_BTC);
    return `${sats} sats`;
  }

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(amountBtc);

  return formatted.replace(/\.0+$/, '');
}


