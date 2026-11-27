"use client";

import React, { useState } from "react";
import { AccountProfitSummary } from "@/lib/types";

export type DisplayCurrency = "USD" | "INR";

interface WaterfallStep {
  key: string;
  label: string;
  shortLabel: string;
  kind: "anchor" | "positive" | "negative";
  startVal: number;
  endVal: number;
  deltaVal: number;
  usdVal: number;
  inrVal: number;
  detail: string;
}

interface CapitalWaterfallChartProps {
  summary: AccountProfitSummary;
  currency: DisplayCurrency;
  fmtUsd: (n: number) => string;
  fmtInr: (n: number) => string;
}

function formatCompact(n: number, currency: DisplayCurrency): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (currency === "INR") {
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
    return `${sign}₹${abs.toFixed(0)}`;
  }
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function CapitalWaterfallChart({
  summary,
  currency,
  fmtUsd,
  fmtInr,
}: CapitalWaterfallChartProps) {
  const [activeKey, setActiveKey] = useState<string>("current");
  const fx = summary.liveUsdInrRate > 0 ? summary.liveUsdInrRate : 85;

  const initialUsd = summary.totalUsdDeposited;
  const initialInr = summary.totalInrInvested + summary.totalFxChargesInr;

  const realizedTotalUsd = summary.netAccountProfitUsd - summary.unrealizedPnlUsd;
  const tradePnlUsd = summary.realizedNetPnlUsd;
  const dividendsUsd = summary.totalDividendsUsd;
  const nonTradeFeesUsd = Math.max(0, tradePnlUsd + dividendsUsd - realizedTotalUsd);

  const totalInvestedUsd = initialUsd + realizedTotalUsd;
  const unrealizedUsd = summary.unrealizedPnlUsd;
  const currentUsd = summary.currentAccountValueUsd;
  const currentInr = summary.currentAccountValueInr;

  const toDisp = (usd: number, explicitInr?: number) =>
    currency === "INR" ? (explicitInr ?? usd * fx) : usd;
  const fmtVal = (usd: number, explicitInr?: number) =>
    currency === "INR" ? fmtInr(explicitInr ?? usd * fx) : fmtUsd(usd);

  const s1End = toDisp(initialUsd, initialInr);
  const s2Delta = toDisp(tradePnlUsd);
  const s2End = s1End + s2Delta;
  const s3Delta = toDisp(dividendsUsd);
  const s3End = s2End + s3Delta;
  const s4Delta = -toDisp(nonTradeFeesUsd);
  const s4End = s3End + s4Delta;
  const s5End = s4End;
  const s6Delta = toDisp(unrealizedUsd);
  const s6End = s5End + s6Delta;
  const s7End = toDisp(currentUsd, currentInr);

  const steps: WaterfallStep[] = [
    {
      key: "initial",
      label: "1. Initial Capital",
      shortLabel: "Initial",
      kind: "anchor",
      startVal: 0,
      endVal: s1End,
      deltaVal: s1End,
      usdVal: initialUsd,
      inrVal: initialInr,
      detail:
        currency === "INR"
          ? `Converted ${fmtInr(summary.totalInrInvested)} + GST/Bank Charges ${fmtInr(summary.totalFxChargesInr)}`
          : `Net USD credited from INR remittances`,
    },
    {
      key: "trade",
      label: "2. Realized Trade P&L",
      shortLabel: "Trade P&L",
      kind: tradePnlUsd >= 0 ? "positive" : "negative",
      startVal: s1End,
      endVal: s2End,
      deltaVal: s2Delta,
      usdVal: tradePnlUsd,
      inrVal: tradePnlUsd * fx,
      detail: `${summary.closedCount} closed trades (${summary.winningTrades}W / ${summary.losingTrades}L, Win Rate ${summary.winRatePct}%)`,
    },
    {
      key: "div",
      label: "3. Dividends",
      shortLabel: "Dividends",
      kind: "positive",
      startVal: s2End,
      endVal: s3End,
      deltaVal: s3Delta,
      usdVal: dividendsUsd,
      inrVal: dividendsUsd * fx,
      detail: `Gross dividends credited across US holdings`,
    },
    {
      key: "fees",
      label: "4. Fees & Taxes",
      shortLabel: "Fees/Tax",
      kind: "negative",
      startVal: s3End,
      endVal: s4End,
      deltaVal: s4Delta,
      usdVal: -nonTradeFeesUsd,
      inrVal: -nonTradeFeesUsd * fx,
      detail: `Standalone fees & dividend taxes (${fmtVal(summary.totalStandaloneFeesUsd)}) + open-lot buy fees`,
    },
    {
      key: "invested",
      label: "5. Net Account Capital",
      shortLabel: "Net Cap",
      kind: "anchor",
      startVal: 0,
      endVal: s5End,
      deltaVal: s5End,
      usdVal: totalInvestedUsd,
      inrVal: s5End / (currency === "INR" ? 1 : 1 / fx),
      detail: `Initial Capital + Net Realized (Trade P&L + Dividends − Fees)`,
    },
    {
      key: "unrealized",
      label: "6. Unrealized Profit",
      shortLabel: "Unrealized",
      kind: unrealizedUsd >= 0 ? "positive" : "negative",
      startVal: s5End,
      endVal: s6End,
      deltaVal: s6Delta,
      usdVal: unrealizedUsd,
      inrVal: summary.unrealizedPnlInr,
      detail: `${summary.openLotsCount} open lots: Cost ${fmtVal(summary.openCostBasisUsd)} → Market ${fmtVal(summary.openCurrentValueUsd)}`,
    },
    {
      key: "current",
      label: "7. Current Value",
      shortLabel: "Current",
      kind: "anchor",
      startVal: 0,
      endVal: s7End,
      deltaVal: s7End,
      usdVal: currentUsd,
      inrVal: currentInr,
      detail: `Holdings (Invested) ${fmtVal(summary.openCurrentValueUsd)} + Cash in Hand (Buying Power) ${fmtVal(summary.brokerCashUsd)}`,
    },
  ];

  const allVals = steps.flatMap((s) => [0, s.startVal, s.endVal]);
  const rawMax = Math.max(...allVals, 1);
  const rawMin = Math.min(...allVals, 0);
  const span = rawMax - rawMin || 1;
  const padTop = span * 0.14;
  const padBot = span * 0.06;
  const yMax = rawMax + padTop;
  const yMin = rawMin - padBot;
  const totalSpan = yMax - yMin || 1;

  const svgW = 760;
  const svgH = 230;
  const plotTop = 22;
  const plotBot = 192;
  const plotH = plotBot - plotTop;
  const toY = (val: number) => plotTop + ((yMax - val) / totalSpan) * plotH;

  const colW = svgW / steps.length;
  const barW = Math.min(58, colW * 0.56);
  const activeStep = steps.find((s) => s.key === activeKey) ?? steps[steps.length - 1];

  return (
    <div className="hify-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Capital Progression Waterfall ({currency})
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Initial Capital → Realized Split (Trade P&amp;L, Dividends, Fees) → Total Invested → Unrealized → Current Value
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#C8A951]" />
            Anchor Total
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#10B981]" />
            Gain / Inflow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F43F5E]" />
            Fee / Loss
          </span>
        </div>
      </div>

      <div className="mt-4 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="h-56 w-full min-w-[600px] select-none"
          role="img"
          aria-label="Capital Progression Waterfall Chart"
        >
          {/* Baseline y=0 */}
          <line
            x1={12}
            x2={svgW - 12}
            y1={toY(0)}
            y2={toY(0)}
            stroke="currentColor"
            strokeOpacity={0.18}
            strokeWidth={1}
          />

          {steps.map((step, i) => {
            const cx = colW * i + colW / 2;
            const x = cx - barW / 2;
            const yTop = toY(Math.max(step.startVal, step.endVal));
            const yBot = toY(Math.min(step.startVal, step.endVal));
            const h = Math.max(4, yBot - yTop);
            const isSelected = activeStep.key === step.key;

            const fill =
              step.kind === "anchor"
                ? "#C8A951"
                : step.kind === "positive"
                  ? "#10B981"
                  : "#F43F5E";

            const nextStep = steps[i + 1];
            const labelVal =
              step.kind === "anchor"
                ? formatCompact(step.endVal, currency)
                : `${step.deltaVal >= 0 ? "+" : ""}${formatCompact(step.deltaVal, currency)}`;

            return (
              <g
                key={step.key}
                className="cursor-pointer"
                onClick={() => setActiveKey(step.key)}
                onMouseEnter={() => setActiveKey(step.key)}
              >
                {/* Dashed connector to next step */}
                {nextStep && (
                  <line
                    x1={x + barW}
                    x2={colW * (i + 1) + colW / 2 - barW / 2}
                    y1={toY(step.endVal)}
                    y2={toY(step.endVal)}
                    stroke="currentColor"
                    strokeOpacity={0.25}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                )}

                {/* Bar */}
                <rect
                  x={x}
                  y={yTop}
                  width={barW}
                  height={h}
                  rx={5}
                  fill={fill}
                  fillOpacity={isSelected ? 1 : 0.82}
                  stroke={isSelected ? "currentColor" : "none"}
                  strokeOpacity={0.45}
                  strokeWidth={isSelected ? 1.5 : 0}
                />

                {/* Direct value label */}
                <text
                  x={cx}
                  y={Math.max(13, yTop - 6)}
                  textAnchor="middle"
                  className="fill-[var(--text-main)] font-mono text-[10.5px] font-semibold"
                >
                  {labelVal}
                </text>

                {/* X-axis label */}
                <text
                  x={cx}
                  y={svgH - 12}
                  textAnchor="middle"
                  className={`text-[10.5px] ${
                    isSelected
                      ? "fill-[var(--primary-deep)] dark:fill-[var(--primary)] font-semibold"
                      : "fill-[var(--text-muted)]"
                  }`}
                >
                  {step.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tier 2 Interactive Detail Strip */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3.5 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
            {activeStep.label}:
          </span>
          <span className="font-mono font-semibold tabular-nums text-[var(--text-main)]">
            {currency === "USD" ? fmtUsd(activeStep.usdVal) : fmtInr(activeStep.inrVal)}
          </span>
        </div>
        <span className="text-[11px] text-[var(--text-muted)]">{activeStep.detail}</span>
      </div>
    </div>
  );
}
