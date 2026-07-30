# bitbank-ai-trader

Claude(Anthropic API)による売買判断をペーパートレードで検証する、cyberpunk風UIのAIトレーディングダッシュボード。

<img width="1911" height="901" alt="スクリーンショット 2026-07-06 001448" src="https://github.com/user-attachments/assets/bb086d29-6ddb-4c12-a556-716c14ac8649" />
<img width="1900" height="903" alt="スクリーンショット 2026-07-06 001501" src="https://github.com/user-attachments/assets/6ae7125b-9a0f-41e2-b958-4684092e44ad" />


## 構成

npm workspacesによるモノレポ。

- `apps/web` — Next.js(App Router) + Chakra UI v3 + Framer Motion + lightweight-charts によるダッシュボード
- `apps/server` — Fastify + WebSocket + Prisma(SQLite) + `@anthropic-ai/sdk` によるバックエンド
- `packages/shared` — フロント/バックエンド共通のTypeScript型定義

## セットアップ

```bash
npm install
cp .env.example apps/server/.env   # bitbank/Anthropicの各APIキーを設定
cp apps/web/.env.local.example apps/web/.env.local
npm run build --workspace=packages/shared
cd apps/server && npx prisma migrate dev --name init
```

### AIコスト管理用の環境変数

トークン課金額を抑えるため、`apps/server/.env` で以下を調整できる(詳細は`.env.example`のコメント参照):

- `AI_MODEL` — 使用するClaudeモデル。デフォルトは低コストな`claude-haiku-4-5`
- `AI_MIN_CALL_INTERVAL_MS` / `AI_MAX_CALL_INTERVAL_MS` / `AI_PRICE_CHANGE_THRESHOLD_PCT` — 値動きに応じてClaude呼び出し頻度を間引く設定
- `AI_DAILY_BUDGET_JPY` — 1日の推定コスト(JPY)がこれを超えたら、その日はAI呼び出しを自動停止する
- `AI_USD_JPY_RATE` — コスト見積もり用の概算為替レート

ダッシュボードの「System Status」カードに本日のAI呼び出し回数・トークン数・推定コストが表示される。

### リスク管理用の環境変数

AIが常に固定量で取引し続けて資産を溶かさないよう、`apps/server/.env`で以下を調整できる:

- `AI_MAX_POSITION_JPY` — 1ポジションあたりの上限金額(円)。この金額をもとに購入数量を自動算出する
- `AI_MAX_OPEN_POSITIONS` — 同時に保有できる未決済ポジション数の上限
- `AI_STOP_LOSS_PCT` — この含み損率(%)に達したらAIの判断を待たず自動的に成行決済する(Claude APIは呼ばないためトークン課金は発生しない)

### 手数料・スリッページ用の環境変数

実運用に近いpnlを検証できるよう、`apps/server/.env`で以下を調整できる:

- `TRADE_FEE_PCT` — ペーパートレードに反映する取引手数料(%)。bitbank現物のtaker手数料相当。デフォルト`0.12`
- `TRADE_SLIPPAGE_PCT` — 成行想定のスリッページ(%)。買いは高く・売りは安く約定させる。デフォルト`0.02`

いずれも実現損益(pnl)から控除され、ダッシュボードのPnLページに支払い済み手数料の合計が表示される。

## 開発

```bash
npm run dev          # サーバー(:4000)+ダッシュボード(:3000)を同時起動(concurrently)
# もしくは個別に起動する場合
npm run dev:server   # http://localhost:4000 (Fastify + WebSocket + Bot戦略エンジン)
npm run dev:web      # http://localhost:3000 (ダッシュボード)
```

## ビルド

```bash
npm run build
```

## 本番起動

```bash
npm run start        # build後、サーバー(:4000)+ダッシュボード(:3000)をproductionモードで同時起動
# もしくは個別に起動する場合(事前に npm run build が必要)
npm run start:server
npm run start:web
```

## テスト

[Vitest](https://vitest.dev/)によるユニットテスト。`packages/shared`(戦略グラフの評価器・テクニカル指標)、
`apps/server`(リスク管理・サーキットブレーカー・料金計算など、Prismaはモックして検証)、
`apps/web`(表示フォーマッタ・シグナル評価)を対象にしている。Fastifyルートや React コンポーネントの
描画・DBに触れる部分は未カバー。

```bash
npm run test            # 全ワークスペースのテストを実行(事前にpackages/sharedをビルド)
npm run test:coverage   # カバレッジ計測付きで実行(各ワークスペースにcoverage/が出力される)
```

## 現状の範囲

- 取引は**ペーパートレードのみ**。実際の注文APIは呼び出さず、SQLiteに仮想残高・仮想ポジション・約定履歴を記録する。
- 売買はBot Blueprint(ノードエディタで組む戦略グラフ)経由でのみ実行される。SMA/RSIなどの技術的条件に加え、
  「AI Judgment」ノードでClaudeによる売買判断(buy/sell/hold)を条件の一部として組み込める
  (低頻度・コスト管理付きでキャッシュされ、新しい判断が届いた瞬間だけ発火する)。
- ポジションサイズ上限・同時保有数上限・自動損切りによるリスク管理(`AI_MAX_POSITION_JPY` / `AI_MAX_OPEN_POSITIONS` / `AI_STOP_LOSS_PCT`)。損切りは全tickerで評価され、AI呼び出し(課金)は発生しない。
- `apps/web`のダッシュボードはサーバーのWebSocket(`/ws`)に接続し、ticker/ポジション更新/約定/AI利用状況をリアルタイム表示する。約定履歴は`GET /api/trades`で初期取得後、WebSocketで追記される。未接続時は初期シードのダミーデータを表示する。
- UIテーマは Cyberpunk 2077 の UI カラーパレット(黒 `#000000` / 黄 `#f3e600` / シアン `#55ead4` / 深紅 `#c5003c` / 暗赤 `#880425`)を採用。

## ライセンス

[MIT](./LICENSE)
