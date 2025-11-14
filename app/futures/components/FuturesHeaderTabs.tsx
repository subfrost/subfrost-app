"use client";

type TabKey = "markets" | "positions";

type Props = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="flex gap-2 rounded-xl border border-[color:var(--sf-outline)] bg-white/60 p-1.5 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => onTabChange("markets")}
        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
          activeTab === "markets"
            ? "bg-[color:var(--sf-primary)] text-white shadow-md"
            : "text-[color:var(--sf-text)] hover:bg-black/5"
        }`}
      >
        MARKETS
      </button>
      <button
        type="button"
        onClick={() => onTabChange("positions")}
        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
          activeTab === "positions"
            ? "bg-[color:var(--sf-primary)] text-white shadow-md"
            : "text-[color:var(--sf-text)] hover:bg-black/5"
        }`}
      >
        POSITIONS
      </button>
    </div>
  );
}

