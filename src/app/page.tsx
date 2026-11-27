"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownUp,
  BarChart3,
  Bell,
  CheckCircle2,
  Coins,
  Download,
  Layers,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";
import { ActionForDayPanel } from "@/components/ActionForDayPanel";
import { AdminStrategiesTab } from "@/components/AdminStrategiesTab";
import { CloseLotModal } from "@/components/CloseLotModal";
import { OpportunitiesTab } from "@/components/OpportunitiesTab";
import { CapitalWaterfallChart, DisplayCurrency } from "@/components/CapitalWaterfallChart";
import { LrsLimitCard } from "@/components/LrsLimitCard";
import { OpenExposureDonut, CostsDividendsBars } from "@/components/OverviewExposureChart";
import { OpenHoldingsVisual } from "@/components/OpenHoldingsVisual";
import { ClosedTradesChart } from "@/components/ClosedTradesChart";
import {
  getOpenLotSortValue,
  OpenLotsTable,
  OpenSortKey,
} from "@/components/OpenLotsTable";
import {
  ColumnFilters,
  SortableTh,
  SortState,
  filterRows,
  sortRows,
  toggleSort,
} from "@/components/SortableTh";
import { computeClosedTradeMetrics } from "@/lib/profit-engine";
import {
  AccountProfitSummary,
  AccountSettings,
  BrokerOrder,
  CashflowEvent,
  CashflowEventType,
  ClosedTrade,
  ConsolidatedTickerSummary,
  DailyActionItem,
  GttStatus,
  InrDeposit,
  MarketCapTier,
  OpenLot,
  Opportunity,
  Strategy,
  WalletTransaction,
} from "@/lib/types";

interface JournalPayload {
  settings: AccountSettings;
  summary: AccountProfitSummary;
  consolidated: ConsolidatedTickerSummary[];
  openLots: OpenLot[];
  closedTrades: ClosedTrade[];
  deposits: InrDeposit[];
  cashflows: CashflowEvent[];
  walletTransactions: WalletTransaction[];
  opportunities?: Opportunity[];
  brokerOrders?: BrokerOrder[];
  strategies?: Strategy[];
  actions?: DailyActionItem[];
}

type TabKey = "actions" | "profit" | "analysis" | "open" | "opportunities" | "closed" | "ledger" | "admin";

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

function HifyLogoMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="3" y="13" width="4" height="8" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="10" y="8" width="4" height="13" rx="1.2" fill="currentColor" opacity="0.8" />
      <rect x="17" y="3" width="4" height="18" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export default function USStocksJournalPage() {
  const [data, setData] = useState<JournalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("profit");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [closingLot, setClosingLot] = useState<OpenLot | null>(null);
  const [syncWizardOpen, setSyncWizardOpen] = useState(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [syncModalStatus, setSyncModalStatus] = useState<{
    tone: "info" | "success" | "error";
    message: string;
  } | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("USD");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hify_us_currency");
      if (saved === "USD" || saved === "INR") setDisplayCurrency(saved);
    } catch {}
  }, []);

  function handleCurrencyChange(next: DisplayCurrency) {
    setDisplayCurrency(next);
    try {
      window.localStorage.setItem("hify_us_currency", next);
    } catch {}
  }

  const [targetCapInput, setTargetCapInput] = useState("");
  const [fxInput, setFxInput] = useState("");

  const [depDate, setDepDate] = useState(new Date().toISOString().slice(0, 10));
  const [depInr, setDepInr] = useState("");
  const [depFx, setDepFx] = useState("85.0");
  const [depCharges, setDepCharges] = useState("0");
  const [depUsd, setDepUsd] = useState("");
  const [depNotes, setDepNotes] = useState("");

  const [cfDate, setCfDate] = useState(new Date().toISOString().slice(0, 10));
  const [cfType, setCfType] = useState<CashflowEventType>("DIVIDEND");
  const [cfTicker, setCfTicker] = useState("");
  const [cfUsd, setCfUsd] = useState("");
  const [cfNotes, setCfNotes] = useState("");

  const [consSearch, setConsSearch] = useState("");
  const [consTierFilter, setConsTierFilter] = useState<string>("ALL");
  const [consSort, setConsSort] = useState<
    SortState<"ticker" | "lotCount" | "totalShares" | "avgBuyPriceUsd" | "totalInvestedUsd" | "allocationPctOfTarget" | "capLimit">
  >({ key: "totalInvestedUsd", dir: "desc" });
  const [consColFilters, setConsColFilters] = useState<
    ColumnFilters<"ticker" | "lotCount" | "totalShares" | "avgBuyPriceUsd" | "totalInvestedUsd" | "allocationPctOfTarget" | "capLimit">
  >({});

  const [openSearch, setOpenSearch] = useState("");
  const [openGttFilter, setOpenGttFilter] = useState<string>("ALL");
  const [openTierFilter, setOpenTierFilter] = useState<string>("ALL");
  const [openSort, setOpenSort] = useState<SortState<OpenSortKey>>({
    key: "buyDate",
    dir: "desc",
  });
  const [openColFilters, setOpenColFilters] = useState<ColumnFilters<OpenSortKey>>({});
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [quoteBannerMsg, setQuoteBannerMsg] = useState<string | null>(null);

  const [closedSearch, setClosedSearch] = useState("");
  const [closedOutcomeFilter, setClosedOutcomeFilter] = useState<string>("ALL");
  const [closedExecModeFilter, setClosedExecModeFilter] = useState<string>("ALL");
  const [closedStrategyFilter, setClosedStrategyFilter] = useState<string>("ALL");
  const [closedMonthFilter, setClosedMonthFilter] = useState<string>("ALL");
  const [closedFullView, setClosedFullView] = useState<boolean>(false);
  type ClosedSortKey =
    | "status"
    | "ticker"
    | "shares"
    | "buyDate"
    | "buyPriceUsd"
    | "buyValueUsd"
    | "sellDate"
    | "sellPriceUsd"
    | "sellValueUsd"
    | "cmpUsd"
    | "daysHeld"
    | "netPnlUsd"
    | "pnlPct"
    | "annualGainPct"
    | "targetPriceUsd"
    | "gainAfterBookingPct"
    | "strategy"
    | "listName"
    | "executionMode"
    | "account"
    | "monthLabel"
    | "fees";
  const [closedSort, setClosedSort] = useState<SortState<ClosedSortKey>>({
    key: "sellDate",
    dir: "desc",
  });
  const [closedColFilters, setClosedColFilters] = useState<ColumnFilters<ClosedSortKey>>({});

  const [depSortDir, setDepSortDir] = useState<"asc" | "desc">("desc");
  const [cfTypeFilter, setCfTypeFilter] = useState<string>("ALL");
  const [cfSearch, setCfSearch] = useState("");
  const [cfSortDir, setCfSortDir] = useState<"asc" | "desc">("desc");
  const [wtxSearch, setWtxSearch] = useState("");
  const [wtxCategoryFilter, setWtxCategoryFilter] = useState<string>("ALL");
  const [wtxSortDir, setWtxSortDir] = useState<"asc" | "desc">("desc");
  type WtxSortKey = "txDate" | "title" | "category" | "status" | "amountUsd";
  const [wtxSort, setWtxSort] = useState<SortState<WtxSortKey>>({ key: "txDate", dir: "desc" });
  const [wtxColFilters, setWtxColFilters] = useState<ColumnFilters<WtxSortKey>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hify_theme");
      const dark = saved === "dark";
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    } catch (_) {}
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("hify_theme", next ? "dark" : "light");
    } catch (_) {}
  }

  const loadJournal = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/journal/summary", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`API returned HTTP ${res.status} — restart 'npm run dev' if a build just ran.`);
      }
      const json = (await res.json()) as JournalPayload;
      setData(json);
      setTargetCapInput(String(json.settings.targetCapitalUsd));
      setFxInput(String(json.settings.liveUsdInrRate));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  async function handleSaveSettings() {
    const res = await fetch("/api/journal/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetCapitalUsd: Number(targetCapInput),
        liveUsdInrRate: Number(fxInput),
      }),
    });
    if (res.ok) {
      setStatusMsg("Settings updated.");
      loadJournal();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
    }
    const importingMsg = `Importing ${files.length} file${files.length > 1 ? "s" : ""}...`;
    setIsUploadingExcel(true);
    setStatusMsg(importingMsg);
    setSyncModalStatus({ tone: "info", message: importingMsg });
    try {
      const res = await fetch("/api/import/excel", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok) {
        const r = json.result;
        const parts: string[] = [];
        if (r.lrsDepositsCreated || r.lrsDepositsUpdated) {
          parts.push(`LRS: ${r.lrsDepositsCreated} created, ${r.lrsDepositsUpdated} updated`);
        }
        if (r.tradeFeesUpdated) parts.push(`Commissions: ${r.tradeFeesUpdated} updated`);
        if (r.walletCashflowsCreated) parts.push(`Wallet cashflows: ${r.walletCashflowsCreated} added`);
        if (r.openImported || r.closedImported) {
          parts.push(`Trades: ${r.openImported} open, ${r.closedImported} closed`);
        }
        const doneMsg = `Imported (${(r.reportsDetected ?? []).join(", ") || "Excel"}): ${
          parts.join(" · ") || "Already up to date"
        }.`;
        setStatusMsg(doneMsg);
        setSyncModalStatus({ tone: "success", message: doneMsg });
        await loadJournal();
      } else {
        const errMsg = `Upload error: ${json.error}`;
        setStatusMsg(errMsg);
        setSyncModalStatus({ tone: "error", message: errMsg });
      }
    } catch (err) {
      const errMsg = `Upload failed: ${err instanceof Error ? err.message : "Network error"}`;
      setStatusMsg(errMsg);
      setSyncModalStatus({ tone: "error", message: errMsg });
    } finally {
      setIsUploadingExcel(false);
      e.target.value = "";
    }
  }

  async function handleLotPatch(id: number, patch: Partial<OpenLot>) {
    await fetch(`/api/trades/open/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadJournal();
  }

  async function handleRefreshQuotes() {
    setRefreshingQuotes(true);
    setQuoteBannerMsg(null);
    try {
      const res = await fetch("/api/quotes/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setQuoteBannerMsg(json.error ?? "Failed to refresh live quotes from Yahoo.");
        return;
      }
      const updatedCount = Array.isArray(json.updatedTickers) ? json.updatedTickers.length : 0;
      const failed: Array<{ symbol?: string } | string> = Array.isArray(json.failedTickers)
        ? json.failedTickers
        : [];
      const failedNames = failed
        .map((f) => (typeof f === "string" ? f : f.symbol ?? ""))
        .filter(Boolean);
      if (failedNames.length > 0) {
        setQuoteBannerMsg(
          `Updated ${updatedCount} ticker${updatedCount === 1 ? "" : "s"}. Failed for: ${failedNames.join(", ")}.`
        );
      } else {
        setQuoteBannerMsg(
          `Refreshed ${updatedCount} ticker${updatedCount === 1 ? "" : "s"} from Yahoo Finance.`
        );
      }
      await loadJournal();
    } catch (err) {
      setQuoteBannerMsg(err instanceof Error ? err.message : "Network error refreshing quotes.");
    } finally {
      setRefreshingQuotes(false);
    }
  }

  async function handleClosedTradePatch(id: number, patch: Partial<ClosedTrade>) {
    await fetch(`/api/trades/closed/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadJournal();
  }

  async function handleAddDeposit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        depositDate: depDate,
        inrAmount: Number(depInr),
        fxRate: Number(depFx),
        fxChargesInr: Number(depCharges),
        usdCredited: Number(depUsd),
        notes: depNotes,
      }),
    });
    if (res.ok) {
      setDepInr("");
      setDepUsd("");
      setDepNotes("");
      loadJournal();
    }
  }

  async function handleAddCashflow(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/cashflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventDate: cfDate,
        type: cfType,
        ticker: cfTicker || null,
        amountUsd: Number(cfUsd),
        notes: cfNotes,
      }),
    });
    if (res.ok) {
      setCfTicker("");
      setCfUsd("");
      setCfNotes("");
      loadJournal();
    }
  }

  function exportClosedCsv(rows: ClosedTrade[]) {
    const headers = [
      "Status",
      "Stock",
      "Company",
      "Shares",
      "Buy Date",
      "Buy Price",
      "Buy Value",
      "Sell Date",
      "Sell Price",
      "Sell Value",
      "CMP",
      "Days",
      "P&L ($)",
      "% Gain",
      "Annual Gain %",
      "Target ($)",
      "Gain After Booking %",
      "Strategy",
      "List",
      "Exec Mode",
      "Account",
      "Month",
      "Fees",
      "Notes",
    ];
    const lines = [headers.join(",")];
    for (const t of rows) {
      const m = computeClosedTradeMetrics(t);
      const vals = [
        m.status,
        t.ticker,
        `"${t.companyName.replace(/"/g, '""')}"`,
        t.shares,
        t.buyDate,
        t.buyPriceUsd,
        t.buyValueUsd.toFixed(2),
        t.sellDate,
        t.sellPriceUsd,
        t.sellValueUsd.toFixed(2),
        t.cmpUsd ?? "",
        m.days,
        t.netPnlUsd.toFixed(2),
        m.pctGain.toFixed(2),
        m.annualGainPct.toFixed(2),
        t.targetPriceUsd ?? "",
        m.gainAfterBookingPct !== null ? m.gainAfterBookingPct.toFixed(2) : "",
        `"${(t.strategy || "").replace(/"/g, '""')}"`,
        `"${(t.listName || "Others").replace(/"/g, '""')}"`,
        t.executionMode,
        m.account,
        m.monthLabel,
        (t.buyFeesUsd + t.sellFeesUsd).toFixed(2),
        `"${(t.notes || "").replace(/"/g, '""')}"`,
      ];
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hify_us_closed_trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !data) {
    return (
      <div
        suppressHydrationWarning
        className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]"
      >
        Loading HIFY Tracker · US Stocks...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--bg)] text-[var(--text-main)]">
        <p className="text-sm text-rose-500">{loadError ?? "Unable to load journal data."}</p>
        <button
          onClick={loadJournal}
          className="btn-primary min-h-[44px] rounded-xl px-5 py-2 text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const summary = data.summary;

  const consAccessor = (
    r: ConsolidatedTickerSummary,
    k: "ticker" | "lotCount" | "totalShares" | "avgBuyPriceUsd" | "totalInvestedUsd" | "allocationPctOfTarget" | "capLimit"
  ) =>
    k === "capLimit"
      ? r.marketCapTier
        ? `${r.marketCapTier} (${r.maxAllowedPct}%)`
        : "Set in Open Lots"
      : r[k];

  const filteredConsolidated = sortRows(
    filterRows(
      data.consolidated.filter((c) => {
        const q = consSearch.trim().toLowerCase();
        if (q && !c.ticker.toLowerCase().includes(q) && !c.companyName.toLowerCase().includes(q)) return false;
        if (consTierFilter === "UNSET" && c.marketCapTier !== null) return false;
        if (consTierFilter !== "ALL" && consTierFilter !== "UNSET" && c.marketCapTier !== consTierFilter) return false;
        return true;
      }),
      consColFilters,
      consAccessor
    ),
    consSort,
    consAccessor
  );

  const consolidatedMap = new Map<string, ConsolidatedTickerSummary>();
  for (const c of data.consolidated) {
    consolidatedMap.set(c.ticker.toUpperCase(), c);
  }

  const openAccessor = (r: OpenLot, k: OpenSortKey) =>
    getOpenLotSortValue(r, k, consolidatedMap, data.settings.targetCapitalUsd);

  const filteredOpenLots = sortRows(
    filterRows(
      data.openLots.filter((l) => {
        const q = openSearch.trim().toLowerCase();
        if (
          q &&
          !l.ticker.toLowerCase().includes(q) &&
          !l.companyName.toLowerCase().includes(q) &&
          !l.strategy.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (openGttFilter !== "ALL" && l.sellGttStatus !== openGttFilter) return false;
        if (openTierFilter === "UNSET" && l.marketCapTier !== null) return false;
        if (openTierFilter !== "ALL" && openTierFilter !== "UNSET" && l.marketCapTier !== openTierFilter) return false;
        return true;
      }),
      openColFilters,
      openAccessor
    ),
    openSort,
    openAccessor
  );

  const closedMonthOptions = Array.from(
    new Set(data.closedTrades.map((t) => computeClosedTradeMetrics(t).monthLabel))
  ).sort((a, b) => b.localeCompare(a));

  const closedAccessor = (r: ClosedTrade, k: ClosedSortKey) => {
    switch (k) {
      case "fees":
        return r.buyFeesUsd + r.sellFeesUsd;
      case "status":
        return computeClosedTradeMetrics(r).status;
      case "annualGainPct":
        return computeClosedTradeMetrics(r).annualGainPct;
      case "gainAfterBookingPct":
        return computeClosedTradeMetrics(r).gainAfterBookingPct;
      case "monthLabel":
        return computeClosedTradeMetrics(r).monthLabel;
      case "account":
        return computeClosedTradeMetrics(r).account;
      default:
        return r[k];
    }
  };

  const filteredClosedTrades = sortRows(
    filterRows(
      data.closedTrades.filter((t) => {
        const q = closedSearch.trim().toLowerCase();
        if (
          q &&
          !t.ticker.toLowerCase().includes(q) &&
          !t.companyName.toLowerCase().includes(q) &&
          !t.strategy.toLowerCase().includes(q) &&
          !t.listName.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (closedOutcomeFilter === "WINNERS" && t.netPnlUsd <= 0) return false;
        if (closedOutcomeFilter === "LOSERS" && t.netPnlUsd >= 0) return false;
        if (closedExecModeFilter !== "ALL" && t.executionMode !== closedExecModeFilter) return false;
        if (closedStrategyFilter === "UNSET" && t.strategy !== "") return false;
        if (closedStrategyFilter !== "ALL" && closedStrategyFilter !== "UNSET" && t.strategy !== closedStrategyFilter) {
          return false;
        }
        if (closedMonthFilter !== "ALL" && computeClosedTradeMetrics(t).monthLabel !== closedMonthFilter) {
          return false;
        }
        return true;
      }),
      closedColFilters,
      closedAccessor
    ),
    closedSort,
    closedAccessor
  );

  const sortedDeposits = [...data.deposits].sort((a, b) =>
    depSortDir === "asc"
      ? a.depositDate.localeCompare(b.depositDate)
      : b.depositDate.localeCompare(a.depositDate)
  );

  const filteredCashflows = data.cashflows
    .filter((c) => {
      if (cfTypeFilter !== "ALL" && c.type !== cfTypeFilter) return false;
      const q = cfSearch.trim().toLowerCase();
      if (q && !(c.ticker ?? "").toLowerCase().includes(q) && !c.notes.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) =>
      cfSortDir === "asc" ? a.eventDate.localeCompare(b.eventDate) : b.eventDate.localeCompare(a.eventDate)
    );

  const inputCls =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none";

  const actionsList = data.actions ?? [];
  const opportunitiesList = data.opportunities ?? [];
  const strategiesList = data.strategies ?? [];
  const activeStrategyOptions = strategiesList
    .filter((s) => s.isActive)
    .map((s) => s.name);

  const navItems: Array<{ key: TabKey; label: string; shortLabel: string; icon: typeof TrendingUp }> = [
    { key: "actions", label: `Action for the Day (${actionsList.length})`, shortLabel: `Actions (${actionsList.length})`, icon: Bell },
    { key: "profit", label: "Exact Account Profit", shortLabel: "Profit", icon: TrendingUp },
    { key: "analysis", label: "Analysis & Charts", shortLabel: "Analysis", icon: BarChart3 },
    { key: "open", label: `Open Trades (${data.openLots.length} lots)`, shortLabel: `Open (${data.openLots.length})`, icon: Layers },
    { key: "opportunities", label: `Opportunities (${opportunitiesList.length})`, shortLabel: `Opps (${opportunitiesList.length})`, icon: Sparkles },
    { key: "closed", label: `Closed Trades (${data.closedTrades.length})`, shortLabel: `Closed (${data.closedTrades.length})`, icon: CheckCircle2 },
    { key: "ledger", label: "INR Deposits & Fees/Dividends", shortLabel: "Ledger", icon: Coins },
    { key: "admin", label: `Admin (${strategiesList.length})`, shortLabel: "Admin", icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 pb-24 sm:px-6 sm:pb-8">
      {/* Top Bar (HIFY Brand Header) */}
      <header className="hify-card rounded-xl px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          {/* Left: HIFY Mark & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <HifyLogoMark />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-[var(--text-main)]">HIFY</span>
                <span className="text-xs font-medium text-[var(--text-muted)]">US Stocks</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                  INDmoney
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {data.settings.lastSyncedAt
                  ? `Synced ${new Date(data.settings.lastSyncedAt).toLocaleString()}`
                  : "Not synced yet"}
              </p>
            </div>
          </div>

          {/* Center: Clean HIFY Nav Links */}
          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map(({ key, shortLabel, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                title={label}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  tab === key
                    ? "bg-[var(--primary-soft)] text-[var(--primary-deep)] dark:text-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--section-bg)] hover:text-[var(--text-main)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </nav>

          {/* Right: Refresh & Theme Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={loadJournal}
              className="btn-secondary inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl px-2.5"
              title="Refresh view"
              aria-label="Refresh view"
            >
              <RefreshCw className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold"
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Secondary Compact Controls Strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--text-muted)]">Target Cap ($):</span>
            <input
              type="number"
              value={targetCapInput}
              onChange={(e) => setTargetCapInput(e.target.value)}
              className={`w-20 font-mono tabular-nums ${inputCls}`}
            />
            <span className="ml-1 text-[var(--text-muted)]">USD/INR:</span>
            <input
              type="number"
              step="0.01"
              value={fxInput}
              onChange={(e) => setFxInput(e.target.value)}
              className={`w-16 font-mono tabular-nums ${inputCls}`}
            />
            <button
              onClick={handleSaveSettings}
              className="btn-primary ml-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              Save
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--section-bg)] p-0.5 text-[11px] font-semibold"
              role="group"
              aria-label="Display Currency"
            >
              <button
                type="button"
                onClick={() => handleCurrencyChange("USD")}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  displayCurrency === "USD"
                    ? "bg-[#C8A951] text-[#121214]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                USD $
              </button>
              <button
                type="button"
                onClick={() => handleCurrencyChange("INR")}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  displayCurrency === "INR"
                    ? "bg-[#C8A951] text-[#121214]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                INR ₹
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSyncWizardOpen(true)}
              className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Guided Sync
            </button>
          </div>
        </div>
      </header>

      {statusMsg && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] px-4 py-2.5 text-xs text-[var(--primary-deep)] dark:text-[var(--text-main)]">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)] hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Guided 2-Step Sync & Data Completeness Checklist */}
      {(() => {
        const syncedMs = data.settings.lastSyncedAt ? new Date(data.settings.lastSyncedAt).getTime() : 0;
        const syncFresh = syncedMs > 0 && Date.now() - syncedMs < 24 * 60 * 60 * 1000;
        const missingLrs = data.deposits.length === 0 || data.deposits.some((d) => d.inrAmount === 0);
        const missingCommissions =
          summary.totalTradeFeesUsd === 0 && (data.openLots.length + data.closedTrades.length > 0);
        const missingDivTax = !data.cashflows.some((c) => c.type === "WITHHOLDING_TAX");
        const allComplete = syncFresh && !missingLrs && !missingCommissions && !missingDivTax;

        if (allComplete) {
          return (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] px-4 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-[var(--primary-deep)] dark:text-[var(--primary)]">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  2-Step Sync Complete — Live INDmoney UI + LRS Report + Trades Report + Wallet Statement reconciled
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSyncWizardOpen(true)}
                  className="font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)] hover:underline"
                >
                  Open Guided Sync
                </button>
              </div>
            </div>
          );
        }

        const prompts: string[] = [];
        if (missingLrs) prompts.push("Missing INR/FX/GST — upload LRS Report");
        if (missingCommissions) prompts.push("Missing trade commissions — upload Trades Report");
        if (missingDivTax) prompts.push("Missing dividend taxes — upload Wallet Statement");

        return (
          <div className="hify-card mt-4 flex flex-col gap-3 rounded-xl border-[#C8A951]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#C8A951]/15 px-2 py-0.5 font-semibold text-[#8E6C20] dark:text-[#EFE3C3]">
                  Sync & Data Completeness Checklist
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                    syncFresh
                      ? "bg-emerald-500/10 text-[#10B981]"
                      : "bg-[#EA580C]/10 text-[#EA580C]"
                  }`}
                >
                  Step 1 (Live UI Sync): {syncFresh ? "Synced ✓" : "Sync via Chrome Extension"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-main)]">Step 2 (INDmoney Reports):</span>
                {prompts.length > 0 ? (
                  prompts.map((p) => (
                    <span
                      key={p}
                      className="rounded-md border border-[#EA580C]/30 bg-[#EA580C]/10 px-2 py-0.5 text-[#EA580C]"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-[#10B981]">All 3 official reports loaded ✓</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSyncWizardOpen(true)}
                className="btn-primary inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Open Guided Sync
              </button>
            </div>
          </div>
        );
      })()}

      {/* Tablet Navigation Tabs (shown on sm..md, hidden on lg where top nav is visible) */}
      <nav className="mt-4 hidden flex-wrap gap-2 sm:flex lg:hidden">
        {navItems.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              tab === key ? "btn-primary shadow-sm" : "btn-secondary"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* TAB 1: EXACT ACCOUNT PROFIT */}
      {tab === "actions" && (
        <ActionForDayPanel
          actions={actionsList}
          strategies={strategiesList}
          onRefresh={loadJournal}
          onJumpToOpportunities={() => setTab("opportunities")}
          onJumpToAdmin={() => setTab("admin")}
        />
      )}

      {tab === "opportunities" && (
        <OpportunitiesTab
          opportunities={opportunitiesList}
          consolidated={data.consolidated}
          targetCapitalUsd={data.settings.targetCapitalUsd}
          strategies={strategiesList}
          onRefresh={loadJournal}
        />
      )}

      {tab === "admin" && (
        <AdminStrategiesTab strategies={strategiesList} onRefresh={loadJournal} />
      )}

      {tab === "profit" && (() => {
        const fx = summary.liveUsdInrRate > 0 ? summary.liveUsdInrRate : 85;
        const isInr = displayCurrency === "INR";
        const fmtPrimary = (usd: number, explicitInr?: number) =>
          isInr ? fmtInr(explicitInr ?? usd * fx) : fmtUsd(usd);

        const initialCapitalUsd = summary.totalUsdDeposited;
        const actualInrSpent = summary.totalInrInvested + summary.totalFxChargesInr;
        const realizedTotalUsd = summary.netAccountProfitUsd - summary.unrealizedPnlUsd;
        const divMinusFeesUsd = realizedTotalUsd - summary.realizedNetPnlUsd;
        const totalInvestedUsd = initialCapitalUsd + realizedTotalUsd;
        const totalInvestedInr = actualInrSpent + realizedTotalUsd * fx;
        const journalCurrentValueUsd = totalInvestedUsd + summary.unrealizedPnlUsd;
        const currentValueDeltaUsd = summary.currentAccountValueUsd - journalCurrentValueUsd;
        const cashSharePct =
          summary.currentAccountValueUsd > 0
            ? (summary.brokerCashUsd / summary.currentAccountValueUsd) * 100
            : 0;

        return (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--section-bg)] px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Net Account Profit ({displayCurrency})
              </span>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  summary.netAccountProfitUsd >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"
                }`}
              >
                {summary.netAccountProfitUsd >= 0 ? "+" : ""}
                {fmtPrimary(summary.netAccountProfitUsd, summary.netAccountProfitInr)}
              </span>
            </div>
            <div className="font-mono tabular-nums text-[var(--text-muted)]">
              {isInr ? `FX ₹${fx.toFixed(2)}/$ • ` : ""}Win Rate {summary.winRatePct}% ({summary.winningTrades}W/{summary.losingTrades}L) • Div {fmtPrimary(summary.totalDividendsUsd)} • Fees {fmtPrimary(summary.totalAllFeesUsd)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              title="1. Initial Capital"
              value={fmtPrimary(initialCapitalUsd, actualInrSpent)}
              sub={
                isInr
                  ? `Conv ${fmtInr(summary.totalInrInvested)} + GST ${fmtInr(summary.totalFxChargesInr)}`
                  : `Transferred capital (FX ₹${fx.toFixed(2)}/$)`
              }
              positive={true}
            />
            <KpiCard
              title="2. + Realized Profit"
              value={fmtPrimary(realizedTotalUsd)}
              sub={`Trade ${fmtPrimary(summary.realizedNetPnlUsd)} • Div−Fees ${fmtPrimary(divMinusFeesUsd)}`}
              positive={realizedTotalUsd >= 0}
            />
            <KpiCard
              title="3. = Net Account Capital"
              value={fmtPrimary(totalInvestedUsd, totalInvestedInr)}
              sub={`Initial Capital + Realized Profit`}
              positive={totalInvestedUsd >= initialCapitalUsd}
            />
            <KpiCard
              title="4. + Unrealized Profit"
              value={fmtPrimary(summary.unrealizedPnlUsd, summary.unrealizedPnlInr)}
              sub={`Cost ${fmtPrimary(summary.openCostBasisUsd)} → Market ${fmtPrimary(summary.openCurrentValueUsd)}`}
              positive={summary.unrealizedPnlUsd >= 0}
            />
            <KpiCard
              title="5. → Current Value"
              value={fmtPrimary(summary.currentAccountValueUsd, summary.currentAccountValueInr)}
              sub={`Holdings ${fmtPrimary(summary.openCurrentValueUsd)} + Buying Power ${fmtPrimary(summary.brokerCashUsd)}`}
              positive={summary.currentAccountValueUsd >= initialCapitalUsd}
            />
          </div>

          {/* Clarity Strip: Current Value of Invested Holdings vs Cash in Hand (Buying Power) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="hify-card rounded-xl px-4 py-3">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">
                Current Value of Invested (Open Holdings)
              </p>
              <p className="mt-1 font-mono text-base font-bold tabular-nums text-[var(--text-main)]">
                {fmtPrimary(summary.openCurrentValueUsd)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                Ex-Fee Cost {fmtPrimary(summary.openCostBasisUsd)}
                {summary.brokerInvestedUsd > 0 && Math.abs(summary.brokerInvestedUsd - summary.openCostBasisUsd) >= 0.01
                  ? ` • INDmoney ${fmtPrimary(summary.brokerInvestedUsd)}`
                  : ` • ${summary.openLotsCount} open lots`}
              </p>
            </div>
            <div className="hify-card rounded-xl px-4 py-3">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">
                Cash in Hand (Buying Power)
              </p>
              <p className="mt-1 font-mono text-base font-bold tabular-nums text-[#C8A951]">
                {fmtPrimary(summary.brokerCashUsd)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {cashSharePct.toFixed(1)}% of account • Ready to deploy
              </p>
            </div>
            <div className="hify-card rounded-xl px-4 py-3">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">
                Total Current Value (Holdings + Buying Power)
              </p>
              <p className="mt-1 font-mono text-base font-bold tabular-nums text-[var(--text-main)]">
                {fmtPrimary(summary.currentAccountValueUsd, summary.currentAccountValueInr)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {Math.abs(currentValueDeltaUsd) >= 0.01
                  ? `Δ vs Journal ${currentValueDeltaUsd >= 0 ? "+" : ""}${fmtPrimary(currentValueDeltaUsd)}`
                  : "Reconciled with Journal"}
              </p>
            </div>
          </div>

          <CapitalWaterfallChart
            summary={summary}
            currency={displayCurrency}
            fmtUsd={fmtUsd}
            fmtInr={fmtInr}
          />

          {summary.brokerHoldingsCount > 0 && (() => {
            const invDelta = summary.openCostBasisUsd - summary.brokerInvestedUsd;
            const curDelta = summary.openCurrentValueUsd - summary.brokerCurrentValueUsd;
            const tickerCount = data.consolidated.length;
            const matched =
              Math.abs(invDelta) <= 5 &&
              Math.abs(curDelta) <= 1 &&
              tickerCount === summary.brokerHoldingsCount;
            return (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-mono tabular-nums ${
                  matched
                    ? "border-[var(--border)] bg-[var(--primary-soft)] text-[var(--text-main)]"
                    : "border-[#EA580C]/30 bg-[#EA580C]/10 text-[#EA580C]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 font-sans font-semibold uppercase tracking-wider text-[var(--primary-deep)] dark:text-[var(--primary)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                    {matched ? "INDmoney Reconciled" : "INDmoney Reconciliation Delta"}
                  </span>
                  <span>
                    Holdings: <strong>{tickerCount}</strong> / {summary.brokerHoldingsCount}
                  </span>
                  <span>
                    Open Invested: <strong>{fmtUsd(summary.openCostBasisUsd)}</strong> vs Broker{" "}
                    <strong>{fmtUsd(summary.brokerInvestedUsd)}</strong> (Δ {fmtUsd(invDelta)})
                  </span>
                  <span>
                    Current Value: <strong>{fmtUsd(summary.openCurrentValueUsd)}</strong> vs Broker{" "}
                    <strong>{fmtUsd(summary.brokerCurrentValueUsd)}</strong> (Δ {fmtUsd(curDelta)})
                  </span>
                  <span>
                    Buying Power: <strong>{fmtUsd(summary.brokerCashUsd)}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">Live FX: ₹{summary.liveUsdInrRate}</span>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="hify-card rounded-xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Costs &amp; Dividends Breakdown ({displayCurrency})
              </h3>
              <CostsDividendsBars
                summary={summary}
                currency={displayCurrency}
                fmtUsd={fmtUsd}
                fmtInr={fmtInr}
              />
            </div>

            <div className="hify-card rounded-xl p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Consolidated Open Exposure (vs Target Cap {fmtUsd(summary.targetCapitalUsd)})
                </h3>
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="text"
                    placeholder="Filter ticker..."
                    value={consSearch}
                    onChange={(e) => setConsSearch(e.target.value)}
                    className={`w-32 ${inputCls}`}
                  />
                  <select
                    value={consTierFilter}
                    onChange={(e) => setConsTierFilter(e.target.value)}
                    className={inputCls}
                  >
                    <option value="ALL">All Caps</option>
                    <option value="MEGA">MEGA (5%)</option>
                    <option value="LARGE">LARGE (4%)</option>
                    <option value="MID">MID (3%)</option>
                    <option value="SMALL">SMALL (1.5%)</option>
                    <option value="UNSET">Unset</option>
                  </select>
                </div>
              </div>
              <OpenExposureDonut
                rows={filteredConsolidated}
                targetCapitalUsd={summary.targetCapitalUsd}
                currency={displayCurrency}
                fxRate={summary.liveUsdInrRate}
                activeTickerFilter={consSearch}
                onSelectTicker={(t) =>
                  setConsSearch((prev) =>
                    prev.trim().toUpperCase() === t.toUpperCase() ? "" : t
                  )
                }
                fmtUsd={fmtUsd}
                fmtInr={fmtInr}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="border-b-2 border-[var(--border)] bg-[var(--section-bg)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)]">
                    <tr>
                      <SortableTh label="Ticker" sortKey="ticker" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k, "asc"))} filterValue={consColFilters.ticker ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, ticker: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                      <SortableTh label="Lots" sortKey="lotCount" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k))} filterValue={consColFilters.lotCount ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, lotCount: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                      <SortableTh label="Total Shares" sortKey="totalShares" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k))} filterValue={consColFilters.totalShares ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, totalShares: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                      <SortableTh label="Avg Buy" sortKey="avgBuyPriceUsd" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k))} filterValue={consColFilters.avgBuyPriceUsd ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, avgBuyPriceUsd: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                      <SortableTh label="Invested" sortKey="totalInvestedUsd" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k))} filterValue={consColFilters.totalInvestedUsd ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, totalInvestedUsd: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                      <SortableTh label="Alloc %" sortKey="allocationPctOfTarget" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k))} filterValue={consColFilters.allocationPctOfTarget ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, allocationPctOfTarget: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                      <SortableTh label="Cap Limit" sortKey="capLimit" sort={consSort} onSort={(k) => setConsSort((p) => toggleSort(p, k, "asc"))} filterValue={consColFilters.capLimit ?? ""} onFilterChange={(v) => setConsColFilters((f) => ({ ...f, capLimit: v }))} className="px-3 py-2.5 whitespace-nowrap align-top" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredConsolidated.map((c) => {
                      const overCap = c.maxAllowedPct !== null && c.allocationPctOfTarget > c.maxAllowedPct;
                      return (
                        <tr key={c.ticker} className="hover:bg-[var(--primary-soft)]/60">
                          <td className="py-2.5 pr-3 font-semibold text-[var(--text-main)]">{c.ticker}</td>
                          <td className="py-2.5 pr-3 text-[var(--text-muted)]">{c.lotCount}</td>
                          <td className="py-2.5 pr-3 font-mono text-[var(--text-main)]">{c.totalShares.toFixed(4)}</td>
                          <td className="py-2.5 pr-3 font-mono text-[var(--text-main)]">{fmtUsd(c.avgBuyPriceUsd)}</td>
                          <td className="py-2.5 pr-3 font-mono font-medium text-[var(--text-main)]">{fmtUsd(c.totalInvestedUsd)}</td>
                          <td className={`py-2.5 pr-3 font-mono font-semibold ${overCap ? "text-rose-600 dark:text-rose-400" : "text-[var(--primary-deep)] dark:text-[var(--primary)]"}`}>
                            {c.allocationPctOfTarget.toFixed(2)}%
                          </td>
                          <td className="py-2.5 text-[var(--text-muted)]">
                            {c.marketCapTier ? `${c.marketCapTier} (${c.maxAllowedPct}%)` : "Set in Open Lots"}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredConsolidated.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-[var(--text-muted)]">
                          No matching open exposure rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* TAB 2: ANALYSIS & CHARTS */}
      {tab === "analysis" && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <OpenHoldingsVisual
              lots={data.openLots}
              currency={displayCurrency}
              fxRate={data.summary.liveUsdInrRate}
              activeSearch={openSearch}
              onSelectTicker={(ticker) => {
                setOpenSearch(ticker);
                if (ticker) setTab("open");
              }}
              onSelectGttFilter={(status) => {
                setOpenGttFilter(status);
                setTab("open");
              }}
              fmtUsd={fmtUsd}
              fmtInr={fmtInr}
            />
            <ClosedTradesChart
              trades={data.closedTrades}
              currency={displayCurrency}
              fxRate={data.summary.liveUsdInrRate}
              activeMonthFilter={closedMonthFilter}
              activeStrategyFilter={closedStrategyFilter}
              onSelectMonth={(month) => {
                setClosedMonthFilter(month);
                if (month !== "ALL") setTab("closed");
              }}
              onSelectStrategy={(strategy) => {
                setClosedStrategyFilter(strategy);
                if (strategy !== "ALL") setTab("closed");
              }}
              fmtUsd={fmtUsd}
              fmtInr={fmtInr}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="hify-card rounded-xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Costs &amp; Dividends Breakdown ({displayCurrency})
              </h3>
              <CostsDividendsBars
                summary={data.summary}
                currency={displayCurrency}
                fmtUsd={fmtUsd}
                fmtInr={fmtInr}
              />
            </div>
            <div className="hify-card rounded-xl p-5 lg:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Open Exposure vs Market Cap Limits
              </h3>
              <OpenExposureDonut
                rows={data.consolidated}
                targetCapitalUsd={data.summary.targetCapitalUsd}
                currency={displayCurrency}
                fxRate={data.summary.liveUsdInrRate}
                activeTickerFilter={consSearch}
                onSelectTicker={(ticker) => {
                  setOpenSearch(ticker);
                  if (ticker) setTab("open");
                }}
                fmtUsd={fmtUsd}
                fmtInr={fmtInr}
              />
            </div>
          </div>

          <LrsLimitCard deposits={data.deposits} fmtInr={fmtInr} fmtUsd={fmtUsd} />
        </div>
      )}

      {/* TAB 3: OPEN TRADES (LOT-LEVEL) */}
      {tab === "open" && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Filter ticker, company, or strategy..."
              value={openSearch}
              onChange={(e) => setOpenSearch(e.target.value)}
              className={`w-60 px-3 py-2 ${inputCls}`}
            />
            <select value={openGttFilter} onChange={(e) => setOpenGttFilter(e.target.value)} className={`px-2.5 py-2 ${inputCls}`}>
              <option value="ALL">All GTT Statuses</option>
              <option value="NONE">NONE</option>
              <option value="PLANNED">PLANNED</option>
              <option value="PLACED">PLACED</option>
              <option value="TRIGGERED">TRIGGERED</option>
            </select>
            <select value={openTierFilter} onChange={(e) => setOpenTierFilter(e.target.value)} className={`px-2.5 py-2 ${inputCls}`}>
              <option value="ALL">All Cap Tiers</option>
              <option value="MEGA">MEGA (5%)</option>
              <option value="LARGE">LARGE (4%)</option>
              <option value="MID">MID (3%)</option>
              <option value="SMALL">SMALL (1.5%)</option>
              <option value="UNSET">Unset</option>
            </select>
            <span className="ml-auto text-[var(--text-muted)]">
              Showing {filteredOpenLots.length} of {data.openLots.length} lots
            </span>
          </div>

          <OpenLotsTable
            lots={filteredOpenLots}
            totalLotsCount={data.openLots.length}
            consolidated={data.consolidated}
            targetCapitalUsd={data.settings.targetCapitalUsd}
            liveUsdInrRate={data.settings.liveUsdInrRate}
            currency={displayCurrency}
            activeStrategyOptions={activeStrategyOptions}
            openSort={openSort}
            onSort={(k) => setOpenSort((p) => toggleSort(p, k))}
            openColFilters={openColFilters}
            onFilterChange={(k, v) => setOpenColFilters((f) => ({ ...f, [k]: v }))}
            onLotPatch={handleLotPatch}
            onCloseLot={(lot) => setClosingLot(lot)}
            onRefreshQuotes={handleRefreshQuotes}
            refreshingQuotes={refreshingQuotes}
            quoteBannerMsg={quoteBannerMsg}
          />
        </div>
      )}

      {/* TAB 3: CLOSED TRADES (22-COLUMN EXCEL PARITY) */}
      {tab === "closed" && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Filter ticker, company, strategy, list..."
              value={closedSearch}
              onChange={(e) => setClosedSearch(e.target.value)}
              className={`w-60 px-3 py-2 ${inputCls}`}
            />
            <select value={closedOutcomeFilter} onChange={(e) => setClosedOutcomeFilter(e.target.value)} className={`px-2.5 py-2 ${inputCls}`}>
              <option value="ALL">All Outcomes</option>
              <option value="WINNERS">Winners (+$)</option>
              <option value="LOSERS">Losers (-$)</option>
            </select>
            <select value={closedExecModeFilter} onChange={(e) => setClosedExecModeFilter(e.target.value)} className={`px-2.5 py-2 ${inputCls}`}>
              <option value="ALL">All Exec Modes</option>
              <option value="GTT">GTT</option>
              <option value="Instant">Instant</option>
            </select>
            <select value={closedStrategyFilter} onChange={(e) => setClosedStrategyFilter(e.target.value)} className={`px-2.5 py-2 ${inputCls}`}>
              <option value="ALL">All Strategies</option>
              <option value="UNSET">Unset</option>
              {activeStrategyOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <select value={closedMonthFilter} onChange={(e) => setClosedMonthFilter(e.target.value)} className={`px-2.5 py-2 ${inputCls}`}>
              <option value="ALL">All FY Months</option>
              {closedMonthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setClosedFullView((v) => !v)}
              className={`min-h-[44px] rounded-xl px-3.5 py-2 font-semibold transition ${
                closedFullView ? "btn-primary" : "btn-secondary"
              }`}
            >
              {closedFullView ? "All 22 Excel Columns ✓" : "Compact View → Show All 22 Columns"}
            </button>

            <button
              type="button"
              onClick={() => exportClosedCsv(filteredClosedTrades)}
              className="btn-secondary inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-medium"
            >
              <Download className="h-3.5 w-3.5 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
              Export CSV
            </button>

            <span className="ml-auto text-[var(--text-muted)]">
              Showing {filteredClosedTrades.length} of {data.closedTrades.length} trades
            </span>
          </div>

          <div className="hify-card overflow-x-auto rounded-xl">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="border-b-2 border-[var(--border)] bg-[var(--section-bg)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)]">
                <tr>
                  {closedFullView && <SortableTh label="Status" sortKey="status" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k, "asc"))} filterValue={closedColFilters.status ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, status: v }))} />}
                  <SortableTh label="Stock" sortKey="ticker" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k, "asc"))} filterValue={closedColFilters.ticker ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, ticker: v }))} />
                  <SortableTh label="Shares" sortKey="shares" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.shares ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, shares: v }))} />
                  <SortableTh label="Buy Date" sortKey="buyDate" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.buyDate ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, buyDate: v }))} />
                  <SortableTh label="Buy Price" sortKey="buyPriceUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.buyPriceUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, buyPriceUsd: v }))} />
                  {closedFullView && <SortableTh label="Buy Value" sortKey="buyValueUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.buyValueUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, buyValueUsd: v }))} />}
                  <SortableTh label="Sell Date" sortKey="sellDate" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.sellDate ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, sellDate: v }))} />
                  <SortableTh label="Sell Price" sortKey="sellPriceUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.sellPriceUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, sellPriceUsd: v }))} />
                  {closedFullView && <SortableTh label="Sell Value" sortKey="sellValueUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.sellValueUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, sellValueUsd: v }))} />}
                  {closedFullView && <SortableTh label="CMP ($)" sortKey="cmpUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.cmpUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, cmpUsd: v }))} />}
                  <SortableTh label="Days" sortKey="daysHeld" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.daysHeld ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, daysHeld: v }))} />
                  <SortableTh label="P&L ($)" sortKey="netPnlUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.netPnlUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, netPnlUsd: v }))} />
                  <SortableTh label="% Gain" sortKey="pnlPct" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.pnlPct ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, pnlPct: v }))} />
                  {closedFullView && <SortableTh label="Annual Gain %" sortKey="annualGainPct" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.annualGainPct ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, annualGainPct: v }))} />}
                  <SortableTh label="Target ($)" sortKey="targetPriceUsd" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.targetPriceUsd ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, targetPriceUsd: v }))} />
                  {closedFullView && <SortableTh label="Gain After Booking %" sortKey="gainAfterBookingPct" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.gainAfterBookingPct ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, gainAfterBookingPct: v }))} />}
                  <SortableTh label="Strategy" sortKey="strategy" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k, "asc"))} filterValue={closedColFilters.strategy ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, strategy: v }))} filterOptions={activeStrategyOptions} />
                  {closedFullView && <SortableTh label="List" sortKey="listName" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k, "asc"))} filterValue={closedColFilters.listName ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, listName: v }))} />}
                  {closedFullView && <SortableTh label="Exec Mode" sortKey="executionMode" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k, "asc"))} filterValue={closedColFilters.executionMode ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, executionMode: v }))} filterOptions={["GTT", "Instant"]} />}
                  {closedFullView && <SortableTh label="Account" sortKey="account" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k, "asc"))} filterValue={closedColFilters.account ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, account: v }))} />}
                  {closedFullView && <SortableTh label="Month" sortKey="monthLabel" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.monthLabel ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, monthLabel: v }))} />}
                  {closedFullView && <SortableTh label="Fees / Notes" sortKey="fees" sort={closedSort} onSort={(k) => setClosedSort((p) => toggleSort(p, k))} filterValue={closedColFilters.fees ?? ""} onFilterChange={(v) => setClosedColFilters((f) => ({ ...f, fees: v }))} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredClosedTrades.map((t) => {
                  const m = computeClosedTradeMetrics(t);
                  return (
                    <tr key={t.id} className="hover:bg-[var(--primary-soft)]/50">
                      {closedFullView && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary-deep)] dark:text-[var(--primary)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                            {m.status}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="font-semibold text-[var(--text-main)]">{t.ticker}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{t.companyName}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[var(--text-main)]">{t.shares.toFixed(4)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-main)]">{t.buyDate}</td>
                      <td className="px-3 py-2.5 font-mono text-[var(--text-main)]">{fmtUsd(t.buyPriceUsd)}</td>
                      {closedFullView && (
                        <td className="px-3 py-2.5 font-mono text-[var(--text-main)]">{fmtUsd(t.buyValueUsd)}</td>
                      )}
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-main)]">{t.sellDate}</td>
                      <td className="px-3 py-2.5 font-mono text-[var(--text-main)]">{fmtUsd(t.sellPriceUsd)}</td>
                      {closedFullView && (
                        <td className="px-3 py-2.5 font-mono text-[var(--text-main)]">{fmtUsd(t.sellValueUsd)}</td>
                      )}
                      {closedFullView && (
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={t.cmpUsd ?? ""}
                            placeholder="CMP"
                            onBlur={(e) =>
                              handleClosedTradePatch(t.id, {
                                cmpUsd: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            className={`w-20 font-mono ${inputCls}`}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2.5 font-mono text-[var(--text-muted)]">{m.days}d</td>
                      <td
                        className={`px-3 py-2.5 font-mono font-semibold ${
                          t.netPnlUsd >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {fmtUsd(t.netPnlUsd)}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono font-semibold ${
                          m.pctGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {m.pctGain.toFixed(2)}%
                      </td>
                      {closedFullView && (
                        <td
                          className={`px-3 py-2.5 font-mono font-medium ${
                            m.annualGainPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {m.annualGainPct.toFixed(1)}%
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={t.targetPriceUsd ?? ""}
                          placeholder="Target"
                          onBlur={(e) =>
                            handleClosedTradePatch(t.id, {
                              targetPriceUsd: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`w-20 font-mono ${inputCls}`}
                        />
                      </td>
                      {closedFullView && (
                        <td
                          className={`px-3 py-2.5 font-mono font-medium ${
                            m.gainAfterBookingPct === null
                              ? "text-[var(--text-muted)]"
                              : m.gainAfterBookingPct >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {m.gainAfterBookingPct !== null ? `${m.gainAfterBookingPct.toFixed(2)}%` : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <select
                          value={t.strategy}
                          onChange={(e) => handleClosedTradePatch(t.id, { strategy: e.target.value })}
                          className={`w-32 ${inputCls}`}
                        >
                          <option value="">Select strategy...</option>
                          {t.strategy &&
                            !activeStrategyOptions.includes(t.strategy) && (
                              <option value={t.strategy}>{t.strategy}</option>
                            )}
                          {activeStrategyOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      {closedFullView && (
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            defaultValue={t.listName}
                            placeholder="Others"
                            onBlur={(e) =>
                              handleClosedTradePatch(t.id, { listName: e.target.value || "Others" })
                            }
                            className={`w-24 ${inputCls}`}
                          />
                        </td>
                      )}
                      {closedFullView && (
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              t.executionMode === "GTT"
                                ? "border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary-deep)] dark:text-[var(--primary)]"
                                : "border-[var(--border)] bg-[var(--section-bg)] text-[var(--text-muted)]"
                            }`}
                          >
                            {t.executionMode}
                          </span>
                        </td>
                      )}
                      {closedFullView && (
                        <td className="px-3 py-2.5 text-[var(--text-muted)]">{m.account}</td>
                      )}
                      {closedFullView && (
                        <td className="px-3 py-2.5 font-mono text-[var(--text-muted)] whitespace-nowrap">
                          {m.monthLabel}
                        </td>
                      )}
                      {closedFullView && (
                        <td className="px-3 py-2.5 font-mono text-[var(--text-muted)] whitespace-nowrap">
                          {fmtUsd(t.buyFeesUsd + t.sellFeesUsd)}
                          {t.notes ? ` · ${t.notes}` : ""}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: INR DEPOSITS & FEES / DIVIDENDS */}
      {tab === "ledger" && (() => {
        const allWtx = data.walletTransactions ?? [];
        const wtxTotals = allWtx.reduce(
          (acc, w) => {
            if (w.category === "DEPOSIT") acc.deposits += w.amountUsd;
            else if (w.category === "WITHDRAWAL") acc.withdrawals += Math.abs(w.amountUsd);
            else if (w.category === "BUY_SETTLEMENT") acc.buys += Math.abs(w.amountUsd);
            else if (w.category === "SELL_SETTLEMENT") acc.sells += w.amountUsd;
            else if (w.category === "DIVIDEND") acc.dividends += w.amountUsd;
            else if (w.category === "FEE" || w.category === "TAX") acc.feesTaxes += Math.abs(w.amountUsd);
            if (w.category !== "CANCELED") acc.netCashflow += w.amountUsd;
            return acc;
          },
          { deposits: 0, withdrawals: 0, buys: 0, sells: 0, dividends: 0, feesTaxes: 0, netCashflow: 0 }
        );
        const wtxAccessor = (w: WalletTransaction, k: WtxSortKey) => w[k];
        const filteredWtx = sortRows(
          filterRows(
            allWtx.filter((w) => {
              if (wtxCategoryFilter !== "ALL" && w.category !== wtxCategoryFilter) return false;
              const q = wtxSearch.trim().toLowerCase();
              if (q && !w.title.toLowerCase().includes(q) && !w.status.toLowerCase().includes(q)) return false;
              return true;
            }),
            wtxColFilters,
            wtxAccessor
          ),
          wtxSort,
          wtxAccessor
        );

        return (
        <div className="mt-6 space-y-6">
        <LrsLimitCard deposits={data.deposits} fmtInr={fmtInr} fmtUsd={fmtUsd} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="hify-card rounded-xl p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
              <ArrowDownUp className="h-4 w-4 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
              INR Deposits / Remittances (Timestamped)
            </h3>

            {(() => {
              const totalInrConverted = sortedDeposits.reduce((s, d) => s + d.inrAmount, 0);
              const totalChargesInr = sortedDeposits.reduce((s, d) => s + d.fxChargesInr, 0);
              const totalActualInrSpent = totalInrConverted + totalChargesInr;
              const totalUsdCredited = sortedDeposits.reduce((s, d) => s + d.usdCredited, 0);
              const avgAllInFx = totalUsdCredited > 0 ? totalActualInrSpent / totalUsdCredited : 0;
              return (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-muted)]">Actual INR Spent</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--text-main)]">
                      {fmtInr(totalActualInrSpent)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-muted)]">INR Converted</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--text-main)]">
                      {fmtInr(totalInrConverted)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-muted)]">GST &amp; Bank Charges</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {fmtInr(totalChargesInr)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-muted)]">Total USD Credited</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtUsd(totalUsdCredited)}
                    </p>
                    {avgAllInFx > 0 && (
                      <p className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                        Avg ₹{avgAllInFx.toFixed(2)}/$
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            <form onSubmit={handleAddDeposit} className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <input type="date" required value={depDate} onChange={(e) => setDepDate(e.target.value)} className={inputCls} />
              <input type="number" step="0.01" required placeholder="INR Amount" value={depInr} onChange={(e) => setDepInr(e.target.value)} className={inputCls} />
              <input type="number" step="0.01" required placeholder="FX Rate" value={depFx} onChange={(e) => setDepFx(e.target.value)} className={inputCls} />
              <input type="number" step="0.01" placeholder="FX Charges (INR)" value={depCharges} onChange={(e) => setDepCharges(e.target.value)} className={inputCls} />
              <input type="number" step="0.01" required placeholder="USD Credited" value={depUsd} onChange={(e) => setDepUsd(e.target.value)} className={inputCls} />
              <button type="submit" className="btn-primary min-h-[44px] rounded-lg px-3 py-1.5 font-semibold">
                Add Deposit
              </button>
            </form>

            <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{sortedDeposits.length} deposits</span>
              <button
                type="button"
                onClick={() => setDepSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                className="btn-secondary rounded-lg px-2.5 py-1"
              >
                Date: {depSortDir === "desc" ? "Newest ↓" : "Oldest ↑"}
              </button>
            </div>
            <div className="mt-2 space-y-2 text-xs font-mono tabular-nums">
              {sortedDeposits.map((d) => {
                const totalRowInr = d.inrAmount + d.fxChargesInr;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold text-[var(--text-main)]">{d.depositDate}</span>
                        <span className="text-[var(--text-main)]">
                          {fmtInr(totalRowInr)} → {fmtUsd(d.usdCredited)}
                        </span>
                        <span className="text-[var(--text-muted)]">@ ₹{d.fxRate}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        Converted {fmtInr(d.inrAmount)}
                        {d.fxChargesInr > 0 ? ` + Charges ${fmtInr(d.fxChargesInr)}` : ""}
                        {d.notes ? ` · ${d.notes}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/deposits?id=${d.id}`, { method: "DELETE" });
                        loadJournal();
                      }}
                      className="shrink-0 text-[var(--text-muted)] hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hify-card rounded-xl p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
              <Coins className="h-4 w-4 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
              Dividends & Standalone Fees
            </h3>
            <form onSubmit={handleAddCashflow} className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <input type="date" required value={cfDate} onChange={(e) => setCfDate(e.target.value)} className={inputCls} />
              <select value={cfType} onChange={(e) => setCfType(e.target.value as CashflowEventType)} className={inputCls}>
                <option value="DIVIDEND">Dividend (+)</option>
                <option value="WITHHOLDING_TAX">Withholding Tax (-)</option>
                <option value="PLATFORM_FEE">Platform Fee (-)</option>
                <option value="SEC_TAF_FEE">SEC/TAF Fee (-)</option>
                <option value="FX_FEE">FX Fee (-)</option>
              </select>
              <input type="text" placeholder="Ticker (optional)" value={cfTicker} onChange={(e) => setCfTicker(e.target.value)} className={inputCls} />
              <input type="number" step="0.01" required placeholder="Amount ($)" value={cfUsd} onChange={(e) => setCfUsd(e.target.value)} className={inputCls} />
              <input type="text" placeholder="Notes" value={cfNotes} onChange={(e) => setCfNotes(e.target.value)} className={inputCls} />
              <button type="submit" className="btn-primary min-h-[44px] rounded-lg px-3 py-1.5 font-semibold">
                Add Entry
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <input type="text" placeholder="Filter ticker/notes..." value={cfSearch} onChange={(e) => setCfSearch(e.target.value)} className={`w-36 ${inputCls}`} />
              <select value={cfTypeFilter} onChange={(e) => setCfTypeFilter(e.target.value)} className={inputCls}>
                <option value="ALL">All Types</option>
                <option value="DIVIDEND">DIVIDEND</option>
                <option value="WITHHOLDING_TAX">WITHHOLDING_TAX</option>
                <option value="PLATFORM_FEE">PLATFORM_FEE</option>
                <option value="SEC_TAF_FEE">SEC_TAF_FEE</option>
                <option value="FX_FEE">FX_FEE</option>
              </select>
              <button
                type="button"
                onClick={() => setCfSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                className="btn-secondary ml-auto rounded-lg px-2.5 py-1"
              >
                Date: {cfSortDir === "desc" ? "Newest ↓" : "Oldest ↑"}
              </button>
            </div>
            <div className="mt-2 space-y-2 text-xs font-mono tabular-nums">
              {filteredCashflows.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--section-bg)] px-3 py-2.5">
                  <div>
                    <span className="font-semibold text-[var(--text-main)]">{c.eventDate}</span>
                    <span className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-sans text-[10px] text-[var(--text-muted)]">
                      {c.type}
                    </span>
                    {c.ticker && <span className="ml-2 font-sans font-semibold text-[var(--text-main)]">{c.ticker}</span>}
                    <span className={`ml-2 font-semibold ${c.type === "DIVIDEND" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {c.type === "DIVIDEND" ? "+" : "-"}
                      {fmtUsd(Math.abs(c.amountUsd))}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch(`/api/cashflows?id=${c.id}`, { method: "DELETE" });
                      loadJournal();
                    }}
                    className="text-[var(--text-muted)] hover:text-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Full-Width Running INDmoney Wallet History (From Inception) */}
        <div className="hify-card rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
                <Coins className="h-4 w-4 text-[var(--primary)]" />
                Running INDmoney Wallet History (From Inception)
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {allWtx.length} total transactions synced from INDmoney wallet-history
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                placeholder="Search title or status..."
                value={wtxSearch}
                onChange={(e) => setWtxSearch(e.target.value)}
                className={`w-48 ${inputCls}`}
              />
              <select
                value={wtxCategoryFilter}
                onChange={(e) => setWtxCategoryFilter(e.target.value)}
                className={inputCls}
              >
                <option value="ALL">All Categories</option>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="WITHDRAWAL">WITHDRAWAL</option>
                <option value="BUY_SETTLEMENT">BUY_SETTLEMENT</option>
                <option value="SELL_SETTLEMENT">SELL_SETTLEMENT</option>
                <option value="DIVIDEND">DIVIDEND</option>
                <option value="FEE">FEE</option>
                <option value="TAX">TAX</option>
                <option value="CANCELED">CANCELED</option>
                <option value="OTHER">OTHER</option>
              </select>
              <button
                type="button"
                onClick={() => setWtxSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                className="btn-secondary rounded-lg px-2.5 py-1.5"
              >
                Date: {wtxSortDir === "desc" ? "Newest ↓" : "Oldest ↑"}
              </button>
            </div>
          </div>

          {/* Summary Pills */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono tabular-nums">
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400">
              Deposits: +{fmtUsd(wtxTotals.deposits)}
            </span>
            <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-rose-600 dark:text-rose-400">
              Withdrawals: -{fmtUsd(wtxTotals.withdrawals)}
            </span>
            <span className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-1 text-[var(--text-main)]">
              Buy Settlements: -{fmtUsd(wtxTotals.buys)}
            </span>
            <span className="rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-1 text-[var(--text-main)]">
              Sell Settlements: +{fmtUsd(wtxTotals.sells)}
            </span>
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400">
              Dividends: +{fmtUsd(wtxTotals.dividends)}
            </span>
            <span className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-orange-600 dark:text-orange-400">
              Fees/Taxes: -{fmtUsd(wtxTotals.feesTaxes)}
            </span>
            <span className="rounded-lg border border-[var(--border)] bg-[var(--primary-soft)] px-2.5 py-1 font-semibold text-[var(--primary)]">
              Net Cashflow: {wtxTotals.netCashflow >= 0 ? "+" : ""}
              {fmtUsd(wtxTotals.netCashflow)}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="border-b border-[var(--border)] bg-[var(--section-bg)] text-[var(--text-muted)]">
                <tr>
                  <SortableTh label="Date" sortKey="txDate" sort={wtxSort} onSort={(k) => setWtxSort((p) => toggleSort(p, k))} filterValue={wtxColFilters.txDate ?? ""} onFilterChange={(v) => setWtxColFilters((f) => ({ ...f, txDate: v }))} />
                  <SortableTh label="Title" sortKey="title" sort={wtxSort} onSort={(k) => setWtxSort((p) => toggleSort(p, k, "asc"))} filterValue={wtxColFilters.title ?? ""} onFilterChange={(v) => setWtxColFilters((f) => ({ ...f, title: v }))} />
                  <SortableTh label="Category" sortKey="category" sort={wtxSort} onSort={(k) => setWtxSort((p) => toggleSort(p, k, "asc"))} filterValue={wtxColFilters.category ?? ""} onFilterChange={(v) => setWtxColFilters((f) => ({ ...f, category: v }))} filterOptions={["DEPOSIT", "WITHDRAWAL", "BUY_SETTLEMENT", "SELL_SETTLEMENT", "DIVIDEND", "FEE", "TAX", "CANCELED"]} />
                  <SortableTh label="Status" sortKey="status" sort={wtxSort} onSort={(k) => setWtxSort((p) => toggleSort(p, k, "asc"))} filterValue={wtxColFilters.status ?? ""} onFilterChange={(v) => setWtxColFilters((f) => ({ ...f, status: v }))} />
                  <SortableTh label="Amount ($)" sortKey="amountUsd" sort={wtxSort} onSort={(k) => setWtxSort((p) => toggleSort(p, k))} filterValue={wtxColFilters.amountUsd ?? ""} onFilterChange={(v) => setWtxColFilters((f) => ({ ...f, amountUsd: v }))} alignRight />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredWtx.map((w) => (
                  <tr key={w.id} className="hover:bg-[var(--primary-soft)]/50">
                    <td className="px-3 py-2 font-mono text-[var(--text-main)] whitespace-nowrap">
                      {w.txDate}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-main)]">{w.title}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-md border border-[var(--border)] bg-[var(--section-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        {w.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          w.status.toLowerCase() === "success"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        w.amountUsd > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : w.amountUsd < 0
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-[var(--text-muted)]"
                      }`}
                    >
                      {w.amountUsd > 0 ? "+" : ""}
                      {fmtUsd(w.amountUsd)}
                    </td>
                  </tr>
                ))}
                {filteredWtx.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[var(--text-muted)]">
                      No wallet transactions match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
        );
      })()}

      {/* Mobile Bottom Navigation (Tailscale phone control, 44px+ touch targets) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md sm:hidden">
        {navItems.map(({ key, shortLabel, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition ${
              tab === key
                ? "bg-[var(--primary-soft)] text-[var(--primary-deep)] dark:text-[var(--primary)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{shortLabel}</span>
          </button>
        ))}
      </nav>

      {syncWizardOpen &&
        (() => {
          const syncedMs = data.settings.lastSyncedAt ? new Date(data.settings.lastSyncedAt).getTime() : 0;
          const syncFresh = syncedMs > 0 && Date.now() - syncedMs < 24 * 60 * 60 * 1000;
          const missingLrs = data.deposits.length === 0 || data.deposits.some((d) => d.inrAmount === 0);
          const missingCommissions =
            summary.totalTradeFeesUsd === 0 && data.openLots.length + data.closedTrades.length > 0;
          const missingDivTax = !data.cashflows.some((c) => c.type === "WITHHOLDING_TAX");
          const reportsComplete = !missingLrs && !missingCommissions && !missingDivTax;
          const allSynced = syncFresh && reportsComplete;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
              <div className="hify-card w-full max-w-xl rounded-2xl p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[var(--text-main)]">HIFY Guided Sync Workflow</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Repeat these 3 steps whenever you trade, deposit INR, or want a fresh reconciliation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSyncWizardOpen(false)}
                    className="btn-secondary rounded-lg px-2.5 py-1 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>

                {/* Overall Sync Status Bar */}
                <div
                  className={`mt-3 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium ${
                    allSynced
                      ? "border-emerald-500/30 bg-emerald-500/10 text-[#10B981]"
                      : "border-[#EA580C]/30 bg-[#EA580C]/10 text-[#EA580C]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      {allSynced
                        ? "Sync Complete — Live UI & all 3 INDmoney reports reconciled"
                        : "Sync Incomplete — Complete the pending step(s) below"}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-semibold">
                    {(syncFresh ? 1 : 0) + (reportsComplete ? 1 : 0)}/2 Done
                  </span>
                </div>

                {/* Upload / Check Confirmation Banner */}
                {syncModalStatus && (
                  <div
                    className={`mt-2.5 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs ${
                      syncModalStatus.tone === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : syncModalStatus.tone === "error"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : "border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary-deep)] dark:text-[var(--text-main)]"
                    }`}
                  >
                    <span>{syncModalStatus.message}</span>
                    <button
                      type="button"
                      onClick={() => setSyncModalStatus(null)}
                      className="shrink-0 font-semibold hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="mt-4 space-y-3 text-xs">
                  {/* Step 1 */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--section-bg)] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-main)]">
                        Step 1 · Live Positions, Orders &amp; CMPs (Chrome Extension)
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          syncFresh
                            ? "bg-emerald-500/10 text-[#10B981]"
                            : "bg-[#EA580C]/10 text-[#EA580C]"
                        }`}
                      >
                        {syncFresh ? "Synced ✓" : syncedMs > 0 ? "Stale (>24h)" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--text-muted)]">
                      Open INDmoney US Stocks (<code>my-us-stocks</code> &amp; <code>orders</code>), click{" "}
                      <strong>Sync to Journal</strong> in the HIFY extension, then click Check below.
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        Last Sync:{" "}
                        {data.settings.lastSyncedAt
                          ? new Date(data.settings.lastSyncedAt).toLocaleString()
                          : "Never"}{" "}
                        ({data.settings.brokerHoldingsCount} holdings)
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await loadJournal();
                          setSyncModalStatus({
                            tone: syncFresh ? "success" : "info",
                            message: syncFresh
                              ? "Live sync verified ✓ — journal is up to date."
                              : "Refreshed from local DB. Run Sync to Journal in the Chrome extension if needed.",
                          });
                        }}
                        className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-[var(--primary)]" />
                        Check Live Sync
                      </button>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--section-bg)] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-main)]">
                        Step 2 · INR Deposits, Commissions &amp; Taxes (.xlsx / .csv)
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          reportsComplete
                            ? "bg-emerald-500/10 text-[#10B981]"
                            : "bg-[#EA580C]/10 text-[#EA580C]"
                        }`}
                      >
                        {reportsComplete ? "Synced ✓" : "Missing Reports"}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--text-muted)]">
                      Select your exported INDmoney <strong>LRS Report</strong>, <strong>Trades Report</strong>, and{" "}
                      <strong>Wallet Statement</strong> (<code>.xlsx</code> / <code>.csv</code>) together — existing
                      Strategy &amp; Target edits are preserved.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span
                        className={`rounded-md px-2 py-0.5 font-medium ${
                          !missingLrs
                            ? "bg-emerald-500/10 text-[#10B981]"
                            : "bg-[#EA580C]/10 text-[#EA580C]"
                        }`}
                      >
                        LRS Report {!missingLrs ? "✓" : "Missing"}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 font-medium ${
                          !missingCommissions
                            ? "bg-emerald-500/10 text-[#10B981]"
                            : "bg-[#EA580C]/10 text-[#EA580C]"
                        }`}
                      >
                        Trades Report {!missingCommissions ? "✓" : "Missing"}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 font-medium ${
                          !missingDivTax
                            ? "bg-emerald-500/10 text-[#10B981]"
                            : "bg-[#EA580C]/10 text-[#EA580C]"
                        }`}
                      >
                        Wallet Statement {!missingDivTax ? "✓" : "Missing"}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        INR: {fmtInr(summary.totalInrInvested)} · Fees: {fmtUsd(summary.totalAllFeesUsd)} · Div:{" "}
                        {fmtUsd(summary.totalDividendsUsd)}
                      </span>
                      <label
                        className={`btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-semibold ${
                          isUploadingExcel ? "pointer-events-none opacity-60" : "cursor-pointer"
                        }`}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {isUploadingExcel ? "Uploading..." : "Upload INDmoney Reports (.xlsx)"}
                        <input
                          type="file"
                          multiple
                          accept=".xlsx,.xls,.csv"
                          disabled={isUploadingExcel}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--section-bg)] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-main)]">
                        Step 3 · Review Unassigned Strategy &amp; Target ($)
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        Open unset: {data.openLots.filter((l) => !l.strategy).length} · Closed unset:{" "}
                        {data.closedTrades.filter((c) => !c.strategy).length}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTab("closed");
                          setSyncWizardOpen(false);
                        }}
                        className="btn-secondary rounded-lg px-3 py-1.5 font-semibold"
                      >
                        Review Closed Trades ({data.closedTrades.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTab("open");
                          setSyncWizardOpen(false);
                        }}
                        className="btn-secondary rounded-lg px-3 py-1.5 font-semibold"
                      >
                        Review Open Trades ({data.openLots.length})
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {closingLot && (
        <CloseLotModal
          lot={closingLot}
          onClose={() => setClosingLot(null)}
          onSubmitted={() => {
            setClosingLot(null);
            loadJournal();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  positive,
}: {
  title: string;
  value: string;
  sub: string;
  positive: boolean;
}) {
  return (
    <div className="hify-card rounded-xl p-4">
      <div className="text-xs font-medium text-[var(--text-muted)]">{title}</div>
      <div
        className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
          positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[var(--text-muted)] tabular-nums">{sub}</div>
    </div>
  );
}
