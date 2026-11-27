"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Layers,
  List,
  RefreshCw,
  Target,
  XCircle,
} from "lucide-react";
import { DailyActionItem, DailyActionKind, Strategy } from "@/lib/types";

const ACTION_KIND_META: Record<
  DailyActionKind,
  { badgeColor: string; kindLabel: string }
> = {
  MISSING_TARGET: {
    badgeColor: "bg-rose-500/15 text-rose-500",
    kindLabel: "Action Pending · Target",
  },
  REFRESH_CMP: {
    badgeColor: "bg-orange-500/15 text-orange-500",
    kindLabel: "Refresh CMP",
  },
  PLACE_SELL_GTT_30PCT: {
    badgeColor: "bg-emerald-500/15 text-emerald-500",
    kindLabel: "30% Sell GTT Ready",
  },
  CANCELLED_TRIGGER: {
    badgeColor: "bg-amber-500/15 text-amber-500",
    kindLabel: "Cancelled / Corp Action",
  },
  EXPIRING_TRIGGER: {
    badgeColor: "bg-amber-500/15 text-amber-500",
    kindLabel: "90d Trigger Expiry",
  },
  OPPORTUNITY_ACTION: {
    badgeColor: "bg-sky-500/15 text-sky-500",
    kindLabel: "Chart Action Due",
  },
};

interface ActionForDayPanelProps {
  actions: DailyActionItem[];
  strategies: Strategy[];
  onRefresh: () => Promise<void> | void;
  onJumpToOpportunities?: () => void;
  onJumpToAdmin?: () => void;
}

export function ActionForDayPanel({
  actions,
  strategies,
  onRefresh,
  onJumpToOpportunities,
  onJumpToAdmin,
}: ActionForDayPanelProps) {
  const [targetInputs, setTargetInputs] = useState<Record<number, string>>({});
  const [strategyOverrides, setStrategyOverrides] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [groupByStock, setGroupByStock] = useState<boolean>(true);

  const groupedByStock = useMemo(() => {
    const map = new Map<
      string,
      { ticker: string; companyName: string; items: DailyActionItem[] }
    >();
    for (const item of actions) {
      const key = item.ticker.toUpperCase();
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        if (!existing.companyName && item.companyName) {
          existing.companyName = item.companyName;
        }
      } else {
        map.set(key, {
          ticker: key,
          companyName: item.companyName || key,
          items: [item],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [actions]);

  const activeStrategyNames = strategies.filter((s) => s.isActive).map((s) => s.name);

  function getSelectedStrategy(item: DailyActionItem): string {
    return strategyOverrides[item.actionKey] ?? item.strategy ?? "";
  }

  async function saveStrategyForAction(item: DailyActionItem, nextStrategy: string) {
    setStrategyOverrides((prev) => ({ ...prev, [item.actionKey]: nextStrategy }));
    setValidationError((prev) => ({ ...prev, [item.actionKey]: "" }));

    setBusyKey(item.actionKey);
    try {
      if (item.openLotId) {
        const res = await fetch(`/api/trades/open/${item.openLotId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy: nextStrategy }),
        });
        if (res.ok) await onRefresh();
      } else if (item.brokerOrderId) {
        const res = await fetch("/api/actions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brokerOrderId: item.brokerOrderId, strategy: nextStrategy }),
        });
        if (res.ok) await onRefresh();
      } else if (item.opportunityId) {
        const res = await fetch("/api/actions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId: item.opportunityId, strategy: nextStrategy }),
        });
        if (res.ok) await onRefresh();
      }
    } finally {
      setBusyKey(null);
    }
  }

  function requireStrategy(item: DailyActionItem): string | null {
    const strat = getSelectedStrategy(item).trim();
    if (!strat) {
      setValidationError((prev) => ({
        ...prev,
        [item.actionKey]: "Strategy is mandatory before completing this action.",
      }));
      return null;
    }
    return strat;
  }

  async function saveTargetForLot(item: DailyActionItem) {
    if (!item.openLotId) return;
    const strat = requireStrategy(item);
    if (!strat) return;

    const raw = targetInputs[item.openLotId];
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) {
      setValidationError((prev) => ({
        ...prev,
        [item.actionKey]: "Enter a valid target price > $0.",
      }));
      return;
    }

    setBusyKey(item.actionKey);
    try {
      const res = await fetch(`/api/trades/open/${item.openLotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: strat,
          targetPriceUsd: price,
          sellGttPriceUsd: price,
          sellGttStatus: "PLANNED",
        }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function updateAction(
    item: DailyActionItem,
    payload: Record<string, unknown>
  ) {
    const strat = requireStrategy(item);
    if (!strat) return;

    setBusyKey(item.actionKey);
    try {
      const res = await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, strategy: strat }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setBusyKey(null);
    }
  }

  const missingTargetCount = actions.filter((a) => a.kind === "MISSING_TARGET").length;
  const cancelledCount = actions.filter(
    (a) => a.kind === "CANCELLED_TRIGGER" || a.kind === "EXPIRING_TRIGGER"
  ).length;
  const oppCount = actions.filter((a) => a.kind === "OPPORTUNITY_ACTION").length;

  return (
    <div className="space-y-4">
      <div className="hify-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-main)]">
              <Bell className="h-4 w-4 text-amber-500" />
              Action for the Day
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Daily discipline queue — stays visible until resolved. Strategy selection is mandatory for every action.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-rose-500/10 px-2.5 py-1 font-medium text-rose-500">
              {missingTargetCount} Missing Target
            </span>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-500">
              {cancelledCount} Trigger Decisions
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-500">
              {oppCount} Opportunity Actions
            </span>
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--section-bg)] p-0.5">
              <button
                type="button"
                onClick={() => setGroupByStock(true)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${
                  groupByStock
                    ? "bg-amber-500 text-zinc-950"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                <Layers className="h-3 w-3" />
                Group by Stock ({groupedByStock.length})
              </button>
              <button
                type="button"
                onClick={() => setGroupByStock(false)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${
                  !groupByStock
                    ? "bg-amber-500 text-zinc-950"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                <List className="h-3 w-3" />
                Flat List
              </button>
            </div>
            {onJumpToAdmin && (
              <button
                type="button"
                onClick={onJumpToAdmin}
                className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-1 font-medium text-[var(--text-main)] hover:bg-[var(--primary-soft)]"
              >
                Manage Strategies
              </button>
            )}
            {onJumpToOpportunities && (
              <button
                type="button"
                onClick={onJumpToOpportunities}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-300"
              >
                + Log Opportunity
              </button>
            )}
          </div>
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="hify-card flex flex-col items-center justify-center rounded-xl p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-[var(--text-main)]">
            All disciplined — zero pending actions for today
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Every open lot has a target, no 90d triggers are waiting on a decision, and no chart actions are pending.
          </p>
        </div>
      ) : groupByStock ? (
        <div className="space-y-3">
          {groupedByStock.map((group) => (
            <div key={group.ticker} className="hify-card overflow-hidden rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--section-bg)] px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-sm font-bold text-[var(--text-main)]">
                    {group.ticker}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {group.companyName}
                  </span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {group.items.length} {group.items.length === 1 ? "action" : "actions"}
                  </span>
                </div>
                <a
                  href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(group.ticker)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--primary-deep)] hover:border-[var(--primary)] dark:text-[var(--primary)]"
                >
                  Open Chart
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {group.items.map((item) => {
                  const isBusy = busyKey === item.actionKey;
                  const currentStrategy = getSelectedStrategy(item);
                  const missingStrategy = !currentStrategy.trim();
                  const err = validationError[item.actionKey];
                  const options =
                    currentStrategy && !activeStrategyNames.includes(currentStrategy)
                      ? [currentStrategy, ...activeStrategyNames]
                      : activeStrategyNames;

                  const { badgeColor, kindLabel } = ACTION_KIND_META[item.kind];

                  return (
                    <div
                      key={item.actionKey}
                      className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
                            {kindLabel}
                          </span>
                          {item.dueDate && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              Due {item.dueDate}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-[var(--text-main)]">{item.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.subtitle}</p>
                        {err && <p className="text-xs font-medium text-rose-500">{err}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-col">
                          <select
                            value={currentStrategy}
                            disabled={isBusy}
                            aria-label={`Strategy for ${item.ticker}`}
                            onChange={(e) => saveStrategyForAction(item, e.target.value)}
                            className={`rounded-lg border px-2.5 py-1 text-xs focus:outline-none ${
                              missingStrategy
                                ? "border-rose-500/70 bg-rose-500/5 text-rose-600 dark:text-rose-400"
                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-main)] focus:border-amber-500"
                            }`}
                          >
                            <option value="">* Select Strategy (Required)</option>
                            {options.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {item.kind === "MISSING_TARGET" && item.openLotId && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              placeholder={item.priceUsd ? item.priceUsd.toFixed(2) : "Target $"}
                              value={targetInputs[item.openLotId] ?? ""}
                              onChange={(e) =>
                                setTargetInputs((prev) => ({
                                  ...prev,
                                  [item.openLotId!]: e.target.value,
                                }))
                              }
                              className="w-24 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1 font-mono text-xs text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => saveTargetForLot(item)}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              <Target className="h-3.5 w-3.5" />
                              Set Target
                            </button>
                          </div>
                        )}

                        {item.kind === "CANCELLED_TRIGGER" && item.brokerOrderId && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                updateAction(item, {
                                  brokerOrderId: item.brokerOrderId,
                                  decisionStatus: "REPLACED",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Re-placed
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                updateAction(item, {
                                  brokerOrderId: item.brokerOrderId,
                                  decisionStatus: "ADJUSTED",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-[var(--text-main)] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Adjusted
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                updateAction(item, {
                                  brokerOrderId: item.brokerOrderId,
                                  decisionStatus: "DISMISSED",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              <XCircle className="h-3 w-3" />
                              Dismiss
                            </button>
                          </>
                        )}

                        {item.kind === "OPPORTUNITY_ACTION" && item.opportunityId && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              updateAction(item, {
                                opportunityId: item.opportunityId,
                                actionStatus: "DONE",
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {actions.map((item) => {
            const isBusy = busyKey === item.actionKey;
            const currentStrategy = getSelectedStrategy(item);
            const missingStrategy = !currentStrategy.trim();
            const err = validationError[item.actionKey];
            const options =
              currentStrategy && !activeStrategyNames.includes(currentStrategy)
                ? [currentStrategy, ...activeStrategyNames]
                : activeStrategyNames;

            const { badgeColor, kindLabel } = ACTION_KIND_META[item.kind];

            return (
              <div
                key={item.actionKey}
                className="hify-card flex flex-col justify-between gap-3 rounded-xl p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[var(--text-main)]">
                      {item.ticker}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {item.companyName}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
                      {kindLabel}
                    </span>
                    {item.dueDate && (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Due {item.dueDate}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[var(--text-main)]">{item.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{item.subtitle}</p>
                  {err && <p className="text-xs font-medium text-rose-500">{err}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Mandatory Strategy Dropdown (in place of Snooze) */}
                  <div className="flex flex-col">
                    <select
                      value={currentStrategy}
                      disabled={isBusy}
                      aria-label={`Strategy for ${item.ticker}`}
                      onChange={(e) => saveStrategyForAction(item, e.target.value)}
                      className={`rounded-lg border px-2.5 py-1 text-xs focus:outline-none ${
                        missingStrategy
                          ? "border-rose-500/70 bg-rose-500/5 text-rose-600 dark:text-rose-400"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-main)] focus:border-amber-500"
                      }`}
                    >
                      <option value="">* Select Strategy (Required)</option>
                      {options.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {item.kind === "MISSING_TARGET" && item.openLotId && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={item.priceUsd ? item.priceUsd.toFixed(2) : "Target $"}
                        value={targetInputs[item.openLotId] ?? ""}
                        onChange={(e) =>
                          setTargetInputs((prev) => ({
                            ...prev,
                            [item.openLotId!]: e.target.value,
                          }))
                        }
                        className="w-24 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1 font-mono text-xs text-[var(--text-main)] focus:border-amber-500 focus:outline-none dark:border-zinc-700"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => saveTargetForLot(item)}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        <Target className="h-3.5 w-3.5" />
                        Set Target
                      </button>
                    </div>
                  )}

                  {item.kind === "CANCELLED_TRIGGER" && item.brokerOrderId && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updateAction(item, {
                            brokerOrderId: item.brokerOrderId,
                            decisionStatus: "REPLACED",
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Re-placed
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updateAction(item, {
                            brokerOrderId: item.brokerOrderId,
                            decisionStatus: "ADJUSTED",
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-[var(--text-main)] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Adjusted
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updateAction(item, {
                            brokerOrderId: item.brokerOrderId,
                            decisionStatus: "DISMISSED",
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <XCircle className="h-3 w-3" />
                        Dismiss
                      </button>
                    </>
                  )}

                  {item.kind === "OPPORTUNITY_ACTION" && item.opportunityId && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        updateAction(item, {
                          opportunityId: item.opportunityId,
                          actionStatus: "DONE",
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Done
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
