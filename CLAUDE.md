# Mission Control — Scott's Fork

Open-source dashboard for AI agent orchestration. Forked from [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control).

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind CSS 3, Zustand, pnpm

## Fork Info

- **Origin**: `https://github.com/swadel/openclaw-mission-control.git` (true GitHub fork)
- **Upstream**: `https://github.com/builderz-labs/mission-control.git`
- **Old customizations branch**: `custom-v1` (pre-fork work preserved here)
- **Sync upstream**: `git fetch upstream && git merge upstream/main`

## Local Environment (gregg)

- **OS**: Windows 11 (x64)
- **Node**: v22.16.0 via NVM (`C:\nvm4w\nodejs\node.exe`)
- **pnpm**: 10.30.3 (pinned in packageManager)
- **URL**: `http://127.0.0.1:3000` (dev mode)
- **Gateway**: `ws://127.0.0.1:18789` (OpenClaw gateway, loopback)
- **Gateway token**: Set in `.env` as `OPENCLAW_GATEWAY_TOKEN`
- **Data dir**: `.data/` (default) — contains `mission-control.db`
- **Config**: `C:\Users\swade\.openclaw\openclaw.json`

## Credentials

Stored in `.env` (gitignored):
- `AUTH_USER` / `AUTH_PASS` — MC login
- `OPENCLAW_GATEWAY_TOKEN` — gateway auth
- `API_KEY` — MC API key

## Prerequisites

- Node.js >= 22 (LTS recommended; 24.x also supported)
- pnpm (`corepack enable` to auto-install)

## Setup

```bash
pnpm install
pnpm rebuild          # required on Windows for native modules
```

### Windows Native Modules

`package.json` includes `pnpm.onlyBuiltDependencies` for:
- `@parcel/watcher`
- `@swc/core`
- `better-sqlite3`
- `sharp`
- `esbuild`

If you see "Ignored build scripts" warnings, run `pnpm approve-builds` (select all, approve).

## Run

```bash
pnpm dev              # development (localhost:3000)
pnpm build            # production build
pnpm start            # production serve
```

**Windows note**: `pnpm dev` uses bash syntax `${PORT:-3000}` which fails in PowerShell. Use `npx next dev --hostname 127.0.0.1 --port 3000` directly if needed.

## Tests

```bash
pnpm test             # unit tests (vitest)
pnpm test:e2e         # end-to-end (playwright)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test:all         # lint + typecheck + test + build + e2e
```

## Key Directories

```
src/app/              Next.js pages + API routes (App Router)
src/components/       UI panels and shared components
  panels/             Main dashboard panels (agent-squad, task-board, etc.)
  ui/                 Shared UI components (agent-avatar, button, etc.)
  chat/               Chat workspace components
src/lib/              Core logic, database, auth, utilities
  adapters/           Gateway adapter layer
public/               Static assets
  avatars/            Agent avatar images (PNG, served at /avatars/*.png)
.data/                SQLite database + runtime state (gitignored)
scripts/              Install, deploy, CLI, MCP server, TUI
docs/                 Documentation and guides
```

Path alias: `@/*` maps to `./src/*`

## Custom Agent Avatars

Agent avatars are stored in `public/avatars/` as PNG files.

The avatar mapping is in `src/components/ui/agent-avatar.tsx` in the `AVATAR_IMAGES` constant:

```typescript
const AVATAR_IMAGES: Record<string, string> = {
  'althea': '/avatars/althea.png',
  'stella-strategist': '/avatars/stella.png',
  'cassidy-counselor': '/avatars/cassidy.png',
  'terrapin-researcher': '/avatars/terrapin.png',
  'bertha-coordinator': '/avatars/bertha.png',
  'garcia-architect': '/avatars/garcia.png',
  'roadie-ops': '/avatars/roadie.png',
}
```

Keys are **OpenClaw agent IDs** (from `config.openclawId` in the API response, NOT the MC database integer ID).

The `avatars/` path is excluded from auth middleware in `src/proxy.ts` matcher so images serve without login.

To add a new avatar:
1. Drop a PNG in `public/avatars/<name>.png`
2. Add the mapping in `agent-avatar.tsx`

## Agent Fleet (7 agents)

| Agent | OpenClaw ID | Model | Role |
|---|---|---|---|
| Althea | `althea` | claude-opus-4-6 | Personal assistant |
| Stella | `stella-strategist` | claude-opus-4-6 | Work strategist |
| Cassidy | `cassidy-counselor` | claude-opus-4-6 | Counselor |
| Terrapin | `terrapin-researcher` | claude-sonnet-4-6 | Research analyst |
| Bertha | `bertha-coordinator` | claude-sonnet-4-6 | Task orchestrator |
| Garcia | `garcia-architect` | claude-sonnet-4-6 | Software architect |
| Roadie | `roadie-ops` | gpt-4.1-mini | Ops runner |

## Architecture Notes

### Auth Flow
- `src/proxy.ts` is the Next.js middleware — handles auth for all routes
- Auth bypass paths: `_next/static`, `_next/image`, `favicon.ico`, `brand/`, `avatars/`
- Login creates a session in SQLite; session cookie is `mc-session`
- Users are seeded from `AUTH_USER`/`AUTH_PASS` env vars on first DB creation

### Gateway Communication
- MC connects to OpenClaw gateway via WebSocket
- Gateway token is required (`OPENCLAW_GATEWAY_TOKEN` in `.env`)
- Agent data is synced from gateway on startup and periodically
- Agent IDs from gateway are stored as `config.openclawId` in MC's SQLite DB

### Database
- SQLite via better-sqlite3 at `.data/mission-control.db`
- Migrations run automatically on startup (`src/lib/migrations.ts`)
- Delete `.data/mission-control.db*` to reset (will re-seed from `.env`)

### BOM Warning
When editing config files with PowerShell's `ConvertTo-Json | Set-Content`, always write with `UTF8Encoding($false)` to avoid UTF-8 BOM. BOM breaks Node.js JSON.parse.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`)
- **No AI attribution**: Never add `Co-Authored-By` or similar trailers to commits
- **Package manager**: pnpm only (no npm/yarn)
- **Icons**: No icon libraries — use raw text/emoji in components
- **Standalone output**: `next.config.js` sets `output: 'standalone'`

## Agent Control Interfaces

### MCP Server (recommended for agents)
```bash
claude mcp add mission-control -- node scripts/mc-mcp-server.cjs
# Environment: MC_URL=http://127.0.0.1:3000 MC_API_KEY=<key>
```
35 tools: agents, tasks, sessions, memory, soul, comments, tokens, skills, cron, status.

### CLI
```bash
pnpm mc agents list --json
pnpm mc tasks queue --agent Aegis --max-capacity 2 --json
pnpm mc events watch --types agent,task
```

### REST API
OpenAPI spec: `openapi.json`. Interactive docs at `/docs` when running.

## Common Pitfalls

- **PowerShell dev script**: `pnpm dev` fails on Windows due to bash syntax. Use `npx next dev --hostname 127.0.0.1 --port 3000`.
- **Port 3000 in use**: Kill the existing process first: `netstat -ano | findstr ":3000"` then `Stop-Process -Id <PID>`.
- **better-sqlite3**: Native addon — needs rebuild when switching Node versions (`pnpm rebuild better-sqlite3`).
- **Nonce hydration mismatch**: CSP nonce error in dev mode is cosmetic (Next.js known issue). Does not affect functionality. Dismiss the overlay.
- **AUTH_PASS with `#`**: Quote it (`AUTH_PASS="my#pass"`) or use `AUTH_PASS_B64` (base64-encoded).
- **DB reset**: Delete `.data/mission-control.db*` files and restart to re-seed from `.env`.
- **Gateway offline in MC**: Ensure `OPENCLAW_GATEWAY_TOKEN` is set in `.env` and gateway is running on port 18789.
- **Lockfile warning**: Cosmetic — stray `pnpm-lock.yaml` in `C:\Users\swade`. Can be ignored or deleted.
