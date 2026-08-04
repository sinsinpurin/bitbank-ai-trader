"use client";

import { Dialog, HStack, Portal, Text } from "@chakra-ui/react";
import { CyberButton } from "./CyberButton";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 確認文言(既存のwindow.confirmで表示していた文言をそのまま使う) */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** red=削除など不可逆な操作、cyan=キャンバス置き換えなど */
  tone?: "red" | "cyan";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * window.confirm()の代替となる非ブロッキングな確認ダイアログ。
 * ネイティブconfirm()は非同期処理の継続(Promiseのcontinuation)から呼ぶと、
 * 直後にあるフォーム要素(select等)の入力ルーティングがブラウザによっては
 * 詰まることがあるため、キャンバス置き換え/テンプレート読み込み/削除の
 * 確認にはこちらを使う(#29)。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
  tone = "cyan",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const accent = tone === "red" ? "signal.red" : "signal.cyan";
  const borderColor = tone === "red" ? "border.grid" : "border.gridCyan";

  return (
    <Dialog.Root
      open={open}
      role="alertdialog"
      placement="center"
      onOpenChange={(details) => {
        if (!details.open) onCancel();
      }}
    >
      <Portal>
        <Dialog.Backdrop bg="rgba(5,5,8,0.72)" />
        <Dialog.Positioner>
          <Dialog.Content
            bg="bg.surface"
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="0"
            boxShadow="elevationPanel"
            maxW="420px"
            p={5}
          >
            <Dialog.Title
              fontFamily="heading"
              fontSize="12px"
              fontWeight="600"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color={accent}
              mb={3}
            >
              {title}
            </Dialog.Title>
            <Dialog.Description asChild>
              <Text fontSize="13px" color="text.primary" lineHeight="1.8" mb={5}>
                {description}
              </Text>
            </Dialog.Description>
            <HStack gap={3} justify="flex-end">
              {/*
                role="alertdialog"時、Zag(@zag-js/dialog)は初期フォーカスを
                CloseTrigger要素(getCloseTriggerEl)に当てようとする。実DOM上に
                CloseTriggerが存在しないとfocus-trapが例外を投げ(trapFocus内で
                握り潰され)、フォーカス管理自体が機能しなくなる。Cancel=閉じる
                という意味も一致するため、asChildでCyberButtonをCloseTriggerに
                する(Confirm側は実処理を伴うためCloseTriggerにしない)。
              */}
              <Dialog.CloseTrigger asChild>
                <CyberButton variant="ghost" size="sm">
                  {cancelLabel}
                </CyberButton>
              </Dialog.CloseTrigger>
              <CyberButton
                variant={tone === "red" ? "danger" : "primary"}
                size="sm"
                onClick={onConfirm}
              >
                {confirmLabel}
              </CyberButton>
            </HStack>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
