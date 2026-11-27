import { NextRequest, NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";
import { ExecutionType } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      openLotId: number;
      sharesToClose: number;
      sellDate: string;
      sellPriceUsd: number;
      sellFeesUsd?: number;
      executionType?: ExecutionType;
      notes?: string;
    };

    const repo = getJournalRepository();
    const trade = repo.closeOpenLotShares({
      openLotId: Number(body.openLotId),
      sharesToClose: Number(body.sharesToClose),
      sellDate: body.sellDate,
      sellPriceUsd: Number(body.sellPriceUsd),
      sellFeesUsd: body.sellFeesUsd ? Number(body.sellFeesUsd) : 0,
      executionType: body.executionType ?? "INSTANT",
      notes: body.notes ?? "",
      source: "MANUAL",
    });

    return NextResponse.json({ ok: true, trade });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to close lot";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
