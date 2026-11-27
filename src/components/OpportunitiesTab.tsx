"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import {
  ConsolidatedTickerSummary,
  MARKET_CAP_LIMITS,
  MarketCapTier,
  Opportunity,
  OpportunityActionType,
  OrderTypeOption,
  Strategy,
} from "@/lib/types";
import {
  ColumnFilters,
  SortableTh,
  SortState,
  filterAndSortRows,
  toggleSort,
} from "./SortableTh";

interface OpportunitiesTabProps {
  opportunities: Opportunity[];
  consolidated: ConsolidatedTickerSummary[];
  targetCapitalUsd: number;
  strategies: Strategy[];
  onRefresh: () => Promise<void> | void;
}

const ORDER_TYPE_LABELS: Record<OrderTypeOption, string> = {
  "90D_TRIGGER": "90-Day Trigger",
  LIMIT: "Limit Order",
  MARKET: "Market / Instant",
};

const ACTION_TYPE_LABELS: Record<OpportunityActionType, string> = {
  PLACE_ORDER: "Place Buy Order",
  REVIEW_CHART: "Review Chart",
  WATCH: "Watchlist",
};

type OppSortKey =
  | "ticker"
  | "strategy"
  | "actionType"
  | "plannedOrderType"
  | "triggerPriceUsd"
  | "targetCapitalUsd"
  | "actionDueDate"
  | "actionStatus";

export function OpportunitiesTab({
  opportunities,
  consolidated,
  targetCapitalUsd,
  strategies,
  onRefresh,
}: OpportunitiesTabProps) {
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [strategyName, setStrategyName] = useState("");
  const [marketCapTier, setMarketCapTier] = useState<MarketCapTier>("LARGE");
  const [actionType, setActionType] = useState<OpportunityActionType>("PLACE_ORDER");
  const [plannedOrderType, setPlannedOrderType] = useState<OrderTypeOption>("90D_TRIGGER");
  const [triggerPriceUsd, setTriggerPriceUsd] = useState("");
  const [targetCapitalInput, setTargetCapitalInput] = useState("250");
  const [actionDueDate, setActionDueDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [thesisNotes, setThesisNotes] = useState("");
  const [filterMode, setFilterMode] = useState<"PENDING" | "ALL">("PENDING");
  const [sort, setSort] = useState<SortState<OppSortKey>>({ key: "actionDueDate", dir: "asc" });
  const [colFilters, setColFilters] = useState<ColumnFilters<OppSortKey>>({});
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const activeStrategyNames = useMemo(
    () => strategies.filter((s) => s.isActive).map((s) => s.name),
    [strategies]
  );

  const exposureByTicker = useMemo(() => {
    const map = new Map<string, ConsolidatedTickerSummary>();
    for (const c of consolidated) {
      map.set(c.ticker.toUpperCase(), c);
    }
    return map;
  }, [consolidated]);

  const normTicker = ticker.trim().toUpperCase();
  const existingExposure = normTicker ? exposureByTicker.get(normTicker) : undefined;
  const currentAllocPct = existingExposure?.allocationPctOfTarget ?? 0;
  const maxAllowedPct = MARKET_CAP_LIMITS[marketCapTier];
  const plannedCapital = Number(targetCapitalInput) || 0;
  const plannedTrigger = Number(triggerPriceUsd) || 0;
  const plannedQty = plannedTrigger > 0 && plannedCapital > 0 ? plannedCapital / plannedTrigger : 0;
  const projectedAllocPct =
    targetCapitalUsd > 0
      ? currentAllocPct + (plannedCapital / targetCapitalUsd) * 100
      : currentAllocPct;
  const exceedsCap = projectedAllocPct > maxAllowedPct;

  async function handleAddOpportunity(e: React.FormEvent) {
    e.preventDefault();
    if (!normTicker) return;
    if (!strategyName.trim()) {
      setStatusMsg("Please select a Strategy (mandatory).");
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: normTicker,
          companyName: companyName.trim() || normTicker,
          strategy: strategyName.trim(),
          marketCapTier,
          actionType,
          plannedOrderType,
          triggerPriceUsd: plannedTrigger > 0 ? plannedTrigger : null,
          targetCapitalUsd: plannedCapital > 0 ? plannedCapital : null,
          actionDueDate: actionDueDate || null,
          actionStatus: "PENDING",
          thesisNotes: thesisNotes.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatusMsg(data.error || "Failed to save opportunity");
      } else {
        setTicker("");
        setCompanyName("");
        setTriggerPriceUsd("");
        setThesisNotes("");
        setStatusMsg(`Saved ${normTicker} with ${ORDER_TYPE_LABELS[plannedOrderType]} action.`);
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSeedExcel() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedDefault: true }),
      });
      const data = (await res.json()) as { imported?: number; updated?: number; error?: string };
      if (!res.ok) {
        setStatusMsg(data.error || "Seed failed");
      } else {
        setStatusMsg(
          `Seeded potential_stocks.xlsx: ${data.imported ?? 0} added, ${data.updated ?? 0} existing.`
        );
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function markStatus(id: number, actionStatus: "PENDING" | "DONE" | "DISMISSED") {
    setBusy(true);
    try {
      await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionStatus }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteOpp(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/opportunities/${id}`, { method: "DELETE" });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateStrategy(id: number, strategy: string) {
    setBusy(true);
    try {
      await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  const baseRows =
    filterMode === "PENDING"
      ? opportunities.filter((o) => o.actionStatus === "PENDING")
      : opportunities;

  const visibleRows = useMemo(() => {
    return filterAndSortRows(baseRows, colFilters, sort, (opp, key) => {
      switch (key) {
        case "ticker":
          return `${opp.ticker} ${opp.companyName} ${opp.leaderMention}`;
        case "strategy":
          return opp.strategy;
        case "actionType":
          return ACTION_TYPE_LABELS[opp.actionType];
        case "plannedOrderType":
          return ORDER_TYPE_LABELS[opp.plannedOrderType];
        case "triggerPriceUsd":
          return opp.triggerPriceUsd ?? null;
        case "targetCapitalUsd":
          return opp.targetCapitalUsd ?? null;
        case "actionDueDate":
          return opp.actionDueDate ?? "";
        case "actionStatus":
          return opp.actionStatus;
      }
    });
  }, [baseRows, colFilters, sort]);

  return (
    <div className="space-y-4">
      {/* Chart Analysis & Action Assignment Form */}
      <form onSubmit={handleAddOpportunity} className="hify-card rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-main)]">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Log Chart Analysis & Assign Action
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Assign a disciplined Buy action while analyzing charts (default: 90-Day Trigger, no stop-loss).
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleSeedExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Upload className="h-3.5 w-3.5" />
            Seed potential_stocks.xlsx
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Ticker *
            </label>
            <input
              type="text"
              required
              placeholder="NVDA"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 font-mono text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Company Name
            </label>
            <input
              type="text"
              placeholder="NVIDIA Corp"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Strategy *
            </label>
            <select
              required
              value={strategyName}
              onChange={(e) => setStrategyName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            >
              <option value="">* Select Strategy</option>
              {activeStrategyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Market Cap Tier (Cap)
            </label>
            <select
              value={marketCapTier}
              onChange={(e) => setMarketCapTier(e.target.value as MarketCapTier)}
              className="w-full rounded-lg border border-zinc-300 bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            >
              <option value="MEGA">Mega Cap (5.0%)</option>
              <option value="LARGE">Large Cap (4.0%)</option>
              <option value="MID">Mid Cap (3.0%)</option>
              <option value="SMALL">Small Cap (1.5%)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Assigned Action
            </label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as OpportunityActionType)}
              className="w-full rounded-lg border border-zinc-300 bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            >
              <option value="PLACE_ORDER">Place Buy Order</option>
              <option value="REVIEW_CHART">Review Chart</option>
              <option value="WATCH">Watchlist Only</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Order Type
            </label>
            <select
              value={plannedOrderType}
              onChange={(e) => setPlannedOrderType(e.target.value as OrderTypeOption)}
              className="w-full rounded-lg border border-zinc-300 bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            >
              <option value="90D_TRIGGER">90-Day Trigger (Default)</option>
              <option value="LIMIT">Limit Order</option>
              <option value="MARKET">Market / Instant</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Trigger / Limit Price ($)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="135.50"
              value={triggerPriceUsd}
              onChange={(e) => setTriggerPriceUsd(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 font-mono text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Target Capital ($)
            </label>
            <input
              type="number"
              step="1"
              placeholder="250"
              value={targetCapitalInput}
              onChange={(e) => setTargetCapitalInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 font-mono text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
              Action Due Date
            </label>
            <input
              type="date"
              value={actionDueDate}
              onChange={(e) => setActionDueDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Chart thesis / S&R level / catalyst notes..."
            value={thesisNotes}
            onChange={(e) => setThesisNotes(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={busy || !normTicker}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Save Opportunity & Action
          </button>
        </div>

        {/* Live Allocation Guardrail & Sizing Preview */}
        {(normTicker || plannedQty > 0) && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
              exceedsCap
                ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                : "border-amber-500/30 bg-amber-500/5 text-[var(--text-muted)]"
            }`}
          >
            <span>
              Sizing Preview:{" "}
              <strong className="font-mono text-[var(--text-main)]">
                {plannedQty > 0 ? `${plannedQty.toFixed(4)} sh` : "—"}
              </strong>{" "}
              at ${plannedTrigger > 0 ? plannedTrigger.toFixed(2) : "—"}
            </span>
            <span>
              Exposure: {currentAllocPct.toFixed(2)}% current →{" "}
              <strong>{projectedAllocPct.toFixed(2)}%</strong> projected (Max{" "}
              {maxAllowedPct.toFixed(1)}% for {marketCapTier})
            </span>
          </div>
        )}

        {statusMsg && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {statusMsg}
          </p>
        )}
      </form>

      {/* Opportunities List */}
      <div className="hify-card rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Tracked Opportunities ({visibleRows.length})
          </h3>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setFilterMode("PENDING")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                filterMode === "PENDING"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-[var(--text-muted)]"
              }`}
            >
              Pending Actions
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("ALL")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                filterMode === "ALL"
                  ? "bg-amber-500 text-zinc-950"
                  : "text-[var(--text-muted)]"
              }`}
            >
              All ({opportunities.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-[11px] uppercase text-[var(--text-muted)] dark:border-zinc-800">
                <SortableTh
                  label="Ticker"
                  sortKey="ticker"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                  filterValue={colFilters.ticker ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, ticker: v }))}
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Strategy"
                  sortKey="strategy"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                  filterValue={colFilters.strategy ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, strategy: v }))}
                  filterOptions={activeStrategyNames}
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Action"
                  sortKey="actionType"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                  filterValue={colFilters.actionType ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, actionType: v }))}
                  filterOptions={Object.values(ACTION_TYPE_LABELS)}
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Order Type"
                  sortKey="plannedOrderType"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                  filterValue={colFilters.plannedOrderType ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, plannedOrderType: v }))}
                  filterOptions={Object.values(ORDER_TYPE_LABELS)}
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Trigger $"
                  sortKey="triggerPriceUsd"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k))}
                  filterValue={colFilters.triggerPriceUsd ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, triggerPriceUsd: v }))}
                  alignRight
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Size $ / Qty"
                  sortKey="targetCapitalUsd"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k))}
                  filterValue={colFilters.targetCapitalUsd ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, targetCapitalUsd: v }))}
                  alignRight
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Due"
                  sortKey="actionDueDate"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k))}
                  filterValue={colFilters.actionDueDate ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, actionDueDate: v }))}
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <SortableTh
                  label="Status"
                  sortKey="actionStatus"
                  sort={sort}
                  onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                  filterValue={colFilters.actionStatus ?? ""}
                  onFilterChange={(v) => setColFilters((f) => ({ ...f, actionStatus: v }))}
                  filterOptions={["PENDING", "DONE", "DISMISSED"]}
                  className="py-2 pr-3 whitespace-nowrap align-top"
                />
                <th className="py-2 text-right align-top">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                    No opportunities in this view. Log one above or seed from potential_stocks.xlsx.
                  </td>
                </tr>
              ) : (
                visibleRows.map((opp) => (
                  <tr key={opp.id} className="hover:bg-zinc-500/5">
                    <td className="py-2.5 pr-3">
                      <div className="font-mono font-bold text-[var(--text-main)]">
                        {opp.ticker}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {opp.companyName}
                        {opp.leaderMention ? ` • ${opp.leaderMention}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <select
                        value={opp.strategy || ""}
                        disabled={busy}
                        onChange={(e) => updateStrategy(opp.id, e.target.value)}
                        className={`rounded border px-1.5 py-0.5 text-[11px] focus:outline-none ${
                          !opp.strategy
                            ? "border-rose-500/50 bg-rose-500/5 text-rose-500"
                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-main)]"
                        }`}
                      >
                        <option value="">Select Strategy</option>
                        {opp.strategy && !activeStrategyNames.includes(opp.strategy) && (
                          <option value={opp.strategy}>{opp.strategy}</option>
                        )}
                        {activeStrategyNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3 text-[var(--text-main)]">
                      {ACTION_TYPE_LABELS[opp.actionType]}
                    </td>
                    <td className="py-2.5 pr-3 text-[var(--text-muted)]">
                      {ORDER_TYPE_LABELS[opp.plannedOrderType]}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-[var(--text-main)]">
                      {opp.triggerPriceUsd ? `$${opp.triggerPriceUsd.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-[var(--text-main)]">
                      {opp.targetCapitalUsd ? `$${opp.targetCapitalUsd.toFixed(0)}` : "—"}
                      {opp.plannedShares ? (
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {opp.plannedShares.toFixed(4)} sh
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[var(--text-muted)]">
                      {opp.actionDueDate ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          opp.actionStatus === "PENDING"
                            ? "bg-amber-500/15 text-amber-500"
                            : opp.actionStatus === "DONE"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-zinc-500/15 text-zinc-400"
                        }`}
                      >
                        {opp.actionStatus}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {opp.actionStatus === "PENDING" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => markStatus(opp.id, "DONE")}
                            title="Mark Done"
                            className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteOpp(opp.id)}
                          title="Delete"
                          className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
