---
name: git-safe-commit
description: Enforces zero-blast-radius polyrepo isolation and zero-secret/data-leak checks before any git commit or push.
---

# Git Safe Commit Skill

## Purpose
Enforces strict polyrepo isolation and prevents accidental secret, database, or build-artifact leaks before committing or pushing any changes.

## Mandatory Steps (Execute in Order)

1. **Verify Repo Root:**
   Run `git rev-parse --show-toplevel` and confirm it equals the exact current project directory (never `D:\AI Projects\Trading Log` and never a sibling repo).
   - If the top-level path does not match the current project root, **STOP** immediately and do not stage or commit.

2. **Secret & Data Audit:**
   Run `git status -s` and verify **NO** `.env*`, `*.db`, `*.sqlite*`, `config/rules.yaml`, `logs/`, `Console_Reports/`, `Reports/`, `.next/`, `node_modules/`, `.venv/` are untracked or staged.
   - If any appear, add them to `.gitignore` before staging.

3. **Staged Diff Check:**
   Run `git diff --cached --name-only` and confirm every file belongs strictly to this single project.

4. **Commit & Push:**
   Commit with a conventional message (`feat:`, `fix:`, `docs:`, `chore:`) and push only this repo's `origin main`.
   - Never touch sibling repos unless explicitly running `D:\AI Projects\Trading Log\sync-all.ps1`.
