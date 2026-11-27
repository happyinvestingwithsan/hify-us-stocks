import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { IndmoneySyncPayload, processIndmoneySync } from "@/lib/indmoney-sync";
import { getJournalRepository } from "@/lib/sqlite-repository";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface RawCapturePayload extends IndmoneySyncPayload {
  rawCaptures?: Record<string, unknown>;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as RawCapturePayload;

    // Persist raw extension captures locally for schema mapping & inspection
    if (payload.rawCaptures) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(dataDir, "indmoney_last_capture.json"),
        JSON.stringify(payload.rawCaptures, null, 2),
        "utf8"
      );
    }

    const repo = getJournalRepository();
    const result = processIndmoneySync(payload, repo);
    return NextResponse.json({ ok: true, result }, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: CORS_HEADERS });
  }
}
