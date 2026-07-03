"use client";

import { HStack, Stack, Text } from "@chakra-ui/react";
import type { GraphDescription } from "./describeGraph";

/**
 * キャンバス上のグラフが「どういう戦略なのか」を日本語でリアルタイム表示するパネル。
 */
export function StrategyPreview({ description }: { description: GraphDescription }) {
  const { buy, sell, issues } = description;
  const empty = buy.length === 0 && sell.length === 0 && issues.length === 0;

  if (empty) {
    return (
      <Text fontSize="sm" color="text.disabled">
        Buy / Sell ノードに条件を接続すると、この戦略が何をするのかを日本語で表示します。
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      {buy.map((line, i) => (
        <HStack key={`b${i}`} gap={3} align="flex-start">
          <Text
            fontFamily="heading"
            fontSize="11px"
            fontWeight="600"
            letterSpacing="0.14em"
            color="signal.green"
            flexShrink={0}
            mt="2px"
          >
            BUY
          </Text>
          <Text fontSize="sm" color="text.primary" lineHeight="1.7">
            「{line}」が成立した瞬間に買い注文を出します
          </Text>
        </HStack>
      ))}
      {sell.map((line, i) => (
        <HStack key={`s${i}`} gap={3} align="flex-start">
          <Text
            fontFamily="heading"
            fontSize="11px"
            fontWeight="600"
            letterSpacing="0.14em"
            color="signal.red"
            flexShrink={0}
            mt="2px"
          >
            SELL
          </Text>
          <Text fontSize="sm" color="text.primary" lineHeight="1.7">
            「{line}」が成立した瞬間に保有ポジションを決済します
          </Text>
        </HStack>
      ))}
      {issues.map((line, i) => (
        <HStack key={`w${i}`} gap={3} align="flex-start">
          <Text
            fontFamily="heading"
            fontSize="11px"
            fontWeight="600"
            letterSpacing="0.14em"
            color="signal.orange"
            flexShrink={0}
            mt="2px"
          >
            WARN
          </Text>
          <Text fontSize="sm" color="signal.orange" lineHeight="1.7">
            {line}
          </Text>
        </HStack>
      ))}
      {(buy.length > 0 || sell.length > 0) && (
        <Text fontSize="xs" color="text.disabled" mt={1}>
          ※ 条件が「不成立 → 成立」に切り替わった瞬間のみ発火します(成立し続けている間の連続発注はありません)
        </Text>
      )}
    </Stack>
  );
}
