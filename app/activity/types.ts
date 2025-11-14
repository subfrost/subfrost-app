export type TransactionType = 'Swap' | 'Wrap' | 'Unwrap' | 'Deposit' | 'Withdraw';

export type Token = {
  id: string;
  symbol: string;
  name: string;
  iconUrl?: string;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  txHash: string;
  fromToken: Token;
  toToken: Token;
  amountFrom: string;
  amountTo: string;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
};
