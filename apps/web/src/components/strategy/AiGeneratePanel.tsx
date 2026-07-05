"use client";

import { useState } from "react";
import { Box, Stack, Text, Textarea } from "@chakra-ui/react";
import type { GeneratedStrategy } from "@bitbank-ai-trader/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { generateStrategy } from "@/lib/strategyApi";

const EXAMPLES = [
  "RSIが30を下回ったら買い、70を超えたら売り",
  "短期EMAが長期EMAを上抜けたら買い(ゴールデンクロス)、下抜けたら売り",
  "価格が20期間SMAを上抜け、かつRSIが50以上なら買い",
];

/**
 * 自由文の要望からAIに戦略グラフを生成させるパネル。
 * 生成結果は保存せず、onGeneratedでエディタのキャンバスへ展開する。
 */
export function AiGeneratePanel({
  onGenerated,
}: {
  onGenerated: (result: GeneratedStrategy) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      onGenerated(await generateStrategy(trimmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap={3}>
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
