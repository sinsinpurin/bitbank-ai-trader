"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { Strategy } from "@bitbank-ai-trader/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { ZoneTag } from "@/components/ui/ZoneTag";

interface StrategyListProps {
  strategies: Strategy[];
  selectedId: string | null;
  onLoad: (strategy: Strategy) => void;
  onToggleActive: (strategy: Strategy) => void;
  onDelete: (strategy: Strategy) => void;
}

export function StrategyList({
  strategies,
  selectedId,
  onLoad,
  onToggleActive,
  onDelete,
}: StrategyListProps) {
  if (strategies.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        保存済みの戦略はまだありません。キャンバスで作成して保存してください。
      </Text>
    );
  }

  return (
    <Stack gap={3}>
      {strategies.map((strategy) => {
        const selected = strategy.id === selectedId;
        return (
          <Box
            key={strategy.id}
            bg="bg.surfaceRaised"
            borderWidth="1px"
            borderColor={selected ? "signal.cyan" : "border.gridCyan"}
            boxShadow={selected ? "glowCyanSm" : "none"}
            p={3}
          >
            <HStack justify="space-between" mb={2} gap={3}>
              <Text
                fontFamily="heading"
                fontWeight="600"
                fontSize="12px"
                letterSpacing="0.1em"
                textTransform="uppercase"
                color="text.primary"
                truncate
              >
                {strategy.name}
              </Text>
              <ZoneTag
                label={strategy.isActive ? "Active" : "Standby"}
                tone={strategy.isActive ? "green" : "orange"}
              />
            </HStack>
            <Text fontSize="10px" fontFamily="mono" color="text.disabled" mb={2}>
              <Box as="span" color="signal.cyan">
                {strategy.pair.toUpperCase()}
              </Box>
              {" / "}NODES {strategy.graph.nodes.length} / EDGES {strategy.graph.edges.length}
            </Text>
            <HStack gap={2}>
              <CyberButton size="sm" variant="secondary" onClick={() => onLoad(strategy)}>
                Load
              </CyberButton>
              <CyberButton
                size="sm"
                variant={strategy.isActive ? "ghost" : "primary"}
                onClick={() => onToggleActive(strategy)}
              >
                {strategy.isActive ? "Stop" : "Deploy"}
              </CyberButton>
              <CyberButton size="sm" variant="danger" onClick={() => onDelete(strategy)}>
                Del
              </CyberButton>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}
