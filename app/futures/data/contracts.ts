export type Contract = {
  id: string;
  timeLeft: string;
  blocksLeft: number; // number of blocks remaining
  marketPrice: string;
  marketPriceNum: number; // numeric market price (BTC per 1 ftrBTC)
  expiryBlock: number;
  created: string;
  underlyingYield: string;
  totalSupply: number; // total ftrBTC minted (in BTC)
  exercised: number; // amount already exercised (in BTC)
  mempoolQueue: number; // amount in mempool queue waiting to be processed (in BTC)
  remaining: number; // remaining supply (in BTC) = totalSupply - exercised - mempoolQueue
};
