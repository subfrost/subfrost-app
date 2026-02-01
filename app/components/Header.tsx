"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useEnrichedWalletData } from "@/hooks/useEnrichedWalletData";
import { Copy, Check } from "lucide-react";
import AddressAvatar from "./AddressAvatar";
import ThemeToggle from "./ThemeToggle";
import LanguageToggle from "./LanguageToggle";
import { useTranslation } from "@/hooks/useTranslation";

const FallingSnowflakes = memo(function FallingSnowflakes({
  white = false,
}: {
  white?: boolean;
}) {
  const snowflakes = useMemo(() => {
    const positions = [15, 30, 45, 60, 75, 90];
    const delays = [0, 1, 2, 3, 4, 5];
    const durations = [5.5, 6.5, 7, 6, 5.8, 6.2];
    const sizes = [12, 14, 11, 13, 12, 10];

    return Array.from({ length: 6 }, (_, i) => ({
      id: i,
      left: positions[i],
      delay: delays[i],
      duration: durations[i],
      size: sizes[i],
    }));
  }, []);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
           @keyframes snowfall {
             0% {
               transform: translateY(-30px) rotate(0deg);
               opacity: 0;
             }
             10% {
               opacity: 1;
             }
             90% {
               opacity: 1;
             }
             100% {
               transform: translateY(80px) rotate(360deg);
               opacity: 0;
             }
           }
         `,
        }}
      />
      {snowflakes.map((flake) => (
        <Image
          key={flake.id}
          src="/brand/snowflake-mark.svg"
          alt=""
          width={flake.size}
          height={flake.size}
          className="pointer-events-none absolute"
          style={{
            left: `${flake.left}%`,
            top: "-10px",
            opacity: 0,
            animation: `snowfall ${flake.duration}s linear ${flake.delay}s infinite`,
            filter: white
              ? "brightness(0) invert(1)"
              : "drop-shadow(0 0 2px rgba(255,255,255,0.8)) brightness(1.5)",
          }}
        />
      ))}
    </>
  );
});

export default function Header() {
  const {
    connected,
    isConnected,
    address,
    onConnectModalOpenChange,
    disconnect,
    account,
  } = useWallet() as any;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { balances, isLoading: isBalanceLoading } = useEnrichedWalletData();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const mobileWalletRef = useRef<HTMLDivElement | null>(null);
  const menuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const truncate = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const walletConnected =
    typeof connected === "boolean" ? connected : isConnected;
  const btcBalance = balances?.bitcoin?.total
    ? (balances.bitcoin.total / 1e8).toFixed(5)
    : "0.00000";

  const copyToClipboard = useCallback(async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedAddress(type);
    setTimeout(() => setCopiedAddress(null), 2000);
  }, []);

  const isActive = useCallback(
    (path: string) => {
      if (path === "/") {
        return pathname === "/";
      }
      return pathname.startsWith(path);
    },
    [pathname],
  );

  const handleMenuMouseEnter = useCallback(() => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
      menuCloseTimeoutRef.current = null;
    }
    setMenuOpen(true);
  }, []);

  const handleMenuMouseLeave = useCallback(() => {
    menuCloseTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (menuCloseTimeoutRef.current) {
        clearTimeout(menuCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const isInsideDesktop = menuRootRef.current?.contains(target);
      const isInsideMobile = mobileWalletRef.current?.contains(target);
      if (!isInsideDesktop && !isInsideMobile) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, {
      passive: true,
    } as any);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as any);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <>
      {/* Mobile Fixed Header - Logo and connect wallet button */}
      <header className="fixed top-0 left-0 right-0 z-50 md:hidden bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.05)]">
        <div className="relative flex h-[58px] w-full items-center justify-between px-5">
          {/* Brand */}
          <a
            href="https://subfrost.io"
            className="flex items-center select-none"
            aria-label="Subfrost Home"
          >
            <Image
              src="/brand/subfrost-wordmark.svg"
              alt="SUBFROST wordmark"
              width={180}
              height={24}
              priority
              className="hover:opacity-80 h-8 w-auto sf-wordmark"
            />
          </a>

          <div className="ml-auto flex items-center gap-4">
            <LanguageToggle />
            <ThemeToggle />
            {walletConnected ? (
              <div className="relative" ref={mobileWalletRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full bg-[color:var(--sf-panel-bg)] px-3 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
                >
                  <AddressAvatar
                    address={address}
                    size={20}
                    className="shrink-0"
                  />
                  <span className="text-sm font-semibold text-[color:var(--sf-text)]">
                    {isBalanceLoading ? "..." : btcBalance} BTC
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/95 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                    {account?.nativeSegwit?.address && (
                      <div className="px-4 py-3 border-b border-[color:var(--sf-glass-border)]">
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">
                          {t("header.nativeSegwit")}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[color:var(--sf-text)]">
                            {truncate(account.nativeSegwit.address)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                account.nativeSegwit.address,
                                "segwit",
                              )
                            }
                            className="p-1 rounded hover:bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]"
                          >
                            {copiedAddress === "segwit" ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    {account?.taproot?.address && (
                      <div className="px-4 py-3 border-b border-[color:var(--sf-glass-border)]">
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">
                          {t("header.taproot")}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[color:var(--sf-text)]">
                            {truncate(account.taproot.address)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                account.taproot.address,
                                "taproot",
                              )
                            }
                            className="p-1 rounded hover:bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]"
                          >
                            {copiedAddress === "taproot" ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    <Link
                      href="/wallet?tab=balances"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10"
                    >
                      {t("header.balances")}
                    </Link>
                    <Link
                      href="/wallet?tab=transactions"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10"
                    >
                      {t("header.transactionHistory")}
                    </Link>
                    <Link
                      href="/wallet?tab=settings"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)]"
                    >
                      {t("header.settings")}
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await disconnect();
                        } catch (e) {
                          // noop
                        } finally {
                          setMenuOpen(false);
                        }
                      }}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-[color:var(--sf-primary)]/10"
                    >
                      {t("header.disconnectWallet")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onConnectModalOpenChange(true)}
                className="relative rounded-lg bg-[color:var(--sf-panel-bg)] px-6 py-2 text-sm font-semibold text-[color:var(--sf-text)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] overflow-hidden whitespace-nowrap min-w-[148px] text-center"
              >
                <span className="relative z-10">
                  {t("header.connectWallet")}
                </span>
                <div className="absolute inset-0 pointer-events-none">
                  <FallingSnowflakes white={theme === "dark"} />
                </div>
              </button>
            )}
          </div>
        </div>
      </header>
      {/* Spacer for mobile fixed header */}
      <div className="h-[58px] md:hidden" />

      {/* Desktop Header */}
      <header className="relative z-50 w-full bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.05)] hidden md:block">
        <div className="relative flex h-[58px] w-full items-center px-5">
          {/* Brand */}
          <a
            href="https://subfrost.io"
            className="flex items-center select-none"
            aria-label="Subfrost Home"
          >
            <Image
              src="/brand/subfrost-wordmark.svg"
              alt="SUBFROST wordmark"
              width={180}
              height={24}
              priority
              className=" hover:opacity-80 h-8 w-auto sf-wordmark"
            />
          </a>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-4 md:flex ml-4">
            <Link
              href="/"
              className={`text-sm font-semibold hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                isActive("/")
                  ? theme === "light"
                    ? "text-[color:var(--sf-text)]/60"
                    : "text-[color:var(--sf-primary)]"
                  : "text-[color:var(--sf-text)]"
              }`}
            >
              {t("nav.home")}
            </Link>
            <Link
              href="/swap"
              className={`text-sm font-semibold hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                isActive("/swap")
                  ? theme === "light"
                    ? "text-[color:var(--sf-text)]/60"
                    : "text-[color:var(--sf-primary)]"
                  : "text-[color:var(--sf-text)]"
              }`}
            >
              {t("nav.swap")}
            </Link>
            <Link
              href="/vaults"
              className={`text-sm font-semibold hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                isActive("/vaults")
                  ? theme === "light"
                    ? "text-[color:var(--sf-text)]/60"
                    : "text-[color:var(--sf-primary)]"
                  : "text-[color:var(--sf-text)]"
              }`}
            >
              {t("nav.vaults")}
            </Link>
            <Link
              href="/futures"
              className={`text-sm font-semibold hover:opacity-80 outline-none whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                isActive("/futures")
                  ? theme === "light"
                    ? "text-[color:var(--sf-text)]/60"
                    : "text-[color:var(--sf-primary)]"
                  : "text-[color:var(--sf-text)]"
              }`}
            >
              {t("nav.futures")}
            </Link>
          </nav>

          {/* Desktop CTA */}
          <div
            className="ml-auto relative hidden md:flex items-center gap-4"
            ref={menuRootRef}
          >
            <LanguageToggle />
            <ThemeToggle />
            {walletConnected ? (
              <div
                onMouseEnter={handleMenuMouseEnter}
                onMouseLeave={handleMenuMouseLeave}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full bg-[color:var(--sf-panel-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--sf-text)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
                >
                  <AddressAvatar address={address} size={24} />
                  <span className="hidden sm:inline">
                    {isBalanceLoading ? "..." : btcBalance} BTC
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border-none bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                    {account?.nativeSegwit?.address && (
                      <div className="px-4 py-3 border-b border-[color:var(--sf-glass-border)]">
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">
                          {t("header.nativeSegwit")}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[color:var(--sf-text)]">
                            {truncate(account.nativeSegwit.address)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                account.nativeSegwit.address,
                                "segwit",
                              )
                            }
                            className="p-1 rounded hover:bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]"
                          >
                            {copiedAddress === "segwit" ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    {account?.taproot?.address && (
                      <div className="px-4 py-3 border-b border-[color:var(--sf-glass-border)]">
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">
                          {t("header.taproot")}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[color:var(--sf-text)]">
                            {truncate(account.taproot.address)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                account.taproot.address,
                                "taproot",
                              )
                            }
                            className="p-1 rounded hover:bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]"
                          >
                            {copiedAddress === "taproot" ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    <Link
                      href="/wallet?tab=balances"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10"
                    >
                      {t("header.balances")}
                    </Link>
                    <Link
                      href="/wallet?tab=transactions"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10"
                    >
                      {t("header.transactionHistory")}
                    </Link>
                    <Link
                      href="/wallet?tab=settings"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)]"
                    >
                      {t("header.settings")}
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await disconnect();
                        } catch (e) {
                          // noop
                        } finally {
                          setMenuOpen(false);
                        }
                      }}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-[color:var(--sf-primary)]/10"
                    >
                      {t("header.disconnectWallet")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => onConnectModalOpenChange(true)}
                  className="relative rounded-lg bg-[color:var(--sf-panel-bg)] px-6 py-2 text-sm font-semibold text-[color:var(--sf-text)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] overflow-hidden whitespace-nowrap min-w-[148px] text-center"
                >
                  <span className="relative z-10">
                    {t("header.connectWallet")}
                  </span>
                  <div className="absolute inset-0 pointer-events-none">
                    <FallingSnowflakes white={theme === "dark"} />
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
