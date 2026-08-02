import { beforeEach, describe, expect, it, vi } from "vitest";

// anthropicClient.ts はDB値をモジュールスコープにキャッシュする(getAnthropicApiKey()を
// 同期に保つため)ので、各テストは公開APIでそのキャッシュをリセットしてから始める。
// 環境変数フォールバックの検証のため config もモック化して差し替え可能にする。

const findUnique = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();

vi.mock("../db/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
  },
}));

vi.mock("../config", () => ({ config: { anthropic: { apiKey: "" } } }));

const { config } = await import("../config");
const {
  clearAnthropicApiKey,
  getAnthropicApiKey,
  getAnthropicApiKeyStatus,
  getAnthropicClient,
  loadAnthropicApiKey,
  normalizeApiKey,
  setAnthropicApiKey,
} = await import("./anthropicClient");

const ENV_KEY = "sk-ant-env-key-zzzz";
const DB_KEY = "sk-ant-db-key-ab12";

beforeEach(async () => {
  findUnique.mockReset();
  upsert.mockReset();
  deleteMany.mockReset();
  upsert.mockResolvedValue(undefined);
  deleteMany.mockResolvedValue({ count: 1 });
  config.anthropic.apiKey = "";

  findUnique.mockResolvedValue(null);
  await loadAnthropicApiKey();
});

describe("キーの解決順", () => {
  it("DBに保存済みの値が環境変数より優先される", async () => {
    config.anthropic.apiKey = ENV_KEY;
    findUnique.mockResolvedValue({ key: "anthropicApiKey", value: DB_KEY });
    await loadAnthropicApiKey();

    expect(getAnthropicApiKey()).toBe(DB_KEY);
    expect(getAnthropicApiKeyStatus().source).toBe("db");
  });

  it("DB値が無ければ環境変数にフォールバックする", async () => {
    config.anthropic.apiKey = ENV_KEY;
    await loadAnthropicApiKey();

    expect(getAnthropicApiKey()).toBe(ENV_KEY);
    expect(getAnthropicApiKeyStatus()).toEqual({
      configured: true,
      source: "env",
      masked: "••••••••zzzz",
    });
  });

  it("どちらも未設定なら未構成として扱う", () => {
    expect(getAnthropicApiKey()).toBe("");
    expect(getAnthropicApiKeyStatus()).toEqual({
      configured: false,
      source: null,
      masked: null,
    });
  });

  it("DBの空文字は未設定として扱い、環境変数へフォールバックする", async () => {
    config.anthropic.apiKey = ENV_KEY;
    findUnique.mockResolvedValue({ key: "anthropicApiKey", value: "" });
    await loadAnthropicApiKey();

    expect(getAnthropicApiKeyStatus().source).toBe("env");
  });
});

describe("保存と削除", () => {
  it("保存すると再起動なしで即座に有効キーが変わる", async () => {
    config.anthropic.apiKey = ENV_KEY;
    await loadAnthropicApiKey();
    expect(getAnthropicApiKey()).toBe(ENV_KEY);

    await setAnthropicApiKey(DB_KEY);

    expect(getAnthropicApiKey()).toBe(DB_KEY);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("削除すると環境変数のキーに戻る", async () => {
    config.anthropic.apiKey = ENV_KEY;
    await setAnthropicApiKey(DB_KEY);

    await clearAnthropicApiKey();

    expect(getAnthropicApiKey()).toBe(ENV_KEY);
    expect(getAnthropicApiKeyStatus().source).toBe("env");
    expect(deleteMany).toHaveBeenCalledOnce();
  });

  it("環境変数も無い状態で削除すると完全に未設定になる", async () => {
    await setAnthropicApiKey(DB_KEY);
    await clearAnthropicApiKey();

    expect(getAnthropicApiKeyStatus().configured).toBe(false);
  });
});

describe("マスク表示", () => {
  it("末尾4文字より多くの実キーを含まない", async () => {
    await setAnthropicApiKey(DB_KEY);
    const masked = getAnthropicApiKeyStatus().masked;

    expect(masked).toBe("••••••••ab12");
    // 末尾4文字を除いた実キーの断片が一切含まれないこと
    expect(masked).not.toContain(DB_KEY.slice(0, -4));
    for (let i = 0; i + 5 <= DB_KEY.length - 4; i++) {
      expect(masked).not.toContain(DB_KEY.slice(i, i + 5));
    }
  });

  // 末尾4文字を無条件に出すと、短いキーでは全体が復元できてしまう
  it("8文字以下のキーは末尾も含めて全て伏せる", async () => {
    await setAnthropicApiKey("short123");
    expect(getAnthropicApiKeyStatus().masked).toBe("••••••••••••");
  });

  it("9文字以上なら末尾4文字を表示する", async () => {
    await setAnthropicApiKey("short1234");
    expect(getAnthropicApiKeyStatus().masked).toBe("••••••••1234");
  });

  it("短い環境変数のキーも同様に全て伏せる", async () => {
    config.anthropic.apiKey = "abcd";
    await loadAnthropicApiKey();

    const status = getAnthropicApiKeyStatus();
    expect(status.source).toBe("env");
    expect(status.masked).not.toContain("abcd");
  });
});

describe("normalizeApiKey", () => {
  it("前後の空白を除去する", () => {
    expect(normalizeApiKey("  sk-ant-abc  ")).toBe("sk-ant-abc");
  });

  it("空文字・空白のみは不正", () => {
    expect(normalizeApiKey("")).toBeNull();
    expect(normalizeApiKey("   ")).toBeNull();
  });

  it("内部に空白を含むものは不正", () => {
    expect(normalizeApiKey("sk-ant abc")).toBeNull();
    expect(normalizeApiKey("sk-ant\nabc")).toBeNull();
  });

  it("200文字を超えるものは不正", () => {
    expect(normalizeApiKey("a".repeat(200))).toBe("a".repeat(200));
    expect(normalizeApiKey("a".repeat(201))).toBeNull();
  });

  it("sk-ant-以外の接頭辞も受け入れる(将来のキー形式でロックアウトしないため)", () => {
    expect(normalizeApiKey("future-format-key")).toBe("future-format-key");
  });
});

describe("getAnthropicClient のメモ化", () => {
  it("実効キーが変わらない間は同じインスタンスを返す", async () => {
    await setAnthropicApiKey(DB_KEY);

    expect(getAnthropicClient()).toBe(getAnthropicClient());
  });

  // モジュールスコープでクライアントを1度だけ生成すると、キー保存後も古いキーを
  // 使い続けてしまう(再起動が必要になる)。この機能の本丸なので明示的に検証する。
  it("キーを保存し直すとクライアントが作り直され、新しいキーを使う", async () => {
    config.anthropic.apiKey = ENV_KEY;
    await loadAnthropicApiKey();
    const before = getAnthropicClient();
    expect(before.apiKey).toBe(ENV_KEY);

    await setAnthropicApiKey(DB_KEY);
    const after = getAnthropicClient();

    expect(after).not.toBe(before);
    expect(after.apiKey).toBe(DB_KEY);
  });

  it("削除後は環境変数のキーを使うクライアントに戻る", async () => {
    config.anthropic.apiKey = ENV_KEY;
    await setAnthropicApiKey(DB_KEY);
    expect(getAnthropicClient().apiKey).toBe(DB_KEY);

    await clearAnthropicApiKey();

    expect(getAnthropicClient().apiKey).toBe(ENV_KEY);
  });
});
