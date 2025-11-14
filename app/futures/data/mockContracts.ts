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

// Mock contracts data (max 100 blocks, max 5 BTC total supply)
// Market Price must always be HIGHER than Exercise Price
// Exercise Price = what you get when exercising now (with premium)
// Market Price = price to buy ftrBTC on secondary market
export const mockContracts: Contract[] = [
  {
    id: 'ftrBTC[8af93c]',
    timeLeft: '6 blocks',
    blocksLeft: 6,
    // Exercise Price = 0.992 BTC (premium ~0.78%)
    // Market Price should be higher, close to 1 BTC (fair value)
    marketPrice: 'Buy at 0.998 BTC',
    marketPriceNum: 0.998, // Close to expiry, price close to 1 BTC, but > exercise price
    expiryBlock: 982110,
    created: '6 blocks ago',
    underlyingYield: 'auto-compounding',
    totalSupply: 4.5,
    exercised: 1.2,
    mempoolQueue: 0.5, // Some transactions in mempool
    remaining: 2.8, // 4.5 - 1.2 - 0.5 = 2.8
  },
  {
    id: 'ftrBTC[b37d20]',
    timeLeft: '18 blocks',
    blocksLeft: 18,
    // Exercise Price = 0.980 BTC (premium ~2.0%)
    // Market Price should be higher
    marketPrice: 'Buy at 0.990 BTC',
    marketPriceNum: 0.990,
    expiryBlock: 982122,
    created: '18 blocks ago',
    underlyingYield: 'auto-compounding',
    totalSupply: 3.8,
    exercised: 0.8,
    mempoolQueue: 0.0, // No transactions in mempool
    remaining: 3.0, // 3.8 - 0.8 - 0.0 = 3.0
  },
  {
    id: 'ftrBTC[c9fe12]',
    timeLeft: '45 blocks',
    blocksLeft: 45,
    // Exercise Price = 0.960 BTC (premium ~4.0%)
    // Market Price should be higher
    marketPrice: 'Buy at 0.975 BTC',
    marketPriceNum: 0.975,
    expiryBlock: 982149,
    created: '45 blocks ago',
    underlyingYield: 'auto-compounding',
    totalSupply: 2.5,
    exercised: 0.3,
    mempoolQueue: 0.2, // Some transactions in mempool
    remaining: 2.0, // 2.5 - 0.3 - 0.2 = 2.0
  },
  {
    id: 'ftrBTC[a83209]',
    timeLeft: '95 blocks',
    blocksLeft: 95,
    // Exercise Price = 0.950 BTC (premium ~5.0%)
    // Market Price should be higher
    marketPrice: 'Buy at 0.965 BTC',
    marketPriceNum: 0.965, // Market price per 1 ftrBTC (higher than exercise price)
    expiryBlock: 983007,
    created: '95 blocks ago',
    underlyingYield: 'auto-compounding',
    totalSupply: 1.2,
    exercised: 0.1,
    mempoolQueue: 0.0, // No transactions in mempool
    remaining: 1.1, // 1.2 - 0.1 - 0.0 = 1.1
  },
];

