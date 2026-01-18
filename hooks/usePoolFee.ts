import { useQuery } from '@tanstack/react-query';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Define types locally to avoid import issues with ts-sdk
type AlkaneId = { block: number | string; tx: number | string };

// WebProvider type for the function signature
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Query pool fee for a given pool
 *
 * NOTE: Pool fees are HARDCODED in the Alkanes AMM pool contracts at 0.8% (LP fee)
 * plus 0.2% protocol fee = 1% total (TOTAL_PROTOCOL_FEE = 0.01).
 *
 * The fee is not dynamically stored or queryable via RPC - it's compiled into the
 * pool contract bytecode. This function returns the static fee value.
 *
 * Reference:
 * - Pool opcodes: alkanes-rs-dev/crates/alkanes-cli-common/src/alkanes/asc/alkanes-asm-common/assembly/staticcall.ts
 * - Fee calculation: alkanes-rs-dev/crates/alkanes-cli-common/src/alkanes/amm.rs
 * - SwapShell.tsx uses: lpFeeRate = 0.008 (0.8%)
 */
export const queryPoolFeeWithProvider = async (
  _provider: WebProvider | null,
  alkaneId?: AlkaneId
): Promise<number> => {
  // Pool fee is hardcoded in the contract at 1% total (0.8% LP + 0.2% protocol)
  // No RPC call needed - return the static value directly
  if (alkaneId) {
    console.log('[usePoolFee] Using static pool fee for:', `${alkaneId.block}:${alkaneId.tx}`);
  }
  return TOTAL_PROTOCOL_FEE;
};

/**
 * Hook to get pool fee for a specific alkane
 */
export const usePoolFee = (alkaneId?: AlkaneId) => {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery({
    queryKey: ['poolFee', network, alkaneId],
    enabled: !!alkaneId && isInitialized && !!provider,
    queryFn: async () => {
      return queryPoolFeeWithProvider(provider, alkaneId);
    },
  });
};
