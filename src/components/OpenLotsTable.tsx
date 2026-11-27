"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Columns3,
  LayoutList,
  RefreshCw,
  X,
} from "lucide-react";
import { DisplayCurrency } from "@/components/CapitalWaterfallChart";
import { ColumnFilters, SortableTh, SortState } from "@/components/SortableTh";
import { computeOpenLotMetrics } from "@/lib/profit-engine";
import {
  ConsolidatedTickerSummary,
  GttStatus,
  MARKET_CAP_LIMITS,
  MarketCapTier,
  OpenLot,
  OpenLotComputedMetrics,
} from "@/lib/types";

export type OpenSortKey =
  | "status"
  | "source"
  | "executionMode"
  | "listName"
  | "strategy"
  | "marketCapTier"
  | "ticker"
  | "buyDate"
  | "daysHeld"
  | "monthLabel"
  | "remainingShares"
  | "buyPriceUsd"
  | "buyValueUsd"
  | "allocationPct"
  | "totalTickerAllocationPct"
  | "allocLeftPct"
  | "currentPriceUsd"
  | "todayChangePct"
  | "currentValueUsd"
  | "gainAmountUsd"
  | "currentGainPct"
  | "targetPriceUsd"
  | "remainingGainPct"
  | "potentialGainPct"
  | "totalPotentialGainUsd"
  | "annualReturnPct"
  | "athPriceUsd"
  | "dAthPct"
  | "sellGttPriceUsd"
  | "sellGttStatus"
  | "isSellGttReady30Pct"
  | "threeMonthTrigger"
  | "threeMonthDaysLeft"
  | "lrd"
  | "notes";

export interface OpenLotsTableProps {
  lots: OpenLot[];
  totalLotsCount: number;
  consolidated: ConsolidatedTickerSummary[];
  targetCapitalUsd: number;
  liveUsdInrRate: number;
  currency: DisplayCurrency;
  activeStrategyOptions: string[];
  openSort: SortState<OpenSortKey>;
  onSort: (key: OpenSortKey) => void;
  openColFilters: ColumnFilters<OpenSortKey>;
  onFilterChange: (key: OpenSortKey, val: string) => void;
  onLotPatch: (id: number, patch: Partial<OpenLot>) => Promise<void> | void;
  onCloseLot: (lot: OpenLot) => void;
  onRefreshQuotes: () => Promise<void>;
  refreshingQuotes: boolean;
  quoteBannerMsg: string | null;
}

const INPUT_CLS =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none";

const GTT_STATUS_OPTIONS: GttStatus[] = ["NONE", "PLANNED", "PLACED", "TRIGGERED"];

const fmtUsd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtInr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function fmtSignedPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function signedColorCls(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "text-[var(--text-muted)]";
  return n >= 0 ? "text-[#10B981]" : "text-[#F43F5E]";
}

export function getThreeMonthTriggerStatus(buyDate: string): {
  expiryDate: string;
  label: string;
  tone: "expired" | "soon" | "active";
  daysLeft: number;
} {
  const parts = buyDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return { expiryDate: "—", label: "Active", tone: "active", daysLeft: 0 };
  }
  const d = new Date(Date.UTC(parts[0], parts[1] - 1 + 3, parts[2]));
  const expiryDate = d.toISOString().slice(0, 10);
  const todayUtc = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const daysLeft = Math.round((d.getTime() - todayUtc) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { expiryDate, label: "Expired >3m", tone: "expired", daysLeft };
  if (daysLeft <= 14) return { expiryDate, label: `Expiring (${daysLeft}d)`, tone: "soon", daysLeft };
  return { expiryDate, label: `Active (${daysLeft}d)`, tone: "active", daysLeft };
}

/** Shared accessor for sorting and filtering Open Lots across both Compact and Full views. */
export function getOpenLotSortValue(
  lot: OpenLot,
  key: OpenSortKey,
  consolidatedMap: Map<string, ConsolidatedTickerSummary>,
  targetCapitalUsd: number
): string | number | null | undefined {
  const m = computeOpenLotMetrics(lot, consolidatedMap, targetCapitalUsd);
  switch (key) {
    case "status":
      return lot.remainingShares < lot.shares ? "Partial" : "Open";
    case "buyValueUsd":
      return m.buyValueRemainingUsd;
    case "isSellGttReady30Pct":
      return m.isSellGttReady30Pct ? "READY" : "WAIT";
    case "threeMonthTrigger":
      return getThreeMonthTriggerStatus(lot.buyDate).label;
    case "threeMonthDaysLeft":
      return getThreeMonthTriggerStatus(lot.buyDate).daysLeft;
    case "daysHeld":
      return m.daysHeld;
    case "monthLabel":
      return m.monthLabel;
    case "allocationPct":
      return m.allocationPct;
    case "totalTickerAllocationPct":
      return m.totalTickerAllocationPct;
    case "allocLeftPct":
      return m.allocLeftPct;
    case "currentValueUsd":
      return m.currentValueUsd;
    case "gainAmountUsd":
      return m.gainAmountUsd;
    case "currentGainPct":
      return m.currentGainPct;
    case "remainingGainPct":
      return m.remainingGainPct;
    case "potentialGainPct":
      return m.potentialGainPct;
    case "totalPotentialGainUsd":
      return m.totalPotentialGainUsd;
    case "annualReturnPct":
      return m.annualReturnPct;
    case "dAthPct":
      return m.dAthPct;
    default:
      return lot[key];
  }
}

function formatQuoteTimestamp(iso: string | null): string {
  if (!iso) return "Never refreshed";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThreeMonthTriggerPill({ buyDate }: { buyDate: string }) {
  const trig = getThreeMonthTriggerStatus(buyDate);
  const badgeCls =
    trig.tone === "expired"
      ? "border-[#F43F5E]/30 bg-[#F43F5E]/10 text-[#F43F5E]"
      : trig.tone === "soon"
        ? "border-[#EA580C]/30 bg-[#EA580C]/10 text-[#EA580C]"
        : "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]";
  const dotCls =
    trig.tone === "expired"
      ? "bg-[#F43F5E]"
      : trig.tone === "soon"
        ? "bg-[#EA580C]"
        : "bg-[#10B981]";

  return (
    <div>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${badgeCls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
        {trig.label}
      </span>
      <div className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
        Exp {trig.expiryDate}
      </div>
    </div>
  );
}

interface MetricOption<K extends string> {
  key: K;
  label: string;
  filterOptions?: string[];
  filterPlaceholder?: string;
}

/** Compact multi-metric column header with mini-pill switcher for sort & filter key. */
function MultiMetricTh<K extends string>({
  label,
  options,
  activeKey,
  onMetricChange,
  sort,
  onSort,
  colFilters,
  onFilterChange,
  className = "px-3 py-2.5 whitespace-nowrap align-top",
}: {
  label: string;
  options: MetricOption<K>[];
  activeKey: K;
  onMetricChange: (key: K) => void;
  sort: SortState<K>;
  onSort: (key: K) => void;
  colFilters: ColumnFilters<K>;
  onFilterChange: (key: K, val: string) => void;
  className?: string;
}) {
  const activeOpt = options.find((o) => o.key === activeKey) ?? options[0];
  const isSorted = sort.key === activeOpt.key;
  const filterValue = colFilters[activeOpt.key] ?? "";
  const hasFilter = filterValue.trim() !== "";

  const handlePillClick = (key: K) => {
    onMetricChange(key);
    // If this column is currently driving the table sort, keep it sorted by the newly selected metric.
    if (options.some((o) => o.key === sort.key) && sort.key !== key) {
      onSort(key);
    }
  };

  return (
    <th className={className}>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => onSort(activeOpt.key)}
          className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider transition hover:text-[var(--primary-deep)] dark:hover:text-[var(--primary)] ${
            isSorted ? "text-[var(--primary-deep)] dark:text-[var(--primary)]" : "text-[var(--text-main)]"
          }`}
        >
          <span>{label}</span>
          {isSorted ? (
            sort.dir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-45" />
          )}
        </button>

        <div className="flex flex-wrap items-center gap-1">
          {options.map((opt) => {
            const selected = opt.key === activeOpt.key;
            const optHasFilter = Boolean(colFilters[opt.key]?.trim());
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handlePillClick(opt.key)}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none normal-case transition whitespace-nowrap ${
                  selected
                    ? "border-[var(--primary)]/50 bg-[var(--primary)]/15 font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]"
                    : "border-[var(--border)] bg-[var(--surface)] font-normal text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                <span>{opt.label}</span>
                {optHasFilter && !selected && (
                  <span className="h-1 w-1 rounded-full bg-[var(--primary)]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative flex w-full min-w-[72px] items-center">
          {activeOpt.filterOptions ? (
            <select
              value={filterValue}
              onChange={(e) => onFilterChange(activeOpt.key, e.target.value)}
              aria-label={`Filter ${label} (${activeOpt.label})`}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-normal normal-case text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="">All</option>
              {activeOpt.filterOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type="text"
                value={filterValue}
                onChange={(e) => onFilterChange(activeOpt.key, e.target.value)}
                placeholder={activeOpt.filterPlaceholder ?? "Filter..."}
                aria-label={`Filter ${label} (${activeOpt.label})`}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 pr-4 text-[10px] font-normal normal-case text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 focus:border-[var(--primary)] focus:outline-none"
              />
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => onFilterChange(activeOpt.key, "")}
                  title={`Clear ${activeOpt.label} filter`}
                  className="absolute right-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </th>
  );
}

export function OpenLotsTable({
  lots,
  totalLotsCount,
  consolidated,
  targetCapitalUsd,
  liveUsdInrRate,
  currency,
  activeStrategyOptions,
  openSort,
  onSort,
  openColFilters,
  onFilterChange,
  onLotPatch,
  onCloseLot,
  onRefreshQuotes,
  refreshingQuotes,
  quoteBannerMsg,
}: OpenLotsTableProps) {
  const [fullView, setFullView] = useState(false);
  const [expandedLotIds, setExpandedLotIds] = useState<Record<number, boolean>>({});
  const [cmpMetric, setCmpMetric] = useState<OpenSortKey>("currentGainPct");
  const [targetMetric, setTargetMetric] = useState<OpenSortKey>("remainingGainPct");
  const [gttMetric, setGttMetric] = useState<OpenSortKey>("sellGttStatus");

  const consolidatedMap = useMemo(() => {
    const map = new Map<string, ConsolidatedTickerSummary>();
    for (const item of consolidated) {
      map.set(item.ticker.toUpperCase(), item);
    }
    return map;
  }, [consolidated]);

  const missingCmpCount = useMemo(
    () =>
      lots.filter(
        (l) => l.remainingShares > 0 && (l.currentPriceUsd == null || l.currentPriceUsd <= 0)
      ).length,
    [lots]
  );

  const latestQuoteUpdatedAt = useMemo(() => {
    let latest: string | null = null;
    for (const l of lots) {
      if (l.quoteUpdatedAt && (!latest || l.quoteUpdatedAt > latest)) {
        latest = l.quoteUpdatedAt;
      }
    }
    return latest;
  }, [lots]);

  const fmtMoney = (usd: number | null): string => {
    if (usd === null || !Number.isFinite(usd)) return "—";
    return currency === "INR" ? fmtInr(usd * liveUsdInrRate) : fmtUsd(usd);
  };

  const toggleExpand = (id: number) => {
    setExpandedLotIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderStrategySelect = (lot: OpenLot, widthCls = "w-32") => (
    <select
      value={lot.strategy}
      onChange={(e) => onLotPatch(lot.id, { strategy: e.target.value })}
      className={`${widthCls} ${INPUT_CLS}`}
    >
      <option value="">Select strategy...</option>
      {lot.strategy && !activeStrategyOptions.includes(lot.strategy) && (
        <option value={lot.strategy}>{lot.strategy}</option>
      )}
      {activeStrategyOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );

  const renderCmpInput = (lot: OpenLot) => (
    <input
      key={`cmp-${lot.id}-${lot.currentPriceUsd ?? "null"}`}
      type="number"
      step="0.01"
      defaultValue={lot.currentPriceUsd ?? ""}
      placeholder="Enter CMP"
      onBlur={(e) => {
        const nextVal = e.target.value.trim() ? Number(e.target.value) : null;
        if (nextVal !== lot.currentPriceUsd) {
          onLotPatch(lot.id, {
            currentPriceUsd: nextVal,
            quoteSource: nextVal !== null ? "MANUAL" : lot.quoteSource,
          });
        }
      }}
      className={`w-22 font-mono ${INPUT_CLS}`}
    />
  );

  const renderTargetInput = (lot: OpenLot) => (
    <input
      key={`target-${lot.id}-${lot.targetPriceUsd ?? "null"}`}
      type="number"
      step="0.01"
      defaultValue={lot.targetPriceUsd ?? ""}
      placeholder="Target"
      onBlur={(e) => {
        const nextVal = e.target.value.trim() ? Number(e.target.value) : null;
        if (nextVal !== lot.targetPriceUsd) {
          onLotPatch(lot.id, { targetPriceUsd: nextVal });
        }
      }}
      className={`w-22 font-mono ${INPUT_CLS}`}
    />
  );

  const renderSellGttInput = (lot: OpenLot) => (
    <input
      key={`gtt-${lot.id}-${lot.sellGttPriceUsd ?? "null"}`}
      type="number"
      step="0.01"
      defaultValue={lot.sellGttPriceUsd ?? ""}
      placeholder="Sell GTT"
      onBlur={(e) => {
        const nextVal = e.target.value.trim() ? Number(e.target.value) : null;
        if (nextVal !== lot.sellGttPriceUsd) {
          onLotPatch(lot.id, { sellGttPriceUsd: nextVal });
        }
      }}
      className={`w-22 font-mono ${INPUT_CLS}`}
    />
  );

  const renderGttStatusSelect = (lot: OpenLot) => (
    <select
      value={lot.sellGttStatus}
      onChange={(e) => onLotPatch(lot.id, { sellGttStatus: e.target.value as GttStatus })}
      className={INPUT_CLS}
    >
      {GTT_STATUS_OPTIONS.map((st) => (
        <option key={st} value={st}>
          {st}
        </option>
      ))}
    </select>
  );

  const renderCapTierSelect = (lot: OpenLot) => (
    <select
      value={lot.marketCapTier ?? ""}
      onChange={(e) =>
        onLotPatch(lot.id, {
          marketCapTier: (e.target.value || null) as MarketCapTier | null,
        })
      }
      className={INPUT_CLS}
    >
      <option value="">Select</option>
      {(Object.keys(MARKET_CAP_LIMITS) as MarketCapTier[]).map((t) => (
        <option key={t} value={t}>
          {t} ({MARKET_CAP_LIMITS[t]}%)
        </option>
      ))}
    </select>
  );

  const sortHeaderProps = (label: string, sortKey: OpenSortKey, defaultDir?: "asc" | "desc", filterOptions?: string[]) => ({
    label,
    sortKey,
    sort: openSort,
    onSort: (k: OpenSortKey) => onSort(k),
    filterValue: openColFilters[sortKey] ?? "",
    onFilterChange: (v: string) => onFilterChange(sortKey, v),
    filterOptions,
    ...(defaultDir ? { onSort: (k: OpenSortKey) => onSort(k) } : {}),
  });

  return (
    <div className="space-y-3">
      {/* Live Quote Bar & View Toggle */}
      <div className="hify-card flex flex-wrap items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void onRefreshQuotes()}
            disabled={refreshingQuotes}
            className="btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingQuotes ? "animate-spin" : ""}`} />
            {refreshingQuotes ? "Refreshing Yahoo Quotes..." : "Refresh Live Quotes (Yahoo)"}
          </button>

          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            Last quote: <strong className="text-[var(--text-main)]">{formatQuoteTimestamp(latestQuoteUpdatedAt)}</strong>
          </span>

          <span className="rounded-full border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
            ₹{liveUsdInrRate.toFixed(2)}/$
          </span>

          {missingCmpCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EA580C]/30 bg-[#EA580C]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#EA580C]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {missingCmpCount} {missingCmpCount === 1 ? "lot" : "lots"} missing CMP — refresh quotes or enter manually
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">
            {lots.length} / {totalLotsCount} lots
          </span>
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--section-bg)] p-0.5">
            <button
              type="button"
              onClick={() => setFullView(false)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                !fullView
                  ? "bg-[var(--surface)] text-[var(--primary-deep)] shadow-xs dark:text-[var(--primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              <LayoutList className="h-3 w-3" />
              Compact
            </button>
            <button
              type="button"
              onClick={() => setFullView(true)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                fullView
                  ? "bg-[var(--surface)] text-[var(--primary-deep)] shadow-xs dark:text-[var(--primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              <Columns3 className="h-3 w-3" />
              Full View
            </button>
          </div>
        </div>
      </div>

      {quoteBannerMsg && (
        <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-3.5 py-2 text-xs text-[var(--text-main)]">
          {quoteBannerMsg}
        </div>
      )}

      {/* Table Surface */}
      <div className="hify-card overflow-x-auto rounded-xl">
        {!fullView ? (
          /* TIER 1: COMPACT 8-COLUMN TABLE + TIER 2 EXPANDABLE INSIGHTS */
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="border-b-2 border-[var(--border)] bg-[var(--section-bg)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)]">
              <tr>
                <SortableTh {...sortHeaderProps("ticker", "ticker")} label="Stock" />
                <SortableTh {...sortHeaderProps("buyDate", "buyDate")} label="Buy Date" />
                <SortableTh {...sortHeaderProps("buyValueUsd", "buyValueUsd")} label="Qty & Cost" />
                <MultiMetricTh
                  label="CMP & P&L"
                  activeKey={cmpMetric}
                  onMetricChange={setCmpMetric}
                  options={[
                    { key: "currentGainPct", label: "Gain %" },
                    { key: "todayChangePct", label: "Today %" },
                    { key: "currentValueUsd", label: "Value" },
                    { key: "currentPriceUsd", label: "CMP" },
                  ]}
                  sort={openSort}
                  onSort={onSort}
                  colFilters={openColFilters}
                  onFilterChange={onFilterChange}
                />
                <MultiMetricTh
                  label="Target & Readiness"
                  activeKey={targetMetric}
                  onMetricChange={setTargetMetric}
                  options={[
                    { key: "remainingGainPct", label: "Rem %" },
                    { key: "isSellGttReady30Pct", label: "GTT Ready", filterOptions: ["READY", "WAIT"] },
                  ]}
                  sort={openSort}
                  onSort={onSort}
                  colFilters={openColFilters}
                  onFilterChange={onFilterChange}
                />
                <MultiMetricTh
                  label="Sell GTT"
                  activeKey={gttMetric}
                  onMetricChange={setGttMetric}
                  options={[
                    { key: "sellGttStatus", label: "Status", filterOptions: GTT_STATUS_OPTIONS },
                    { key: "threeMonthDaysLeft", label: "Days Left" },
                  ]}
                  sort={openSort}
                  onSort={onSort}
                  colFilters={openColFilters}
                  onFilterChange={onFilterChange}
                />
                <SortableTh
                  {...sortHeaderProps("strategy", "strategy", "asc", activeStrategyOptions)}
                  label="Strategy"
                />
                <th className="px-3 py-3 whitespace-nowrap align-top">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lots.map((lot) => {
                const m: OpenLotComputedMetrics = computeOpenLotMetrics(
                  lot,
                  consolidatedMap,
                  targetCapitalUsd
                );
                const cons = consolidatedMap.get(lot.ticker.toUpperCase());
                const isExpanded = Boolean(expandedLotIds[lot.id]);
                const hasCmp = lot.currentPriceUsd != null && lot.currentPriceUsd > 0;

                return (
                  <Fragment key={lot.id}>
                    <tr className="hover:bg-[var(--primary-soft)]/50">
                      {/* 1. Stock */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[var(--text-main)]">{lot.ticker}</span>
                          {lot.marketCapTier && (
                            <span className="rounded border border-[var(--border)] bg-[var(--section-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
                              {lot.marketCapTier}
                            </span>
                          )}
                        </div>
                        <div className="max-w-[170px] truncate text-[11px] text-[var(--text-muted)]">
                          {lot.companyName}
                        </div>
                        {lot.listName && (
                          <div className="mt-0.5 inline-block rounded bg-[var(--section-bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                            {lot.listName}
                          </div>
                        )}
                      </td>

                      {/* 2. Buy Date */}
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <div className="font-mono text-[var(--text-main)]">{lot.buyDate}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                          {m.daysHeld}d held
                        </div>
                      </td>

                      {/* 3. Qty & Cost */}
                      <td className="px-3 py-2.5 align-top whitespace-nowrap font-mono">
                        <div className="font-medium text-[var(--text-main)]">
                          {lot.remainingShares.toFixed(4)} sh
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          @ {fmtUsd(lot.buyPriceUsd)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-[var(--text-main)]">
                          {fmtMoney(m.buyValueRemainingUsd)}
                        </div>
                      </td>

                      {/* 4. CMP & P&L */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          {renderCmpInput(lot)}
                          {lot.todayChangePct != null && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                lot.todayChangePct >= 0
                                  ? "bg-[#10B981]/10 text-[#10B981]"
                                  : "bg-[#F43F5E]/10 text-[#F43F5E]"
                              }`}
                            >
                              {fmtSignedPct(lot.todayChangePct)}
                            </span>
                          )}
                        </div>
                        {hasCmp ? (
                          <div className="mt-1 space-y-0.5 font-mono text-[11px]">
                            <div className="text-[var(--text-main)]">
                              Val: <span className="font-semibold">{fmtMoney(m.currentValueUsd)}</span>
                            </div>
                            <div className={`font-semibold ${signedColorCls(m.gainAmountUsd)}`}>
                              {m.gainAmountUsd !== null && m.gainAmountUsd >= 0 ? "+" : ""}
                              {fmtMoney(m.gainAmountUsd)} ({fmtSignedPct(m.currentGainPct)})
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">—</div>
                        )}
                      </td>

                      {/* 5. Target & Readiness */}
                      <td className="px-3 py-2.5 align-top">
                        {renderTargetInput(lot)}
                        <div className="mt-1 font-mono text-[11px]">
                          {m.remainingGainPct !== null ? (
                            <span className="text-[var(--primary-deep)] dark:text-[var(--primary)]">
                              {fmtSignedPct(m.remainingGainPct)} rem
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </div>
                        {m.isSellGttReady30Pct && (
                          <span className="mt-1 inline-flex items-center rounded-full border border-[#10B981]/35 bg-[#10B981]/15 px-2 py-0.5 text-[10px] font-semibold text-[#10B981] whitespace-nowrap">
                            GTT Ready (≤30%)
                          </span>
                        )}
                      </td>

                      {/* 6. Sell GTT */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            {renderSellGttInput(lot)}
                            {renderGttStatusSelect(lot)}
                          </div>
                          <ThreeMonthTriggerPill buyDate={lot.buyDate} />
                        </div>
                      </td>

                      {/* 7. Strategy */}
                      <td className="px-3 py-2.5 align-top">{renderStrategySelect(lot)}</td>

                      {/* 8. Action */}
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onCloseLot(lot)}
                            className="min-h-[34px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-medium text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
                          >
                            Close
                          </button>
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(lot.id)}
                            className="btn-secondary inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
                            title="Toggle lot insights & notes"
                          >
                            Insights
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* TIER 2: EXPANDABLE ROW INSIGHTS */}
                    {isExpanded && (
                      <tr className="bg-[var(--section-bg)]/70">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {/* Card 1: Sizing */}
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-deep)] dark:text-[var(--primary)]">
                                Sizing &amp; Cap Exposure
                              </div>
                              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                                <span className="text-[var(--text-muted)]">% Alloc (Lot)</span>
                                <span className="text-right font-mono font-semibold text-[var(--text-main)]">
                                  {m.allocationPct.toFixed(2)}%
                                </span>
                                <span className="text-[var(--text-muted)]">Total % Alloc</span>
                                <span className="text-right font-mono font-semibold text-[var(--text-main)]">
                                  {m.totalTickerAllocationPct.toFixed(2)}%
                                </span>
                                <span className="text-[var(--text-muted)]">% Alloc Left</span>
                                <span
                                  className={`text-right font-mono font-semibold ${
                                    m.allocLeftPct === null
                                      ? "text-[var(--text-muted)]"
                                      : m.allocLeftPct < 0
                                        ? "text-[#F43F5E]"
                                        : "text-[#10B981]"
                                  }`}
                                >
                                  {m.allocLeftPct !== null ? `${m.allocLeftPct.toFixed(2)}%` : "—"}
                                </span>
                                <span className="text-[var(--text-muted)]">Cap Tier</span>
                                <div className="text-right">{renderCapTierSelect(lot)}</div>
                              </div>
                            </div>

                            {/* Card 2: Upside & Returns */}
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-deep)] dark:text-[var(--primary)]">
                                Upside &amp; Returns
                              </div>
                              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                                <span className="text-[var(--text-muted)]">Poten. Gain %</span>
                                <span className={`text-right font-mono font-semibold ${signedColorCls(m.potentialGainPct)}`}>
                                  {fmtSignedPct(m.potentialGainPct)}
                                </span>
                                <span className="text-[var(--text-muted)]">Tot. Gain ({currency})</span>
                                <span className={`text-right font-mono font-semibold ${signedColorCls(m.totalPotentialGainUsd)}`}>
                                  {fmtMoney(m.totalPotentialGainUsd)}
                                </span>
                                <span className="text-[var(--text-muted)]">Annual Return %</span>
                                <span className={`text-right font-mono font-semibold ${signedColorCls(m.annualReturnPct)}`}>
                                  {fmtSignedPct(m.annualReturnPct)}
                                </span>
                                <span className="text-[var(--text-muted)]">Current Cons. Gain %</span>
                                <span
                                  className={`text-right font-mono font-semibold ${signedColorCls(
                                    cons ? cons.unrealizedPnlPct : null
                                  )}`}
                                >
                                  {cons ? fmtSignedPct(cons.unrealizedPnlPct) : "—"}
                                </span>
                                <span className="text-[var(--text-muted)]">D-ATH %</span>
                                <span className={`text-right font-mono font-semibold ${signedColorCls(m.dAthPct)}`}>
                                  {fmtSignedPct(m.dAthPct)}
                                </span>
                              </div>
                            </div>

                            {/* Card 3: Metadata & Notes */}
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-deep)] dark:text-[var(--primary)]">
                                Metadata &amp; Notes
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[var(--text-muted)]">Acc / Mode / FY</span>
                                  <span className="font-mono text-[11px] font-medium text-[var(--text-main)]">
                                    {lot.source} · {lot.executionMode} · {m.monthLabel}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <label htmlFor={`lrd-${lot.id}`} className="text-[var(--text-muted)]">
                                    LRD
                                  </label>
                                  <input
                                    id={`lrd-${lot.id}`}
                                    key={`lrd-${lot.id}-${lot.lrd ?? "null"}`}
                                    type="date"
                                    defaultValue={lot.lrd ?? ""}
                                    onBlur={(e) => {
                                      const nextVal = e.target.value.trim() || null;
                                      if (nextVal !== (lot.lrd ?? null)) {
                                        onLotPatch(lot.id, { lrd: nextVal });
                                      }
                                    }}
                                    className={`font-mono text-[11px] ${INPUT_CLS}`}
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`notes-${lot.id}`} className="mb-1 block text-[var(--text-muted)]">
                                    Comments / Notes
                                  </label>
                                  <input
                                    id={`notes-${lot.id}`}
                                    key={`notes-${lot.id}-${lot.notes}`}
                                    type="text"
                                    defaultValue={lot.notes}
                                    placeholder="Add lot thesis or GTT notes..."
                                    onBlur={(e) => {
                                      if (e.target.value !== lot.notes) {
                                        onLotPatch(lot.id, { notes: e.target.value });
                                      }
                                    }}
                                    className={`w-full text-[11px] ${INPUT_CLS}`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* TIER 3: FULL VIEW (ALL 30+ SPREADSHEET COLUMNS) */
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="border-b-2 border-[var(--border)] bg-[var(--section-bg)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)]">
              <tr>
                <SortableTh {...sortHeaderProps("status", "status")} label="Status" />
                <SortableTh {...sortHeaderProps("source", "source")} label="Acc" />
                <SortableTh {...sortHeaderProps("executionMode", "executionMode", "asc", ["GTT", "Instant"])} label="GTT/Inst" />
                <SortableTh {...sortHeaderProps("listName", "listName")} label="List" />
                <SortableTh {...sortHeaderProps("strategy", "strategy", "asc", activeStrategyOptions)} label="Strategy" />
                <SortableTh {...sortHeaderProps("marketCapTier", "marketCapTier", "asc", ["MEGA", "LARGE", "MID", "SMALL"])} label="Cap Tier" />
                <SortableTh {...sortHeaderProps("ticker", "ticker")} label="Stock" />
                <SortableTh {...sortHeaderProps("buyDate", "buyDate")} label="Buy Date" />
                <SortableTh {...sortHeaderProps("daysHeld", "daysHeld")} label="#Days" />
                <SortableTh {...sortHeaderProps("monthLabel", "monthLabel")} label="FY Month" />
                <SortableTh {...sortHeaderProps("remainingShares", "remainingShares")} label="Shares" />
                <SortableTh {...sortHeaderProps("buyPriceUsd", "buyPriceUsd")} label="Buy Price ($)" />
                <SortableTh {...sortHeaderProps("buyValueUsd", "buyValueUsd")} label={`Buy Val (${currency})`} />
                <SortableTh {...sortHeaderProps("allocationPct", "allocationPct")} label="% Alloc" />
                <SortableTh {...sortHeaderProps("totalTickerAllocationPct", "totalTickerAllocationPct")} label="Tot % Alloc" />
                <SortableTh {...sortHeaderProps("allocLeftPct", "allocLeftPct")} label="% Alloc Left" />
                <SortableTh {...sortHeaderProps("currentPriceUsd", "currentPriceUsd")} label="CMP ($)" />
                <SortableTh {...sortHeaderProps("todayChangePct", "todayChangePct")} label="Today %" />
                <SortableTh {...sortHeaderProps("currentValueUsd", "currentValueUsd")} label={`Curr Val (${currency})`} />
                <SortableTh {...sortHeaderProps("gainAmountUsd", "gainAmountUsd")} label={`Gain (${currency})`} />
                <SortableTh {...sortHeaderProps("currentGainPct", "currentGainPct")} label="Curr. Gain %" />
                <SortableTh {...sortHeaderProps("targetPriceUsd", "targetPriceUsd")} label="Target ($)" />
                <SortableTh {...sortHeaderProps("remainingGainPct", "remainingGainPct")} label="Rem. Gain %" />
                <SortableTh {...sortHeaderProps("potentialGainPct", "potentialGainPct")} label="Poten. Gain %" />
                <SortableTh {...sortHeaderProps("totalPotentialGainUsd", "totalPotentialGainUsd")} label={`Tot. Gain (${currency})`} />
                <SortableTh {...sortHeaderProps("annualReturnPct", "annualReturnPct")} label="Annual Ret %" />
                <SortableTh {...sortHeaderProps("athPriceUsd", "athPriceUsd")} label="ATH ($)" />
                <SortableTh {...sortHeaderProps("dAthPct", "dAthPct")} label="D-ATH %" />
                <SortableTh {...sortHeaderProps("sellGttPriceUsd", "sellGttPriceUsd")} label="Sell GTT ($)" />
                <SortableTh {...sortHeaderProps("sellGttStatus", "sellGttStatus", "asc", GTT_STATUS_OPTIONS)} label="GTT Status" />
                <SortableTh {...sortHeaderProps("threeMonthTrigger", "threeMonthTrigger")} label="3M Trigger" />
                <SortableTh {...sortHeaderProps("lrd", "lrd")} label="LRD" />
                <SortableTh {...sortHeaderProps("notes", "notes")} label="Comments / Notes" />
                <th className="px-3 py-3 whitespace-nowrap align-top">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lots.map((lot) => {
                const m = computeOpenLotMetrics(lot, consolidatedMap, targetCapitalUsd);
                const statusLabel = lot.remainingShares < lot.shares ? "Partial" : "Open";
                return (
                  <tr key={lot.id} className="hover:bg-[var(--primary-soft)]/50">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--section-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-main)]">
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-muted)]">{lot.source}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-muted)]">{lot.executionMode}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-muted)]">{lot.listName || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{renderStrategySelect(lot)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{renderCapTierSelect(lot)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-[var(--text-main)]">{lot.ticker}</div>
                      <div className="max-w-[140px] truncate text-[11px] text-[var(--text-muted)]">{lot.companyName}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{lot.buyDate}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{m.daysHeld}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[var(--text-muted)]">{m.monthLabel}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{lot.remainingShares.toFixed(4)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{fmtUsd(lot.buyPriceUsd)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono font-medium">{fmtMoney(m.buyValueRemainingUsd)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{m.allocationPct.toFixed(2)}%</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{m.totalTickerAllocationPct.toFixed(2)}%</td>
                    <td
                      className={`px-3 py-2.5 whitespace-nowrap font-mono font-semibold ${
                        m.allocLeftPct === null
                          ? "text-[var(--text-muted)]"
                          : m.allocLeftPct < 0
                            ? "text-[#F43F5E]"
                            : "text-[#10B981]"
                      }`}
                    >
                      {m.allocLeftPct !== null ? `${m.allocLeftPct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{renderCmpInput(lot)}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${signedColorCls(lot.todayChangePct)}`}>
                      {fmtSignedPct(lot.todayChangePct)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono">{fmtMoney(m.currentValueUsd)}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono font-semibold ${signedColorCls(m.gainAmountUsd)}`}>
                      {m.gainAmountUsd !== null && m.gainAmountUsd >= 0 ? "+" : ""}
                      {fmtMoney(m.gainAmountUsd)}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono font-semibold ${signedColorCls(m.currentGainPct)}`}>
                      {fmtSignedPct(m.currentGainPct)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{renderTargetInput(lot)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[var(--primary-deep)] dark:text-[var(--primary)]">
                      {fmtSignedPct(m.remainingGainPct)}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${signedColorCls(m.potentialGainPct)}`}>
                      {fmtSignedPct(m.potentialGainPct)}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${signedColorCls(m.totalPotentialGainUsd)}`}>
                      {fmtMoney(m.totalPotentialGainUsd)}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${signedColorCls(m.annualReturnPct)}`}>
                      {fmtSignedPct(m.annualReturnPct)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[var(--text-muted)]">
                      {lot.athPriceUsd != null ? fmtUsd(lot.athPriceUsd) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-mono ${signedColorCls(m.dAthPct)}`}>
                      {fmtSignedPct(m.dAthPct)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{renderSellGttInput(lot)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{renderGttStatusSelect(lot)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <ThreeMonthTriggerPill buyDate={lot.buyDate} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <input
                        key={`full-lrd-${lot.id}-${lot.lrd ?? "null"}`}
                        type="date"
                        defaultValue={lot.lrd ?? ""}
                        onBlur={(e) => {
                          const nextVal = e.target.value.trim() || null;
                          if (nextVal !== (lot.lrd ?? null)) {
                            onLotPatch(lot.id, { lrd: nextVal });
                          }
                        }}
                        className={`font-mono text-[11px] ${INPUT_CLS}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <input
                        key={`full-notes-${lot.id}-${lot.notes}`}
                        type="text"
                        defaultValue={lot.notes}
                        placeholder="Notes..."
                        onBlur={(e) => {
                          if (e.target.value !== lot.notes) {
                            onLotPatch(lot.id, { notes: e.target.value });
                          }
                        }}
                        className={`w-40 text-[11px] ${INPUT_CLS}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onCloseLot(lot)}
                        className="min-h-[34px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-medium text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
