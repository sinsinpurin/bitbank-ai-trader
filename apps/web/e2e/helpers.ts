import type { Page } from "@playwright/test";

/**
 * Deployed Strategies一覧のカードを名前で特定する。
 * StrategyList.tsxは唯一このページで<Wrap>を使っており、各カードはその直接の子要素
 * (`.chakra-wrap > div`)になっている。div要素をhasText(name)だけで絞る緩い特定方法だと、
 * 削除後に他の要素(削除成功メッセージの文言等)を誤って拾ってしまうことがある
 * (成功メッセージにも戦略名の文字列が含まれるため、hasTextだけの絞り込みでは
 * カード削除後も別要素にマッチしてtoHaveCount(0)が成立しないことがある)。
 */
export function deployedStrategyCard(page: Page, name: string) {
  return page.locator(".chakra-wrap > div").filter({ hasText: name });
}
