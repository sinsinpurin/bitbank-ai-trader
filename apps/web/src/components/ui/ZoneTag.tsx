"use client";

import { Box, HStack, Text } from "@chakra-ui/react";
import { notch } from "@/theme";
import { SIGNAL_COLOR, type SignalAccent } from "./CyberPanel";

/**
 * Zone Tag / Badge(デザインシステム 6.3)。
 * 4色運用固定: Safe(green) / Public(cyan) / Restricted(orange) / Danger(red)
 */
export function ZoneTag({ label, tone }: { label: string; tone: SignalAccent }) {
  const color = SIGNAL_COLOR[tone];
  return (
    <HStack
      display="inline-flex"
      gap={2}
      px={3.5}
      py={2}
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.grid"
      css={{ clipPath: notch.sm }}
    >
      <Box width="7px" height="7px" borderRadius="full" bg={color} />
      <Text
        fontFamily="heading"
        fontSize="11px"
        fontWeight="500"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="text.primary"
        lineHeight="1"
      >
        {label}
      </Text>
    </HStack>
  );
}
