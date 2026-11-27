import { NextRequest, NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function GET() {
  try {
    const repo = getJournalRepository();
    return NextResponse.json({ strategies: repo.listStrategies() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load strategies" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: unknown; description?: unknown };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Strategy name is required" }, { status: 400 });
    }
    const repo = getJournalRepository();
    const strategy = repo.createStrategy({
      name,
      description: body.description !== undefined ? String(body.description) : "",
    });
    return NextResponse.json({ strategy }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create strategy" },
      { status: 500 }
    );
  }
}
