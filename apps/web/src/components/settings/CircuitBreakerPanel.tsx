"use client";

import { useEffect, useState } from "react";
import { Box, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { AppSettings, CircuitBreakerStatus } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import type { UpdateSettingsInput } from "@/lib/settingsApi";

/**
 * サーキットブレーカーの設定と発動状態。
 * 日次最大損失で全Botの新規買いを停止し、連敗した戦略を自動Standbyにする安全装置。
 */
export function CircuitBreakerPanel({
  settings,
  status,
  saving,
  onUpdate,
}: {
  settings: AppSettings;
  status: CircuitBreakerStatus;
  saving: boolean;
  onUpdate: (input: UpdateSettingsInput) => void;
}) {
  const [dailyMaxLoss, setDailyMaxLoss] = useState(String(settings.dailyMaxLossJpy));
  const [maxLosses, setMaxLosses] = useState(String(settings.maxConsecutiveLosses));
  const [formError, setFormError] = useState<string | null>(null);

  // サーバー値が変わったらフォームへ反映(他タブでの変更・保存後の再取得)
  useEffect(() => {
    setDailyMaxLoss(String(settings.dailyMaxLossJpy));
    setMaxLosses(String(settings.maxConsecutiveLosses));
  }, [settings.dailyMaxLossJpy, settings.maxConsecutiveLosses]);

  const handleSaveLimits = () => {
    const loss = Number(dailyMaxLoss);
    const losses = Number(maxLosses);
    if (!Number.isFinite(loss) || loss <= 0) {
      setFormError("日次最大損失は正の数値で入力してください");
      return;
    }
    if (!Number.isInteger(losses) || losses < 2) {
      setFormError("連敗数は2以上の整数で入力してください");
      return;
    }
    setFormError(null);
    onUpdate({ dailyMaxLossJpy: loss, maxConsecutiveLosses: losses });
  };

  return (
    <Stack gap={4}>
      {status.halted && (
        <Box borderWidth="1px" borderColor="signal.red" bg="bg.surfaceRaised" p={3}>
          <Text fontFamily="heading" fontSize="11px" fontWeight="700" letterSpacing="0.14em" color="signal.red" mb={1}>
            ⚠ CIRCUIT BREAKER ACTIVE
          </Text>
          <Text fontSize="xs" color="text.primary" mb={2}>
            {status.reason}
          </Text>
          <Text fontFamily="mono" fontSize="10px" color="text.secondary" mb={2}>
            新規買いを停止中(決済・損切り・利確は動作します)。日付が変わると自動解除されます。
          </Text>
          <CyberButton size="sm" variant="danger" onClick={() => onUpdate({ resumeTrading: true })} disabled={saving}>
            停止を手動解除
          </CyberButton>
        </Box>
      )}

      <HStack justify="space-between" flexWrap="wrap" gap={3}>
        <Box>
          <HStack gap={2}>
            <Box
              width="8px"
              height="8px"
              bg={settings.circuitBreakerEnabled ? "signal.green" : "text.disabled"}
              boxShadow={settings.circuitBreakerEnabled ? "0 0 8px rgba(57,255,136,.6)" : "none"}
            />
            <Text fontFamily="heading" fontSize="13px" fontWeight="700" letterSpacing="0.1em" color="text.primary">
              {settings.circuitBreakerEnabled ? "ARMED" : "DISARMED"}
            </Text>
          </HStack>
          <Text fontSize="xs" color="text.secondary" mt={1}>
            日次最大損失で新規買いを全停止し、連敗した戦略を自動Standbyにします
          </Text>
        </Box>
        <CyberButton
          variant={settings.circuitBreakerEnabled ? "danger" : "primary"}
          onClick={() => onUpdate({ circuitBreakerEnabled: !settings.circuitBreakerEnabled })}
          disabled={saving}
        >
          {saving ? "SAVING..." : settings.circuitBreakerEnabled ? "無効にする" : "有効にする"}
        </CyberButton>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <Box>
          <Text fontFamily="heading" fontSize="10px" fontWeight="600" letterSpacing="0.12em" textTransform="uppercase" color="text.secondary" mb={1}>
            日次最大損失 (円)
          </Text>
          <Input
            value={dailyMaxLoss}
            onChange={(e) => setDailyMaxLoss(e.target.value)}
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
        <Box>
          <Text fontFamily="heading" fontSize="10px" fontWeight="600" letterSpacing="0.12em" textTransform="uppercase" color="text.secondary" mb={1}>
            戦略の自動停止連敗数
          </Text>
          <Input
            value={maxLosses}
            onChange={(e) => setMaxLosses(e.target.value)}
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
      </SimpleGrid>

      <HStack gap={3}>
        <CyberButton size="sm" variant="secondary" onClick={handleSaveLimits} disabled={saving}>
          しきい値を保存
        </CyberButton>
        {formError && (
          <Text fontFamily="mono" fontSize="10px" color="signal.red">
            {formError}
          </Text>
        )}
      </HStack>
    </Stack>
  );
}
