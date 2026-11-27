# Interrogation Round 1 — Answers, Architecture & Follow-Ups

**Date:** 2026-11-26  
**Status:** Round 1 Answered — Refining Architecture & Finalizing Scope

---

## 1. Documented Answers (Round 1)

| Topic | User Decision |
| :--- | :--- |
| **Scope** | **US Stocks only** (within this module, modularized for unified Trading Log later). |
| **Sync Cadence & Mode** | Daily sync goal + on-demand **Refresh** with **zero manual steps**. Strong interest in using the existing Chrome Extension at `D:\AI Projects\hify-nexus\dev1\tools\tradingview\extension`. |
| **Currency & Profit Tracking** | Track **both USD and INR**. **INR Invested** must be tracked separately with **timestamps of money added** (deposits/remittances). **Current Value** in INR uses the **live USD/INR rate**. |
| **Fees & Dividends** | Deduct **brokerage, SEC/TAF fees, and FX charges** for **exact net profit**, and show fee breakdown + **dividends** clearly so total costs and returns are transparent. |
| **Lot-Level Open Trades & Partial Sells** | **Each purchase is a separate line item (lot row)** with its own **Strategy, Target Price, and Sell GTT**, alongside a consolidated ticker view. Multiple buys of the same ticker can be sold at different prices (e.g., $1,000 split into $500 and $250 exits). Manual enrichment allowed for fields not in broker fetch (Strategy, Target, Notes). |
| **GTT Scope** | Calculate Buy/Sell GTT prices & track status; **automate GTT placement if possible**. |
| **Fractional Shares & Sizing** | **Fractional shares mandatory.** Capital-first sizing: user inputs **Bought Value / Target Capital ($100, $200, $500)** and **Qty is back-calculated** (`Bought Value / Avg Price`). |
| **US Market Cap Allocation Caps** | **Mega Cap: 5%**, **Large Cap: 4%**, **Mid Cap: 3%**, **Small Cap: 1.5%**. |
| **Opportunity Sources** | Start with a **base Opportunities table** (manual + `potential_stocks.xlsx`), then integrate with the **Dev1 Chrome Extension** (mark opportunities while analyzing + view current allocation inside extension). |
| **Storage & Community Scaling** | **Personal-first:** Local DB (SQLite) now. **Community (`happy-investing.in`):** Google Sheets / Google Drive backend + easy **Google Sheets template export** for public users. |
| **Phasing** | Agreed on 3 phases: **Phase 1** (INDmoney Sync + Open/Closed Mapping + Exact Profit) → **Phase 2** (Lot Targets, Sell GTTs & Live P&L) → **Phase 3** (Opportunities, Scoring, Sizing, Extension & Buy GTTs). |

---

## 2. Architectural Synthesis: Chrome Extension + Local DB + Google Sheets Adapter

Inspecting `D:\AI Projects\hify-nexus\dev1\tools\tradingview\extension` (`manifest.json`, `hify_bridge.js`) and `D:\AI Projects\hify-tracker` confirms that **embedding INDmoney sync into the Dev1 Chrome Extension is the cleanest zero-friction design**:

1. **Zero-Friction INDmoney Sync (`indmoney_content.js`):**
   - Runs on `https://*.indmoney.com/*` using your **already-authenticated Chrome session** (no separate Playwright login, no repeated OTPs).
   - On Refresh (or daily alarm), fetches US Stocks tradebook, holdings, and remittance/deposit history and POSTs them to our Trading Journal API (`localhost` for personal, `happy-investing.in` for community).
   - Includes a **Statement/Excel Fallback Importer** (for `trades.xlsx` or INDmoney US Trades Reports) deduplicated by Trade/Order ID.
2. **Storage Adapter Pattern (Local SQLite ↔ Google Sheets):**
   - Core domain logic (`lot-matcher`, `profit-engine`, `gtt-calculator`, `allocation-engine`) talks to a clean TypeScript `JournalRepository` interface.
   - **Personal Mode:** `SqliteRepository` (fast, local, zero-cloud-dependency).
   - **Community / Export Mode:** `GoogleSheetsRepository` / 1-click **Export to Google Sheets Template** (`Opportunities`, `Open_Trades`, `Closed_Trades`, `INR_Deposits`, `Dividends_Fees`).
3. **Bidirectional Extension Bridge (Phase 3):**
   - **Push to Journal:** Mark a US stock as an Opportunity from TradingView / StockAnalysis / ROIC right into the Journal.
   - **Pull Allocation to Extension:** Extension displays your live current exposure `%` and remaining cap room (`Mega 5% / Large 4% / Mid 3% / Small 1.5%`) while you analyze a chart.
   - **GTT Assist/Automation:** Pre-fill or trigger GTT orders on `indmoney.com` if supported by INDmoney's web DOM/endpoints.

---

## 3. Round 2 Follow-Up Questions

1. **INDmoney Web Visibility:** When you open `indmoney.com` in Chrome, can you see your **US Stocks Tradebook / Order History / INR Deposits / GTT** on the web portal, or is any of it mobile-app-only?
2. **USD Market Cap Cutoffs:** Confirm standard US thresholds for your allocation tiers:
   - **Mega Cap (5%):** `>= $200B`
   - **Large Cap (4%):** `$10B – $200B`
   - **Mid Cap (3%):** `$2B – $10B`
   - **Small Cap (1.5%):** `< $2B`
3. **Portfolio Value Denominator:** Should the `5% / 4% / 3% / 1.5%` allocation limits be calculated against **Total US Stocks Account Value (Invested + USD Cash)**, or **Total Portfolio (India + US)**?
4. **Extension Integration Timing:** Should we build the **US Stocks Journal web app + local DB + Statement/Excel Importer** in Phase 1 first (with a clean `/api/sync/indmoney` ingest endpoint), and wire the `indmoney_content.js` extension collector right alongside it?
