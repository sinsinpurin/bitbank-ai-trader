import fs from "node:fs";
import dotenv from "dotenv";
import { USER_ENV_TEMPLATE, getUserEnvPath } from "./paths";

// パッケージ版では apps/server/.env が存在しないため、ユーザーが編集する .env を
// userData に置く。初回起動時だけテンプレートを配置し、以後は絶対に上書きしない。
export function ensureUserEnvFile(): void {
  const target = getUserEnvPath();
  if (fs.existsSync(target)) return;
  try {
    fs.copyFileSync(USER_ENV_TEMPLATE, target);
    console.log(`[desktop] 設定ファイルを作成しました: ${target}`);
  } catch (err) {
    // 設定ファイルが無くてもサーバーは起動できる (APIキー未設定でもAI機能が無効になるだけ)。
    console.error(`[desktop] 設定ファイルを作成できませんでした: ${String(err)}`);
  }
}

export function readUserEnv(): Record<string, string> {
  let parsed: Record<string, string>;
  try {
    parsed = dotenv.parse(fs.readFileSync(getUserEnvPath()));
  } catch {
    return {};
  }
  // DBの場所はデスクトップアプリ側が排他的に決める。ユーザーが .env に書いた
  // DATABASE_URL でマイグレーション済みDB以外を指せてしまうと壊れるため落とす。
  delete parsed.DATABASE_URL;
  return parsed;
}
