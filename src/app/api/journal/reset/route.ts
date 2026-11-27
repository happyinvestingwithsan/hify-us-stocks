import { NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function POST() {
  getJournalRepository().resetAll();
  return NextResponse.json({ ok: true });
}
