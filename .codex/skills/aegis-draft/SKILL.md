---
name: aegis-draft
description: >-
  Use for any implementation, bugfix, refactoring, review, data-pipeline (Go/OpenDota/
  Liquipedia ETL), JSON Schema / data-contract, rating & scoring model, or TypeScript/React
  frontend task inside the aegis-draft repository. This is the Codex project router: it must
  load AGENTS.md/CLAUDE.md, route the task through docs/ai/INDEX.md, and read the relevant
  .claude/skills/<name>/SKILL.md files before changing code.
---

# Aegis Draft (Codex router)

Entrypoint for Codex in `aegis-draft`. Keeps Codex aligned with the same playbook Claude Code
and Cursor use; `.claude/skills/` stays the single source of detailed procedures.

## Required workflow
1. Read `/AGENTS.md` first (symlink to `/CLAUDE.md`) — the always-on project contract.
2. Read `docs/ai/INDEX.md` and select all skills matching the task.
3. Read each selected `.claude/skills/<name>/SKILL.md` fully before acting.
4. Do reuse-first discovery (`discovery-before-code`) unless the task is trivial.
5. Before saying done, run `self-review-checklist` when code/data was touched.

## Skill routing (see docs/ai/INDEX.md for the authoritative table)
- New Go pipeline code: `discovery-before-code` -> `plan-first-communication` -> `external-data-etl` / `data-contract` / `scoring-model` (by topic) -> `self-review-checklist`.
- New TS/React code: `discovery-before-code` -> `data-contract` / `scoring-model` -> `self-review-checklist`.
- Schema / data-model change: `data-contract` -> `self-review-checklist`.
- External source / fetch / parsing: `external-data-etl` -> `data-contract` -> `self-review-checklist`.
- Rating formula / pack generation / scoring: `scoring-model` (+ `data-contract`) -> `self-review-checklist`.
- Refactor: `discovery-before-code` -> `plan-first-communication` -> `self-review-checklist`.
- Bugfix: `discovery-before-code` -> `self-review-checklist`.

If unsure, start with `discovery-before-code`.

## Codex notes
- Codex skill entries in `.codex/skills/` are symlinks to `.claude/skills/` (single-source).
- Claude Code hooks do not run in Codex. Track manually: changed `schema/` -> sync Go `pipeline/internal/model` + TS `web/src/types`; changed data JSON -> `node .claude/skills/data-contract/tools/validate_data.mjs`; changed a rating formula -> bump `manifest.ratingModelVersion`.
- Key invariant: one canonical `accountId` everywhere (no `steamId` leaks). Dotabuff is not a data source.
