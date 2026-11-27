import { NextRequest, NextResponse } from "next/server";
import { ExcelImportResult, importTradesWorkbookBuffer } from "@/lib/excel-importer";
import { getJournalRepository } from "@/lib/sqlite-repository";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const repo = getJournalRepository();

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const rawFiles = [...formData.getAll("files"), ...formData.getAll("file")].filter(
        (f): f is File => f instanceof File
      );
      if (rawFiles.length === 0) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      const combined: ExcelImportResult = {
        openImported: 0,
        openSkipped: 0,
        closedImported: 0,
        closedSkipped: 0,
        lrsDepositsCreated: 0,
        lrsDepositsUpdated: 0,
        tradeFeesUpdated: 0,
        walletCashflowsCreated: 0,
        reportsDetected: [],
      };

      for (const file of rawFiles) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const res = importTradesWorkbookBuffer(buffer, repo);
        combined.openImported += res.openImported;
        combined.openSkipped += res.openSkipped;
        combined.closedImported += res.closedImported;
        combined.closedSkipped += res.closedSkipped;
        combined.lrsDepositsCreated += res.lrsDepositsCreated;
        combined.lrsDepositsUpdated += res.lrsDepositsUpdated;
        combined.tradeFeesUpdated += res.tradeFeesUpdated;
        combined.walletCashflowsCreated += res.walletCashflowsCreated;
        for (const r of res.reportsDetected) {
          if (!combined.reportsDetected.includes(r)) combined.reportsDetected.push(r);
        }
      }

      return NextResponse.json({ ok: true, result: combined });
    }

    return NextResponse.json({ error: "Multipart file upload required" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Excel import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
