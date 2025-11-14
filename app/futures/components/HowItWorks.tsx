'use client';

import { useState } from 'react';

export default function HowItWorks() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold tracking-wide text-[color:var(--sf-text)]">
          How It Works
        </h2>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-center w-6 h-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)] hover:bg-white/50 transition-colors cursor-help"
          aria-label={isExpanded ? 'Hide how it works' : 'Show how it works'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Block 1: Buy */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-3">Buy</h3>
          <p className="text-sm text-[color:var(--sf-text)]/80 mb-4">
            Buy ftrBTC on the futures market.
            <br />
            ftrBTC unlocks into full BTC at expiry.
          </p>
          <div className="space-y-2 text-xs text-[color:var(--sf-text)]/70">
            <div>
              <span className="font-medium">Example:</span> Buy 1 ftrBTC[8af93c] on secondary market
            </div>
            <div>
              <span className="font-medium">Expiry:</span> 30 blocks left (max 100 blocks)
            </div>
          </div>
        </div>

        {/* Block 2: Hold */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-3">Hold</h3>
          <p className="text-sm text-[color:var(--sf-text)]/80 mb-4">
            ftrBTC grows toward full BTC value as expiry approaches.
          </p>
          <div className="space-y-2 text-xs text-[color:var(--sf-text)]/70">
            <div>
              <span className="font-medium">Today value:</span> 0.74 BTC
            </div>
            <div>
              <span className="font-medium">Discount:</span> 26% (time-decay)
            </div>
          </div>
        </div>

        {/* Block 3: Exercise */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-3">Exercise</h3>
          <p className="text-sm text-[color:var(--sf-text)]/80 mb-4">
            Hold to expiry → exercise 1:1 BTC (no penalty).
            <br />
            Early exercise → polynomial fee applies.
          </p>
          <div className="space-y-2 text-xs text-[color:var(--sf-text)]/70">
            <div>
              <span className="font-medium">Exercise now (poly):</span> receives 0.74 BTC
            </div>
            <div>
              <span className="font-medium">At expiry:</span> 1.00 BTC
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

