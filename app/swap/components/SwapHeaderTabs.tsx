"use client";

type TabKey = "swap" | "lp";

type Props = {
  selectedTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export default function SwapHeaderTabs({ selectedTab, onTabChange }: Props) {
  return (
    <div className="relative inline-flex items-center gap-2 p-1 rounded-lg">
      {/* Buttons */}
      <button
        type="button"
        className={`relative z-10 flex items-center gap-2 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none rounded-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
          selectedTab === "swap"
            ? "bg-[color:var(--sf-primary)] text-white shadow-lg"
            : "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]"
        }`}
        onClick={() => onTabChange("swap")}
      >
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
        className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none rounded-md whitespace-nowrap shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
          selectedTab === "lp"
            ? "bg-[color:var(--sf-primary)] text-white shadow-lg"
            : "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]"
        }`}
        onClick={() => onTabChange("lp")}
      >
        LIQUIDITY
      </button>
    </div>
  );
}


