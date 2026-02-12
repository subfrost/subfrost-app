import { useWallet } from '@/context/WalletContext';
import { DEMO_MODE_ENABLED } from '@/utils/demoMode';

/** Wallet IDs ungated on mainnet even when demo mode is enabled */
const UNGATED_WALLET_IDS = new Set(['okx', 'unisat']);

/**
 * Returns true when features should be blocked (demo mode ON + mainnet).
 * Returns false when features should work normally.
 *
 * OKX and UniSat wallets are always ungated — their users can transact
 * on mainnet even while demo mode is active for other wallets.
 */
export function useDemoGate(): boolean {
  const { network, browserWallet } = useWallet();
  if (!DEMO_MODE_ENABLED || network !== 'mainnet') return false;

  const walletId = browserWallet?.info?.id;
  if (walletId && UNGATED_WALLET_IDS.has(walletId)) return false;

  return true;
}
