---
name: develop-bitbank-ai-trader
description: Playbook for adding a feature, changing risk/AI logic, or reviewing a change in bitbank-ai-trader. Use when asked to add a feature, add an env var, add a Bot Blueprint node type, change the Prisma schema, or explain why the codebase evolved a certain way. Complements run-bitbank-ai-trader (which builds/launches/screenshots the app).
---

This is a from-scratch reading of this repo's own `git log` — every rule
below is backed by a specific commit or file, cited inline. It captures
the shape a change takes here so a new feature lands consistently with
the existing ones, not a generic "how to write React/Fastify" guide.

All paths below are relative to the repo root.

## The shape every real feature takes

This repo has no test suite and no formal ADRs — the git history *is*
the design record, and every non-trivial commit touches the same
layers in the same order (verified against `30b76e3`, `2352aa1`,
`7b029a4`, `cb039e4`):

1. **`packages/shared/src/index.ts`** (+ `evaluator.ts`/`indicators.ts`
   if it's Bot Blueprint logic) — add the TypeScript types/interfaces
   first. Both server and web import from `@bitbank-ai-trader/shared`;
   this is the contract between them.
2. **`apps/server/prisma/schema.prisma`** — if the feature needs
   persistence, add fields/models here, then generate a migration (see
   Prisma workflow below). Every schema change in this repo's history
   has its own migration folder — none were hand-merged into `init`.
3. **`apps/server/src/<domain>/`** — route handlers in `routes.ts`,
   business logic in an engine/manager file (`botEngine.ts`,
   `riskManager.ts`, `circuitBreaker.ts`, `paperTradingEngine.ts`).
   Domain folders: `ai/`, `bitbank/`, `pnl/`, `settings/`, `signals/`,
   `strategy/`, `trading/`, `ws/`.
4. **`apps/server/src/index.ts`** — wire the new route module in with
   `await app.register(xRoutes)`, and if the feature reacts to live
   ticks, hook it into the `subscribeTickers(...)` callback alongside
   `checkExits`/`onTick`.
5. **`apps/web/src/lib/<domain>Api.ts`** — thin `fetch` wrapper
   functions for the new endpoint(s) (see `settingsApi.ts`,
   `strategyApi.ts`, `pnlApi.ts` for the pattern: one function per
   endpoint, typed with the shared types from step 1).
6. **`apps/web/src/components/<domain>/*Panel.tsx`** — a new panel
   component, domain folder matching the server-side one
   (`dashboard/`, `pnl/`, `settings/`, `strategy/`).
7. **`apps/web/src/app/<route>/page.tsx`** — wire the panel into its
   page.
8. **`.env.example`** — if you added an env var, document it here with
   a one-line Japanese comment, matching the grouping style in
   `apps/server/src/config.ts` (`ai`, `risk`, `fees`, `bot`, `candles`
   namespaces). Every env var in `config.ts` has a matching entry in
   `.env.example` — check both stay in sync.
9. **`apps/web/src/app/docs/page.tsx`** — the in-app Docs page is the
   detailed, per-feature changelog users actually read (confirmed:
   `cb039e4` added a `<SubHeading>ペーパートレードのリセット(Settings)</SubHeading>`
   block here **without** touching README.md). Add a new `SubHeading`
   + `P`/`Muted` block for the feature. Node types in the node palette
   don't need manual docs — the reference table renders straight from
   `apps/web/src/components/strategy/nodeCatalog.ts`.
10. **`README.md`** — only touched for repo-level/structural changes
    (new top-level env var *category*, new npm script, scope-of-project
    changes). Don't assume every feature needs a README edit — check
    `apps/web/src/app/docs/page.tsx` first, that's the one that's
    reliably kept current.

Not every feature touches all 10 — a pure UI tweak might only hit
steps 6-7. But when a feature is stateful or cross-cutting, expect
the full chain. `2352aa1` (risk settings + circuit breaker + per-
strategy PnL) touched 24 files spanning all ten steps in one commit.

## Prisma workflow

```bash
cd apps/server
npx prisma migrate dev --name <snake_case_description>   # generates prisma/migrations/<timestamp>_<name>/migration.sql
```

Migration folder names in this repo: `add_token_usage_tracking`,
`add_trade_reason`, `add_strategy`, `add_settings_and_generation_log`,
`add_risk_control`, `add_trade_fees` — short, additive, one concern per
migration. Never hand-edit an already-applied migration; add a new one.

## Verifying a change

There's no test framework (`grep '"test"' apps/*/package.json` finds
nothing). Two verification paths exist, pick based on what you changed:

- **Stateful backend logic** (circuit breaker, risk manager, paper
  trading engine): write a one-off `apps/server/scripts/verify-<feature>.ts`
  that imports the real module, runs against the real dev DB, asserts
  with `throw new Error(...)` on failure, and **cleans up its own test
  rows in a `finally`-equivalent block before exiting** — see
  `apps/server/scripts/verify-circuit-breaker.ts` for the exact shape
  (3 scenarios, each asserted, then deletes what it created). Run with
  `npx tsx scripts/verify-<feature>.ts` from `apps/server/`.
- **UI-visible change**: use the `run-bitbank-ai-trader` skill's driver
  to launch the app and screenshot the actual flow — don't trust
  "it compiles." Remember the dashboard shows seed dummy data until
  the WebSocket connects (~2-3s) — that skill's Gotchas section covers
  this.

Also run before committing anything web-side:

```bash
cd apps/web && npx eslint
```

## Conventions worth matching

- **No validation library.** Routes hand-check `typeof` / `undefined`
  and return `reply.status(400).send({ error: "日本語のメッセージ" })`
  (see `settings/routes.ts`). Error messages are Japanese, user-facing,
  specific about which field is wrong.
- **Destructive/irreversible actions require an explicit confirm
  string**, not just a boolean flag — `POST /api/settings/reset-paper-trading`
  requires `{ confirm: "RESET" }` in the body (`settings/routes.ts:209`).
  Follow this for any new endpoint that deletes or resets state.
- **Real-time push after a state change**: call
  `broadcast({ type: "<event>", payload: {...} })` from `ws/relay.ts`
  right after the mutation, so connected dashboards update without a
  refetch (see the `paper_trading_reset` event after the reset above).
- **Config is one object, grouped by domain, defaults inline**:
  `apps/server/src/config.ts` reads every env var exactly once into
  `config.ai.*` / `config.risk.*` / `config.fees.*` / etc. with a
  Japanese comment above each field explaining *why* that default.
  Add new env vars there, not scattered `process.env` reads elsewhere.
- **Commit messages are plain descriptive Japanese sentences**, not
  Conventional Commits — sometimes a numbered list when one commit
  bundles several related changes (`2352aa1`: "1. 戦略ごとの... 2.
  サーキットブレーカー 3. 戦略別損益トラッキング"). Match this style,
  don't introduce `feat:`/`fix:` prefixes.
- **Shared evaluation logic lives in `packages/shared`, not
  duplicated.** The Bot Blueprint graph evaluator (`evaluator.ts`) is
  imported by both the server's live bot engine and the web editor's
  live preview — so a strategy previews exactly what it will do when
  deployed. If you're adding a node type, it goes in one place
  (`nodeCatalog.ts` + `evaluator.ts`), not reimplemented per side.

## Design-decision history (why things are the shape they are)

- **`fce4b9b` Initial scaffold** — paper trading only, from day one.
  There is no live-order code path to accidentally wire up; don't add
  one without an explicit ask.
- **`7b029a4` Bot Blueprint introduced** — trading moved from "AI
  decides every time" to a node-graph strategy engine (SMA/RSI/cross/
  logic nodes) that the user visually assembles. This is the point the
  domain folders (`strategy/`, `components/strategy/`) were established.
- **`1f089be` PnL dashboard + AI strategy auto-generation + Settings
  (AI loop on/off + usage)** — cost/usage visibility became a
  first-class feature at this point, not an afterthought; this is why
  `config.ai.dailyBudgetJpy` and the usage-summary machinery in
  `settings/routes.ts` exist.
- **`2352aa1` Per-strategy risk settings + circuit breaker + per-
  strategy PnL tracking** — introduced the "risk config can be
  overridden per-strategy, falls back to global `config.risk`" pattern
  (see the nullable `positionSizeJpy`/`stopLossPct`/etc. on the
  `Strategy` Prisma model) and the circuit breaker as a hard stop that
  never calls Claude (no token cost) — separate from AI judgment,
  which does. Keep that separation: safety-critical halts should not
  depend on an LLM call succeeding.
- **`0c190b1` Fee/slippage simulation added** — pnl became "close to
  real" rather than idealized; `TRADE_FEE_PCT`/`TRADE_SLIPPAGE_PCT`
  were added specifically so paper-trading pnl isn't misleadingly
  optimistic. Any new order-execution path must deduct fee/slippage the
  same way `paperTradingEngine.ts` does, or PnL numbers become
  inconsistent across code paths.
- **`cb039e4` Paper trading reset** — added *after* real trade history
  had accumulated during development, i.e. once the DB gets messy from
  manual testing you need a clean-slate button. This is why the
  confirm-string pattern above exists: a fat-fingered reset during a
  demo would wipe real accumulated pnl history.
- **`30b76e3` AI Decision Log deprecated, folded into Bot Blueprint's
  "AI Judgment" node** (`apps/server/src/ai/decisionLoop.ts` deleted,
  `apps/server/src/ai/aiJudgment.ts` added) — AI judgment used to be a
  separate always-on loop with its own log/panel (`AiLogPanel.tsx`,
  now deleted); it was collapsed into being *one node type* among
  others in the same strategy graph, so AI-driven and rule-driven
  entries/exits compose through the same engine instead of two parallel
  systems. If you're tempted to add a second "special" always-on
  decision loop outside the Bot Blueprint graph, that's the pattern
  this commit deliberately moved away from — make it a node instead.
- **`bb42b64` Chart split into its own tab** — the price chart used to
  live inline on the dashboard; it moved to `apps/web/src/app/chart/page.tsx`
  once it needed its own zoom-reset state that fought with the
  dashboard's own layout. If a dashboard panel starts accumulating
  view-local state that doesn't belong on the main overview, that's the
  cue to split it into its own route, same as this commit did.

## Gotchas

- **`apps/web` runs Next.js 16** — `apps/web/AGENTS.md` warns this is
  newer than most training data with breaking API changes; check
  `node_modules/next/dist/docs/` before assuming an older Next.js
  convention applies.
- **Two "AI" model configs, different purposes**: `config.ai.model`
  (cheap, default `claude-haiku-4-5`, called constantly by the AI
  Judgment node) vs `config.ai.strategyModel` (default
  `claude-opus-4-8`, called once per user-triggered strategy
  generation). Don't conflate them — swapping the cheap one for a
  pricier default silently blows through `AI_DAILY_BUDGET_JPY` much
  faster since it's called far more often.
- **Root `.env` holds a live `ANTHROPIC_API_KEY`.** It's gitignored
  and has never been committed — keep it that way; never echo its
  value into a script, log, or committed doc.
