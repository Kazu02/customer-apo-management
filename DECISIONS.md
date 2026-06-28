# Decisions

## 2026-06-12: Adopt File-Based Project Memory

- Decision: Store durable project context in `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `ROADMAP.md`.
- Reason: Claude and Codex sessions do not reliably share complete conversation history.
- Consequence: Important conclusions from project chats must be summarized into these files.
- Safety: Do not copy credentials, personal data, confidential raw data, or full chat transcripts.

## 2026-06-15: おみくじを5段階・自己採点をアポ報告に追加

- Decision: 顧客情報の「おみくじ」をフリーテキストから5段階 select（大大吉・大吉・中吉・小吉・凶）に変更。アポ情報に「自己採点（10点満点）」を追加し、`アポ報告` シートへ記録する。
- Reason: 入力を統一し、アポ報告時に顧客情報（おみくじ含む）と自己採点が更新・蓄積されるようにするため。
- Consequence: `APO_HEADERS` に `自己採点` を追加。既存シートは `ensureHeaders` でヘッダーを補完。おみくじは既存の顧客項目のまま入力UIのみ変更。

## 2026-06-15: アフィリンク顧客管理との名前ベース名寄せ統合

- Decision: 当プロジェクトを母艦に、アフィリンクの `顧客管理_アフィリエイト` SS を Drive 名で取得して読み取り、顧客名の正規化（空白除去＋小文字）で名寄せする。`統合顧客管理` を出力、`名寄せ` を手動修正用とする。
- Reason: アフィリンクはフルネーム程度の情報しかないため、フォーム顧客のリッチな情報と統合し、案件履歴まで見える顧客管理にするため。
- Consequence: 名寄せは自動一致に加え、`名寄せ` シートの「紐づけ顧客ID（編集可）」で後から手動修正可能。未一致行にはレーベンシュタイン距離で近い名前候補を提示。片側のみの顧客（フォームのみ / アフィリンクのみ）も区別して表示。`appsscript.json` の既存スコープ（drive / spreadsheets）で動作（追加認可不要）。

## 2026-06-15: GAS アカウントとデプロイ経路

- Decision: GAS は必ず shinhogle@gmail.com で操作・デプロイする。バックエンドは `clasp push`→`clasp redeploy <deploymentId>`（URL維持）、フロント `index.html` は GitHub（Kazu02/customer-apo-management）へ push して GitHub Pages 反映。
- Reason: `executeAs: USER_DEPLOYING` のため、誤アカウント（3s3.cube）でデプロイすると Web アプリが誤アカウントとして実行され、対象スプレッドシート/Drive にアクセスできず本番が壊れる。
- Consequence: デプロイ前に `clasp show-authorized-user` で shinhogle を確認する。

## 2026-06-28: 営業担当名はアフィリンク紹介者と同じフルネーム表記に統一

- Decision: フォーム顧客管理の営業担当は苗字入力を廃止し、アフィリンク紹介者と同じフルネーム選択式にする。既存データもフルネームへ正規化する。
- Mapping: 柳沢/柳澤/橋沢/橋澤→柳沢悠貴、岩本→岩本拓也、菅原→菅原貴博、村井→村井亮介、大島→大島雅史、小椋→小椋裕也、細川→細川貴弘、藤森→藤森宣哉。既存データにあった須川→須川一輝もフルネーム化する。
- Consequence: `main.js` で送信時・集計時・既存データ一括変換時に正規化する。`index.html` は通常選択肢をアフィリンク側の8名にする。

## 2026-06-28: 営業担当正規化後に統合顧客管理を再生成

- Operation: 営業担当フルネーム正規化後、対象スプレッドシートで `rebuildIntegratedCustomers()` を実行し、`統合顧客管理` と `名寄せ` を再生成した。
- Result: `統合顧客管理` は198行・27列、`名寄せ` は148行で生成確認済み。
- Safety: 実行用の一時Webアクションは削除済み。最終GASデプロイは既存Web App URLを維持したまま version 17（`統合顧客管理更新後 最終`）。
