// Calculate exercise cost premium (fee percentage) based on blocks left
// Premiums: ~5% at start (100 blocks left), 3% at 30 blocks left, 0.1% at expiry (0 blocks left)
// Quadratic curve: y = ax² + bx + c
// Points: (100, 5.0), (30, 3.0), (0, 0.1)
export function calculateExercisePremium(blocksLeft: number): number {
  // Clamp blocksLeft between 0 and 100
  const x = Math.max(0, Math.min(100, blocksLeft));
  
  // Solved quadratic system for points (0, 0.1), (30, 3.0), (100, 5.0):
  // a = -0.000681, b = 0.117097, c = 0.1
  const a = -0.000681;
  const b = 0.117097;
  const c = 0.1;
  
  // Calculate premium percentage: y = -0.000681x² + 0.117097x + 0.1
  const premium = a * x * x + b * x + c;
  
  // Round to 2 decimal places and ensure it's within bounds
  return Math.max(0.1, Math.min(5.0, Math.round(premium * 100) / 100));
}

// Calculate exercise price (what you get per 1 ftrBTC) = 1 - premium%
// At 100 blocks: premium = 5%, exercise price = 0.95 BTC per 1 ftrBTC
// At 30 blocks: premium = 3%, exercise price = 0.97 BTC per 1 ftrBTC
// At 0 blocks (expiry): premium = 0.1%, exercise price = 0.999 BTC per 1 ftrBTC
// NOTE: At expiry, you actually get 1 BTC per 1 ftrBTC (no penalty)
export function calculateExercisePrice(blocksLeft: number, notionalBtc: number = 1.0): number {
  // At expiry (blocksLeft = 0), you get 1 BTC per 1 ftrBTC
  if (blocksLeft === 0) {
    return notionalBtc;
  }
  
  const premiumPercent = calculateExercisePremium(blocksLeft);
  // Exercise price = notional * (1 - premium/100)
  return notionalBtc * (1 - premiumPercent / 100);
}

// Calculate yield (return) when holding until expiry
// At expiry: 1 ftrBTC = 1 BTC (no penalty)
// Yield = (expiryPrice - marketPrice) / marketPrice * 100%
// Where expiryPrice = 1 BTC per 1 ftrBTC
export function calculateYieldAtExpiry(marketPrice: number): {
  yieldPercent: number;
  expiryPrice: number; // Price at expiry: 1 BTC per 1 ftrBTC
} {
  // At expiry, 1 ftrBTC = 1 BTC
  const expiryPrice = 1.0;
  
  // Yield = (expiryPrice - marketPrice) / marketPrice * 100%
  const yieldPercent = ((expiryPrice - marketPrice) / marketPrice) * 100;
  
  return {
    yieldPercent,
    expiryPrice,
  };
}

// Calculate profit and exercise value for a given investment at a specific lock period
// lockPeriodBlocks: how long user wants to lock (e.g., 30 blocks)
// contractBlocksLeft: how many blocks left until contract expiry (e.g., 95 blocks)
// After lockPeriodBlocks, contract will have (contractBlocksLeft - lockPeriodBlocks) blocks left
export function calculateProfitAtLockPeriod(
  marketPrice: number,
  investmentAmount: number = 1.0,
  lockPeriodBlocks: number,
  contractBlocksLeft: number
): {
  ftrBtcAmount: number; // How many ftrBTC you can buy
  exerciseValue: number; // Total BTC you get after lock period (when exercising)
  profit: number; // Profit = exerciseValue - investmentAmount
  yieldPercent: number; // Yield percentage
  blocksLeftAfterLock: number; // How many blocks left in contract after lock period
  exercisePriceAfterLock: number; // Exercise price per 1 ftrBTC after lock period
} {
  // Calculate blocks left in contract after lock period
  const blocksLeftAfterLock = Math.max(0, contractBlocksLeft - lockPeriodBlocks);
  
  // Calculate exercise price after lock period
  // If blocksLeftAfterLock = 0, it means contract expired, exercise price = 1 BTC
  // Otherwise, calculate exercise price based on remaining blocks
  const exercisePriceAfterLock = calculateExercisePrice(blocksLeftAfterLock);
  
  // Calculate how many ftrBTC you can buy at market price
  const ftrBtcAmount = investmentAmount / marketPrice;
  
  // Calculate exercise value after lock period
  // exerciseValue = ftrBTC amount * exercise price per ftrBTC
  const exerciseValue = ftrBtcAmount * exercisePriceAfterLock;
  
  // Calculate profit
  const profit = exerciseValue - investmentAmount;
  
  // Calculate yield percentage
  const yieldPercent = (profit / investmentAmount) * 100;
  
  return {
    ftrBtcAmount,
    exerciseValue,
    profit,
    yieldPercent,
    blocksLeftAfterLock,
    exercisePriceAfterLock,
  };
}

// Calculate profit and exercise value for a given investment
// Yield is calculated as discount from nominal value (1 BTC per 1 ftrBTC)
// If marketPrice = 0.95 BTC, discount = 5%, yield = 5% (not 5.26%)
// The yield represents the discount from the nominal value at expiry
export function calculateProfitAtExpiry(
  marketPrice: number,
  investmentAmount: number = 1.0
): {
  ftrBtcAmount: number; // How many ftrBTC you can buy
  exerciseValue: number; // Total BTC you get at expiry
  profit: number; // Profit = exerciseValue - investmentAmount
  yieldPercent: number; // Yield percentage (discount from nominal)
  discountPercent: number; // Discount percentage from nominal (1 BTC)
} {
  // Discount from nominal value (1 BTC per 1 ftrBTC)
  // If marketPrice = 0.95 BTC, discount = (1 - 0.95) / 1 * 100% = 5%
  const discountPercent = ((1.0 - marketPrice) / 1.0) * 100;
  
  // Yield is the same as discount when calculated from nominal
  const yieldPercent = discountPercent;
  
  // Calculate profit based on discount (not from buying more ftrBTC)
  // If discount = 5%, profit = investmentAmount * 5% = investmentAmount * 0.05
  const profit = investmentAmount * (discountPercent / 100);
  
  // Exercise value = investmentAmount + profit
  // This represents what you get at expiry (1 BTC per 1 ftrBTC)
  const exerciseValue = investmentAmount + profit;
  
  // Calculate how many ftrBTC you can buy at market price
  // This is for informational purposes only, the yield is based on discount
  const ftrBtcAmount = investmentAmount / marketPrice;
  
  return {
    ftrBtcAmount,
    exerciseValue,
    profit,
    yieldPercent,
    discountPercent,
  };
}

