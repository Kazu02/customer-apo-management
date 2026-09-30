// ===== 月間送信数の上限で届かなかった通知の再送（2026-09-30 追加・9月分の1回限り） =====
//
// 公式LINE（アフィリンクと同じチャンネル）の月間送信数が 2026-09-29 夕方に上限へ達し、
// それ以降の顧客登録・アポ報告・前日集計の通知は notifyApoGroup() が応答を見ないため黙って捨てられていた。
// 通数は月初（日本時間 10/1 0:00）に戻るので、その直後にシートから本文を組み立て直して送る。
//
// グループへの push は「グループ人数 × 1通」で数えられる。1件ずつ送ると件数倍になるので、
// 1回の push に吹き出しを5つまで詰めて送る（10月の通数を使い過ぎないため）。

// アポ共有グループでボットの通知が最後に届いた時刻。これより後の報告が対象。
var QR_SINCE        = new Date('2026-09-29T18:31:36+09:00');
// 通数が戻る時刻。これ以降の報告は通常どおり届くので対象にしない。
var QR_UNTIL        = new Date('2026-10-01T00:00:00+09:00');
var QR_FIRST_RUN_AT = new Date('2026-10-01T00:01:00+09:00');
var QR_HANDLER      = 'runQuotaResend202609';
var QR_PROGRESS_KEY = 'QUOTA_RESEND_202609_SENT_PUSHES';
var QR_ATTEMPT_KEY  = 'QUOTA_RESEND_202609_ATTEMPTS';
var QR_MAX_ATTEMPTS = 18;    // 10分おきに3時間まで。まだ上限なら人が見る
var QR_BUBBLES_PER_PUSH = 5; // LINE の push 1回に入れられる吹き出しの上限
// 9/30 9時の前日集計（9/29分）も届いていない。受信順に並べるための時刻。
var QR_MISSED_SUMMARY = { date: '2026/09/29', at: new Date('2026-09-30T09:00:00+09:00') };

function qrCell_(v) {
  if (v instanceof Date) {
    var hm = Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
    return Utilities.formatDate(v, 'Asia/Tokyo', hm === '00:00' ? 'yyyy/MM/dd' : 'yyyy/MM/dd HH:mm');
  }
  return v === null || v === undefined ? '' : String(v);
}

// 見出し行の直後に受付時刻を差し込む（新しい報告と取り違えないため）。
function qrWithTime_(text, at) {
  var t = Utilities.formatDate(at, 'Asia/Tokyo', 'M/d HH:mm');
  var i = text.indexOf('\n');
  return i < 0 ? text + '\n受付: ' + t : text.substring(0, i) + '（' + t + ' 受付分）' + text.substring(i);
}

function collectQuotaResendItems_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var items = [];

  var customers = {};
  var cs = ss.getSheetByName(CUSTOMER_SHEET_NAME);
  if (cs && cs.getLastRow() >= 2) {
    cs.getRange(2, 1, cs.getLastRow() - 1, CUSTOMER_HEADERS.length).getValues().forEach(function(r) {
      var obj = {};
      CUSTOMER_HEADERS.forEach(function(h, i) { obj[h] = h === 'タイムスタンプ' ? r[i] : qrCell_(r[i]); });
      customers[String(r[0])] = obj;
    });
  }

  var as = ss.getSheetByName(APO_SHEET_NAME);
  if (as && as.getLastRow() >= 2) {
    as.getRange(2, 1, as.getLastRow() - 1, APO_HEADERS.length).getValues().forEach(function(r) {
      var ts = r[0];
      if (!(ts instanceof Date)) return;
      if (ts.getTime() <= QR_SINCE.getTime() || ts.getTime() >= QR_UNTIL.getTime()) return;

      var data = {};
      APO_HEADERS.forEach(function(h, i) { data[h] = h === 'タイムスタンプ' ? r[i] : qrCell_(r[i]); });
      var label = String(data['ID-会社名-名前'] || '');
      var parts = label.split(' - ');
      var id = String(parts[0] || '').trim();
      var c = customers[id];
      data['会社名・屋号'] = c ? c['会社名・屋号'] : (parts[1] || '');
      data['名前']         = c ? c['名前']         : parts.slice(2).join(' - ');

      // 新規登録は顧客行とアポ行に同じタイムスタンプを書く（doPost）。更新では顧客行の時刻は変わらない。
      var isNew = !!(c && c['タイムスタンプ'] instanceof Date &&
                     Math.abs(c['タイムスタンプ'].getTime() - ts.getTime()) < 2000);
      if (isNew) {
        var cdata = {};
        Object.keys(c).forEach(function(k) { cdata[k] = k === 'タイムスタンプ' ? '' : c[k]; });
        items.push({ at: ts, text: qrWithTime_(buildCustomerMessage(cdata, id), ts) });
      }
      items.push({ at: ts, text: qrWithTime_(buildApoMessage(data, isNew), ts) });
    });
  }

  if (QR_MISSED_SUMMARY.at.getTime() > QR_SINCE.getTime()) {
    items.push({ at: QR_MISSED_SUMMARY.at, text: buildQuotaResendSummary_(ss, QR_MISSED_SUMMARY.date) });
  }

  items.sort(function(a, b) { return a.at.getTime() - b.at.getTime(); });
  return items;
}

// sendDailySummary() と同じ中身を、日付を指定して組み立てる。
function buildQuotaResendSummary_(ss, dateStr) {
  var customerCounts = countByStaff(ss, CUSTOMER_SHEET_NAME, 1, 2, dateStr);
  var apoCounts      = countByStaff(ss, APO_SHEET_NAME,      0, 1, dateStr);
  var customerTotal = sumValues(customerCounts);
  var apoTotal      = sumValues(apoCounts);

  var lines = ['【前日集計】' + dateStr + '（9/30 9時に届かなかった分）', '━━━━━━━━━━━━━'];
  lines.push('\n■顧客登録（' + customerTotal + '件）');
  if (customerTotal === 0) lines.push('なし');
  Object.keys(customerCounts).forEach(function(s) { lines.push('・' + s + ': ' + customerCounts[s] + '件'); });
  lines.push('\n■アポ報告（' + apoTotal + '件）');
  if (apoTotal === 0) lines.push('なし');
  Object.keys(apoCounts).forEach(function(s) { lines.push('・' + s + ': ' + apoCounts[s] + '件'); });
  return lines.join('\n');
}

// 送る吹き出しを push 単位に分けて返す。先頭に事情の説明を1つ置く。
function buildQuotaResendPushes_() {
  var bodies = collectQuotaResendItems_().map(function(it) { return it.text; });
  if (!bodies.length) return [];
  var intro = '【未送信分の再送】\n' +
    '公式LINEの月間送信数が上限に達していたため、9/29 18:31 以降〜9/30 の通知 ' + bodies.length +
    '件が届いていませんでした。受付順にまとめて送ります。\n' +
    '新しい報告ではありません（受付時刻をご確認ください）。';
  var bubbles = [intro].concat(bodies);
  var pushes = [];
  for (var i = 0; i < bubbles.length; i += QR_BUBBLES_PER_PUSH) {
    pushes.push(bubbles.slice(i, i + QR_BUBBLES_PER_PUSH));
  }
  return pushes;
}

function qrPush_(bubbles) {
  var props   = PropertiesService.getScriptProperties();
  var token   = props.getProperty('LINE_CHANNEL_TOKEN');
  var groupId = props.getProperty('APO_LINE_GROUP_ID');
  if (!token || !groupId) return { code: -1, body: 'LINE設定なし' };
  var res = UrlFetchApp.fetch(LINE_PUSH_API_URL, {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify({
      to: groupId,
      messages: bubbles.map(function(t) {
        return { type: 'text', text: t.length > 4990 ? t.substring(0, 4990) + '...' : t };
      })
    }),
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: res.getContentText().substring(0, 300) };
}

function qrDeleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === QR_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

// ---- 送らずに中身だけ確かめる（GASエディタから実行）----
function previewQuotaResend202609() {
  var pushes = buildQuotaResendPushes_();
  Logger.log('push回数: ' + pushes.length + ' / 送信済み: ' +
    (PropertiesService.getScriptProperties().getProperty(QR_PROGRESS_KEY) || '0'));
  pushes.forEach(function(p, i) {
    p.forEach(function(b, j) { Logger.log((i + 1) + '-' + (j + 1) + ': ' + b.split('\n').slice(0, 2).join(' / ')); });
  });
}

// ---- 10/1 0:01 に1回だけ動く予約を入れる（GASエディタから1回実行）----
function scheduleQuotaResend202609() {
  qrDeleteTriggers_();
  ScriptApp.newTrigger(QR_HANDLER).timeBased().at(QR_FIRST_RUN_AT).create();
  Logger.log('予約しました: ' + QR_FIRST_RUN_AT);
  previewQuotaResend202609();
}

// ---- 本体。まだ上限なら10分後に自分を予約し直す ----
function runQuotaResend202609() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (new Date() < QR_UNTIL) { Logger.log('月が替わる前なので送らない'); return; }
    var props  = PropertiesService.getScriptProperties();
    var pushes = buildQuotaResendPushes_();
    var done = parseInt(props.getProperty(QR_PROGRESS_KEY) || '0', 10);
    for (var i = done; i < pushes.length; i++) {
      var r = qrPush_(pushes[i]);
      Logger.log('push ' + (i + 1) + '/' + pushes.length + ': HTTP ' + r.code + ' ' + r.body);
      if (r.code !== 200) {
        var attempts = parseInt(props.getProperty(QR_ATTEMPT_KEY) || '0', 10) + 1;
        props.setProperty(QR_ATTEMPT_KEY, String(attempts));
        qrDeleteTriggers_();
        if (attempts < QR_MAX_ATTEMPTS) {
          ScriptApp.newTrigger(QR_HANDLER).timeBased().after(10 * 60 * 1000).create();
        }
        return;
      }
      props.setProperty(QR_PROGRESS_KEY, String(i + 1));
    }
    qrDeleteTriggers_();
    Logger.log('再送完了: push ' + pushes.length + '回');
  } finally {
    lock.releaseLock();
  }
}
