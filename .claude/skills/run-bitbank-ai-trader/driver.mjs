// Driver for the bitbank-ai-trader dashboard (apps/web, port 3000).
// Reads a line-oriented script from stdin (same shape as chromium-cli),
// drives a headless Chromium via Playwright, and exits at EOF.
//
// Usage:
//   node .claude/skills/run-bitbank-ai-trader/driver.mjs <<'EOF'
//   nav http://localhost:3000
//   wait-for text=System Status
//   screenshot 01-dashboard
//   EOF
//
// Screenshots land in SCREENSHOT_DIR (default: <os tmpdir>/bitbank-ai-trader-shots).
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), 'bitbank-ai-trader-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let page = null;
const consoleLog = [];

function parseTarget(arg) {
  // "text=Foo" -> XPath text match. Anything else -> CSS selector as-is.
  if (arg.startsWith('text=')) {
    const text = arg.slice('text='.length);
    return `xpath=//*[contains(text(), ${JSON.stringify(text)})]`;
  }
  return arg;
}

const COMMANDS = {
  async nav(url) {
    if (!browser) {
      browser = await chromium.launch({ args: ['--no-sandbox'] });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      page = await context.newPage();
      page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
      page.on('pageerror', (err) => consoleLog.push({ type: 'pageerror', text: String(err) }));
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log('nav ->', url);
  },

  async 'wait-for'(arg) {
    if (!page) return console.log('ERROR: nav first');
    const sel = parseTarget(arg);
    try {
      await page.waitForSelector(sel, { timeout: 15_000 });
      console.log('found:', arg);
    } catch {
      console.log('TIMEOUT:', arg);
    }
  },

  async screenshot(name) {
    if (!page) return console.log('ERROR: nav first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: true });
    console.log('screenshot:', f);
  },

  async 'screenshot-element'(argLine) {
    if (!page) return console.log('ERROR: nav first');
    const [sel, name] = argLine.split(/\s+(?=\S+$)/);
    const f = path.join(SHOT_DIR, (name || `ss-el-${Date.now()}`) + '.png');
    await page.locator(sel).first().screenshot({ path: f });
    console.log('screenshot-element:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: nav first');
    try {
      await page.locator(parseTarget(sel)).first().click({ timeout: 10_000 });
      console.log('click', sel, '-> OK');
    } catch (e) {
      console.log('click', sel, '-> ERROR:', e.message);
    }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: nav first');
    try {
      await page.getByText(text, { exact: false }).first().click({ timeout: 10_000 });
      console.log('click-text', JSON.stringify(text), '-> OK');
    } catch (e) {
      console.log('click-text', JSON.stringify(text), '-> ERROR:', e.message);
    }
  },

  async fill(argLine) {
    if (!page) return console.log('ERROR: nav first');
    const spaceIdx = argLine.indexOf(' ');
    const sel = spaceIdx === -1 ? argLine : argLine.slice(0, spaceIdx);
    const value = spaceIdx === -1 ? '' : argLine.slice(spaceIdx + 1);
    await page.locator(sel).first().fill(value);
    console.log('fill', sel, '->', JSON.stringify(value));
  },

  async press(key) { if (page) { await page.keyboard.press(key); console.log('press', key); } },

  async eval(expr) {
    if (!page) return console.log('ERROR: nav first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: nav first');
    console.log(await page.evaluate(
      (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  async console(flag) {
    const entries = flag === '--errors'
      ? consoleLog.filter((e) => e.type === 'error' || e.type === 'pageerror')
      : consoleLog;
    if (entries.length === 0) return console.log('(no console output)');
    for (const e of entries) console.log(`[${e.type}] ${e.text}`);
  },

  async quit() { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const rl = readline.createInterface({ input: process.stdin, terminal: false });

// for-await-of pulls one line at a time from readline's async iterator,
// so each command's promise fully resolves before the next line is read
// (a plain 'line' event listener does not serialize like this - all
// buffered lines from a piped heredoc fire before any async handler
// finishes, racing ahead of e.g. the browser launch in `nav`).
for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '- try: help'); continue; }
  try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
}
await COMMANDS.quit();
process.exit(0);
