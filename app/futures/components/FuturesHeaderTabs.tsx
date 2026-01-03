"use client";

type TabKey = "markets" | "positions";

type Props = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="relative inline-flex items-center gap-2 p-1 rounded-lg">
      <button
        type="button"
        className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-300 focus:outline-none rounded-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
          activeTab === "markets"
            ? "bg-[color:var(--sf-primary)] text-white shadow-lg"
            : "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]"
        }`}
        onClick={() => onTabChange("markets")}
      >
        MARKETS
      </button>
      <button
        type="button"
        className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-300 focus:outline-none rounded-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
          activeTab === "positions"
            ? "bg-[color:var(--sf-primary)] text-white shadow-lg"
            : "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]"
        }`}
        onClick={() => onTabChange("positions")}
      >
        POSITIONS
      </button>
    </div>
  );
}

