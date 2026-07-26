import type { BotSignal, SignalWatch, SignalWatchConfig } from "@bitbank-ai-trader/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `APIエラー (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSignalWatches(): Promise<SignalWatch[]> {
  return handle(await fetch(`${API_URL}/api/signals`));
}

export async function createSignalWatch(input: {
  name?: string;
  pair: string;
  config: SignalWatchConfig;
}): Promise<SignalWatch> {
  return handle(
    await fetch(`${API_URL}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateSignalWatch(
  id: string,
  input: Partial<{ name: string; pair: string; config: SignalWatchConfig }>
): Promise<SignalWatch> {
  return handle(
    await fetch(`${API_URL}/api/signals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function deleteSignalWatch(id: string): Promise<void> {
  await handle<{ ok: boolean }>(
    await fetch(`${API_URL}/api/signals/${id}`, { method: "DELETE" })
  );
}

export async function fetchBotSignals(limit = 50): Promise<BotSignal[]> {
  return handle(await fetch(`${API_URL}/api/bot-signals?limit=${limit}`));
}
