import type { PnlReview, PnlSummary } from "@bitbank-ai-trader/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `APIエラー (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPnlSummary(): Promise<PnlSummary> {
  return handle(await fetch(`${API_URL}/api/pnl`));
}

export async function requestPnlReview(): Promise<PnlReview> {
  return handle(await fetch(`${API_URL}/api/pnl/review`, { method: "POST" }));
}
