'use client';

import { Suspense } from 'react';
import { useNotification } from '@/context/NotificationContext';
import SwapSuccessNotification from './SwapSuccessNotification';

export default function GlobalNotificationArea() {
  const { notifications, dismissNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {notifications.map((notif) => (
        <SwapSuccessNotification
          key={notif.id}
          txId={notif.txId}
          operationType={notif.operationType}
          onClose={() => dismissNotification(notif.id)}
          autoCloseAfterConfirmed
          onAutoClose={() => dismissNotification(notif.id)}
        />
      ))}
    </Suspense>
  );
}
