"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Stack, Text } from "@chakra-ui/react";
import type { PnlReview } from "@bitbank-ai-trader/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { requestPnlReview } from "@/lib/pnlApi";
import { stashReviewContext } from "@/lib/reviewHandoff";
import { formatCostJpy, formatDateTime } from "./format";

/**
 * 過去の決済済み取引をAIにレビューさせるパネル。
 * ボタン押下時にサーバーがPnLサマリ(ダッシュボードと同じ数字)をClaudeへ渡し、
 * 講評(良い点・懸念点・改善提案)を文章で返す。結果は保存せず、その場で表示するのみ。
 */
export function AiReviewPanel({ hasClosedTrades }: { hasClosedTrades: boolean }) {
  const router = useRouter();
  const [review, setReview] = useState<PnlReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReview = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setReview(await requestPnlReview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "レビューの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // レビュー本文をBot Blueprintページへ引き継ぎ、AI Strategy Genの参考情報として使えるようにする
  const handleUseInStrategyGen = () => {
    if (!review) return;
    stashReviewContext(review.review);
    router.push("/strategies");
  };

  return (
    <Stack gap={3}>
      <CyberButton
        variant="primary"
        onClick={handleReview}
        disabled={loading || !hasClosedTrades}
      >
        {loading ? "REVIEWING..." : "AIにレビューさせる"}
      </CyberButton>

      {!hasClosedTrades && !loading && (
        <Text fontFamily="mono" fontSize="10px" color="text.disabled">
          決済済みの取引がまだありません。取引が成立するとレビューできます。
        </Text>
      )}
      {loading && (
        <Text fontFamily="mono" fontSize="10px" color="signal.cyan">
          Claudeが取引履歴を分析中です(数十秒かかることがあります)...
        </Text>
      )}
      {error && (
        <Text fontFamily="mono" fontSize="10px" color="signal.red">
          {error}
        </Text>
      )}

      {review && (
        <Box borderTopWidth="1px" borderTopColor="border.gridCyan" pt={3}>
          <Text
            fontSize="12px"
            color="text.primary"
            lineHeight="1.9"
            whiteSpace="pre-wrap"
          >
            {review.review}
          </Text>
          <Text fontFamily="mono" fontSize="10px" color="text.disabled" mt={3}>
            {formatDateTime(review.generatedAt)} / {review.usage.model} /{" "}
            {(review.usage.inputTokens + review.usage.outputTokens).toLocaleString("ja-JP")} tok /{" "}
            {formatCostJpy(review.usage.estimatedCostJpy)}
          </Text>
          <CyberButton variant="secondary" size="sm" onClick={handleUseInStrategyGen} mt={3}>
            この内容でAI戦略を生成する(Bot Blueprintへ)
          </CyberButton>
        </Box>
      )}
    </Stack>
  );
}
