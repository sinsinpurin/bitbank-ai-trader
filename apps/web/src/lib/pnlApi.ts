import type { PnlSummary } from "@bitbank-ai-trader/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function fetchPnlSummary(): Promise<PnlSummary> {
  const res = await fetch(`${API_URL}/api/pnl`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `APIエラー (${res.status})`);
  }
  return res.json() as Promise<PnlSummary>;
}
