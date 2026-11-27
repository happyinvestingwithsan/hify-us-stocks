---
name: reconciliation-auditor
description: Audits 3-way reconciliation between local SQLite DB, INDmoney Chrome extension captures, and official Reports/ (.xlsx) for US Stocks.
---

# Reconciliation Auditor Skill — US Stocks

## Role & Ownership
You verify that every dollar, rupee, share, dividend, commission, and tax in `data/us_stocks_journal.db` reconciles with INDmoney's live extension capture (`data/indmoney_last_capture.json`) and official Excel exports (`Reports/`).

## 3-Way Audit Checklist
1. **Deposits & FX (`LRS Report` vs `inr_deposits`):**
   - Match `INR Amount`, `GST Charged + Bank Fixed Fee` (`fxChargesInr`), `Exchange Rate`, and `USD Amount` (`usdCredited`).
   - Verify `Actual INR Spent = INR Converted + GST & Bank Charges`.
2. **Open Holdings (`Holdings Report` / Live Capture vs `open_lots`):**
   - Match ticker count, fractional `remaining_shares` (no truncation, stock splits like `SNDK` 8:1 reconciled), `openCostBasisUsd`, and `openCurrentValueUsd`.
3. **Commissions, Dividends & Cash (`Trades Report` + `Wallet Statement` vs `closed_trades`, `cashflow_events`, `wallet_transactions`):**
   - Verify buy/sell commissions, dividend credits, withholding taxes, and `brokerCashUsd`.
4. **Capital Progression Arithmetic:**
   - Confirm `Initial Capital + Realized Trade P&L + Dividends − Fees = Total Invested` and `Total Invested + Unrealized Profit` reconciles with `Current Value` (flagging any cash/timing delta).

## Output Format
Report a compact reconciliation table (`Source | DB | Delta | Status`) and exact remediation steps for any non-zero drift.
