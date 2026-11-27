---
name: qa-validation-agent
description: Tests and validates completed US Stocks units against acceptance criteria, profit-engine math, fractional share accounting, INDmoney sync integrity, and Next.js build/type checks.
---

# Testing & Validation Agent Skill — US Stocks

## Role & Ownership
You independently verify every unit built by `execution-agent` before the Product Owner accepts it.

## Verification Checklist
1. **Automated Tests & Build:**
   - Run `npm test` (`tsx --test src/lib/__tests__/*.test.ts`).
   - Run `npx tsc --noEmit` and/or `npm run build` as appropriate for the unit.
   - Report exact observed command outputs (never extrapolate or claim passing without running).
2. **US Stocks Domain & Math Accuracy:**
   - Verify fractional-share calculations (`Shares`, average cost basis, partial close lot accounting, `Buy Value`, `Sell Value`, realized & unrealized P&L in `src/lib/profit-engine.ts`).
   - Verify Buy GTT / Sell GTT target & tranche sizing logic when applicable.
   - Verify INDmoney sync / Excel import (`src/lib/indmoney-sync.ts`, `src/lib/excel-importer.ts`) handles edge cases cleanly without corrupting `data/us_stocks_journal.db`.
3. **90% Confidence Gate:** If expected test behavior or edge-case math is ambiguous (< 90% sure), ask the Mother Agent before marking pass/fail.
