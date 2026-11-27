import { NextRequest, NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      depositDate: string;
      inrAmount: number;
      fxRate: number;
      fxChargesInr?: number;
      usdCredited: number;
      notes?: string;
    };
    const repo = getJournalRepository();
    const deposit = repo.addDeposit({
      depositDate: body.depositDate,
      inrAmount: Number(body.inrAmount),
      fxRate: Number(body.fxRate),
      fxChargesInr: Number(body.fxChargesInr ?? 0),
      usdCredited: Number(body.usdCredited),
      notes: body.notes ?? "",
    });
    return NextResponse.json({ ok: true, deposit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add deposit";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  getJournalRepository().deleteDeposit(id);
  return NextResponse.json({ ok: true });
}
