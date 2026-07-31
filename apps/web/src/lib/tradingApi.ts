import type { Position } from "@noctas/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `APIエラー (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** 指定ポジションを現在値で成行決済する(ダッシュボードの手動決済ボタン用) */
export async function closePositionManually(positionId: string): Promise<Position> {
  return handle(
    await fetch(`${API_URL}/api/positions/${positionId}/close`, { method: "POST" })
  );
}
