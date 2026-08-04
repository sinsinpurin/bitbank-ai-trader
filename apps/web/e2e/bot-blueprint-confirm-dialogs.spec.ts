import { test, expect, type Page } from "@playwright/test";
import type { StrategyGraph } from "@noctas/shared";
import { deployedStrategyCard } from "./helpers";

// Bot Blueprintのin-app確認ダイアログ(ConfirmDialog)を検証する。
// window.confirm()の代わりに導入された非ブロッキングダイアログで、
// 「キャンセル」「置き換える/削除する」の両方の分岐を確認する(#29の実装で追加された経路)。
// apps/server(4000)とapps/web(3000)を手動起動した状態で実行する前提(webServerは使わない)。
const API_URL = "http://localhost:4000";

const INITIAL_TEMPLATE_NAME = "SMA GOLDEN CROSS";
const OTHER_TEMPLATE_NAME = "RSI REVERSAL";

const MINIMAL_GRAPH: StrategyGraph = { nodes: [], edges: [] };

/**
 * Strategy Templatesギャラリーの「カード」を名前で特定する。
 * div要素をhasText(name)で絞ると先祖div群も含めて複数マッチするため、
 * さらに「Loadボタンを含む」ことで名前だけを表示するHStack等を除外し、
 * 残った祖先チェーンの中で最も内側(=カードそのもの)をlast()で取る。
 * (このテストではカードの「非表示」を検証しないため、この緩めの特定方法で十分)
 */
function templateCard(page: Page, name: string) {
  return page
    .locator("div")
    .filter({ hasText: name })
    .filter({ has: page.getByRole("button", { name: "Load" }) })
    .last();
}

test.describe("Bot Blueprintの確認ダイアログ", () => {
  test("テンプレート読み込み確認: キャンセルで維持、置き換えるで反映される", async ({ page }) => {
    await page.goto("/strategies");

    // 初期表示はSTRATEGY_TEMPLATES[0]がキャンバスに展開済み(nodes.length > 0)なので、
    // フィクスチャなしでそのままLoad→確認ダイアログの分岐へ到達する
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await expect(page.getByPlaceholder("STRATEGY NAME")).toHaveValue(INITIAL_TEMPLATE_NAME);

    const dialog = page.getByRole("alertdialog");

    // 1回目: キャンセルするとキャンバス・名前欄は元のまま
    await templateCard(page, OTHER_TEMPLATE_NAME).getByRole("button", { name: "Load" }).click();
    await expect(dialog.getByText("テンプレートを読み込みますか?")).toBeVisible();
    await expect(dialog.getByText(OTHER_TEMPLATE_NAME, { exact: false })).toBeVisible();

    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByPlaceholder("STRATEGY NAME")).toHaveValue(INITIAL_TEMPLATE_NAME);

    // 2回目: 置き換えるを選ぶとテンプレートが反映される
    await templateCard(page, OTHER_TEMPLATE_NAME).getByRole("button", { name: "Load" }).click();
    await expect(dialog.getByText("テンプレートを読み込みますか?")).toBeVisible();

    await dialog.getByRole("button", { name: "置き換える" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByPlaceholder("STRATEGY NAME")).toHaveValue(OTHER_TEMPLATE_NAME);
    await expect(
      page.getByText(`テンプレート「${OTHER_TEMPLATE_NAME}」を展開しました。SaveするとDeployできます`)
    ).toBeVisible();
  });

  test.describe("削除確認: キャンセルで維持、削除するで一覧から消える", () => {
    let fixtureId: string | null = null;
    let fixtureName = "";

    test.beforeEach(async ({ request }) => {
      fixtureName = `E2E_DELETE_TARGET_${Date.now()}`;
      const res = await request.post(`${API_URL}/api/strategies`, {
        data: { name: fixtureName, graph: MINIMAL_GRAPH },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { id: string };
      fixtureId = body.id;
    });

    test.afterEach(async ({ request }) => {
      if (!fixtureId) return;
      const res = await request.delete(`${API_URL}/api/strategies/${fixtureId}`);
      // UI側の削除フローで既に消えている場合の404はクリーンアップの安全網として無視する
      if (!res.ok() && res.status() !== 404) {
        throw new Error(`フィクスチャの後始末に失敗しました (${res.status()})`);
      }
    });

    test("削除確認ダイアログのキャンセル/削除するの分岐", async ({ page }) => {
      await page.goto("/strategies");

      const card = deployedStrategyCard(page, fixtureName);
      await expect(card).toBeVisible();

      const dialog = page.getByRole("alertdialog");

      // 1回目: キャンセルするとカードは残る
      await card.getByRole("button", { name: "Del" }).click();
      await expect(dialog.getByText("戦略を削除しますか?")).toBeVisible();
      await expect(dialog.getByText(fixtureName, { exact: false })).toBeVisible();

      await dialog.getByRole("button", { name: "キャンセル" }).click();
      await expect(dialog).toBeHidden();
      await expect(deployedStrategyCard(page, fixtureName)).toBeVisible();

      // 2回目: 削除するを選ぶと実際に削除され、一覧から消える
      await deployedStrategyCard(page, fixtureName).getByRole("button", { name: "Del" }).click();
      await expect(dialog.getByText("戦略を削除しますか?")).toBeVisible();

      await dialog.getByRole("button", { name: "削除する" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`戦略 "${fixtureName}" を削除しました`)).toBeVisible();
      await expect(deployedStrategyCard(page, fixtureName)).toHaveCount(0);
    });
  });
});
