// ===== 設定 =====
var CUSTOMER_SHEET_NAME = '顧客情報';
var APO_SHEET_NAME = 'アポ報告';
var LINE_PUSH_API_URL = 'https://api.line.me/v2/bot/message/push';

var CUSTOMER_HEADERS = [
  'ID', 'タイムスタンプ', '営業担当', '会社名・屋号', '名前',
  '年齢', '住所・エリア', '職業', 'おみくじ', 'ニーズ',
  '生年月日', '趣味', 'MBTI', '持ち家かどうか', '備考'
];

var APO_HEADERS = [
  'タイムスタンプ', '営業担当', 'ID-会社名-名前', 'アポ日時',
  '話した内容', '着地', '次回アクション日時', '次回アクション', '特記事項', '自己採点'
];

// ===== 営業担当 名簿（単一の変更点）=====
// メンバーの増減はこの SALES_STAFF 配列を編集するだけ。
// ※ index.html 側の SALES_STAFF と必ず同じ内容に保つこと。
var SALES_STAFF = [
  '柳沢悠貴', '岩本拓也', '菅原貴博', '村井亮介',
  '大島雅史', '小椋裕也', '細川貴弘', '藤森宣哉', '江口裕人', '藤井勇大'
];
// 表記ゆれ・苗字のみ → フルネーム（正規名の自己対応は SALES_STAFF から自動生成）。
// 須川一輝 は現行名簿外だが過去データ正規化のため残す。
var SALES_STAFF_ALIASES = {
  '柳沢': '柳沢悠貴', '柳澤': '柳沢悠貴', '橋沢': '柳沢悠貴', '橋澤': '柳沢悠貴',
  '岩本': '岩本拓也', '菅原': '菅原貴博', '村井': '村井亮介', '大島': '大島雅史',
  '小椋': '小椋裕也', '細川': '細川貴弘', '藤森': '藤森宣哉', '江口': '江口裕人',
  '藤井': '藤井勇大',
  '須川': '須川一輝', '須川一輝': '須川一輝'
};
var SALES_STAFF_NAME_MAP = (function() {
  var m = {};
  SALES_STAFF.forEach(function(n) { m[n] = n; });
  Object.keys(SALES_STAFF_ALIASES).forEach(function(k) { m[k] = SALES_STAFF_ALIASES[k]; });
  return m;
})();

function normalizeSalesStaff_(value) {
  var raw = String(value || '').trim();
  var key = raw.replace(/[\s　]+/g, '');
  return SALES_STAFF_NAME_MAP[key] || raw;
}

function normalizePayloadSalesStaff_(data) {
  data['営業担当'] = normalizeSalesStaff_(data['営業担当']);
  return data;
}

// ===== Web App エンドポイント =====

function doGet(e) {
  var action = e.parameter.action || '';
  var result;

  if (action === 'getCustomers') {
    result = getCustomerListData();
  } else if (action === 'getCustomer') {
    result = getCustomerData(Number(e.parameter.id));
  } else {
    result = { error: 'unknown action' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;
  try {
    var data = JSON.parse(e.parameter.data);
    normalizePayloadSalesStaff_(data);
    data['タイムスタンプ'] = new Date();

    if (data.isNew) {
      var newId = registerCustomer(data);
      data['ID-会社名-名前'] = newId + ' - ' + (data['会社名・屋号'] || '') + ' - ' + (data['名前'] || '');
      registerApo(data);
      result = { success: true, id: newId };
      try {
        notifyApoGroup(buildCustomerMessage(data, newId));
        notifyApoGroup(buildApoMessage(data, true));
      } catch (lineErr) { Logger.log('LINE通知エラー: ' + lineErr); }
    } else {
      updateCustomerById(data);
      data['ID-会社名-名前'] = data.id + ' - ' + (data['会社名・屋号'] || '') + ' - ' + (data['名前'] || '');
      registerApo(data);
      result = { success: true };
      try {
        notifyApoGroup(buildApoMessage(data, false));
      } catch (lineErr) { Logger.log('LINE通知エラー: ' + lineErr); }
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 顧客一覧を検索・選択用に返す =====
// label は従来互換。company / name / staff はフロントの顧客名検索用（追加項目）。
function getCustomerListData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMER_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  return data
    .filter(function(row) { return row[0] !== ''; })
    .map(function(row) {
      var company = row[3] === null || row[3] === undefined ? '' : String(row[3]).trim();
      var name = row[4] === null || row[4] === undefined ? '' : String(row[4]).trim();
      return {
        id: row[0],
        label: row[0] + ' - ' + company + ' - ' + name,
        company: company,
        name: name,
        staff: normalizeSalesStaff_(row[2])
      };
    });
}

// ===== 特定顧客のデータをIDで返す =====
function getCustomerData(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMER_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, CUSTOMER_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === id) {
      var obj = {};
      CUSTOMER_HEADERS.forEach(function(h, idx) {
        var val = data[i][idx];
        if (val instanceof Date) {
          obj[h] = Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy/MM/dd');
        } else {
          obj[h] = val;
        }
      });
      return obj;
    }
  }
  return null;
}

// ===== 顧客情報シートに書き込む（新規） =====
function registerCustomer(v) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, CUSTOMER_SHEET_NAME, CUSTOMER_HEADERS);

  var newId = sheet.getLastRow();
  var row = [
    newId,
    v['タイムスタンプ'] || new Date(),
    normalizeSalesStaff_(v['営業担当']),
    v['会社名・屋号'] || '',
    v['名前'] || '',
    v['年齢'] || '',
    v['住所・エリア'] || '',
    v['職業'] || '',
    v['おみくじ'] || '',
    v['ニーズ'] || '',
    v['生年月日'] || '',
    v['趣味'] || '',
    v['MBTI'] || '',
    v['持ち家かどうか'] || '',
    v['備考'] || ''
  ];

  sheet.appendRow(row);
  return newId;
}

// ===== 顧客情報を上書き更新する =====
function updateCustomerById(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMER_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CUSTOMER_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      var rowIndex = i + 2;
      var originalTimestamp = rows[i][1];
      var row = [
        data.id,
        originalTimestamp,
        normalizeSalesStaff_(data['営業担当']),
        data['会社名・屋号'] || '',
        data['名前'] || '',
        data['年齢'] || '',
        data['住所・エリア'] || '',
        data['職業'] || '',
        data['おみくじ'] || '',
        data['ニーズ'] || '',
        data['生年月日'] || '',
        data['趣味'] || '',
        data['MBTI'] || '',
        data['持ち家かどうか'] || '',
        data['備考'] || ''
      ];
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      return;
    }
  }
}

// ===== アポ報告シートに書き込む =====
function registerApo(v) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, APO_SHEET_NAME, APO_HEADERS);
  ensureHeaders(sheet, APO_HEADERS);

  var row = [
    v['タイムスタンプ'] || new Date(),
    normalizeSalesStaff_(v['営業担当']),
    v['ID-会社名-名前'] || '',
    v['アポ日時'] || '',
    v['話した内容'] || '',
    v['着地'] || '',
    v['次回アクション日時'] || '',
    v['次回アクション'] || '',
    v['特記事項'] || '',
    v['自己採点'] || ''
  ];

  sheet.appendRow(row);
}

// ===== 初回セットアップ（一度だけ手動実行） =====
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet(ss, CUSTOMER_SHEET_NAME, CUSTOMER_HEADERS);
  getOrCreateSheet(ss, APO_SHEET_NAME, APO_HEADERS);
  Logger.log('セットアップ完了');
}

// ===== テスト用 =====
function testCustomer() {
  var v = {
    'タイムスタンプ': new Date(),
    '営業担当': '柳沢悠貴',
    '会社名・屋号': 'テスト株式会社',
    '名前': 'テスト太郎',
    '年齢': '30',
    '住所・エリア': '東京',
    '職業': '会社員',
    'おみくじ': '大吉',
    'ニーズ': 'テスト',
    '生年月日': '1994/01/01',
    '趣味': 'テスト',
    'MBTI': 'INTJ',
    '持ち家かどうか': '賃貸',
    '備考': 'テストデータ',
    'アポ日時': '2026/04/21 10:00',
    '話した内容': '初回面談',
    '着地': '興味あり',
    '次回アクション日時': '2026/04/28 10:00',
    '次回アクション': 'フォロー電話',
    '特記事項': ''
  };
  var newId = registerCustomer(v);
  v['ID-会社名-名前'] = newId + ' - ' + v['会社名・屋号'] + ' - ' + v['名前'];
  registerApo(v);
  Logger.log('顧客登録＋アポ報告テスト完了 ID=' + newId);
}

// ===== LINE通知 =====

function notifyApoGroup(text) {
  var props   = PropertiesService.getScriptProperties();
  var token   = props.getProperty('LINE_CHANNEL_TOKEN');
  var groupId = props.getProperty('APO_LINE_GROUP_ID');
  if (!token || !groupId) return;
  var msg = text.length > 4990 ? text.substring(0, 4990) + '...' : text;
  UrlFetchApp.fetch(LINE_PUSH_API_URL, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify({ to: groupId, messages: [{ type: 'text', text: msg }] }),
    muteHttpExceptions: true
  });
}

function buildCustomerMessage(data, newId) {
  var lines = ['【新規顧客登録】ID: ' + newId];
  var fields = ['営業担当','会社名・屋号','名前','年齢','住所・エリア','職業',
                'おみくじ','ニーズ','生年月日','趣味','MBTI','持ち家かどうか','備考'];
  fields.forEach(function(f) {
    var v = data[f];
    if (v !== undefined && v !== '') lines.push(f + ': ' + v);
  });
  return lines.join('\n');
}

function buildApoMessage(data, isNew) {
  var header = isNew ? '【新規顧客アポ報告】' : '【アポ報告】';
  var lines = [
    header,
    '営業担当: ' + normalizeSalesStaff_(data['営業担当']),
    '顧客: '    + (data['会社名・屋号'] || '') + ' ' + (data['名前'] || '')
  ];
  var fields = ['アポ日時','話した内容','着地','自己採点','次回アクション日時','次回アクション','特記事項'];
  fields.forEach(function(f) {
    var v = data[f];
    if (v !== undefined && v !== '') lines.push(f + ': ' + v);
  });
  return lines.join('\n');
}

// ===== 日次集計（毎朝9時トリガーで実行） =====

function sendDailySummary() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var yesterday = getYesterdayStr();

  var customerCounts = countByStaff(ss, CUSTOMER_SHEET_NAME, 1, 2, yesterday); // タイムスタンプ=col1, 営業担当=col2
  var apoCounts      = countByStaff(ss, APO_SHEET_NAME,      0, 1, yesterday); // タイムスタンプ=col0, 営業担当=col1

  var customerTotal = sumValues(customerCounts);
  var apoTotal      = sumValues(apoCounts);

  var lines = ['【前日集計】' + yesterday, '━━━━━━━━━━━━━'];

  lines.push('\n■顧客登録（' + customerTotal + '件）');
  if (customerTotal === 0) {
    lines.push('なし');
  } else {
    Object.keys(customerCounts).forEach(function(s) {
      lines.push('・' + s + ': ' + customerCounts[s] + '件');
    });
  }

  lines.push('\n■アポ報告（' + apoTotal + '件）');
  if (apoTotal === 0) {
    lines.push('なし');
  } else {
    Object.keys(apoCounts).forEach(function(s) {
      lines.push('・' + s + ': ' + apoCounts[s] + '件');
    });
  }

  notifyApoGroup(lines.join('\n'));
}

function countByStaff(ss, sheetName, tsColIdx, staffColIdx, dateStr) {
  var counts = {};
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return counts;
  var lastRow  = sheet.getLastRow();
  var lastCol  = Math.max(tsColIdx, staffColIdx) + 1;
  var data     = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  data.forEach(function(row) {
    if (!row[tsColIdx]) return;
    if (toDateStr(row[tsColIdx]) !== dateStr) return;
    var staff = normalizeSalesStaff_(row[staffColIdx]) || '未記入';
    counts[staff] = (counts[staff] || 0) + 1;
  });
  return counts;
}

function sumValues(obj) {
  return Object.keys(obj).reduce(function(sum, k) { return sum + obj[k]; }, 0);
}

function getYesterdayStr() {
  var jstNow       = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  var jstYesterday = new Date(jstNow.getTime() - 24 * 60 * 60 * 1000);
  var p = function(n) { return String(n).padStart(2, '0'); };
  return jstYesterday.getUTCFullYear() + '/' +
         p(jstYesterday.getUTCMonth() + 1) + '/' +
         p(jstYesterday.getUTCDate());
}

function toDateStr(value) {
  if (!value) return '';
  if (value instanceof Date) {
    var jst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
    var p   = function(n) { return String(n).padStart(2, '0'); };
    return jst.getUTCFullYear() + '/' + p(jst.getUTCMonth() + 1) + '/' + p(jst.getUTCDate());
  }
  return String(value).substring(0, 10);
}

// ===== セットアップ（初回に手動実行） =====

function setupApoLineConfig() {
  // GASエディタのスクリプトプロパティに設定済みであること
  // LINE_CHANNEL_TOKEN: アフィリンクと同じLINEチャンネルアクセストークン
  // APO_LINE_GROUP_ID:  アポ管理グループのグループID
  Logger.log('LINE_CHANNEL_TOKEN: ' + (PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN') ? '設定済み' : '未設定'));
  Logger.log('APO_LINE_GROUP_ID: '  + (PropertiesService.getScriptProperties().getProperty('APO_LINE_GROUP_ID')  ? '設定済み' : '未設定'));
}

function setupDailySummaryTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailySummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailySummary')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone('Asia/Tokyo')
    .create();
  Logger.log('毎朝9時トリガーを設置しました');
}

function normalizeExistingSalesStaffNames() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var results = [
    normalizeSalesStaffColumn_(ss, CUSTOMER_SHEET_NAME),
    normalizeSalesStaffColumn_(ss, APO_SHEET_NAME)
  ];
  Logger.log(JSON.stringify(results));
  return results;
}

function normalizeSalesStaffColumn_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return { sheet: sheetName, changed: 0, skipped: true };
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var staffCol = headers.indexOf('営業担当') + 1;
  if (staffCol <= 0) {
    return { sheet: sheetName, changed: 0, skipped: true, reason: '営業担当列なし' };
  }

  var range = sheet.getRange(2, staffCol, sheet.getLastRow() - 1, 1);
  var values = range.getValues();
  var changed = 0;
  var normalizedValues = values.map(function(row) {
    var original = row[0];
    var normalized = normalizeSalesStaff_(original);
    if (original && normalized !== original) changed += 1;
    return [normalized || original];
  });

  if (changed > 0) range.setValues(normalizedValues);
  return { sheet: sheetName, changed: changed, skipped: false };
}

// ===== ユーティリティ =====
// 既存シートにヘッダー不足があれば補う（新項目追加時に既存シートへ反映）
function ensureHeaders(sheet, headers) {
  var lastCol = sheet.getLastColumn();
  var current = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (current.length < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#4a86e8')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ================================================================
// ===== アフィリンク顧客管理との統合（名前で名寄せ） =====
// ================================================================

var INTEGRATED_SHEET_NAME = '統合顧客管理';
var MATCHING_SHEET_NAME   = '名寄せ';
var AFFILI_SS_NAME        = '顧客管理_アフィリエイト';
var AFFILI_BASE_COLS      = 3; // アフィリンク顧客管理の固定列（顧客名・電話番号・顧客ID）

// 統合ビューの固定（プロフィール）列。案件列はアフィリンクの案件数だけ動的に挿入される。
var INTEGRATED_PROFILE_HEADERS = [
  '顧客ID', '名前', '会社名・屋号', '営業担当', '年齢', '職業',
  'おみくじ', 'ニーズ', '趣味', 'MBTI', '持ち家かどうか'
];

// 振込先（口座情報）列。別GASプロジェクト payout-form が「持ち家かどうか」の直後に
// 挿入・書き込みする6列で、統合ビューの再構築でも必ず同じ位置に維持する。
// ここに含めないと writeIntegratedSheet_ の clear() で列も回答も消える。
var PAYOUT_HEADERS = ['金融機関名', '支店名', '預金種目', '口座番号', '口座名義(カナ)', '振込先登録日時'];

var MATCHING_HEADERS = [
  'アフィリンク顧客名', 'アフィリンク営業担当', '案件数',
  '紐づけ顧客ID（編集可）', '紐づけ名前', '状態', '候補（近い名前）'
];

// バインドされたスプレッドシートを開いた時のメニュー
function onOpen() {
  SpreadsheetApp.getUi().createMenu('顧客統合')
    .addItem('統合顧客管理を更新（名寄せ）', 'rebuildIntegratedCustomers')
    .addToUi();
}

// 名前正規化（空白除去＋小文字）
function normName_(name) {
  return String(name || '').replace(/[\s　]+/g, '').toLowerCase();
}

// レーベンシュタイン距離（候補提案用）
function lev_(a, b) {
  a = String(a); b = String(b);
  var m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  var dp = [];
  for (var i = 0; i <= m; i++) dp[i] = [i];
  for (var j = 1; j <= n; j++) dp[0][j] = j;
  for (var x = 1; x <= m; x++) {
    for (var y = 1; y <= n; y++) {
      dp[x][y] = a.charAt(x - 1) === b.charAt(y - 1)
        ? dp[x - 1][y - 1]
        : 1 + Math.min(dp[x - 1][y], dp[x][y - 1], dp[x - 1][y - 1]);
    }
  }
  return dp[m][n];
}

// アフィリンク顧客管理SSを取得（Drive名で検索しIDをキャッシュ）
function getAffiliCustomerSS_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('AFFILI_CUSTOMER_SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (e) { props.deleteProperty('AFFILI_CUSTOMER_SS_ID'); }
  }
  var files = DriveApp.getFilesByName(AFFILI_SS_NAME);
  if (files.hasNext()) {
    var file = files.next();
    props.setProperty('AFFILI_CUSTOMER_SS_ID', file.getId());
    return SpreadsheetApp.openById(file.getId());
  }
  return null;
}

// アフィリンク顧客（営業マン別シート）を読み、名前ごとに案件ステータスを集約。
// 戻り値: { customers: [{normName, rawName, sales, caseStatus:{案件名:状態}}], caseNames: [案件名...] }
function readAffiliCustomers_() {
  var css = getAffiliCustomerSS_();
  if (!css) return { customers: [], caseNames: [] };
  var map = {};
  var caseOrder = [];
  var caseSeen = {};
  css.getSheets().forEach(function(sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    if (headers[0] !== '顧客名') return; // 営業マンシートのみ対象
    var caseNames = headers.slice(AFFILI_BASE_COLS);
    caseNames.forEach(function(cn) {
      if (cn && !caseSeen[cn]) { caseSeen[cn] = true; caseOrder.push(cn); }
    });
    var salesName = sheet.getName();
    var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    rows.forEach(function(row) {
      var rawName = String(row[0] || '').trim();
      if (!rawName) return;
      var key = normName_(rawName);
      if (!map[key]) map[key] = { rawName: rawName, sales: [], caseStatus: {} };
      if (map[key].sales.indexOf(salesName) === -1) map[key].sales.push(salesName);
      caseNames.forEach(function(cn, i) {
        var status = String(row[AFFILI_BASE_COLS + i] || '').trim();
        if (status) map[key].caseStatus[cn] = status;
      });
    });
  });
  var customers = Object.keys(map).map(function(k) {
    return { normName: k, rawName: map[k].rawName, sales: map[k].sales.join('・'), caseStatus: map[k].caseStatus };
  });
  return { customers: customers, caseNames: caseOrder };
}

// フォーム顧客（顧客情報シート）を読む
function readFormCustomers_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMER_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, CUSTOMER_HEADERS.length).getValues();
  return data.filter(function(r) { return r[0] !== ''; }).map(function(r) {
    var obj = {};
    CUSTOMER_HEADERS.forEach(function(h, i) { obj[h] = r[i]; });
    return { id: obj['ID'], name: String(obj['名前'] || '').trim(), normName: normName_(obj['名前']), raw: obj };
  });
}

// 名寄せシートの既存行（手動編集を保持するため）を読む
function loadMatchingRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MATCHING_SHEET_NAME);
  var existing = {};
  if (!sheet || sheet.getLastRow() < 2) return existing;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, MATCHING_HEADERS.length).getValues();
  rows.forEach(function(r) {
    var affName = String(r[0] || '').trim();
    if (affName) existing[affName] = { linkId: r[3], state: String(r[5] || '') };
  });
  return existing;
}

// 既存の統合顧客管理から振込先6列を退避する（再構築で消さないため）。
// 先頭ゼロ（口座番号・ゆうちょ店番）を落とさないよう表示値で読む。
// キーは顧客ID優先。「アフィリンクのみ」行はIDが無いので正規化した名前でも引けるようにする。
function loadPayoutSnapshot_(ss) {
  var snap = { byId: {}, byName: {} };
  var sheet = ss.getSheetByName(INTEGRATED_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return snap;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  var start = headers.indexOf(PAYOUT_HEADERS[0]);
  if (start < 0) return snap; // 振込先列がまだ無い（初回）
  var width = Math.min(PAYOUT_HEADERS.length, lastCol - start);
  if (width < 1) return snap;
  var n = sheet.getLastRow() - 1;
  var idCol = headers.indexOf('顧客ID');
  var nameCol = headers.indexOf('名前');
  var vals = sheet.getRange(2, start + 1, n, width).getDisplayValues();
  var ids = idCol >= 0 ? sheet.getRange(2, idCol + 1, n, 1).getDisplayValues() : null;
  var names = nameCol >= 0 ? sheet.getRange(2, nameCol + 1, n, 1).getDisplayValues() : null;
  for (var i = 0; i < n; i++) {
    var row = vals[i].slice(0, PAYOUT_HEADERS.length);
    while (row.length < PAYOUT_HEADERS.length) row.push('');
    if (!row.join('').trim()) continue; // 空行は退避しない
    var id = ids ? String(ids[i][0]).trim() : '';
    var nm = names ? normName_(names[i][0]) : '';
    if (id) snap.byId[id] = row;
    if (nm && !snap.byName[nm]) snap.byName[nm] = row;
  }
  return snap;
}

// 退避した振込先を顧客ID→名前の順で引く。見つからなければ空6セル。
function payoutFor_(snap, id, name) {
  var key = (id === null || id === undefined) ? '' : String(id).trim();
  if (key && snap.byId[key]) return snap.byId[key].slice();
  var nk = normName_(name);
  if (nk && snap.byName[nk]) return snap.byName[nk].slice();
  var empty = [];
  for (var i = 0; i < PAYOUT_HEADERS.length; i++) empty.push('');
  return empty;
}

// シートを丸ごと書き換え（ヘッダー書式付き）
// beforeWrite: clear() は書式も消すため、値を入れる前に書式を戻したいときに使う。
function writeIntegratedSheet_(ss, name, headers, rows, headerColor, beforeWrite) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  // 列・行が足りないと setValues が失敗するので先に広げる（案件が増えても落ちないように）
  if (headers.length > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  if (rows.length + 1 > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  }
  sheet.clear();
  if (beforeWrite) beforeWrite(sheet);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground(headerColor).setFontColor('#ffffff');
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  return sheet;
}

// 案件セルをステータスで背景色分け（瞬時に判別できるように）
function colorCaseCells_(sheet, startRow, startCol, statusMatrix) {
  var colorOf = function(s) {
    if (s === '完了')   return '#d9ead3'; // 緑＝終了
    if (s === '申請済') return '#cfe2f3'; // 青＝申請済
    if (s === '申請中') return '#fff2cc'; // 黄＝進行中
    if (s === '不参加') return '#efefef'; // 灰＝対象外
    return '#ffffff';                     // 空＝未着手
  };
  var bg = statusMatrix.map(function(r) { return r.map(colorOf); });
  sheet.getRange(startRow, startCol, bg.length, bg[0].length).setBackgrounds(bg);
}

// 統合ビュー（案件を1案件＝1列で横展開）と名寄せシートを再構築（メニュー実行）
// 名寄せの「紐づけ顧客ID（編集可）」を手で直すと、次回実行時にその紐づけが優先される。
function rebuildIntegratedCustomers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 振込先（口座情報）は書き換え前に退避する。必ず統合ビューを書き出す前に読むこと。
  var payoutSnap = loadPayoutSnapshot_(ss);
  var formCustomers = readFormCustomers_();
  var affili        = readAffiliCustomers_();
  var affiliCustomers = affili.customers;
  var caseNames       = affili.caseNames;
  var existing        = loadMatchingRows_();

  var formById = {};
  var formByNorm = {};
  formCustomers.forEach(function(c) {
    formById[String(c.id)] = c;
    if (c.normName) formByNorm[c.normName] = c;
  });

  // 名寄せ
  var matchingRows = [];
  var affiToFormId = {};
  var affiByFormId = {};
  affiliCustomers.forEach(function(a) {
    var caseCount = Object.keys(a.caseStatus).length;
    var autoId = formByNorm[a.normName] ? String(formByNorm[a.normName].id) : '';
    var prev   = existing[a.rawName];
    var linkedId = '', linkedName = '', state = '', candidate = '';

    if (prev && prev.linkId !== '' && prev.linkId !== null && prev.linkId !== undefined
        && formById[String(prev.linkId)]) {
      linkedId   = prev.linkId;
      linkedName = formById[String(linkedId)].name;
      state      = (String(linkedId) === autoId && autoId !== '') ? '自動一致' : '手動';
    } else if (autoId) {
      linkedId   = autoId;
      linkedName = formByNorm[a.normName].name;
      state      = '自動一致';
    } else {
      state = '未一致';
      var best = null, bestD = 99;
      formCustomers.forEach(function(c) {
        if (!c.normName) return;
        var d = lev_(a.normName, c.normName);
        if (d < bestD) { bestD = d; best = c; }
      });
      if (best && bestD <= 2) candidate = best.name + '（ID:' + best.id + '）';
    }

    if (linkedId !== '') {
      affiToFormId[a.normName] = String(linkedId);
      if (!affiByFormId[String(linkedId)]) affiByFormId[String(linkedId)] = a;
    }
    matchingRows.push([a.rawName, a.sales, caseCount, linkedId, linkedName, state, candidate]);
  });

  // 統合ビュー: 案件を1案件＝1列で横展開。振込先6列は「持ち家かどうか」の直後に固定。
  var headers = INTEGRATED_PROFILE_HEADERS.concat(PAYOUT_HEADERS).concat(caseNames).concat(['アフィリンク顧客名', '状態']);
  var caseCells = function(caseStatus) {
    return caseNames.map(function(cn) { return caseStatus[cn] || ''; });
  };

  var integratedRows = [];
  var caseMatrix     = []; // 案件列のみ（色付け用）

  // フォーム顧客全件
  formCustomers.forEach(function(c) {
    var a  = affiByFormId[String(c.id)];
    var cs = a ? a.caseStatus : {};
    var cells = caseCells(cs);
    caseMatrix.push(cells);
    integratedRows.push(
      [c.id, c.raw['名前'], c.raw['会社名・屋号'], c.raw['営業担当'], c.raw['年齢'], c.raw['職業'],
       c.raw['おみくじ'], c.raw['ニーズ'], c.raw['趣味'], c.raw['MBTI'], c.raw['持ち家かどうか']]
      .concat(payoutFor_(payoutSnap, c.id, c.raw['名前']))
      .concat(cells)
      .concat([a ? a.rawName : '', (a && Object.keys(a.caseStatus).length) ? '統合済' : 'フォームのみ'])
    );
  });
  // アフィリンクのみ（フォーム未登録 / 未紐づけ）
  affiliCustomers.forEach(function(a) {
    if (affiToFormId[a.normName]) return;
    var cells = caseCells(a.caseStatus);
    caseMatrix.push(cells);
    integratedRows.push(
      ['', a.rawName, '', a.sales, '', '', '', '', '', '', '']
      .concat(payoutFor_(payoutSnap, '', a.rawName))
      .concat(cells)
      .concat([a.rawName, 'アフィリンクのみ'])
    );
  });

  writeIntegratedSheet_(ss, MATCHING_SHEET_NAME, MATCHING_HEADERS, matchingRows, '#7c3aed');
  var payoutStartCol = INTEGRATED_PROFILE_HEADERS.length + 1;
  var intSheet = writeIntegratedSheet_(ss, INTEGRATED_SHEET_NAME, headers, integratedRows, '#4a86e8', function(sheet) {
    // 口座番号・ゆうちょ店番の先頭ゼロ落ちを防ぐため、値を入れる前にテキスト書式へ戻す
    sheet.getRange(1, payoutStartCol, sheet.getMaxRows(), PAYOUT_HEADERS.length).setNumberFormat('@');
  });

  // 案件セルをステータスで色分け＋名前列を固定（横スクロールでも顧客が分かるように）
  if (caseNames.length && caseMatrix.length) {
    colorCaseCells_(intSheet, 2, payoutStartCol + PAYOUT_HEADERS.length, caseMatrix);
  }
  intSheet.setFrozenColumns(2);

  ss.toast('統合 ' + integratedRows.length + '件 / 案件 ' + caseNames.length + '列 / 名寄せ ' + matchingRows.length + '件', '統合顧客管理', 5);
}
