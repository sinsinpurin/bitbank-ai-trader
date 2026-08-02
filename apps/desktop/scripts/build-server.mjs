// Electron に同梱する apps/server 一式 (apps/desktop/server-dist) を生成する。
// 手順: packages/shared と apps/server をビルド -> prisma generate ->
//       dist/prisma/node_modules と、起動時マイグレーション用の prisma CLI をコピー。
//
// 出力レイアウト (electron-builder の extraResources で resources/server/ へ配置される):
//   server-dist/dist/index.js        サーバー本体のエントリ
//   server-dist/package.json         "main" 等のメタ情報
//   server-dist/prisma/              schema.prisma + migrations/
//   server-dist/node_modules/        本番依存の実体 (.prisma/client を含む)
//   server-dist/prisma-cli/          prisma migrate deploy 用のCLIとスキーマエンジン
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const serverDir = path.join(repoRoot, "apps", "server");
const sharedDir = path.join(repoRoot, "packages", "shared");
const rootNodeModules = path.join(repoRoot, "node_modules");
const tscBin = path.join(rootNodeModules, "typescript", "bin", "tsc");
const prismaBin = path.join(rootNodeModules, "prisma", "build", "index.js");
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

const stagingDir = path.join(desktopDir, "server-dist");
const stagingNodeModules = path.join(stagingDir, "node_modules");
const stagingPrismaCli = path.join(stagingDir, "prisma-cli");

const SCHEMA_ENGINE_NAME = "schema-engine-windows.exe";
const QUERY_ENGINE_NAME = "query_engine-windows.dll.node";

// prisma CLI 本体は npm ls の本番クロージャに現れる (@prisma/client の optional peer) が、
// マイグレーション用の実体を prisma-cli/ へ明示的にコピーするため node_modules 側からは除外する。
const EXCLUDED_PACKAGES = new Set(["prisma"]);

// @prisma/engines は prisma-cli/build/index.js が読み込み時に require するため、
// 除外すると初回起動のマイグレーションが MODULE_NOT_FOUND で必ず失敗する。
// ただし72MBのうちほぼ全部がエンジンのバイナリ2本 (クエリエンジン19MB、スキーマ
// エンジン18MB。後者は prisma-cli/ 側に別途コピー済み) なので、package.json と
// dist/ だけを残す。
const TRIMMED_PACKAGES = new Map([["@prisma/engines", ["package.json", "dist"]]]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

// shell: true は使わない (Windowsで cmd.exe が挟まると終了コードや孤児プロセスの扱いが崩れる)。
function run(label, args, options) {
  console.log(`[build-server] ${label}`);
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) fail(`${label} の起動に失敗しました: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} が失敗しました (exit code ${result.status})`);
}

function capture(label, args, options) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error) fail(`${label} の起動に失敗しました: ${result.error.message}`);
  // npm ls は peer/optional の欠落で非0を返すことがあるが、出力自体は使えるので
  // 空出力のときだけ失敗扱いにする。
  if (!result.stdout?.trim()) {
    fail(`${label} が依存関係を1件も出力しませんでした (exit code ${result.status})`);
  }
  return result.stdout;
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function readPackageName(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name ?? null;
  } catch {
    return null;
  }
}

// ネストした node_modules 配下の型定義パッケージは実行時に不要なので落とす。
function copyFilter(src) {
  return !/[\\/]node_modules[\\/]@types[\\/]/.test(src);
}

// パッケージ直下の指定したエントリだけを残すフィルタを作る。
function makeAllowListFilter(packageRoot, allowedTopLevel) {
  return (src) => {
    const rel = path.relative(packageRoot, src);
    if (rel === "") return true;
    return allowedTopLevel.includes(rel.split(path.sep)[0]);
  };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// 検証で読み込んだネイティブモジュール (クエリエンジン/スキーマエンジン) のファイル
// ハンドルは子プロセス終了後もしばらく残り、Windowsでは削除が EPERM になる。
// rmSync の maxRetries は Node 24 のネイティブ実装だとこのケースで効かないため、
// 自前でリトライする。
function removeDirWithRetry(dir, attempts = 12, waitMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return null;
    } catch (err) {
      if (i === attempts - 1) return err;
      sleepSync(waitMs);
    }
  }
  return null;
}

// spawnSync を実行し、成功なら null、失敗ならエラーメッセージを返す。
// fail() と違い即 exit しないので、呼び出し側で一時ディレクトリを片付けられる。
function runOrReturnError(label, args, options) {
  console.log(`[build-server] ${label}`);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error) return `${label} の起動に失敗しました: ${result.error.message}`;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    return `${label} が失敗しました (exit code ${result.status})\n${output || "出力はありません。"}`;
  }
  return null;
}

// --- 1. ビルド ---

run("packages/shared をビルド", [tscBin, "-p", "tsconfig.json"], { cwd: sharedDir });
run("apps/server をビルド", [tscBin, "-p", "tsconfig.json"], { cwd: serverDir });

// --- 2. Prisma クライアント生成と検証 ---

run("prisma generate", [prismaBin, "generate", "--schema", path.join(serverDir, "prisma", "schema.prisma")], {
  cwd: serverDir,
});

const generatedClientDir = path.join(rootNodeModules, ".prisma", "client");
for (const required of ["index.js", QUERY_ENGINE_NAME]) {
  if (!fs.existsSync(path.join(generatedClientDir, required))) {
    fail(
      `Prisma クライアントの生成物が見つかりません: ${path.join(generatedClientDir, required)}\n` +
        "prisma generate は成功しましたが、Windows用のクライアント/クエリエンジンが出力されていません。\n" +
        "`npm ci` をやり直すか、PRISMA_CLI_BINARY_TARGETS の設定を確認してください。"
    );
  }
}

// --- 3. サーバー本体の配置 ---

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

console.log("[build-server] apps/server の成果物をコピー");
fs.cpSync(path.join(serverDir, "dist"), path.join(stagingDir, "dist"), { recursive: true });
fs.copyFileSync(path.join(serverDir, "package.json"), path.join(stagingDir, "package.json"));

// dev.db / .env は開発者個人のデータなので絶対に同梱しない (schema と migrations だけ)。
const stagingPrisma = path.join(stagingDir, "prisma");
fs.mkdirSync(stagingPrisma, { recursive: true });
fs.copyFileSync(
  path.join(serverDir, "prisma", "schema.prisma"),
  path.join(stagingPrisma, "schema.prisma")
);
fs.cpSync(path.join(serverDir, "prisma", "migrations"), path.join(stagingPrisma, "migrations"), {
  recursive: true,
});

// --- 4. 本番依存の node_modules を配置 ---

console.log("[build-server] apps/server の本番依存を収集");
// npm を node と同じディレクトリから解決している。volta/fnm のようにシムを挟む
// 構成だと成立しないため、ここで明示的に失敗させる (後段の「依存を1件も出力しません
// でした」より原因が分かりやすい)。
if (!fs.existsSync(npmCli)) {
  fail(
    `npm CLI が見つかりません: ${npmCli}\n` +
      "本番依存の一覧を取得できないため中止します。node と同じディレクトリに npm が" +
      "配置されている構成 (公式インストーラ / actions/setup-node) で実行してください。"
  );
}

const lsOutput = capture(
  "npm ls (apps/server の本番依存)",
  [npmCli, "ls", "--workspace=apps/server", "--omit=dev", "--parseable", "--all"],
  { cwd: repoRoot }
);

const copiedPackages = [];
const seen = new Set();
for (const line of lsOutput.split(/\r?\n/)) {
  const reported = line.trim();
  if (!reported || !reported.startsWith(rootNodeModules + path.sep)) continue;

  const rel = reported.slice(rootNodeModules.length + 1);
  // ネストした node_modules 配下は親ごとコピーされるので個別には扱わない。
  if (rel.split(path.sep).includes("node_modules")) continue;
  if (seen.has(rel)) continue;
  seen.add(rel);

  let real;
  try {
    real = fs.realpathSync(reported);
  } catch {
    continue;
  }

  const name = readPackageName(real);
  // @noctas/server 自身のワークスペースリンク。
  if (name === "@noctas/server") continue;
  if (name?.startsWith("@types/")) continue;
  if (name && EXCLUDED_PACKAGES.has(name)) continue;

  const trimmed = name === null ? undefined : TRIMMED_PACKAGES.get(name);
  const dest = path.join(stagingNodeModules, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // dereference: @noctas/shared はワークスペースのシンボリックリンクなので実体を焼き込む。
  fs.cpSync(real, dest, {
    recursive: true,
    dereference: true,
    filter: trimmed ? makeAllowListFilter(real, trimmed) : copyFilter,
  });
  copiedPackages.push(name ?? rel);
}

if (copiedPackages.length === 0) {
  fail("本番依存を1件もコピーできませんでした。npm ls の出力形式を確認してください。");
}
console.log(`[build-server] ${copiedPackages.length} パッケージをコピーしました`);

// npm ls は生成物である node_modules/.prisma を報告しないため個別にコピーする。
console.log("[build-server] .prisma/client をコピー");
fs.cpSync(generatedClientDir, path.join(stagingNodeModules, ".prisma", "client"), {
  recursive: true,
  dereference: true,
});

// --- 5. 起動時マイグレーション用の prisma CLI ---

console.log("[build-server] prisma CLI とスキーマエンジンをコピー");
fs.cpSync(path.join(rootNodeModules, "prisma"), stagingPrismaCli, {
  recursive: true,
  dereference: true,
  filter: copyFilter,
});

const schemaEngineSrc = path.join(rootNodeModules, "@prisma", "engines", SCHEMA_ENGINE_NAME);
if (!fs.existsSync(schemaEngineSrc)) {
  fail(
    `スキーマエンジンが見つかりません: ${schemaEngineSrc}\n` +
      "prisma migrate deploy を同梱できません。@prisma/engines の中身を確認してください。"
  );
}
fs.copyFileSync(schemaEngineSrc, path.join(stagingPrismaCli, SCHEMA_ENGINE_NAME));

// --- 6. 検証 ---

const serverEntry = path.join(stagingDir, "dist", "index.js");
if (!fs.existsSync(serverEntry)) {
  fail(`サーバーのエントリが生成されていません: ${serverEntry}`);
}
if (!fs.existsSync(path.join(stagingPrismaCli, "build", "index.js"))) {
  fail(`prisma CLI のエントリが見つかりません: ${path.join(stagingPrismaCli, "build", "index.js")}`);
}

// --- 7. リポジトリ外へコピーして動作確認 ---

// ファイルの存在確認だけでは不十分。server-dist はリポジトリ内にあるため、
// 依存が staging から漏れていても Node のモジュール解決が上位ディレクトリを辿って
// <repo>/node_modules で拾ってしまい、インストール後に初めて壊れる。
// (cwd を変えるだけでは防げない。解決はファイルの位置から上に辿るため、
//  staging ディレクトリ自体をリポジトリ外へ持ち出す必要がある。)
console.log("[build-server] リポジトリ外へコピーして単体動作を確認");
const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), "noctas-server-verify-"));
let verifyError = null;
try {
  fs.cpSync(stagingDir, verifyDir, { recursive: true });

  const verifyDbUrl = `file:${path.join(verifyDir, "verify.db").replace(/\\/g, "/")}`;
  verifyError =
    // 初回起動時と同じ経路。prisma CLI の require チェーンとスキーマエンジンを実際に通す。
    runOrReturnError(
      "  隔離環境で migrate deploy",
      [
        path.join(verifyDir, "prisma-cli", "build", "index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(verifyDir, "prisma", "schema.prisma"),
      ],
      {
        cwd: verifyDir,
        env: {
          ...process.env,
          DATABASE_URL: verifyDbUrl,
          PRISMA_SCHEMA_ENGINE_BINARY: path.join(verifyDir, "prisma-cli", SCHEMA_ENGINE_NAME),
        },
      }
    ) ??
    // サーバー本体が実際に読み込む主要モジュールが staging だけで解決できること。
    runOrReturnError(
      "  隔離環境で同梱 node_modules の解決",
      ["-e", "require('@prisma/client');require('@noctas/shared');require('fastify');"],
      { cwd: verifyDir }
    );
} catch (err) {
  verifyError = `隔離環境の準備に失敗しました: ${err instanceof Error ? err.message : String(err)}`;
}
// 削除に失敗しても staging 自体は正しいので、警告だけ出してビルドは止めない。
const removeError = removeDirWithRetry(verifyDir);
if (removeError) {
  console.warn(
    `[build-server] 一時ディレクトリを削除できませんでした (無視します): ${verifyDir} — ${
      removeError instanceof Error ? removeError.message : String(removeError)
    }`
  );
}

if (verifyError) {
  fail(
    `同梱サーバーがリポジトリ外で動作しません。依存の staging 漏れの可能性があります。\n${verifyError}`
  );
}

const sizeMb = (dirSizeBytes(stagingDir) / 1024 / 1024).toFixed(1);
console.log(`[build-server] 完了 (${stagingDir} / 約 ${sizeMb} MB)`);
