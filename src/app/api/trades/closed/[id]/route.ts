import { NextRequest, NextResponse } from "next/server";
import { UpdateClosedTradeInput } from "@/lib/repository";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tradeId = Number(id);
  if (Number.isNaN(tradeId)) {
    return NextResponse.json({ error: "Invalid trade ID" }, { status: 400 });
  }

  const patch = (await req.json()) as UpdateClosedTradeInput;
  const repo = getJournalRepository();
  const updated = repo.updateClosedTrade(tradeId, patch);
  if (!updated) {
    return NextResponse.json({ error: "Closed trade not found" }, { status: 404 });
  }
  return NextResponse.json({ trade: updated });
}
