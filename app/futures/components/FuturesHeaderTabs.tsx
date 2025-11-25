"use client";

type TabKey = "markets" | "positions";

type Props = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="relative inline-flex items-center gap-2 bg-[color:var(--sf-glass-bg)] p-1 rounded-lg border-2 border-[color:var(--sf-glass-border)] backdrop-blur-md">
      <button
        type="button"
        className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-colors duration-300 focus:outline-none rounded-md ${
          activeTab === "markets" ? "text-white" : "text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]/80"
        }`}
        onClick={() => onTabChange("markets")}
      >
        {activeTab === "markets" && (
          <span className="absolute inset-0 bg-[color:var(--sf-primary)] rounded-md shadow-lg -z-10 transition-all duration-300 ease-out" />
        )}
        MARKETS
      </button>
      <button
        type="button"
        className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-colors duration-300 focus:outline-none rounded-md ${
          activeTab === "positions" ? "text-white" : "text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]/80"
        }`}
        onClick={() => onTabChange("positions")}
      >
        {activeTab === "positions" && (
          <span className="absolute inset-0 bg-[color:var(--sf-primary)] rounded-md shadow-lg -z-10 transition-all duration-300 ease-out" />
        )}
        POSITIONS
      </button>
    </div>
  );
}

