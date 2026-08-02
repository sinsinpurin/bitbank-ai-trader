// Electron の app:// で配信するレンダラー資産 (apps/desktop/renderer) を生成する。
// 手順: packages/shared をビルド -> apps/web を静的書き出し -> out/ をコピー。
import { spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const webDir = path.join(repoRoot, "apps", "web");
const sharedDir = path.join(repoRoot, "packages", "shared");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const outDir = path.join(webDir, "out");
const rendererDir = path.join(desktopDir, "renderer");

const WEB_PORT = 3000;
const SERVER_ORIGIN = "127.0.0.1:4000";

function fail(message) {
  console.error(message);
  process.exit(1);
}

// listen で空きを確かめる方法はWindowsでは使えない。0.0.0.0 を掴んでいるdevサーバーが
// あっても 127.0.0.1 への bind が別途成功してしまうため、実際に接続してみて判定する。
function isListening(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: WEB_PORT });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

// next build は :3000 のdevサーバーと .next を共有して壊し合うため、
// devが動いている間は実行させない。
async function ensureWebDevServerStopped() {
  const inUse = (await Promise.all([isListening("127.0.0.1"), isListening("::1")])).some(Boolean);
  if (inUse) {
    fail(
      `ポート ${WEB_PORT} が使用中です。next build が dev サーバーの .next を壊すため中止します。\n` +
        "`npm run dev` を止めてから再実行してください。"
    );
  }
}

// shell: true は使わない (Windowsで cmd.exe が挟まると終了コードや孤児プロセスの扱いが崩れる)。
function run(label, args, options) {
  console.log(`[build-renderer] ${label}`);
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) fail(`${label} の起動に失敗しました: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} が失敗しました (exit code ${result.status})`);
}

await ensureWebDevServerStopped();

run("packages/shared をビルド", [tscBin, "-p", "tsconfig.json"], { cwd: sharedDir });

fs.rmSync(outDir, { recursive: true, force: true });

run("apps/web を静的書き出し", [nextBin, "build"], {
  cwd: webDir,
  // @next/env は既に process.env にあるキーを .env で上書きしないため、
  // ここで渡す NEXT_PUBLIC_* が apps/web/.env.local より優先される。
  // localhost ではなく 127.0.0.1 にすることで、app:// からのループバック接続が
  // mixed-content でブロックされないことを確実にする。
  env: {
    ...process.env,
    NOCTAS_DESKTOP_WEB_EXPORT: "1",
    NOCTAS_DESKTOP_WEB_DISTDIR: "",
    NEXT_PUBLIC_API_URL: `http://${SERVER_ORIGIN}`,
    NEXT_PUBLIC_WS_URL: `ws://${SERVER_ORIGIN}/ws`,
  },
});

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  fail(`静的書き出しに失敗しました: ${outDir}/index.html が生成されていません。`);
}

console.log(`[build-renderer] ${outDir} -> ${rendererDir} へコピー`);
fs.rmSync(rendererDir, { recursive: true, force: true });
fs.cpSync(outDir, rendererDir, { recursive: true });

console.log("[build-renderer] 完了");
