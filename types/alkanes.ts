export type Currency = {
  id: string;
  name: string;
  symbol?: string;
  address: string;
  encodedImage?: string;
  balance?: string;
  balanceUsd?: string;
  decimals?: number;
};

export type CurrencyPriceInfo = {
  price: number;
  idClubMarketplace?: boolean | null;
};

export type CurrencyPriceInfoResponse = Currency & {
  priceInfo: CurrencyPriceInfo;
};


