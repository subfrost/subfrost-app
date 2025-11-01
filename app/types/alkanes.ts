'use client';

export type Currency = {
  id: string;
  name: string;
  symbol?: string;
  address: string;
  balance?: string;
};

export type CurrencyPriceInfo = {
  price: number;
  idClubMarketplace?: boolean | null;
};

export type CurrencyPriceInfoResponse = Currency & {
  priceInfo: CurrencyPriceInfo;
};


