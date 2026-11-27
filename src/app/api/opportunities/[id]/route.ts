import { NextRequest, NextResponse } from "next/server";
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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const oppId = Number(id);
    if (!Number.isInteger(oppId) || oppId <= 0) {
      return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const numOrNull = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const repo = getJournalRepository();
    const updated = repo.updateOpportunity(oppId, {
      companyName: body.companyName !== undefined ? String(body.companyName).trim() : undefined,
      leaderMention: body.leaderMention !== undefined ? String(body.leaderMention).trim() : undefined,
      strategy: body.strategy !== undefined ? String(body.strategy).trim() : undefined,
      marketCapTier:
        body.marketCapTier === null
          ? null
          : VALID_TIERS.includes(body.marketCapTier as MarketCapTier)
            ? (body.marketCapTier as MarketCapTier)
            : undefined,
      currentPriceUsd: numOrNull(body.currentPriceUsd),
      plannedOrderType: VALID_ORDER_TYPES.includes(body.plannedOrderType as OrderTypeOption)
        ? (body.plannedOrderType as OrderTypeOption)
        : undefined,
      triggerPriceUsd: numOrNull(body.triggerPriceUsd),
      targetCapitalUsd: numOrNull(body.targetCapitalUsd),
      actionType: VALID_ACTION_TYPES.includes(body.actionType as OpportunityActionType)
        ? (body.actionType as OpportunityActionType)
        : undefined,
      actionDueDate:
        body.actionDueDate !== undefined
          ? body.actionDueDate
            ? String(body.actionDueDate).slice(0, 10)
            : null
          : undefined,
      actionStatus: VALID_ACTION_STATUSES.includes(body.actionStatus as OpportunityActionStatus)
        ? (body.actionStatus as OpportunityActionStatus)
        : undefined,
      snoozedUntil:
        body.snoozedUntil !== undefined
          ? body.snoozedUntil
            ? String(body.snoozedUntil).slice(0, 10)
            : null
          : undefined,
      thesisNotes: body.thesisNotes !== undefined ? String(body.thesisNotes).trim() : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }
    return NextResponse.json({ opportunity: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update opportunity" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const oppId = Number(id);
    if (!Number.isInteger(oppId) || oppId <= 0) {
      return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
    }
    const repo = getJournalRepository();
    repo.deleteOpportunity(oppId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete opportunity" },
      { status: 500 }
    );
  }
}
