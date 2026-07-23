# ux-audit

A QA / heuristic-audit CLI in two stages:

- **Phase 1 — `run`**: drives a headless browser through a scripted flow and
  captures the full **state of the page after every step** (no AI).
- **Phase 2 — `analyze`**: feeds those captured artifacts to a multimodal LLM
  and produces a structured **Nielsen + WCAG 2.1 audit report**.

## What it captures (per step)

1. **Screenshot** of the viewport — `*.png`
2. **Accessibility tree** — Playwright native `ariaSnapshot` (YAML), `*.a11y.yaml`
3. **Cleaned DOM** — full HTML with `<script>`, `<style>`, `<link>` and comments
   removed, `*.dom.html`

All artifacts land in `./.ux-audit-reports/<timestamp>_<target>/`, alongside a
`session-manifest.json` (a JSON array of every successfully executed step with
relative paths to its three artifacts).

## Project layout

```
src/
  index.ts            # bin entrypoint (#!/usr/bin/env node)
  cli.ts              # commander program + `run` command
  logger.ts           # tiny ANSI logger
  config/
    schema.ts         # Zod schema (discriminated-union flow)
    loader.ts         # YAML read + strict validation
  engine/
    browser.ts        # AuditEngine — Playwright orchestration loop
    actions.ts        # goto / click / type / wait executors
  capture/
    artifacts.ts      # screenshot + a11y + DOM capture
    domCleaner.ts     # in-page DOM cleaning (runs in Chromium)
  output/
    paths.ts          # timestamped output dir + target slug
    manifest.ts       # session-manifest.json writer
  evaluator/          # Phase 2 — LLM analysis
    manifest.ts       # read + validate a Phase 1 manifest (Zod)
    client.ts         # Anthropic API client (reads AI_API_KEY)
    payload.ts        # per-step multimodal content (image + DOM + ARIA)
    auditSchema.ts    # Zod schema for the forced structured output
    prompt.ts         # frozen auditor system prompt (Nielsen + WCAG)
    evaluator.ts      # Evaluator (api engine) + shared runAnalysis loop
    agentEngine.ts    # AgentSdkEvaluator (agent-sdk engine — uses your plan)
    report.ts         # audit-report.json writer + console summary
examples/
  my-flow.yaml        # sample flow
```

## Config schema

```yaml
target_url: "https://example.com"   # initial navigation + folder slug
viewport: { width: 1366, height: 768 }
flow:
  - { action: goto,  url: "https://example.com/login" }
  - { action: type,  selector: "#user", text: "alice" }
  - { action: click, selector: "#submit" }
  - { action: wait,  ms: 1000 }
```

## Build & run

```bash
# 1. Install dependencies (postinstall downloads the Chromium binary)
npm install

# If the browser was not fetched automatically:
npx playwright install chromium

# 2. Compile TypeScript -> dist/
npm run build

# 3. Run an audit
node dist/index.js run --config examples/my-flow.yaml
#   or, after `npm link` / when installed:
ux-audit run --config examples/my-flow.yaml
#   or via npx (published/linked):
npx ux-audit run --config examples/my-flow.yaml
```

### Dev mode (no build step, via tsx)

```bash
npm run dev -- run --config examples/my-flow.yaml
```

## Resilience (Phase 1)

- Selector actions (`click`, `type`) have a **5s** timeout; navigation has 30s.
- If a step fails (selector not found / timeout), the run **stops gracefully**,
  the manifest is written for all steps completed so far, a clear error is
  printed, and the process exits with **code 1**.

## Phase 2 — `analyze` (LLM audit)

Reads a session's `session-manifest.json`, and for **each step** sends the
screenshot (base64), the cleaned DOM, and the ARIA tree to a multimodal LLM,
forcing a structured audit response.

- **Model:** `claude-sonnet-4-6` by default, with adaptive thinking (`effort: high`).
  Override per run with `--model <id>` (e.g. `--model claude-opus-4-8`).
- **Structured output:** the response is forced to a JSON schema via
  `messages.parse()` + `zodOutputFormat` ([auditSchema.ts](src/evaluator/auditSchema.ts))
  and validated client-side.
- **Scope:** the system prompt restricts findings to **Nielsen's 10 heuristics**
  and **WCAG 2.1**, and explicitly ignores visual aesthetics.
- **Prompt caching:** the frozen system prompt carries a cache breakpoint, so it
  is reused across every step of a session.

### Two engines (`--engine`)

| `--engine` | How it calls Claude | Cost |
|---|---|---|
| `agent-sdk` (default) | `@anthropic-ai/claude-agent-sdk` → your logged-in Claude Code | **No money** — uses your Claude plan |
| `api` | `@anthropic-ai/sdk` → Anthropic API | **Pay-per-token** (needs `AI_API_KEY`) |

```bash
# Default — uses your Claude plan (agent-sdk + Sonnet 4.6). No API key, no $.
# Requires being logged into Claude Code; do NOT set ANTHROPIC_API_KEY.
node dist/index.js analyze --report-dir ./.ux-audit-reports/<...>

# Deeper audit on the plan (Opus, more nuanced — costs more of the weekly quota):
node dist/index.js analyze --report-dir ./.ux-audit-reports/<...> --model claude-opus-4-8

# Pay-per-token via the API instead (does not touch your plan quota):
export AI_API_KEY="sk-ant-..."        # PowerShell: $env:AI_API_KEY="sk-ant-..."
node dist/index.js analyze --report-dir ./.ux-audit-reports/<...> --engine api
```

> **Which quota does `agent-sdk` use?** It spawns your logged-in Claude Code, so
> usage is billed to your **Claude plan, not pay-per-token**. Important nuance on
> *which* plan bucket:
> - **Until 2026-06-14:** Agent SDK usage shares the **same Session (5h) + Weekly
>   (7-day)** limits as interactive Claude Code — i.e. it *does* consume the
>   percentages in your Account & Usage panel.
> - **From 2026-06-15:** it moves to a **separate monthly Agent SDK credit**
>   (Max5x ≈ $100 / Max20x ≈ $200) and stops counting against Session/Weekly.
> - **Sonnet 4.6** (the default model) draws from the separate **"Weekly Sonnet"**
>   allowance, sparing the general weekly limit. Opus counts against the general
>   "Weekly (7-day)" bucket.

Output: `audit-report.json` in the same report directory. Per analyzed step it
holds the strict format:

```json
{
  "step_name": "step_03_click",
  "violations": [
    {
      "heuristic": "Error prevention",
      "severity": 3,
      "issue_description": "Text input has no associated <label> (WCAG 2.1 SC 1.3.1).",
      "element_selector": "#name",
      "suggested_code_fix": "<label for=\"name\">Name</label><input id=\"name\">"
    }
  ]
}
```

`severity` is the Nielsen 1–4 scale (1 cosmetic … 4 catastrophe);
`element_selector` is `null` when the issue is page-wide.

### Resilience (Phase 2)

- Per-step LLM failures (API error, refusal, no structured output) are caught
  and recorded; analysis **continues** with the remaining steps.
- The report is always written. If any step failed, the process exits with
  **code 1**; otherwise **0**.

## Phase 3 — `report` (HTML dashboard)

Turns the audit JSON into a **single-file interactive HTML dashboard**.

```bash
node dist/index.js report --report-dir ./.ux-audit-reports/<...>
```

Writes `dashboard.html` into the report directory. Open it in a browser.

- **Self-contained:** the data is **baked in** to a `<script>const auditData = …</script>`
  — there is **no `fetch`/XHR**. Screenshots load via **relative** `<img src="step_NN_*.png">`
  from the same folder. (Tailwind CSS is loaded via CDN per spec, so styling needs internet.)
- **Data source:** it merges `session-manifest.json` (screenshot paths) with the audit
  report — read **strictly** from `audit-report.json` (no fallbacks). If that file is
  missing, the command errors clearly and exits **1**.
- **UI:** header with counters (steps / analyzed / violations) and per-severity chips;
  a sidebar of `step_name`s (badge = worst severity); a main pane with the resized
  screenshot and one card per violation (heuristic, color-coded severity badge —
  **Crítico = red**, description, selector, and a `<pre><code>` `suggested_code_fix`).
- **Security:** every `<` in the embedded data is escaped to its `<` unicode
  form, so a `</script>` inside any audit text can't break out of the data block;
  the client builds the DOM with `textContent` (no `innerHTML` injection).

## `pipeline` — run all three phases unattended

Orchestrates capture → analyze → dashboard from a single config, with no manual steps:

```bash
node dist/index.js pipeline --config examples/my-flow.yaml
#   --out <dir>        root output directory (default: .ux-audit-reports)
#   --engine <engine>  agent-sdk (default, Claude plan) | api (AI_API_KEY)
#   --model <id>       default: claude-sonnet-4-6
```

It runs **Phase 1 → Phase 2 → Phase 3** in order against one freshly-created report
directory. **Fail-fast:** if Playwright fails in capture, or any step errors/times out
in analysis, the pipeline **aborts immediately with exit 1** and does not run the next
phase on broken data (the partial manifest/report are left behind for inspection).

## Service (async API + worker)

Besides the CLI, the repo ships a **SaaS service**: an HTTP API enqueues audit
jobs onto a **BullMQ/Redis** queue; a **worker** runs the same capture+analyze
pipeline, uploads screenshots to **S3/MinIO** (private bucket, served via
short-lived presigned URLs) and persists the report to **Postgres via Prisma**.
Auth is **Clerk**; the Clerk webhook is verified with **svix**.

```
POST /api/audit         # enqueue a job (Clerk auth) -> 202 { job_id, status }
GET  /api/audit         # list the caller's audit history (Clerk auth)
GET  /api/audit/:id     # job status / report (Clerk auth; presigned screenshots)
POST /api/webhook/clerk # Clerk webhook (svix-signed; purges data on user.deleted)
GET  /health            # liveness + Redis readiness
```

### Run it

```bash
cp .env.example .env          # fill in DATABASE_URL, CLERK_*, S3_*, etc.
docker compose up             # postgres + redis + minio + api + worker
# or locally, against your own infra:
npm run serve                 # API   (tsx src/service/server.ts)
npm run worker                # worker (tsx src/service/worker.ts)
```

### Required env

Validated at boot (fail-fast). See [`.env.example`](.env.example) for the full list.

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api, worker | Postgres (Prisma) |
| `REDIS_URL` | api, worker | optional; defaults to `redis://127.0.0.1:6379` |
| `CLERK_SECRET_KEY` | api | required for auth |
| `CLERK_WEBHOOK_SECRET` | api | required only to use the webhook |
| `S3_ENDPOINT` / `S3_BUCKET_NAME` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | worker | private bucket |
| `S3_PUBLIC_ENDPOINT` | api | host-reachable endpoint for signing screenshot URLs (MinIO split-horizon) |
| `AUDIT_ENGINE` / `AUDIT_MODEL` / `AI_API_KEY` | worker | `api` engine needs `AI_API_KEY` |
| `CORS_ORIGIN` | api | comma-separated allowlist; unset = no cross-origin |
| `LOG_JSON` | all | `1` forces JSON logs (auto-on when `NODE_ENV=production`) |

### Tests & CI

```bash
npm run typecheck    # tsc --noEmit
npm test             # node:test via tsx (src/**/*.test.ts)
npm run build        # tsc -> dist/
```

CI (`.github/workflows/ci.yml`) runs typecheck → test → build on every push/PR.
