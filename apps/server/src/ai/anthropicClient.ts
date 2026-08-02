import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { prisma } from "../db/prisma";

/**
 * Anthropic APIキーの解決とクライアント生成を一元管理する。
 * キーはSettings画面からDB(AppSetting)に保存でき、未保存なら環境変数
 * ANTHROPIC_API_KEY にフォールバックする。DB値が常に優先される。
 *
 * 依存は config と prisma のみに留める(settings/ や ai/* からimportされる側なので、
 * こちらから逆方向にimportすると循環参照になる)。
 */

const ANTHROPIC_API_KEY_KEY = "anthropicApiKey";

/** キー文字列の最大長。これを超えるものは誤入力(ペースト事故など)として弾く */
const MAX_KEY_LENGTH = 200;

/** この長さを超えるキーだけ末尾4文字をマスク表示に含める(短いキーは全体を伏せる) */
const MIN_LENGTH_FOR_SUFFIX = 8;

// 起動時にDBから読み込むキャッシュ。getAnthropicApiKey()を同期に保つためのもの
let dbKey: string | null = null;

let cachedClient: Anthropic | null = null;
let cachedForKey: string | null = null;

/** 起動時にDBの保存済みキーをメモリキャッシュへ読み込む */
export async function loadAnthropicApiKey(): Promise<void> {
  const row = await prisma.appSetting.findUnique({ where: { key: ANTHROPIC_API_KEY_KEY } });
  dbKey = row?.value ? row.value : null;
}

/**
 * 実際に使用するAPIキー(未設定なら空文字)。
 * ルートのガードや判断ループから毎tick呼ばれるため、DBには触れずキャッシュのみを読む。
 */
export function getAnthropicApiKey(): string {
  return dbKey || config.anthropic.apiKey || "";
}

/** APIキーの設定状況。生値は含めず、末尾4文字のみのマスク表示を返す */
export function getAnthropicApiKeyStatus(): {
  configured: boolean;
  source: "db" | "env" | null;
  masked: string | null;
} {
  const key = getAnthropicApiKey();
  if (!key) {
    return { configured: false, source: null, masked: null };
  }
  return {
    configured: true,
    source: dbKey ? "db" : "env",
    // 短いキー(テスト用の値など)で末尾4文字を出すと全体が復元できてしまうため、
    // 十分な長さがあるときだけ末尾を見せる
    masked: key.length > MIN_LENGTH_FOR_SUFFIX ? "•".repeat(8) + key.slice(-4) : "•".repeat(12),
  };
}

/** 入力値を検証して正規化する。不正ならnull(空・空白混入・長すぎ) */
export function normalizeApiKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;
  if (trimmed.length > MAX_KEY_LENGTH) return null;
  return trimmed;
}

/** APIキーをDBへ保存し、キャッシュを即時更新する(再起動不要) */
export async function setAnthropicApiKey(value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: ANTHROPIC_API_KEY_KEY },
    update: { value },
    create: { key: ANTHROPIC_API_KEY_KEY, value },
  });
  dbKey = value;
}

/** 保存済みAPIキーを削除し、環境変数へのフォールバックに戻す */
export async function clearAnthropicApiKey(): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: ANTHROPIC_API_KEY_KEY } });
  dbKey = null;
}

/**
 * Anthropicクライアント。実効キーが変わったら作り直す。
 * モジュールスコープで一度だけ生成すると、Settings画面でキーを保存しても
 * 古いキーのクライアントを使い続けてしまう(再起動が必要になる)ため、
 * 生成時のキーと現在のキーを毎回突き合わせる。
 */
export function getAnthropicClient(): Anthropic {
  const key = getAnthropicApiKey();
  if (!cachedClient || cachedForKey !== key) {
    cachedClient = new Anthropic({ apiKey: key });
    cachedForKey = key;
  }
  return cachedClient;
}
