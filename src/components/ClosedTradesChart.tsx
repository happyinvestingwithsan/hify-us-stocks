"use client";

import React, { useMemo, useState } from "react";
import { ClosedTrade } from "@/lib/types";
import { computeClosedTradeMetrics } from "@/lib/profit-engine";
import { DisplayCurrency } from "./CapitalWaterfallChart";

interface ClosedTradesChartProps {
  trades: ClosedTrade[];
  currency: DisplayCurrency;
  fxRate: number;
  activeMonthFilter: string;
  activeStrategyFilter: string;
  onSelectMonth: (monthLabel: string) => void;
  onSelectStrategy: (strategy: string) => void;
  fmtUsd: (n: number) => string;
  fmtInr: (n: number) => string;
}

interface BucketAgg {
  key: string;
  label: string;
  sortKey: string;
  netPnlUsd: number;
  wins: number;
  losses: number;
  tradeCount: number;
}

export function ClosedTradesChart({
  trades,
  currency,
  fxRate,
  activeMonthFilter,
  activeStrategyFilter,
  onSelectMonth,
  onSelectStrategy,
  fmtUsd,
  fmtInr,
}: ClosedTradesChartProps) {
  const [groupBy, setGroupBy] = useState<"month" | "strategy">("month");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const fx = fxRate > 0 ? fxRate : 85;
  const fmtAmt = (usd: number) =>
    currency === "INR" ? fmtInr(usd * fx) : fmtUsd(usd);

  const buckets = useMemo(() => {
    const map = new Map<string, BucketAgg>();

    for (const t of trades) {
      const m = computeClosedTradeMetrics(t);
      const key =
        groupBy === "month" ? m.monthLabel : t.strategy.trim() || "UNSET";
      const sortKey =
        groupBy === "month" ? t.sellDate.slice(0, 7) : key;

      const prev = map.get(key);
      if (prev) {
        prev.netPnlUsd += t.netPnlUsd;
        if (t.netPnlUsd >= 0) prev.wins += 1;
        else prev.losses += 1;
        prev.tradeCount += 1;
        if (groupBy === "month" && sortKey < prev.sortKey) {
          prev.sortKey = sortKey;
        }
      } else {
        map.set(key, {
          key,
          label: key,
          sortKey,
          netPnlUsd: t.netPnlUsd,
          wins: t.netPnlUsd >= 0 ? 1 : 0,
          losses: t.netPnlUsd < 0 ? 1 : 0,
          tradeCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      groupBy === "month"
        ? a.sortKey.localeCompare(b.sortKey)
        : b.netPnlUsd - a.netPnlUsd
    );
  }, [trades, groupBy]);

  if (trades.length === 0) return null;

  const maxAbsUsd = Math.max(1, ...buckets.map((b) => Math.abs(b.netPnlUsd)));
  const avgPnlUsd =
    buckets.reduce((s, b) => s + b.netPnlUsd, 0) / Math.max(1, buckets.length);
  const hovered = buckets.find((b) => b.key === hoveredKey) ?? null;

  return (
    <div className="hify-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Realized P&amp;L Pulse ({groupBy === "month" ? "By FY Month" : "By Strategy"})
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Click any bar to filter trades below · Avg {fmtAmt(avgPnlUsd)} /{" "}
            {groupBy === "month" ? "month" : "strategy"}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--section-bg)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setGroupBy("month")}
            className={`rounded-md px-2.5 py-1 font-semibold transition ${
              groupBy === "month"
                ? "bg-[var(--primary)] text-zinc-950"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            By Month
          </button>
          <button
            type="button"
            onClick={() => setGroupBy("strategy")}
            className={`rounded-md px-2.5 py-1 font-semibold transition ${
              groupBy === "strategy"
                ? "bg-[var(--primary)] text-zinc-950"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            By Strategy
          </button>
        </div>
      </div>

      {/* By Month: Diverging Vertical Bar Chart | By Strategy: Horizontal Ranked Bars */}
      {groupBy === "month" ? (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-[460px] items-stretch gap-2">
            {buckets.map((b) => {
              const isWin = b.netPnlUsd >= 0;
              const heightPct = Math.max(
                6,
                Math.min(100, (Math.abs(b.netPnlUsd) / maxAbsUsd) * 100)
              );
              const isSelected = activeMonthFilter === b.key;

              return (
                <button
                  key={b.key}
                  type="button"
                  onMouseEnter={() => setHoveredKey(b.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSelectMonth(isSelected ? "ALL" : b.key)}
                  className={`flex min-w-[58px] flex-1 flex-col items-center rounded-lg border p-2 transition ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/70"
                      : "border-transparent bg-[var(--section-bg)] hover:border-[var(--border)]"
                  }`}
                >
                  <span
                    className={`mb-1 font-mono text-[10px] font-semibold tabular-nums ${
                      isWin
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {isWin ? "+" : ""}
                    {fmtAmt(b.netPnlUsd)}
                  </span>

                  <div className="flex h-24 w-full flex-col">
                    <div className="flex flex-1 items-end justify-center pb-0.5">
                      {isWin && (
                        <div
                          className="w-7 rounded-t-md bg-emerald-500 transition-all duration-300"
                          style={{ height: `${heightPct}%` }}
                        />
                      )}
                    </div>
                    <div className="h-px w-full bg-[var(--border)]" />
                    <div className="flex flex-1 items-start justify-center pt-0.5">
                      {!isWin && (
                        <div
                          className="w-7 rounded-b-md bg-rose-500 transition-all duration-300"
                          style={{ height: `${heightPct}%` }}
                        />
                      )}
                    </div>
                  </div>

                  <span className="mt-1.5 truncate text-[11px] font-semibold text-[var(--text-main)]">
                    {b.label}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    {b.wins}W/{b.losses}L
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          {buckets.map((b) => {
            const isWin = b.netPnlUsd >= 0;
            const widthPct = Math.min(
              100,
              (Math.abs(b.netPnlUsd) / maxAbsUsd) * 100
            );
            const isSelected = activeStrategyFilter === b.key;

            return (
              <button
                key={b.key}
                type="button"
                onMouseEnter={() => setHoveredKey(b.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onSelectStrategy(isSelected ? "ALL" : b.key)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-1.5 text-left transition ${
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]/70"
                    : "border-transparent bg-[var(--section-bg)] hover:border-[var(--border)]"
                }`}
              >
                <span className="w-28 shrink-0 truncate text-xs font-semibold text-[var(--text-main)]">
                  {b.label}
                </span>
                <div className="grid flex-1 grid-cols-2 items-center">
                  <div className="flex justify-end pr-0.5">
                    {!isWin && (
                      <div
                        className="h-3.5 rounded-l-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${Math.max(4, widthPct)}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-start border-l border-[var(--border)] pl-0.5">
                    {isWin && (
                      <div
                        className="h-3.5 rounded-r-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(4, widthPct)}%` }}
                      />
                    )}
                  </div>
                </div>
                <span
                  className={`w-36 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums ${
                    isWin
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {isWin ? "+" : ""}
                  {fmtAmt(b.netPnlUsd)} · {b.wins}W/{b.losses}L
                </span>
              </button>
            );
          })}
        </div>
      )}

      {hovered && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2 text-xs font-mono tabular-nums">
          <span className="font-semibold text-[var(--text-main)]">
            {hovered.label} · {hovered.tradeCount}{" "}
            {hovered.tradeCount === 1 ? "trade" : "trades"}
          </span>
          <span className="text-[var(--text-muted)]">
            Win Rate:{" "}
            <strong className="text-[var(--text-main)]">
              {((hovered.wins / hovered.tradeCount) * 100).toFixed(0)}%
            </strong>{" "}
            ({hovered.wins}W / {hovered.losses}L)
          </span>
          <span
            className={`font-semibold ${
              hovered.netPnlUsd >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            Net: {hovered.netPnlUsd >= 0 ? "+" : ""}
            {fmtAmt(hovered.netPnlUsd)}
          </span>
        </div>
      )}
    </div>
  );
}
