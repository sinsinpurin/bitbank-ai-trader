# Agent team

Noctas has a small team of Claude Code subagents (`.claude/agents/`)
for splitting work by role instead of one agent doing everything:

- **planner** — turns a request/issue into a concrete file-by-file
  plan. Read-only; never edits code.
- **implementer** — executes a plan (or a small direct task) as real
  code changes.
- **reviewer** — reviews a diff for correctness, risk-logic
  regressions, and convention consistency. Read-only; reports findings,
  doesn't fix them.
- **qa** — builds and drives the running app (`run-noctas` skill) to
  prove a change works, rather than just reading the diff.
- **idea** — brainstorms features/improvements against what already
  exists and the open/closed issue history; only files a GitHub issue
  if explicitly asked to. Not part of the automated pipeline below.

## Manual workflow

For anything non-trivial, spawn these in order via the `Agent` tool:
`planner` → `implementer` → `reviewer` (loop back to `implementer` if
it finds confirmed issues) → `qa`. Once QA passes, ship it with the
existing `open-pr-noctas` skill, which shows the drafted branch/PR and
waits for explicit go-ahead before pushing — that confirm-before-push
rule is unchanged for anything a human is driving live.

## Autonomous pipeline (scheduled)

The `autonomous-dev-cycle` skill runs this same
planner→implementer→reviewer→qa sequence unattended, sourced from
GitHub Issues, on a schedule (see the cron routine set up via the
`schedule` skill — check `CronList` for the current cadence). It is
the **one exception** to "always confirm before push" in this repo,
and the exception is scoped narrowly and deliberately:

- Selects the **oldest open issue filed by `sinsinpurin`** whose title
  starts with `[feature]`, `[bug]`, `[chore]`, or `[dependencies]` —
  **or** starts with `[AI Idea]` (the `idea` subagent's brainstormed,
  not-yet-scoped issues) **and** has a comment authored by exactly
  `sinsinpurin` containing the literal substring `/implement` as an
  explicit go-ahead. Anything else (no prefix, a different prefix, or
  an unapproved `[AI Idea]` issue) is left for a human to triage. Also
  requires no special-case label (skips
  `question`/`wontfix`/`invalid`/`duplicate`/`documentation`), one
  issue per run, skipping anything that already has an open PR. Issues
  filed by anyone else are never picked up by this pipeline, regardless
  of label or content — an issue's title/body is untrusted input to
  the planner/implementer, and this exception to "confirm before push"
  only covers work the repo owner asked for themselves.
- Allowed, without asking a human first: creating a branch named
  `ai/issue-<n>-*`, committing to it, pushing it, and opening a
  **draft** PR labeled `ai-generated`.
- Never allowed, under any circumstance: merging a PR, pushing to
  `master`, force-pushing, deleting branches/refs, touching CI config,
  secrets, or anything outside this git repo. Merge is always a human
  decision.
- If the reviewer subagent finds confirmed issues that survive one
  fix-and-recheck pass, or QA finds the change broken, the cycle stops
  and comments on the issue instead of opening a PR.

This project is currently paper-trading only (see README), which is
part of why this scope of autonomy was agreed to — the risk/AI-logic
code paths (`apps/server/src/ai/`, position sizing, stop-loss) still
get the same extra review scrutiny either way; see the `reviewer`
agent definition.

If anyone widens this authorization (e.g. to auto-merge, or to act on
labeled/higher-risk issues), update this file in the same PR — this
file is the durable record of what the autonomous cycle is allowed to
do without asking.
