import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";
import { importTradesWorkbookBuffer, parseFlexibleDate, parseStockLabel } from "../excel-importer";
import { parseIndmoneyRawCaptures, processIndmoneySync } from "../indmoney-sync";
import {
  calculateAccountProfit,
  classifyMarketCap,
  computeClosedTradeMetrics,
  computeOpenLotMetrics,
  consolidateOpenLots,
  formatIndianFyMonth,
} from "../profit-engine";
import { SqliteJournalRepository } from "../sqlite-repository";
import type { OpenLot } from "../types";

test("classifyMarketCap follows FINRA thresholds", () => {
  assert.equal(classifyMarketCap(250_000_000_000), "MEGA");
  assert.equal(classifyMarketCap(50_000_000_000), "LARGE");
  assert.equal(classifyMarketCap(5_000_000_000), "MID");
  assert.equal(classifyMarketCap(900_000_000), "SMALL");
});

test("parseFlexibleDate and parseStockLabel parse trades.xlsx formats", () => {
  assert.equal(parseFlexibleDate("12th Feb'26"), "2026-02-12");
  assert.equal(parseFlexibleDate("2nd Mar'26"), "2026-03-02");
  assert.deepEqual(parseStockLabel("Accenture PLC (ACN)"), {
    companyName: "Accenture PLC",
    ticker: "ACN",
  });
});

test("processIndmoneySync handles idempotent buys, partial FIFO sells, and exact profit", () => {
  const tmpDb = path.join(os.tmpdir(), `us_journal_test_${Date.now()}.db`);
  const repo = new SqliteJournalRepository(tmpDb);

  try {
    repo.updateSettings({ targetCapitalUsd: 5000, liveUsdInrRate: 86 });
    repo.addDeposit({
      depositDate: "2026-02-01",
      inrAmount: 85000,
      fxRate: 85,
      fxChargesInr: 500,
      usdCredited: 1000,
    });

    // Two separate buys of ACN + 1 sell of 0.30 shares
    const sync1 = processIndmoneySync(
      {
        executions: [
          {
            externalId: "ind:buy:1",
            side: "BUY",
            ticker: "ACN",
            companyName: "Accenture PLC",
            tradeDate: "2026-02-12",
            shares: 0.25,
            priceUsd: 200,
            valueUsd: 50,
            feesUsd: 0.5,
          },
          {
            externalId: "ind:buy:2",
            side: "BUY",
            ticker: "ACN",
            companyName: "Accenture PLC",
            tradeDate: "2026-03-02",
            shares: 0.25,
            priceUsd: 220,
            valueUsd: 55,
            feesUsd: 0.5,
          },
          {
            externalId: "ind:sell:1",
            side: "SELL",
            ticker: "ACN",
            tradeDate: "2026-04-01",
            shares: 0.3,
            priceUsd: 250,
            feesUsd: 0.6,
          },
        ],
        cashflows: [
          {
            externalId: "ind:div:1",
            eventDate: "2026-03-15",
            type: "DIVIDEND",
            ticker: "ACN",
            amountUsd: 1.25,
          },
        ],
        currentPrices: { ACN: 260 },
      },
      repo
    );

    assert.equal(sync1.buysCreated, 2);
    assert.equal(sync1.sellsMatched, 1);
    assert.equal(sync1.cashflowsCreated, 1);

    // Re-running identical sync must be idempotent
    const sync2 = processIndmoneySync(
      {
        executions: [
          {
            externalId: "ind:buy:1",
            side: "BUY",
            ticker: "ACN",
            tradeDate: "2026-02-12",
            shares: 0.25,
            priceUsd: 200,
          },
        ],
      },
      repo
    );
    assert.equal(sync2.buysCreated, 0);
    assert.equal(sync2.buysSkipped, 1);

    const openLots = repo.listOpenLots();
    assert.equal(openLots.length, 1);
    assert.equal(openLots[0].remainingShares, 0.2);

    const closed = repo.listClosedTrades();
    assert.equal(closed.length, 2); // Split across lot 1 (0.25) and lot 2 (0.05)

    const summary = calculateAccountProfit({
      settings: repo.getSettings(),
      deposits: repo.listDeposits(),
      openLots,
      closedTrades: closed,
      cashflows: repo.listCashflows(),
    });

    // Lot 1 closed: 0.25 * (250 - 200) = +12.50
    // Lot 2 closed: 0.05 * (250 - 220) = +1.50
    // Gross = 14.00; Fees on closed = 0.50 + 0.10 + 0.60 = 1.20 -> Realized Net = 12.80
    assert.equal(summary.realizedGrossPnlUsd, 14);
    assert.equal(summary.realizedNetPnlUsd, 12.8);
    assert.equal(summary.totalDividendsUsd, 1.25);
    assert.equal(summary.winRatePct, 100);
  } finally {
    repo.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  }
});

test("parseIndmoneyRawCaptures filters Canceled orders and extracts dividends", () => {
  const parsed = parseIndmoneyRawCaptures({
    orders: [
      {
        apiUrl: "https://apixt-us.indmoney.com/us-stock-broker/us/portfolio/orders/summary?page=1",
        payload: {
          data: {
            orders: [
              {
                order_id: "ord_1",
                ind_key: "AVGO",
                name: "Broadcom",
                transaction_type: "BUY",
                qty: 0.5240036,
                avg_price: 285.4,
                order_value: "$149.55",
                date_epoch: 1794268800,
                status: "Success",
                order_type: "Trigger",
              },
              {
                order_id: "ord_2",
                ind_key: "AVGO",
                name: "Broadcom",
                transaction_type: "BUY",
                qty: 1,
                avg_price: 280,
                order_value: "$280.00",
                date_epoch: 1794268800,
                status: "Canceled",
                order_type: "Limit",
              },
            ],
          },
        },
      },
    ],
    wallet: [
      {
        apiUrl: "https://apixt-us.indmoney.com/us-stocks-ext/api/version/fund-transfer/transactionsForWeb/?page=1",
        payload: {
          monthly_trxn: [
            {
              month: "2026 November",
              trxn_list: [
                {
                  card_title: "ACN Dividend",
                  amount: "$3.42",
                  created_date: "2026-11-13T00:00:00Z",
                  status: "Success",
                },
              ],
            },
          ],
        },
      },
    ],
  });

  assert.equal(parsed.executions?.length, 1);
  assert.equal(parsed.executions?.[0].ticker, "AVGO");
  assert.equal(parsed.executions?.[0].executionType, "GTT");
  assert.equal(parsed.cashflows?.length, 1);
  assert.equal(parsed.cashflows?.[0].type, "DIVIDEND");
  assert.equal(parsed.cashflows?.[0].amountUsd, 3.42);
});

test("parseIndmoneyRawCaptures parses nested scrip_details, Deposit Credited, and multi-page captures", () => {
  const parsed = parseIndmoneyRawCaptures({
    orders: [
      {
        apiUrl: "https://apixt-us.indmoney.com/us-stock-broker/us/portfolio/orders/summary?page=1",
        payload: {
          data: {
            orders: [
              {
                order_id: "ord_p1",
                ind_key: "NFLX",
                name: "Netflix",
                transaction_type: "BUY",
                qty: 9.948684,
                avg_price: 70.15,
                order_value: "$697.91",
                date_epoch: 1793404800,
                status: "Success",
              },
            ],
          },
        },
      },
      {
        apiUrl: "https://apixt-us.indmoney.com/us-stock-broker/us/portfolio/orders/summary?page=2",
        payload: {
          data: {
            orders: [
              {
                order_id: "ord_p1", // duplicate across pages should be deduped
                ind_key: "NFLX",
                name: "Netflix",
                transaction_type: "BUY",
                qty: 9.948684,
                avg_price: 70.15,
                order_value: "$697.91",
                date_epoch: 1793404800,
                status: "Success",
              },
              {
                order_id: "ord_p2",
                ind_key: "ADBE",
                name: "Adobe",
                transaction_type: "BUY",
                qty: 1.77716889,
                avg_price: 225.077,
                order_value: "$400.00",
                date_epoch: 1780000000,
                status: "Success",
              },
            ],
          },
        },
      },
    ],
    holdings: [
      {
        apiUrl: "https://apixt-us.indmoney.com/us-stock-broker/us/portfolio/equity/summary?response_format=json",
        payload: {
          user_wallet_balance: { available_balance: 152.53 },
          demat_summary: {
            asset_summary: {
              holdings_summary: {
                holding_count: 2,
                invested_value: 1201.51,
                current_value: 1075.65,
                pnl: -125.86,
              },
              scrip_details: [
                {
                  metadata: { ind_key: "ADBE", symbol: "ADBE", name: "Adobe", live_price: 233.87 },
                  holdings: { quantity: 1.77716889, avg_price: 225.08, invested_amount: 400.0, current_value: 415.63 },
                },
                {
                  metadata: { ind_key: "NFLX", symbol: "NFLX", name: "Netflix", live_price: 59.25 },
                  holdings: { quantity: 11.13957054, avg_price: 71.95, invested_amount: 801.51, current_value: 660.02 },
                },
              ],
            },
          },
        },
      },
    ],
    wallet: [
      {
        apiUrl: "https://apixt-us.indmoney.com/us-stocks-ext/api/version/fund-transfer/transactionsForWeb/?page=1&limit=20",
        payload: {
          monthly_trxn: [
            {
              trxn_list: [
                {
                  id: 3153121,
                  card_title: "Deposit Credited",
                  amount: "$2094.93",
                  created_date: "2026-11-06T12:19:17Z",
                  status: "Success",
                },
                {
                  card_title: "Netflix.. buy settlement ",
                  amount: "-$199.4",
                  created_date: "2026-10-30T16:46:22Z",
                  status: "SUCCESS",
                },
              ],
            },
          ],
        },
      },
    ],
  });

  assert.equal(parsed.executions?.length, 2);
  assert.equal(parsed.deposits?.length, 1);
  assert.equal(parsed.deposits?.[0].usdCredited, 2094.93);
  assert.equal(parsed.deposits?.[0].externalId, "ind:dep:3153121");
  assert.equal(parsed.cashflows?.length, 0); // buy settlement ignored
  assert.equal(parsed.currentPrices?.ADBE, 233.87);
  assert.equal(parsed.currentPrices?.NFLX, 59.25);
  assert.equal(parsed.brokerSummary?.brokerCashUsd, 152.53);
  assert.equal(parsed.brokerSummary?.brokerHoldingsCount, 2);
});

test("processIndmoneySync reconciles SNDK 8:1 split, ADBE/NFLX recon lots, deposits, and broker cash", () => {
  const tmpDb = path.join(os.tmpdir(), `us_journal_recon_${Date.now()}.db`);
  const repo = new SqliteJournalRepository(tmpDb);

  try {
    // Sync 1: SNDK pre-split lot + NFLX partial lot + holdings with ADBE missing & NFLX extra
    const raw1 = {
      orders: [
        {
          apiUrl: "https://apixt-us.indmoney.com/us-stock-broker/us/portfolio/orders/summary?page=1",
          payload: {
            data: {
              orders: [
                {
                  order_id: "sndk_1",
                  ind_key: "SNDK",
                  name: "Sandisk",
                  transaction_type: "BUY",
                  qty: 0.30508,
                  avg_price: 817,
                  order_value: "$249.25",
                  date_epoch: 1794300000,
                  status: "Success",
                },
                {
                  order_id: "sndk_2",
                  ind_key: "SNDK",
                  name: "Sandisk",
                  transaction_type: "BUY",
                  qty: 1.14112395,
                  avg_price: 87.37,
                  order_value: "$99.70",
                  date_epoch: 1795100000,
                  status: "Success",
                },
                {
                  order_id: "nflx_1",
                  ind_key: "NFLX",
                  name: "Netflix",
                  transaction_type: "BUY",
                  qty: 9.948684,
                  avg_price: 70.15,
                  order_value: "$697.91",
                  date_epoch: 1793404800,
                  status: "Success",
                },
              ],
            },
          },
        },
      ],
      holdings: [
        {
          apiUrl: "https://apixt-us.indmoney.com/us-stock-broker/us/portfolio/equity/summary?response_format=json",
          payload: {
            user_wallet_balance: { available_balance: 152.53 },
            demat_summary: {
              asset_summary: {
                holdings_summary: {
                  holding_count: 3,
                  invested_value: 1550.46,
                  current_value: 1350.3,
                  pnl: -200.16,
                },
                scrip_details: [
                  {
                    metadata: { ind_key: "SNDK", name: "Sandisk", live_price: 76.68 },
                    holdings: { quantity: 3.58176395, invested_amount: 348.95, current_value: 274.65 },
                  },
                  {
                    metadata: { ind_key: "ADBE", name: "Adobe", live_price: 233.87 },
                    holdings: { quantity: 1.77716889, invested_amount: 400.0, current_value: 415.63 },
                  },
                  {
                    metadata: { ind_key: "NFLX", name: "Netflix", live_price: 59.25 },
                    holdings: { quantity: 11.13957054, invested_amount: 801.51, current_value: 660.02 },
                  },
                ],
              },
            },
          },
        },
      ],
      wallet: [
        {
          apiUrl: "https://apixt-us.indmoney.com/us-stocks-ext/api/version/fund-transfer/transactionsForWeb/?page=1&limit=20",
          payload: {
            monthly_trxn: [
              {
                trxn_list: [
                  {
                    id: 3153121,
                    card_title: "Deposit Credited",
                    amount: "$2094.93",
                    created_date: "2026-11-06T12:19:17Z",
                    status: "Success",
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    const res1 = processIndmoneySync({ rawCaptures: raw1 }, repo);
    assert.equal(res1.buysCreated, 3);
    assert.equal(res1.depositsCreated, 1);
    assert.equal(res1.splitsAdjusted, 1);
    assert.equal(res1.reconLotsUpserted, 2);

    // Re-sync rebuilds orders cleanly while keeping deposits idempotent and re-applying split cleanly
    const res2 = processIndmoneySync({ rawCaptures: raw1 }, repo);
    assert.equal(res2.buysCreated, 3);
    assert.equal(res2.depositsCreated, 0);
    assert.equal(res2.splitsAdjusted, 1);

    const lots = repo.listOpenLots();
    const sndkLots = lots.filter((l) => l.ticker === "SNDK");
    const sndkShares = sndkLots.reduce((s, l) => s + l.remainingShares, 0);
    assert.ok(Math.abs(sndkShares - 3.58176395) < 0.0001);
    const sndkPre = sndkLots.find((l) => l.externalId === "ind:order:sndk_1");
    const sndkPost = sndkLots.find((l) => l.externalId === "ind:order:sndk_2");
    assert.ok(sndkPre && Math.abs(sndkPre.remainingShares - 2.44064) < 0.001);
    assert.ok(sndkPre && Math.abs(sndkPre.buyPriceUsd - 102.125) < 0.05);
    assert.ok(sndkPost && Math.abs(sndkPost.remainingShares - 1.14112395) < 0.0001);
    assert.ok(sndkPost && Math.abs(sndkPost.buyPriceUsd - 87.37) < 0.05);

    const adbeShares = lots
      .filter((l) => l.ticker === "ADBE")
      .reduce((s, l) => s + l.remainingShares, 0);
    assert.ok(Math.abs(adbeShares - 1.77716889) < 0.0001);

    const summary = calculateAccountProfit({
      settings: repo.getSettings(),
      deposits: repo.listDeposits(),
      openLots: lots,
      closedTrades: repo.listClosedTrades(),
      cashflows: repo.listCashflows(),
    });
    assert.equal(summary.brokerCashUsd, 152.53);
    assert.equal(summary.totalUsdDeposited, 2094.93);
    assert.ok(Math.abs(summary.openCostBasisUsd - 1550.46) < 0.05);

    // Sync 2: Page 2 ADBE order arrives -> recon lot for ADBE must be automatically deleted
    processIndmoneySync(
      {
        executions: [
          {
            externalId: "ind:order:adbe_p2",
            side: "BUY",
            ticker: "ADBE",
            companyName: "Adobe",
            tradeDate: "2026-05-01",
            shares: 1.77716889,
            priceUsd: 225.077,
            valueUsd: 400.0,
          },
        ],
        brokerHoldings: [
          {
            ticker: "ADBE",
            companyName: "Adobe",
            quantity: 1.77716889,
            avgPriceUsd: 225.08,
            investedAmountUsd: 400.0,
            currentValueUsd: 415.63,
            livePriceUsd: 233.87,
          },
        ],
      },
      repo
    );

    const adbeLotsAfter = repo.listOpenLots().filter((l) => l.ticker === "ADBE");
    assert.equal(adbeLotsAfter.length, 1);
    assert.equal(adbeLotsAfter[0].externalId, "ind:order:adbe_p2");
  } finally {
    repo.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  }
});

test("processIndmoneySync uses 1-to-1 exact qty, full-position close, chronological fallback, and preserves user edits", () => {
  const tmpDb = path.join(os.tmpdir(), `us_journal_phase3_${Date.now()}.db`);
  const repo = new SqliteJournalRepository(tmpDb);

  try {
    const executions = [
      // NFLX: Lot 1 (older, 1.0 sh) and Lot 2 (newer, exact match 0.66132652 sh)
      {
        externalId: "ind:order:nflx_old",
        side: "BUY" as const,
        ticker: "NFLX",
        tradeDate: "2026-06-01",
        shares: 1.0,
        priceUsd: 60,
        valueUsd: 60,
      },
      {
        externalId: "ind:order:nflx_exact",
        side: "BUY" as const,
        ticker: "NFLX",
        tradeDate: "2026-07-01",
        shares: 0.66132652,
        priceUsd: 70,
        valueUsd: 46.29,
      },
      {
        externalId: "ind:order:nflx_sell",
        side: "SELL" as const,
        ticker: "NFLX",
        tradeDate: "2026-08-01",
        shares: 0.66132652,
        priceUsd: 85,
      },
      // MSFT: Full-position close across 2 lots
      {
        externalId: "ind:order:msft_1",
        side: "BUY" as const,
        ticker: "MSFT",
        tradeDate: "2026-06-10",
        shares: 0.2,
        priceUsd: 400,
        valueUsd: 80,
      },
      {
        externalId: "ind:order:msft_2",
        side: "BUY" as const,
        ticker: "MSFT",
        tradeDate: "2026-06-20",
        shares: 0.3,
        priceUsd: 410,
        valueUsd: 123,
      },
      {
        externalId: "ind:order:msft_sell_all",
        side: "SELL" as const,
        ticker: "MSFT",
        tradeDate: "2026-08-06",
        shares: 0.5,
        priceUsd: 490,
      },
      // META: Partial dollar sell (chronological fallback, targetPriceUsd stays null)
      {
        externalId: "ind:order:meta_1",
        side: "BUY" as const,
        ticker: "META",
        tradeDate: "2026-07-30",
        shares: 1.0,
        priceUsd: 530,
        valueUsd: 530,
      },
      {
        externalId: "ind:order:meta_partial",
        side: "SELL" as const,
        ticker: "META",
        tradeDate: "2026-09-16",
        shares: 0.4,
        priceUsd: 680,
      },
    ];

    processIndmoneySync({ executions, reconcileOrders: true }, repo);

    const openLots = repo.listOpenLots();
    // NFLX exact match should have closed nflx_exact, leaving nflx_old (1.0 sh) open!
    const nflxOpen = openLots.filter((l) => l.ticker === "NFLX");
    assert.equal(nflxOpen.length, 1);
    assert.equal(nflxOpen[0].externalId, "ind:order:nflx_old");
    assert.equal(nflxOpen[0].strategy, ""); // Empty default!

    // MSFT should have 0 open lots
    assert.equal(openLots.filter((l) => l.ticker === "MSFT").length, 0);

    // META should have 0.6 remaining
    const metaOpen = openLots.filter((l) => l.ticker === "META");
    assert.equal(metaOpen.length, 1);
    assert.ok(Math.abs(metaOpen[0].remainingShares - 0.6) < 1e-6);

    const closed = repo.listClosedTrades();
    const nflxClosed = closed.find((c) => c.ticker === "NFLX")!;
    assert.equal(nflxClosed.targetPriceUsd, 85); // 1:1 exact match sets targetPriceUsd = sellPriceUsd
    assert.equal(nflxClosed.strategy, "");

    const msftClosed = closed.filter((c) => c.ticker === "MSFT");
    assert.equal(msftClosed.length, 2);
    assert.ok(msftClosed.every((c) => c.targetPriceUsd === 490)); // Full-position close sets targetPriceUsd

    const metaClosed = closed.find((c) => c.ticker === "META")!;
    assert.equal(metaClosed.targetPriceUsd, null); // Partial sell leaves targetPriceUsd null

    // User edits strategy & targetPriceUsd on open NFLX lot and closed META trade
    repo.updateOpenLot(nflxOpen[0].id, { strategy: "Breakout", targetPriceUsd: 110 });
    repo.updateClosedTrade(metaClosed.id, { strategy: "Momentum", targetPriceUsd: 700 });

    // Re-sync with reconcileOrders: true must preserve user edits!
    processIndmoneySync({ executions, reconcileOrders: true }, repo);

    const nflxOpenAfter = repo.listOpenLots().find((l) => l.externalId === "ind:order:nflx_old")!;
    assert.equal(nflxOpenAfter.strategy, "Breakout");
    assert.equal(nflxOpenAfter.targetPriceUsd, 110);

    const metaClosedAfter = repo.listClosedTrades().find((c) => c.ticker === "META")!;
    assert.equal(metaClosedAfter.strategy, "Momentum");
    assert.equal(metaClosedAfter.targetPriceUsd, 700);
  } finally {
    repo.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  }
});

test("formatIndianFyMonth and computeClosedTradeMetrics compute 22-column parity fields", () => {
  assert.equal(formatIndianFyMonth("2026-11-19"), "FY2627-N11");
  assert.equal(formatIndianFyMonth("2026-04-01"), "FY2627-A04");
  assert.equal(formatIndianFyMonth("2026-03-15"), "FY2526-M03");

  const metrics = computeClosedTradeMetrics({
    id: 1,
    externalId: "ind:order:93043687",
    openLotId: 29,
    ticker: "WMT",
    companyName: "Walmart",
    buyDate: "2026-08-20",
    sellDate: "2026-11-19",
    shares: 2.90120762,
    buyPriceUsd: 103.1,
    buyValueUsd: 299.1,
    sellPriceUsd: 129.59,
    sellValueUsd: 375.97,
    buyFeesUsd: 0,
    sellFeesUsd: 0,
    grossPnlUsd: 76.87,
    netPnlUsd: 76.87,
    pnlPct: 25.7,
    daysHeld: 91,
    strategy: "S&R",
    targetPriceUsd: 129.59,
    executionType: "GTT",
    executionMode: "GTT",
    listName: "Others",
    cmpUsd: 120.0,
    notes: "INDmoney Trigger",
    source: "INDMONEY",
  });

  assert.equal(metrics.status, "Fully Booked");
  assert.equal(metrics.account, "INDmoney");
  assert.equal(metrics.days, 91);
  assert.equal(metrics.monthLabel, "FY2627-N11");
  assert.equal(metrics.pctGain, 25.7);
  assert.ok(Math.abs(metrics.annualGainPct - 103.08) < 0.05);
  assert.ok(Math.abs((metrics.gainAfterBookingPct ?? 0) - 7.4) < 0.05);
});

test("parseIndmoneyRawCaptures and processIndmoneySync store wallet_transactions idempotently with categories", () => {
  const tmpDb = path.join(os.tmpdir(), `us_journal_wtx_${Date.now()}.db`);
  const repo = new SqliteJournalRepository(tmpDb);

  try {
    const rawCaptures = {
      wallet: [
        {
          apiUrl: "https://apixt-us.indmoney.com/us-stocks-ext/api/version/fund-transfer/transactionsForWeb/?page=1&limit=20",
          payload: {
            monthly_trxn: [
              {
                trxn_list: [
                  { id: 101, card_title: "Deposit Credited", amount: "$2094.93", created_date: "2026-11-06T12:19:17Z", status: "Success" },
                  { card_title: "Walmart .. sell settlement ", amount: "$375.97", created_date: "2026-11-19T18:56:46Z", status: "SUCCESS" },
                  { card_title: "Netflix.. buy settlement ", amount: "-$199.4", created_date: "2026-10-30T16:46:22Z", status: "SUCCESS" },
                  { card_title: "ACN Dividend", amount: "$3.42", created_date: "2026-11-13T00:00:00Z", status: "Success" },
                  { card_title: "SEC Fee Charge", amount: "-$0.12", created_date: "2026-11-14T00:00:00Z", status: "SUCCESS" },
                  { card_title: "Withholding Tax", amount: "-$0.85", created_date: "2026-11-13T01:00:00Z", status: "SUCCESS" },
                  { card_title: "Withdrawal to Bank", amount: "-$500.00", created_date: "2026-11-15T00:00:00Z", status: "SUCCESS" },
                  { card_title: "Sandisk .. buy settlement ", amount: "-$0.0", created_date: "2026-11-18T06:00:00Z", status: "SUCCESS" },
                ],
              },
            ],
          },
        },
      ],
    };

    const res1 = processIndmoneySync({ rawCaptures }, repo);
    assert.equal(res1.walletTransactionsUpserted, 8);

    // Re-sync must be idempotent
    const res2 = processIndmoneySync({ rawCaptures }, repo);
    assert.equal(res2.walletTransactionsUpserted, 0);

    const wtx = repo.listWalletTransactions();
    assert.equal(wtx.length, 8);
    const byTitle = new Map(wtx.map((w) => [w.title, w]));
    assert.equal(byTitle.get("Deposit Credited")?.category, "DEPOSIT");
    assert.equal(byTitle.get("Deposit Credited")?.amountUsd, 2094.93);
    assert.equal(byTitle.get("Walmart .. sell settlement")?.category, "SELL_SETTLEMENT");
    assert.equal(byTitle.get("Netflix.. buy settlement")?.category, "BUY_SETTLEMENT");
    assert.equal(byTitle.get("Netflix.. buy settlement")?.amountUsd, -199.4);
    assert.equal(byTitle.get("ACN Dividend")?.category, "DIVIDEND");
    assert.equal(byTitle.get("SEC Fee Charge")?.category, "FEE");
    assert.equal(byTitle.get("Withholding Tax")?.category, "TAX");
    assert.equal(byTitle.get("Withdrawal to Bank")?.category, "WITHDRAWAL");
    assert.equal(byTitle.get("Sandisk .. buy settlement")?.category, "CANCELED");
  } finally {
    repo.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  }
});

function buildSheetBuffer(sheetName: string, aoa: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("INDmoney official reports (LRS, Trades, Wallet Statement) enrich deposits/fees/taxes and survive UI re-sync", () => {
  const tmpDb = path.join(os.tmpdir(), `us_journal_reports_${Date.now()}.db`);
  const repo = new SqliteJournalRepository(tmpDb);

  try {
    const executions = [
      {
        externalId: "ind:order:avgo_1",
        side: "BUY" as const,
        ticker: "AVGO",
        tradeDate: "2026-11-10",
        shares: 0.5240036,
        priceUsd: 285.4,
        valueUsd: 149.55,
      },
      {
        externalId: "ind:order:wmt_buy",
        side: "BUY" as const,
        ticker: "WMT",
        tradeDate: "2026-08-20",
        shares: 2.90120762,
        priceUsd: 103.1,
        valueUsd: 299.1,
      },
      {
        externalId: "ind:order:wmt_sell",
        side: "SELL" as const,
        ticker: "WMT",
        tradeDate: "2026-11-19",
        shares: 2.90120762,
        priceUsd: 129.59,
      },
    ];

    // Step 1: Initial UI sync with placeholder deposit ($2094.93, inrAmount=0)
    processIndmoneySync(
      {
        executions,
        reconcileOrders: true,
        deposits: [
          {
            externalId: "ind:dep:3153121",
            depositDate: "2026-11-06",
            inrAmount: 0,
            fxRate: 0,
            usdCredited: 2094.93,
          },
        ],
      },
      repo
    );

    // Step 2a: LRS Report updates placeholder in-place + creates historical deposit
    const lrsBuf = buildSheetBuffer("LRS Report", [
      ["Name", "Test User"],
      ["Transaction Date", "Bank Used", "Money Movement", "INR Amount", "GST Charged", "TCS Charged(Indicative)", "Bank Fixed Fee", "Exchange Rate", "USD Amount"],
      ["2026-11-06", "AXIS NATIVE", "Deposit", 199730.63, 269.76, "-", "-", 95.34, 2094.93],
      ["2026-04-13", "AXIS NATIVE", "Deposit", 199730.24, 269.76, "-", "-", 94.94, 2103.75],
    ]);
    const lrsRes = importTradesWorkbookBuffer(lrsBuf, repo);
    assert.equal(lrsRes.lrsDepositsUpdated, 1);
    assert.equal(lrsRes.lrsDepositsCreated, 1);
    assert.equal(repo.listDeposits().length, 2); // No duplicate for 2026-11-06!

    // Step 2b: Trades Report stamps commissions on open_lots & closed_trades
    const tradesBuf = buildSheetBuffer("Trades Report", [
      ["Total Trades", 3],
      ["Trade Date", "Ticker", "Side", "Quantity", "($) Price", "($) Amount", "($) Commission", "Status"],
      ["2026-11-12", "AVGO", "Buy", 0.5240036, 285.4, 149.55, 0.45, "FILLED"],
      ["2026-08-20", "WMT", "Buy", 2.90120762, 103.1, 299.1, 0.9, "FILLED"],
      ["2026-11-20", "WMT", "Sell", 2.90120762, 129.59, 375.97, 1.14, "FILLED"],
    ]);
    const tradesRes = importTradesWorkbookBuffer(tradesBuf, repo);
    assert.ok(tradesRes.tradeFeesUpdated >= 3);

    const avgoLot = repo.listOpenLots().find((l) => l.ticker === "AVGO")!;
    assert.equal(avgoLot.feesUsd, 0.45);
    const wmtClosed = repo.listClosedTrades().find((c) => c.ticker === "WMT")!;
    assert.equal(wmtClosed.buyFeesUsd, 0.9);
    assert.equal(wmtClosed.sellFeesUsd, 1.14);

    // Step 2c: Wallet Statement adds DIVIDEND & WITHHOLDING_TAX, skips COMMISSION
    const walletBuf = buildSheetBuffer("Wallet Statement", [
      ["Date", "Type", "Description", "Money Movement", "($) Amount", "Ticker", "($) Commission"],
      ["2026-11-26", "COMMISSION", "Commission for trades", "Money Out", 0.45, "", 0.45],
      ["2026-11-13", "DIVIDEND", "Dividend for ACN", "Money In", 3.42, "ACN", 0],
      ["2026-11-13", "DIVIDEND TAX", "Withholding tax for ACN", "Money Out", 0.85, "ACN", 0],
    ]);
    const walletRes = importTradesWorkbookBuffer(walletBuf, repo);
    assert.equal(walletRes.walletCashflowsCreated, 2);
    assert.equal(repo.listCashflows().filter((c) => c.type === "WITHHOLDING_TAX").length, 1);

    // Step 3: Subsequent UI re-sync must preserve LRS deposits & trade commissions!
    processIndmoneySync(
      {
        executions,
        reconcileOrders: true,
        deposits: [
          {
            externalId: "ind:dep:3153121",
            depositDate: "2026-11-06",
            inrAmount: 0,
            fxRate: 0,
            usdCredited: 2094.93,
          },
        ],
      },
      repo
    );

    assert.equal(repo.listDeposits().length, 2);
    assert.equal(repo.listOpenLots().find((l) => l.ticker === "AVGO")?.feesUsd, 0.45);
    const wmtAfter = repo.listClosedTrades().find((c) => c.ticker === "WMT")!;
    assert.equal(wmtAfter.buyFeesUsd, 0.9);
    assert.equal(wmtAfter.sellFeesUsd, 1.14);
  } finally {
    repo.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  }
});

function makeTestLot(overrides: Partial<OpenLot> = {}): OpenLot {
  return {
    id: 1,
    externalId: null,
    ticker: "AVGO",
    companyName: "Broadcom Inc",
    buyDate: "2026-10-28",
    shares: 1.0,
    remainingShares: 1.0,
    buyPriceUsd: 200,
    buyValueUsd: 200,
    feesUsd: 0,
    strategy: "Momentum",
    targetPriceUsd: 300,
    sellGttPriceUsd: null,
    sellGttStatus: "NONE",
    marketCapTier: "MEGA",
    currentPriceUsd: 220,
    executionMode: "GTT",
    listName: "Core",
    prevCloseUsd: null,
    todayChangePct: null,
    athPriceUsd: 250,
    quoteSource: "MANUAL",
    quoteUpdatedAt: null,
    lrd: null,
    notes: "",
    source: "MANUAL",
    ...overrides,
  };
}

test("computeOpenLotMetrics never silently falls back to buyPriceUsd when CMP is null or <= 0", () => {
  const nullCmpLot = makeTestLot({ currentPriceUsd: null, athPriceUsd: 250 });
  const zeroCmpLot = makeTestLot({ id: 2, ticker: "NFLX", currentPriceUsd: 0, athPriceUsd: 250 });
  const targetCapitalUsd = 10000;
  const consolidated = consolidateOpenLots([nullCmpLot, zeroCmpLot], targetCapitalUsd);
  const consolidatedMap = new Map(consolidated.map((c) => [c.ticker, c]));

  for (const lot of [nullCmpLot, zeroCmpLot]) {
    const m = computeOpenLotMetrics(lot, consolidatedMap, targetCapitalUsd, "2026-11-27");
    assert.equal(m.currentValueUsd, null);
    assert.equal(m.gainAmountUsd, null);
    assert.equal(m.currentGainPct, null);
    assert.equal(m.remainingGainPct, null);
    assert.equal(m.annualReturnPct, null);
    assert.equal(m.dAthPct, null);
    assert.equal(m.isSellGttReady30Pct, false);

    // Non-CMP metrics still compute cleanly
    assert.equal(m.buyValueRemainingUsd, 200);
    assert.equal(m.allocationPct, 2);
    assert.equal(m.totalTickerAllocationPct, 2);
    assert.equal(m.allocLeftPct, 3); // MEGA max 5.0 - 2.0
    assert.equal(m.potentialGainPct, 50); // (300 - 200) / 200
    assert.equal(m.totalPotentialGainUsd, 100);
    assert.equal(m.daysHeld, 30);
    assert.equal(m.monthLabel, "FY2627-O10");
  }

  const summary = calculateAccountProfit({
    settings: {
      targetCapitalUsd,
      liveUsdInrRate: 85,
      lastSyncedAt: null,
      syncSource: null,
      brokerCashUsd: 0,
      brokerInvestedUsd: 0,
      brokerCurrentValueUsd: 0,
      brokerPnlUsd: 0,
      brokerHoldingsCount: 0,
    },
    deposits: [],
    openLots: [nullCmpLot, zeroCmpLot, makeTestLot({ id: 3, ticker: "ACN", currentPriceUsd: 210 })],
    closedTrades: [],
    cashflows: [],
  });
  assert.equal(summary.openLotsCount, 3);
  assert.equal(summary.missingCmpLotsCount, 2);
});

test("computeOpenLotMetrics evaluates isSellGttReady30Pct for >= 0.70 * target and GTT statuses", () => {
  const targetCapitalUsd = 5000;
  // Target 300 -> 70% threshold is 210
  const readyNone = makeTestLot({ id: 1, currentPriceUsd: 210, targetPriceUsd: 300, sellGttStatus: "NONE" });
  const readyPlanned = makeTestLot({ id: 2, currentPriceUsd: 225, targetPriceUsd: 300, sellGttStatus: "PLANNED" });
  const placed = makeTestLot({ id: 3, currentPriceUsd: 240, targetPriceUsd: 300, sellGttStatus: "PLACED" });
  const triggered = makeTestLot({ id: 4, currentPriceUsd: 240, targetPriceUsd: 300, sellGttStatus: "TRIGGERED" });
  const belowThreshold = makeTestLot({ id: 5, currentPriceUsd: 209.99, targetPriceUsd: 300, sellGttStatus: "NONE" });

  const map = new Map();
  assert.equal(computeOpenLotMetrics(readyNone, map, targetCapitalUsd, "2026-11-27").isSellGttReady30Pct, true);
  assert.equal(computeOpenLotMetrics(readyPlanned, map, targetCapitalUsd, "2026-11-27").isSellGttReady30Pct, true);
  assert.equal(computeOpenLotMetrics(placed, map, targetCapitalUsd, "2026-11-27").isSellGttReady30Pct, false);
  assert.equal(computeOpenLotMetrics(triggered, map, targetCapitalUsd, "2026-11-27").isSellGttReady30Pct, false);
  assert.equal(computeOpenLotMetrics(belowThreshold, map, targetCapitalUsd, "2026-11-27").isSellGttReady30Pct, false);
});

test("computeOpenLotMetrics handles fractional shares, alloc left, potential/remaining/annual gain, D-ATH, days, and FY month", () => {
  const lot1 = makeTestLot({
    id: 1,
    ticker: "SNDK",
    buyDate: "2026-03-15",
    shares: 0.8,
    remainingShares: 0.5, // partial close: remaining cost = 400 * (0.5 / 0.8) = 250
    buyPriceUsd: 500,
    buyValueUsd: 400,
    targetPriceUsd: 625,
    currentPriceUsd: 550,
    athPriceUsd: 687.5, // (550 - 687.5) / 687.5 = -20%
    marketCapTier: "MID", // maxAllowedPct = 3.0%
  });
  const lot2 = makeTestLot({
    id: 2,
    ticker: "SNDK",
    buyDate: "2026-04-01",
    shares: 0.2,
    remainingShares: 0.2,
    buyPriceUsd: 500,
    buyValueUsd: 100,
    targetPriceUsd: 625,
    currentPriceUsd: 550,
    marketCapTier: "MID",
  });
  const noTierLot = makeTestLot({
    id: 3,
    ticker: "XYZ",
    marketCapTier: null,
    athPriceUsd: null,
    targetPriceUsd: null,
    currentPriceUsd: 220,
  });

  const targetCapitalUsd = 10000;
  const consolidated = consolidateOpenLots([lot1, lot2, noTierLot], targetCapitalUsd);
  const consolidatedMap = new Map(consolidated.map((c) => [c.ticker, c]));

  // Days from 2026-03-15 to 2026-06-23 = 100 days
  const m1 = computeOpenLotMetrics(lot1, consolidatedMap, targetCapitalUsd, "2026-06-23");
  assert.equal(m1.buyValueRemainingUsd, 250);
  assert.equal(m1.allocationPct, 2.5);
  assert.equal(m1.totalTickerAllocationPct, 3.5); // (250 + 100) / 10000 = 3.5%
  assert.equal(m1.allocLeftPct, -0.5); // 3.0 - 3.5 = -0.5%
  assert.equal(m1.currentValueUsd, 275); // 0.5 * 550
  assert.equal(m1.gainAmountUsd, 25); // 275 - 250
  assert.equal(m1.currentGainPct, 10); // 25 / 250
  assert.equal(m1.remainingGainPct, 13.64); // (625 - 550) / 550 * 100 = 13.6363...
  assert.equal(m1.potentialGainPct, 25); // (0.5 * 625 - 250) / 250 = 62.5 / 250 = 25%
  assert.equal(m1.totalPotentialGainUsd, 62.5);
  assert.equal(m1.daysHeld, 100);
  assert.equal(m1.annualReturnPct, 36.5); // (10 / 100) * 365
  assert.equal(m1.dAthPct, -20);
  assert.equal(m1.monthLabel, "FY2526-M03");
  assert.equal(m1.isSellGttReady30Pct, true); // 550 >= 625 * 0.70 (437.5)

  const mNoTier = computeOpenLotMetrics(noTierLot, consolidatedMap, targetCapitalUsd, "2026-11-27");
  assert.equal(mNoTier.allocLeftPct, null);
  assert.equal(mNoTier.dAthPct, null);
  assert.equal(mNoTier.potentialGainPct, null);
  assert.equal(mNoTier.totalPotentialGainUsd, null);
  assert.equal(mNoTier.remainingGainPct, null);
  assert.equal(mNoTier.isSellGttReady30Pct, false);
});
