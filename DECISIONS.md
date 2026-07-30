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

## 2026-07-16: 営業担当名簿を単一配列に集約し 江口裕人 を追加

- Decision: 営業担当の一覧を `SALES_STAFF` 配列（`main.js` / `index.html` 各1箇所）に集約。メンバー増減はこの配列を編集するだけにする。
- Change: `SALES_STAFF` に `江口裕人` を追加（計9名）。`index.html` の営業担当セレクトはハードコードの `<option>` を廃し `populateSalesStaffOptions()` で `SALES_STAFF` から動的生成。`SALES_STAFF_NAME_MAP`（正規化辞書）は `SALES_STAFF` ∪ `SALES_STAFF_ALIASES` から自動生成に変更（苗字・表記ゆれのみ手動、須川一輝は過去データ用に残置）。
- Deploy: `clasp push`→`clasp redeploy AKfycbxqy6u9…`（URL維持、version 18）。フロントは GitHub（Kazu02/customer-apo-management）へ push して GitHub Pages 反映。
- Note: 既存の集計・名寄せは営業担当を動的に扱うため、名簿追加のみで自動対応（ハードコードの担当一覧なし）。

## 2026-07-24: 営業担当名簿に 藤井勇大 を追加（計10名）

- 背景: アフィリンク側の担当別データ再生成で、自社フォーム回答の紹介者名「藤井勇大」が名簿に無く除外されていることが判明。ユーザー判断で正式メンバーとして追加し、市場作り配下の3プロジェクトで名簿を揃えた。
- Change: `SALES_STAFF` に `藤井勇大` を追加（`main.js` / `index.html` の両方・計10名）。`SALES_STAFF_ALIASES` に `'藤井': '藤井勇大'` を追加（苗字のみ入力の正規化用）。選択肢は `populateSalesStaffOptions()` が `SALES_STAFF` から動的生成するので他の変更は不要。
- Note: 既存の `藤森宣哉` と苗字の一文字目が同じだが、`SALES_STAFF_NAME_MAP` は完全一致で引くため衝突しない。
- Deploy: `clasp push`→`clasp redeploy AKfycbxqy6u9…`（URL維持、version 18→19）。フロントは GitHub（Kazu02/customer-apo-management）へ push して GitHub Pages 反映。

## 2026-07-26: 既存顧客の選択を「顧客名で検索」方式に変更

- Decision: 顧客選択の全件ドロップダウン（`<select>`・140件）を、顧客名で絞り込む検索コンボボックスに置き換える。
- Reason: 既存顧客に追記するとき、140件のリストから目視で探すのが実用的でなくなっていたため。営業担当が現場で名前から即座に引けることを優先する。
- Change:
  - `index.html`: 検索入力＋候補リスト＋選択中バー（`cs-*` クラス）。候補は顧客名・会社名・ID・営業担当を対象に絞り込み、一致箇所を `<mark>` でハイライト。表示は最大50件（超過分は件数を表示）。キーボード（↑↓/Enter/Esc）、外側クリックで閉じる、`選択解除` で新規モードに戻る。旧 `renderCustomerSelect` / `onCustomerChange` は廃止。
  - 検索の正規化: 全角英数→半角、ひらがな→カタカナ、空白・記号（・, 、. 。- ー _ /）除去、小文字化。空白区切りの複数語はAND条件。並び順は 名前の前方一致 > ID完全一致 > 名前の部分一致 > 会社名 > ID前方一致 > 営業担当。
  - `main.js`: `getCustomerListData()` の返却に `company` / `name` / `staff` を追加（`label` は従来どおり互換維持）。フロントは旧応答でも `label` から復元できるフォールバックを持つ。
- Note: 読みがな列が無いため、漢字氏名をひらがなで検索することはできない（「たなか」→「田中太郎」は不一致）。必要なら `顧客情報` にフリガナ列を足す前提の別対応になる。
- Deploy: `clasp push` → `clasp redeploy AKfycbxqy6u9…`（URL維持、version 19→20）。フロントは GitHub（Kazu02/customer-apo-management）へ push して GitHub Pages 反映。

## 2026-07-26: 既存顧客の年齢が再送信で消える不具合を修正

- Problem: `顧客情報` に全角数字（例「２６」）や「35歳」形式で入っている年齢は、`<input type="number">` が受け付けず空欄で読み込まれる。その状態で送信すると `updateCustomerById` が全項目を上書きするため、年齢がシートから消えていた。
- Fix: `fillCustomerForm` で年齢を半角数字に正規化してから流し込む（全角→半角、数字以外を除去）。
- Note: 検索対応で「既存顧客に追記」が主動線になるため、同時に修正した。

## 2026-07-30: 統合顧客管理の再構築で振込先(口座情報)6列が消えていた

- Problem: `統合顧客管理` の振込先列（金融機関名〜振込先登録日時）が消える。原因は `rebuildIntegratedCustomers()` が組み立てる `headers` に振込先列が含まれておらず、`writeIntegratedSheet_()` の `sheet.clear()` で**列ごと回答を消していた**こと。振込先列は別GASプロジェクト（アフィリンク/payout-form）が `ensurePayoutColumns_()` で「持ち家かどうか」の直後に挿入・書き込むため、**このプロジェクトの再構築が唯一の消失経路**だった。メニュー「顧客統合 > 統合顧客管理を更新（名寄せ）」を押すたびに消える。
- Decision 1: 振込先を**このプロジェクトが生成する列として明示的に持つ**（`PAYOUT_HEADERS`）。`INTEGRATED_PROFILE_HEADERS` の直後・案件列の手前に固定配置し、payout-form が期待する位置（「持ち家かどうか」直後）と一致させた。ここに含めない限り `clear()` で必ず消えるため、「知らない列は触らない」設計は取れない。
- Decision 2: 値は**書き換え前に退避して書き戻す**（`loadPayoutSnapshot_()` → `payoutFor_()`）。振込先の正はあくまで payout-form 側の書き込みで、こちらは再構築で失わないための通過点に徹する。
  - 退避は `getDisplayValues()` で読む。`getValues()` だと口座番号・ゆうちょ店番の**先頭ゼロが落ちる**。
  - キーは**顧客ID優先・名前フォールバック**。「アフィリンクのみ」行は顧客IDを持たないため、名前キーが無いと復元できない（実際に該当したのが `押谷沙良`）。名前は `normName_()` で空白除去＋小文字化して引く。
  - 該当なしは空6セル。他人の口座が混ざらないことを実データで確認済み。
- Decision 3: `writeIntegratedSheet_()` に `beforeWrite` フックを追加。`clear()` は書式も消すため、値を入れる**前**に振込先列を `setNumberFormat('@')` でテキストへ戻す。これが無いと復元時に先頭ゼロが落ちる。
- Decision 4: `setValues` の前に列・行が足りなければ拡張するガードを入れた（案件が増えても落ちない）。ガードは `clear()` より**前**に走るので、幅の不整合でシートが空のまま残ることはない。
- 検証: 本番の実データ283行を書き出し、**出荷済みの `loadPayoutSnapshot_`/`payoutFor_` をそのまま実行**して確認。押谷沙良（顧客IDなし）の振込先が名前キーで退避・復元され、全角スペース混入の表記ゆれでも引ける。無関係な顧客は空6セルのまま。列レイアウトは本番と一致（振込先=12列目、案件=18列目から）。`clasp push` 済み・live==local 確認済み。
