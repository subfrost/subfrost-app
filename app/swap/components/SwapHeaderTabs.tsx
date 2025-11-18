"use client";

import { useState } from "react";

type TabKey = "swap" | "lp";

export default function SwapHeaderTabs() {
  const [tab, setTab] = useState<TabKey>("swap");

  return (
    <div className="relative inline-flex items-center gap-2 bg-[color:var(--sf-glass-bg)] p-1 rounded-lg border-2 border-[color:var(--sf-glass-border)] backdrop-blur-md">
      {/* Sliding background */}
      <div
        className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] bg-[color:var(--sf-primary)] rounded-md shadow-lg transition-all duration-300 ease-out ${
          tab === "lp" ? "left-[calc(50%+0.25rem)]" : "left-1"
        }`}
      />
      
      {/* Buttons */}
      <button
        type="button"
        className={`relative z-10 w-[calc(50%-0.25rem)] px-16 py-2 text-sm font-bold uppercase tracking-wide transition-colors duration-300 focus:outline-none rounded-md ${
          tab === "swap" ? "text-white" : "text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]/80"
        }`}
        onClick={() => setTab("swap")}
      >
        SWAP
      </button>
      <button
        type="button"
        className={`relative z-10 w-[calc(50%-0.25rem)] px-16 py-2 text-sm font-bold uppercase tracking-wide transition-colors duration-300 focus:outline-none rounded-md ${
          tab === "lp" ? "text-white" : "text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]/80"
        }`}
        onClick={() => setTab("lp")}
      >
        LP
      </button>
    </div>
  );
}


