'use client';

import { Suspense, useEffect, useState } from 'react';
import { useNotification, type ErrorToast } from '@/context/NotificationContext';
import SwapSuccessNotification from './SwapSuccessNotification';

const ERROR_TOAST_DURATION_MS = 10_000;

function ErrorToastItem({ toast, onDismiss }: { toast: ErrorToast; onDismiss: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const elapsed = Date.now() - toast.createdAt;
    return Math.max(0, Math.ceil((ERROR_TOAST_DURATION_MS - elapsed) / 1000));
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isClickPaused, setIsClickPaused] = useState(false);
  const isPaused = isHovered || isClickPaused;

  useEffect(() => {
    if (isPaused) return;
    if (secondsLeft <= 0) {
      onDismiss();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, isPaused, onDismiss]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[calc(100%-2rem)] animate-[slideDown_0.3s_ease-out]">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={isClickPaused}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsClickPaused((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsClickPaused((p) => !p);
          }
        }}
        className="sf-card relative flex items-center gap-3 px-4 py-3 pr-12 border-l-4 border-red-500 bg-[color:var(--sf-surface)]/95 backdrop-blur-xl shadow-2xl rounded-xl cursor-pointer select-none"
      >
        <span className="text-red-400 text-lg shrink-0 leading-none">&#x26A0;</span>
        <p className="flex-1 text-sm text-[color:var(--sf-text)] break-words">{toast.message}</p>
        <span
          aria-live="polite"
          aria-label={isPaused ? 'Paused' : `${secondsLeft} seconds remaining`}
          className="absolute top-2 right-3 text-xs tabular-nums text-[color:var(--sf-text)]/50 flex items-center justify-center min-w-[1.5rem]"
        >
          {isPaused ? (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="w-3 h-3"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            `${secondsLeft}s`
          )}
        </span>
      </div>
    </div>
  );
}

export default function GlobalNotificationArea() {
  const { notifications, dismissNotification, errorToasts, dismissError } = useNotification();

  if (notifications.length === 0 && errorToasts.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {/* Error toasts — top center, auto-dismiss after 10s with visible countdown */}
      {errorToasts.map((toast) => (
        <ErrorToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissError(toast.id)}
        />
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
