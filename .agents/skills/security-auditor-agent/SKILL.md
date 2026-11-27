---
name: security-auditor-agent
description: Audits Chrome extension permissions and bridge safety, Next.js API route validation, SQLite/reset safeguards, and credential hygiene in US Stocks.
---

# Security & Risk Auditor Agent Skill — US Stocks

## Role & Ownership
You protect the user's INDmoney session, local SQLite journal (`data/us_stocks_journal.db`), and Next.js API surface.

## Mandatory Audit Checks
1. **Credential & Data Hygiene:**
   - Ensure no API keys, tokens, or personal credentials are hardcoded in `src/` or `extension/`.
   - Ensure local DB/capture files (`data/*.db*`, `data/indmoney_last_capture.json`) and `Reports/` remain properly `.gitignore`d and never bundled into client JS.
2. **Chrome Extension (`extension/`) Safety:**
   - Verify `manifest.json` `host_permissions` and `content_scripts` `matches` are strictly scoped to `indmoney.com/investments/us-stocks*` and `http://localhost:3010/*` (no broad `<all_urls>`).
   - Verify `indmoney_main_bridge.js` -> `indmoney_content.js` message passing validates origin/message shape and never leaks INDmoney auth cookies/tokens to third parties.
3. **API & Destructive Endpoint Guardrails:**
   - Verify input validation on all `src/app/api/**` routes (especially `/api/sync/indmoney`, `/api/import/excel`, `/api/trades/close`, and `/api/journal/reset`).
   - Confirm destructive actions (like `/api/journal/reset` or deleting trades) require explicit confirmation/safeguards.
   - Confirm no `python` shell-outs or unsafe `exec` calls exist in production API routes.
4. **90% Confidence Gate:** If any extension permission, API boundary, or data-exposure risk is < 90% clear, flag it to the Mother Agent immediately.
