"use client";

export type TabKey = "swap" | "lp";

type Props = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export default function SwapHeaderTabs({ activeTab, onTabChange }: Props) {
  const base =
    "px-4 py-2 text-sm font-semibold rounded-md transition-colors sf-focus-ring";
  const active = "bg-[color:var(--sf-primary)] text-white shadow";
  const inactive =
    "bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)] hover:bg-white/80 border border-[color:var(--sf-glass-border)]";

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sf-glass-bg)] p-1 border border-[color:var(--sf-glass-border)] backdrop-blur-md">
      <button
        type="button"
        className={`${base} ${activeTab === "swap" ? active : inactive}`}
        onClick={() => onTabChange("swap")}
      >
        SWAP
      </button>
      <button
        type="button"
        className={`${base} ${activeTab === "lp" ? active : inactive}`}
        onClick={() => onTabChange("lp")}
      >
        LP
      </button>
    </div>
  );
}


