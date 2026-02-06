import { useWallet } from '@/context/WalletContext';
import { DEMO_MODE_ENABLED } from '@/utils/demoMode';

/**
 * Returns true when features should be blocked (demo mode ON + mainnet).
 * Returns false when features should work normally.
 */
export function useDemoGate(): boolean {
  const { network } = useWallet();
  return DEMO_MODE_ENABLED && network === 'mainnet';
}
