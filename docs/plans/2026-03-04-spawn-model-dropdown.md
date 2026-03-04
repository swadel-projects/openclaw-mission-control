# Spawn Model Dropdown → OpenClaw Config

**Date:** 2026-03-04
**Status:** ✅ Complete and verified
**Roadmap item:** [ROADMAP.md — Implemented #5](../ROADMAP.md)
**Claude plan file:** `.claude/plans/temporal-soaring-crystal.md`

---

## Goal

Make the Spawn panel's model dropdown reflect only the models actually configured in `openclaw.json` — the union of every agent's `model.primary` and `model.fallbacks`. Eliminate the hardcoded 8-model catalog that bore no relation to the real OpenClaw environment.

## Non-goals

- Do not remove `MODEL_CATALOG` from `src/lib/models.ts` or the Zustand store — other features (token cost lookup, etc.) may depend on it.
- Do not change the spawn POST validation schema — `model: z.string()` already accepts full model IDs.
- Do not wire any new data to the Tokens/Costs panel (separate roadmap item B).
- Do not change how `createWorkflowSchema` defaults its model field — that's the Workflow feature, not Spawn.

---

## Checklist

- [x] Locate Spawn panel and model dropdown (`src/components/panels/agent-spawn-panel.tsx`, lines 144–162)
- [x] Locate hardcoded model source (`src/lib/models.ts` → `MODEL_CATALOG`; store init at `src/store/index.ts:570`)
- [x] Confirm `spawnAgentSchema.model` is `z.string()` (no enum restriction) — no schema change needed
- [x] Identify canonical config-reading pattern (`getConfigPath()` + `readOpenClawAgents()` in `src/lib/agent-sync.ts`)
- [x] Confirm model format in `openclaw.json`: full ID strings like `anthropic/claude-opus-4-5` under `agents.list[].model.{primary,fallbacks}`
- [x] Add `readConfiguredModels()` export to `src/lib/agent-sync.ts`
- [x] Add `GET /api/spawn?action=models` branch to `src/app/api/spawn/route.ts` (static import, early return)
- [x] Rewrite model dropdown in `src/components/panels/agent-spawn-panel.tsx` to fetch from API on mount
- [x] Handle loading / error / empty-config states in the dropdown (disabled select + explanatory text)
- [x] Fix `react-hooks/exhaustive-deps` lint warning (`formData.model` added to second `useEffect` deps)
- [x] `pnpm typecheck` — clean
- [x] `pnpm lint` — clean (0 errors, 0 warnings after dep fix)
- [x] Verified live: dropdown shows real models from `openclaw.json`

---

## Impacted files

| File | Change |
|---|---|
| `src/lib/agent-sync.ts` | Added exported async `readConfiguredModels()` — collects unique model ID strings from all agents' `model.primary` + `model.fallbacks`, returns `{ models: string[], warning?: string }` |
| `src/app/api/spawn/route.ts` | Added static import of `readConfiguredModels`; added early `?action=models` branch in the GET handler before the existing history logic |
| `src/components/panels/agent-spawn-panel.tsx` | Removed `availableModels` from store destructure; added `configModels` + `modelsState` local state; fetch on mount; dropdown options derived from real model IDs; loading/error/empty states; spawn button blocked when no model available; post-spawn reset uses `configModels[0]` instead of `'sonnet'` |

**Not modified:** `src/lib/models.ts`, `src/store/index.ts`, `src/lib/validation.ts`

---

## Verification steps

1. Open the Spawn page — dropdown shows only models from your `openclaw.json` (formatted as `model-name · provider`), not the old 8-item catalog.
2. `curl -s "http://127.0.0.1:3000/api/spawn?action=models"` returns your real agent model IDs as a sorted JSON array.
3. Temporarily break `OPENCLAW_CONFIG_PATH` in `.env` → dropdown shows "No models configured in openclaw.json" and the Spawn button stays disabled. No crash.
4. Submit a spawn — model value in the POST body is a full model ID (e.g., `anthropic/claude-opus-4-5`), not a short alias.

---

## Progress log

**Discovery phase:**
- The Spawn dropdown was populated entirely from `availableModels` in the Zustand store, which was initialized at startup from the hardcoded `MODEL_CATALOG` in `src/lib/models.ts` (8 models: haiku, sonnet, opus, deepseek, groq-fast, groq, kimi, minimax).
- A `/api/status?action=models` endpoint already existed but also returned `MODEL_CATALOG` — the opposite of what we needed.
- `src/lib/agent-sync.ts` already contained the canonical config-reading pattern (`getConfigPath()` + `readOpenClawAgents()`) that we could reuse directly.
- `spawnAgentSchema.model` was confirmed to be `z.string().min(1)` — no enum restriction — so full model IDs would pass validation unchanged.

**Key decision — where to put `readConfiguredModels()`:**
- Considered a new `src/lib/openclaw-config.ts`, but `getConfigPath()` is a private (unexported) function inside `agent-sync.ts`. Co-locating the new function there avoids either exporting or duplicating that helper. Future refactor to a dedicated file if more config-reading helpers accumulate.

**Key decision — don't touch the store:**
- `MODEL_CATALOG` and `availableModels` in the store were left intact. Other features may use them. Model fetching for Spawn is kept local to the component via a dedicated API endpoint.

**Behaviour change to note:**
- The model value submitted by the spawn form changes from a short alias (e.g., `"sonnet"`) to a full model ID (e.g., `"anthropic/claude-sonnet-4-20250514"`). OpenClaw's `sessions_spawn` accepts full model IDs natively. This is more correct than the previous alias-based approach.

**Lint fix:**
- Initial implementation triggered a `react-hooks/exhaustive-deps` warning because the second `useEffect` (default model selection) used `formData.model` in its condition but didn't list it in the dependency array. Fixed by adding `formData.model` to deps — safe because the condition `!formData.model` prevents re-triggering once set.
