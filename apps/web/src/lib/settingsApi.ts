import type {
  AppSettings,
  CircuitBreakerStatus,
  SettingsResponse,
} from "@bitbank-ai-trader/shared";

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
  aiDecisionEnabled?: boolean;
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
