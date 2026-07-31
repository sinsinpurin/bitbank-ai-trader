"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, HStack, Input, Stack, Text, chakra } from "@chakra-ui/react";
import type { SignalOperand, SignalWatch, SignalWatchConfig } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import {
  createSignalWatch,
  deleteSignalWatch,
  fetchSignalWatches,
  updateSignalWatch,
} from "@/lib/signalsApi";
import { evaluateSignal, signalLabel } from "@/lib/signalEval";
import { useMultiPairCandles } from "@/lib/useMultiPairCandles";
import { pairLabel } from "@/lib/pairs";

/**
 * カスタムシグナルモニター。
 * 「RSI(14) < 30」のような監視条件を自由に登録し、戦略エディタと同じ評価エンジンで
 * 現在値と成立◯/✕をリアルタイム表示する(発注はしない)。
 */

type OperandType = SignalOperand["type"];

interface FormState {
  name: string;
  pair: string;
  leftType: OperandType;
  leftPeriod: string;
  op: SignalWatchConfig["op"];
  rightType: OperandType;
  rightPeriod: string;
  rightValue: string;
}

const DEFAULT_FORM = (pair: string): FormState => ({
  name: "",
  pair,
  leftType: "rsi",
  leftPeriod: "14",
  op: "lt",
  rightType: "constant",
  rightPeriod: "20",
  rightValue: "30",
});

const OPERAND_OPTIONS: { value: OperandType; label: string }[] = [
  { value: "price", label: "価格" },
  { value: "sma", label: "SMA" },
  { value: "ema", label: "EMA" },
  { value: "rsi", label: "RSI" },
  { value: "constant", label: "固定値" },
];

const OP_OPTIONS: { value: SignalWatchConfig["op"]; label: string }[] = [
  { value: "gt", label: "> より大きい" },
  { value: "lt", label: "< より小さい" },
  { value: "gte", label: "≥ 以上" },
  { value: "lte", label: "≤ 以下" },
  { value: "cross_above", label: "↑ 上抜けした瞬間" },
  { value: "cross_below", label: "↓ 下抜けした瞬間" },
];

const selectStyle = {
  bg: "bg.surface",
  borderWidth: "1px",
  borderColor: "border.gridCyan",
  borderRadius: "0",
  fontFamily: "mono",
  fontSize: "11px",
  color: "text.primary",
  px: 2,
  py: 1.5,
  cursor: "pointer",
} as const;

function needsPeriod(type: OperandType) {
  return type === "sma" || type === "ema" || type === "rsi";
}

function operandFromForm(
  type: OperandType,
  period: string,
  value: string
): { ok: true; operand: SignalOperand } | { ok: false; error: string } {
  if (type === "constant") {
    const n = Number(value);
    if (!Number.isFinite(n)) return { ok: false, error: "固定値は数値で入力してください" };
    return { ok: true, operand: { type, value: n } };
  }
  if (needsPeriod(type)) {
    const p = Number(period);
    const min = type === "rsi" ? 2 : 1;
    if (!Number.isInteger(p) || p < min || p > 400) {
      return { ok: false, error: `期間は${min}〜400の整数で入力してください` };
    }
    return { ok: true, operand: { type, period: p } };
  }
  return { ok: true, operand: { type } };
}

function formFromWatch(watch: SignalWatch): FormState {
  const { left, op, right } = watch.config;
  return {
    name: watch.name,
    pair: watch.pair,
    leftType: left.type,
    leftPeriod: String(left.period ?? 14),
    op,
    rightType: right.type,
    rightPeriod: String(right.period ?? 20),
    rightValue: String(right.value ?? 0),
  };
}

export function SignalMonitorPanel({ pairs }: { pairs: string[] }) {
  const [watches, setWatches] = useState<SignalWatch[]>([]);
  const [form, setForm] = useState<FormState | null>(null); // null=フォーム非表示
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const watchPairs = useMemo(() => watches.map((w) => w.pair), [watches]);
  const closesByPair = useMultiPairCandles(watchPairs);

  const refresh = useCallback(async () => {
    try {
      setWatches(await fetchSignalWatches());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "シグナルの取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const set = (patch: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSubmit = async () => {
    if (!form) return;
    const left = operandFromForm(form.leftType, form.leftPeriod, "");
    if (!left.ok) return setError(left.error);
    if (left.operand.type === "constant") return setError("左辺には価格または指標を指定してください");
    const right = operandFromForm(form.rightType, form.rightPeriod, form.rightValue);
    if (!right.ok) return setError(right.error);

    const input = {
      name: form.name.trim(),
      pair: form.pair,
      config: { left: left.operand, op: form.op, right: right.operand },
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateSignalWatch(editingId, input);
      } else {
        await createSignalWatch(input);
      }
      setForm(null);
      setEditingId(null);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (watch: SignalWatch) => {
    if (!window.confirm(`シグナル「${watch.name || signalLabel(watch.config)}」を削除しますか?`)) return;
    try {
      await deleteSignalWatch(watch.id);
      if (editingId === watch.id) {
        setForm(null);
        setEditingId(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const fmt = (v: number | null) =>
    v === null ? "--" : v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });

  return (
    <Stack gap={3}>
      {watches.length === 0 && !form && (
        <Text fontSize="sm" color="text.disabled">
          監視条件はまだありません。「+ 条件を追加」から作成してください。
        </Text>
      )}

      {watches.map((watch) => {
        const closes = closesByPair[watch.pair] ?? [];
        const evaluation = closes.length >= 2 ? evaluateSignal(watch.config, closes) : null;
        const met = evaluation?.met ?? false;
        return (
          <Box
            key={watch.id}
            position="relative"
            bg="bg.surfaceRaised"
            p={2.5}
            pl={4}
            _before={{
              content: '""',
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "4px",
              bg: met ? "#39FF88" : "#4B4B55",
            }}
          >
            <HStack justify="space-between" gap={3}>
              <Box minW={0}>
                <HStack gap={2}>
                  <Text fontFamily="mono" fontSize="10px" color="signal.cyan" flexShrink={0}>
                    {pairLabel(watch.pair)}
                  </Text>
                  <Text fontFamily="heading" fontSize="11px" fontWeight="600" color="text.primary" truncate>
                    {watch.name || signalLabel(watch.config)}
                  </Text>
                </HStack>
                <Text fontFamily="mono" fontSize="10px" color="text.secondary" mt={0.5}>
                  {evaluation
                    ? `L: ${fmt(evaluation.leftValue)} / R: ${fmt(evaluation.rightValue)}`
                    : "データ取得中..."}
                </Text>
              </Box>
              <HStack gap={2} flexShrink={0}>
                <Text
                  fontFamily="heading"
                  fontSize="11px"
                  fontWeight="700"
                  letterSpacing="0.1em"
                  color={met ? "signal.green" : "text.disabled"}
                >
                  {met ? "◯ 成立" : "✕"}
                </Text>
                <CyberButton
                  size="sm"
                  variant="ghost"
                  px={2}
                  py={1}
                  onClick={() => {
                    setForm(formFromWatch(watch));
                    setEditingId(watch.id);
                    setError(null);
                  }}
                >
                  編集
                </CyberButton>
                <CyberButton size="sm" variant="danger" px={2} py={1} onClick={() => handleDelete(watch)}>
                  ✕
                </CyberButton>
              </HStack>
            </HStack>
          </Box>
        );
      })}

      {form ? (
        <Box borderWidth="1px" borderColor="border.gridCyan" p={3}>
          <Stack gap={2}>
            <HStack gap={2} flexWrap="wrap">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="表示名(空欄で自動)"
                size="sm"
                maxW="180px"
                bg="bg.surface"
                borderColor="border.gridCyan"
                borderRadius="0"
                fontSize="11px"
                color="text.primary"
              />
              <chakra.select {...selectStyle} value={form.pair} onChange={(e) => set({ pair: e.target.value })}>
                {pairs.map((p) => (
                  <option key={p} value={p} style={{ background: "#131318" }}>
                    {pairLabel(p)}
                  </option>
                ))}
              </chakra.select>
            </HStack>

            <HStack gap={2} flexWrap="wrap">
              <chakra.select
                {...selectStyle}
                value={form.leftType}
                onChange={(e) => set({ leftType: e.target.value as OperandType })}
              >
                {OPERAND_OPTIONS.filter((o) => o.value !== "constant").map((o) => (
                  <option key={o.value} value={o.value} style={{ background: "#131318" }}>
                    {o.label}
                  </option>
                ))}
              </chakra.select>
              {needsPeriod(form.leftType) && (
                <Input
                  value={form.leftPeriod}
                  onChange={(e) => set({ leftPeriod: e.target.value })}
                  size="sm"
                  maxW="70px"
                  placeholder="期間"
                  bg="bg.surface"
                  borderColor="border.gridCyan"
                  borderRadius="0"
                  fontFamily="mono"
                  fontSize="11px"
                  color="text.primary"
                />
              )}
              <chakra.select
                {...selectStyle}
                value={form.op}
                onChange={(e) => set({ op: e.target.value as SignalWatchConfig["op"] })}
              >
                {OP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} style={{ background: "#131318" }}>
                    {o.label}
                  </option>
                ))}
              </chakra.select>
              <chakra.select
                {...selectStyle}
                value={form.rightType}
                onChange={(e) => set({ rightType: e.target.value as OperandType })}
              >
                {OPERAND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} style={{ background: "#131318" }}>
                    {o.label}
                  </option>
                ))}
              </chakra.select>
              {form.rightType === "constant" ? (
                <Input
                  value={form.rightValue}
                  onChange={(e) => set({ rightValue: e.target.value })}
                  size="sm"
                  maxW="110px"
                  placeholder="値"
                  bg="bg.surface"
                  borderColor="border.gridCyan"
                  borderRadius="0"
                  fontFamily="mono"
                  fontSize="11px"
                  color="text.primary"
                />
              ) : (
                needsPeriod(form.rightType) && (
                  <Input
                    value={form.rightPeriod}
                    onChange={(e) => set({ rightPeriod: e.target.value })}
                    size="sm"
                    maxW="70px"
                    placeholder="期間"
                    bg="bg.surface"
                    borderColor="border.gridCyan"
                    borderRadius="0"
                    fontFamily="mono"
                    fontSize="11px"
                    color="text.primary"
                  />
                )
              )}
            </HStack>

            <HStack gap={2}>
              <CyberButton size="sm" variant="primary" onClick={handleSubmit} disabled={saving}>
                {saving ? "..." : editingId ? "更新" : "追加"}
              </CyberButton>
              <CyberButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(null);
                  setEditingId(null);
                  setError(null);
                }}
              >
                キャンセル
              </CyberButton>
            </HStack>
          </Stack>
        </Box>
      ) : (
        <CyberButton size="sm" variant="secondary" onClick={() => setForm(DEFAULT_FORM(pairs[0] ?? "btc_jpy"))}>
          + 条件を追加
        </CyberButton>
      )}

      {error && (
        <Text fontFamily="mono" fontSize="10px" color="signal.red">
          {error}
        </Text>
      )}
      <Text fontFamily="mono" fontSize="9px" color="text.disabled">
        1分足×10秒更新で評価。↑↓クロス条件は「その足で交差した瞬間」のみ◯になります。発注はしません。
      </Text>
    </Stack>
  );
}
