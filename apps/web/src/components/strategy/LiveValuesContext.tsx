"use client";

import { createContext, useContext } from "react";
import type { NodeLiveValue } from "@noctas/shared";

/**
 * 現在の相場データでキャンバス上の各ノードを評価した最新値。
 * nullはまだデータ未取得(サーバー未接続など)を表す。
 */
export const LiveValuesContext = createContext<Record<string, NodeLiveValue> | null>(null);

export function useLiveNodeValue(nodeId: string): NodeLiveValue | undefined {
  const values = useContext(LiveValuesContext);
  if (!values) return undefined;
  return values[nodeId];
}
