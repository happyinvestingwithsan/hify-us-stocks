"use client";

import React, { useMemo, useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { InrDeposit } from "@/lib/types";
import {
  computeLrsFySummary,
  computeLrsMonthlyBreakdown,
  formatFyLabel,
  getAvailableFyStartYears,
  getCurrentIndianFyStartYear,
  TCS_THRESHOLD_POST_2025_INR,
} from "@/lib/lrs";

interface LrsLimitCardProps {
  deposits: InrDeposit[];
  fmtInr: (n: number) => string;
  fmtUsd: (n: number) => string;
}

export function LrsLimitCard({ deposits, fmtInr, fmtUsd }: LrsLimitCardProps) {
  const availableYears = useMemo(() => getAvailableFyStartYears(deposits), [deposits]);
  const defaultFy = useMemo(() => getCurrentIndianFyStartYear(), []);
  const [selectedFy, setSelectedFy] = useState<number>(defaultFy);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const activeFy = availableYears.includes(selectedFy) ? selectedFy : availableYears[0];
  const stats = useMemo(
    () => computeLrsFySummary(deposits, activeFy),
    [deposits, activeFy]
  );
  const months = useMemo(
    () => computeLrsMonthlyBreakdown(deposits, activeFy),
    [deposits, activeFy]
  );

  const tcsBarPct = Math.min(100, Math.max(0, stats.tcsUsedPct));
  const lrsBarPct = Math.min(100, Math.max(0, stats.lrsUsedPct));
  const isOverTcs = stats.tcsExcessInr > 0;
  const isNearTcs = !isOverTcs && stats.tcsUsedPct >= 80;

  const chartCeilingInr = Math.max(
    stats.tcsThresholdInr * 1.1,
    stats.inrRemitted * 1.05,
    1
  );
  const thresholdLinePct = Math.min(
    96,
    (stats.tcsThresholdInr / chartCeilingInr) * 100
  );
  const hoveredBucket =
    months.find((m) => m.yearMonth === hoveredMonth) ?? null;

  return (
    <div className="hify-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
            {isOverTcs ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
            )}
            LRS &amp; TCS-Free Headroom ({stats.fyLabel} · Apr–Mar)
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Tracks converted INR ({stats.depositCount} {stats.depositCount === 1 ? "deposit" : "deposits"} in {stats.fyLabel}) against India&apos;s TCS-free threshold &amp; RBI LRS cap.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Financial Year</span>
          <select
            aria-label="Select Indian Financial Year"
            value={activeFy}
            onChange={(e) => setSelectedFy(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {formatFyLabel(yr)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Top 2 Summary Bars */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bar 1: ₹10L TCS-Free Threshold */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--section-bg)] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-main)]">
              TCS-Free Threshold (0% TCS)
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text-muted)]">
              {stats.tcsUsedPct.toFixed(1)}% of {fmtInr(stats.tcsThresholdInr)}
            </span>
          </div>

          <div
            className="mt-2.5 h-3.5 w-full overflow-hidden rounded-full bg-[var(--border)]/50"
            role="progressbar"
            aria-label="TCS-free threshold usage"
            aria-valuenow={Math.round(tcsBarPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isOverTcs
                  ? "bg-amber-500"
                  : isNearTcs
                  ? "bg-[var(--primary)]"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${tcsBarPct}%` }}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
            <span className="text-[var(--text-main)]">
              Remitted: <strong>{fmtInr(stats.inrRemitted)}</strong>
            </span>
            {isOverTcs ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Over by {fmtInr(stats.tcsExcessInr)} · Est. 20% TCS {fmtInr(stats.estimatedTcsInr)}
              </span>
            ) : (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Pending Free Limit: {fmtInr(stats.tcsPendingInr)}
              </span>
            )}
          </div>
          {isOverTcs && (
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              20% TCS applies only on the excess above {fmtInr(stats.tcsThresholdInr)} and is claimable via Form 12BAA (salary TDS offset) or ITR refund.
            </p>
          )}
        </div>

        {/* Bar 2: $250,000 RBI LRS Cap */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--section-bg)] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-main)]">
              RBI LRS Annual Cap (USD)
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text-muted)]">
              {stats.lrsUsedPct.toFixed(2)}% of {fmtUsd(stats.lrsCapUsd)}
            </span>
          </div>

          <div
            className="mt-2.5 h-3.5 w-full overflow-hidden rounded-full bg-[var(--border)]/50"
            role="progressbar"
            aria-label="RBI LRS annual cap usage"
            aria-valuenow={Math.round(lrsBarPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
              style={{ width: `${Math.max(stats.usdRemitted > 0 ? 1.5 : 0, lrsBarPct)}%` }}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
            <span className="text-[var(--text-main)]">
              Used: <strong>{fmtUsd(stats.usdRemitted)}</strong>
            </span>
            <span className="font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
              Pending LRS Cap: {fmtUsd(stats.lrsPendingUsd)}
            </span>
          </div>
        </div>
      </div>

      {/* 12-Month Apr-Mar Remittance Pacing Bar Chart */}
      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--section-bg)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text-main)]">
            Monthly Cumulative &amp; Tranche Pacing (Apr–Mar)
          </span>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-[#C8A951]" />
              Within ₹10L
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-amber-500" />
              Crosses Cap
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-rose-500" />
              Over Cap
            </span>
          </div>
        </div>

        <div className="relative mt-3 h-32 w-full">
          {/* Threshold Reference Line */}
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-amber-500/80"
            style={{ bottom: `${thresholdLinePct}%` }}
          >
            <span className="ml-1 rounded bg-[var(--section-bg)] px-1 font-mono text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              TCS-Free Cap {fmtInr(stats.tcsThresholdInr)}
            </span>
          </div>

          {/* 12 Monthly Columns */}
          <div className="grid h-full grid-cols-12 items-end gap-1.5 pt-4">
            {months.map((m) => {
              const cumPct = Math.min(
                100,
                (m.cumulativeInr / chartCeilingInr) * 100
              );
              const barColor = m.overThreshold
                ? "bg-rose-500"
                : m.crossesThreshold
                ? "bg-amber-500"
                : "bg-[#C8A951]";

              return (
                <button
                  key={m.yearMonth}
                  type="button"
                  onMouseEnter={() => setHoveredMonth(m.yearMonth)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  className="group flex h-full flex-col items-center justify-end gap-1 focus:outline-none"
                >
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div
                      className={`w-full max-w-[26px] rounded-t transition-all duration-300 ${
                        m.inrRemitted > 0
                          ? `${barColor} opacity-95 group-hover:opacity-100`
                          : "bg-[var(--border)]/45"
                      }`}
                      style={{
                        height: `${m.cumulativeInr > 0 ? Math.max(6, cumPct) : 4}%`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] group-hover:text-[var(--text-main)]">
                    {m.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {hoveredBucket && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-mono tabular-nums">
            <span className="font-semibold text-[var(--text-main)]">
              {hoveredBucket.shortLabel} ({hoveredBucket.yearMonth}) ·{" "}
              {hoveredBucket.depositCount}{" "}
              {hoveredBucket.depositCount === 1 ? "deposit" : "deposits"}
            </span>
            <span className="text-[var(--text-muted)]">
              Month:{" "}
              <strong className="text-[var(--text-main)]">
                {fmtInr(hoveredBucket.inrRemitted)}
              </strong>{" "}
              ({fmtUsd(hoveredBucket.usdCredited)})
            </span>
            <span className="text-[var(--primary-deep)] dark:text-[var(--primary)]">
              YTD Cumulative: <strong>{fmtInr(hoveredBucket.cumulativeInr)}</strong>
            </span>
          </div>
        )}

        {/* March / April FY-Split Headroom Strip */}
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--border)] pt-3 text-xs sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 font-mono tabular-nums">
            <span className="font-sans text-[var(--text-muted)]">
              Till Mar 31 ({stats.fyLabel})
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {fmtInr(stats.tcsPendingInr)} TCS-Free Left
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 font-mono tabular-nums">
            <span className="font-sans text-[var(--text-muted)]">
              From Apr 1 ({formatFyLabel(activeFy + 1)})
            </span>
            <span className="font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
              +{fmtInr(TCS_THRESHOLD_POST_2025_INR)} Fresh Reset
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        Note: Other LRS remittances on your PAN in {stats.fyLabel} (foreign travel, gifts, international cards) share this same {fmtInr(stats.tcsThresholdInr)} / {fmtUsd(stats.lrsCapUsd)} bucket.
      </p>
    </div>
  );
}
