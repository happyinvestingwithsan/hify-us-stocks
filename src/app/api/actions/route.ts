import { NextRequest, NextResponse } from "next/server";
import { buildDailyActions } from "@/lib/action-engine";
import { getJournalRepository } from "@/lib/sqlite-repository";
import { BrokerOrderDecisionStatus, OpportunityActionStatus } from "@/lib/types";

export async function GET() {
  try {
    const repo = getJournalRepository();
    const actions = buildDailyActions({
      openLots: repo.listOpenLots(),
      brokerOrders: repo.listBrokerOrders(),
      opportunities: repo.listOpportunities(),
      snoozes: repo.getActionSnoozes(),
    });
    return NextResponse.json({ actions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load daily actions" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const repo = getJournalRepository();

    if (body.brokerOrderId) {
      const id = Number(body.brokerOrderId);
      const decisionStatus =
        body.decisionStatus !== undefined
          ? (String(body.decisionStatus) as BrokerOrderDecisionStatus)
          : undefined;
      if (
        decisionStatus !== undefined &&
        !["PENDING_REVIEW", "REPLACED", "ADJUSTED", "DISMISSED"].includes(decisionStatus)
      ) {
        return NextResponse.json({ error: "Invalid decisionStatus" }, { status: 400 });
      }
      const updated = repo.updateBrokerOrderDecision(id, {
        decisionStatus,
        strategy: body.strategy !== undefined ? String(body.strategy).trim() : undefined,
        snoozedUntil: body.snoozedUntil ? String(body.snoozedUntil).slice(0, 10) : null,
        notes: body.notes !== undefined ? String(body.notes) : undefined,
      });
      if (!updated) return NextResponse.json({ error: "Broker order not found" }, { status: 404 });
      return NextResponse.json({ brokerOrder: updated });
    }

    if (body.opportunityId) {
      const id = Number(body.opportunityId);
      const actionStatus =
        body.actionStatus !== undefined
          ? (String(body.actionStatus) as OpportunityActionStatus)
          : undefined;
      if (
        actionStatus !== undefined &&
        !["PENDING", "DONE", "SNOOZED", "DISMISSED"].includes(actionStatus)
      ) {
        return NextResponse.json({ error: "Invalid actionStatus" }, { status: 400 });
      }
      const updated = repo.updateOpportunity(id, {
        actionStatus,
        strategy: body.strategy !== undefined ? String(body.strategy).trim() : undefined,
        snoozedUntil: body.snoozedUntil ? String(body.snoozedUntil).slice(0, 10) : null,
      });
      if (!updated) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
      return NextResponse.json({ opportunity: updated });
    }

    if (body.actionKey) {
      const actionKey = String(body.actionKey).trim();
      const snoozedUntil = body.snoozedUntil ? String(body.snoozedUntil).slice(0, 10) : null;
      repo.setActionSnooze(actionKey, snoozedUntil);
      return NextResponse.json({ ok: true, actionKey, snoozedUntil });
    }

    return NextResponse.json({ error: "Missing action target" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update action" },
      { status: 500 }
    );
  }
}
