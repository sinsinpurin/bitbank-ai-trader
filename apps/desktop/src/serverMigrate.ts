import { spawn } from "node:child_process";
import { PRISMA_CLI, PRISMA_SCHEMA, SCHEMA_ENGINE_BIN, SERVER_DIR, getDatabaseUrl } from "./paths";

const OUTPUT_TAIL_LINES = 30;

// パッケージ版は初回インストール時にDBが存在せず、アップデートでスキーマが変わることもある。
// migrate deploy は適用済みなら何もしないので、毎起動そのまま実行してよい。
export function runServerMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    const tail: string[] = [];
    const pushOutput = (chunk: string): void => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > OUTPUT_TAIL_LINES) tail.shift();
      }
    };

    // shell: true は使わない。Windowsで cmd.exe が挟まると終了コードや孤児プロセスの扱いが崩れる。
    const proc = spawn(
      process.execPath,
      [PRISMA_CLI, "migrate", "deploy", "--schema", PRISMA_SCHEMA],
      {
        cwd: SERVER_DIR,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          DATABASE_URL: getDatabaseUrl(),
          PRISMA_SCHEMA_ENGINE_BINARY: SCHEMA_ENGINE_BIN,
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      pushOutput(chunk);
      process.stdout.write(`[migrate] ${chunk}`);
    });
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      pushOutput(chunk);
      process.stderr.write(`[migrate] ${chunk}`);
    });

    proc.once("error", (err) => {
      reject(new Error(`マイグレーションの起動に失敗しました: ${err.message}`));
    });

    proc.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `データベースのマイグレーションが失敗しました (exit code ${code ?? "null"}${
            signal ? `, signal ${signal}` : ""
          })。\n${tail.join("\n") || "出力はありません。"}`
        )
      );
    });
  });
}
