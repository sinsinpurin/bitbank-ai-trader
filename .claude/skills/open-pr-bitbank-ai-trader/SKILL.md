---
name: open-pr-bitbank-ai-trader
description: Turn the current working-tree diff in bitbank-ai-trader into a branch + commit, then show the drafted PR title/body to the user and only push + open the PR once they agree. Use when asked to create a branch, commit and push, open/create a pull request, or "ship this."
---

The hard rule this skill exists to enforce: **branching and committing
are local and reversible, so do them freely — but never push or run
`gh pr create` until the user has seen the exact PR title/body and said
go.** This mirrors how PRs actually got made in this repo's history
(#4, #5, #6 in this session) — draft first, confirm, then push.

`gh` is expected to already be installed and authenticated as
`sinsinpurin` for `sinsinpurin/bitbank-ai-trader` (verify with
`gh auth status`; if it's not there, `winget install --id GitHub.cli`
then `gh auth login --web` — see this session's history for the exact
flow if needed).

All paths below are relative to the repo root.

## Step 1 — confirm there's something to ship

```bash
git status --short
git branch --show-current
```

If `git status` is clean, there's nothing to do — say so, don't invent
a branch. If the diff is already sitting on an open PR's branch (check
`gh pr list --state open`), ask whether this is meant to extend that PR
or become a new one, rather than assuming.

## Step 2 — review the diff before staging anything

```bash
git diff            # unstaged
git diff --cached    # already-staged, if any
```

Look specifically for:
- **Secrets.** `apps/server/.env` holds a live `ANTHROPIC_API_KEY` —
  it's gitignored, confirm it's not showing up in the diff at all
  (`git status` should never list `.env` as modified/untracked-tracked).
- **Generated/local-only files** that shouldn't ship: `coverage/`,
  `.claude/settings.local.json` — both are already gitignored as of
  this session; if either shows up as trackable, that's a red flag
  something changed the `.gitignore` scope, not something to commit.
- **Unrelated changes** bundled in by accident (e.g. a stray edit from
  an earlier exploration). Split into a separate commit/PR rather than
  shipping everything just because it's in the working tree.

## Step 3 — verify before committing

Run whatever applies to what changed — don't skip this to save time:

```bash
npm run build                          # packages/shared -> server -> web
cd apps/web && npx eslint; cd ../..     # web lint
npm run test                            # vitest, all workspaces (pretest builds shared)
```

If something fails, fix it (or tell the user it's failing and ask how
to proceed) — don't draft a PR for code that doesn't build/test clean.

## Step 4 — branch off the latest master

```bash
git fetch origin
git log origin/master --oneline -3   # sanity check: did an earlier PR merge since you last synced?
```

If the diff was produced while sitting on top of an older commit and
`origin/master` has moved (this happened in this session — PR #5 merged
mid-task), don't just branch from where you are:

```bash
git stash -u -m "wip"
git checkout master && git pull origin master
git checkout -b feature/<kebab-case-description>
git stash pop
```

If nothing has moved, a plain `git checkout -b feature/<kebab-case-description>`
from the current branch is fine. Branch naming in this repo:
`feature/<kebab-case-description>` (e.g. `feature/pnl-ai-review-and-strategy-tuning`,
`feature/vitest-testing`) — short, descriptive, no ticket-number prefix.

## Step 5 — stage explicitly and commit

```bash
git add <file1> <file2> ...   # never `git add -A` / `git add .` — name the files
```

Commit message style in this repo: **plain descriptive Japanese
sentences, not Conventional Commits** — sometimes a numbered list for a
commit bundling several related changes (see `git log --oneline`).
Always end with:

```
git commit -m "$(cat <<'EOF'
<日本語での説明>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Step 6 — draft the PR, then STOP and show it

Draft (don't run yet):

```
Title: <日本語、70文字以内>

## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [x] <what you actually ran and verified — build/lint/test/screenshot,
      matching whatever Step 3 covered>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Print this exact title + body to the user (not a paraphrase — the literal
text you're about to send to GitHub) and ask them to confirm or edit it.
**Do not run `git push` or `gh pr create` in the same turn as drafting.**
If they ask for changes, revise and show again. Only proceed to Step 7
on an explicit go-ahead ("progress してください" / "お願いします" /
similar affirmative — not silence, not a topic change).

## Step 7 — push and open the PR (only after agreement)

```bash
git push -u origin feature/<kebab-case-description>
gh pr create --base master --head feature/<kebab-case-description> \
  --title "<confirmed title>" \
  --body "$(cat <<'EOF'
<confirmed body>
EOF
)"
```

Report the returned PR URL back to the user. Don't merge it yourself —
merging is the user's call (they've done it manually via the GitHub UI
every time so far in this repo).

## Gotchas

- **A branch/commit is not the PR.** Steps 1-5 need no permission
  beyond what the user already granted for local git work; Steps 6-7 are
  the actual gate. Don't collapse them into one action.
- **Re-check `origin/master` right before pushing, not just before
  branching**, if any real time passed (running tests, going back and
  forth on the draft) — the base can move mid-task in an active repo.
- **`npm run build`/`test` regenerate `packages/shared/dist/` and
  `coverage/`** — both gitignored, but double-check `git status` after
  running them doesn't suddenly show new trackable files (would mean a
  `.gitignore` regression).
- **If the user only asked to "prepare" or "draft" a PR**, stop at Step
  6 — showing the draft — and wait. Don't infer that drafting implies
  permission to push.
