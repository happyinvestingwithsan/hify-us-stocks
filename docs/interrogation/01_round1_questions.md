# Interrogation Round 1 — Scope, INDmoney Sync & Profit Reconciliation

**Date:** 2026-11-26  
**Reference PRD:** `D:\AI Projects\HIFY-TradingJournal\prd-Trading JOurnal`  
**Seed Data:** `D:\AI Projects\US Stocks\potential_stocks.xlsx`, `D:\AI Projects\US Stocks\trades.xlsx`

---

## Questions to Finalize Scope & Phases

### 1. INDmoney Tradebook Sync ("collect the trade book when i refresh automatically")
1. **How should we connect to INDmoney?** Does INDmoney give you any API/token, or do you want us to sync via:
   - Automated browser/session login (e.g., Playwright / saved session) that fetches the tradebook on refresh, OR
   - Fetching from INDmoney's web endpoints using your session cookie/token, OR
   - Watching/uploading an exported INDmoney Tradebook CSV/Excel?
2. **What fields are in your INDmoney tradebook?** (e.g., Buy/Sell timestamp, fractional shares, USD execution price, FX rate / INR value, brokerage/SEC/TAF fees, dividends, stock splits?)

### 2. Exact Account Profit Calculation (Immediate Priority)
3. **Currency & Netting:** Should "exact profit made in the account" be shown in **USD**, **INR** (at trade-date FX vs current USD/INR), or **both**?
4. **Fees & Dividends:** Should brokerage, SEC/TAF fees, and FX conversion charges be deducted from P&L, and should **dividends** be included in total profit or tracked separately?
5. **Lot Matching (Closed Trades):** When a ticker has multiple buys and a partial sell (fractional shares), should closed-trade mapping use **FIFO** (First-In, First-Out) or **manual lot selection** (to match each purchase's specific target/GTT)?

### 3. Lot-Level Targets & GTT Workflow
6. **Per-Purchase Lots:** Confirm if multiple buys of the same ticker should stay as **individual lot rows** (each with its own Strategy, Target Price, and Sell GTT) alongside a **consolidated ticker summary**.
7. **GTT Execution:** Should this app **calculate & track** Buy/Sell GTT prices and statuses (for you to place in INDmoney), or do you also want automated GTT placement/sync with INDmoney?

### 4. Adapting HIFY PRD to US Stocks
8. **Fractional Shares:** Confirm fractional share quantities (e.g., `0.4521`) in both Opportunity sizing and Open/Closed Trades (unlike the HIFY PRD's integer `floor()` rule).
9. **US Market Cap & Allocation Rules:** In HIFY PRD, Indian stocks use Nifty Rank (5% Large, 3% Mid, 1.5–2% Small). What Market Cap tiers (e.g., Mega/Large/Mid/Small by USD market cap) and max % allocation limits do you want for US stocks?
10. **Opportunity Sources:** Aside from `potential_stocks.xlsx` (`Leader / Mention`, `Company Name`, `Ticker (Exchange)`) and manual entry, is there any external scanner/tool (like HIFY Nexus) feeding US opportunities?

### 5. Tech Stack & Phasing Preference
11. **Stack:** Are you aligned with **Next.js (TypeScript) + Tailwind + local SQLite/Postgres (or Supabase)** so it cleanly plugs into your unified Trading Log dashboard later?
12. **Phase Order:** Should **Phase 1** deliver **INDmoney Tradebook Sync + Open/Closed Trade Mapping + Exact Profit Dashboard** immediately, followed by **Phase 2 (Lot-Level Targets & Sell GTTs)** and **Phase 3 (Opportunities, Scoring & Buy GTTs)**?
