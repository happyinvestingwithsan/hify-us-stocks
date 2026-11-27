import * as XLSX from "xlsx";
import { JournalRepository } from "./repository";

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * Parses formats like "12th Feb'26", "2nd Mar'26", Excel serial numbers, or ISO dates.
 */
export function parseFlexibleDate(raw: unknown): string {
  if (typeof raw === "number" && raw > 20000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
  }
  const str = String(raw ?? "").trim();
  if (!str) return new Date().toISOString().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  const m = str.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})['\s-]*(\d{2,4})$/i);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = MONTHS[m[2].toLowerCase()] ?? "01";
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${month}-${day}`;
  }

  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Splits "Accenture PLC (ACN)" into { companyName: "Accenture PLC", ticker: "ACN" }.
 */
export function parseStockLabel(raw: unknown): { companyName: string; ticker: string } {
  const str = String(raw ?? "").trim();
  const match = str.match(/^(.*?)\s*\(([A-Za-z0-9.-]+)\)\s*$/);
  if (match) {
    return {
      companyName: match[1].trim(),
      ticker: match[2].trim().toUpperCase(),
    };
  }
  return {
    companyName: str,
    ticker: str.toUpperCase(),
  };
}

export interface ExcelImportResult {
  openImported: number;
  openSkipped: number;
  closedImported: number;
  closedSkipped: number;
  lrsDepositsCreated: number;
  lrsDepositsUpdated: number;
  tradeFeesUpdated: number;
  walletCashflowsCreated: number;
  reportsDetected: string[];
}

function numVal(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v ?? "").replace(/[$,₹,\s]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function dateDistanceDays(a: string, b: string): number {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 9999;
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
}

function sheetRowsAsObjects(
  sheet: XLSX.WorkSheet,
  requiredHeader: string
): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIdx = matrix.findIndex((row) =>
    row.some((cell) => String(cell).trim() === requiredHeader)
  );
  if (headerIdx < 0) return [];

  const headers = matrix[headerIdx].map((h) => String(h).trim());
  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => String(c).trim() === "")) continue;
    const first = String(row[0] ?? "").trim().toLowerCase();
    if (first.startsWith("total") || first.startsWith("disclaimer")) break;

    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function importLrsReport(sheet: XLSX.WorkSheet, repo: JournalRepository) {
  let created = 0;
  let updated = 0;
  let latestDate = "";
  let latestFx = 0;
  const rows = sheetRowsAsObjects(sheet, "Transaction Date");
  const existingDeposits = repo.listDeposits();

  for (const row of rows) {
    const movement = String(row["Money Movement"] ?? "").trim().toLowerCase();
    if (movement && !movement.includes("deposit")) continue;

    const usdCredited = numVal(row["USD Amount"]);
    const inrAmount = numVal(row["INR Amount"]);
    if (usdCredited <= 0) continue;

    const depositDate = parseFlexibleDate(row["Transaction Date"]);
    const fxChargesInr = numVal(row["GST Charged"]) + numVal(row["Bank Fixed Fee"]);
    const fxRate = numVal(row["Exchange Rate"]);
    const bankUsed = String(row["Bank Used"] ?? "").trim();
    const notes = bankUsed ? `${bankUsed} · LRS` : "INDmoney LRS";

    if (fxRate > 0 && depositDate >= latestDate) {
      latestDate = depositDate;
      latestFx = fxRate;
    }

    const match = existingDeposits.find(
      (d) => d.depositDate === depositDate && Math.abs(d.usdCredited - usdCredited) <= 0.05
    );
    if (match) {
      repo.updateDeposit(match.id, {
        inrAmount,
        fxRate,
        fxChargesInr,
        usdCredited,
        notes,
      });
      updated++;
    } else {
      const res = repo.upsertDepositByExternalId({
        externalId: `excel:lrs:${depositDate}:${usdCredited.toFixed(2)}`,
        depositDate,
        inrAmount,
        fxRate,
        fxChargesInr,
        usdCredited,
        notes,
      });
      if (res.created) created++;
    }
  }
  if (latestFx > 0 && repo.getSettings().liveUsdInrRate === 85) {
    repo.updateSettings({ liveUsdInrRate: latestFx });
  }
  return { created, updated };
}

function importTradesReport(sheet: XLSX.WorkSheet, repo: JournalRepository): number {
  let feesUpdated = 0;
  const rows = sheetRowsAsObjects(sheet, "Trade Date");
  const allLots = repo.listAllOpenLots();
  const allClosed = repo.listClosedTrades();
  const matchedLotIds = new Set<number>();
  const matchedClosedSellIds = new Set<number>();

  for (const row of rows) {
    if (String(row["Status"] ?? "").trim().toUpperCase() !== "FILLED") continue;
    const ticker = String(row["Ticker"] ?? "").trim().toUpperCase();
    const side = String(row["Side"] ?? "").trim().toUpperCase();
    const qty = numVal(row["Quantity"]);
    const amount = numVal(row["($) Amount"]);
    const commission = numVal(row["($) Commission"]);
    if (!ticker || qty <= 0 || commission <= 0) continue;

    const tradeDate = parseFlexibleDate(row["Trade Date"]);

    if (side === "BUY") {
      const candidates = allLots.filter((l) => l.ticker.toUpperCase() === ticker);
      const pickBest = (pool: typeof candidates) => {
        const exactDate = pool.find(
          (l) => Math.abs(l.shares - qty) <= 1e-4 && l.buyDate === tradeDate
        );
        if (exactDate) return exactDate;

        const qtyMatches = pool
          .filter((l) => Math.abs(l.shares - qty) <= 1e-4)
          .sort((a, b) => dateDistanceDays(a.buyDate, tradeDate) - dateDistanceDays(b.buyDate, tradeDate));
        if (qtyMatches.length > 0 && dateDistanceDays(qtyMatches[0].buyDate, tradeDate) <= 10) {
          return qtyMatches[0];
        }

        const valMatches = pool
          .filter((l) => Math.abs(l.buyValueUsd - amount) <= 0.05)
          .sort((a, b) => dateDistanceDays(a.buyDate, tradeDate) - dateDistanceDays(b.buyDate, tradeDate));
        if (valMatches.length > 0 && dateDistanceDays(valMatches[0].buyDate, tradeDate) <= 10) {
          return valMatches[0];
        }
        return null;
      };

      const lot =
        pickBest(candidates.filter((l) => !matchedLotIds.has(l.id))) ?? pickBest(candidates);

      if (lot) {
        matchedLotIds.add(lot.id);
        if (Math.abs(lot.feesUsd - commission) > 1e-4) {
          repo.updateOpenLot(lot.id, { feesUsd: commission });
          feesUpdated++;
        }
        for (const ct of allClosed.filter((c) => c.openLotId === lot.id)) {
          const propBuyFee = lot.shares > 0 ? commission * (ct.shares / lot.shares) : commission;
          if (Math.abs(ct.buyFeesUsd - propBuyFee) > 1e-4) {
            repo.updateClosedTrade(ct.id, { buyFeesUsd: propBuyFee });
            feesUpdated++;
          }
        }
      }
      continue;
    }

    if (side === "SELL") {
      const pool = allClosed.filter(
        (c) => c.ticker.toUpperCase() === ticker && !matchedClosedSellIds.has(c.id)
      );

      // Single closed trade match
      const single = pool
        .filter((c) => Math.abs(c.shares - qty) <= 1e-4 && dateDistanceDays(c.sellDate, tradeDate) <= 10)
        .sort((a, b) => dateDistanceDays(a.sellDate, tradeDate) - dateDistanceDays(b.sellDate, tradeDate))[0];

      if (single) {
        matchedClosedSellIds.add(single.id);
        if (Math.abs(single.sellFeesUsd - commission) > 1e-4) {
          repo.updateClosedTrade(single.id, { sellFeesUsd: commission });
          feesUpdated++;
        }
        continue;
      }

      // Multi-slice close (one SELL order closed multiple lots)
      const byDate = new Map<string, typeof pool>();
      for (const c of pool) {
        if (dateDistanceDays(c.sellDate, tradeDate) <= 10) {
          const arr = byDate.get(c.sellDate) ?? [];
          arr.push(c);
          byDate.set(c.sellDate, arr);
        }
      }
      for (const [, group] of byDate.entries()) {
        const sumShares = group.reduce((s, c) => s + c.shares, 0);
        if (Math.abs(sumShares - qty) <= 1e-4) {
          for (const c of group) {
            matchedClosedSellIds.add(c.id);
            const propSellFee = sumShares > 0 ? commission * (c.shares / sumShares) : 0;
            if (Math.abs(c.sellFeesUsd - propSellFee) > 1e-4) {
              repo.updateClosedTrade(c.id, { sellFeesUsd: propSellFee });
              feesUpdated++;
            }
          }
          break;
        }
      }
    }
  }

  return feesUpdated;
}

function importWalletStatement(sheet: XLSX.WorkSheet, repo: JournalRepository): number {
  let created = 0;
  const rows = sheetRowsAsObjects(sheet, "Date");
  const existingCashflows = repo.listCashflows();

  for (const row of rows) {
    const typeRaw = String(row["Type"] ?? "").trim().toUpperCase();
    const movement = String(row["Money Movement"] ?? "").trim().toLowerCase();
    const desc = String(row["Description"] ?? "").trim();
    const amount = Math.abs(numVal(row["($) Amount"]));
    if (amount <= 0) continue;

    const eventDate = parseFlexibleDate(row["Date"]);
    const rawTicker = String(row["Ticker"] ?? "").trim().toUpperCase();
    const descTickerMatch = desc.match(/\bfor\s+([A-Z0-9.-]{1,6})\b/i);
    const ticker = rawTicker || (descTickerMatch ? descTickerMatch[1].toUpperCase() : null);

    let cfType: "DIVIDEND" | "WITHHOLDING_TAX" | "PLATFORM_FEE" | null = null;
    if (typeRaw === "DIVIDEND") cfType = "DIVIDEND";
    else if (typeRaw === "DIVIDEND TAX" || typeRaw.includes("TAX")) cfType = "WITHHOLDING_TAX";
    else if (typeRaw === "WALLET ADJUSTMENT" && movement.includes("out")) cfType = "PLATFORM_FEE";

    if (!cfType) continue;

    const alreadyExists = existingCashflows.some(
      (c) =>
        dateDistanceDays(c.eventDate, eventDate) <= 7 &&
        c.type === cfType &&
        (c.ticker ?? null) === ticker &&
        Math.abs(c.amountUsd - amount) <= 0.01
    );
    if (alreadyExists) continue;

    const extId = `excel:wstmt:${cfType.toLowerCase()}:${eventDate}:${ticker ?? "US"}:${amount.toFixed(2)}`;
    const res = repo.upsertCashflowByExternalId({
      externalId: extId,
      eventDate,
      type: cfType,
      ticker,
      amountUsd: amount,
      notes: desc || typeRaw,
    });
    if (res.created) {
      created++;
      existingCashflows.push(res.event);
    }
  }

  return created;
}

export function importTradesWorkbookBuffer(
  buffer: Buffer,
  repo: JournalRepository
): ExcelImportResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const result: ExcelImportResult = {
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

  if (wb.Sheets["LRS Report"]) {
    result.reportsDetected.push("LRS Report");
    const lrs = importLrsReport(wb.Sheets["LRS Report"], repo);
    result.lrsDepositsCreated += lrs.created;
    result.lrsDepositsUpdated += lrs.updated;
  }

  if (wb.Sheets["Trades Report"]) {
    result.reportsDetected.push("Trades Report");
    result.tradeFeesUpdated += importTradesReport(wb.Sheets["Trades Report"], repo);
  }

  if (wb.Sheets["Wallet Statement"]) {
    result.reportsDetected.push("Wallet Statement");
    result.walletCashflowsCreated += importWalletStatement(wb.Sheets["Wallet Statement"], repo);
  }

  const openSheet = wb.Sheets["Open Trades"];
  if (openSheet) {
    result.reportsDetected.push("Open Trades");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(openSheet);
    for (const row of rows) {
      const stockRaw = row["Stock"] ?? row["Ticker"];
      const shares = Number(row["Shares"] ?? row["Qty"] ?? 0);
      const buyPrice = Number(row["Buy Price"] ?? 0);
      const buyValue = Number(row["Buy Value"] ?? shares * buyPrice);
      if (!stockRaw || shares <= 0) continue;

      const { companyName, ticker } = parseStockLabel(stockRaw);
      const buyDate = parseFlexibleDate(row["Buy Date"]);
      const externalId = `excel:open:${ticker}:${buyDate}:${shares}:${buyPrice}`;

      const { created } = repo.upsertOpenLotByExternalId({
        externalId,
        ticker,
        companyName,
        buyDate,
        shares,
        buyPriceUsd: buyPrice,
        buyValueUsd: buyValue,
        feesUsd: Number(row["Fees"] ?? 0),
        strategy: String(row["Strategy"] ?? ""),
        targetPriceUsd: row["Target Price"] ? Number(row["Target Price"]) : null,
        source: "EXCEL",
      });
      if (created) result.openImported++;
      else result.openSkipped++;
    }
  }

  const closedSheet = wb.Sheets["Closed Trades"];
  if (closedSheet) {
    result.reportsDetected.push("Closed Trades");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(closedSheet);
    for (const row of rows) {
      const stockRaw = row["Stock"] ?? row["Ticker"];
      const shares = Number(row["Shares"] ?? row["Qty"] ?? 0);
      const buyPrice = Number(row["Buy Price"] ?? 0);
      const buyValue = Number(row["Buy Value"] ?? shares * buyPrice);
      const sellPrice = Number(row["Sell Price"] ?? 0);
      const sellValue = Number(row["Sell Value"] ?? shares * sellPrice);
      if (!stockRaw || shares <= 0) continue;

      const { companyName, ticker } = parseStockLabel(stockRaw);
      const buyDate = parseFlexibleDate(row["Buy Date"]);
      const sellDate = parseFlexibleDate(row["Sell Date"]);
      const externalId = `excel:closed:${ticker}:${buyDate}:${sellDate}:${shares}:${sellPrice}`;

      const { created } = repo.upsertClosedTradeByExternalId({
        externalId,
        ticker,
        companyName,
        buyDate,
        sellDate,
        shares,
        buyPriceUsd: buyPrice,
        buyValueUsd: buyValue,
        sellPriceUsd: sellPrice,
        sellValueUsd: sellValue,
        buyFeesUsd: Number(row["Buy Fees"] ?? 0),
        sellFeesUsd: Number(row["Sell Fees"] ?? 0),
        strategy: String(row["Strategy"] ?? ""),
        source: "EXCEL",
      });
      if (created) result.closedImported++;
      else result.closedSkipped++;
    }
  }

  return result;
}

/**
 * Seeds opportunities idempotently from potential_stocks.xlsx
 * (columns: "Leader / Mention", "Company Name", "Ticker (Exchange)").
 */
export function importPotentialStocksWorkbook(
  buffer: Buffer,
  repo: JournalRepository
): { imported: number; updated: number } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { imported: 0, updated: 0 };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  });

  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const rawTicker = String(
      row["Ticker (Exchange)"] ?? row["Ticker"] ?? row["Symbol"] ?? ""
    ).trim();
    if (!rawTicker) continue;

    // Strip exchange prefix/suffix like "NASDAQ: NVDA" or "NVDA (NASDAQ)"
    const tickerClean = rawTicker
      .replace(/\(.*?\)/g, "")
      .replace(/^[A-Z]+:\s*/i, "")
      .trim()
      .toUpperCase();
    if (!tickerClean || tickerClean.length > 16) continue;

    const companyName =
      String(row["Company Name"] ?? row["Company"] ?? "").trim() || tickerClean;
    const leaderMention = String(
      row["Leader / Mention"] ?? row["Leader"] ?? row["Source"] ?? ""
    ).trim();

    const { created } = repo.upsertOpportunityByTicker({
      ticker: tickerClean,
      companyName,
      leaderMention,
      plannedOrderType: "90D_TRIGGER",
      actionType: "REVIEW_CHART",
      actionStatus: "PENDING",
      source: "EXCEL",
    });

    if (created) imported++;
    else updated++;
  }

  return { imported, updated };
}
