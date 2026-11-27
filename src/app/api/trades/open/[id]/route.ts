import { NextRequest, NextResponse } from "next/server";
import { UpdateOpenLotInput } from "@/lib/repository";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const lotId = Number(id);
  if (Number.isNaN(lotId)) {
    return NextResponse.json({ error: "Invalid lot ID" }, { status: 400 });
  }

  const body = (await req.json()) as UpdateOpenLotInput;
  const patch: UpdateOpenLotInput = {
    ...body,
  };

  if (body.listName !== undefined) {
    patch.listName = body.listName;
  }
  if (body.lrd !== undefined) {
    patch.lrd = body.lrd;
  }
  if (body.currentPriceUsd !== undefined && body.quoteSource === undefined) {
    patch.quoteSource = "MANUAL";
    patch.quoteUpdatedAt = new Date().toISOString();
  }

  const repo = getJournalRepository();
  const updated = repo.updateOpenLot(lotId, patch);
  if (!updated) {
    return NextResponse.json({ error: "Open lot not found" }, { status: 404 });
  }
  return NextResponse.json({ lot: updated });
}
