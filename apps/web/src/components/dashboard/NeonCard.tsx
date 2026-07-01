"use client";

import { Box, Heading, HStack, type BoxProps } from "@chakra-ui/react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface NeonCardProps extends BoxProps {
  title: string;
  accent?: "yellow" | "cyan" | "crimson" | "darkred";
  icon?: ReactNode;
  delay?: number;
  children: ReactNode;
}

const ACCENT: Record<
  NonNullable<NeonCardProps["accent"]>,
  { color: string; glow: string }
> = {
  yellow: { color: "#f3e600", glow: "rgba(243, 230, 0, 0.35)" },
  cyan: { color: "#55ead4", glow: "rgba(85, 234, 212, 0.32)" },
  crimson: { color: "#c5003c", glow: "rgba(197, 0, 60, 0.4)" },
  darkred: { color: "#e0355f", glow: "rgba(136, 4, 37, 0.45)" },
};

export function NeonCard({
  title,
  accent = "cyan",
  icon,
  delay = 0,
  children,
  ...rest
}: NeonCardProps) {
  const { color, glow } = ACCENT[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <Box
        position="relative"
        bg="#0d0b08"
        borderWidth="1px"
        borderColor="whiteAlpha.200"
        borderRadius="lg"
        p={5}
        overflow="hidden"
        boxShadow={`inset 0 0 40px -28px ${glow}, 0 0 24px -12px ${glow}`}
        {...rest}
      >
        <HStack mb={4} gap={2}>
          {icon}
          <Heading
            as="h2"
            size="sm"
            letterSpacing="0.08em"
            textTransform="uppercase"
            fontFamily="heading"
            color={color}
            css={{ textShadow: `0 0 8px ${glow}` }}
          >
            {title}
          </Heading>
        </HStack>
        {children}
      </Box>
    </motion.div>
  );
}
