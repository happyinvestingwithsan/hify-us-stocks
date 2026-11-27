import { InrDeposit } from "./types";

export const RBI_LRS_CAP_USD = 250_000;
export const TCS_THRESHOLD_POST_2025_INR = 1_000_000;
export const TCS_THRESHOLD_PRE_2025_INR = 700_000;
export const TCS_EXCESS_RATE = 0.2;

export interface LrsFySummary {
  fyLabel: string; // e.g. "FY 2026-27"
  fyStartYear: number; // e.g. 2026 (Apr 1, 2026 – Mar 31, 2027)
  depositCount: number;
  inrRemitted: number;
  tcsThresholdInr: number;
  tcsPendingInr: number;
  tcsExcessInr: number;
  estimatedTcsInr: number;
  tcsUsedPct: number;
  usdRemitted: number;
  lrsCapUsd: number;
  lrsPendingUsd: number;
  lrsUsedPct: number;
}

export interface LrsMonthlyBucket {
  monthIndex: number; // 0 = Apr ... 11 = Mar
  shortLabel: string; // "Apr" ... "Mar"
  yearMonth: string; // "YYYY-MM"
  depositCount: number;
  inrRemitted: number;
  fxChargesInr: number;
  usdCredited: number;
  cumulativeInr: number;
  crossesThreshold: boolean;
  overThreshold: boolean;
}

const FY_MONTH_LABELS = [
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
];

/** Returns 12 Apr–Mar monthly buckets for a given Indian FY start year. */
export function computeLrsMonthlyBreakdown(
  deposits: InrDeposit[],
  fyStartYear: number
): LrsMonthlyBucket[] {
  const threshold =
    fyStartYear >= 2025 ? TCS_THRESHOLD_POST_2025_INR : TCS_THRESHOLD_PRE_2025_INR;

  const buckets: LrsMonthlyBucket[] = FY_MONTH_LABELS.map((shortLabel, idx) => {
    const calMonth = idx < 9 ? idx + 4 : idx - 8;
    const calYear = idx < 9 ? fyStartYear : fyStartYear + 1;
    const yearMonth = `${calYear}-${String(calMonth).padStart(2, "0")}`;
    return {
      monthIndex: idx,
      shortLabel,
      yearMonth,
      depositCount: 0,
      inrRemitted: 0,
      fxChargesInr: 0,
      usdCredited: 0,
      cumulativeInr: 0,
      crossesThreshold: false,
      overThreshold: false,
    };
  });

  const byYm = new Map(buckets.map((b) => [b.yearMonth, b]));
  for (const d of deposits) {
    if (getIndianFyStartYear(d.depositDate) !== fyStartYear) continue;
    const ym = d.depositDate.slice(0, 7);
    const bucket = byYm.get(ym);
    if (!bucket) continue;
    bucket.depositCount += 1;
    bucket.inrRemitted += Number.isFinite(d.inrAmount) ? d.inrAmount : 0;
    bucket.fxChargesInr += Number.isFinite(d.fxChargesInr) ? d.fxChargesInr : 0;
    bucket.usdCredited += Number.isFinite(d.usdCredited) ? d.usdCredited : 0;
  }

  let running = 0;
  for (const b of buckets) {
    const prev = running;
    running += b.inrRemitted;
    b.cumulativeInr = running;
    b.crossesThreshold = prev <= threshold && running > threshold;
    b.overThreshold = prev > threshold;
  }

  return buckets;
}

/** Returns the Indian Financial Year start year (Apr–Mar) for a YYYY-MM-DD date. */
export function getIndianFyStartYear(dateStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return month >= 4 ? year : year - 1;
}

export function formatFyLabel(fyStartYear: number): string {
  const nextTwo = String((fyStartYear + 1) % 100).padStart(2, "0");
  return `FY ${fyStartYear}-${nextTwo}`;
}

export function getCurrentIndianFyStartYear(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 4 ? year : year - 1;
}

export function getAvailableFyStartYears(
  deposits: InrDeposit[],
  now: Date = new Date()
): number[] {
  const set = new Set<number>([getCurrentIndianFyStartYear(now)]);
  for (const d of deposits) {
    const fy = getIndianFyStartYear(d.depositDate);
    if (fy !== null) set.add(fy);
  }
  return Array.from(set).sort((a, b) => b - a);
}

/**
 * Summarizes INR remittances (for TCS-free threshold) and USD remittances
 * (for the $250,000 RBI LRS cap) for a given Indian Financial Year (Apr 1 – Mar 31).
 */
export function computeLrsFySummary(
  deposits: InrDeposit[],
  fyStartYear: number
): LrsFySummary {
  let depositCount = 0;
  let inrRemitted = 0;
  let usdRemitted = 0;

  for (const d of deposits) {
    if (getIndianFyStartYear(d.depositDate) !== fyStartYear) continue;
    depositCount += 1;
    inrRemitted += Number.isFinite(d.inrAmount) ? d.inrAmount : 0;
    usdRemitted += Number.isFinite(d.usdCredited) ? d.usdCredited : 0;
  }

  const tcsThresholdInr =
    fyStartYear >= 2025 ? TCS_THRESHOLD_POST_2025_INR : TCS_THRESHOLD_PRE_2025_INR;
  const tcsPendingInr = Math.max(0, tcsThresholdInr - inrRemitted);
  const tcsExcessInr = Math.max(0, inrRemitted - tcsThresholdInr);
  const estimatedTcsInr = tcsExcessInr * TCS_EXCESS_RATE;
  const tcsUsedPct = tcsThresholdInr > 0 ? (inrRemitted / tcsThresholdInr) * 100 : 0;

  const lrsCapUsd = RBI_LRS_CAP_USD;
  const lrsPendingUsd = Math.max(0, lrsCapUsd - usdRemitted);
  const lrsUsedPct = lrsCapUsd > 0 ? (usdRemitted / lrsCapUsd) * 100 : 0;

  return {
    fyLabel: formatFyLabel(fyStartYear),
    fyStartYear,
    depositCount,
    inrRemitted,
    tcsThresholdInr,
    tcsPendingInr,
    tcsExcessInr,
    estimatedTcsInr,
    tcsUsedPct,
    usdRemitted,
    lrsCapUsd,
    lrsPendingUsd,
    lrsUsedPct,
  };
}
