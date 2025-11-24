import type {
  AlkaneId,
  FormattedUtxo,
  NetworkType,
  ProviderConfig,
  Account, // From ts-sdk types
  SpendStrategy, // From ts-sdk types
} from "@alkanes/ts-sdk"; 
import { AlkanesProvider } from "@alkanes/ts-sdk";
import * as bitcoin from 'bitcoinjs-lib'; // Import bitcoinjs-lib
import type {
  GetAddressListingsRequest,
  GetListingPsbtRequest,
  GetSellerPsbtRequest,
  SubmitBuyerPsbtRequest,
  SubmitListingPsbtRequest,
  SwapBrcBid,
  SignedBid,
  OkxBid,
  GetOffersParams,
  GetCollectionOffersParams,
} from "../swap/types"; // These types are defined in "../swap/types"
import type {
  AddressPositionsResult,
  AlkanesByAddressResult,
  AlkanesGlobalSearchResult,
  AlkanesTokenPairsResult,
  AlkanesTokensResult,
  AlkaneTokenDetails,
  AlkaneTokenSortByParams,
  AllPoolsDetailsResult,
  DieselAddressLeaderboardResponse,
  DieselRewardsLeaderboardResponse,
  DieselRewardsResponse,
  PoolAmountOutResult,
  PoolDetailsResult,
  PoolSwapHistory,
  PaginationParams,
  Page,
  PoolSwapRow,
  PoolMintRow,
  PoolBurnRow,
  PoolCreationRow,
  PoolSwapHistoryResult,
  AllAddressAmmTxRow,
  AllFuturesMarketsResult,
  FuturesMarketResult,
  FuturesPositionResult,
  FuturesOrderResult,
  FuturesMarketType,
} from "./types"; // These types are defined in "./types"

/**
 * Represents the client for interacting with the Alkanes API.
 */
export class ApiClient {
  private provider: AlkanesProvider;
  private apiKey: string; // Not directly used by AlkanesProvider but kept for consistency if needed by other components

  constructor(options: { network: NetworkType; host: string; apiKey: string; version?: string }) {
    this.apiKey = options.apiKey;
    // Initialize AlkanesProvider with the provided configuration
    this.provider = new AlkanesProvider({
      network: options.network === 'mainnet' ? bitcoin.networks.bitcoin : (options.network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.regtest), // Map NetworkType to bitcoinjs-lib Network
      networkType: options.network,
      url: options.host,
      projectId: options.apiKey, // Assuming projectId maps to apiKey
      version: options.version,
    });
  }

  // Helper method to route API calls through the AlkanesProvider's underlying clients
  private async _call<T>(
    path: string,
    method: string, // Method not directly used, as AlkanesProvider methods are specific
    data?: any,
  ): Promise<T> {
    // This is a placeholder. The original _call method handled generic API routes.
    // Now, each method needs to be explicitly mapped to the AlkanesProvider's functionality.
    // For now, this will throw an error to indicate incomplete implementation.
    console.warn(`Attempted to call generic API path: ${path} with data: ${JSON.stringify(data)}`);
    throw new Error(`Direct API call to ${path} not yet implemented via AlkanesProvider. Please use specific methods.`);
  }

  // --- Implemented API methods using AlkanesProvider ---

  async getBtcPrice(): Promise<any> {
    // Assuming AlkanesProvider has a method for this, or uses EsploraClient.getAssetPrice or similar
    // Or this could be handled by a specific method in AlkanesRpcClient
    // For now, returning a dummy value or using a placeholder
    // In a real scenario, this would involve calling a specific provider method.
    console.warn("getBtcPrice not directly mapped to AlkanesProvider. Returning dummy value.");
    return { price: 60000 }; // Placeholder
  }

  async getAddressBalance(address: string): Promise<AddressBalance> {
    return this.provider.getBalance(address);
  }

  async getAddressUtxos(address: string): Promise<FormattedUtxo[]> {
    const balance = await this.provider.getBalance(address);
    return balance.utxos;
  }

  // --- Placeholder methods for unimplemented APIs ---
  // Many methods from the original OylApiClient need to be re-implemented
  // using the AlkanesProvider's underlying BitcoinRpcClient, EsploraClient, and AlkanesRpcClient.
  // The structure and parameters will need to be carefully mapped.

  async getBrc20TokenInfo(ticker: string) { return this._call("/get-brc20-token-info", "post", { ticker }); }
  async getRuneTokenInfo(ticker: string) { return this._call("/get-rune-token-info", "post", { ticker }); }
  async getSellerPsbt(params: GetSellerPsbtRequest) { return this._call("/get-seller-psbt", "post", params); }
  async submitBuyerPsbt(params: SubmitBuyerPsbtRequest) { return this._call("/submit-buyer-psbt", "post", params); }
  async getListingPsbt(params: GetListingPsbtRequest) { return this._call("/get-listing-psbt", "post", params); }
  async submitListingPsbt(params: SubmitListingPsbtRequest) { return this._call("/submit-listing-psbt", "post", params); }
  async getAddressListings(params: GetAddressListingsRequest) { return this._call("/get-address-listings", "post", params); }
  async getCollectionInfo(collectionId: string) { return this._call("/get-collection-info", "post", { collectionId }); }
  async getCollectionMarketInfo(collectionId: string) { return this._call("/get-collection-market-info", "post", { collectionId }); }
  async getBrc20TokenDetails(ticker: string) { return this._call("/get-brc20-token-details", "post", { ticker }); }
  async getBrc20sByAddress(address: string) { return this._call("/get-address-brc20-balance", "post", { address }); }
  async getBrcPrice(ticker: string) { return this._call("/get-brc-price", "post", { ticker }); }
  async getBrc20Tickers(tickerParams: { sort_by?: string; order?: string; offset?: number; count?: number; minting_status?: string; }) { return this._call("/get-brc20-tickers", "post", tickerParams); }
  async getRuneTickers() { return this._call("/get-rune-tickers", "post"); }
  async getMarketplaceCollections() { return this._call("/get-marketplace-collections", "post"); }
  async getAggrMarketplaceCollections(onlyOffers?: boolean) { return this._call("/get-aggr-marketplace-collections", "post", { onlyOffers }); }
  async getAllInscriptionsByAddress(address: string): Promise<any> { return this._call("/get-inscriptions", "post", { address, exclude_brc20: false, count: 20, order: "desc" }); }
  async getInscriptionsForTxn(txn_id: string): Promise<any> { return this._call("/get-inscriptions-for-txn", "post", { tx_id: txn_id }); }
  async getTaprootTxHistory(taprootAddress: string, totalTxs: number): Promise<any> { return this._call("/get-taproot-history", "post", { taprootAddress, totalTxs }); }
  async getTaprootBalance(address: string): Promise<any> { return this._call("/get-taproot-balance", "post", { address }); }
  async getAccountBalance(account: string): Promise<any> { return this._call("/get-account-balance", "post", { account }); }
  async getAccountUtxos(account: Account): Promise<any> { const stringifiedAccount = JSON.stringify(account); return this._call("/get-account-utxos", "post", { account: stringifiedAccount }); }
  async getAmmUtxos(params: {address: string; spendStrategy: SpendStrategy }): Promise<{ utxos: FormattedUtxo[] }> {
    const stringifiedSpendStrategy = params.spendStrategy ? JSON.stringify(params.spendStrategy) : null;
    return this._call("/get-amm-utxos", "post", { address: params.address, stringifiedSpendStrategy });
  }
  async getFaucetBtc(params: { address: string }): Promise<{ status: string; txid: string; }> { return this._call("/get-faucet-btc", "post", params); }
  async getPoolPositionsByAddress(params: { address: string; factoryId: { block: string; tx: string; }; }): Promise<AddressPositionsResult[]> { return this._call("/address-positions", "post", params); }
  async getAlkanesTokenPoolDetails(params: { factoryId: { block: string; tx: string; }; poolId: { block: string; tx: string; }; }): Promise<PoolDetailsResult & { poolId: AlkaneId; }> { return this._call("/get-pool-details", "post", params); }
  async getPredicateAmountOut(params: { factoryId: { block: string; tx: string; }; poolId: { block: string; tx: string; }; tokenAmount: string; tokenId: { block: string; tx: string; }; }): Promise<PoolAmountOutResult> { return this._call("/get-swap-amount-out", "post", params); }
  async getAlkanesTokenPools(params: { factoryId: { block: string; tx: string; }; limit?: number; offset?: number; sort_by?: "tvl" | "volume1d" | "volume30d" | "apr"; order?: "asc" | "desc"; address?: string; searchQuery?: string; }): Promise<AllPoolsDetailsResult> { return this._call("/get-all-pools-details", "post", params); }
  async getAlkanesTokenPairs(params: { factoryId: { block: string; tx: string; }; alkaneId: { block: string; tx: string; }; sort_by?: "tvl"; limit?: number; offset?: number; searchQuery?: string; }): Promise<AlkanesTokenPairsResult[]> { return this._call("/get-token-pairs", "post", params); }
  async getPoolSwapHistory(params: { poolId: AlkaneId; } & PaginationParams): Promise<Page<PoolSwapHistoryResult>> { return this._call("/get-pool-swap-history", "post", params); }
  async getTokenSwapHistory(params: { tokenId: AlkaneId; } & PaginationParams): Promise<Page<PoolSwapRow>> { return this._call("/get-token-swap-history", "post", params); }
  async getPoolMintHistory(params: { poolId: AlkaneId; } & PaginationParams): Promise<Page<PoolMintRow>> { return this._call("/get-pool-mint-history", "post", params); }
  async getPoolBurnHistory(params: { poolId: AlkaneId; } & PaginationParams): Promise<Page<PoolBurnRow>> { return this._call("/get-pool-burn-history", "post", params); }
  async getPoolCreationHistory(params: { poolId: AlkaneId; } & PaginationParams): Promise<Page<PoolCreationRow>> { return this._call("/get-pool-creation-history", "post", params); }
  async getAddressSwapHistoryForPool(params: { address: string; poolId: AlkaneId; } & PaginationParams): Promise<Page<PoolSwapRow>> { return this._call("/get-address-swap-history-for-pool", "post", params); }
  async getAddressSwapHistoryForToken(params: { address: string; tokenId: AlkaneId; } & PaginationParams): Promise<Page<PoolSwapRow>> { return this._call("/get-address-swap-history-for-token", "post", params); }
  async getAddressPoolCreationHistory(params: { address: string; poolId?: AlkaneId | null; } & PaginationParams): Promise<Page<PoolCreationRow>> { return this._call("/get-address-pool-creation-history", "post", params); }
  async getAddressPoolMintHistory(params: { address: string; poolId?: AlkaneId | null; } & PaginationParams): Promise<Page<PoolMintRow>> { return this._call("/get-address-pool-mint-history", "post", params); }
  async getAddressPoolBurnHistory(params: { address: string; poolId?: AlkaneId | null; } & PaginationParams): Promise<Page<PoolBurnRow>> { return this._call("/get-address-pool-burn-history", "post", params); }
  async getAllAddressAmmTxHistory(params: { address: string; poolId?: AlkaneId | null; } & PaginationParams): Promise<Page<AllAddressAmmTxRow>> { return this._call("/get-all-address-amm-tx-history", "post", params); }
  async getAllAmmTxHistory(params: { poolId?: AlkaneId | null; } & PaginationParams): Promise<Page<AllAddressAmmTxRow>> { return this._call("/get-all-amm-tx-history", "post", params); }
  async getOutputRune(params: { output: string; }): Promise<any> { return this._call("/get-output-rune-info", "post", params); }
  async dailyCheckIn(params: { address: string; }): Promise<{ result: string; }> { return this._call("/daily-check-in", "post", params); }
  async getDieselRewardsByAddress(params: { address: string; }): Promise<DieselRewardsResponse | null> { return this._call("/get-diesel-rewards", "post", params); }
  async getDieselRewardsLeaderboard(params: { limit: number; }): Promise<DieselRewardsLeaderboardResponse[] | null> { return this._call("/get-diesel-leaderboard", "post", params); }
  async getDieselAddressLeaderboard(params: { limit: number; }): Promise<DieselAddressLeaderboardResponse[] | null> { return this._call("/get-diesel-address-leaderboard", "post", params); }
  async getWhitelistLeaderboard(params: { address: string; }) { return this._call("/get-whitelist-leaderboard", "post", params); }
  async getWhitelistXp(params: { taprootAddress: string; segwitAddress?: string; nestedSegwitAddress?: string; }) { return this._call("/get-whitelist-xp", "post", params); }
  async getAirheadsMintStatus(params: { buyerAddress: string; }) { return this._call("/airhead-mint-status", "post", params); }
  async claimAirhead(params: { account: Account; feeRate: number; gatheredUtxos: any; }) { return this._call("/claim-airhead", "post", params); }
  async submitAirheadClaim(params: { buyerAddress: string; psbt: string; listingId: string; }) { return this._call("/submit-airhead-claim", "post", params); }
  async getFuturesMarkets(params?: { type?: FuturesMarketType | 'all'; baseAsset?: string; limit?: number; offset?: number; }): Promise<AllFuturesMarketsResult> { return this._call("/get-futures-markets", "post", params || {}); }
  async getFuturesMarket(params: { marketId: string; }): Promise<FuturesMarketResult> { return this._call("/get-futures-market", "post", params); }
  async getFuturesPositions(params: { address: string; marketId?: string; }): Promise<FuturesPositionResult[]> { return this._call("/get-futures-positions", "post", params); }
  async getFuturesOrders(params: { address: string; marketId?: string; status?: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected'; limit?: number; offset?: number; }): Promise<FuturesOrderResult[]> { return this._call("/get-futures-orders", "post", params); }
  async placeFuturesOrder(params: { marketId: string; address: string; side: 'long' | 'short'; type: 'market' | 'limit' | 'stop-market' | 'stop-limit'; size: number; price?: number; stopPrice?: number; leverage: number; }): Promise<FuturesOrderResult> { return this._call("/place-futures-order", "post", params); }
  async cancelFuturesOrder(params: { orderId: string; address: string; }): Promise<{ success: boolean; }> { return this._call("/cancel-futures-order", "post", params); }
  async closeFuturesPosition(params: { positionId: string; address: string; size?: number; }): Promise<{ success: boolean; }> { return this._call("/close-futures-position", "post", params); }
}
