import crypto from "node:crypto";
import { config } from "../config";

const PRIVATE_BASE_URL = "https://api.bitbank.cc/v1";
const PUBLIC_BASE_URL = "https://public.bitbank.cc";

/**
 * Private API用の署名(ACCESS-NONCE方式)。
 * GET: nonce + "/v1" + path + queryString
 * POST: nonce + JSON.stringify(body)
 * 参照: https://github.com/bitbankinc/bitbank-api-docs/blob/master/rest-api_JP.md
 */
function sign(message: string): string {
  return crypto
    .createHmac("sha256", config.bitbank.apiSecret)
    .update(message)
    .digest("hex");
}

function nonce(): string {
  return Date.now().toString();
}

async function privateRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
  body?: Record<string, unknown>
): Promise<T> {
  if (!config.bitbank.apiKey || !config.bitbank.apiSecret) {
    throw new Error(
      "BITBANK_API_KEY / BITBANK_API_SECRET が未設定です(ペーパートレードのみの場合、Private APIは呼び出されません)"
    );
  }

  const n = nonce();
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const bodyJson = body ? JSON.stringify(body) : "";

  const message =
    method === "GET" ? `${n}/v1${path}${query}` : `${n}${bodyJson}`;

  const headers = {
    "ACCESS-KEY": config.bitbank.apiKey,
    "ACCESS-NONCE": n,
    "ACCESS-SIGNATURE": sign(message),
    "Content-Type": "application/json",
  };

  const res = await fetch(`${PRIVATE_BASE_URL}${path}${query}`, {
    method,
    headers,
    body: method === "POST" ? bodyJson : undefined,
  });

  const json = (await res.json()) as { success: 0 | 1; data: T };
  if (json.success !== 1) {
    throw new Error(`bitbank Private API エラー: ${JSON.stringify(json)}`);
  }
  return json.data;
}

/** 資産残高を取得(実際の口座に対する呼び出し。現段階では利用しない) */
export function getAssets() {
  return privateRequest<{ assets: unknown[] }>("GET", "/user/assets");
}

/** Public API: 単一ペアのティッカー取得 */
export async function getTicker(pair: string) {
  const res = await fetch(`${PUBLIC_BASE_URL}/${pair}/ticker`);
  const json = (await res.json()) as {
    success: 0 | 1;
    data: {
      sell: string;
      buy: string;
      high: string;
      low: string;
      last: string;
      vol: string;
      timestamp: number;
    };
  };
  if (json.success !== 1) {
    throw new Error(`bitbank Public API エラー: ${JSON.stringify(json)}`);
  }
  return json.data;
}

/** Public API: 板情報取得 */
export async function getDepth(pair: string) {
  const res = await fetch(`${PUBLIC_BASE_URL}/${pair}/depth`);
  const json = (await res.json()) as {
    success: 0 | 1;
    data: {
      asks: [string, string][];
      bids: [string, string][];
      timestamp: number;
    };
  };
  if (json.success !== 1) {
    throw new Error(`bitbank Public API エラー: ${JSON.stringify(json)}`);
  }
  return json.data;
}
