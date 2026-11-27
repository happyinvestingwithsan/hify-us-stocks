import { NextRequest, NextResponse } from "next/server";
import { buildDailyActions } from "@/lib/action-engine";
import { calculateAccountProfit, consolidateOpenLots } from "@/lib/profit-engine";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function GET() {
  const repo = getJournalRepository();
  const settings = repo.getSettings();
  const deposits = repo.listDeposits();
  const openLots = repo.listOpenLots();
  const closedTrades = repo.listClosedTrades();
  const cashflows = repo.listCashflows();
  const walletTransactions = repo.listWalletTransactions();
  const opportunities = repo.listOpportunities();
  const brokerOrders = repo.listBrokerOrders();
  const strategies = repo.listStrategies();
  const actions = buildDailyActions({
    openLots,
    brokerOrders,
    opportunities,
    snoozes: repo.getActionSnoozes(),
  });

  const summary = calculateAccountProfit({
    settings,
    deposits,
    openLots,
    closedTrades,
    cashflows,
  });

  const consolidated = consolidateOpenLots(openLots, settings.targetCapitalUsd);

  return NextResponse.json({
    settings,
    summary,
    consolidated,
    openLots,
    closedTrades,
    deposits,
    cashflows,
    walletTransactions,
    opportunities,
    brokerOrders,
    strategies,
    actions,
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    targetCapitalUsd?: number;
    liveUsdInrRate?: number;
  };
  const repo = getJournalRepository();
  const updated = repo.updateSettings({
    targetCapitalUsd:
      typeof body.targetCapitalUsd === "number" && body.targetCapitalUsd > 0
        ? body.targetCapitalUsd
        : undefined,
    liveUsdInrRate:
      typeof body.liveUsdInrRate === "number" && body.liveUsdInrRate > 0
        ? body.liveUsdInrRate
        : undefined,
  });
  return NextResponse.json({ settings: updated });
}
