"use client";

import { useState } from "react";
import { Box, HStack, Input, Stack, Text } from "@chakra-ui/react";
import type { TradingMode } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { resetPaperTrading } from "@/lib/settingsApi";

const CONFIRM_WORD = "RESET";

/**
 * ペーパートレードの状態(約定履歴・ポジション・仮想残高・Botシグナル履歴)を全消去し、
 * 初期残高から再開できる状態に戻す。tradingModeが"paper"のときのみ操作できる
 * (実運用APIは呼び出さないが、将来ライブ取引に対応した際の誤リセットを防ぐガード)。
 */
export function PaperTradingResetPanel({ tradingMode }: { tradingMode: TradingMode }) {
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<"idle" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPaper = tradingMode === "paper";
  const canReset = isPaper && confirmText === CONFIRM_WORD && !resetting;

  const handleReset = async () => {
    if (!canReset) return;
    setResetting(true);
    setResult("idle");
    setErrorMessage(null);
    try {
      await resetPaperTrading();
      setResult("done");
      setConfirmText("");
    } catch (err) {
      setResult("error");
      setErrorMessage(err instanceof Error ? err.message : "リセットに失敗しました");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Stack gap={4}>
      <Box borderWidth="1px" borderColor="signal.red" bg="bg.surfaceRaised" p={3}>
        <Text
          fontFamily="heading"
          fontSize="11px"
          fontWeight="700"
          letterSpacing="0.14em"
          color="signal.red"
          mb={1}
        >
          ⚠ この操作は取り消せません
        </Text>
        <Text fontSize="xs" color="text.primary">
          約定履歴・保有ポジション・仮想残高・Botシグナル履歴を全て削除し、初期残高(¥1,000,000)から再開します。
          戦略の定義・AI利用ログ・各種設定は削除されません。
        </Text>
      </Box>

      {!isPaper && (
        <Text fontFamily="mono" fontSize="10px" color="signal.red">
          現在の取引モードは「{tradingMode}」です。リセットはペーパートレードモードでのみ実行できます。
        </Text>
      )}

      <Box>
        <Text
          fontFamily="heading"
          fontSize="10px"
          fontWeight="600"
          letterSpacing="0.12em"
          textTransform="uppercase"
          color="text.secondary"
          mb={1}
        >
          確認のため「{CONFIRM_WORD}」と入力
        </Text>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_WORD}
          disabled={!isPaper || resetting}
          size="sm"
          bg="bg.surface"
          borderColor="border.grid"
          borderRadius="0"
          fontFamily="mono"
          fontSize="12px"
          color="text.primary"
          _focus={{ borderColor: "signal.red", boxShadow: "glowRedSm" }}
        />
      </Box>

      <HStack gap={3}>
        <CyberButton size="sm" variant="danger" onClick={handleReset} disabled={!canReset}>
          {resetting ? "RESETTING..." : "ペーパートレードをリセット"}
        </CyberButton>
        {result === "done" && (
          <Text fontFamily="mono" fontSize="10px" color="signal.green">
            リセットしました
          </Text>
        )}
        {result === "error" && (
          <Text fontFamily="mono" fontSize="10px" color="signal.red">
            {errorMessage}
          </Text>
        )}
      </HStack>
    </Stack>
  );
}
