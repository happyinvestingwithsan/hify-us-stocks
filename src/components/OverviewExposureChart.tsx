"use client";

import React, { useMemo, useState } from "react";
import { AccountProfitSummary, ConsolidatedTickerSummary } from "@/lib/types";
import { DisplayCurrency } from "./CapitalWaterfallChart";

interface OpenExposureDonutProps {
  rows: ConsolidatedTickerSummary[];
  targetCapitalUsd: number;
  currency: DisplayCurrency;
  fxRate: number;
  activeTickerFilter: string;
  onSelectTicker: (ticker: string) => void;
  fmtUsd: (n: number) => string;
  fmtInr: (n: number) => string;
}

const SLICE_PALETTE = [
  "#C8A951", // HIFY Gold
  "#10B981", // Emerald
  "#8E6C20", // Deep Gold
  "#3B82F6", // Blue
  "#0EA5E9", // Sky
  "#A855F7", // Purple
  "#14B8A6", // Teal
  "#64748B", // Slate
];

export function OpenExposureDonut({
  rows,
  targetCapitalUsd,
  currency,
  fxRate,
  activeTickerFilter,
  onSelectTicker,
  fmtUsd,
  fmtInr,
}: OpenExposureDonutProps) {
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const fx = fxRate > 0 ? fxRate : 85;
  const fmtAmt = (usd: number) =>
    currency === "INR" ? fmtInr(usd * fx) : fmtUsd(usd);

  const { slices, totalInvestedUsd, totalAllocPct, cashRemainingPct } =
    useMemo(() => {
      const sorted = [...rows].sort(
        (a, b) => b.totalInvestedUsd - a.totalInvestedUsd
      );
      const invested = sorted.reduce((s, r) => s + r.totalInvestedUsd, 0);
      const denom = targetCapitalUsd > 0 ? targetCapitalUsd : Math.max(1, invested);
      const allocPct = (invested / denom) * 100;
      const cashPct = Math.max(0, 100 - allocPct);

      // Group long tail (>7 tickers) into "Others" for a clean, readable donut
      const top = sorted.slice(0, 7);
      const tail = sorted.slice(7);
      const items = top.map((r, i) => {
        const overCap =
          r.maxAllowedPct !== null && r.allocationPctOfTarget > r.maxAllowedPct;
        return {
          key: r.ticker,
          label: r.ticker,
          investedUsd: r.totalInvestedUsd,
          allocPct: r.allocationPctOfTarget,
          maxAllowedPct: r.maxAllowedPct,
          tier: r.marketCapTier,
          lotCount: r.lotCount,
          overCap,
          color: overCap ? "#F43F5E" : SLICE_PALETTE[i % SLICE_PALETTE.length],
          isClickable: true,
        };
      });

      if (tail.length > 0) {
        const tailUsd = tail.reduce((s, r) => s + r.totalInvestedUsd, 0);
        const tailPct = tail.reduce((s, r) => s + r.allocationPctOfTarget, 0);
        const anyOverCap = tail.some(
          (r) => r.maxAllowedPct !== null && r.allocationPctOfTarget > r.maxAllowedPct
        );
        items.push({
          key: "__OTHERS__",
          label: `Others (${tail.length})`,
          investedUsd: tailUsd,
          allocPct: tailPct,
          maxAllowedPct: null,
          tier: null,
          lotCount: tail.reduce((s, r) => s + r.lotCount, 0),
          overCap: anyOverCap,
          color: anyOverCap ? "#F43F5E" : "#94A3B8",
          isClickable: false,
        });
      }

      return {
        slices: items,
        totalInvestedUsd: invested,
        totalAllocPct: allocPct,
        cashRemainingPct: cashPct,
      };
    }, [rows, targetCapitalUsd]);

  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-xs text-[var(--text-muted)]">
        No open exposure positions to chart.
      </div>
    );
  }

  // SVG Donut geometry (radius 64, circumference = 2 * pi * 64 = 402.12)
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const denomUsd = Math.max(
    1,
    targetCapitalUsd > totalInvestedUsd ? targetCapitalUsd : totalInvestedUsd
  );

  let cumulativeFraction = 0;
  const segments = slices.map((s) => {
    const fraction = s.investedUsd / denomUsd;
    const dashLength = fraction * circumference;
    const dashOffset = -cumulativeFraction * circumference;
    cumulativeFraction += fraction;
    return { ...s, dashLength, dashOffset };
  });

  const activeSlice =
    slices.find((s) => s.key === hoveredTicker) ??
    slices.find(
      (s) =>
        s.isClickable &&
        activeTickerFilter.trim().toUpperCase() === s.key.toUpperCase()
    ) ??
    null;

  return (
    <div className="mt-3 grid grid-cols-1 items-center gap-5 md:grid-cols-[200px_1fr]">
      {/* SVG Donut Chart */}
      <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          {/* Unallocated / Cash Headroom Track */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="22"
            className="text-[var(--border)]/45"
          />
          {segments.map((seg) => {
            const isHovered = hoveredTicker === seg.key;
            return (
              <circle
                key={seg.key}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? 26 : 22}
                strokeDasharray={`${seg.dashLength} ${circumference}`}
                strokeDashoffset={seg.dashOffset}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredTicker(seg.key)}
                onMouseLeave={() => setHoveredTicker(null)}
                onClick={() => {
                  if (seg.isClickable) onSelectTicker(seg.key);
                }}
              />
            );
          })}
        </svg>

        {/* Center Donut KPI */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {activeSlice ? activeSlice.label : "Deployed"}
          </span>
          <span className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-main)]">
            {activeSlice
              ? `${activeSlice.allocPct.toFixed(1)}%`
              : `${totalAllocPct.toFixed(1)}%`}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
            {activeSlice
              ? fmtAmt(activeSlice.investedUsd)
              : fmtAmt(totalInvestedUsd)}
          </span>
        </div>
      </div>

      {/* Interactive Legend & Cap-Limit Status */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
          <span>
            Unallocated Cap Headroom:{" "}
            <strong className="font-mono text-[var(--text-main)]">
              {cashRemainingPct.toFixed(1)}%
            </strong>
          </span>
          <span>Rose = Over Tier Cap · Click to open lots</span>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {slices.map((s) => {
            const isHovered = hoveredTicker === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onMouseEnter={() => setHoveredTicker(s.key)}
                onMouseLeave={() => setHoveredTicker(null)}
                onClick={() => {
                  if (s.isClickable) onSelectTicker(s.key);
                }}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                  isHovered
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]/60"
                    : "border-[var(--border)] bg-[var(--section-bg)] hover:border-[var(--primary)]/60"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-mono font-semibold text-[var(--text-main)]">
                    {s.label}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${
                    s.overCap
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {s.allocPct.toFixed(1)}%
                  {s.maxAllowedPct !== null ? `/${s.maxAllowedPct}%` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CostsDividendsBarsProps {
  summary: AccountProfitSummary;
  currency: DisplayCurrency;
  fmtUsd: (n: number) => string;
  fmtInr: (n: number) => string;
}

export function CostsDividendsBars({
  summary,
  currency,
  fmtUsd,
  fmtInr,
}: CostsDividendsBarsProps) {
  const fx = summary.liveUsdInrRate > 0 ? summary.liveUsdInrRate : 85;
  const fxChargesUsd = summary.totalFxChargesInr / fx;
  const totalDragUsd =
    summary.totalTradeFeesUsd + summary.totalStandaloneFeesUsd + fxChargesUsd;
  const netCarryUsd = summary.totalDividendsUsd - totalDragUsd;

  const items = [
    {
      label: "Dividends Received",
      usd: summary.totalDividendsUsd,
      inr: summary.totalDividendsUsd * fx,
      sign: "+",
      barCls: "bg-emerald-500",
      textCls: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Trade Fees (Brokerage/SEC/TAF)",
      usd: summary.totalTradeFeesUsd,
      inr: summary.totalTradeFeesUsd * fx,
      sign: "-",
      barCls: "bg-rose-500",
      textCls: "text-rose-600 dark:text-rose-400",
    },
    {
      label: "Platform / Tax / Standalone Fees",
      usd: summary.totalStandaloneFeesUsd,
      inr: summary.totalStandaloneFeesUsd * fx,
      sign: "-",
      barCls: "bg-rose-500/80",
      textCls: "text-rose-600 dark:text-rose-400",
    },
    {
      label: "FX / Remittance Charges",
      usd: fxChargesUsd,
      inr: summary.totalFxChargesInr,
      sign: "-",
      barCls: "bg-amber-500",
      textCls: "text-amber-600 dark:text-amber-400",
    },
  ];

  const maxVal = Math.max(
    1,
    ...items.map((i) => (currency === "INR" ? i.inr : i.usd))
  );

  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => {
        const val = currency === "INR" ? item.inr : item.usd;
        const widthPct = val > 0 ? Math.max(4, (val / maxVal) * 100) : 0;
        const formatted =
          currency === "INR" ? fmtInr(item.inr) : fmtUsd(item.usd);

        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-[var(--text-muted)]">{item.label}</span>
              <span className={`font-mono font-semibold tabular-nums ${item.textCls}`}>
                {item.sign}
                {formatted}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]/45">
              <div
                className={`h-full rounded-full transition-all duration-300 ${item.barCls}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-xs font-mono tabular-nums">
        <span className="font-sans text-[var(--text-muted)]">
          Net Dividend vs Fee Carry
        </span>
        <span
          className={`font-semibold ${
            netCarryUsd >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {netCarryUsd >= 0 ? "+" : ""}
          {currency === "INR" ? fmtInr(netCarryUsd * fx) : fmtUsd(netCarryUsd)}
        </span>
      </div>
    </div>
  );
}
