export const FRBTC_ALKANE_ID = '32:0';

export function formatAlkanes(
  raw: string | number,
  decimals = 8,
  fixed = 8,
) {
  const n = typeof raw === 'string' ? Number(raw || '0') : raw;
  return (n / 10 ** decimals).toFixed(fixed);
}


