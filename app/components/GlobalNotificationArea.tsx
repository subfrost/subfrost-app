'use client';

import { Suspense } from 'react';
import { useNotification } from '@/context/NotificationContext';
import SwapSuccessNotification from './SwapSuccessNotification';

export default function GlobalNotificationArea() {
  const { notifications, dismissNotification, errorToasts, dismissError } = useNotification();

  if (notifications.length === 0 && errorToasts.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {/* Error toasts — top center, auto-dismiss after 10s */}
      {errorToasts.map((toast) => (
        <div
          key={toast.id}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[calc(100%-2rem)] animate-[slideDown_0.3s_ease-out]"
        >
          <div className="sf-card flex items-start gap-3 px-4 py-3 border-l-4 border-red-500 bg-[color:var(--sf-surface)]/95 backdrop-blur-xl shadow-2xl rounded-xl">
            <span className="text-red-400 text-lg shrink-0 mt-0.5">&#x26A0;</span>
            <p className="flex-1 text-sm text-[color:var(--sf-text)] break-words">{toast.message}</p>
            <button
              onClick={() => dismissError(toast.id)}
              className="shrink-0 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/80 text-lg leading-none mt-0.5"
            >
              &times;
            </button>
          </div>
        </div>
      ))}

      {/* Success notifications */}
      {notifications.map((notif) => (
        <SwapSuccessNotification
          key={notif.id}
          txId={notif.txId}
          operationType={notif.operationType}
          stepContext={notif.stepContext}
          onClose={() => dismissNotification(notif.id)}
          autoCloseAfterConfirmed
          onAutoClose={() => dismissNotification(notif.id)}
        />
      ))}
    </Suspense>
  );
}
