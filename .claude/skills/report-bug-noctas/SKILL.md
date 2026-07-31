---
name: report-bug-noctas
description: Triage a suspected bug in Noctas (isolate root cause across packages/shared, apps/server, apps/web), then file a GitHub issue via gh. Use when a bug is found or reported, something behaves unexpectedly, a test fails unexpectedly, or the user asks to report/file/triage/isolate a bug.
---

Bug reports here go through two phases: **isolate first, file second.** A
GitHub issue with "it's broken" and no repro is worse than useless in this
repo — file only once you know which package it's in and can show the
gap between expected and actual behavior. `gh` is already installed and
authenticated in this environment as `sinsinpurin` (repo:
`sinsinpurin/noctas`) — verify with `gh auth status` if a
session looks stale.

All paths below are relative to the repo root.

## Step 0 — rule out the known non-bugs first

Check these before spending time isolating — they look like bugs but aren't:

- **Dashboard shows stale/seed data or "LINK: OFFLINE" / "接続状態:
  DISCONNECTED" for the first ~2-3s after load.** The WebSocket just
  hasn't connected yet. Not a bug — see the `run-noctas`
  skill's Gotchas.
- **`アクティブ戦略を再読込しました (N件)` doesn't fire after a strategy
  edit.** Only `PUT /api/strategies/:id` (Save in the editor) triggers
  `reloadActiveStrategies()` — editing the canvas without saving is a
  no-op by design.
- **AI Judgment's reasoning mentions frozen price data (identical
  price/high/low for many ticks).** bitbank's public ticker can
  genuinely go flat — that part is upstream market-data staleness, not
  application logic.
- ~~AI Judgment's reasoning mentions zero 24h volume~~ — **this is NOT
  a non-bug, it's a real one.** `apps/server/src/ai/aiJudgment.ts`'s
  `refreshPair` hardcodes `vol24h: 0` in the `MarketSnapshot` it builds
  — it's never populated from the real ticker (`Ticker.vol` from
  `apps/server/src/bitbank/publicStream.ts` is tracked nowhere in
  `aiJudgment.ts`'s price-history cache). Every AI Judgment call sees
  "24時間出来高: 0" regardless of actual market activity. Confirmed and
  filed as a real issue this session — don't mistake it for market
  staleness again.
- **A leftover dev server eating the port.** `EADDRINUSE` on
  `npm run dev:server` almost always means an orphaned `tsx watch`
  process from an earlier session, not a real startup bug — see
  Troubleshooting below before filing anything about "server won't
  start."

If none of these explain it, it's a real candidate — move to isolation.

## Step 1 — isolate: find which layer, then prove it

Bugs here live in one of three places; the isolation technique differs:

- **`packages/shared` (evaluator/indicators logic)**: write a failing
  Vitest test first. This *is* the isolation — `evaluator.test.ts` /
  `indicators.test.ts` already show the pattern (minimal graph, exact
  expected `{ current, previous }`). A red test is the single best piece
  of evidence you can put in an issue.
- **`apps/server` (risk manager, circuit breaker, pricing, routes)**:
  same idea — mock `../db/prisma` the way
  `apps/server/src/trading/riskManager.test.ts` /
  `circuitBreaker.test.ts` do, and write the smallest test that
  reproduces the wrong behavior. If it's specifically about real
  Prisma/SQLite semantics a mock can't capture, fall back to a
  throwaway `scripts/verify-<bug>.ts` against the real dev DB (pattern:
  `apps/server/scripts/verify-circuit-breaker.ts` — creates its own
  rows, asserts, deletes them again).
- **`apps/web` (UI-visible behavior)**: reproduce with the
  `run-noctas` skill's Playwright driver — `nav`, click
  through the exact repro steps, `screenshot`, then `console --errors`.
  A screenshot + a clean console (or a console error that IS the bug)
  is your evidence. Don't skip the 2-3s WS-connect wait or you'll
  "reproduce" Step 0's non-bug instead.

For anything touching live state (bot signals, positions, AI usage),
also pull the actual DB/log evidence, the way this session diagnosed
the fee-erosion issue:

```bash
# tail the running server's log for the relevant window
tail -n 100 /tmp/server-*.log   # or wherever you redirected `npm run dev:server` output

# ad-hoc DB inspection: copy a throwaway script into apps/server/scripts/,
# run with `npx tsx scripts/_tmp-<name>.mjs` from apps/server/, then delete it
```

**If it looks like a regression**, `git log -p --follow -- <file>` or
`git bisect` against the specific file — this repo's git history is
detailed enough (see the `develop-noctas` skill's
Design-decision history) that the commit that introduced a behavior is
usually findable in a few minutes.

## Step 2 — check it's not already known

```bash
gh issue list --state all --search "<keyword>"
```

No issue templates or labels beyond GitHub's defaults exist in this repo
(`bug`, `enhancement`, `documentation`, `question`, ...) — use `bug`
unless it's clearly something else.

## Step 3 — draft the issue (Japanese, matches commit-message style)

This repo's commits are plain descriptive Japanese sentences, not
Conventional Commits — match that for the issue title too. Structure:

```
## 概要
<1-2文で何が起きているか>

## 再現手順
1. <厳密なコマンド or 操作>
2. ...

## 期待する動作
<...>

## 実際の動作
<エラーメッセージ / ログ抜粋 / スクリーンショットの説明を具体的に>

## 影響範囲
<packages/shared | apps/server | apps/web> の `<path/to/file.ts>` 付近
<関連しそうな直近のコミット/PRがあれば `git log` からsha付きで>

## 環境
Node <version> / <OS> / 関連するconfig値(秘密情報は書かない — Gotchas参照)
```

If Step 1 produced a failing test, paste the test file's relevant
`describe`/`it` block and the actual vs. expected assertion output —
that's stronger evidence than prose.

## Step 4 — confirm with the user, then file

**Filing a GitHub issue is a visible-to-others action — show the drafted
title + body and get a go-ahead before running `gh issue create`,** the
same way this project's PRs get confirmed before pushing. Don't auto-file
just because a bug was found.

```bash
gh issue create --title "<日本語タイトル>" --label bug --body "$(cat <<'EOF'
<drafted body from Step 3>
EOF
)"
```

For multiple labels: `--label bug --label "help wanted"` etc.

## Gotchas

- **Never paste raw `.env` contents, full server logs that might
  contain a stack trace with an embedded API key, or the actual
  `ANTHROPIC_API_KEY` into an issue body.** `apps/server/.env` holds a
  live key; issues on this repo are visible to anyone with repo access.
  Redact before pasting log excerpts.
- **`gh issue create` cannot attach a local screenshot file directly** —
  there's no CLI flag for image upload into the issue body. Either
  reference the screenshot's path and describe what it shows in text,
  or note in the issue that a screenshot needs to be dragged into the
  GitHub web UI afterward. Don't silently skip visual evidence for a UI
  bug just because of this limitation — say so explicitly.
- **A bug report without a failing test or a screenshot is a downgrade
  from what this repo can produce.** Given Vitest and the Playwright
  driver are both already set up, "I couldn't reproduce it in an
  automated way" is itself worth stating in the issue rather than
  omitting.
