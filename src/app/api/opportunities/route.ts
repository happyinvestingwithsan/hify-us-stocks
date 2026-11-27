import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { importPotentialStocksWorkbook } from "@/lib/excel-importer";
import { getJournalRepository } from "@/lib/sqlite-repository";
import {
  MarketCapTier,
  OpportunityActionStatus,
  OpportunityActionType,
  OrderTypeOption,
} from "@/lib/types";

const VALID_ORDER_TYPES: OrderTypeOption[] = ["90D_TRIGGER", "LIMIT", "MARKET"];
const VALID_ACTION_TYPES: OpportunityActionType[] = ["PLACE_ORDER", "REVIEW_CHART", "WATCH"];
const VALID_ACTION_STATUSES: OpportunityActionStatus[] = ["PENDING", "DONE", "SNOOZED", "DISMISSED"];
const VALID_TIERS: MarketCapTier[] = ["MEGA", "LARGE", "MID", "SMALL"];

export async function GET() {
  try {
    const repo = getJournalRepository();
    return NextResponse.json({ opportunities: repo.listOpportunities() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load opportunities" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const repo = getJournalRepository();

    if (body.seedDefault === true) {
      const filePath = path.join(process.cwd(), "potential_stocks.xlsx");
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "potential_stocks.xlsx not found" }, { status: 404 });
      }
      const res = importPotentialStocksWorkbook(fs.readFileSync(filePath), repo);
      return NextResponse.json({ ...res, opportunities: repo.listOpportunities() });
    }

    const ticker = String(body.ticker ?? "").trim().toUpperCase();
    if (!ticker || ticker.length > 16) {
      return NextResponse.json({ error: "Valid ticker is required" }, { status: 400 });
    }

    const plannedOrderType = VALID_ORDER_TYPES.includes(body.plannedOrderType as OrderTypeOption)
      ? (body.plannedOrderType as OrderTypeOption)
      : "90D_TRIGGER";
    const actionType = VALID_ACTION_TYPES.includes(body.actionType as OpportunityActionType)
      ? (body.actionType as OpportunityActionType)
      : "PLACE_ORDER";
    const actionStatus = VALID_ACTION_STATUSES.includes(body.actionStatus as OpportunityActionStatus)
      ? (body.actionStatus as OpportunityActionStatus)
      : "PENDING";
    const marketCapTier = VALID_TIERS.includes(body.marketCapTier as MarketCapTier)
      ? (body.marketCapTier as MarketCapTier)
      : null;

    const numOrNull = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const { opportunity, created } = repo.upsertOpportunityByTicker({
      ticker,
      companyName: String(body.companyName ?? ticker).trim() || ticker,
      leaderMention: String(body.leaderMention ?? "").trim(),
      strategy: String(body.strategy ?? "").trim(),
      marketCapTier,
      currentPriceUsd: numOrNull(body.currentPriceUsd),
      plannedOrderType,
      triggerPriceUsd: numOrNull(body.triggerPriceUsd),
      targetCapitalUsd: numOrNull(body.targetCapitalUsd),
      actionType,
      actionDueDate: body.actionDueDate ? String(body.actionDueDate).slice(0, 10) : null,
      actionStatus,
      thesisNotes: String(body.thesisNotes ?? "").trim(),
      source: "MANUAL",
    });

    if (!created) {
      const updated = repo.updateOpportunity(opportunity.id, {
        companyName: String(body.companyName ?? opportunity.companyName).trim(),
        leaderMention: String(body.leaderMention ?? opportunity.leaderMention).trim(),
        strategy: body.strategy !== undefined ? String(body.strategy).trim() : opportunity.strategy,
        marketCapTier: marketCapTier ?? opportunity.marketCapTier,
        currentPriceUsd: numOrNull(body.currentPriceUsd) ?? opportunity.currentPriceUsd,
        plannedOrderType,
        triggerPriceUsd: numOrNull(body.triggerPriceUsd),
        targetCapitalUsd: numOrNull(body.targetCapitalUsd),
        actionType,
        actionDueDate: body.actionDueDate ? String(body.actionDueDate).slice(0, 10) : null,
        actionStatus,
        thesisNotes: String(body.thesisNotes ?? "").trim(),
      });
      return NextResponse.json({ opportunity: updated, created: false });
    }

    return NextResponse.json({ opportunity, created: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save opportunity" },
      { status: 500 }
    );
  }
}
