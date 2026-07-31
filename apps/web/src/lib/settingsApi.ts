import type {
  AppSettings,
  CircuitBreakerStatus,
  SettingsResponse,
} from "@noctas/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `APIエラー (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSettings(): Promise<SettingsResponse> {
  return handle(await fetch(`${API_URL}/api/settings`));
}

export interface UpdateSettingsInput {
  aiJudgmentEnabled?: boolean;
  circuitBreakerEnabled?: boolean;
  dailyMaxLossJpy?: number;
  maxConsecutiveLosses?: number;
  /** trueで当日のサーキットブレーカー停止を手動解除する */
  resumeTrading?: boolean;
}

export async function updateSettings(
  input: UpdateSettingsInput
): Promise<{ settings: AppSettings; circuitBreaker: CircuitBreakerStatus }> {
  return handle(
    await fetch(`${API_URL}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

/**
 * ペーパートレードの状態(約定履歴・ポジション・仮想残高・Botシグナル履歴)を全消去する。
 * 誤操作防止のためサーバー側もconfirm: "RESET"を必須にしている。
 */
export async function resetPaperTrading(): Promise<{ ok: true; resetAt: number }> {
  return handle(
    await fetch(`${API_URL}/api/settings/reset-paper-trading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "RESET" }),
    })
  );
}
