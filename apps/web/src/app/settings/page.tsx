"use client";

import { Box, Grid, GridItem, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { SettingsResponse } from "@bitbank-ai-trader/shared";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { AiLoopControlPanel } from "@/components/settings/AiLoopControlPanel";
import { CircuitBreakerPanel } from "@/components/settings/CircuitBreakerPanel";
import { UsageSummaryTiles } from "@/components/settings/UsageSummaryTiles";
import { UsageDailyTable } from "@/components/settings/UsageDailyTable";
import { fetchSettings, updateSettings, type UpdateSettingsInput } from "@/lib/settingsApi";

const REFRESH_INTERVAL_MS = 30_000;

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await fetchSettings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定の取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleUpdate = useCallback(async (input: UpdateSettingsInput) => {
    setSaving(true);
    try {
      const result = await updateSettings(input);
      setData((prev) =>
        prev ? { ...prev, settings: result.settings, circuitBreaker: result.circuitBreaker } : prev
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定の更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <Box minH="100vh">
      <AppHeader />

      <Box px={{ base: 4, md: 10 }} py={8}>
        {error && (
          <Box mb={4} borderWidth="1px" borderColor="border.grid" bg="bg.surface" p={3}>
            <Text fontFamily="mono" fontSize="sm" color="signal.red">
              {error} — サーバー(port 4000)が起動しているか確認してください。
            </Text>
          </Box>
        )}

        {data && (
          <Grid templateColumns={{ base: "1fr", xl: "1fr 2fr" }} gap={6}>
            <GridItem>
              <CyberPanel title="AI Decision Loop" code="01 / CTRL" accent="red" delay={0}>
                <AiLoopControlPanel
                  enabled={data.settings.aiDecisionEnabled}
                  usage={data.usage}
                  saving={saving}
                  onToggle={(next) => handleUpdate({ aiDecisionEnabled: next })}
                />
              </CyberPanel>
            </GridItem>

            <GridItem>
              <CyberPanel title="Circuit Breaker / 安全装置" code="02 / SAFE" accent="red" delay={0.05}>
                <CircuitBreakerPanel
                  settings={data.settings}
                  status={data.circuitBreaker}
                  saving={saving}
                  onUpdate={handleUpdate}
                />
              </CyberPanel>
            </GridItem>

            <GridItem colSpan={{ base: 1, xl: 2 }}>
              <CyberPanel title="AI Usage / 使用量サマリ" code="03 / COST" accent="cyan" delay={0.1}>
                <UsageSummaryTiles usage={data.usage} />
              </CyberPanel>
            </GridItem>

            <GridItem colSpan={{ base: 1, xl: 2 }}>
              <CyberPanel title="Daily Usage / 日別使用量 (JST)" code="04 / LOG" accent="cyan" delay={0.15}>
                <UsageDailyTable days={data.usage.days} />
              </CyberPanel>
            </GridItem>
          </Grid>
        )}

        {!data && !error && (
          <Text fontFamily="mono" fontSize="sm" color="text.secondary">
            LOADING SETTINGS...
          </Text>
        )}
      </Box>
    </Box>
  );
}
