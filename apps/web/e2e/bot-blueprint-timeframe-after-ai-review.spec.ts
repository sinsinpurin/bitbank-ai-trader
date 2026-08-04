import { test, expect } from "@playwright/test";
import type { GeneratedStrategy, PnlReview, PnlSummary, StrategyGraph } from "@noctas/shared";

// このテストはissue #29の再現・回帰確認用。
// apps/server(4000)とapps/web(3000)を手動起動した状態で実行する前提(webServerは使わない)。
const API_URL = "http://localhost:4000";

const GENERATED_GRAPH: StrategyGraph = {
  nodes: [
    { id: "price_1", type: "price", params: {}, position: { x: 0, y: 0 } },
    { id: "const_1", type: "constant", params: { value: 100 }, position: { x: 0, y: 160 } },
    { id: "compare_1", type: "compare", params: { op: "gt" }, position: { x: 220, y: 80 } },
    { id: "buy_1", type: "buy", params: {}, position: { x: 440, y: 80 } },
  ],
  edges: [
    { id: "e1", source: "price_1", sourceHandle: "out", target: "compare_1", targetHandle: "a" },
    { id: "e2", source: "const_1", sourceHandle: "out", target: "compare_1", targetHandle: "b" },
    { id: "e3", source: "compare_1", sourceHandle: "out", target: "buy_1", targetHandle: "condition" },
  ],
};

const GENERATED_STRATEGY: GeneratedStrategy = {
  name: "E2Eテスト用戦略",
  description: "価格が定数を上回ったら買う単純な戦略(E2Eテスト用のモック応答)",
  graph: GENERATED_GRAPH,
  usage: {
    inputTokens: 800,
    outputTokens: 300,
    model: "claude-opus-4-8",
    estimatedCostJpy: 3.5,
  },
};

const PNL_REVIEW: PnlReview = {
  review:
    "直近の取引は概ね堅調です。損切りがやや遅れる傾向があるため、ストップ幅の見直しを検討してください(E2Eテスト用モック)。",
  usage: {
    inputTokens: 1200,
    outputTokens: 400,
    model: "claude-opus-4-8",
    estimatedCostJpy: 4.2,
  },
  generatedAt: Date.now(),
};

const NOW = Date.now();
const PNL_SUMMARY: PnlSummary = {
  currentPrices: { btc_jpy: 5_000_000 },
  realizedPnl: 5000,
  unrealizedPnl: 0,
  totalPnl: 5000,
  winCount: 1,
  lossCount: 0,
  winRate: 1,
  avgWin: 5000,
  avgLoss: null,
  profitFactor: null,
  maxDrawdown: 0,
  totalFeesJpy: 100,
  balanceJpy: 1_005_000,
  assetBalances: {},
  equityJpy: 1_005_000,
  initialBalanceJpy: 1_000_000,
  equityCurve: [],
  dailyPnl: [],
  byReason: [],
  byStrategy: [],
  openPositions: [],
  // AiReviewPanelの「AIにレビューさせる」ボタンはclosedPositions.length > 0で活性化するため必須
  closedPositions: [
    {
      id: "pos_e2e_1",
      pair: "btc_jpy",
      side: "buy",
      entryPrice: 5_000_000,
      amount: 0.001,
      openedAt: NOW - 3_600_000,
      closedAt: NOW - 1_800_000,
      closePrice: 5_050_000,
      pnl: 5000,
      strategyId: null,
      closeReason: "bot_strategy",
      totalFeeJpy: 100,
    },
  ],
};

test("AI Review→AI Strategy Gen実行後もBot Blueprintの時間足プルダウンが機能する(#29)", async ({ page }) => {
  await page.route(`${API_URL}/api/pnl/review`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PNL_REVIEW) });
  });

  await page.route(`${API_URL}/api/strategies/generate`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(GENERATED_STRATEGY),
    });
  });

  await page.route(`${API_URL}/api/pnl`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PNL_SUMMARY) });
  });

  // window.confirm()をOKした体で進める。Playwrightはデフォルトでダイアログを自動dismissするため、
  // これが無いと正しいブランチ(キャンバス置き換え側)に進めない。
  // 修正後(in-appダイアログ)は、これに代わって下の「置き換える」ボタンをクリックする。
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/pnl");

  const reviewButton = page.getByRole("button", { name: "AIにレビューさせる" });
  await expect(reviewButton).toBeEnabled();
  await reviewButton.click();

  await expect(page.getByText(PNL_REVIEW.review)).toBeVisible();

  await page.getByRole("button", { name: "この内容でAI戦略を生成する(Bot Blueprintへ)" }).click();

  await expect(page).toHaveURL(/\/strategies$/);

  const generateButton = page.getByRole("button", { name: "AIで戦略を生成" });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  // 修正後の実装ではネイティブconfirmの代わりにin-appの確認ダイアログが出るため、
  // 表示されたら確定する(修正前はこの要素は存在しないため何もせず先に進む)。
  const inAppConfirmButton = page.getByRole("button", { name: "置き換える" });
  try {
    await inAppConfirmButton.click({ timeout: 3000 });
  } catch {
    // 修正前(window.confirm)の場合はここに到達しない
  }

  await expect(
    page.getByText(`AIが戦略「${GENERATED_STRATEGY.name}」を生成しました`, { exact: false })
  ).toBeVisible();

  const timeframeSelect = page.getByLabel("時間足");
  const targetText = page.getByText(/^対象:/);
  await expect(targetText).toContainText("1分足");

  await timeframeSelect.selectOption("5min");
  await expect(timeframeSelect).toHaveValue("5min");

  // DOM値のセットだけでなく、onChange→state更新→再レンダリングの経路が生きていることを確認する
  await expect(targetText).toContainText("5分足");
});
