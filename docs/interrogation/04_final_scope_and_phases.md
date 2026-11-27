# Finalized Scope, Architecture & Implementation Phases

**Date:** 2026-11-26  
**Project:** US Stocks Trading Journal & GTT Control (`D:\AI Projects\Trading Log\US Stocks`)  
**Status:** Approved — Phase 1 In Progress (2026-11-26)

---

## 1. Consolidated Decisions (Rounds 1 & 2)

| Area | Finalized Decision |
| :--- | :--- |
| **Broker & Scope** | **INDmoney — US Stocks only** (isolated module, clean TypeScript interfaces for future integration into unified Trading Log & `happy-investing.in`). |
| **INDmoney Auto-Sync** | User confirmed US Tradebook, Order History, INR Deposits, and GTT are visible on `indmoney.com` web. **Primary sync:** Chrome Extension (`D:\AI Projects\hify-nexus\dev1\tools\tradingview\extension`) via a new `indmoney_content.js` using the user's live authenticated browser session (zero extra OTP/login). **Fallback:** Excel/CSV statement importer deduplicated by Order/Trade ID. |
| **Exact Account Profit (Dual Currency)** | Track **both USD & INR**. **INR Invested** tracked separately with **deposit timestamps** (LRS/remittances). **Current Value (INR)** uses **live USD/INR rate**. Deduct **brokerage, SEC/TAF fees, and FX charges** for **net profit**, and display **dividends** & fee breakdown transparently. |
| **Lot-Level Open Trades & Partial Sells** | **Each purchase = separate lot row** (its own Strategy, Target Price, Sell GTT) + consolidated ticker view. Supports **lot-specific partial/full sell mapping** (e.g., $1,000 ticker split into $500 and $250 exits at different prices) + manual enrichment for Strategy/Target/Notes. |
| **Fractional Shares & Sizing** | **Fractional shares mandatory.** Capital-first sizing: user enters **Target/Bought Value ($)** and `Qty = Value / Price` (exact fractional). |
| **Market Cap Benchmark & Caps** | **FINRA US Benchmark (Approved):** **Mega Cap (`>= $200B`): 5.0%**, **Large Cap (`$10B–$200B`): 4.0%**, **Mid Cap (`$2B–$10B`): 3.0%**, **Small Cap (`< $2B`): 1.5%**. |
| **Allocation Denominator** | **User-input `Target Portfolio Capital (USD)`** (e.g., starts at `$100`, updated month-on-month to `$5,000` as capital grows). |
| **Storage & Community Scaling** | **Personal-first:** Local SQLite DB behind a `JournalRepository` interface. **Community (`happy-investing.in`):** Swappable to Google Sheets / Google Drive + 1-click **Google Sheets Template Export**. |

---

## 2. Target Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Chrome Extension (D:\AI Projects\hify-nexus\dev1\...\extension)   │
│  • indmoney_content.js  ──► Scrapes/fetches US Trades, Holdings,   │
│                             INR Deposits & automates GTTs (Ph 2/3) │
│  • TV / StockAnalysis   ──► "Mark Opportunity" + Allocation Badge  │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS / Localhost REST API
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  US Stocks Trading Journal (Next.js App Router + TypeScript)       │
│  • /api/sync/indmoney   (idempotent tradebook & deposit ingest)    │
│  • /api/trades/open     (lot-level + consolidated + live P&L)      │
│  • /api/trades/closed   (lot-matched realized P&L + exit efficiency│
│  • /api/opportunities   (watchlist, scoring, capital-first sizing) │
│  • /api/export/sheets   (Google Sheets template export)            │
└───────────────────────────────┬────────────────────────────────────┘
                                │ JournalRepository Interface
                ┌───────────────┴───────────────┐
                ▼                               ▼
     [Local SQLite DB]              [Google Sheets / Drive Adapter]
      (Personal Phase 1)             (Community / happy-investing.in)
```

---

## 3. Implementation Phases

### Phase 1 — INDmoney Sync, Open/Closed Mapping & Exact Account Profit (Immediate)
* **Deliverables:**
  1. Next.js (TypeScript + Tailwind) app scaffold in `D:\AI Projects\Trading Log\US Stocks\` with **SQLite** + `JournalRepository` abstraction.
  2. **Core Schema:** `inr_deposits`, `executions` (raw INDmoney trades), `open_lots`, `closed_trades`, `dividends_fees`.
  3. **Exact Account Profit Engine:**
     - Realized Net P&L (USD & INR), Unrealized P&L (USD & INR at live USD/INR), Total INR Invested (timestamped deposits), Total Fees (Brokerage/SEC/TAF/FX), Total Dividends, and Net Account Profit.
  4. **Open & Closed Trade Mapping UI:**
     - Lot-level Open Trades table (with manual Strategy, Target Price, Notes enrichment) + Consolidated Ticker view.
     - Lot-matched Closed Trades view (handles partial fractional exits across multiple strategies).
  5. **Data Ingest:**
     - `/api/sync/indmoney` endpoint + **INDmoney Statement/Excel Importer** (also seeds/validates against `D:\AI Projects\US Stocks\trades.xlsx`).
     - Chrome Extension `indmoney_content.js` collector (in `dev1` extension) so clicking **Refresh** pulls live data from your open `indmoney.com` session.

### Phase 2 — Lot-Level Targets, Sell GTT Engine & Live Risk Analytics
* **Deliverables:**
  1. Live US market quotes & live USD/INR FX feed.
  2. Per-lot **Sell GTT** calculator, status tracker (`Pending`, `Placed in INDmoney`, `Triggered`, `Cancelled`), and **GTT automation** via `indmoney_content.js` (subject to INDmoney web DOM/API inspection).
  3. Open Trades live analytics: `# Days`, Annualized Return (XIRR proxy), `Rem. Gain %` to Target, `D-ATH`, Consolidated Risk % vs `Target Portfolio Capital`, and **Exit Efficiency (`Gain After Booking %`)** on Closed Trades.

### Phase 3 — Opportunities Watchlist, Scoring, Sizing & Extension Link
* **Deliverables:**
  1. **Opportunities Table** (seeded with `potential_stocks.xlsx` + manual entry) with FINRA Market Cap auto-tagging (`Mega 5%`, `Large 4%`, `Mid 3%`, `Small 1.5%`).
  2. **Capital-First Sizing:** User enters `$` allocation / bought value → back-calculates fractional `Qty`, checks against `Target Portfolio Capital` & existing Open Lots exposure, and calculates **Buy GTT** + **Priority Score (`C-Scr`)**.
  3. **Extension "Mark Opportunity" + Allocation Overlay:** Star/Mark button in TradingView / StockAnalysis / ROIC pushes to Opportunities AND displays your live current `%` allocation & remaining room inside the extension.
  4. **Google Sheets Template Export** (and adapter prep for `happy-investing.in` community launch).
