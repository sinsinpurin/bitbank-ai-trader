import { spawn, execFile, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { SERVER_PORT } from "./serverProcess";

const WEB_PORT = Number(process.env.NOCTAS_DESKTOP_WEB_PORT ?? 3000);
const WEB_URL = process.env.NOCTAS_DESKTOP_RENDERER ?? `http://localhost:${WEB_PORT}`;

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_INTERVAL_MS = 100;
const GRACEFUL_KILL_TIMEOUT_MS = 3_000;
const STDERR_TAIL_LINES = 40;

// dist/main.js から見て apps/desktop/dist -> リポジトリルート
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const webDir = path.join(repoRoot, "apps", "web");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");

let child: ChildProcess | null = null;
const stderrTail: string[] = [];

function pushStderr(chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.trim()) continue;
    stderrTail.push(line);
    if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// next dev はビルド中に 404/500 を返すことがあるため、ステータスではなく
// TCP接続が成立したかどうかだけを起動完了の判定に使う。
async function isWebReachable(): Promise<boolean> {
  try {
    await fetch(WEB_URL, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

export function isWebManaged(): boolean {
  return child !== null;
}

export async function startWebProcess(): Promise<void> {
  if (child) return;

  stderrTail.length = 0;

  // shell: true は使わない。Windowsで cmd.exe が中間に挟まると、
  // 親をkillしてもnode本体が孤児として:3000を掴んだまま残る。
  const proc = spawn(process.execPath, [nextBin, "dev", "--port", String(WEB_PORT)], {
    cwd: webDir,
    // @next/env は process.env に既にあるキーを .env の値で上書きしないため、
    // ここで渡す NEXT_PUBLIC_* が apps/web/.env.local より優先される。
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NEXT_PUBLIC_API_URL: `http://localhost:${SERVER_PORT}`,
      NEXT_PUBLIC_WS_URL: `ws://localhost:${SERVER_PORT}/ws`,
      NOCTAS_DESKTOP_WEB_DISTDIR: ".next-desktop",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child = proc;

  proc.stdout?.setEncoding("utf8");
  proc.stdout?.on("data", (chunk: string) => process.stdout.write(`[web] ${chunk}`));
  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", (chunk: string) => {
    pushStderr(chunk);
    process.stderr.write(`[web] ${chunk}`);
  });

  proc.on("exit", () => {
    if (child === proc) child = null;
  });

  const spawnError = await new Promise<Error | null>((resolve) => {
    proc.once("spawn", () => resolve(null));
    proc.once("error", (err) => resolve(err));
  });
  if (spawnError) {
    child = null;
    throw new Error(`web開発サーバーの起動に失敗しました: ${spawnError.message}`);
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `web開発サーバーが起動直後に終了しました (exit code ${proc.exitCode ?? "null"}${
          proc.signalCode ? `, signal ${proc.signalCode}` : ""
        })。\n${stderrTail.join("\n") || "標準エラー出力はありません。"}`
      );
    }
    if (await isWebReachable()) return;
    await delay(READY_POLL_INTERVAL_MS);
  }

  await stopWebProcess();
  throw new Error(
    `web開発サーバーが${READY_TIMEOUT_MS / 1000}秒以内に ${WEB_URL} へ応答しませんでした。\n${
      stderrTail.join("\n") || "標準エラー出力はありません。"
    }`
  );
}

export async function stopWebProcess(): Promise<void> {
  const proc = child;
  if (!proc || proc.exitCode !== null) {
    child = null;
    return;
  }

  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  proc.kill();

  const timedOut = await Promise.race([
    exited.then(() => false),
    delay(GRACEFUL_KILL_TIMEOUT_MS).then(() => true),
  ]);

  if (timedOut) {
    forceKill(proc);
    await Promise.race([exited, delay(GRACEFUL_KILL_TIMEOUT_MS)]);
  }

  child = null;
}

function forceKill(proc: ChildProcess): void {
  const pid = proc.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => undefined);
  } else {
    try {
      proc.kill("SIGKILL");
    } catch {
      // すでに終了している
    }
  }
}

// process.on("exit") から呼ばれるため同期実装であることが必須。
export function forceKillWebProcessSync(): void {
  const proc = child;
  const pid = proc?.pid;
  if (!proc || pid === undefined || proc.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
  } else {
    try {
      proc.kill("SIGKILL");
    } catch {
      // すでに終了している
    }
  }
  child = null;
}
