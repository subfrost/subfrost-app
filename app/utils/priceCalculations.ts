export type AssetPrices = {
  [key: string]: number;
};

export const assetPrices: AssetPrices = {
  BTC: 100888,
  bUSD: 1,
  DIESEL: 3594.30,
  OYL: 1.83,
  METHANE: 2.45,
  WATER: 0.75,
  FROST: 4.38,
  zkBTC: 100888,
  frBTC: 100888, // Adding frBTC with the same price as BTC
};

export function calculateSwapOutput(fromAsset: string, toAsset: string, amount: number): number {
  const fromPrice = assetPrices[fromAsset];
  const toPrice = assetPrices[toAsset];
  
  if (!fromPrice || !toPrice) {
    throw new Error("Invalid asset");
  }

  const outputAmount = (amount * fromPrice) / toPrice;
  return Number(outputAmount.toFixed(8)); // Round to 8 decimal places
}

export function calculateDollarValue(asset: string, amount: number): number {
  const assetPrice = assetPrices[asset];
  if (!assetPrice) {
    throw new Error("Invalid asset");
  }
  return amount * assetPrice;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export const SUBFROST_FEE = 0.001; // 0.1%

