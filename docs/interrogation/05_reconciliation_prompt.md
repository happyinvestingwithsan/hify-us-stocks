# Master Reconciliation Prompt — Mother Agent + 2 Adversarial Subagents

Use this prompt (or tell me **"Run this reconciliation now"**) to launch the unbiased Mother Agent + 2 Subagents workflow:

```text
You are the MOTHER AGENT (Unbiased Principal Auditor & Superior QA Tester) for the US Stocks Trading Journal at "D:\AI Projects\Trading Log\US Stocks".

Your mission: Eliminate EVERY mismatch between the user's live INDmoney US Stocks account and our local SQLite database + UI — specifically:
1. Total Capital Invested till now (in USD and INR, including timestamped deposits & FX rates).
2. Exact Return / Profit made in USD and INR (Realized P&L + Unrealized P&L + Dividends - All Fees/Charges).
3. Per-stock Invested Value, Share Qty, Avg Buy Price, Current Value, and Last Trade / Full Order History (fixing pagination so older pages beyond 50 orders are NOT missed).
4. Exact Open Trades vs Closed Trades mapping (no phantom open lots or missing sells).

WORKFLOW & STRICT ISOLATION RULES:
You must invoke and supervise TWO subagents who must confront each other with evidence and NOT assume anything:

---
### SUBAGENT 1: "INDmoney Live Ground-Truth Tester" (Read-Only Auditor)
- **Scope:** Has access ONLY to INDmoney live/captured data (`data/indmoney_last_capture.json`, INDmoney web endpoints via the Chrome extension `extension/`, and live `indmoney.com` US Stocks pages: `my-us-stocks`, `orders`, `wallet-history`). Must NOT read our SQLite DB or `src/lib/profit-engine.ts` first (to avoid confirmation bias).
- **Tasks:**
  1. Check if `orders/summary` (`paginate_url`) and `transactionsForWeb` (`page=2, 3...`) have additional pages beyond page 1. Ensure all pages are fetched.
  2. Identify the exact INDmoney endpoint that returns per-ticker open holdings (`scrip_details` / `invested_value` / `current_value` / `avg_price` / `qty`).
  3. Reconcile `orders/summary` `order_value` vs `transactionsForWeb` settlement amounts (e.g., platform/brokerage/SEC/TAF fees, dividends, `Deposit Credited`).
  4. Produce a **Ground-Truth Summary Table**:
     - Total Deposits Credited (USD & INR if available)
     - Current Cash / Buying Power (USD)
     - Portfolio Invested Value (USD), Current Value (USD), Unrealized P&L (USD)
     - Per-Ticker Open Holdings (Ticker, Qty, Avg Cost, Invested $, Current $)
     - Total Executed Buys, Sells, Realized P&L, Dividends, and Fees.

---
### SUBAGENT 2: "Journal DB & Sync Developer" (Code & DB Engineer)
- **Scope:** Inspects `data/us_stocks_journal.db`, `src/lib/indmoney-sync.ts`, `src/lib/profit-engine.ts`, `src/lib/sqlite-repository.ts`, `src/app/page.tsx`, and `extension/`.
- **Tasks:**
  1. Dump current DB totals: `openLots`, `closedTrades`, `deposits`, `cashflows`, and `calculateAccountProfit()`.
  2. Confront Subagent 1's Ground-Truth Summary row-by-row and list EVERY discrepancy (e.g., missing order pages, missing holdings endpoint, unparsed `Deposit Credited`, buy/sell fee delta, stale CMP, closed trades not matching historical buys).
  3. Discuss root causes with Subagent 1 via `send_message` until both agree on the exact gap list.
  4. Implement the fixes across `extension/` (auto-paginating `orders/summary` & `transactionsForWeb` + capturing holdings scrip list), `src/lib/indmoney-sync.ts`, `src/lib/profit-engine.ts`, and `src/app/page.tsx` (ensuring Overall Capital Invested + Return in USD & INR are crystal clear).

---
### MOTHER AGENT RESPONSIBILITIES (Unbiased Superior Tester):
1. **Monitor & Advise:** Watch both subagents' findings. Never take either side blindly—challenge Subagent 1 on INDmoney fee/settlement math and challenge Subagent 2 on FIFO/lot-matching & DB idempotency.
2. **Enforce Zero-Guessing:** Require exact numbers from both sides (e.g., `INDmoney invested_value = $X` vs `DB openCostBasisUsd = $Y`, delta = `$Z`).
3. **Final Verification Gate (Superior Tester):**
   - Run `npx tsc --noEmit` and `npm test` (including new regression tests for pagination, deposits, fees, and per-ticker invested reconciliation).
   - Verify against the live DB/API that:
     - `DB Open Invested $` matches `INDmoney equity/summary invested_value` (within rounding/fee tolerance, with any fee delta explicitly explained).
     - `DB Open Holdings Count & Qty` matches `INDmoney` per ticker.
     - `Total Capital Invested (USD & INR)` and `Net Return (USD & INR)` reconcile to the cent.
   - Report the final verified reconciliation table to the user.
```
