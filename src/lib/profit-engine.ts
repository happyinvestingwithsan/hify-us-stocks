import {
  AccountProfitSummary,
  AccountSettings,
  CashflowEvent,
  ClosedTrade,
  ConsolidatedTickerSummary,
  InrDeposit,
  MARKET_CAP_LIMITS,
  MarketCapTier,
  OpenLot,
  OpenLotComputedMetrics,
} from "./types";

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * FINRA standard US market-cap categorization.
 */
export function classifyMarketCap(marketCapUsd: number): MarketCapTier {
  if (marketCapUsd >= 200_000_000_000) return "MEGA";
  if (marketCapUsd >= 10_000_000_000) return "LARGE";
  if (marketCapUsd >= 2_000_000_000) return "MID";
  return "SMALL";
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

/**
 * Computes exact dual-currency (USD & INR) account profit, fee transparency,
 * dividend totals, and win-rate metrics.
 */
export function calculateAccountProfit(params: {
  settings: AccountSettings;
  deposits: InrDeposit[];
  openLots: OpenLot[];
  closedTrades: ClosedTrade[];
  cashflows: CashflowEvent[];
}): AccountProfitSummary {
  const { settings, deposits, openLots, closedTrades, cashflows } = params;
  const fx = settings.liveUsdInrRate > 0 ? settings.liveUsdInrRate : 85;

  const totalInrInvested = deposits.reduce((s, d) => s + d.inrAmount, 0);
  const totalFxChargesInr = deposits.reduce((s, d) => s + d.fxChargesInr, 0);
  const totalUsdDeposited = deposits.reduce((s, d) => s + d.usdCredited, 0);

  const activeLots = openLots.filter((l) => l.remainingShares > 0.000001);
  let openCostBasisUsd = 0;
  let openCurrentValueUsd = 0;
  let openFeesUsd = 0;
  let missingCmpLotsCount = 0;

  for (const lot of activeLots) {
    const ratio = lot.shares > 0 ? lot.remainingShares / lot.shares : 1;
    const cost = lot.buyValueUsd * ratio;
    if (lot.currentPriceUsd == null || lot.currentPriceUsd <= 0) {
      missingCmpLotsCount++;
    }
    const cmp = lot.currentPriceUsd ?? lot.buyPriceUsd;
    openCostBasisUsd += cost;
    openCurrentValueUsd += lot.remainingShares * cmp;
    openFeesUsd += lot.feesUsd * ratio;
  }

  const unrealizedPnlUsd = openCurrentValueUsd - openCostBasisUsd;
  const unrealizedPnlInr = unrealizedPnlUsd * fx;

  let realizedGrossPnlUsd = 0;
  let realizedNetPnlUsd = 0;
  let closedFeesUsd = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  for (const trade of closedTrades) {
    realizedGrossPnlUsd += trade.grossPnlUsd;
    realizedNetPnlUsd += trade.netPnlUsd;
    closedFeesUsd += trade.buyFeesUsd + trade.sellFeesUsd;
    if (trade.netPnlUsd > 0) winningTrades++;
    else if (trade.netPnlUsd < 0) losingTrades++;
  }

  let totalDividendsUsd = 0;
  let totalStandaloneFeesUsd = 0;
  for (const ev of cashflows) {
    if (ev.type === "DIVIDEND") {
      totalDividendsUsd += ev.amountUsd;
    } else {
      totalStandaloneFeesUsd += Math.abs(ev.amountUsd);
    }
  }

  const totalTradeFeesUsd = openFeesUsd + closedFeesUsd;
  const totalAllFeesUsd = totalTradeFeesUsd + totalStandaloneFeesUsd;

  const netAccountProfitUsd =
    realizedNetPnlUsd + unrealizedPnlUsd + totalDividendsUsd - totalStandaloneFeesUsd - openFeesUsd;

  // If user has logged INR deposits, current account value in USD can be anchored to deposits + net profit
  // or open value + cash. Here we compute realized+unrealized+dividends-fees in INR at live FX,
  // plus track totalInrInvested separately.
  const brokerCashUsd = settings.brokerCashUsd ?? 0;
  const estimatedCashUsd =
    totalUsdDeposited > 0
      ? Math.max(0, totalUsdDeposited - openCostBasisUsd + realizedNetPnlUsd + totalDividendsUsd - totalStandaloneFeesUsd)
      : 0;
  const currentAccountValueUsd =
    brokerCashUsd > 0
      ? openCurrentValueUsd + brokerCashUsd
      : totalUsdDeposited > 0
        ? openCurrentValueUsd + estimatedCashUsd
        : openCurrentValueUsd + realizedNetPnlUsd;
  const currentAccountValueInr = currentAccountValueUsd * fx;

  const netAccountProfitInr =
    totalInrInvested > 0 ? currentAccountValueInr - totalInrInvested : netAccountProfitUsd * fx;

  const closedCount = closedTrades.length;
  const winRatePct = closedCount > 0 ? (winningTrades / closedCount) * 100 : 0;

  return {
    totalInrInvested: round2(totalInrInvested),
    totalFxChargesInr: round2(totalFxChargesInr),
    totalUsdDeposited: round2(totalUsdDeposited),
    liveUsdInrRate: fx,
    targetCapitalUsd: settings.targetCapitalUsd,

    openCostBasisUsd: round2(openCostBasisUsd),
    openCurrentValueUsd: round2(openCurrentValueUsd),
    unrealizedPnlUsd: round2(unrealizedPnlUsd),
    unrealizedPnlInr: round2(unrealizedPnlInr),

    realizedGrossPnlUsd: round2(realizedGrossPnlUsd),
    realizedNetPnlUsd: round2(realizedNetPnlUsd),
    realizedNetPnlInr: round2(realizedNetPnlUsd * fx),

    totalDividendsUsd: round2(totalDividendsUsd),
    totalTradeFeesUsd: round2(totalTradeFeesUsd),
    totalStandaloneFeesUsd: round2(totalStandaloneFeesUsd),
    totalAllFeesUsd: round2(totalAllFeesUsd),

    netAccountProfitUsd: round2(netAccountProfitUsd),
    netAccountProfitInr: round2(netAccountProfitInr),
    currentAccountValueUsd: round2(currentAccountValueUsd),
    currentAccountValueInr: round2(currentAccountValueInr),

    winRatePct: round2(winRatePct),
    winningTrades,
    losingTrades,
    closedCount,
    openLotsCount: activeLots.length,
    missingCmpLotsCount,

    brokerCashUsd: round2(brokerCashUsd),
    brokerInvestedUsd: round2(settings.brokerInvestedUsd ?? 0),
    brokerCurrentValueUsd: round2(settings.brokerCurrentValueUsd ?? 0),
    brokerPnlUsd: round2(settings.brokerPnlUsd ?? 0),
    brokerHoldingsCount: settings.brokerHoldingsCount ?? 0,
  };
}

/**
 * Consolidates multiple open lots of the same ticker for exposure & risk checks.
 */
export function consolidateOpenLots(
  openLots: OpenLot[],
  targetCapitalUsd: number
): ConsolidatedTickerSummary[] {
  const byTicker = new Map<string, OpenLot[]>();
  for (const lot of openLots) {
    if (lot.remainingShares <= 0.000001) continue;
    const key = lot.ticker.toUpperCase();
    const arr = byTicker.get(key) ?? [];
    arr.push(lot);
    byTicker.set(key, arr);
  }

  const summaries: ConsolidatedTickerSummary[] = [];
  for (const [ticker, lots] of byTicker.entries()) {
    let totalShares = 0;
    let totalInvestedUsd = 0;
    let currentValueUsd = 0;
    let tier: MarketCapTier | null = null;

    for (const lot of lots) {
      const ratio = lot.shares > 0 ? lot.remainingShares / lot.shares : 1;
      const invested = lot.buyValueUsd * ratio;
      const cmp = lot.currentPriceUsd ?? lot.buyPriceUsd;
      totalShares += lot.remainingShares;
      totalInvestedUsd += invested;
      currentValueUsd += lot.remainingShares * cmp;
      if (!tier && lot.marketCapTier) tier = lot.marketCapTier;
    }

    const avgBuyPriceUsd = totalShares > 0 ? totalInvestedUsd / totalShares : 0;
    const unrealizedPnlUsd = currentValueUsd - totalInvestedUsd;
    const unrealizedPnlPct = totalInvestedUsd > 0 ? (unrealizedPnlUsd / totalInvestedUsd) * 100 : 0;
    const allocationPctOfTarget =
      targetCapitalUsd > 0 ? (totalInvestedUsd / targetCapitalUsd) * 100 : 0;

    summaries.push({
      ticker,
      companyName: lots[0].companyName,
      lotCount: lots.length,
      totalShares: round6(totalShares),
      avgBuyPriceUsd: round2(avgBuyPriceUsd),
      totalInvestedUsd: round2(totalInvestedUsd),
      currentValueUsd: round2(currentValueUsd),
      unrealizedPnlUsd: round2(unrealizedPnlUsd),
      unrealizedPnlPct: round2(unrealizedPnlPct),
      allocationPctOfTarget: round2(allocationPctOfTarget),
      marketCapTier: tier,
      maxAllowedPct: tier ? MARKET_CAP_LIMITS[tier] : null,
    });
  }

  return summaries.sort((a, b) => b.totalInvestedUsd - a.totalInvestedUsd);
}

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] as const;

/**
 * Formats an ISO date (YYYY-MM-DD) into Indian Financial Year month code,
 * e.g. 2026-11-19 -> "FY2627-N11", 2026-04-01 -> "FY2627-A04", 2026-03-15 -> "FY2526-M03".
 */
export function formatIndianFyMonth(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return "—";
  const year = parts[0];
  const month = parts[1];
  if (month < 1 || month > 12) return "—";
  const fyStart = (month >= 4 ? year : year - 1) % 100;
  const fyEnd = (fyStart + 1) % 100;
  const mm = String(month).padStart(2, "0");
  return `FY${String(fyStart).padStart(2, "0")}${String(fyEnd).padStart(2, "0")}-${MONTH_INITIALS[month - 1]}${mm}`;
}

export interface ClosedTradeComputedMetrics {
  status: "Fully Booked";
  account: string;
  days: number;
  pctGain: number;
  annualGainPct: number;
  gainAfterBookingPct: number | null;
  monthLabel: string;
}

export function computeClosedTradeMetrics(trade: ClosedTrade): ClosedTradeComputedMetrics {
  const days = trade.daysHeld;
  const pctGain = trade.buyValueUsd > 0 ? (trade.netPnlUsd / trade.buyValueUsd) * 100 : trade.pnlPct;
  const annualGainPct = days > 0 ? (pctGain / days) * 365 : pctGain;
  const gainAfterBookingPct =
    trade.cmpUsd !== null && trade.sellPriceUsd > 0
      ? ((trade.sellPriceUsd - trade.cmpUsd) / trade.sellPriceUsd) * 100
      : null;

  return {
    status: "Fully Booked",
    account: trade.source === "INDMONEY" ? "INDmoney" : trade.source,
    days,
    pctGain: round2(pctGain),
    annualGainPct: round2(annualGainPct),
    gainAfterBookingPct: gainAfterBookingPct !== null ? round2(gainAfterBookingPct) : null,
    monthLabel: formatIndianFyMonth(trade.sellDate),
  };
}

/**
 * Computes per-lot open metrics without silent CMP fallback.
 * When `lot.currentPriceUsd` is null or <= 0, price-dependent metrics are `null`
 * and `isSellGttReady30Pct` is `false`.
 */
export function computeOpenLotMetrics(
  lot: OpenLot,
  consolidatedMap: Map<string, ConsolidatedTickerSummary>,
  targetCapitalUsd: number,
  todayIso?: string
): OpenLotComputedMetrics {
  const ratio = lot.shares > 0 ? lot.remainingShares / lot.shares : 1;
  const buyValueRemainingRaw = lot.buyValueUsd * ratio;
  const buyValueRemainingUsd = round2(buyValueRemainingRaw);

  const allocationPctRaw = targetCapitalUsd > 0 ? (buyValueRemainingRaw / targetCapitalUsd) * 100 : 0;
  const allocationPct = round2(allocationPctRaw);

  const consolidated =
    consolidatedMap.get(lot.ticker.toUpperCase()) ?? consolidatedMap.get(lot.ticker);
  const totalTickerAllocationPct = consolidated
    ? round2(consolidated.allocationPctOfTarget)
    : allocationPct;
  const allocLeftPct =
    consolidated?.maxAllowedPct != null
      ? round2(consolidated.maxAllowedPct - consolidated.allocationPctOfTarget)
      : null;

  const hasCmp = lot.currentPriceUsd != null && lot.currentPriceUsd > 0;
  const hasTarget = lot.targetPriceUsd != null && lot.targetPriceUsd > 0;

  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const daysHeld = daysBetween(lot.buyDate, today);

  let currentValueUsd: number | null = null;
  let gainAmountUsd: number | null = null;
  let currentGainPct: number | null = null;
  let remainingGainPct: number | null = null;
  let annualReturnPct: number | null = null;
  let dAthPct: number | null = null;

  if (hasCmp) {
    const cmp = lot.currentPriceUsd as number;
    const currentValueRaw = lot.remainingShares * cmp;
    const gainAmountRaw = currentValueRaw - buyValueRemainingRaw;

    currentValueUsd = round2(currentValueRaw);
    gainAmountUsd = round2(gainAmountRaw);

    const currentGainPctRaw =
      buyValueRemainingRaw > 0
        ? (gainAmountRaw / buyValueRemainingRaw) * 100
        : lot.buyPriceUsd > 0
          ? ((cmp - lot.buyPriceUsd) / lot.buyPriceUsd) * 100
          : null;

    if (currentGainPctRaw !== null) {
      currentGainPct = round2(currentGainPctRaw);
      annualReturnPct = round2(
        daysHeld > 0 ? (currentGainPctRaw / daysHeld) * 365 : currentGainPctRaw
      );
    }

    if (hasTarget) {
      const target = lot.targetPriceUsd as number;
      remainingGainPct = round2(((target - cmp) / cmp) * 100);
    }

    if (lot.athPriceUsd != null && lot.athPriceUsd > 0) {
      dAthPct = round2(((cmp - lot.athPriceUsd) / lot.athPriceUsd) * 100);
    }
  }

  let potentialGainPct: number | null = null;
  let totalPotentialGainUsd: number | null = null;
  if (hasTarget) {
    const target = lot.targetPriceUsd as number;
    const totalPotentialGainRaw = lot.remainingShares * target - buyValueRemainingRaw;
    totalPotentialGainUsd = round2(totalPotentialGainRaw);
    const potentialGainPctRaw =
      buyValueRemainingRaw > 0
        ? (totalPotentialGainRaw / buyValueRemainingRaw) * 100
        : lot.buyPriceUsd > 0
          ? ((target - lot.buyPriceUsd) / lot.buyPriceUsd) * 100
          : null;
    if (potentialGainPctRaw !== null) {
      potentialGainPct = round2(potentialGainPctRaw);
    }
  }

  const isSellGttReady30Pct =
    hasCmp &&
    hasTarget &&
    (lot.currentPriceUsd as number) >= (lot.targetPriceUsd as number) * 0.7 &&
    lot.sellGttStatus !== "PLACED" &&
    lot.sellGttStatus !== "TRIGGERED";

  return {
    buyValueRemainingUsd,
    allocationPct,
    totalTickerAllocationPct,
    allocLeftPct,
    currentValueUsd,
    gainAmountUsd,
    currentGainPct,
    remainingGainPct,
    potentialGainPct,
    totalPotentialGainUsd,
    daysHeld,
    annualReturnPct,
    dAthPct,
    monthLabel: formatIndianFyMonth(lot.buyDate),
    isSellGttReady30Pct,
  };
}
