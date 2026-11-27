import { NextRequest, NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const strategyId = Number(id);
    if (!Number.isInteger(strategyId) || strategyId <= 0) {
      return NextResponse.json({ error: "Invalid strategy id" }, { status: 400 });
    }

    const body = (await req.json()) as {
      name?: unknown;
      description?: unknown;
      isActive?: unknown;
    };

    const repo = getJournalRepository();
    const updated = repo.updateStrategy(strategyId, {
      name: body.name !== undefined ? String(body.name) : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }
    return NextResponse.json({ strategy: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update strategy" },
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
    const strategyId = Number(id);
    if (!Number.isInteger(strategyId) || strategyId <= 0) {
      return NextResponse.json({ error: "Invalid strategy id" }, { status: 400 });
    }
    const repo = getJournalRepository();
    repo.deleteStrategy(strategyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete strategy" },
      { status: 500 }
    );
  }
}
