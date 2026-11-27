import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLrsFySummary,
  computeLrsMonthlyBreakdown,
  formatFyLabel,
  getAvailableFyStartYears,
  getIndianFyStartYear,
} from "../lrs";
import { InrDeposit } from "../types";

function makeDeposit(
  id: number,
  depositDate: string,
  inrAmount: number,
  usdCredited: number,
  fxChargesInr = 1500
): InrDeposit {
  return {
    id,
    externalId: null,
    depositDate,
    inrAmount,
    fxRate: inrAmount / usdCredited,
    fxChargesInr,
    usdCredited,
    notes: "",
  };
}

test("getIndianFyStartYear maps Apr-Mar dates accurately", () => {
  assert.equal(getIndianFyStartYear("2026-03-31"), 2025);
  assert.equal(getIndianFyStartYear("2026-04-01"), 2026);
  assert.equal(getIndianFyStartYear("2026-11-27"), 2026);
  assert.equal(getIndianFyStartYear("2025-01-15"), 2024);
  assert.equal(formatFyLabel(2026), "FY 2026-27");
});

test("computeLrsFySummary tracks ₹10L TCS-free headroom and $250k LRS cap", () => {
  const deposits: InrDeposit[] = [
    makeDeposit(1, "2026-03-20", 400_000, 4_700), // FY 2025-26
    makeDeposit(2, "2026-05-10", 600_000, 7_000), // FY 2026-27
    makeDeposit(3, "2026-09-15", 250_000, 2_900), // FY 2026-27
  ];

  const fy26 = computeLrsFySummary(deposits, 2026);
  assert.equal(fy26.fyLabel, "FY 2026-27");
  assert.equal(fy26.depositCount, 2);
  assert.equal(fy26.inrRemitted, 850_000);
  assert.equal(fy26.tcsThresholdInr, 1_000_000);
  assert.equal(fy26.tcsPendingInr, 150_000);
  assert.equal(fy26.tcsExcessInr, 0);
  assert.equal(fy26.estimatedTcsInr, 0);
  assert.equal(fy26.usdRemitted, 9_900);
  assert.equal(fy26.lrsPendingUsd, 240_100);
});

test("computeLrsFySummary computes 20% TCS only on excess above ₹10L and uses ₹7L pre-2025", () => {
  const deposits: InrDeposit[] = [
    makeDeposit(1, "2025-02-10", 800_000, 9_300), // FY 2024-25 (7L limit)
    makeDeposit(2, "2026-06-01", 1_250_000, 14_500), // FY 2026-27 (10L limit)
  ];

  const fy24 = computeLrsFySummary(deposits, 2024);
  assert.equal(fy24.tcsThresholdInr, 700_000);
  assert.equal(fy24.tcsExcessInr, 100_000);
  assert.equal(fy24.estimatedTcsInr, 20_000);

  const fy26 = computeLrsFySummary(deposits, 2026);
  assert.equal(fy26.tcsThresholdInr, 1_000_000);
  assert.equal(fy26.tcsPendingInr, 0);
  assert.equal(fy26.tcsExcessInr, 250_000);
  assert.equal(fy26.estimatedTcsInr, 50_000);
});

test("getAvailableFyStartYears includes current FY and sorts descending", () => {
  const deposits: InrDeposit[] = [
    makeDeposit(1, "2025-05-01", 100_000, 1_150),
  ];
  const years = getAvailableFyStartYears(deposits, new Date("2026-11-27T12:00:00+05:30"));
  assert.deepEqual(years, [2026, 2025]);
});

test("computeLrsMonthlyBreakdown builds Apr-Mar cumulative buckets and flags threshold crossing", () => {
  const deposits: InrDeposit[] = [
    makeDeposit(1, "2026-04-15", 600_000, 7_000),
    makeDeposit(2, "2026-11-10", 500_000, 5_800),
  ];
  const months = computeLrsMonthlyBreakdown(deposits, 2026);
  assert.equal(months.length, 12);
  assert.equal(months[0].shortLabel, "Apr");
  assert.equal(months[0].cumulativeInr, 600_000);
  assert.equal(months[0].crossesThreshold, false);
  assert.equal(months[7].shortLabel, "Nov");
  assert.equal(months[7].cumulativeInr, 1_100_000);
  assert.equal(months[7].crossesThreshold, true);
  assert.equal(months[11].shortLabel, "Mar");
  assert.equal(months[11].overThreshold, true);
});
