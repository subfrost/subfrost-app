export function alkaneToAlks(value: string, decimals: number = 8): string {
  const n = parseFloat(value || '0');
  if (!isFinite(n) || n <= 0) return '0';
  const scaled = Math.floor(n * Math.pow(10, decimals));
  return String(scaled);
}

export function alksToAlkanes(alks: string, decimals: number = 8): string {
  const n = typeof alks === 'string' ? Number(alks || '0') : alks;
  return (n / Math.pow(10, decimals)).toFixed(decimals);
}


