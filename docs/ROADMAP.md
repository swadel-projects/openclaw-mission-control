# Mission Control Roadmap (Scott's Fork)

## How to use this roadmap

This file tracks every customization and feature goal for Scott's Windows-first, OpenClaw-config-driven fork of Mission Control.

- **Implemented** items are finished and verified in the running app.
- **Roadmap** items have a status, an owner, and a link to their plan file (created when work begins).
- Update this file whenever a feature ships or scope changes.
- Plan files live at `docs/plans/` and are checked into git (so progress/history is visible).

---

## Implemented customizations

These are complete and should be preserved across future changes.

- [x] **Upstream v2.0.0 merge** — 90-commit upstream upgrade (eaf0bb1). Memory graph, onboarding wizard, security audit, exec approvals, multi-gateway, multi-tenant, injection guard, audit logging, and more. Retrospective: [`docs/plans/2026-03-12-v2-upgrade.md`](plans/2026-03-12-v2-upgrade.md)
- [x] **Windows CLI invocation hardening** — `shell:false` + `node.exe openclaw.mjs …args` everywhere; no shell-shim arg mangling.
- [x] **Coordinator chat reliability** — fallback to `openclaw agent --agent coordinator --json` when gateway completion returns no text.
- [x] **Sync-from-config path resolution (Windows)** — all sync paths honor `OPENCLAW_CONFIG_PATH` before falling back to `{OPENCLAW_HOME}/.openclaw/openclaw.json`.
- [x] **Command bar API payload fix** — frontend sends `{to, message, from}` shape; backend validation aligned.
- [x] **Spawn model dropdown → OpenClaw config** — dropdown reads all `model.primary` + `model.fallbacks` from every agent in `openclaw.json`; no hardcoded catalog. Retrospective: [`docs/plans/2026-03-04-spawn-model-dropdown.md`](plans/2026-03-04-spawn-model-dropdown.md)

---

## Roadmap

### A — Proper Logs drilldown

Persist OpenClaw gateway events into the MC database. Activity items link to a Run detail view with a full timeline and log lines. Global Logs page is backed by persisted events with filters (agent / run / level / time).

| Field | Value |
|---|---|
| **Status** | Not started |
| **Owner** | Scott + Claude |
| **Plan file** | `docs/plans/logs-drilldown.md` |

---

### B — Real token / cost telemetry

Ingest actual usage from OpenClaw run results and events (input / output / total / cached tokens). Prefer provider-reported cost when available; compute from known pricing only as a fallback. Fix attribution so usage maps to real agent IDs, not the `"main"` catch-all.

| Field | Value |
|---|---|
| **Status** | Not started |
| **Owner** | Scott + Claude |
| **Plan file** | `docs/plans/token-cost-telemetry.md` |

---

### C — Cron listing from openclaw.json

Cron page should list jobs sourced from `~/.openclaw/cron/jobs.json` (OpenClaw config as source-of-truth). No hardcoded or placeholder job lists.

| Field | Value |
|---|---|
| **Status** | Not started |
| **Owner** | Scott + Claude |
| **Plan file** | `docs/plans/cron-listing.md` |

---

### D — Config-path correctness everywhere

Audit every API route and lib function for `OPENCLAW_CONFIG_PATH` compliance. `OPENCLAW_HOME` should revert to `C:\Users\swade` (true user home) once the legacy resolution bug is removed. Remove any remaining `OPENCLAW_HOME=C:\Users\swade\.openclaw` workarounds.

| Field | Value |
|---|---|
| **Status** | Not started |
| **Owner** | Scott + Claude |
| **Plan file** | `docs/plans/config-path-audit.md` |

---

## Quick verification checklist

Run through this after any significant change to confirm nothing regressed:

1. **Overview** — Gateway shows Online; Live Feed updates in real time.
2. **Activity** — New run entries appear after triggering a task.
3. **Activity → Run detail → Logs** — Timeline displays (not empty).
4. **Tokens / Agent Costs** — Updates after running a prompt from the UI.
5. **Cron** — Lists jobs from `~/.openclaw/cron/jobs.json`.
6. **Spawn** — Model dropdown shows only models from `openclaw.json`; no generic catalog.
