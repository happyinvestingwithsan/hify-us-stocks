# GEMINI.md — HIFY US Stocks Trading Journal & GTT Control

> **Read this file first** at the start of any task in `D:\AI Projects\Trading Log\US Stocks`.
> **Workspace Rule:** Keep all project plans, architecture notes, and documentation inside `D:\AI Projects\Trading Log\US Stocks\`. Do **not** store project files or artifacts in `antigravity-cli\brain` or outside this folder.

---

## 1. Purpose, Scope & Stack

An isolated, self-contained **US Stocks Trading Journal & GTT Execution Control** module (INDmoney / US equities), designed so it can also plug into the unified Trading Log dashboard later.

* **Scope:** US Stocks **only** (no F&O or Indian Swing logic here).
* **Tech Stack:** Next.js 15 (`port 3010`), React 19, TypeScript, Tailwind CSS v4, local SQLite (`data/us_stocks_journal.db`), Excel importer (`xlsx`), and Chrome Extension (`extension/`, MV3 INDmoney sync bridge).
* **Brand Alignment:** Follow the universal **HIFY Gold Identity + Neutral Intelligence** color palette defined in `D:\AI Projects\Trading Log\HIFY_COLOR_PALETTE.md` (and `BRAND_TOKENS.md` — `#C8A951` HIFY Gold, `#8E6C20` Light-Mode Deep Gold text, `#FAFAF8` / `#121214` canvas, `#FFFFFF` / `#18181B` surfaces, `Inter` + `JetBrains Mono` with `tabular-nums`, semantic `#10B981` profit / `#F43F5E` loss / `#EA580C` warning). Legacy Teal tokens are deprecated.
* **Reference / Seed Data (Read-Only):** `D:\AI Projects\US Stocks\`
  * `potential_stocks.xlsx` — Watchlist / Opportunities (`Leader / Mention`, `Company Name`, `Ticker (Exchange)`)
  * `trades.xlsx` — `Open Trades` & `Closed Trades` (supports fractional `Shares`, `Buy Date`, `Buy Price`, `Buy Value`, `Sell Date`, `Sell Price`, `Sell Value`)

---

## 2. Core Workflows

1. **Opportunities (Buy GTT):**
   * Track potential US stocks and entry triggers.
   * Calculate tranche/position sizing and Buy GTT target prices per US Stocks rules.
2. **Open Holdings (Sell GTT):**
   * Track active fractional-share holdings, average cost basis, live/current price, and unrealized P&L.
   * Calculate and manage Sell GTT target prices / exit rules.
3. **Closed Trades & Journal:**
   * Record realized P&L, holding duration, win rate, deposits/cashflows, and trade notes.

---

## 3. Authoritative Reference Documents

Always consult the relevant files before making architectural, domain, UI, or sync decisions:
1. **Scope & Architecture Notes:** `docs/interrogation/03_round1_answers_and_architecture.md` & `docs/interrogation/04_final_scope_and_phases.md`
2. **Implementation Plan (Atomic Units):** `docs/IMPLEMENTATION_PLAN.md`
3. **Universal HIFY Color Palette & Brand Tokens:** `D:\AI Projects\Trading Log\HIFY_COLOR_PALETTE.md` (and `BRAND_TOKENS.md`)
4. **Core Domain Engine & Types:** `src/lib/types.ts`, `src/lib/profit-engine.ts`, `src/lib/sqlite-repository.ts`
5. **INDmoney Chrome Extension Sync:** `extension/manifest.json`, `src/lib/indmoney-sync.ts`, `src/app/api/sync/indmoney/route.ts`
6. **Multi-Agent Workflow:** `agents/WORKFLOW.md`
7. **Daily Progress & Session Handoff Log:** `docs/PROGRESS_LOG.md`

---

## 4. Role-Based Agent System & Workflow

All work in this project is orchestrated by the **Mother Agent (`product-owner` in the main chat)**, which breaks work into small, manageable atomic units and delegates them to specialist subagents with **clear, exact instructions** (exact file paths, line ranges, constraints, and acceptance criteria) for maximum **token efficiency** and **first-pass accuracy**:

| Role | Skill Path | Task Ownership |
| :--- | :--- | :--- |
| **Product Owner (Mother Agent)** | `.agents/skills/product-owner/SKILL.md` | Orchestrates workflow in main chat, splits tasks into manageable atomic units, writes crisp subagent briefs, enforces 90% confidence gate with User. |
| **Prompt Agent (Always Subagent)** | `.agents/skills/prompt-agent/SKILL.md` | Converts raw user thoughts/situations into crisp, token-efficient prompts for any agent. |
| **Planner Agent** | `.agents/skills/planner-agent/SKILL.md` | Breaks features into 1–3 file units in `docs/IMPLEMENTATION_PLAN.md`. |
| **UI/UX Designer (Data-Viz)** | `.agents/skills/ui-ux-designer/SKILL.md` | Designs waterfall/bridge charts, `USD/INR` toggles, 3-tier progressive disclosure, and HIFY Gold specs before UI coding. |
| **Execution Agent** | `.agents/skills/execution-agent/SKILL.md` | Implements one unit at a time (Next.js API, SQLite, profit-engine, Chrome extension, HIFY Gold UI). |
| **Testing & Validation Agent** | `.agents/skills/qa-validation-agent/SKILL.md` | Runs `npm test` / `tsc` / `next build`, verifies fractional-share & P&L math, INDmoney sync integrity. |
| **Reconciliation Auditor** | `.agents/skills/reconciliation-auditor/SKILL.md` | Audits 3-way parity across SQLite, INDmoney live capture, and `Reports/*.xlsx` (`LRS`, `Trades`, `Wallet`, `Holdings`). |
| **Security & Risk Auditor** | `.agents/skills/security-auditor-agent/SKILL.md` | Audits Chrome extension permissions/bridge, API input validation, DB reset safeguards, secret hygiene. |
| **Session Historian** | `.agents/skills/session-historian/SKILL.md` | Runs at session opening & closing to maintain chat-independent continuity in `docs/PROGRESS_LOG.md` with IST timestamps. |

### Mandatory Agent Operating Rules
1. **Mother-Chat Orchestration & Clear Delegation:**
   - The **Mother Agent (`product-owner`)** owns the end-to-end plan and never delegates vague, oversized prompts. Every subagent call must receive a **manageable unit (`1–3` files)** with **exact file paths, line ranges, guardrails, and verifiable acceptance criteria** so it succeeds on the **first pass** with minimal tokens.
2. **90% Confidence Gate (Zero Assumptions):**
   - Any subagent with **< 90% certainty** must stop and ask the **Mother Agent (`product-owner`)**.
   - The **Mother Agent** with **< 90% certainty** must stop and ask the **User** before proceeding.
3. **Token-Efficient Unit Execution:**
   - Split every new task into small, manageable atomic units (`1–3` files per unit).
   - Pass only exact file paths and line ranges to subagents—never dump entire documents.
   - Use `prompt-agent` in subagent mode whenever converting raw user thoughts or complex situations into agent tasks.

---

## 5. Integration Contract & Engineering Guardrails

* **Unified Dashboard Modularity:** Keep US Stocks data, components, and API routes cleanly modularized so the unified multi-segment dashboard can embed or consume this module without coupling to F&O or Indian Swing internals.
* **Fractional Shares Precision:** Never truncate fractional `Shares` quantities; preserve accurate lot-level cost basis and partial-close accounting in `profit-engine.ts` and `sqlite-repository.ts`.
* **Production-Safe API Routes:** No hardcoded secrets; no local-only `python` shell-out assumptions in production API routes; clean TypeScript interfaces (`src/lib/types.ts`).
* **Extension & Data Safety:** Keep `extension/manifest.json` host permissions strictly scoped to `indmoney.com/investments/us-stocks*` and `http://localhost:3010/*`; keep `data/*.db*` and `Reports/` out of version control and client bundles.

---

## 6. Git Polyrepo Isolation & Tailscale One-Link Contract

* **Strict Polyrepo Isolation:** Never run `git init` at `D:\AI Projects\Trading Log\`. Each segment (`OptionSelling` -> `hify-option-selling`, `US Stocks` -> `hify-us-stocks`, future `Indian Swing` -> `hify-swing-india`, `HIFY-Hub` -> `hify-trading-hub`) is an independent Private Git repository.
* **Zero-Blast-Radius Commit Rule:** Never stage, modify, or commit files across sibling segment folders in a single commit. Use `.agents/skills/git-safe-commit/SKILL.md` before any commit.
* **Zero-Secret Gate:** Never commit `.env*`, `*.db`, `*.sqlite*`, `config/rules.yaml`, `logs/`, `Console_Reports/`, `Reports/`, `node_modules/`, `.next/`, `.venv/`.
* **Tailscale One-Link Port & Path Contract (`127.0.0.1` only):**
  * `HIFY-Hub`: `127.0.0.1:3099` -> `/`
  * `OptionSelling` UI: `127.0.0.1:3000` -> `/options` (API: `127.0.0.1:8000` -> `/options/api`)
  * `US Stocks`: `127.0.0.1:3010` -> `/us`
  * `Indian Swing` (future): `127.0.0.1:3020` -> `/swing`
