import { useWallet } from '@/context/WalletContext';

/**
 * Returns true when vault action buttons should be disabled (mainnet only).
 * Unlike useDemoGate, this is always active on mainnet regardless of DEMO_MODE_ENABLED.
 */
export function useVaultDemoGate(): boolean {
  const { network } = useWallet();
  return network === 'mainnet';
}
