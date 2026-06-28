# Project Context

## Identity

- Project: フォーム顧客管理
- Organization: 市場作り
- Workspace path: C:\Users\shinh\OneDrive\デスクトップ\AI\プロジェクト\市場作り\フォーム顧客管理
- GAS / Google アカウント: shinhogle@gmail.com（3s3.cube@gmail.com と混同しないこと）

## Purpose

営業担当が顧客情報とアポ報告を1つのフォームから登録・更新し、Google スプレッドシートへ記録、LINE グループへ通知、前日分を日次集計するシステム。アフィリンクの顧客管理（顧客×案件）と名前で名寄せ統合し、「その顧客がどの案件を行ったか」まで含めた充実した顧客管理ツールにする。

## Users And Stakeholders

- 運用・管理者: shinhogle@gmail.com
- 営業担当（フォーム入力者。アフィリンク紹介者と同じフルネーム表記で統一）
- 通知先: アポ管理 LINE グループ

## System Scope

- フロントエンド: `index.html`（パスワード認証 → 顧客選択 → 顧客情報＋アポ情報フォーム）。GitHub Pages 配信（`github.com/Kazu02/customer-apo-management`）。
- バックエンド: GAS Web App（`main.js`）。`doGet`（getCustomers / getCustomer）、`doPost`（新規登録 / 既存更新＋アポ報告）。
- データ: バインドされたスプレッドシート。シート `顧客情報` / `アポ報告`、統合で `統合顧客管理` / `名寄せ`。
- 顧客情報項目: ID / タイムスタンプ / 営業担当 / 会社名・屋号 / 名前 / 年齢 / 住所・エリア / 職業 / **おみくじ（5段階 select: 大大吉・大吉・中吉・小吉・凶）** / ニーズ / 生年月日 / 趣味 / MBTI / 持ち家かどうか / 備考。
- アポ報告項目: タイムスタンプ / 営業担当 / ID-会社名-名前 / アポ日時 / 話した内容 / 着地 / 次回アクション日時 / 次回アクション / 特記事項 / **自己採点（10点満点）**。
- 営業担当の通常選択肢: 柳沢悠貴 / 岩本拓也 / 菅原貴博 / 村井亮介 / 大島雅史 / 小椋裕也 / 細川貴弘 / 藤森宣哉。

## Architecture And Operations

- clasp 管理（`.clasp.json` の scriptId）。clasp 3.x。
- デプロイ（バックエンド）: `clasp push` → `clasp redeploy <deploymentId>`（既存 Web App URL を維持）。
- デプロイ（フロント）: `index.html` を GitHub（`Kazu02/customer-apo-management`）へ push → GitHub Pages 反映。
- GAS アカウントは必ず shinhogle@gmail.com。`clasp logout` → `clasp login` で確認（executeAs: USER_DEPLOYING のため誤アカウント厳禁）。
- LINE 通知: ScriptProperties `LINE_CHANNEL_TOKEN` / `APO_LINE_GROUP_ID`。
- 日次集計: `sendDailySummary`（毎朝9時トリガー）。
- アフィリンク統合: 当 GAS が Drive 名 `顧客管理_アフィリエイト` の SS を取得して読み取り、名前正規化で名寄せ。手動修正は `名寄せ` シートの「紐づけ顧客ID（編集可）」で行う。

## Constraints

- 認証情報・個人情報・生の顧客データをメモリファイルに記録しない。
- PowerShell では `npm.cmd` を使用。
- Firestore ではなく GAS + Sheets。セルへ `undefined` を書かない（`|| ''` で回避）。
- デプロイは承認制。GAS アカウントの取り違え厳禁。

## Sources Of Truth

- `main.js` / `index.html` / `appsscript.json`
- Git history（ネスト Git リポジトリ）
- `DECISIONS.md` / `ROADMAP.md`
- Current `CODEX_TASK.md`, when present
