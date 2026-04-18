import { Suspense } from 'react';
import WalletDashboardContent from './WalletDashboardContent';

// WalletDashboardContent consumes useSearchParams() for the `?tab=` deeplink.
// Next.js 16 prerender requires this to live inside a <Suspense> boundary,
// otherwise the build aborts with "useSearchParams() should be wrapped in a
// suspense boundary". The boundary is invisible to users: during prerender
// it short-circuits to the fallback (null), then hydrates to the full
// dashboard on client mount.
export default function WalletDashboardPage() {
  return (
    <Suspense fallback={null}>
      <WalletDashboardContent />
    </Suspense>
  );
}
