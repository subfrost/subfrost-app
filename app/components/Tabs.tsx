"use client";

import { useState } from "react";

export type TabKey = "stake" | "unstake";

export default function Tabs({ onChange }: { onChange?: (tab: TabKey) => void }) {
  const [tab, setTab] = useState<TabKey>("stake");

  const select = (next: TabKey) => {
    setTab(next);
    onChange?.(next);
  };

  const base =
    "px-4 py-2 text-sm font-semibold rounded-md transition-colors focus:outline-none";
  const active = "bg-[color:var(--sf-primary)] text-white shadow";
  const inactive =
    "bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]/80 border border-[color:var(--sf-glass-border)]";

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sf-glass-bg)] p-1 border border-[color:var(--sf-glass-border)] backdrop-blur-md">
      <button
        type="button"
        onClick={() => select("stake")}
        className={`${base} ${tab === "stake" ? active : inactive}`}
      >
        STAKE
      </button>
      <button
        type="button"
        onClick={() => select("unstake")}
        className={`${base} ${tab === "unstake" ? active : inactive}`}
      >
        UNSTAKE
      </button>
    </div>
  );
}


