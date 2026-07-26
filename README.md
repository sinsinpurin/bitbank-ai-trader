# bitbank-ai-trader

Claude(Anthropic API)による売買判断をペーパートレードで検証する、cyberpunk風UIのAIトレーディングダッシュボード。

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
npm run dev:server   # http://localhost:4000 (Fastify + WebSocket + AI判断ループ)
npm run dev:web      # http://localhost:3000 (ダッシュボード)
```

## ビルド

```bash
npm run build
```

## 現状の範囲

- 取引は**ペーパートレードのみ**。実際の注文APIは呼び出さず、SQLiteに仮想残高・仮想ポジション・約定履歴を記録する。
- bitbank Public Stream(`wss://stream.bitbank.cc`, socket.io)からBTC/JPYのtickerをリアルタイム購読し、一定間隔でClaudeに相場サマリを渡して買い/売り/様子見の判断を取得する。
- ポジションサイズ上限・同時保有数上限・自動損切りによるリスク管理(`AI_MAX_POSITION_JPY` / `AI_MAX_OPEN_POSITIONS` / `AI_STOP_LOSS_PCT`)。損切りは全tickerで評価され、AI呼び出し(課金)は発生しない。
- `apps/web`のダッシュボードはサーバーのWebSocket(`/ws`)に接続し、ticker/AI判断/ポジション更新/約定/AI利用状況をリアルタイム表示する。約定履歴は`GET /api/trades`で初期取得後、WebSocketで追記される。未接続時は初期シードのダミーデータを表示する。
- UIテーマは Cyberpunk 2077 の UI カラーパレット(黒 `#000000` / 黄 `#f3e600` / シアン `#55ead4` / 深紅 `#c5003c` / 暗赤 `#880425`)を採用。
