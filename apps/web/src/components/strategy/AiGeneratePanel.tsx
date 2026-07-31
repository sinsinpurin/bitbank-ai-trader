"use client";

import { useEffect, useState } from "react";
import { Box, Stack, Text, Textarea } from "@chakra-ui/react";
import type { GeneratedStrategy } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { generateStrategy } from "@/lib/strategyApi";

const EXAMPLES = [
  "RSIが30を下回ったら買い、70を超えたら売り",
  "短期EMAが長期EMAを上抜けたら買い(ゴールデンクロス)、下抜けたら売り",
  "価格が20期間SMAを上抜け、かつRSIが50以上なら買い",
];

// 取引レビューを参照した状態で要望欄が空のまま生成される事故を防ぐための既定文言
const REVIEW_DEFAULT_PROMPT = "直近の取引レビューの改善提案を踏まえた戦略を設計してください";

/**
 * 自由文の要望からAIに戦略グラフを生成させるパネル。
 * 生成結果は保存せず、onGeneratedでエディタのキャンバスへ展開する。
 */
export function AiGeneratePanel({
  pair,
  onGenerated,
  initialReviewContext,
}: {
  /** 生成対象のペア(エディタで選択中のもの) */
  pair?: string;
  onGenerated: (result: GeneratedStrategy) => void;
  /** P&L ReportのAI Reviewから引き継いだ参考テキスト(あれば生成プロンプトへ組み込む) */
  initialReviewContext?: string | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [reviewContext, setReviewContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // initialReviewContextはページ側がsessionStorageから読み込んだ後に届く(マウント後の非同期更新)ため、
  // propの変化を検知して取り込む。既に何か入力済みならプロンプトは上書きしない。
  useEffect(() => {
    if (!initialReviewContext) return;
    setReviewContext(initialReviewContext);
    setPrompt((prev) => (prev.trim() ? prev : REVIEW_DEFAULT_PROMPT));
  }, [initialReviewContext]);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      onGenerated(await generateStrategy(trimmed, pair, reviewContext ?? undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={3}>
      {reviewContext && (
        <Box borderWidth="1px" borderColor="border.gridCyan" bg="bg.surface" p={2}>
          <Text fontFamily="mono" fontSize="10px" color="signal.cyan" mb={1}>
            取引レビューを参照して生成します:
          </Text>
          <Text
            fontSize="11px"
            color="text.secondary"
            lineHeight="1.7"
            maxH="120px"
            overflowY="auto"
            whiteSpace="pre-wrap"
          >
            {reviewContext}
          </Text>
          <CyberButton variant="ghost" size="sm" onClick={() => setReviewContext(null)} mt={2}>
            参照を外す
          </CyberButton>
        </Box>
      )}

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={`どんな戦略にしたいか日本語で入力\n例: ${EXAMPLES[0]}`}
        rows={3}
        bg="bg.surface"
        borderColor="border.gridCyan"
        borderRadius="0"
        fontSize="12px"
        color="text.primary"
        _focus={{ borderColor: "signal.cyan", boxShadow: "glowCyanSm" }}
        disabled={loading}
      />

      <CyberButton variant="primary" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
        {loading ? "GENERATING..." : "AIで戦略を生成"}
      </CyberButton>

      {loading && (
        <Text fontFamily="mono" fontSize="10px" color="signal.cyan">
          Claudeが戦略グラフを設計中です(数十秒かかることがあります)...
        </Text>
      )}
      {error && (
        <Text fontFamily="mono" fontSize="10px" color="signal.red">
          {error}
        </Text>
      )}

      <Box borderTopWidth="1px" borderTopColor="border.gridCyan" pt={2}>
        <Text fontFamily="mono" fontSize="10px" color="text.disabled" mb={1}>
          入力例(クリックでセット):
        </Text>
        <Stack gap={1}>
          {EXAMPLES.map((example) => (
            <Text
              key={example}
              fontSize="10px"
              color="text.secondary"
              cursor="pointer"
              _hover={{ color: "signal.cyan" }}
              onClick={() => !loading && setPrompt(example)}
            >
              ・{example}
            </Text>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
