"use client";

import { useMemo } from "react";
import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { CyberButton } from "@/components/ui/CyberButton";
import { describeGraph } from "./describeGraph";
import { STRATEGY_TEMPLATES, type StrategyTemplate } from "./strategyTemplates";

/**
 * 戦略テンプレートの一覧。各テンプレートに「どんな戦略になるか」の
 * 日本語プレビューを添えて、ワンクリックでキャンバスへ展開できる。
 */
export function TemplateGallery({ onLoad }: { onLoad: (template: StrategyTemplate) => void }) {
  const previews = useMemo(
    () => new Map(STRATEGY_TEMPLATES.map((t) => [t.id, describeGraph(t.graph)])),
    []
  );

  return (
    <Stack gap={3}>
      {STRATEGY_TEMPLATES.map((template) => {
        const preview = previews.get(template.id)!;
        return (
          <Box
            key={template.id}
            bg="bg.surfaceRaised"
            borderWidth="1px"
            borderColor="border.gridCyan"
            p={3}
          >
            <HStack justify="space-between" gap={3} mb={1}>
              <Text
                fontFamily="heading"
                fontWeight="600"
                fontSize="12px"
                letterSpacing="0.1em"
                textTransform="uppercase"
                color="signal.cyan"
              >
                {template.name}
              </Text>
              <CyberButton size="sm" variant="secondary" onClick={() => onLoad(template)}>
                Load
              </CyberButton>
            </HStack>

            <Text fontSize="11px" color="text.primary" mb={1}>
              {template.tagline}
            </Text>
            <Text fontFamily="mono" fontSize="10px" color="text.disabled" mb={2}>
              {template.flow}
            </Text>

            <Stack gap={1} borderTopWidth="1px" borderTopColor="border.gridCyan" pt={2}>
              {preview.buy.map((line, i) => (
                <HStack key={`b${i}`} gap={2} align="flex-start">
                  <Text fontFamily="heading" fontSize="10px" fontWeight="600" letterSpacing="0.12em" color="signal.green" flexShrink={0} mt="1px">
                    BUY
                  </Text>
                  <Text fontSize="11px" color="text.secondary" lineHeight="1.5">
                    {line}
                  </Text>
                </HStack>
              ))}
              {preview.sell.map((line, i) => (
                <HStack key={`s${i}`} gap={2} align="flex-start">
                  <Text fontFamily="heading" fontSize="10px" fontWeight="600" letterSpacing="0.12em" color="signal.red" flexShrink={0} mt="1px">
                    SELL
                  </Text>
                  <Text fontSize="11px" color="text.secondary" lineHeight="1.5">
                    {line}
                  </Text>
                </HStack>
              ))}
            </Stack>

            <Text fontSize="11px" color="text.secondary" mt={2} lineHeight="1.6">
              {template.description}
            </Text>
          </Box>
        );
      })}
    </Stack>
  );
}
