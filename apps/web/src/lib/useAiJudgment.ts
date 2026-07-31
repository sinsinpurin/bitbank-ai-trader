"use client";

import { useEffect, useState } from "react";
import type { AiJudgment } from "@noctas/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 15_000;

interface AiJudgmentResponse {
  pair: string;
  judgment: AiJudgment | null;
}

/**
 * サーバーが保持するペアごとの最新AI判断キャッシュをポーリングで取得する。
 * Bot Blueprintエディタの「AI Judgment」ノードのライブプレビュー表示に使う。
 * 未取得(judgment=null)は「まだAI呼び出しが行われていない」ことを示す。
 */
export function useAiJudgment(pair?: string): AiJudgment | null {
  const [judgment, setJudgment] = useState<AiJudgment | null>(null);

  useEffect(() => {
    let cancelled = false;
    setJudgment(null);
    if (!pair) return;

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ai-judgment?pair=${pair}`);
        if (!res.ok) return;
        const data = (await res.json()) as AiJudgmentResponse;
        if (!cancelled) setJudgment(data.judgment);
      } catch {
        // サーバー未起動時は静かにリトライ
      }
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pair]);

  return judgment;
}
