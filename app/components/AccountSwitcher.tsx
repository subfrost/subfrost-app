'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Check, ChevronDown, X, Hash } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { AddressType } from '@alkanes/ts-sdk';
import AddressAvatar from './AddressAvatar';

const ADDRESS_INDEX_KEY = 'subfrost_taproot_address_index';
const ACCOUNT_LIST_KEY = 'subfrost_known_account_indices';

// No artificial cap. BIP86 allows 2^31 indices; the previous 10-account
// limit was a placeholder. The list virtualizes via `max-h overflow-y`
// and a "Jump to index" input lets power users hop without clicking
// Add many times.
// Sanity ceiling only — prevents accidental UI lock-up if someone types
// a huge number. BIP86 standard wallets index in the thousands at most.
const MAX_INDEX = 1_000_000;

function loadKnownIndices(): number[] {
  if (typeof localStorage === 'undefined') return [0];
  try {
    const raw = localStorage.getItem(ACCOUNT_LIST_KEY);
    if (!raw) return [0];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [0];
    const filtered = parsed
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
    return filtered.length > 0 ? filtered : [0];
  } catch {
    return [0];
  }
}

function saveKnownIndices(indices: number[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(indices));
}

interface AccountSwitcherProps {
  size?: number;
  className?: string;
  menuAlign?: 'left' | 'right';
}

export default function AccountSwitcher({ size = 24, className = '', menuAlign = 'left' }: AccountSwitcherProps) {
  const { wallet, walletType, address: currentAddress } = useWallet() as any;
  const [open, setOpen] = useState(false);
  const [knownIndices, setKnownIndices] = useState<number[]>(() => loadKnownIndices());
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return 0;
    return parseInt(localStorage.getItem(ADDRESS_INDEX_KEY) || '0', 10) || 0;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync activeIndex with localStorage on derivation-changed
  useEffect(() => {
    const handler = () => {
      const idx = parseInt(localStorage.getItem(ADDRESS_INDEX_KEY) || '0', 10) || 0;
      setActiveIndex(idx);
    };
    window.addEventListener('derivation-changed', handler);
    return () => window.removeEventListener('derivation-changed', handler);
  }, []);

  // Ensure activeIndex is in knownIndices (e.g. user set it via Settings)
  useEffect(() => {
    if (!knownIndices.includes(activeIndex)) {
      const next = [...knownIndices, activeIndex].sort((a, b) => a - b);
      setKnownIndices(next);
      saveKnownIndices(next);
    }
  }, [activeIndex, knownIndices]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Derive address for a given index using the SDK wallet shim.
  // Shim signature: deriveAddress(type, account /* unused */, index)
  const deriveAddressAt = (index: number): string => {
    if (!wallet) return '';
    try {
      const info = wallet.deriveAddress(AddressType.P2TR, 0, index);
      return info?.address || '';
    } catch {
      return '';
    }
  };

  const accounts = useMemo(
    () => knownIndices.map((idx) => ({ idx, address: deriveAddressAt(idx) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownIndices, wallet],
  );

  const switchTo = (idx: number) => {
    localStorage.setItem(ADDRESS_INDEX_KEY, String(idx));
    window.dispatchEvent(new CustomEvent('derivation-changed'));
    setActiveIndex(idx);
    setOpen(false);
  };

  const addAccount = () => {
    const sorted = [...knownIndices].sort((a, b) => a - b);
    let next = 0;
    for (const idx of sorted) {
      if (idx === next) next++;
      else if (idx > next) break;
    }
    if (next > MAX_INDEX) return;
    const updated = [...knownIndices, next].sort((a, b) => a - b);
    setKnownIndices(updated);
    saveKnownIndices(updated);
    switchTo(next);
  };

  const jumpToIndex = (raw: string) => {
    const idx = parseInt(raw, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx > MAX_INDEX) return;
    const updated = knownIndices.includes(idx)
      ? knownIndices
      : [...knownIndices, idx].sort((a, b) => a - b);
    if (updated !== knownIndices) {
      setKnownIndices(updated);
      saveKnownIndices(updated);
    }
    switchTo(idx);
  };

  const removeAccount = (idx: number) => {
    if (idx === activeIndex) return;
    if (knownIndices.length <= 1) return;
    const updated = knownIndices.filter((i) => i !== idx);
    setKnownIndices(updated);
    saveKnownIndices(updated);
  };

  // Only show switcher for keystore wallets — browser wallets have their own
  // account management via the extension popup.
  if (walletType !== 'keystore') {
    return <AddressAvatar address={currentAddress || ''} size={size} className={className} />;
  }

  const truncate = (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none p-0.5"
        title="Switch account"
      >
        <AddressAvatar address={currentAddress || ''} size={size} />
        <ChevronDown
          size={12}
          className={`text-[color:var(--sf-text)]/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className={`absolute top-full z-50 mt-1 w-[280px] overflow-hidden rounded-xl bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${menuAlign === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-[color:var(--sf-text)]/40">
            Accounts
          </div>
          <div className="max-h-[280px] overflow-y-auto no-scrollbar">
            {accounts.map(({ idx, address }) => {
              const isActive = idx === activeIndex;
              const canRemove = !isActive && knownIndices.length > 1;
              return (
                <div
                  key={idx}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                    isActive
                      ? 'bg-[color:var(--sf-primary)]/10'
                      : 'hover:bg-[color:var(--sf-primary)]/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => switchTo(idx)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <AddressAvatar address={address} size={28} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-medium ${isActive ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}>
                          Account {idx}
                        </span>
                        {isActive && (
                          <Check size={14} className="shrink-0 text-[color:var(--sf-primary)]" />
                        )}
                      </div>
                      <div className="text-[11px] text-[color:var(--sf-text)]/50 truncate font-mono">
                        {truncate(address)}
                      </div>
                    </div>
                  </button>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAccount(idx);
                      }}
                      className="shrink-0 p-1 rounded hover:bg-[color:var(--sf-text)]/10 text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]"
                      title="Hide account"
                      aria-label={`Hide Account ${idx}`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addAccount}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-primary)] text-sm font-medium"
          >
            <Plus size={16} />
            Add Account
          </button>
          <div className="border-t border-[color:var(--sf-outline)]/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const raw = String(fd.get('idx') || '');
                jumpToIndex(raw);
                e.currentTarget.reset();
              }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Hash size={14} className="text-[color:var(--sf-text)]/50 shrink-0" />
              <input
                name="idx"
                type="number"
                min={0}
                max={MAX_INDEX}
                placeholder="Jump to index…"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono placeholder:text-[color:var(--sf-text)]/40"
                aria-label="Jump to account index"
              />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
