# CYBERPSYCHO UI — Design System
### サイバーパンク エッジランナーズ発 / Web・アプリUI向けデザインシステム
Version 1.0 — Night City Interface Standard

---

## 0. コンセプト

Edgerunnersの「ネオンで塗りつぶされた闇」と、原作ゲームCyberpunk 2077の「軍事HUD/ブレインダンス端末」らしい無機質さを掛け合わせたUI言語。
David Martinezのサイバーウェアが纏うレッド、Lucyの網膜インプラントのシアン、SANDEVISTAN発動時のグリッチを、実用的なUIコンポーネントに翻訳する。

**世界観キーワード**: 夜の闇 / ネオン漏光 / 軍事HUD / 走査線(スキャンライン) / 切り欠き角(ノッチ) / データの過剰供給

---

## 1. Color Tokens

### 1.1 Base

| Token | Hex | 用途 |
|---|---|---|
| `color/bg/void` | `#0A0A0D` | ページ背景。純黒ではなく僅かに青みを持たせた漆黒 |
| `color/bg/surface` | `#131318` | カード・パネル背景 |
| `color/bg/surface-raised` | `#1C1C24` | モーダル・ドロップダウンなど最前面 |
| `color/border/grid` | `rgba(255,0,60,0.22)` | パネルの罫線・区切り線 |
| `color/border/grid-cyan` | `rgba(0,229,255,0.22)` | セカンダリ系パネルの罫線 |

### 1.2 Signal(意味を持つネオン)

| Token | Hex | 用途 |
|---|---|---|
| `color/signal/red` (Primary) | `#FF003C` | David/危険/主要CTA。プライマリボタン、アラート |
| `color/signal/red-dim` | `#B4002A` | 非活性状態、ホバー前のベース |
| `color/signal/cyan` (Secondary) | `#00E5FF` | Lucy/情報/リンク。データ表示、選択状態 |
| `color/signal/cyan-dim` | `#00A8BC` | セカンダリボタンのベース |
| `color/signal/yellow` (Accent) | `#FCEE0A` | Davidのジャケット由来。強調・警告・実績解除 |
| `color/signal/green` (Zone: Safe) | `#39FF88` | 成功・安全ステータス |
| `color/signal/orange` (Zone: Restricted) | `#FF8A1E` | 注意ステータス |

> ネオンカラーは「意味」を運ぶ。赤=危険/主要操作、シアン=情報/副操作、黄=強調、それ以外に流用しない。

### 1.3 Text

| Token | Hex | 用途 |
|---|---|---|
| `color/text/primary` | `#F2F2F5` | 本文・見出し |
| `color/text/secondary` | `#9A9AA6` | 補助テキスト、キャプション |
| `color/text/disabled` | `#4B4B55` | 非活性テキスト |
| `color/text/on-signal` | `#0A0A0D` | 塗りつぶしボタン上の文字(黄・シアン背景時) |

---

## 2. Typography Tokens

3役割で構成し、混ぜない。

| 役割 | フォント | 特徴 |
|---|---|---|
| Display / Heading | **Chakra Petch** (Bold/SemiBold) | 角ばった近未来書体。見出し・ラベル・ボタンに使用。全て大文字+字間+5%が基本 |
| Body | **Inter** (Regular/Medium) | 可読性優先の本文用。長文はこちらのみ使用 |
| Data / Mono | **JetBrains Mono** | 数値・タイムスタンプ・コード・ID表示。HUD感を出す要 |

### タイプスケール

| Token | Size / Line-height | フォント | 用途 |
|---|---|---|---|
| `type/display` | 48 / 56px | Chakra Petch Bold | ヒーロー見出し |
| `type/h1` | 36 / 44px | Chakra Petch SemiBold | ページタイトル |
| `type/h2` | 28 / 36px | Chakra Petch SemiBold | セクション見出し |
| `type/h3` | 22 / 28px | Chakra Petch Medium | カード見出し |
| `type/body-lg` | 18 / 28px | Inter Regular | リード文 |
| `type/body` | 16 / 24px | Inter Regular | 標準本文 |
| `type/body-sm` | 14 / 20px | Inter Regular | 補助文 |
| `type/data` | 14 / 20px | JetBrains Mono | 数値・ID |
| `type/eyebrow` | 11 / 16px, tracking+15% | Chakra Petch Medium, 大文字 | ラベル・タグ(例: "ZONE : SAFE") |

---

## 3. Spacing / Layout Tokens

4pxベースグリッド。

| Token | px |
|---|---|
| `space/1` | 4 |
| `space/2` | 8 |
| `space/3` | 12 |
| `space/4` | 16 |
| `space/6` | 24 |
| `space/8` | 32 |
| `space/12` | 48 |
| `space/16` | 64 |

**ノッチ(切り欠き角)**: 角丸(border-radius)は基本 `0px`。代わりにパネル/ボタンの一角を斜めにカットする「ノッチ」を意匠として使う。
```
clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
```
| Token | 値 |
|---|---|
| `radius/none` | 0px(基本) |
| `notch/sm` | 8px カット |
| `notch/md` | 12px カット |
| `notch/lg` | 20px カット(ヒーローパネル等) |

---

## 4. Elevation / Glow

ドロップシャドウでなく「発光」で階層を表現する。

| Token | 値 | 用途 |
|---|---|---|
| `glow/red/sm` | `0 0 6px rgba(255,0,60,.55)` | ボタンホバー |
| `glow/red/lg` | `0 0 6px rgba(255,0,60,.6), 0 0 28px rgba(255,0,60,.25)` | アクティブ/選択パネル |
| `glow/cyan/sm` | `0 0 6px rgba(0,229,255,.55)` | セカンダリホバー |
| `elevation/panel` | `0 4px 24px rgba(0,0,0,.6)` | 通常カードの控えめな沈み込み(発光と併用しない) |

---

## 5. Motion Tokens

| Token | 値 | 用途 |
|---|---|---|
| `duration/fast` | 120ms | ホバー、アイコンの反応 |
| `duration/base` | 240ms | パネル開閉、タブ切替 |
| `duration/slow` | 480ms | モーダル/ページ遷移 |
| `ease/standard` | `cubic-bezier(.16,1,.3,1)` | 全般 |
| `motion/glitch` | 80msごとにX方向±2pxをランダム2回 | **強調が必要な一瞬のみ**使用(通知出現、エラー発生)。常用しない |

> グリッチ演出は「ここぞ」で使う一発芸。多用すると安っぽくAI生成感が出るため、レベルアップ通知やエラーなど「本当に驚かせたい瞬間」に限定する。

---

## 6. コンポーネント指針

### 6.1 Button
- Primary: `bg=color/signal/red`, text=`text/on-signal`はNG(赤は白文字`#0A0A0D`ではなく`#F2F2F5`)、notch/sm、大文字+Chakra Petch
- Secondary: 塗りなし、border 1px `signal/cyan`、text `signal/cyan`
- ホバー: `glow/red/sm` または `glow/cyan/sm` を追加、120ms

### 6.2 Notification / Toast(参考画像の"LEVEL UP"系)
- `bg/surface` + 左端4pxの `signal` カラーバー
- 見出しは `type/eyebrow`、本文は `type/data`
- 出現時のみ `motion/glitch` を1回

### 6.3 Zone Tag / Badge
- 4色運用固定: Safe(green) / Public(cyan) / Restricted(orange) / Danger(red)
- ドット + `type/eyebrow` ラベル、notch/sm矩形

### 6.4 Card / Panel
- `bg/surface`、border 1px `border/grid`、四隅のうち対角2箇所に corner-bracket(照準器モチーフ、画像のCROSSHAIRS参照)
- スキャンラインの微細オーバーレイ(`opacity 3-5%`, 常時)は背景のみ、テキスト部には掛けない(可読性優先)

### 6.5 Cursor / Interaction Marker
- 通常時は白系の細いアウトラインカーソル、インタラクト可能要素上で `signal/red` に変化(参考画像のCURSORセット準拠)

---

## 7. 使用ルール(やらないこと)

- ネオン3色(赤/シアン/黄)を1画面に対等な主役として並べない。常に赤 or シアンのどちらかを主役に固定し、黄は強調の一点のみ
- border-radius を丸めない。丸角は「量産型UI」に見えるため、この世界観では使用しない
- グリッチ/スキャンラインは常時アニメーションさせない(酔う・うるさい・チープに見える)。静的な質感 or 一瞬の演出に留める
- 本文の可読性より雰囲気を優先しない。長文は必ず `Inter` + `text/primary` の高コントラストで

---

## 8. Figmaでの命名運用例

```
Cyberpsycho UI/
├─ Colors/
│   ├─ bg/void, bg/surface, bg/surface-raised
│   ├─ signal/red, signal/red-dim, signal/cyan, signal/cyan-dim, signal/yellow
│   ├─ zone/safe, zone/restricted, zone/danger
│   └─ text/primary, text/secondary, text/disabled
├─ Type/
│   ├─ Display, H1, H2, H3, Body-LG, Body, Body-SM, Data, Eyebrow
├─ Effects/
│   ├─ glow-red-sm, glow-red-lg, glow-cyan-sm, elevation-panel
└─ Spacing/
    └─ 1,2,3,4,6,8,12,16 (4px base)
```
