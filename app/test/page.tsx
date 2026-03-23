'use client';

import { useState, useRef } from 'react';
import PageContent from '@/app/components/PageContent';
import {
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Zap,
  Shield,
  TrendingUp,
  ChevronDown,
  X,
} from 'lucide-react';

// ─── Sample data ────────────────────────────────────────────────────────────

const TABLE_ROWS = [
  { name: 'DIESEL / frBTC', tvl: '$1,240,000', volume: '$88,300', apy: '+42.1%', change: 1 },
  { name: 'frBTC / USDT',   tvl: '$890,000',  volume: '$61,200', apy: '+18.4%', change: 1 },
  { name: 'DIESEL / USDT',  tvl: '$540,000',  volume: '$29,800', apy: '-3.2%',  change: -1 },
  { name: 'ORDI / frBTC',   tvl: '$312,000',  volume: '$14,100', apy: '+7.9%',  change: 1 },
  { name: 'SATS / DIESEL',  tvl: '$98,000',   volume: '$5,400',  apy: '-0.8%',  change: -1 },
];

const ACTIVITY = [
  { icon: Flame,  label: 'Swap',            detail: '1,000 DIESEL → 0.00412 frBTC', time: '2m ago' },
  { icon: Zap,    label: 'Add Liquidity',   detail: '500 DIESEL + 0.002 frBTC',      time: '7m ago' },
  { icon: Shield, label: 'Remove Liquidity',detail: '200 LP tokens burned',           time: '15m ago' },
  { icon: TrendingUp, label: 'Swap',        detail: '0.01 frBTC → 2,430 DIESEL',     time: '22m ago' },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TestPage() {
  const [searchValue, setSearchValue] = useState('');
  const [amountValue, setAmountValue] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState('DIESEL');
  const [activeTab, setActiveTab] = useState('futures');
  const [activeFireTab, setActiveFireTab] = useState('stake');
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupSearch, setPopupSearch] = useState('');
  const [selectedPopupToken, setSelectedPopupToken] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const tokens = ['DIESEL', 'frBTC', 'USDT', 'ORDI'];

  return (
    <PageContent>
      <div className="mx-auto w-full max-w-[1100px] flex flex-col gap-6 py-2">

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--sf-text)]">Design System</h1>
          <p className="mt-1 text-sm text-[color:var(--sf-text)]/60">
            Reference components using <code className="text-[color:var(--sf-primary)] font-mono text-xs">.sf-card</code>,{' '}
            <code className="text-[color:var(--sf-primary)] font-mono text-xs">.sf-panel</code>,{' '}
            <code className="text-[color:var(--sf-primary)] font-mono text-xs">.sf-input</code>,{' '}
            <code className="text-[color:var(--sf-primary)] font-mono text-xs">.sf-row</code>, and{' '}
            <code className="text-[color:var(--sf-primary)] font-mono text-xs">.sf-dropdown</code>.
          </p>
        </div>

        {/* ── Row 1: Table + Stat card ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Data table — .sf-card + .sf-row */}
          <div className="sf-card lg:col-span-2">
            <div className="px-5 py-4 border-b border-[color:var(--sf-row-border)]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40 mb-0.5">component</p>
              <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-card + .sf-row — Data Table</h2>
            </div>

            {/* Column headers — .sf-table-header */}
            <div className="sf-table-header grid grid-cols-[1fr_96px_104px_76px] px-5 py-2.5">
              <span>Pair</span>
              <span className="text-right">TVL</span>
              <span className="text-right">Volume 24h</span>
              <span className="text-right">APY</span>
            </div>

            {TABLE_ROWS.map((row) => (
              <div
                key={row.name}
                className="sf-row grid grid-cols-[1fr_96px_104px_76px] px-5 py-3.5 cursor-pointer"
              >
                <span className="text-sm font-semibold text-[color:var(--sf-text)] truncate pr-2">{row.name}</span>
                <span className="text-sm text-[color:var(--sf-text)]/70 text-right">{row.tvl}</span>
                <span className="text-sm text-[color:var(--sf-text)]/70 text-right">{row.volume}</span>
                <span className={`text-sm font-semibold text-right flex items-center gap-0.5 justify-end ${
                  row.change > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {row.change > 0
                    ? <ArrowUpRight size={13} strokeWidth={2.5} />
                    : <ArrowDownRight size={13} strokeWidth={2.5} />}
                  {row.apy}
                </span>
              </div>
            ))}
          </div>

          {/* Stat cards — stacked .sf-card with .sf-panel inside */}
          <div className="flex flex-col gap-4">
            {[
              { label: 'Total Value Locked', value: '$3.08M', sub: '+12.4% this week', up: true },
              { label: 'Total Volume 24h',   value: '$198.8K', sub: '-4.1% vs yesterday', up: false },
              { label: 'Active Pools',       value: '12',     sub: '3 new this month', up: true },
            ].map((stat) => (
              <div key={stat.label} className="sf-card-small px-5 py-4 flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">{stat.label}</p>
                <p className="text-2xl font-bold text-[color:var(--sf-text)]">{stat.value}</p>
                <p className={`text-xs font-medium ${stat.up ? 'text-emerald-400' : 'text-rose-400'}`}>{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 2: Input card + Activity list ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Input form card — .sf-card containing .sf-panel + .sf-input */}
          <div className="sf-card">
            <div className="px-5 py-4 border-b border-[color:var(--sf-row-border)]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40 mb-0.5">component</p>
              <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-card + .sf-panel + .sf-input</h2>
            </div>

            <div className="p-5 flex flex-col gap-4">

              {/* Search input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[color:var(--sf-text)]/60 uppercase tracking-wider">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search pools, tokens..."
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="sf-input w-full pl-9 pr-4 py-2.5 text-sm placeholder:text-[color:var(--sf-text)]/30"
                  />
                </div>
              </div>

              {/* Amount input with floating token selector — .sf-input wrapper pattern */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[color:var(--sf-text)]/60 uppercase tracking-wider">Amount</label>

                {/*
                  .sf-input on the wrapper div — the whole panel glows on :focus-within.
                  Token selector is absolute-positioned on top (z-10), sits "in front of" the field.
                  Inner <input> is bare (bg-transparent, no border, no outline).
                */}
                <div
                  className="sf-input p-4 cursor-text"
                  onClick={() => amountInputRef.current?.focus()}
                >
                  {/* Token selector — floats in front, absolute top-right */}
                  <div
                    className="absolute right-4 top-4 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setDropdownOpen((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none"
                    >
                      <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">{selectedToken}</span>
                      <ChevronDown
                        size={14}
                        className={`text-[color:var(--sf-text)]/60 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {dropdownOpen && (
                      <div className="sf-dropdown absolute right-0 top-full mt-1.5 z-50 w-36 py-1">
                        {tokens.map((token) => (
                          <button
                            key={token}
                            onClick={() => { setSelectedToken(token); setDropdownOpen(false); }}
                            className={`sf-row w-full px-4 py-2.5 text-left text-sm font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] ${
                              token === selectedToken
                                ? 'text-[color:var(--sf-primary)]'
                                : 'text-[color:var(--sf-text)]'
                            }`}
                          >
                            {token}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Label + input — padded right so text doesn't slide under the token button */}
                  <div className="pr-32 flex flex-col gap-1">
                    <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60">
                      Amount
                    </span>
                    <input
                      ref={amountInputRef}
                      type="number"
                      placeholder="0.00"
                      value={amountValue}
                      onChange={(e) => setAmountValue(e.target.value)}
                      className="text-xl font-bold placeholder:text-[color:var(--sf-text)]/20"
                    />
                    <p className="text-xs text-[color:var(--sf-text)]/40">Balance: 1,234.56 {selectedToken}</p>
                  </div>
                </div>
              </div>

              {/* Nested .sf-panel — info section */}
              <div className="sf-panel px-4 py-3 flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">.sf-panel — nested info</p>
                {[
                  ['Price impact', '0.12%'],
                  ['Estimated fee', '0.003 frBTC'],
                  ['Min. received', '997.2 DIESEL'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-xs text-[color:var(--sf-text)]/60">{label}</span>
                    <span className="text-xs font-semibold text-[color:var(--sf-text)]">{val}</span>
                  </div>
                ))}
              </div>

              <button className="w-full rounded-xl bg-[color:var(--sf-primary)] py-3 text-sm font-bold text-white transition-all duration-[200ms] hover:opacity-90 active:scale-[0.98]">
                Confirm Swap
              </button>
            </div>
          </div>

          {/* Activity list — .sf-card + .sf-row */}
          <div className="sf-card">
            <div className="px-5 py-4 border-b border-[color:var(--sf-row-border)]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40 mb-0.5">component</p>
              <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-card + .sf-row — Activity Feed</h2>
            </div>

            {ACTIVITY.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.detail} className="sf-row flex items-center gap-4 px-5 py-4 cursor-pointer">
                  <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--sf-primary)]/10">
                    <Icon size={16} className="text-[color:var(--sf-primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/40">{item.label}</p>
                    <p className="text-sm font-medium text-[color:var(--sf-text)] truncate">{item.detail}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-[color:var(--sf-text)]/40">{item.time}</span>
                </div>
              );
            })}

            <div className="px-5 py-4">
              <button className="w-full rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 bg-[color:var(--sf-panel-bg)] transition-all duration-[200ms] hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10">
                View all activity
              </button>
            </div>
          </div>
        </div>

        {/* ── Row 3: sf-tab-group + sf-tab-btn ── */}
        <div className="sf-card">
          <div className="sf-card-header">
            <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-tab-group + .sf-tab-btn</h2>
          </div>
          <div className="p-5 flex flex-col gap-6">

            {/* Standard blue tabs — Futures style */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">Standard (blue active)</p>
              <div className="sf-tab-group">
                {['futures', 'predictions', 'volatility'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`sf-tab-btn ${activeTab === tab ? 'sf-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand-coloured active — FIRE style */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">Brand override (orange active)</p>
              <div className="sf-tab-group" style={{ '--sf-tab-active-bg': '#f97316' } as React.CSSProperties}>
                {['dashboard', 'stake', 'bond', 'redeem'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`sf-tab-btn ${activeFireTab === tab ? 'sf-tab-btn--active' : ''}`}
                    onClick={() => setActiveFireTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Row 4: sf-card-header + sf-tile containers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Trending Pairs–style container */}
          <div className="sf-card">
            <div className="sf-card-header">
              <h3 className="text-base font-bold text-[color:var(--sf-text)]">Trending Pairs</h3>
              <a href="#" className="sf-card-header-action">View all</a>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {TABLE_ROWS.slice(0, 3).map((row) => (
                <div key={row.name} className="sf-tile p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-[color:var(--sf-text)]">{row.name}</span>
                    <span className={`text-xs font-bold ${row.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.apy}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[['TVL', row.tvl], ['Vol 24h', row.volume], ['Est. APY', row.apy]].map(([label, val]) => (
                      <div key={label} className={label === 'Est. APY' ? 'text-right' : label === 'Vol 24h' ? 'text-center' : ''}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{label}</div>
                        {label === 'Est. APY'
                          ? <span className="sf-badge-apy">{val}</span>
                          : <div className="font-bold text-[color:var(--sf-text)]">{val}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trending Vaults–style container */}
          <div className="sf-card">
            <div className="sf-card-header">
              <h3 className="text-base font-bold text-[color:var(--sf-text)]">Trending Vaults</h3>
              <a href="#" className="sf-card-header-action">View all</a>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: 'dxBTC', sub: 'BTC Yield', apy: '5.2%' },
                { name: 'FIRE', sub: 'Staking', apy: '42.1%' },
                { name: 'veDIESEL', sub: 'LP Boost', apy: '18.4%' },
              ].map((vault) => (
                <div key={vault.name} className="sf-tile p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-6 w-6 rounded-full bg-[color:var(--sf-primary)]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-[color:var(--sf-primary)]">{vault.name[0]}</span>
                    </div>
                    <span className="text-sm font-bold text-[color:var(--sf-text)]">{vault.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Type</div>
                      <div className="text-xs font-semibold text-[color:var(--sf-text)]">{vault.sub}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Hist.</div>
                      <div className="text-xs font-semibold text-[color:var(--sf-text)]">-</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Est.</div>
                      <span className="sf-badge-apy">{vault.apy}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 5: sf-popup-* ── */}
        <div className="sf-card">
          <div className="sf-card-header">
            <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-popup-overlay + .sf-popup + .sf-popup-header + .sf-popup-body + .sf-popup-row</h2>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-xs text-[color:var(--sf-text)]/60">
              Used for token selectors, confirmation dialogs, and any full-screen modal. Click the button to open an example.
            </p>
            <button
              type="button"
              onClick={() => { setPopupOpen(true); setPopupSearch(''); setSelectedPopupToken(null); }}
              className="self-start rounded-xl bg-[color:var(--sf-primary)] px-5 py-2.5 text-sm font-bold text-white transition-opacity duration-200 hover:opacity-90"
            >
              Open token selector
            </button>
          </div>
        </div>

        {/* Popup — rendered at root level so it covers the whole page */}
        {popupOpen && (
          <div
            className="sf-popup-overlay px-4"
            onClick={() => setPopupOpen(false)}
          >
            <div
              className="sf-popup w-full max-w-[480px] h-[72vh] max-h-[560px]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sf-popup-header px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
                    Select Token
                  </h2>
                  <button
                    type="button"
                    className="sf-popup-close"
                    onClick={() => setPopupOpen(false)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                {/* Search */}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search tokens..."
                    value={popupSearch}
                    onChange={(e) => setPopupSearch(e.target.value)}
                    className="sf-input w-full py-2.5 pl-9 pr-4 text-sm placeholder:text-[color:var(--sf-text)]/30"
                    autoFocus
                  />
                </div>
              </div>

              {/* Body — scrollable token list */}
              <div className="sf-popup-body px-4 py-3 flex flex-col gap-1.5">
                {['DIESEL', 'frBTC', 'USDT', 'ORDI', 'SATS', 'MEME']
                  .filter((t) => t.toLowerCase().includes(popupSearch.toLowerCase()))
                  .map((token) => {
                    const isSelected = token === selectedPopupToken;
                    return (
                      <button
                        key={token}
                        type="button"
                        onClick={() => { setSelectedPopupToken(token); setPopupOpen(false); }}
                        className={`sf-popup-row p-4 flex items-center gap-3 ${isSelected ? '!bg-[color:var(--sf-primary)]/10' : ''}`}
                      >
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[color:var(--sf-primary)]' : 'bg-[color:var(--sf-primary)]/20'}`}>
                          <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-[color:var(--sf-primary)]'}`}>{token[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[color:var(--sf-text)]">{token}</p>
                          <p className="text-xs text-[color:var(--sf-text)]/50">Bitcoin L1 · Alkane</p>
                        </div>
                        {isSelected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--sf-primary)] flex-shrink-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ── Row 6: Badge reference ── */}
        <div className="sf-card">
          <div className="px-5 py-4 border-b border-[color:var(--sf-row-border)]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40 mb-0.5">component</p>
            <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-badge-apy — APY Tag</h2>
          </div>
          <div className="p-5 flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">Vault APY</p>
              <span className="sf-badge-apy">5.2% APY</span>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">High yield</p>
              <span className="sf-badge-apy">42.1% APY</span>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40">On a card</p>
              <div className="sf-card-small flex items-center justify-between gap-8 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/40 mb-0.5">DIESEL / frBTC</p>
                  <p className="text-sm font-semibold text-[color:var(--sf-text)]">$1,240,000 TVL</p>
                </div>
                <span className="sf-badge-apy">18.4% APY</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 7: Colour + typography reference ── */}

        <div className="sf-card">
          <div className="px-5 py-4 border-b border-[color:var(--sf-row-border)]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--sf-text)]/40 mb-0.5">component</p>
            <h2 className="text-sm font-bold text-[color:var(--sf-text)]">.sf-panel — Colour & Typography Tokens</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Color swatches */}
            {[
              { label: '--sf-primary',  bg: 'bg-[color:var(--sf-primary)]',        text: 'text-white' },
              { label: '--sf-text',     bg: 'bg-[color:var(--sf-text)]',            text: 'text-[color:var(--sf-surface)]' },
              { label: '--sf-surface',  bg: 'bg-[color:var(--sf-surface)]',         text: 'text-[color:var(--sf-text)]' },
              { label: '--sf-glass-bg', bg: 'bg-[color:var(--sf-glass-bg)]', text: 'text-[color:var(--sf-text)]' },
            ].map((swatch) => (
              <div key={swatch.label} className="sf-panel p-4 flex flex-col gap-3">
                <div className={`h-10 rounded-lg ${swatch.bg} ${swatch.text} flex items-center justify-center`}>
                  <span className="text-[10px] font-mono font-bold">{swatch.label}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-base font-bold text-[color:var(--sf-text)]">Heading</p>
                  <p className="text-sm text-[color:var(--sf-text)]/70">Body text at 70%</p>
                  <p className="text-xs text-[color:var(--sf-text)]/40 uppercase tracking-wider font-bold">Label</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </PageContent>
  );
}
