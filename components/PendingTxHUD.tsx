/**
 * Floating HUD widget that shows pending tx count in the corner of
 * the viewport. Click → navigates to /wallet where the transaction
 * history surfaces the pending entries at the top with a "Pending"
 * pill (and per-row "Speed Up" buttons via the existing RBF flow).
 *
 * Visibility: only renders when `usePendingTxs().pendingTxs.length > 0`.
 * Auto-disappears once HeightPoller's eviction sweep clears the IDB
 * after on-chain confirmation.
 *
 * Positioning rules:
 *   - Desktop: fixed top-right, below the page header.
 *   - Mobile:  fixed bottom-right, ABOVE the MobileBottomNav (which
 *     pins to bottom-4 inset). Uses bottom-24 to clear it.
 *
 * Mounted in providers.tsx alongside <WalletStatePrewarmer/>.
 */

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Loader2, ArrowUpRight } from 'lucide-react';
import { usePendingTxs } from '@/hooks/usePendingTxs';

export function PendingTxHUD() {
  const router = useRouter();
  const pathname = usePathname();
  const { pendingTxs } = usePendingTxs();

  if (!pendingTxs.length) return null;
  // Don't render the widget on the wallet page itself — the user is
  // already looking at the canonical pending list there.
  if (pathname === '/wallet') return null;

  const count = pendingTxs.length;
  const handleClick = () => {
    router.push('/wallet');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`${count} pending transaction${count === 1 ? '' : 's'} — click to view`}
      className="
        fixed z-40
        right-4 top-20
        md:top-24
        bottom-auto
        flex items-center gap-2
        rounded-full
        bg-[color:var(--sf-glass-bg)] backdrop-blur-md
        border border-amber-400/40
        shadow-[0_4px_16px_rgba(0,0,0,0.25)]
        px-3 py-2 text-xs font-bold uppercase tracking-wide
        text-amber-300
        hover:border-amber-400/70 hover:shadow-[0_6px_20px_rgba(255,191,0,0.18)]
        transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none
      "
    >
      <Loader2 size={14} className="animate-spin text-amber-300" />
      <span>
        {count} pending
      </span>
      <ArrowUpRight size={12} className="text-amber-300/60" />
    </button>
  );
}
