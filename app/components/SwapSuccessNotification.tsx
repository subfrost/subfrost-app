"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

type Props = {
  txId: string;
  onClose: () => void;
};

export default function SwapSuccessNotification({ txId, onClose }: Props) {
  const [isFlashing, setIsFlashing] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Start animations
    requestAnimationFrame(() => setIsVisible(true));
    
    // End flash after 400ms
    const flashTimer = setTimeout(() => setIsFlashing(false), 400);
    
    // Auto-dismiss after 5 seconds
    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 5000);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(dismissTimer);
    };
  }, [onClose]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <>
      {/* Flash overlay */}
      <div
        className={`fixed inset-0 z-[9998] bg-[color:var(--sf-primary)]/10 pointer-events-none transition-opacity duration-[400ms] ${
          isFlashing ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Success bar */}
      <div
        className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-[540px] px-4 transition-all duration-300 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
      >
        <div className="relative rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-50 to-white p-4 shadow-[0_12px_48px_rgba(34,197,94,0.25)] backdrop-blur-xl">
          {/* Success icon */}
          <div className="absolute -top-3 -left-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-green-500 to-green-600 shadow-[0_4px_16px_rgba(34,197,94,0.4)]">
            <Check size={20} className="text-white" strokeWidth={3} />
          </div>

          {/* Content */}
          <div className="ml-8 pr-8">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-green-800">Swap Submitted</h3>
              <div className="flex gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse [animation-delay:200ms]" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse [animation-delay:400ms]" />
              </div>
            </div>
            <div className="text-sm text-green-700/80">
              Transaction ID:{" "}
              <span className="font-mono font-semibold text-xs break-all">{txId}</span>
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full transition-all hover:bg-green-100 focus:outline-none"
            aria-label="Dismiss"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-2xl bg-green-200/50">
            <div className="h-full bg-gradient-to-r from-green-500 to-green-400 animate-[shrink_5s_linear_forwards] origin-left" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shrink {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </>
  );
}
