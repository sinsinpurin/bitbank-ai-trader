"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { StrategyNodeType } from "@bitbank-ai-trader/shared";
import { NODE_CATALOG, nodeAccentColor, type NodeCategory } from "./nodeCatalog";

export const DND_MIME = "application/x-blueprint-node";

const CATEGORY_LABEL: Record<NodeCategory, string> = {
  source: "Source",
  indicator: "Indicator",
  condition: "Condition",
  logic: "Logic",
  action: "Action",
};

const CATEGORY_ORDER: NodeCategory[] = ["source", "indicator", "condition", "logic", "action"];

export function NodePalette({ onAdd }: { onAdd: (type: StrategyNodeType) => void }) {
  return (
    <Stack gap={4}>
      {CATEGORY_ORDER.map((category) => {
        const defs = NODE_CATALOG.filter((d) => d.category === category);
        if (defs.length === 0) return null;
        return (
          <Stack key={category} gap={2}>
            <Text
              fontFamily="heading"
              fontSize="10px"
              fontWeight="600"
              letterSpacing="0.18em"
              textTransform="uppercase"
              color="text.disabled"
            >
              {CATEGORY_LABEL[category]}
            </Text>
            {defs.map((def) => {
              const accent = nodeAccentColor(def.type);
              return (
                <Box
                  key={def.type}
                  draggable
                  cursor="grab"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, def.type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onAdd(def.type)}
                  bg="bg.surfaceRaised"
                  borderWidth="1px"
                  borderColor="border.gridCyan"
                  px={3}
                  py={2}
                  transition="all 120ms ease"
                  _hover={{ borderColor: accent, boxShadow: `0 0 6px ${accent}66` }}
                  title={def.description}
                >
                  <HStack gap={2}>
                    <Box width="7px" height="7px" bg={accent} transform="rotate(45deg)" flexShrink={0} />
                    <Text
                      fontFamily="heading"
                      fontSize="11px"
                      fontWeight="600"
                      letterSpacing="0.12em"
                      textTransform="uppercase"
                      color="text.primary"
                    >
                      {def.label}
                    </Text>
                  </HStack>
                  <Text fontSize="10px" color="text.secondary" mt={1} lineHeight="1.5">
                    {def.description}
                  </Text>
                </Box>
              );
            })}
          </Stack>
        );
      })}
    </Stack>
  );
}
