"use client";

import { Box, Input, SimpleGrid, Text } from "@chakra-ui/react";

/**
 * エディタ上で編集する戦略リスク設定。入力中は文字列で保持し、保存時に数値へ変換する。
 * 空欄はグローバル設定(サーバーのconfig.risk)へのフォールバックを意味する。
 */
export interface RiskFormValues {
  positionSizeJpy: string;
  maxOpenPositions: string;
  stopLossPct: string;
  takeProfitPct: string;
  trailingStopPct: string;
}

export const EMPTY_RISK_FORM: RiskFormValues = {
  positionSizeJpy: "",
  maxOpenPositions: "",
  stopLossPct: "",
  takeProfitPct: "",
  trailingStopPct: "",
};

/** 数値|null(API形式)→フォーム文字列 */
export function riskFormFromStrategy(values: {
  positionSizeJpy: number | null;
  maxOpenPositions: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  trailingStopPct: number | null;
}): RiskFormValues {
  const s = (v: number | null) => (v === null ? "" : String(v));
  return {
    positionSizeJpy: s(values.positionSizeJpy),
    maxOpenPositions: s(values.maxOpenPositions),
    stopLossPct: s(values.stopLossPct),
    takeProfitPct: s(values.takeProfitPct),
    trailingStopPct: s(values.trailingStopPct),
  };
}

/**
 * フォーム文字列→API形式(空欄はnull=グローバル設定)。不正値はエラーメッセージを返す。
 * maxPositionJpyはサーバーのAI_MAX_POSITION_JPY(GET /api/pairsから取得)。
 * 投入額はこの上限を超えて入力できない(サーバー側でも同じ上限を検証する)。
 */
export function riskFormToInput(form: RiskFormValues, maxPositionJpy: number):
  | {
      ok: true;
      value: {
        positionSizeJpy: number | null;
        maxOpenPositions: number | null;
        stopLossPct: number | null;
        takeProfitPct: number | null;
        trailingStopPct: number | null;
      };
    }
  | { ok: false; error: string } {
  const parse = (
    raw: string,
    label: string,
    { integer = false, allowZero = false } = {}
  ): { ok: true; value: number | null } | { ok: false; error: string } => {
    // 空欄(null=グローバル設定)と「0」は別物として扱う。0を許すのは利確%だけで、
    // そこでは「利確を使わない」という明示指定を意味する
    if (raw.trim() === "") return { ok: true, value: null };
    const n = Number(raw);
    if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0) || (integer && !Number.isInteger(n))) {
      return {
        ok: false,
        error: `${label}は${allowZero ? "0以上" : "正"}の${integer ? "整数" : "数値"}で入力してください`,
      };
    }
    return { ok: true, value: n };
  };

  const size = parse(form.positionSizeJpy, "投入額");
  if (!size.ok) return size;
  if (size.value !== null && size.value > maxPositionJpy) {
    return {
      ok: false,
      error: `投入額は上限(¥${maxPositionJpy.toLocaleString("ja-JP")})以下で入力してください`,
    };
  }
  const maxPos = parse(form.maxOpenPositions, "最大ポジション数", { integer: true });
  if (!maxPos.ok) return maxPos;
  const sl = parse(form.stopLossPct, "損切り%");
  if (!sl.ok) return sl;
  const tp = parse(form.takeProfitPct, "利確%", { allowZero: true });
  if (!tp.ok) return tp;
  const trail = parse(form.trailingStopPct, "トレーリング%");
  if (!trail.ok) return trail;

  return {
    ok: true,
    value: {
      positionSizeJpy: size.value,
      maxOpenPositions: maxPos.value,
      stopLossPct: sl.value,
      takeProfitPct: tp.value,
      trailingStopPct: trail.value,
    },
  };
}

export function RiskSettingsPanel({
  values,
  onChange,
  maxPositionJpy,
}: {
  values: RiskFormValues;
  onChange: (next: RiskFormValues) => void;
  /** サーバーのAI_MAX_POSITION_JPY(GET /api/pairs由来)。投入額欄の上限表示・placeholderに使う */
  maxPositionJpy: number;
}) {
  const fields: { key: keyof RiskFormValues; label: string; placeholder: string }[] = [
    {
      key: "positionSizeJpy",
      label: "投入額 (円/回)",
      placeholder: `上限: ${maxPositionJpy.toLocaleString("ja-JP")}`,
    },
    { key: "maxOpenPositions", label: "最大ポジション数", placeholder: "既定: 3 (ペア全体)" },
    { key: "stopLossPct", label: "損切り %", placeholder: "既定: 3" },
    { key: "takeProfitPct", label: "利確 %", placeholder: "空欄=既定5 / 0=無効" },
    { key: "trailingStopPct", label: "トレーリング %", placeholder: "なし" },
  ];

  return (
    <Box>
      <SimpleGrid columns={{ base: 2, md: 5 }} gap={3}>
        {fields.map((field) => (
          <Box key={field.key}>
            <Text
              fontFamily="heading"
              fontSize="10px"
              fontWeight="600"
              letterSpacing="0.12em"
              textTransform="uppercase"
              color="text.secondary"
              mb={1}
            >
              {field.label}
            </Text>
            <Input
              value={values[field.key]}
              onChange={(e) => onChange({ ...values, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              size="sm"
              bg="bg.surface"
              borderColor="border.gridCyan"
              borderRadius="0"
              fontFamily="mono"
              fontSize="12px"
              color="text.primary"
              _focus={{ borderColor: "signal.cyan", boxShadow: "glowCyanSm" }}
            />
          </Box>
        ))}
      </SimpleGrid>
      <Text fontFamily="mono" fontSize="10px" color="text.disabled" mt={2}>
        空欄はグローバル設定を使用(利確%の既定は AI_TAKE_PROFIT_PCT = 5%)。投入額は上限¥
        {maxPositionJpy.toLocaleString("ja-JP")}
        (AI_MAX_POSITION_JPY)を超えて設定できません。利確%は「空欄=既定5%を適用」「0=利確を無効化
        (トレーリング/損切りのみで運用)」で意味が異なります。0以外の値は往復コスト(手数料+
        スリッページの2回分)に対する安全マージンを下回る値を設定できません。トレーリングは設定した
        戦略のポジションにのみ適用され、Save時にこの戦略の設定として保存されます
        (既存ポジションには影響しません)。
      </Text>
    </Box>
  );
}
