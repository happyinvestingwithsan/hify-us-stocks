import { BrokerOrder, DailyActionItem, OpenLot, Opportunity } from "./types";

function get90DayExpiry(dateStr: string): { expiryDate: string; daysLeft: number } | null {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1 + 3, parts[2]));
  const expiryDate = d.toISOString().slice(0, 10);
  const todayUtc = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const daysLeft = Math.round((d.getTime() - todayUtc) / (1000 * 60 * 60 * 24));
  return { expiryDate, daysLeft };
}

/**
 * Computes the prioritized "Action for the Day" discipline queue from:
 * 1. Open lots missing a Target Price or Sell GTT
 * 2. Cancelled / expired 90-day trigger orders (e.g., corporate action or 90d expiry)
 * 3. Active 90-day Sell GTTs expiring within 14 days
 * 4. Opportunities with a pending self-assigned action
 */
export function buildDailyActions(params: {
  openLots: OpenLot[];
  brokerOrders: BrokerOrder[];
  opportunities: Opportunity[];
  snoozes?: Record<string, string>;
  todayIso?: string;
}): DailyActionItem[] {
  const today = params.todayIso ?? new Date().toISOString().slice(0, 10);
  const items: DailyActionItem[] = [];

  // 1. Open lots: missing target price, missing CMP, or >= 70% of target (30% Sell GTT rule)
  for (const lot of params.openLots) {
    if (lot.remainingShares <= 0) continue;

    if (!lot.targetPriceUsd || lot.targetPriceUsd <= 0) {
      items.push({
        actionKey: `lot:${lot.id}:missing_target`,
        kind: "MISSING_TARGET",
        priority: "HIGH",
        ticker: lot.ticker,
        companyName: lot.companyName,
        strategy: lot.strategy || "",
        title: `Set Target Price (${lot.remainingShares.toFixed(4)} sh)`,
        subtitle: `Bought ${lot.buyDate} @ $${lot.buyPriceUsd.toFixed(2)} ($${lot.buyValueUsd.toFixed(2)})`,
        dueDate: today,
        snoozedUntil: null,
        openLotId: lot.id,
        recommendedOrderType: "90D_TRIGGER",
        priceUsd: lot.currentPriceUsd ?? lot.buyPriceUsd,
      });
      continue;
    }

    if (lot.sellGttStatus === "NONE" || lot.sellGttStatus === "PLANNED") {
      if (lot.currentPriceUsd == null || lot.currentPriceUsd <= 0) {
        items.push({
          actionKey: `lot:${lot.id}:refresh_cmp`,
          kind: "REFRESH_CMP",
          priority: "HIGH",
          ticker: lot.ticker,
          companyName: lot.companyName,
          strategy: lot.strategy || "",
          title: `Refresh CMP to check 30% Sell GTT readiness`,
          subtitle: `Target $${lot.targetPriceUsd.toFixed(2)} set • Live CMP missing`,
          dueDate: today,
          snoozedUntil: null,
          openLotId: lot.id,
          priceUsd: lot.targetPriceUsd,
        });
      } else if (lot.currentPriceUsd >= lot.targetPriceUsd * 0.70) {
        items.push({
          actionKey: `lot:${lot.id}:place_sell_gtt`,
          kind: "PLACE_SELL_GTT_30PCT",
          priority: "HIGH",
          ticker: lot.ticker,
          companyName: lot.companyName,
          strategy: lot.strategy || "",
          title: `Place Sell GTT on INDmoney @ $${lot.targetPriceUsd.toFixed(2)}`,
          subtitle: `CMP $${lot.currentPriceUsd.toFixed(2)} is within 30% of Target • ${lot.remainingShares.toFixed(4)} sh`,
          dueDate: today,
          snoozedUntil: null,
          openLotId: lot.id,
          recommendedOrderType: "90D_TRIGGER",
          priceUsd: lot.targetPriceUsd,
        });
      }
    }
  }

  // 2. Cancelled / Expired / Rejected broker orders needing user decision
  for (const order of params.brokerOrders) {
    if (order.status !== "CANCELLED" && order.status !== "EXPIRED" && order.status !== "REJECTED") {
      continue;
    }
    if (order.decisionStatus !== "PENDING_REVIEW") continue;

    const reason = order.cancellationReason
      ? order.cancellationReason
      : order.status === "EXPIRED"
        ? "90-day trigger expired"
        : "Cancelled on INDmoney (check corporate action / price)";

    items.push({
      actionKey: `order:${order.id}`,
      kind: "CANCELLED_TRIGGER",
      priority: "HIGH",
      ticker: order.ticker,
      companyName: order.companyName || order.ticker,
      strategy: order.strategy || "",
      title: `${order.side} ${order.orderType} ${order.status} — Decision Needed`,
      subtitle: `${order.orderDate} • $${order.valueUsd.toFixed(2)} @ $${order.priceUsd.toFixed(2)} • ${reason}`,
      dueDate: order.orderDate,
      snoozedUntil: null,
      brokerOrderId: order.id,
      recommendedOrderType: "90D_TRIGGER",
      priceUsd: order.priceUsd,
    });
  }

  // 3. Active 90d Sell GTTs expiring soon (<= 14 days) or past 3m
  for (const lot of params.openLots) {
    if (lot.remainingShares <= 0 || lot.sellGttStatus !== "PLACED") continue;
    const exp = get90DayExpiry(lot.buyDate);
    if (!exp || exp.daysLeft > 14) continue;

    const actionKey = `lot:${lot.id}:expiring_gtt`;

    items.push({
      actionKey,
      kind: "EXPIRING_TRIGGER",
      priority: exp.daysLeft < 0 ? "HIGH" : "MEDIUM",
      ticker: lot.ticker,
      companyName: lot.companyName,
      strategy: lot.strategy || "",
      title:
        exp.daysLeft < 0
          ? `90d Sell Trigger likely expired (${exp.expiryDate})`
          : `90d Sell Trigger expiring in ${exp.daysLeft}d (${exp.expiryDate})`,
      subtitle: `Lot bought ${lot.buyDate} • Target $${(lot.sellGttPriceUsd ?? lot.targetPriceUsd ?? 0).toFixed(2)}`,
      dueDate: exp.expiryDate,
      snoozedUntil: null,
      openLotId: lot.id,
      recommendedOrderType: "90D_TRIGGER",
      priceUsd: lot.sellGttPriceUsd ?? lot.targetPriceUsd,
    });
  }

  // 4. Opportunities with pending self-assigned action
  for (const opp of params.opportunities) {
    if (opp.actionStatus !== "PENDING") continue;
    // Surface if action is PLACE_ORDER or REVIEW_CHART, or due today/overdue
    const isDue = !opp.actionDueDate || opp.actionDueDate <= today;
    if (opp.actionType === "WATCH" && !opp.actionDueDate) continue;
    if (!isDue && opp.actionType === "WATCH") continue;

    const orderLabel =
      opp.plannedOrderType === "90D_TRIGGER"
        ? "90d Trigger"
        : opp.plannedOrderType === "LIMIT"
          ? "Limit"
          : "Market";

    items.push({
      actionKey: `opp:${opp.id}`,
      kind: "OPPORTUNITY_ACTION",
      priority: opp.actionType === "PLACE_ORDER" ? "MEDIUM" : "LOW",
      ticker: opp.ticker,
      companyName: opp.companyName,
      strategy: opp.strategy || "",
      title:
        opp.actionType === "PLACE_ORDER"
          ? `Place ${orderLabel} Buy @ $${(opp.triggerPriceUsd ?? 0).toFixed(2)}`
          : opp.actionType === "REVIEW_CHART"
            ? `Review Chart & Set Entry Trigger`
            : `Watchlist Follow-Up`,
      subtitle: [
        opp.targetCapitalUsd ? `Size $${opp.targetCapitalUsd.toFixed(0)}` : null,
        opp.plannedShares ? `${opp.plannedShares.toFixed(4)} sh` : null,
        opp.thesisNotes ? opp.thesisNotes : null,
      ]
        .filter(Boolean)
        .join(" • ") || "Assigned during chart analysis",
      dueDate: opp.actionDueDate,
      snoozedUntil: null,
      opportunityId: opp.id,
      recommendedOrderType: opp.plannedOrderType,
      priceUsd: opp.triggerPriceUsd ?? opp.currentPriceUsd,
    });
  }

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
