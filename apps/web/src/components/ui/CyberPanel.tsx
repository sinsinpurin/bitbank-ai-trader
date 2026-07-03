"use client";

import { Box, Heading, HStack, Text, type BoxProps } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

export type SignalAccent = "red" | "cyan" | "yellow" | "green" | "orange";

export const SIGNAL_COLOR: Record<SignalAccent, string> = {
  red: "#FF003C",
  cyan: "#00E5FF",
  yellow: "#FCEE0A",
  green: "#39FF88",
  orange: "#FF8A1E",
};

interface CyberPanelProps extends BoxProps {
  title: string;
  /** パネル見出し右側に添えるモノスペースの補足ラベル(例: "01 / LOG") */
  code?: string;
  accent?: SignalAccent;
  icon?: ReactNode;
  delay?: number;
  /** trueの場合、ヘッダークリックで本文を折りたためる */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/**
 * Cyberpsycho UIのパネル。角丸なし・1pxグリッド罫線・対角2箇所のコーナーブラケット。
 * 階層はドロップシャドウでなく罫線と控えめな沈み込みで表現する。
 */
export function CyberPanel({
  title,
  code,
  accent = "cyan",
  icon,
  delay = 0,
  collapsible = false,
  defaultCollapsed = false,
  children,
  ...rest
}: CyberPanelProps) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const color = SIGNAL_COLOR[accent];
  const borderColor = accent === "red" ? "border.grid" : "border.gridCyan";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ height: "100%" }}
    >
      <Box
        position="relative"
        height="100%"
        bg="bg.surface"
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="0"
        p={5}
        pb={collapsed ? 4 : 5}
        boxShadow="elevationPanel"
        {...rest}
      >
        {/* corner brackets (照準器モチーフ、対角2箇所) */}
        <Box
          position="absolute"
          top="-1px"
          left="-1px"
          width="16px"
          height="16px"
          borderTop={`2px solid ${color}`}
          borderLeft={`2px solid ${color}`}
          pointerEvents="none"
        />
        <Box
          position="absolute"
          bottom="-1px"
          right="-1px"
          width="16px"
          height="16px"
          borderBottom={`2px solid ${color}`}
          borderRight={`2px solid ${color}`}
          pointerEvents="none"
        />

        <HStack
          mb={collapsed ? 0 : 4}
          gap={2}
          justify="space-between"
          cursor={collapsible ? "pointer" : undefined}
          onClick={collapsible ? () => setCollapsed((prev) => !prev) : undefined}
          role={collapsible ? "button" : undefined}
          aria-expanded={collapsible ? !collapsed : undefined}
          userSelect={collapsible ? "none" : undefined}
        >
          <HStack gap={2}>
            {icon}
            <Heading
              as="h2"
              fontSize="11px"
              lineHeight="16px"
              letterSpacing="0.18em"
              textTransform="uppercase"
              fontFamily="heading"
              fontWeight="600"
              color={color}
            >
              <Box as="span" color={accent === "red" ? "signal.cyan" : "signal.red"} mr={2}>
                {"//"}
              </Box>
              {title}
            </Heading>
          </HStack>
          <HStack gap={3}>
            {code && (
              <Text fontFamily="mono" fontSize="10px" color="text.disabled">
                {code}
              </Text>
            )}
            {collapsible && (
              <Text fontFamily="mono" fontSize="12px" color={color} lineHeight="1">
                {collapsed ? "[+]" : "[-]"}
              </Text>
            )}
          </HStack>
        </HStack>
        <Box display={collapsed ? "none" : "block"}>{children}</Box>
      </Box>
    </motion.div>
  );
}
