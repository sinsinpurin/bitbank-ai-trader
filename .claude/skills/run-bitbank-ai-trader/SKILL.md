---
name: run-bitbank-ai-trader
description: Build, run, and drive bitbank-ai-trader (Fastify/WebSocket/Prisma backend + Next.js cyberpunk dashboard). Use when asked to start the app, run the dev servers, take a screenshot of the dashboard/Bot Blueprint, or verify a change works in the running app.
---

bitbank-ai-trader is one product made of two processes that must run
together: `apps/server` (Fastify + WebSocket + Prisma/SQLite + Claude
API, port 4000) and `apps/web` (Next.js dashboard, port 3000). The
dashboard is a WebSocket client — it renders seeded dummy data until
the socket connects (2-3s), so "it loaded" is not enough proof; drive
it with the Playwright script at
`.claude/skills/run-bitbank-ai-trader/driver.mjs` and confirm
`STREAM CONNECTED` / `LINK : ONLINE` before trusting a screenshot.

All paths below are relative to the repo root.

## Prerequisites

Node.js + npm (this repo was verified on Windows with Git Bash; no
OS-native packages needed — everything is Node/npm). One extra dev
dependency for the driver, not part of the app itself:

```bash
npm install -D playwright
npx playwright install chromium
```

## Setup

```bash
npm install
cp .env.example apps/server/.env          # then fill in ANTHROPIC_API_KEY at minimum
cp apps/web/.env.local.example apps/web/.env.local
npm run build --workspace=packages/shared
cd apps/server && npx prisma generate && npx prisma migrate dev --name init
```

`npx prisma migrate status` (run from `apps/server`) tells you if the
SQLite DB (`apps/server/prisma/dev.db`) is already migrated — on a repo
that's been run before, migrations are already applied and `migrate dev`
is a no-op check, not a required step.

Without a real `ANTHROPIC_API_KEY` the AI Judgment node and
`/api/strategies/generate` won't work, but the rest of the dashboard
(paper trading, bot strategies, PnL) runs fine.

## Build

```bash
npm run build   # shared -> server (tsc) -> web (next build), in that order
```

## Run (agent path)

Start both processes in the background, wait for the ports, then drive
the dashboard with the Playwright script (no `chromium-cli` in this
environment, so Playwright is called directly — see Gotchas):

```bash
npm run dev:server &
timeout 30 bash -c 'until curl -sf http://localhost:4000/health >/dev/null; do sleep 1; done'

npm run dev:web &
timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
```

Drive it by piping a line-oriented script to the driver's stdin — same
idea as `chromium-cli`, but a plain Playwright/chromium script since
the `chromium-cli` extension isn't installed in this environment:

```bash
node .claude/skills/run-bitbank-ai-trader/driver.mjs <<'EOF'
nav http://localhost:3000
wait-for text=System Status
eval new Promise(r => setTimeout(r, 3000))
screenshot 01-dashboard
console --errors
quit
EOF
```

Screenshots land in `SCREENSHOT_DIR` (default
`<os tmpdir>/bitbank-ai-trader-shots/<name>.png` — on Windows that's
`%LOCALAPPDATA%\Temp\bitbank-ai-trader-shots\`). Read the PNG after
every run — a page that loaded is not the same as a page that connected.

### Driver commands

| command | what it does |
|---|---|
| `nav <url>` | launch Chromium (first call only) and navigate |
| `wait-for <css-sel>` / `wait-for text=<text>` | wait up to 15s for an element |
| `screenshot [name]` | full-page PNG → `SCREENSHOT_DIR/<name>.png` |
| `screenshot-element <sel> [name]` | crop to one element |
| `click <css-sel>` | Playwright locator click |
| `click-text <text>` | click first element containing text |
| `fill <css-sel> <text>` | fill a form field |
| `press <key>` | keyboard press (e.g. `Enter`) |
| `eval <js>` | `page.evaluate`, prints JSON — also useful as a `setTimeout` sleep, see above |
| `text [css-sel]` | print `innerText` (whole body if no selector) |
| `console` / `console --errors` | dump captured browser console messages |
| `quit` | close the browser |

Commands run strictly in order — the script waits for each one (`nav`'s
browser launch included) before reading the next line, so you can pipe
a whole script via heredoc non-interactively; no tmux/REPL needed.

## Run (human path)

```bash
npm run dev   # builds shared, then runs server(:4000)+web(:3000) via concurrently. Ctrl-C to stop.
```

## Stopping

`npm run dev:*` backgrounded with `&` leaves the real listener as a
child of the npm wrapper; `kill %1` on the npm process does not free
the port. Kill by port instead (Windows):

```bash
netstat -ano | grep -E ":(3000|4000).*LISTENING"   # get the PIDs
taskkill //PID <pid> //F
```

## Test

No test suite in this repo. Closest thing is lint (web only):

```bash
cd apps/web && npx eslint
```

---

## Gotchas

- **No `chromium-cli` in this environment.** It ships with the
  Claude-in-Chrome browser extension, which wasn't fully installed
  here. The driver above calls `playwright`'s `chromium.launch()`
  directly instead — same idea (pipe a script, get screenshots), just
  without the extension's session/tmux tooling.
- **The dashboard looks "loaded" ~1s after nav but is still on seed
  dummy data.** `LINK : OFFLINE` / `接続状態: DISCONNECTED` in the
  System Status card means the WebSocket hasn't connected yet — it
  takes ~2-3s. Add a short sleep (`eval new Promise(r => setTimeout(r,
  3000))`) or `wait-for text=STREAM CONNECTED` before screenshotting
  anything you want to trust.
- **A naive `readline.on('line', ...)` handler races ahead of async
  work.** For a piped heredoc, Node buffers the whole input and fires
  every `line` event before an `await`-ing handler (e.g. `nav`'s
  `chromium.launch()`) resolves, so `wait-for`/`screenshot` run against
  a `page` that's still `null`. Fixed in the driver by consuming
  `readline` with `for await (const line of rl)`, which pulls one line
  at a time and only advances once the previous command's promise
  settles.
- **`apps/web` runs Next.js 16**, newer than most training data —
  `apps/web/AGENTS.md` flags this explicitly. If a Next API doesn't
  behave as expected, check `node_modules/next/dist/docs/` rather than
  assuming an older Next.js convention.
- **Root `.env` contains a live `ANTHROPIC_API_KEY`.** It's
  gitignored and never committed (checked `git log` — clean), but
  don't echo it into logs, screenshots, or this skill.
- **AI Judgment really calls the Claude API** when a deployed Bot
  Blueprint strategy uses an `AI JUDGMENT` node — driving the dashboard
  for more than a few minutes burns real (small, budget-capped) tokens
  against `AI_DAILY_BUDGET_JPY`. Fine for a quick verification run, but
  don't leave it running unattended for hours.

## Troubleshooting

- **`ERROR: nav first` on every command:** the script raced ahead of
  `nav`'s browser launch — this was the readline bug above; make sure
  you're using the driver as committed (`for await` loop), not an
  older `on('line', ...)` version.
- **`npx playwright install chromium` needed even though `playwright`
  is in `node_modules`:** the npm package and the browser binary are
  separate downloads (~200MB) cached under
  `%LOCALAPPDATA%\ms-playwright\`; re-run the install if that cache is
  cleared.
