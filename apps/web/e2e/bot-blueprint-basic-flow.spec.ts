import { test, expect, type Page } from "@playwright/test";
import { deployedStrategyCard } from "./helpers";

// Bot Blueprintの基本フロー(ノード配置→接続→Preview確認→Save→一覧反映→Load)を
// 実サーバー(apps/server:4000)への実際のCRUDを通して検証する。
// apps/server(4000)とapps/web(3000)を手動起動した状態で実行する前提(webServerは使わない)。
const API_URL = "http://localhost:4000";

// Node Paletteの各アイテムはtitle属性にnodeCatalog.tsのdescriptionをそのまま持つため、
// キャンバス上に同名ラベルのノードが増えてもパレット側だけを一意に特定できる
const PALETTE_TITLE = {
  price: "BTC/JPYの終値シリーズ(1分足)",
  constant: "固定値。しきい値との比較に使う",
  compare: "AとBの大小を比較して真偽を返す",
  buy: "条件が成立した瞬間に買い注文(ペーパー)",
};

// ノード同士・ノード内ハンドル同士が近すぎるとReact Flowの接続判定(proximityベース)が
// 隣のハンドルへスナップすることがあるため、余裕を持った間隔で配置する
const GAP = 200;

/**
 * パレットをクリックしてノードを追加し、ヘッダーをつかんでポインタドラッグで
 * 指定x位置(cursor.x)へ移動させる。addNode()の初期配置はランダムなため、複数ノードを
 * 続けて追加すると重なる恐れがある。ドラッグの着地精度は完全ではないため、
 * 着地後に実際の位置を再計測し、その実測値を基準に次のノードのcursorを進める。
 */
async function addNodeSequential(
  page: Page,
  paletteTitle: string,
  label: string,
  cursor: { x: number; y: number }
) {
  await page.locator(`[title="${paletteTitle}"]`).click();
  const node = page.locator(".react-flow__node").filter({ hasText: label });
  await expect(node).toBeVisible();
  const header = node.getByText(label, { exact: true });
  const nodeBox = await node.boundingBox();
  const headerBox = await header.boundingBox();
  if (!nodeBox || !headerBox) throw new Error(`ノードが見つかりません: ${label}`);

  const targetHeaderX = cursor.x + (headerBox.x - nodeBox.x) + headerBox.width / 2;
  const targetHeaderY = cursor.y + (headerBox.y - nodeBox.y) + headerBox.height / 2;

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetHeaderX, targetHeaderY, { steps: 15 });
  await page.mouse.up();

  const actualBox = await node.boundingBox();
  if (!actualBox) throw new Error(`配置後にノードが見つかりません: ${label}`);
  cursor.x = actualBox.x + actualBox.width + GAP;
  // Reactの再レンダリングが落ち着くのを待ってから次のノード追加/接続へ進む
  await page.waitForTimeout(300);
}

function nodeHandle(page: Page, label: string, handleId: string) {
  return page
    .locator(".react-flow__node")
    .filter({ hasText: label })
    .locator(`[data-handleid="${handleId}"]`);
}

/**
 * ページが縦/横にスクロールしていると、事前に計測した座標とその後のmouse.move先が
 * ズレてしまい、隣接ハンドルへの誤爆や無関係な要素へのクリックにつながる。
 * viewportを十分広く取っていれば基本的に発生しないはずだが、保険として
 * 接続操作の直前に必ず(0,0)へ戻しておく。
 */
async function ensureNoScroll(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * React Flowはmount時にfitView propの効果が「次にノードの計測(dimensions)が
 * 揃ったタイミングで一度だけ」発火する仕組みになっている。ページ表示直後、
 * 初期テンプレート(SMA GOLDEN CROSS)の計測がまだ完了していない
 * (=fitViewがまだ発火していない)うちにNewでキャンバスをクリアしてこのテスト自身の
 * ノードを追加すると、その一度きりのfitViewが初期テンプレートではなくこのテストが
 * 置いたノード群に対して発火してしまい、キャンバスが最大2倍までズーム/パンされる
 * (実機のトレースで再現・特定済みの根本原因)。この時点でのズーム/パンは
 * 事前に何倍になるか予測できないため、以降のスクリーン座標ベースの計測が
 * すべて無効になり、ハンドル同士の接続が繰り返し失敗する。
 * viewportのtransformが変化しなくなる(=初期fitViewが収束した)のを待ってから
 * 操作を開始することで、この競合を回避する。
 */
async function waitForViewportStable(page: Page) {
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).toBeVisible();
  let previous: string | null = null;
  for (let i = 0; i < 40; i++) {
    const current = await viewport.getAttribute("style");
    if (current !== null && current === previous) return;
    previous = current;
    await page.waitForTimeout(100);
  }
  throw new Error("react-flowの初期表示(fitView)が安定しませんでした");
}

async function dragBetweenHandles(
  page: Page,
  source: ReturnType<typeof nodeHandle>,
  target: ReturnType<typeof nodeHandle>
) {
  const sBox = await source.boundingBox();
  if (!sBox) throw new Error("接続元ハンドルのbounding boxが取得できません");
  const sx = sBox.x + sBox.width / 2;
  const sy = sBox.y + sBox.height / 2;

  await page.mouse.move(sx - 80, sy - 80);
  await page.mouse.move(sx, sy, { steps: 10 });
  await page.mouse.down();
  await page.mouse.move(sx + 6, sy + 6);

  // ターゲットの右側(ノードの外)まで大きく移動してから直前で座標を再計測し
  // (測定タイミングのズレで隣接ハンドルへスナップするのを防ぐ)、
  // 最後はノード外から水平に、隣接する他の入力ハンドルの至近を通らない経路で近づく
  let tBox = await target.boundingBox();
  if (!tBox) throw new Error("接続先ハンドルのbounding boxが取得できません");
  await page.mouse.move(tBox.x + tBox.width / 2 + 60, tBox.y + tBox.height / 2, { steps: 15 });

  tBox = await target.boundingBox();
  if (!tBox) throw new Error("接続先ハンドルのbounding boxが取得できません(2回目)");
  await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

/**
 * ポート同士をポインタドラッグで接続する。ReactFlowのハンドルは
 * onPointerDown→document-level pointermove/pointerup で動くため、
 * 単発のクリックではなく実際のマウスシーケンス(hover→down→複数stepのmove→up)で行う。
 * 接続が成立したかはエッジ本数(toHaveCount)で検証し、成立しなければ座標を
 * 再計測して数回リトライする(まれにブラウザ側の描画/状態反映待ちが必要になるため)。
 */
async function connectPorts(
  page: Page,
  sourceLabel: string,
  sourceHandle: string,
  targetLabel: string,
  targetHandle: string,
  expectedEdgeCountAfter: number
) {
  const source = nodeHandle(page, sourceLabel, sourceHandle);
  const target = nodeHandle(page, targetLabel, targetHandle);

  for (let i = 0; i < 8; i++) {
    await ensureNoScroll(page);
    await dragBetweenHandles(page, source, target);
    try {
      await expect(page.locator(".react-flow__edge")).toHaveCount(expectedEdgeCountAfter, { timeout: 2000 });
      await page.waitForTimeout(200);
      return;
    } catch {
      await page.mouse.move(50, 50);
      await page.waitForTimeout(400);
    }
  }
  await expect(page.locator(".react-flow__edge")).toHaveCount(expectedEdgeCountAfter);
}

test.describe("Bot Blueprint基本フロー", () => {
  // ノードを重ならずに配置し、かつ操作中にページが縦スクロールしないよう
  // (スクロールが発生すると事前に計測した座標がずれ、隣接ハンドルへの誤爆や
  // 無関係な要素へのクリックにつながる)十分に広いviewportを使う
  test.use({ viewport: { width: 3400, height: 2600 } });

  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (!createdId) return;
    const res = await request.delete(`${API_URL}/api/strategies/${createdId}`);
    // UI側の削除フローで既に消えている場合の404はクリーンアップの安全網として無視する
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`フィクスチャの後始末に失敗しました (${res.status()})`);
    }
  });

  test("ノード配置→接続→Save→一覧反映→Loadの一連が動作する", async ({ page }) => {
    const name = `E2E_FLOW_${Date.now()}`;

    await page.goto("/strategies");
    // 初期テンプレートのfitViewが収束するまで待つ(waitForViewportStableのコメント参照)
    await waitForViewportStable(page);

    // 初期テンプレート(SMA GOLDEN CROSS)をNewでクリア。確認ダイアログは出ない仕様
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    await page.getByPlaceholder("STRATEGY NAME").fill(name);

    const flow = page.locator(".react-flow");
    await expect(flow).toBeVisible();
    const flowBox = await flow.boundingBox();
    if (!flowBox) throw new Error("react-flowキャンバスが見つかりません");

    const cursor = { x: flowBox.x + 60, y: flowBox.y + 100 };
    await addNodeSequential(page, PALETTE_TITLE.price, "Price", cursor);
    await addNodeSequential(page, PALETTE_TITLE.constant, "Constant", cursor);
    await addNodeSequential(page, PALETTE_TITLE.compare, "Compare", cursor);
    await addNodeSequential(page, PALETTE_TITLE.buy, "Buy", cursor);
    await expect(page.locator(".react-flow__node")).toHaveCount(4);

    // Price.out -> Compare.a / Constant.out -> Compare.b / Compare.out -> Buy.condition
    await connectPorts(page, "Price", "out", "Compare", "a", 1);
    await connectPorts(page, "Constant", "out", "Compare", "b", 2);
    await connectPorts(page, "Compare", "out", "Buy", "condition", 3);

    // Constantのデフォルト値(100)・Compareのデフォルト演算(A > B)から生成される文言で
    // 接続が正しく成立したことを検証する(見た目のエッジではなく評価結果で確認)
    await expect(
      page.getByText("「終値 が 100 を上回る」が成立した瞬間に買い注文を出します")
    ).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url() === `${API_URL}/api/strategies` && res.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Save" }).click(),
    ]);
    const created = (await response.json()) as { id: string };
    createdId = created.id;

    await expect(page.getByText("戦略を保存しました。Deployで稼働開始できます")).toBeVisible();

    const card = deployedStrategyCard(page, name);
    await expect(card).toBeVisible();
    await expect(card.getByText("Standby")).toBeVisible();

    // キャンバスをクリアしてから一覧のLoadで読み込み直す
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    await deployedStrategyCard(page, name).getByRole("button", { name: "Load" }).click();

    await expect(page.getByPlaceholder("STRATEGY NAME")).toHaveValue(name);
    await expect(page.getByLabel("ペア")).toHaveValue("btc_jpy");
    await expect(page.getByLabel("時間足")).toHaveValue("1min");
    await expect(page.locator(".react-flow__node")).toHaveCount(4);
  });
});
