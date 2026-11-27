import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDailyActions } from "../action-engine";
import { parseIndmoneyRawCaptures } from "../indmoney-sync";
import { BrokerOrder, OpenLot, Opportunity } from "../types";

describe("action-engine & cancelled trigger capture", () => {
  it("flags open lots missing targetPriceUsd or sellGttStatus=NONE as MISSING_TARGET", () => {
    const lots: OpenLot[] = [
      {
        id: 1,
        externalId: null,
        ticker: "AVGO",
        companyName: "Broadcom",
        buyDate: "2026-11-25",
        shares: 1,
        remainingShares: 1,
        buyPriceUsd: 150,
        buyValueUsd: 150,
        feesUsd: 0,
        strategy: "Momentum",
        targetPriceUsd: null,
        sellGttPriceUsd: null,
        sellGttStatus: "NONE",
        marketCapTier: "MEGA",
        currentPriceUsd: 155,
        executionMode: "Instant",
        listName: "",
        prevCloseUsd: null,
        todayChangePct: null,
        athPriceUsd: null,
        quoteSource: null,
        quoteUpdatedAt: null,
        lrd: null,
        notes: "",
        source: "INDMONEY",
      },
      {
        id: 2,
        externalId: null,
        ticker: "NVDA",
        companyName: "NVIDIA",
        buyDate: "2026-11-20",
        shares: 2,
        remainingShares: 2,
        buyPriceUsd: 130,
        buyValueUsd: 260,
        feesUsd: 0,
        strategy: "Breakout",
        targetPriceUsd: 160,
        sellGttPriceUsd: 160,
        sellGttStatus: "PLACED",
        marketCapTier: "MEGA",
        currentPriceUsd: 135,
        executionMode: "GTT",
        listName: "",
        prevCloseUsd: null,
        todayChangePct: null,
        athPriceUsd: null,
        quoteSource: null,
        quoteUpdatedAt: null,
        lrd: null,
        notes: "",
        source: "INDMONEY",
      },
    ];

    const actions = buildDailyActions({
      openLots: lots,
      brokerOrders: [],
      opportunities: [],
      snoozes: {},
      todayIso: "2026-11-27",
    });

    assert.equal(actions.length, 1);
    assert.equal(actions[0].kind, "MISSING_TARGET");
    assert.equal(actions[0].ticker, "AVGO");
  });

  it("surfaces cancelled 90d trigger orders (e.g. corporate action) for user decision", () => {
    const parsed = parseIndmoneyRawCaptures({
      orders: [
        {
          apiUrl: "https://apixt-us.indmoney.com/orders/summary",
          payload: {
            data: {
              orders: [
                {
                  order_id: "ord_cancel_1",
                  transaction_type: "BUY",
                  ind_key: "GEV",
                  name: "GE Vernova Inc.",
                  qty: 0.5,
                  trigger_price: 300,
                  order_value: "$150.00",
                  order_type: "Trigger",
                  status: "Cancelled",
                  cancellation_reason: "Cancelled due to corporate action",
                  date_epoch: 1795100000,
                },
              ],
            },
          },
        },
      ],
    });

    assert.equal(parsed.executions?.length, 0);
    assert.equal(parsed.brokerOrders?.length, 1);
    const bo = parsed.brokerOrders![0];
    assert.equal(bo.status, "CANCELLED");
    assert.equal(bo.cancellationReason, "Cancelled due to corporate action");

    const brokerOrder: BrokerOrder = {
      id: 10,
      externalId: bo.externalId,
      ticker: bo.ticker,
      companyName: bo.companyName ?? bo.ticker,
      side: bo.side,
      orderType: bo.orderType,
      status: bo.status,
      cancellationReason: bo.cancellationReason ?? "",
      shares: bo.shares,
      priceUsd: bo.priceUsd,
      valueUsd: bo.valueUsd,
      orderDate: bo.orderDate,
      expiryDate: bo.expiryDate ?? null,
      decisionStatus: "PENDING_REVIEW",
      strategy: "Breakout",
      snoozedUntil: null,
      notes: "",
      rawJson: "",
    };

    const actions = buildDailyActions({
      openLots: [],
      brokerOrders: [brokerOrder],
      opportunities: [],
      todayIso: "2026-11-27",
    });

    assert.equal(actions.length, 1);
    assert.equal(actions[0].kind, "CANCELLED_TRIGGER");
    assert.equal(actions[0].strategy, "Breakout");
    assert.ok(actions[0].subtitle.includes("Cancelled due to corporate action"));
  });

  it("keeps pending opportunities visible regardless of snoozedUntil until resolved", () => {
    const opps: Opportunity[] = [
      {
        id: 5,
        ticker: "AMAT",
        companyName: "Applied Materials",
        leaderMention: "",
        strategy: "Pullback / Dip",
        marketCapTier: "LARGE",
        currentPriceUsd: 180,
        plannedOrderType: "90D_TRIGGER",
        triggerPriceUsd: 175,
        targetCapitalUsd: 250,
        plannedShares: 1.428571,
        actionType: "PLACE_ORDER",
        actionDueDate: "2026-11-27",
        actionStatus: "PENDING",
        snoozedUntil: "2026-11-30",
        thesisNotes: "Pullback to 50EMA",
        source: "MANUAL",
        createdAt: "2026-11-27T00:00:00Z",
        updatedAt: "2026-11-27T00:00:00Z",
      },
    ];

    const visibleBefore = buildDailyActions({
      openLots: [],
      brokerOrders: [],
      opportunities: opps,
      todayIso: "2026-11-27",
    });
    assert.equal(visibleBefore.length, 1);
    assert.equal(visibleBefore[0].kind, "OPPORTUNITY_ACTION");
    assert.equal(visibleBefore[0].strategy, "Pullback / Dip");
  });

  it("enforces 30% Sell GTT rule and missing-CMP warning on active open lots", () => {
    const baseLot: OpenLot = {
      id: 100,
      externalId: null,
      ticker: "MSFT",
      companyName: "Microsoft",
      buyDate: "2026-11-25",
      shares: 1.5,
      remainingShares: 1.5,
      buyPriceUsd: 120,
      buyValueUsd: 180,
      feesUsd: 0,
      strategy: "Momentum",
      targetPriceUsd: 200,
      sellGttPriceUsd: null,
      sellGttStatus: "NONE",
      marketCapTier: "MEGA",
      currentPriceUsd: 140,
      executionMode: "Instant",
      listName: "",
      prevCloseUsd: null,
      todayChangePct: null,
      athPriceUsd: null,
      quoteSource: null,
      quoteUpdatedAt: null,
      lrd: null,
      notes: "",
      source: "INDMONEY",
    };

    const lots: OpenLot[] = [
      // 1. Missing target -> MISSING_TARGET
      { ...baseLot, id: 101, ticker: "AAPL", targetPriceUsd: null, currentPriceUsd: 150 },
      // 2. Target set, sellGttStatus=NONE, missing CMP -> REFRESH_CMP
      { ...baseLot, id: 102, ticker: "META", targetPriceUsd: 200, sellGttStatus: "NONE", currentPriceUsd: null },
      // 3. Target set, sellGttStatus=PLANNED, CMP < 0.70 * Target -> no action
      { ...baseLot, id: 103, ticker: "GOOG", targetPriceUsd: 200, sellGttStatus: "PLANNED", currentPriceUsd: 139.99 },
      // 4. Target set, sellGttStatus=PLANNED, CMP >= 0.70 * Target -> PLACE_SELL_GTT_30PCT
      { ...baseLot, id: 104, ticker: "MSFT", targetPriceUsd: 200, sellGttStatus: "PLANNED", currentPriceUsd: 140 },
      // 5. sellGttStatus=PLACED with CMP >= 0.70 * Target -> no PLACE_SELL_GTT_30PCT
      { ...baseLot, id: 105, ticker: "NVDA", targetPriceUsd: 200, sellGttStatus: "PLACED", currentPriceUsd: 180 },
    ];

    const actions = buildDailyActions({
      openLots: lots,
      brokerOrders: [],
      opportunities: [],
      snoozes: {},
      todayIso: "2026-11-27",
    });

    assert.equal(actions.length, 3);

    const aapl = actions.find((a) => a.ticker === "AAPL");
    assert.ok(aapl);
    assert.equal(aapl.kind, "MISSING_TARGET");
    assert.equal(aapl.priority, "HIGH");
    assert.equal(aapl.title, "Set Target Price (1.5000 sh)");

    const meta = actions.find((a) => a.ticker === "META");
    assert.ok(meta);
    assert.equal(meta.kind, "REFRESH_CMP");
    assert.equal(meta.priority, "HIGH");
    assert.equal(meta.actionKey, "lot:102:refresh_cmp");
    assert.equal(meta.title, "Refresh CMP to check 30% Sell GTT readiness");
    assert.equal(meta.subtitle, "Target $200.00 set • Live CMP missing");

    const msft = actions.find((a) => a.ticker === "MSFT");
    assert.ok(msft);
    assert.equal(msft.kind, "PLACE_SELL_GTT_30PCT");
    assert.equal(msft.priority, "HIGH");
    assert.equal(msft.actionKey, "lot:104:place_sell_gtt");
    assert.equal(msft.title, "Place Sell GTT on INDmoney @ $200.00");
    assert.equal(msft.subtitle, "CMP $140.00 is within 30% of Target • 1.5000 sh");
    assert.equal(msft.recommendedOrderType, "90D_TRIGGER");
    assert.equal(msft.priceUsd, 200);

    assert.equal(actions.find((a) => a.ticker === "GOOG"), undefined);
    assert.equal(actions.find((a) => a.ticker === "NVDA"), undefined);
  });
});
