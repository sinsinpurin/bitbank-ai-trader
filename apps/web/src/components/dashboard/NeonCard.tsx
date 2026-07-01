"use client";

import { Box, Heading, HStack, type BoxProps } from "@chakra-ui/react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface NeonCardProps extends BoxProps {
  title: string;
  accent?: "cyan" | "magenta" | "violet" | "green";
  icon?: ReactNode;
  delay?: number;
  children: ReactNode;
}

const ACCENT: Record<
  NonNullable<NeonCardProps["accent"]>,
  { color: string; glow: string }
> = {
  cyan: { color: "#00fff0", glow: "rgba(0, 255, 240, 0.35)" },
  magenta: { color: "#ff2ee6", glow: "rgba(255, 46, 230, 0.32)" },
  violet: { color: "#7b5bff", glow: "rgba(123, 91, 255, 0.32)" },
  green: { color: "#39ff88", glow: "rgba(57, 255, 136, 0.32)" },
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
        bg="#0b0c14"
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
