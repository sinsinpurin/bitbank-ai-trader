"use client";

import { Box, HStack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/strategies", label: "Bot Blueprint" },
  { href: "/pnl", label: "P&L Report" },
  { href: "/settings", label: "Settings" },
  { href: "/docs", label: "Docs" },
];

export function AppHeader({ connected }: { connected?: boolean }) {
  const pathname = usePathname();

  return (
    <Box
      as="header"
      borderBottomWidth="1px"
      borderBottomColor="border.grid"
      px={{ base: 4, md: 10 }}
      py={4}
    >
      <HStack justify="space-between" flexWrap="wrap" gap={4}>
        <Box>
          <Text
            fontFamily="heading"
            fontSize="11px"
            fontWeight="600"
            letterSpacing="0.18em"
            textTransform="uppercase"
            color="signal.cyan"
          >
            <Box as="span" color="signal.red" mr={2}>
              {"//"}
            </Box>
            Bitbank AI Trader
          </Text>
          <Text
            fontFamily="heading"
            fontWeight="700"
            fontSize={{ base: "xl", md: "2xl" }}
            textTransform="uppercase"
            letterSpacing="0.01em"
            lineHeight="1.1"
            color="text.primary"
          >
            Night City{" "}
            <Box as="span" color="signal.red" css={{ textShadow: "0 0 6px rgba(255,0,60,.6), 0 0 28px rgba(255,0,60,.25)" }}>
              Trading
            </Box>{" "}
            Terminal
          </Text>
        </Box>

        <HStack gap={6}>
          <HStack as="nav" gap={1}>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Box
                    px={4}
                    py={2}
                    fontFamily="heading"
                    fontSize="12px"
                    fontWeight="600"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                    color={active ? "signal.cyan" : "text.secondary"}
                    borderWidth="1px"
                    borderColor={active ? "signal.cyan" : "transparent"}
                    boxShadow={active ? "glowCyanSm" : "none"}
                    transition="all 120ms ease"
                    _hover={{ color: "signal.cyan" }}
                  >
                    {item.label}
                  </Box>
                </Link>
              );
            })}
          </HStack>

          {connected !== undefined && (
            <HStack gap={2}>
              <Box
                width="7px"
                height="7px"
                borderRadius="full"
                bg={connected ? "signal.green" : "signal.red"}
                boxShadow={connected ? "0 0 8px rgba(57,255,136,.6)" : "glowRedSm"}
              />
              <Text fontFamily="mono" fontSize="11px" color="text.secondary">
                {connected ? "LINK : ONLINE" : "LINK : OFFLINE"}
              </Text>
            </HStack>
          )}
        </HStack>
      </HStack>
    </Box>
  );
}
