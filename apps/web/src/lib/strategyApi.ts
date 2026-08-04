import type {
  BacktestRequest,
  BacktestSummary,
  CandleTimeframe,
  GeneratedStrategy,
  Strategy,
  StrategyGraph,
} from "@noctas/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `APIエラー (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchStrategies(): Promise<Strategy[]> {
  return handle(await fetch(`${API_URL}/api/strategies`));
}

export interface StrategyRiskInput {
  positionSizeJpy?: number | null;
  maxOpenPositions?: number | null;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
}

export async function createStrategy(input: {
  name: string;
  pair?: string;
  timeframe?: CandleTimeframe;
  description?: string;
  graph: StrategyGraph;
} & StrategyRiskInput): Promise<Strategy> {
  return handle(
    await fetch(`${API_URL}/api/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateStrategy(
  id: string,
  input: Partial<{
    name: string;
    pair: string;
    timeframe: CandleTimeframe;
    description: string;
    graph: StrategyGraph;
    isActive: boolean;
  }> &
    StrategyRiskInput
): Promise<Strategy> {
  return handle(
    await fetch(`${API_URL}/api/strategies/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function generateStrategy(
  prompt: string,
  pair?: string,
  reviewContext?: string,
  timeframe?: CandleTimeframe
): Promise<GeneratedStrategy> {
  return handle(
    await fetch(`${API_URL}/api/strategies/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, pair, reviewContext, timeframe }),
    })
  );
}

export interface StrategyOpenPositions {
  strategyId: string;
  count: number;
}

export async function fetchStrategyOpenPositions(id: string): Promise<StrategyOpenPositions> {
  return handle(await fetch(`${API_URL}/api/strategies/${id}/open-positions`));
}

export async function deleteStrategy(id: string): Promise<void> {
  await handle<{ ok: boolean }>(
    await fetch(`${API_URL}/api/strategies/${id}`, { method: "DELETE" })
  );
}

/** キャンバス上のグラフ(保存前でも可)をサーバーの過去ローソク足履歴でバックテストする(読み取り専用) */
export async function runBacktest(input: BacktestRequest): Promise<BacktestSummary> {
  return handle(
    await fetch(`${API_URL}/api/strategies/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}
