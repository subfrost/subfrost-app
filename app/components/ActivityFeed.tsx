"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  useInfiniteAmmTxHistory,
  AmmTransactionType,
} from "@/hooks/useAmmHistory";
import { useTokenDisplayMap } from "@/hooks/useTokenDisplayMap";
import TokenIcon from "@/app/components/TokenIcon";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useWallet } from "@/context/WalletContext";

type AmmRow =
  | {
      type: "swap";
      soldAmount: string;
      boughtAmount: string;
      poolBlockId: string;
      poolTxId: string;
      timestamp: string;
      transactionId: string;
      soldTokenBlockId: string;
      soldTokenTxId: string;
      boughtTokenBlockId: string;
      boughtTokenTxId: string;
      address?: string;
      sellerAddress?: string;
    }
  | {
      type: "mint";
      token0Amount: string;
      token1Amount: string;
      lpTokenAmount: string;
      poolBlockId: string;
      poolTxId: string;
      timestamp: string;
      transactionId: string;
      token0BlockId: string;
      token0TxId: string;
      token1BlockId: string;
      token1TxId: string;
      address?: string;
      minterAddress?: string;
    }
  | {
      type: "burn";
      token0Amount: string;
      token1Amount: string;
      lpTokenAmount: string;
      poolBlockId: string;
      poolTxId: string;
      timestamp: string;
      transactionId: string;
      token0BlockId: string;
      token0TxId: string;
      token1BlockId: string;
      token1TxId: string;
      address?: string;
      burnerAddress?: string;
    }
  | {
      type: "creation";
      token0Amount: string;
      token1Amount: string;
      tokenSupply: string;
      poolBlockId: string;
      poolTxId: string;
      timestamp: string;
      transactionId: string;
      token0BlockId: string;
      token0TxId: string;
      token1BlockId: string;
      token1TxId: string;
      address?: string;
      creatorAddress?: string;
    }
  | {
      type: "wrap";
      address?: string;
      transactionId: string;
      timestamp: string;
      amount: string;
    }
  | {
      type: "unwrap";
      address?: string;
      transactionId: string;
      timestamp: string;
      amount: string;
    };

function formatAmount(raw: string, decimals = 8, tokenSymbol?: string) {
  const n = Number(raw ?? "0");
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return "0";

  // Use 4 decimals for BTC/frBTC, 2 for other tokens
  const fractionDigits =
    tokenSymbol === "BTC" || tokenSymbol === "frBTC" ? 4 : 2;

  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${Math.pow(10, -fractionDigits).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
}

function truncateAddress(addr: string, prefixSize = 6, suffixSize?: number) {
  if (!addr) return "";
  const suffix = suffixSize ?? prefixSize;
  if (addr.length <= prefixSize + suffix + 3) return addr;
  return `${addr.slice(0, prefixSize)}...${addr.slice(-suffix)}`;
}

function PairIcon({
  leftId,
  rightId,
  leftSymbol,
  rightSymbol,
  network,
}: {
  leftId?: string;
  rightId?: string;
  leftSymbol?: string;
  rightSymbol?: string;
  network?: string;
}) {
  return (
    <div className="relative h-8 w-12">
      <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-transparent flex items-center justify-center overflow-hidden">
        <TokenIcon
          id={leftId}
          symbol={leftSymbol || (leftId ?? "")}
          size="md"
          network={network as any}
        />
      </div>
      <div className="absolute right-0 top-0 h-8 w-8 rounded-full bg-transparent flex items-center justify-center overflow-hidden">
        <TokenIcon
          id={rightId}
          symbol={rightSymbol || (rightId ?? "")}
          size="md"
          network={network as any}
        />
      </div>
    </div>
  );
}

function LineSkeleton({ widthClass = "w-24" }: { widthClass?: string }) {
  return (
    <div
      className={`h-3 rounded bg-[color:var(--sf-row-border)]/60 animate-pulse ${widthClass}`}
    />
  );
}

export default function ActivityFeed({
  isFullPage = false,
  maxHeightClass,
}: {
  isFullPage?: boolean;
  maxHeightClass?: string;
}) {
  const { t } = useTranslation();
  const { isConnected, account, onConnectModalOpenChange, network } = useWallet();

  const TX_FILTER_OPTIONS: {
    value: AmmTransactionType | "all";
    label: string;
  }[] = [
    { value: "all", label: t("activity.allTypes") },
    { value: "swap", label: t("activity.swaps") },
    { value: "mint", label: t("activity.supply") },
    { value: "burn", label: t("activity.withdraw") },
    { value: "creation", label: t("activity.createPool") },
    { value: "wrap", label: t("activity.wrap") },
    { value: "unwrap", label: t("activity.unwrap") },
  ];

  const [txFilter, setTxFilter] = useState<AmmTransactionType | "all">("all");
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [myWalletOnly, setMyWalletOnly] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const walletAddress = isConnected
    ? account.taproot?.address || account.nativeSegwit?.address
    : undefined;

  const handleMyWalletToggle = useCallback(() => {
    if (isConnected) {
      setMyWalletOnly((v) => !v);
    } else {
      onConnectModalOpenChange(true);
    }
  }, [isConnected, onConnectModalOpenChange]);

  const { data, isFetchingNextPage, fetchNextPage, hasNextPage, isLoading } =
    useInfiniteAmmTxHistory({
      address: myWalletOnly ? walletAddress : undefined,
      count: 50,
      enabled: true,
      transactionType: txFilter === "all" ? undefined : txFilter,
    });

  // Filter items to only show transactions from whitelisted pools (mainnet only)
  const allItems: AmmRow[] = (data?.pages ?? []).flatMap(
    (p) => p.items as AmmRow[],
  );
  // Show all pool transactions on every network
  const items = allItems;
  const tokenIds = useMemo(() => {
    const out = new Set<string>();
    items.forEach((row) => {
      if (row.type === "swap") {
        out.add(`${row.soldTokenBlockId}:${row.soldTokenTxId}`);
        out.add(`${row.boughtTokenBlockId}:${row.boughtTokenTxId}`);
      } else if (
        row.type === "mint" ||
        row.type === "burn" ||
        row.type === "creation"
      ) {
        const r: any = row;
        out.add(`${r.token0BlockId}:${r.token0TxId}`);
        out.add(`${r.token1BlockId}:${r.token1TxId}`);
      }
    });
    return Array.from(out);
  }, [items]);
  const {
    data: displayMap,
    isLoading: namesLoading,
    isFetching: namesFetching,
  } = useTokenDisplayMap(tokenIds);

  const loadingRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadingRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Close filter dropdown on click outside
  useEffect(() => {
    if (!filterDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(e.target as Node)
      ) {
        setFilterDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [filterDropdownOpen]);

  // Known token ID to name mappings for fallback
  const KNOWN_TOKEN_NAMES: Record<string, string> = {
    "32:0": "frBTC",
    "2:0": "DIESEL",
    "2:56801": "bUSD",
    btc: "BTC",
    frbtc: "frBTC",
  };

  const getName = (id: string | undefined) => {
    if (!id) return "";
    const d = displayMap?.[id];
    // Prefer fetched display names, then known aliases; avoid showing raw ids until resolved.
    return d?.name || d?.symbol || KNOWN_TOKEN_NAMES[id] || "";
  };

  const nameResolved = (id: string | undefined) => {
    if (!id) return false;
    if (KNOWN_TOKEN_NAMES[id]) return true;
    const d = displayMap?.[id];
    return Boolean(d && (d.name || d.symbol));
  };
  const namesPending = namesLoading || namesFetching || !displayMap;

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[color:var(--sf-text)]">
              {t("activity.globalActivity")}
            </h3>
            <div className="relative" ref={filterDropdownRef}>
              <button
                type="button"
                onClick={() => setFilterDropdownOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md bg-transparent px-2 py-1 text-sm text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
              >
                {TX_FILTER_OPTIONS.find((o) => o.value === txFilter)?.label ??
                  t("activity.allTypes")}
                <ChevronDown
                  size={14}
                  className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                    filterDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {filterDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                  {TX_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTxFilter(option.value);
                        setFilterDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-1.5 text-left text-sm font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                        txFilter === option.value
                          ? "bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]"
                          : "text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleMyWalletToggle}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none group"
              >
                <span className="text-sm text-[color:var(--sf-text)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
                  {t("activity.myWallet")}
                </span>
                <div
                  className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                    myWalletOnly
                      ? "bg-[color:var(--sf-primary)] border-[color:var(--sf-primary)]"
                      : "border-[color:var(--sf-text)]/30 group-hover:border-[color:var(--sf-primary)]/60"
                  }`}
                >
                  {myWalletOnly && (
                    <svg
                      width="10"
                      height="8"
                      viewBox="0 0 10 8"
                      fill="none"
                      className="text-white"
                    >
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </button>
            </div>
          </div>
          {!isFullPage ? (
            <Link
              href="/activity"
              className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            >
              {t("activity.viewAll")}
            </Link>
          ) : (
            <Link
              href="/"
              className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            >
              {t("activity.back")}
            </Link>
          )}
        </div>
      </div>

      {/* Column Headers */}
      {/* Mobile header (xs only) - 3 columns */}
      <div className="sm:hidden grid grid-cols-[0.6fr_1fr_auto] gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 border-b border-[color:var(--sf-row-border)]">
        <div>{t("activity.txn")}</div>
        <div>{t("activity.pair")}</div>
        <div className="text-right">{t("activity.amounts")}</div>
      </div>
      {/* Desktop header (sm+) - 5 columns */}
      <div className="hidden sm:grid sm:grid-cols-[minmax(60px,0.8fr)_minmax(120px,1.2fr)_minmax(100px,1.2fr)_minmax(80px,1fr)_minmax(70px,0.8fr)] lg:grid-cols-[minmax(80px,1fr)_minmax(160px,1.5fr)_minmax(120px,1.2fr)_minmax(90px,1fr)_minmax(80px,1fr)] xl:grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] gap-2 lg:gap-3 xl:gap-4 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 border-b border-[color:var(--sf-row-border)]">
        <div>{t("activity.txn")}</div>
        <div>{t("activity.pair")}</div>
        <div className="text-right">{t("activity.amounts")}</div>
        <div className="text-right">{t("activity.address")}</div>
        <div className="text-right">{t("activity.time")}</div>
      </div>

      <div
        className={`no-scrollbar overflow-auto ${
          isFullPage
            ? "max-h-[calc(100vh-200px)]"
            : maxHeightClass ?? "max-h-[70vh]"
        }`}
      >
        <div className="sm:min-w-fit">
          {/* Rows */}
          {items.map((row, idx) => {
            const time = new Date(row.timestamp);
            const timeLabel = new Intl.DateTimeFormat(undefined, {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(time);
            // Separate date and time for responsive display
            const dateLabel = new Intl.DateTimeFormat(undefined, {
              month: "2-digit",
              day: "2-digit",
            }).format(time);
            const hourMinLabel = new Intl.DateTimeFormat(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(time);
            const address =
              (row as any).address ||
              (row as any).sellerAddress ||
              (row as any).minterAddress ||
              (row as any).burnerAddress ||
              (row as any).creatorAddress ||
              "";

            const typeLabel =
              row.type === "swap"
                ? t("myActivity.swap")
                : row.type === "mint"
                ? t("myActivity.supply")
                : row.type === "burn"
                ? t("myActivity.withdraw")
                : row.type === "creation"
                ? t("myActivity.create")
                : row.type === "wrap"
                ? t("myActivity.wrap")
                : t("myActivity.unwrap");

            const pairNames = (() => {
              if (row.type === "swap") {
                const leftId = `${row.soldTokenBlockId}:${row.soldTokenTxId}`;
                const rightId = `${row.boughtTokenBlockId}:${row.boughtTokenTxId}`;
                return {
                  leftId,
                  rightId,
                  leftName: getName(leftId),
                  rightName: getName(rightId),
                };
              } else if (
                row.type === "mint" ||
                row.type === "burn" ||
                row.type === "creation"
              ) {
                const r: any = row;
                const leftId = `${r.token0BlockId}:${r.token0TxId}`;
                const rightId = `${r.token1BlockId}:${r.token1TxId}`;
                return {
                  leftId,
                  rightId,
                  leftName: getName(leftId),
                  rightName: getName(rightId),
                };
              } else {
                return {
                  leftId: "btc",
                  rightId: "frbtc",
                  leftName: row.type === "wrap" ? "BTC" : "frBTC",
                  rightName: row.type === "wrap" ? "frBTC" : "BTC",
                };
              }
            })();
            const pairLoaded =
              !namesPending &&
              nameResolved(pairNames.leftId) &&
              nameResolved(pairNames.rightId);

            return (
              <Link
                key={(row as any).transactionId + "-" + idx}
                href={`https://espo.sh/tx/${(row as any).transactionId}`}
                target="_blank"
                className="block px-6 py-4 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-row-border)]"
              >
                {/* Mobile layout (xs only) - 2 rows */}
                <div className="sm:hidden">
                  {/* Row 1: Txn, Pair, Amounts */}
                  <div className="grid grid-cols-[0.6fr_1fr_auto] items-center gap-2">
                    <div className="text-sm text-[color:var(--sf-text)]/80">
                      {typeLabel}
                    </div>

                    <div className="flex flex-col gap-1">
                      <PairIcon
                        leftId={pairNames.leftId}
                        rightId={pairNames.rightId}
                        leftSymbol={pairNames.leftName}
                        rightSymbol={pairNames.rightName}
                        network={network}
                      />
                      <div className="min-w-0">
                        {pairLoaded ? (
                          <div className="truncate text-sm text-[color:var(--sf-text)]">
                            {row.type === "mint" || row.type === "burn"
                              ? `${pairNames.leftName} / ${pairNames.rightName}`
                              : row.type === "wrap" ||
                                row.type === "unwrap" ||
                                row.type === "swap"
                              ? `${pairNames.leftName} → ${pairNames.rightName}`
                              : `${pairNames.leftName} · ${pairNames.rightName}`}
                          </div>
                        ) : (
                          <LineSkeleton widthClass="w-32" />
                        )}
                      </div>
                    </div>

                    <div className="text-right text-xs text-[color:var(--sf-text)]">
                      {!pairLoaded ? (
                        <div className="space-y-1">
                          <LineSkeleton widthClass="w-20 ml-auto" />
                          <LineSkeleton widthClass="w-20 ml-auto" />
                        </div>
                      ) : (
                        <>
                          {row.type === "swap" && (
                            <>
                              <div>
                                -{" "}
                                {formatAmount(
                                  row.soldAmount,
                                  8,
                                  pairNames.leftName,
                                )}{" "}
                                {pairNames.leftName}
                              </div>
                              <div className="text-green-500">
                                +{" "}
                                {formatAmount(
                                  row.boughtAmount,
                                  8,
                                  pairNames.rightName,
                                )}{" "}
                                {pairNames.rightName}
                              </div>
                            </>
                          )}
                          {row.type === "mint" && (
                            <>
                              <div>
                                -{" "}
                                {formatAmount(
                                  (row as any).token0Amount,
                                  8,
                                  pairNames.leftName,
                                )}{" "}
                                {pairNames.leftName}
                              </div>
                              <div>
                                -{" "}
                                {formatAmount(
                                  (row as any).token1Amount,
                                  8,
                                  pairNames.rightName,
                                )}{" "}
                                {pairNames.rightName}
                              </div>
                            </>
                          )}
                          {(row.type === "burn" || row.type === "creation") && (
                            <>
                              <div className="text-green-500">
                                +{" "}
                                {formatAmount(
                                  (row as any).token0Amount,
                                  8,
                                  pairNames.leftName,
                                )}{" "}
                                {pairNames.leftName}
                              </div>
                              <div className="text-green-500">
                                +{" "}
                                {formatAmount(
                                  (row as any).token1Amount,
                                  8,
                                  pairNames.rightName,
                                )}{" "}
                                {pairNames.rightName}
                              </div>
                            </>
                          )}
                          {row.type === "wrap" && (
                            <>
                              <div>
                                - {formatAmount((row as any).amount, 8, "BTC")}{" "}
                                BTC
                              </div>
                              <div className="text-green-500">
                                +{" "}
                                {formatAmount((row as any).amount, 8, "frBTC")}{" "}
                                frBTC
                              </div>
                            </>
                          )}
                          {row.type === "unwrap" && (
                            <>
                              <div>
                                -{" "}
                                {formatAmount((row as any).amount, 8, "frBTC")}{" "}
                                frBTC
                              </div>
                              <div className="text-green-500">
                                + {formatAmount((row as any).amount, 8, "BTC")}{" "}
                                BTC
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Address (left) and Date (right) */}
                  <div className="flex justify-between items-center mt-1">
                    <div className="text-xs text-[color:var(--sf-text)]/50">
                      {truncateAddress(address || "", 6, 4)}
                    </div>
                    <div className="text-xs text-[color:var(--sf-text)]/50">
                      {timeLabel}
                    </div>
                  </div>
                </div>

                {/* Desktop layout (sm+) - single row with 5 columns */}
                <div className="hidden sm:grid sm:grid-cols-[minmax(60px,0.8fr)_minmax(120px,1.2fr)_minmax(100px,1.2fr)_minmax(80px,1fr)_minmax(70px,0.8fr)] lg:grid-cols-[minmax(80px,1fr)_minmax(160px,1.5fr)_minmax(120px,1.2fr)_minmax(90px,1fr)_minmax(80px,1fr)] xl:grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] items-center gap-2 lg:gap-3 xl:gap-4">
                  <div className="text-sm text-[color:var(--sf-text)]/80">
                    {typeLabel}
                  </div>

                  <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-3">
                    <PairIcon
                      leftId={pairNames.leftId}
                      rightId={pairNames.rightId}
                      leftSymbol={pairNames.leftName}
                      rightSymbol={pairNames.rightName}
                      network={network}
                    />
                    <div className="min-w-0">
                      {pairLoaded ? (
                        <div className="truncate text-sm text-[color:var(--sf-text)]">
                          {row.type === "mint" || row.type === "burn"
                            ? `${pairNames.leftName} / ${pairNames.rightName}`
                            : row.type === "wrap" ||
                              row.type === "unwrap" ||
                              row.type === "swap"
                            ? `${pairNames.leftName} → ${pairNames.rightName}`
                            : `${pairNames.leftName} · ${pairNames.rightName}`}
                        </div>
                      ) : (
                        <LineSkeleton widthClass="w-32" />
                      )}
                    </div>
                  </div>

                  <div className="text-right text-xs text-[color:var(--sf-text)]">
                    {!pairLoaded ? (
                      <div className="space-y-1">
                        <LineSkeleton widthClass="w-20 ml-auto" />
                        <LineSkeleton widthClass="w-20 ml-auto" />
                      </div>
                    ) : (
                      <>
                        {row.type === "swap" && (
                          <>
                            <div>
                              -{" "}
                              {formatAmount(
                                row.soldAmount,
                                8,
                                pairNames.leftName,
                              )}{" "}
                              {pairNames.leftName}
                            </div>
                            <div className="text-green-500">
                              +{" "}
                              {formatAmount(
                                row.boughtAmount,
                                8,
                                pairNames.rightName,
                              )}{" "}
                              {pairNames.rightName}
                            </div>
                          </>
                        )}
                        {row.type === "mint" && (
                          <>
                            <div>
                              -{" "}
                              {formatAmount(
                                (row as any).token0Amount,
                                8,
                                pairNames.leftName,
                              )}{" "}
                              {pairNames.leftName}
                            </div>
                            <div>
                              -{" "}
                              {formatAmount(
                                (row as any).token1Amount,
                                8,
                                pairNames.rightName,
                              )}{" "}
                              {pairNames.rightName}
                            </div>
                          </>
                        )}
                        {(row.type === "burn" || row.type === "creation") && (
                          <>
                            <div className="text-green-500">
                              +{" "}
                              {formatAmount(
                                (row as any).token0Amount,
                                8,
                                pairNames.leftName,
                              )}{" "}
                              {pairNames.leftName}
                            </div>
                            <div className="text-green-500">
                              +{" "}
                              {formatAmount(
                                (row as any).token1Amount,
                                8,
                                pairNames.rightName,
                              )}{" "}
                              {pairNames.rightName}
                            </div>
                          </>
                        )}
                        {row.type === "wrap" && (
                          <>
                            <div>
                              - {formatAmount((row as any).amount, 8, "BTC")}{" "}
                              BTC
                            </div>
                            <div className="text-green-500">
                              + {formatAmount((row as any).amount, 8, "frBTC")}{" "}
                              frBTC
                            </div>
                          </>
                        )}
                        {row.type === "unwrap" && (
                          <>
                            <div>
                              - {formatAmount((row as any).amount, 8, "frBTC")}{" "}
                              frBTC
                            </div>
                            <div className="text-green-500">
                              + {formatAmount((row as any).amount, 8, "BTC")}{" "}
                              BTC
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="truncate text-right text-sm text-[color:var(--sf-text)]/60">
                    <span className="lg:hidden">
                      {truncateAddress(address || "", 5, 3)}
                    </span>
                    <span className="hidden lg:inline">
                      {truncateAddress(address || "")}
                    </span>
                  </div>
                  <div className="text-right text-sm text-[color:var(--sf-text)]/60">
                    <span className="lg:hidden">{dateLabel}</span>
                    <span className="hidden lg:inline">{timeLabel}</span>
                  </div>
                </div>
              </Link>
            );
          })}
          {(isLoading || isFetchingNextPage) && (
            <div className="px-4 py-3 text-center text-[color:var(--sf-text)]/60">
              {t("activity.loading")}
            </div>
          )}
          <div ref={loadingRef} className="h-6" />
        </div>
      </div>
    </div>
  );
}
