'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Check, ChevronDown } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { AddressType } from '@alkanes/ts-sdk';
import AddressAvatar from './AddressAvatar';

const ADDRESS_INDEX_KEY = 'subfrost_taproot_address_index';
const ACCOUNT_LIST_KEY = 'subfrost_known_account_indices';
const MAX_ACCOUNTS = 10;

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
}

export default function AccountSwitcher({ size = 24, className = '' }: AccountSwitcherProps) {
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
    const next = (knownIndices[knownIndices.length - 1] ?? -1) + 1;
    if (next >= MAX_ACCOUNTS) return;
    const updated = [...knownIndices, next].sort((a, b) => a - b);
    setKnownIndices(updated);
    saveKnownIndices(updated);
    switchTo(next);
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
        <div className="absolute left-0 top-full z-50 mt-2 w-[280px] overflow-hidden rounded-xl bg-[color:var(--sf-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] border border-[color:var(--sf-outline)]">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-[color:var(--sf-text)]/40 border-b border-[color:var(--sf-outline)]">
            Accounts
          </div>
          <div className="max-h-[280px] overflow-y-auto no-scrollbar">
            {accounts.map(({ idx, address }) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => switchTo(idx)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[200ms] ${
                    isActive ? 'bg-[color:var(--sf-primary)]/5' : ''
                  }`}
                >
                  <AddressAvatar address={address} size={28} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[color:var(--sf-text)]">
                      Account {idx}
                    </div>
                    <div className="text-[11px] text-[color:var(--sf-text)]/50 truncate font-mono">
                      {truncate(address)}
                    </div>
                  </div>
                  {isActive && (
                    <Check size={16} className="shrink-0 text-[color:var(--sf-primary)]" />
                  )}
                </button>
              );
            })}
          </div>
          {knownIndices.length < MAX_ACCOUNTS && (
            <button
              type="button"
              onClick={addAccount}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-[color:var(--sf-outline)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[200ms] text-[color:var(--sf-primary)] text-sm font-medium"
            >
              <Plus size={16} />
              Add Account
            </button>
          )}
        </div>
      )}
    </div>
  );
}
