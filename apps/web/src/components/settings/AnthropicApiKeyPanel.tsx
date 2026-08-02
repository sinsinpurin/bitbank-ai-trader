"use client";

import { useState } from "react";
import { Box, HStack, Input, Stack, Text } from "@chakra-ui/react";
import type { AppSettings } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import type { UpdateSettingsInput } from "@/lib/settingsApi";

/**
 * Anthropic APIキーの設定。保存するとDBに永続化され、サーバー再起動なしで即座に反映される。
 * 保存済みキーが無い場合のみ環境変数 ANTHROPIC_API_KEY が使われる。
 * サーバーは生値を返さないため、ここでは設定済みかどうかと末尾4文字のみを扱う。
 */
export function AnthropicApiKeyPanel({
  settings,
  saving,
  onUpdate,
}: {
  settings: AppSettings;
  saving: boolean;
  /** 保存できたらtrueを返す。失敗時は入力欄の値を消さずに残す */
  onUpdate: (input: UpdateSettingsInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const configured = settings.anthropicApiKeyConfigured;
  const fromDb = settings.anthropicApiKeySource === "db";
  const showInput = !configured || editing;

  const handleSave = async () => {
    const value = draft.trim();
    if (!value) {
      setFormError("APIキーを入力してください");
      return;
    }
    setFormError(null);
    const saved = await onUpdate({ anthropicApiKey: value });
    if (!saved) {
      setFormError("APIキーを保存できませんでした。入力内容はそのまま残しています");
      return;
    }
    // 保存できたときだけ、生の入力値をstateから消す
    setDraft("");
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft("");
    setEditing(false);
    setFormError(null);
  };

  const handleDelete = async () => {
    setFormError(null);
    if (!(await onUpdate({ anthropicApiKey: null }))) {
      setFormError("APIキーを削除できませんでした");
    }
  };

  return (
    <Stack gap={4}>
      <Text fontSize="xs" color="text.secondary">
        AI Judgmentノード・戦略のAI生成・取引レビューはいずれもこのキーを使います。未設定の場合、これらの機能は利用できません
        (Bot戦略の技術的条件・自動損切りはキー無しでも動作します)。
      </Text>

      {configured && (
        <HStack gap={3} flexWrap="wrap">
          <Box
            borderWidth="1px"
            borderColor="border.grid"
            bg="bg.surfaceRaised"
            px={3}
            py={2}
            fontFamily="mono"
            fontSize="12px"
            color="text.primary"
          >
            {settings.anthropicApiKeyMasked}
          </Box>
          <Text fontFamily="mono" fontSize="10px" color={fromDb ? "signal.green" : "text.secondary"}>
            {fromDb ? "アプリで設定済み" : "環境変数から読み込み中"}
          </Text>
        </HStack>
      )}

      {showInput && (
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
            {configured ? "新しいAPIキー" : "APIキー"}
          </Text>
          <Input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-..."
            disabled={saving}
            size="sm"
            bg="bg.surface"
            borderColor="border.grid"
            borderRadius="0"
            fontFamily="mono"
            fontSize="12px"
            color="text.primary"
            _focus={{ borderColor: "signal.cyan", boxShadow: "glowCyanSm" }}
          />
        </Box>
      )}

      <HStack gap={3} flexWrap="wrap">
        {showInput && (
          <CyberButton size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "SAVING..." : "保存"}
          </CyberButton>
        )}
        {showInput && configured && (
          <CyberButton size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
            キャンセル
          </CyberButton>
        )}
        {configured && !editing && (
          <CyberButton size="sm" onClick={() => setEditing(true)} disabled={saving}>
            変更
          </CyberButton>
        )}
        {configured && fromDb && !editing && (
          <CyberButton size="sm" variant="danger" onClick={() => void handleDelete()} disabled={saving}>
            削除
          </CyberButton>
        )}
      </HStack>

      {formError && (
        <Text fontFamily="mono" fontSize="10px" color="signal.red">
          {formError}
        </Text>
      )}

      <Text fontFamily="mono" fontSize="10px" color="text.secondary">
        保存したキーはこの端末のローカルDBに保存され、画面には末尾4文字のみ表示されます。削除すると環境変数
        ANTHROPIC_API_KEY の値に戻ります。
      </Text>
    </Stack>
  );
}
