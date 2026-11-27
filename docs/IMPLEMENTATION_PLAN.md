# Implementation Plan — US Stocks Trading Journal & GTT Control

> **Managed by:** `planner-agent` & `product-owner` (see `agents/WORKFLOW.md`).
> **Rule:** Every new feature or fix is broken into **1–3 file atomic units** with explicit acceptance criteria and verification commands.

---

## Current Baseline (Already Implemented)
- **Core Engine & Repository:** `src/lib/types.ts`, `src/lib/profit-engine.ts`, `src/lib/sqlite-repository.ts`, `src/lib/repository.ts`, `src/lib/excel-importer.ts`, `src/lib/indmoney-sync.ts`.
- **API Routes:** `/api/cashflows`, `/api/deposits`, `/api/import/excel`, `/api/journal/summary`, `/api/journal/reset`, `/api/sync/indmoney`, `/api/trades/open/[id]`, `/api/trades/close`, `/api/trades/closed/[id]`.
- **UI & Components:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/CloseLotModal.tsx`, `src/components/SortableTh.tsx`.
- **Chrome Extension:** `extension/` (`manifest.json`, `background.js`, `config.js`, `indmoney_main_bridge.js`, `indmoney_content.js`, `popup.html`, `popup.js`).
- **Tests:** `src/lib/__tests__/profit-engine.test.ts` (`npm test`).

---

## Completed Units
- **LRS & TCS-Free Headroom Bar Chart (`2026-11-27`):** `src/lib/lrs.ts`, `src/lib/__tests__/lrs.test.ts`, `src/components/LrsLimitCard.tsx`, `src/app/page.tsx` (Wallet / Cashflows tab). Tracks converted INR (`inrAmount`) vs ₹10L TCS-free threshold (₹7L pre-Apr 2025) and USD credited vs $250k RBI LRS cap per Indian FY (Apr–Mar).
- **Visual-First Upgrade Units V1–V4 (`2026-11-27`):**
  - `V1`: `src/components/OverviewExposureChart.tsx` (Cap-Limit Exposure Bullet/Bar Chart + Costs/Dividends Proportional Bars)
  - `V2`: `src/components/OpenHoldingsVisual.tsx` (Ticker Diverging Unrealized P&L Bars + 3M Trigger & GTT Coverage Strip)
  - `V3`: `src/components/ClosedTradesChart.tsx` (Monthly/Strategy Realized P&L Diverging Vertical Bar Chart)
  - `V4`: Upgraded `src/lib/lrs.ts` & `src/components/LrsLimitCard.tsx` (12-Month Apr–Mar Cumulative Pacing Bars + ₹10L Threshold Line + Mar/Apr FY-Split Headroom)

## Active / Queued Units

### Epic A — Discipline & Daily Action System (No Stop-Loss; Order Types: `90d Trigger` | `Limit` | `Market`)

1. **Unit A1 — Domain Types, Repository & SQLite Schema (`opportunities`, `broker_orders`, `action_state`)**
   - **Files:** `src/lib/types.ts`, `src/lib/repository.ts`, `src/lib/sqlite-repository.ts`
   - **Assigned Agent:** `execution-agent`
   - **Inputs / Spec:**
     - Add `OrderTypeOption = "90D_TRIGGER" | "LIMIT" | "MARKET"` (no stop-loss).
     - Add `Opportunity` (`id`, `ticker`, `companyName`, `leaderMention`, `marketCapTier`, `currentPriceUsd`, `plannedOrderType`, `triggerPriceUsd`, `targetCapitalUsd`, `plannedShares`, `actionType`, `actionDueDate`, `actionStatus`, `thesisNotes`, `createdAt`, `updatedAt`).
     - Add `BrokerOrder` (`id`, `externalId`, `ticker`, `side`, `orderType`, `status`, `cancellationReason`, `shares`, `priceUsd`, `valueUsd`, `orderDate`, `expiryDate`, `decisionStatus` = `PENDING_REVIEW | REPLACED | ADJUSTED | DISMISSED`, `rawJson`).
     - Add `ActionSnooze` / decision state so daily actions can be completed, snoozed (`snoozedUntil`), or dismissed.
   - **Verification:** `npx tsc --noEmit` & `npm test` pass.

2. **Unit A2 — Capture Cancelled / Expired / Pending Trigger Orders in INDmoney Sync**
   - **Files:** `src/lib/indmoney-sync.ts`, `src/lib/__tests__/profit-engine.test.ts` (or new `indmoney-sync.test.ts`)
   - **Assigned Agent:** `execution-agent`
   - **Inputs / Spec:**
     - Update `parseIndmoneyRawCaptures` in `src/lib/indmoney-sync.ts` so non-`"success"` orders (`CANCELLED`, `EXPIRED`, `PENDING`, `REJECTED`) are parsed into `brokerOrders` with `orderType`, `status`, `cancellationReason` (e.g., corporate action / 90d expiry), `orderDate`, and `expiryDate`.
     - Persist/upsert them idempotently via `JournalRepository`.
   - **Verification:** `npm test` & `npx tsc --noEmit` pass with a test covering a corporate-action cancelled 90-day trigger order.

3. **Unit A3 — Opportunities & Daily Actions API Routes**
   - **Files:** `src/app/api/opportunities/route.ts`, `src/app/api/opportunities/[id]/route.ts`, `src/app/api/actions/route.ts`
   - **Assigned Agent:** `execution-agent`
   - **Inputs / Spec:**
     - `GET/POST /api/opportunities` and `PATCH/DELETE /api/opportunities/[id]` with Zod/strict input validation, fractional `plannedShares = targetCapitalUsd / triggerPriceUsd`, and Market Cap exposure check (`5% / 4% / 3% / 1.5%`).
     - `GET /api/actions` returning computed **Action for the Day** items:
       1. Open lots missing `targetPriceUsd` or `sellGttStatus === "NONE"` (`ACTION_PENDING_TARGET`)
       2. Cancelled/expired 90d trigger orders needing decision (`CANCELLED_TRIGGER_REVIEW`)
       3. Opportunities with assigned actions due today/overdue (`OPPORTUNITY_ACTION_DUE`)
     - `PATCH /api/actions` to mark reviewed, snooze, or dismiss a broker-order/daily action.
   - **Verification:** `npx tsc --noEmit` & `npm run build` pass.

4. **Unit A4 — Seed `potential_stocks.xlsx` into Opportunities**
   - **Files:** `src/lib/excel-importer.ts`, `src/app/api/import/excel/route.ts`
   - **Assigned Agent:** `execution-agent`
   - **Inputs / Spec:**
     - Parse `potential_stocks.xlsx` (`Leader / Mention`, `Company Name`, `Ticker (Exchange)`) idempotently into `opportunities` without duplicating existing tickers.
   - **Verification:** `npx tsc --noEmit` & `npm test` pass.

5. **Unit A5 — "Action for the Day" & Opportunities UI Components (HIFY Gold)**
   - **Files:** `src/components/ActionForDayPanel.tsx`, `src/components/OpportunitiesTab.tsx`
   - **Assigned Agent:** `ui-ux-designer` (spec) → `execution-agent` (build)
   - **Inputs / Spec:**
     - **Action for the Day** panel: grouped priority inbox (Missing Targets on Open Trades, Cancelled/Corporate-Action 90d Triggers, Opportunity Actions Due) with inline quick-update for Target Price, Snooze, and Decision buttons (`Re-place`, `Adjust`, `Dismiss`).
     - **Opportunities Tab**: log chart-analysis stocks, assign self-action (`90d Trigger` default, `Limit`, `Market` — no stop loss), enter Target Capital `$` → auto fractional `Qty`, live allocation % vs cap (`5% / 4% / 3% / 1.5%`), and due date.
   - **Verification:** `npx tsc --noEmit` & `npm run build` pass.

6. **Unit A6 — Integrate Daily Action Inbox & Opportunities Tab into Main Journal**
   - **Files:** `src/app/page.tsx`, `src/app/api/journal/summary/route.ts`
   - **Assigned Agent:** `execution-agent`
   - **Inputs / Spec:**
     - Add `Actions (N)` badge and `Opportunities` tab to `src/app/page.tsx`, highlight Open Trade rows missing targets as `Action Pending`, and pass live `targetCapitalUsd` + open exposure to Opportunities.
   - **Verification:** `npm test`, `npx tsc --noEmit`, `npm run build` pass; `qa-validation-agent` & `security-auditor-agent` sign-off.

### Epic A2 — Strategy Admin, Mandatory Strategy in Daily Actions & Universal Header Filter/Sort
7. **Unit A7 — Strategies Table, API & Mandatory Action Strategy (No Snooze)**
   - **Files:** `src/lib/types.ts`, `src/lib/repository.ts`, `src/lib/sqlite-repository.ts`, `src/lib/action-engine.ts`, `src/app/api/strategies/route.ts`, `src/app/api/strategies/[id]/route.ts`, `src/app/api/actions/route.ts`, `src/app/api/journal/summary/route.ts`
   - **Inputs / Spec:**
     - Add `Strategy` model & `strategies` SQLite table (auto-seeded from distinct existing `strategy` values in `open_lots` / `closed_trades`).
     - Add `strategy` column to `opportunities`, `broker_orders`, and `DailyActionItem`.
     - Remove snooze filtering from `buildDailyActions` so pending actions stay visible until resolved.
     - Enforce strategy selection when resolving actions.
8. **Unit A8 — Admin Strategies Tab & Updated ActionForDayPanel / OpportunitiesTab**
   - **Files:** `src/components/AdminStrategiesTab.tsx`, `src/components/ActionForDayPanel.tsx`, `src/components/OpportunitiesTab.tsx`, `src/app/page.tsx`
   - **Inputs / Spec:**
     - Add `Admin` tab in `src/app/page.tsx` to list, add, rename, toggle active, and delete strategies.
     - Replace Snooze button in `ActionForDayPanel.tsx` with a mandatory Strategy dropdown populated from Admin strategies (updates immediately and blocks completing without a strategy).
     - Expose Strategy dropdown in `OpportunitiesTab.tsx` and `Open Lots` inline strategy selector.
9. **Unit A9 — Universal Sort & Filter in All Table Headers**
   - **Files:** `src/components/SortableTh.tsx`, `src/components/OpportunitiesTab.tsx`, `src/components/AdminStrategiesTab.tsx`, `src/app/page.tsx`
   - **Inputs / Spec:**
     - Upgrade `SortableTh.tsx` with shared column filter + sort helpers (`filterAndSortRows`, `HeaderFilterTh` / `FilterRow`).
     - Apply sort + header filter to every column header across all tables: Consolidated Open Exposure, Open Lots, Closed Trades, Wallet Transactions, Opportunities, and Admin Strategies.

### Epic B — Follow-On (After Epic A)
- **Email Connector & Parser Assessment:** Connect read-only INDmoney emails (Gmail API or IMAP/forwarding) to auto-detect order executions, corporate-action cancellations, and 90d trigger expiries in real time.
- **Guided Order Pre-Fill ("Place Order" Button):** From any Action Card or Opportunity, pre-fill `90d Trigger` / `Limit` / `Market` on `indmoney.com` via `extension/`.

### Epic B2 — Live Yahoo Quotes, OpenLot Extensions, 30% Sell GTT Rule & 3-Tier Open Lots UI

10. **Unit B1 — `OpenLot` Schema & Type Extensions (`listName`, Quote Metadata, `lrd`)**
    - **Files:** `src/lib/types.ts`, `src/lib/repository.ts`, `src/lib/sqlite-repository.ts`
    - **Assigned Agent:** `execution-agent`
    - **Inputs / Spec:**
      - Add `QuoteSource = "YAHOO" | "INDMONEY" | "MANUAL"` to `src/lib/types.ts`.
      - Extend `OpenLot` (and `CreateOpenLotInput` / `UpdateOpenLotInput` in `src/lib/repository.ts`) with: `listName: string` (default `""`), `prevCloseUsd: number | null`, `todayChangePct: number | null`, `athPriceUsd: number | null`, `quoteSource: QuoteSource | null`, `quoteUpdatedAt: string | null`, and `lrd: string | null` (Last Review Date, `YYYY-MM-DD`).
      - Add idempotent `ensureColumn("open_lots", ...)` migrations in `SqliteJournalRepository.initSchema()` and update `mapOpenLot()`, `upsertOpenLotByExternalId()`, and `updateOpenLot()` in `src/lib/sqlite-repository.ts`.
    - **Acceptance Criteria:**
      - `npx tsc --noEmit` and `npm test` pass.
      - Existing `open_lots` rows migrate cleanly with `list_name = ''` and `NULL` quote/review metadata without data loss.

11. **Unit B2 — Live Yahoo Finance Quote Service & `/api/quotes/refresh` Route**
    - **Files:** `src/lib/yahoo-quotes.ts`, `src/app/api/quotes/refresh/route.ts`, `src/app/api/trades/open/[id]/route.ts`
    - **Assigned Agent:** `execution-agent`
    - **Inputs / Spec:**
      - Create `src/lib/yahoo-quotes.ts` (server-side Yahoo Finance fetch with timeout & per-ticker error isolation) to fetch `currentPriceUsd` (CMP), `prevCloseUsd`, `todayChangePct`, `athPriceUsd` (ATH/52W high for D-ATH), and `USDINR=X` FX rate. **NO silent fallback to `buyPriceUsd`** when a quote fails.
      - Create `POST /api/quotes/refresh` in `src/app/api/quotes/refresh/route.ts` to refresh active `open_lots` tickers + `USDINR=X`, persist `quoteSource: "YAHOO"` and `quoteUpdatedAt` (ISO timestamp) on `open_lots`, update `account_settings.liveUsdInrRate`, and return `{ updatedCount, fxRate, quotes, errors }`.
      - Update `PATCH /api/trades/open/[id]` in `src/app/api/trades/open/[id]/route.ts` so manual `currentPriceUsd` edits stamp `quoteSource: "MANUAL"` and `quoteUpdatedAt`.
    - **Acceptance Criteria:**
      - `npx tsc --noEmit` and `npm run build` pass.
      - Failed ticker lookups are reported in `errors` and leave `currentPriceUsd` untouched (`null` or prior value), never falling back to `buyPriceUsd`.

12. **Unit B3 — Profit-Engine Open Lot Metrics & No-Silent-Fallback Integrity**
    - **Files:** `src/lib/types.ts`, `src/lib/profit-engine.ts`, `src/lib/__tests__/profit-engine.test.ts`
    - **Assigned Agent:** `execution-agent`
    - **Inputs / Spec:**
      - Add `OpenLotComputedMetrics` to `src/lib/types.ts` and `computeOpenLotMetrics(lot: OpenLot, targetCapitalUsd: number, todayIso?: string): OpenLotComputedMetrics` to `src/lib/profit-engine.ts`.
      - Compute per-lot: `investedUsd`, `allocationPct` (`investedUsd / targetCapitalUsd * 100`), `allocLeftPct` (`MARKET_CAP_LIMITS[lot.marketCapTier] - allocationPct`, or `null` if tier unset), `daysHeld` (`#Days`), `fyMonth` (`formatIndianFyMonth(lot.buyDate)`), and—only when `currentPriceUsd > 0` (**NO silent fallback to `buyPriceUsd`**)—`currentValueUsd`, `unrealizedPnlUsd`, `unrealizedPnlPct`, `potentialGainUsd`, `potentialGainPct` (when `targetPriceUsd` is set), `annualizedReturnPct` (`(unrealizedPnlPct / daysHeld) * 365`), and `distanceFromAthPct` (D-ATH).
      - Add unit tests in `src/lib/__tests__/profit-engine.test.ts` verifying `null` metrics when `currentPriceUsd` is `null`, plus `% Allocation`, `% Alloc Left`, `Potential Gain % & $`, `Annualized Return %`, `#Days`, and `FY Month`.
    - **Acceptance Criteria:**
      - `npm test` and `npx tsc --noEmit` pass with all new `computeOpenLotMetrics` assertions green.

13. **Unit B4 — Action-Engine 30% Sell GTT Rule & Missing-CMP Warning**
    - **Files:** `src/lib/types.ts`, `src/lib/action-engine.ts`, `src/lib/__tests__/action-engine.test.ts`
    - **Assigned Agent:** `execution-agent`
    - **Inputs / Spec:**
      - Extend `DailyActionKind` in `src/lib/types.ts` with `"PLACE_SELL_GTT_30PCT"` and `"REFRESH_CMP"`.
      - Update `buildDailyActions()` in `src/lib/action-engine.ts` for active lots where `targetPriceUsd > 0` and `sellGttStatus` is `"NONE"` or `"PLANNED"`:
        - If `currentPriceUsd === null || currentPriceUsd <= 0`: emit a `'Refresh CMP'` warning action (`kind: "REFRESH_CMP"`) instead of silently using `buyPriceUsd`.
        - Else if `currentPriceUsd >= targetPriceUsd * 0.70`: emit a `HIGH` priority `'Place Sell GTT on INDmoney'` action (`kind: "PLACE_SELL_GTT_30PCT"`, `recommendedOrderType: "90D_TRIGGER"`, `priceUsd: targetPriceUsd`).
      - Add unit tests in `src/lib/__tests__/action-engine.test.ts` covering: `CMP >= target * 0.70` (`NONE` and `PLANNED`), `CMP < target * 0.70`, and missing CMP -> `'Refresh CMP'` warning.
    - **Acceptance Criteria:**
      - `npm test` and `npx tsc --noEmit` pass with all 30% Sell GTT and missing-CMP cases verified.

14. **Unit B5 — Clean 3-Tier Open Lots UI, Live Quote Refresh & Staleness Banner**
    - **Files:** `src/components/OpenLotsTable.tsx`, `src/app/page.tsx`
    - **Assigned Agent:** `ui-ux-designer` (spec) → `execution-agent` (build)
    - **Inputs / Spec:**
      - Extract the Open Lots table from `src/app/page.tsx` into `src/components/OpenLotsTable.tsx` using HIFY Gold 3-tier progressive disclosure:
        - **Quote Controls & Staleness Banner:** `Refresh Live Quotes` button (`POST /api/quotes/refresh`) + warning banner when any active lot lacks CMP or has stale `quoteUpdatedAt` (> 24h).
        - **Tier 1 (Compact Default Table):** Clean default columns (`Buy Date`, `Stock`, `Shares`, `Buy Price`, `CMP ($)` with `Today %` & `quoteSource` badge, `Unrealized P&L`, `Target ($)` + 30% GTT proximity badge, `GTT Status`, `Cap Tier`, `Action`) with `SortableTh` sort/filter. Missing CMP renders `— (Refresh)` rather than `buyPriceUsd`.
        - **Tier 2 (Expandable Row Insights):** Per-row expand drawer displaying `#Days`, `FY Month`, `% Allocation`, `% Alloc Left`, `Potential Gain $ & %`, `Annualized Return %`, `ATH / D-ATH %`, editable `listName` (blank placeholder), `lrd` (Last Review Date), `quoteSource` / `quoteUpdatedAt`, and `Notes`.
        - **Tier 3 (Full View Toggle):** `Compact / Full View` toggle exposing all Tier 2 metrics as sortable/filterable columns.
      - Wire `OpenLotsTable` into `src/app/page.tsx` and reload `/api/journal/summary` after quote refresh.
    - **Acceptance Criteria:**
      - `npx tsc --noEmit`, `npm run build`, and `npm test` pass; `qa-validation-agent` & `security-auditor-agent` sign-off.
