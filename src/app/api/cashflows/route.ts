import { NextRequest, NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";
import { CashflowEventType } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      eventDate: string;
      type: CashflowEventType;
      ticker?: string | null;
      amountUsd: number;
      amountInr?: number;
      notes?: string;
    };
    const repo = getJournalRepository();
    const { event } = repo.upsertCashflowByExternalId({
      eventDate: body.eventDate,
      type: body.type,
      ticker: body.ticker ?? null,
      amountUsd: Number(body.amountUsd),
      amountInr: Number(body.amountInr ?? 0),
      notes: body.notes ?? "",
    });
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add cashflow";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  getJournalRepository().deleteCashflow(id);
  return NextResponse.json({ ok: true });
}
