# Multi-Agent Workflow & Roster (US Stocks)

## 1. Agent Roster (Skills in `.agents/skills/`)

| Agent | Mode | Skill File | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Product Owner** (`product-owner`) | **Mother Agent** (Main) | `.agents/skills/product-owner/SKILL.md` | Owns scope, splits tasks into small units, enforces the **90% confidence gate** with the user, delegates & accepts work. |
| **Prompt Agent** (`prompt-agent`) | **Always Subagent** | `.agents/skills/prompt-agent/SKILL.md` | Converts raw user thoughts, INDmoney sync issues, or feature ideas into crisp, token-efficient prompts for any agent. |
| **Planner Agent** (`planner-agent`) | Subagent | `.agents/skills/planner-agent/SKILL.md` | Breaks features into 1–3 file atomic units in `docs/IMPLEMENTATION_PLAN.md` with clear acceptance criteria. |
| **UI/UX Designer** (`ui-ux-designer`) | Subagent | `.agents/skills/ui-ux-designer/SKILL.md` | Designs waterfall/bridge charts, `USD/INR` toggles, 3-tier progressive disclosure, and HIFY Gold specs before UI coding. |
| **Execution Agent** (`execution-agent`) | Subagent | `.agents/skills/execution-agent/SKILL.md` | Writes Next.js / TypeScript API routes, SQLite repository, profit-engine, Chrome extension, and HIFY Gold UI code one unit at a time. |
| **Testing & Validation** (`qa-validation-agent`) | Subagent | `.agents/skills/qa-validation-agent/SKILL.md` | Runs `npm test`, `npx tsc --noEmit`, `npm run build`, and verifies profit-engine math, fractional share accounting, and INDmoney sync integrity. |
| **Reconciliation Auditor** (`reconciliation-auditor`) | Subagent | `.agents/skills/reconciliation-auditor/SKILL.md` | Audits 3-way parity across SQLite, INDmoney live capture, and `Reports/*.xlsx` (`LRS`, `Trades`, `Wallet`, `Holdings`). |
| **Security & Risk Auditor** (`security-auditor-agent`) | Subagent | `.agents/skills/security-auditor-agent/SKILL.md` | Audits Chrome extension host permissions/bridge safety, API route input validation, SQLite/reset safeguards, and zero hardcoded secrets. |
| **Session Historian** (`session-historian`) | Subagent | `.agents/skills/session-historian/SKILL.md` | Maintains chat-independent daily continuity in `docs/PROGRESS_LOG.md` at session opening, milestones, and closing. |

---

## 2. Standard Execution Loop (Token-Efficient & High-Accuracy)
```text
[Raw User Thought / Situation]
       │
       ▼
  prompt-agent (Subagent) ──▶ Outputs minimal-token structured brief
       │
       ▼
  product-owner (Mother)  ──▶ Confidence >= 90%? ──(No)──▶ Ask User
       │ (Yes)
       ▼
  planner-agent (Subagent)──▶ Splits into 1–3 file Units (or asks Mother if <90%)
       │
       ▼
  ui-ux-designer (UI/Viz) ──▶ Visual-First spec & chart design (mandatory for UI units)
       │
       ▼
  execution-agent (Unit)  ──▶ Builds 1 Unit at a time (or asks Mother if <90%)
       │
       ▼
  qa-validation-agent     ──▶ Runs npm test / tsc / build + US Stocks math checks
       │
       ▼
  security-auditor-agent  ──▶ Audits extension / API / DB safety (for sensitive units)
       │
       ▼
  product-owner (Mother)  ──▶ Reports verified result to User
```

## 3. Token-Saving Rules
1. **Unit-by-Unit Execution:** Never ask `execution-agent` to build an entire epic in one turn; run one Unit (`U1`, `U2`, ...) per subagent call.
2. **Targeted Context Only:** Pass exact file paths and line ranges—never paste full markdown files into subagent prompts.
3. **90% Confidence Gate:** Any agent with `< 90%` certainty stops immediately and asks up the chain (`Subagent -> Mother Agent -> User`). Zero guessing.
4. **Workspace Rule:** Keep all project plans, architecture notes, and documentation inside `D:\AI Projects\Trading Log\US Stocks\`.
