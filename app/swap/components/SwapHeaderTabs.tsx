"use client";

type TabKey = "swap" | "lp";

type Props = {
  selectedTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export default function SwapHeaderTabs({ selectedTab, onTabChange }: Props) {
  return (
    <div className="relative inline-flex items-center gap-2 bg-[color:var(--sf-glass-bg)] p-1 rounded-lg border-2 border-[color:var(--sf-glass-border)] backdrop-blur-md">
      {/* Buttons */}
      <button
        type="button"
        className={`relative z-10 flex items-center gap-2 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-colors duration-300 focus:outline-none rounded-md ${
          selectedTab === "swap" ? "text-white" : "text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]/80"
        }`}
        onClick={() => onTabChange("swap")}
      >
        {selectedTab === "swap" && (
          <span className="absolute inset-0 bg-[color:var(--sf-primary)] rounded-md shadow-lg -z-10 transition-all duration-300 ease-out" />
        )}
        <span>SWAP</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5l-4 4 4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 9h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M16 19l4-4-4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M20 15H8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        type="button"
        className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-colors duration-300 focus:outline-none rounded-md whitespace-nowrap ${
          selectedTab === "lp" ? "text-white" : "text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]/80"
        }`}
        onClick={() => onTabChange("lp")}
      >
        {selectedTab === "lp" && (
          <span className="absolute inset-0 bg-[color:var(--sf-primary)] rounded-md shadow-lg -z-10 transition-all duration-300 ease-out" />
        )}
        LIQUIDITY
      </button>
    </div>
  );
}


