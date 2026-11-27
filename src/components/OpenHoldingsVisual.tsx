"use client";

import React, { useMemo, useState } from "react";
import { OpenLot } from "@/lib/types";
import { DisplayCurrency } from "./CapitalWaterfallChart";

interface OpenHoldingsVisualProps {
  lots: OpenLot[];
  currency: DisplayCurrency;
  fxRate: number;
  activeSearch: string;
  onSelectTicker: (ticker: string) => void;
  onSelectGttFilter: (status: string) => void;
  fmtUsd: (n: number) => string;
  fmtInr: (n: number) => string;
}

interface TickerPnlAgg {
  ticker: string;
  costBasisUsd: number;
  marketValueUsd: number;
  pnlUsd: number;
  pnlPct: number;
  lotCount: number;
}

function get3mDaysRemaining(buyDate: string): number | null {
  const dt = new Date(`${buyDate}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const expiry = new Date(dt);
  expiry.setMonth(expiry.getMonth() + 3);
  return Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
}

export function OpenHoldingsVisual({
  lots,
  currency,
  fxRate,
  activeSearch,
  onSelectTicker,
  onSelectGttFilter,
  fmtUsd,
  fmtInr,
}: OpenHoldingsVisualProps) {
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const fx = fxRate > 0 ? fxRate : 85;
  const fmtAmt = (usd: number) =>
    currency === "INR" ? fmtInr(usd * fx) : fmtUsd(usd);

  const { tickerBars, urgencyCounts, gttCounts } = useMemo(() => {
    const byTicker = new Map<string, TickerPnlAgg>();
    const urgency = { expired: 0, expiring: 0, active: 0 };
    const gtt = { covered: 0, uncovered: 0 };

    for (const lot of lots) {
      const ratio = lot.shares > 0 ? lot.remainingShares / lot.shares : 1;
      const costUsd = lot.buyValueUsd * ratio;
      const cmp = lot.currentPriceUsd ?? lot.buyPriceUsd;
      const mktUsd = cmp * lot.remainingShares;
      const pnlUsd = mktUsd - costUsd;

      const prev = byTicker.get(lot.ticker);
      if (prev) {
        prev.costBasisUsd += costUsd;
        prev.marketValueUsd += mktUsd;
        prev.pnlUsd += pnlUsd;
        prev.lotCount += 1;
        prev.pnlPct =
          prev.costBasisUsd > 0 ? (prev.pnlUsd / prev.costBasisUsd) * 100 : 0;
      } else {
        byTicker.set(lot.ticker, {
          ticker: lot.ticker,
          costBasisUsd: costUsd,
          marketValueUsd: mktUsd,
          pnlUsd,
          pnlPct: costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0,
          lotCount: 1,
        });
      }

      const daysLeft = get3mDaysRemaining(lot.buyDate);
      if (daysLeft === null || daysLeft > 14) urgency.active += 1;
      else if (daysLeft <= 0) urgency.expired += 1;
      else urgency.expiring += 1;

      if (lot.sellGttStatus === "PLACED" || lot.sellGttStatus === "TRIGGERED") {
        gtt.covered += 1;
      } else {
        gtt.uncovered += 1;
      }
    }

    const bars = Array.from(byTicker.values()).sort(
      (a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd)
    );

    return { tickerBars: bars, urgencyCounts: urgency, gttCounts: gtt };
  }, [lots]);

  if (lots.length === 0) return null;

  const maxAbsPnl = Math.max(
    1,
    ...tickerBars.map((t) => Math.abs(t.pnlUsd))
  );
  const totalLots = lots.length;
  const hoveredRow = tickerBars.find((t) => t.ticker === hoveredTicker) ?? null;

  return (
    <div className="hify-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Unrealized P&amp;L by Ticker &amp; 3-Month GTT Health
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Click a ticker bar to filter lots below · Hover for cost basis &amp; market value
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onSelectGttFilter("PLACED")}
            className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--primary-deep)] hover:border-[var(--primary)] dark:text-[var(--primary)]"
          >
            GTT Placed: {gttCounts.covered}/{totalLots}
          </button>
          <button
            type="button"
            onClick={() => onSelectGttFilter("NONE")}
            className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)]"
          >
            No GTT: {gttCounts.uncovered}
          </button>
        </div>
      </div>

      {/* 3-Month Trigger Urgency Segmented Bar */}
      <div className="mt-3 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-main)]">
            3M Trigger Window ({totalLots} lots)
          </span>
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span className="text-rose-600 dark:text-rose-400">
              Expired: {urgencyCounts.expired}
            </span>
            <span className="text-amber-600 dark:text-amber-400">
              Expiring ≤14d: {urgencyCounts.expiring}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              Active: {urgencyCounts.active}
            </span>
          </div>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--border)]/40">
          {urgencyCounts.expired > 0 && (
            <div
              className="bg-rose-500 transition-all"
              style={{ width: `${(urgencyCounts.expired / totalLots) * 100}%` }}
            />
          )}
          {urgencyCounts.expiring > 0 && (
            <div
              className="bg-amber-500 transition-all"
              style={{ width: `${(urgencyCounts.expiring / totalLots) * 100}%` }}
            />
          )}
          {urgencyCounts.active > 0 && (
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${(urgencyCounts.active / totalLots) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Diverging Horizontal P&L Bars */}
      <div className="mt-4 space-y-1.5">
        {tickerBars.slice(0, 10).map((t) => {
          const isGain = t.pnlUsd >= 0;
          const pctWidth = Math.min(100, (Math.abs(t.pnlUsd) / maxAbsPnl) * 100);
          const isSelected =
            activeSearch.trim().toUpperCase() === t.ticker.toUpperCase();

          return (
            <button
              key={t.ticker}
              type="button"
              onMouseEnter={() => setHoveredTicker(t.ticker)}
              onMouseLeave={() => setHoveredTicker(null)}
              onClick={() => onSelectTicker(isSelected ? "" : t.ticker)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-1.5 text-left transition ${
                isSelected
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]/70"
                  : "border-transparent bg-[var(--section-bg)] hover:border-[var(--border)]"
              }`}
            >
              <span className="w-14 shrink-0 font-mono text-xs font-bold text-[var(--text-main)]">
                {t.ticker}
              </span>

              {/* Zero-centered diverging track */}
              <div className="grid flex-1 grid-cols-2 items-center">
                <div className="flex justify-end pr-0.5">
                  {!isGain && (
                    <div
                      className="h-3.5 rounded-l-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${Math.max(4, pctWidth)}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-start border-l border-[var(--border)] pl-0.5">
                  {isGain && (
                    <div
                      className="h-3.5 rounded-r-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.max(4, pctWidth)}%` }}
                    />
                  )}
                </div>
              </div>

              <span
                className={`w-36 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums ${
                  isGain
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isGain ? "+" : ""}
                {fmtAmt(t.pnlUsd)} ({isGain ? "+" : ""}
                {t.pnlPct.toFixed(1)}%)
              </span>
            </button>
          );
        })}
      </div>

      {hoveredRow && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2 text-xs font-mono tabular-nums">
          <span className="font-semibold text-[var(--text-main)]">
            {hoveredRow.ticker} · {hoveredRow.lotCount}{" "}
            {hoveredRow.lotCount === 1 ? "lot" : "lots"}
          </span>
          <span className="text-[var(--text-muted)]">
            Cost: <strong className="text-[var(--text-main)]">{fmtAmt(hoveredRow.costBasisUsd)}</strong>
          </span>
          <span className="text-[var(--text-muted)]">
            Market: <strong className="text-[var(--text-main)]">{fmtAmt(hoveredRow.marketValueUsd)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
