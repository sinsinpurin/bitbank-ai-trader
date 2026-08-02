import { spawn, execFile, spawnSync, type ChildProcess } from "node:child_process";
import { SERVER_DIR, SERVER_ENTRY } from "./paths";

export const SERVER_PORT = Number(process.env.NOCTAS_DESKTOP_SERVER_PORT ?? 4000);
export const HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/health`;

// NOCTAS_DESKTOP_SERVER_PORT はポートのみを変える(テスト用)。DBの場所は開発版なら
// apps/server/.env の DATABASE_URL(既定 dev.db)、パッケージ版なら呼び出し元が
// extraEnv で渡す userData 配下のDBになる。どちらの場合も別ポートで2つ目のサーバーを
// 立てると同じDBを共有するので、DBも分離したい場合は DATABASE_URL を明示的に上書きすること。

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_INTERVAL_MS = 100;
const GRACEFUL_KILL_TIMEOUT_MS = 3_000;
const STDERR_TAIL_LINES = 40;

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

export async function isServerHealthy(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function isServerManaged(): boolean {
  return child !== null;
}

export async function startServerProcess(extraEnv: Record<string, string> = {}): Promise<void> {
  if (child) return;

  stderrTail.length = 0;

  // shell: true は使わない。Windowsで cmd.exe が中間に挟まると、
  // 親をkillしてもnode本体が孤児として:4000を掴んだまま残る。
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    // ELECTRON_RUN_AS_NODE と PORT は最後に置いて必ず勝たせる。ユーザーが .env で
    // 上書きすると、サーバーがElectronとして起動したり、レンダラーの参照先と
    // ポートがずれて画面から繋がらなくなる。
    env: {
      ...process.env,
      ...extraEnv,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(SERVER_PORT),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child = proc;

  proc.stdout?.setEncoding("utf8");
  proc.stdout?.on("data", (chunk: string) => process.stdout.write(`[server] ${chunk}`));
  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", (chunk: string) => {
    pushStderr(chunk);
    process.stderr.write(`[server] ${chunk}`);
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
    throw new Error(`サーバープロセスの起動に失敗しました: ${spawnError.message}`);
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `サーバーが起動直後に終了しました (exit code ${proc.exitCode ?? "null"}${
          proc.signalCode ? `, signal ${proc.signalCode}` : ""
        })。\n${stderrTail.join("\n") || "標準エラー出力はありません。"}`
      );
    }
    if (await isServerHealthy()) return;
    await delay(READY_POLL_INTERVAL_MS);
  }

  await stopServerProcess();
  throw new Error(
    `サーバーが${READY_TIMEOUT_MS / 1000}秒以内に ${HEALTH_URL} へ応答しませんでした。\n${
      stderrTail.join("\n") || "標準エラー出力はありません。"
    }`
  );
}

export async function stopServerProcess(): Promise<void> {
  const proc = child;
  if (!proc || proc.exitCode !== null) {
    child = null;
    return;
  }

  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  // apps/server は SIGINT のみハンドルする。Windowsではシグナル名に関係なく
  // TerminateProcess相当になるため、下の taskkill フォールバックに任せる。
  proc.kill(process.platform === "win32" ? undefined : "SIGINT");

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
export function forceKillServerProcessSync(): void {
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
