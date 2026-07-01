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
- `apps/web`のダッシュボードはサーバーのWebSocket(`/ws`)に接続し、ticker/AI判断/ポジション更新/AI利用状況をリアルタイム表示する。未接続時は初期シードのダミーデータを表示する。
