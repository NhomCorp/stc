// ============================================================================
// ⚙️ 0_CONFIG.GS — HẰNG SỐ, TỌA ĐỘ CỘT & CẤU HÌNH HỆ THỐNG
// ============================================================================

const PROP = PropertiesService.getScriptProperties();

// 🆔 BẢN ĐỒ GID CỦA CÁC SHEET HỆ THỐNG CỐ ĐỊNH (Không sợ đổi tên tab)
const GID = {
  BAO_CAO: 1475474497,       // Sheet 'Bao Cao v2' (cố định, không đổi tên)
  TOM_TAT: 129580313,        // Sheet 'Tóm tắt_v2' (cố định, không đổi tên)
  ALIAS: 1498755942,         // Sheet 'Alias' (cố định, không đổi tên)
  AI_LEARNING: 203251644,    // Sheet 'AI_Learning' (cố định, không đổi tên)
  QUET_MAIL: 2033507127,     // Sheet 'Quet Mail' (cố định, không đổi tên)
  TEMPLATE_LOG: 192263148,   // Sheet 'Template_Log' (cố định, không đổi tên)
  TEMPLATE_REPORT: 56513848, // Sheet 'Template_Report' (cố định, không đổi tên)
  // MUC_LUC / LOG_CHUYEN / VIEW_* là sheet động (được tạo tự động) — GID lưu vào Script Properties khi tạo.
  // Đọc qua getDynamicSheetGid_(name) để không sợ đổi tên tab.
};

/** Lấy GID đã ghi nhận (Script Properties) cho các sheet động: Mục Lục, Log_Chuyen, View_Log, View_Report…
 * @param {string} propKey Tên property (VD 'muc_luc_gid')
 * @returns {number|null}
 */
function getDynamicGid_(propKey) {
  const raw = PROP.getProperty(propKey);
  const n = Number(raw);
  return raw && !isNaN(n) ? n : null;
}

// 📌 TÊN SHEET QUY ƯỚC ĐẶC BIỆT
const SHEET_NAMES = {
  MUC_LUC: 'Mục Lục',
  LOG_CHUYEN: 'Log_Chuyen',
  AI_LEARNING: 'AI_Learning',
  ADS_BILLING_SYNC: 'Ads_Billing_Sync',
  VIEW_LOG: 'View_Log',
  VIEW_REPORT: 'View_Report'
};

// View_Log / View_Report: hàng 1 = banner, nội dung từ hàng 2.
// Điều khiển (chọn tháng, Xem, Sửa) nằm ở sidebar `viewui.html` — xem 7_MonthView.gs.
// Quét Mail / Invoice CSV: sidebar `opsui.html` — xem 8_OpsSidebar.gs.
// Meta Billing API (Graph): false = tắt sync/check/lịch/telegram. Quét mail + upload CSV vẫn chạy.
// Bật lại: đổi thành true — code không bị xóa.
const META_BILLING_ENABLED = false;

// 🗺️ CỘT Ads_Billing_Sync (INDEX 0) — đối soát Meta ↔ Mail
// Unique Key = Meta txn id (= UNIQUE_KEY khi ghi Log)
const ADS_BILLING_COL = {
  META_TXN_ID: 0,  // Unique Key
  AD_ACCOUNT: 1,
  NGAY: 2,
  SO_TIEN: 3,
  CURRENCY: 4,
  STATUS: 5,       // SEEN | MATCHED_MAIL | MISSING_MAIL | ALERTED | LOGGED_META
  UPDATED_AT: 6,
  GHI_CHU: 7,
  EVENT_TIME: 8
};
const ADS_BILLING_HEADERS = [
  'Unique Key', 'Ad Account', 'Ngày', 'Số tiền', 'Currency',
  'Trạng thái', 'Cập nhật', 'Ghi chú', 'Event Time'
];
const ADS_BILLING_MONEY_FMT = '#,##0;[Red]-#,##0;0';
const ADS_BILLING_TS_FMT = '@'; // Cập nhật / Event Time giữ chuỗi dd/MM/yyyy HH:mm:ss
const ADS_BILLING_STATUS = {
  SEEN: 'SEEN',
  MATCHED_MAIL: 'MATCHED_MAIL',
  MISSING_MAIL: 'MISSING_MAIL',
  ALERTED: 'ALERTED',
  LOGGED_META: 'LOGGED_META' // đã ghi Log tháng từ Meta (UNIQUE_KEY = Meta txn)
};
const META_GRAPH_API_VERSION = 'v26.0';
const META_BILLING_AMOUNT_TOLERANCE = 1; // ±đ khi khớp ngày+tiền
const META_BILLING_LOOKBACK_DAYS_DEFAULT = 60;
// Sync định kỳ chỉ quét từ (watermark − buffer) thay vì full lookback
const META_BILLING_WATERMARK_BUFFER_HOURS = 48;
const META_BILLING_DATE_TOLERANCE_DAYS = 1; // lệch múi giờ UTC ↔ GMT+7

// Lịch trigger (menu Set Trigger / opsui mode=trigger) — giờ theo timezone Apps Script
const MAIL_SCAN_TRIGGER_HANDLER_ = 'runScheduledScanMail';
const MAIL_SCAN_TRIGGER_INTERVAL_HOURS_DEFAULT = 2;  // chế độ "Mỗi N giờ"
const MAIL_SCAN_TRIGGER_HOUR_DEFAULT = 8;            // chế độ "Mỗi ngày"
const MAIL_SCAN_TRIGGER_MINUTE_DEFAULT = 0;
const MAIL_SCAN_REBUILD_AFTER_PROP_ = 'MAIL_SCAN_REBUILD_AFTER'; // switch "nấu báo cáo sau quét"
const REPORT_TRIGGER_INTERVAL_HOURS_DEFAULT = 3;     // trigger báo cáo tự nấu
const REPORT_AUTO_TRIGGER_OFF_PROP_ = 'REPORT_AUTO_TRIGGER_OFF'; // đã tắt trigger báo cáo từ sidebar
const META_BILLING_TRIGGER_HOUR_DEFAULT = 8;
const META_BILLING_TRIGGER_MINUTE_DEFAULT = 30;
// Giá trị giờ hợp lệ cho everyHours() của Apps Script (ngoài ra sẽ báo lỗi / round khác)
const TRIGGER_HOURS_ALLOWED = [1, 2, 3, 4, 5, 6, 8, 12, 24];

// 🧹 CHUẨN HOÁ THÁNG / LOG CHUYỂN
const LOG_CHUYEN_HEADERS = ['Thời gian', 'UNIQUE_KEY', 'Ngày GD', 'Từ sheet', 'Sang sheet', 'Trạng thái', 'Ghi chú'];
const MANUAL_KEY_PREFIX = 'MAN_';
const MONTH_MISMATCH_BG = '#f4cccc';

// 🗺️ TỌA ĐỘ CỘT LOG THÁNG (9 CỘT DUY NHẤT - INDEX 0)
const MONTH_LOG_COL = {
  NGAY: 0,
  PHAN_LOAI: 1,      // Thu / Chi
  SO_TIEN: 2,        // Dương (Thu), Âm (Chi)
  VI: 3,             // Cash, Bank, Credit...
  DOI_TUONG: 4,      // Bản thân, Couple, Khách lẻ...
  DANH_MUC_CON: 5,   // Ăn sáng, Cafe, Xăng xe, ADS...
  GHI_CHU: 6,        // Nội dung diễn giải
  UNIQUE_KEY: 7,     // Mã tracking TX_*
  STATUS: 8          // CHECK / OK
};

// 📑 CỘT MỤC LỤC THÁNG
const MUC_LUC_COL = {
  THANG: 0,
  LOG: 1,
  REPORT: 2
};
const MUC_LUC_DATA_START_ROW = 3;

// ⏱️ THỜI GIAN HẾT HẠN (TTL)
const DRAFT_TTL = 600;        // 10 phút (chờ xác nhận)
const UNDO_TTL = 86400;       // 24 giờ (hoàn tác / sửa)
const EDIT_SESS_TTL = 86400;  // 24 giờ (đồng bộ phiên sửa nháp)
const OPTS_PAGE_SIZE = 6;     // Số nút mỗi trang khi chọn phân loại
const SO_NGAY_QUET_DEFAULT = 1;
const AI_MAIL_MAX_CALLS = 15;

// Hộp thư: Gmail (tài khoản script) + Hotmail (Graph, cred email|password|refresh_token|client_id)
const MAILBOX_ID_GMAIL = 'gmail-default';
const MAIL_HOTMAIL_MAX_PAGES = 6; // 6 × 50 = 300 mail / lần
const MAIL_HOTMAIL_PAGE_SIZE = 50;
const MAIL_ACCOUNTS_PROP_ = 'MAIL_ACCOUNTS_JSON';

function parseHotmailCredLine_(raw) {
  var s = String(raw || '').replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  if (!s) return null;
  if (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') s = s.slice(1, -1).trim();
  s = s.replace(/\n+/g, '').replace(/\s*\|\s*/g, '|').trim();
  var parts = s.split('|');
  var email = '';
  var password = '';
  var refreshToken = '';
  var clientId = '';
  if (parts.length === 3) {
    email = String(parts[0] || '').trim();
    refreshToken = String(parts[1] || '').trim();
    clientId = String(parts[2] || '').trim();
  } else if (parts.length >= 4) {
    email = String(parts[0] || '').trim();
    password = String(parts[1] || '');
    clientId = String(parts[parts.length - 1] || '').trim();
    refreshToken = parts.slice(2, parts.length - 1).join('|').trim();
  } else {
    return null;
  }
  if (!email || !refreshToken || !clientId) return null;
  if (email.indexOf('@') < 1) return null;
  return { email: email, password: password, refreshToken: refreshToken, clientId: clientId };
}

function maskHotmailCredLine_(raw) {
  const p = parseHotmailCredLine_(raw);
  if (!p) return raw ? '••••' : '';
  return p.email + '|••••|' + maskApiKey(p.refreshToken) + '|' + p.clientId;
}

function isMaskedHotmailCred_(raw) {
  return String(raw || '').indexOf('••••') !== -1;
}

function rebuildHotmailCredLine_(cred) {
  return [cred.email, cred.password || '', cred.refreshToken, cred.clientId].join('|');
}

function defaultGmailAccount_() {
  return {
    id: MAILBOX_ID_GMAIL,
    type: 'gmail',
    label: 'Gmail chính',
    email: '',
    enabled: true,
    priority: 1
  };
}

function mailAccountEmailOf_(a, parsed) {
  if (parsed && parsed.email) return parsed.email;
  return String((a && a.email) || '').trim();
}

function mailAccountLabelOf_(a, fallback) {
  const custom = String((a && a.label) || '').trim();
  if (custom) return custom;
  return fallback;
}

function normalizeMailAccountList_(arr) {
  const out = [];
  let hasGmail = false;
  const src = arr && arr.length ? arr : [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i] || {};
    if (a.type === 'gmail' || a.id === MAILBOX_ID_GMAIL) {
      if (hasGmail) continue;
      hasGmail = true;
      out.push({
        id: MAILBOX_ID_GMAIL,
        type: 'gmail',
        label: mailAccountLabelOf_(a, 'Gmail chính'),
        email: String(a.email || '').trim(),
        enabled: a.enabled !== false && a.enabled !== '0',
        priority: 1
      });
      continue;
    }
    if (a.type !== 'hotmail') continue;
    const cred = String(a.cred || '').trim();
    if (!cred) continue;
    const p = parseHotmailCredLine_(cred);
    const email = mailAccountEmailOf_(a, p);
    out.push({
      id: String(a.id || ('hm-' + (i + 1))),
      type: 'hotmail',
      label: mailAccountLabelOf_(a, email || 'Hotmail'),
      email: email,
      enabled: a.enabled === true || a.enabled === 1 || a.enabled === '1' || a.enabled === 'true',
      priority: 10 + out.length,
      cred: cred
    });
  }
  if (!hasGmail) out.unshift(defaultGmailAccount_());
  for (let i = 0; i < out.length; i++) out[i].priority = i + 1;
  return out;
}

/** Danh sách hộp đồng bộ — Script Properties. Có migrate 1 Hotmail cũ. */
function loadMailAccountList_() {
  const raw = String(PROP.getProperty(MAIL_ACCOUNTS_PROP_) || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Object.prototype.toString.call(parsed) === '[object Array]') {
        return normalizeMailAccountList_(parsed);
      }
    } catch (e) {}
  }
  const gmailOn = PROP.getProperty('MAIL_GMAIL_ENABLED') !== '0';
  const list = [defaultGmailAccount_()];
  list[0].enabled = gmailOn;
  const oldCred = String(PROP.getProperty('MAIL_HOTMAIL_CRED') || '').trim();
  if (oldCred) {
    const p = parseHotmailCredLine_(oldCred);
    list.push({
      id: 'hotmail-1',
      type: 'hotmail',
      label: p ? p.email : 'Hotmail',
      enabled: PROP.getProperty('MAIL_HOTMAIL_ENABLED') === '1',
      priority: 2,
      cred: oldCred
    });
  }
  return normalizeMailAccountList_(list);
}

function saveMailAccountList_(list) {
  const norm = normalizeMailAccountList_(list);
  PROP.setProperty(MAIL_ACCOUNTS_PROP_, JSON.stringify(norm.map(function (a) {
    const row = { id: a.id, type: a.type, label: a.label, email: a.email || '', enabled: !!a.enabled, priority: a.priority };
    if (a.type === 'hotmail') row.cred = a.cred || '';
    return row;
  })));
  const gmail = norm.filter(function (a) { return a.type === 'gmail'; })[0];
  PROP.setProperty('MAIL_GMAIL_ENABLED', gmail && gmail.enabled ? '1' : '0');
  return norm;
}

function persistHotmailCred_(cred, newRefreshToken) {
  const rt = String(newRefreshToken || cred.refreshToken).trim();
  cred.refreshToken = rt;
  const line = rebuildHotmailCredLine_(cred);
  const list = loadMailAccountList_();
  let hit = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].type !== 'hotmail') continue;
    const p = parseHotmailCredLine_(list[i].cred);
    if (p && p.email.toLowerCase() === String(cred.email).toLowerCase()
      && p.clientId === cred.clientId) {
      list[i].cred = line;
      if (!list[i].label) list[i].label = cred.email;
      list[i].email = cred.email;
      hit = true;
    }
  }
  if (hit) saveMailAccountList_(list);
  else PROP.setProperty('MAIL_HOTMAIL_CRED', line);
}

function mailAccountsForUi_(list) {
  const src = list || loadMailAccountList_();
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i] || {};
    out.push({
      id: String(a.id || ''),
      type: String(a.type || ''),
      label: String(a.label || a.type || ''),
      email: String(a.email || ''),
      enabled: !!a.enabled,
      priority: Number(a.priority) || (i + 1),
      cred_masked: a.type === 'hotmail' ? String(maskHotmailCredLine_(a.cred || '') || '') : ''
    });
  }
  return out;
}

// ============================================================================
// 🛠️ HÀM CẤU HÌNH & CHẠY TRỰC TIẾP TRÊN GAS EDITOR
// ============================================================================

/**
 * Ép hiện màn hình Review permissions (chạy 1 lần từ Editor).
 * Nếu không thấy popup: Editor → Run → xem banner "Authorization required" / Review permissions.
 */
function authorizeServices() {
  const lines = [];
  try {
    PROP.setProperty('_auth_ping', String(Date.now()));
    lines.push('OK PropertiesService');
  } catch (e) {
    lines.push('ERR Properties: ' + e.message);
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    lines.push(ss ? ('OK SpreadsheetApp active=' + ss.getName()) : 'WARN: khong co spreadsheet active — mo script TU FILE SHEET');
  } catch (e) {
    lines.push('ERR SpreadsheetApp: ' + e.message);
  }
  try {
    UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true, method: 'get' });
    lines.push('OK UrlFetchApp');
  } catch (e) {
    lines.push('ERR UrlFetchApp: ' + e.message);
  }
  try {
    ScriptApp.getProjectTriggers();
    lines.push('OK ScriptApp');
  } catch (e) {
    lines.push('ERR ScriptApp: ' + e.message);
  }
  const msg = lines.join('\n');
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert('authorizeServices', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (ignore) {}
  return msg;
}

/**
 * Khởi tạo Spreadsheet ID và sinh Token bảo mật cấu hình Web.
 * Chạy từ Apps Script gắn với Sheet (Extensions → Apps Script), không phải project rời.
 */
function setupEnvironment() {
  const lines = [];
  try {
    let ssId = '';
    try {
      const activeSs = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSs) ssId = activeSs.getId();
    } catch (eActive) {
      lines.push('WARN activeSpreadsheet: ' + eActive.message);
    }
    if (!ssId) {
      ssId = String(PROP.getProperty('spreadsheet_id') || '').trim();
    }
    if (ssId) {
      PROP.setProperty('spreadsheet_id', ssId);
      lines.push('OK spreadsheet_id=' + ssId);
    } else {
      lines.push('WARN: chua co spreadsheet_id — mo script tu dung file Sheet roi chay lai.');
    }

    if (!PROP.getProperty('config_token')) {
      PROP.setProperty('config_token', Utilities.getUuid());
      lines.push('OK tao config_token');
    }
    if (!PROP.getProperty('webhook_secret')) {
      PROP.setProperty('webhook_secret', Utilities.getUuid());
      lines.push('OK tao webhook_secret — chay runSetWebhook() neu can.');
    }
    if (!PROP.getProperty('admin_id')) {
      lines.push('WARN: chua co admin_id (Telegram chat ID).');
    }
    if (!PROP.getProperty('META_ACCESS_TOKEN')) {
      lines.push('INFO: Meta token chua set (configui muc 6).');
    } else {
      lines.push('OK META_ACCESS_TOKEN da co (len=' + String(PROP.getProperty('META_ACCESS_TOKEN')).length + ')');
    }
    if (PROP.getProperty('META_AD_ACCOUNT_IDS')) {
      lines.push('OK META_AD_ACCOUNT_IDS=' + PROP.getProperty('META_AD_ACCOUNT_IDS'));
    }

    try {
      const base = ScriptApp.getService().getUrl();
      if (base) {
        const configUrl = base + '?config=' + PROP.getProperty('config_token');
        lines.push('OK WebApp config URL: ' + configUrl);
      } else {
        lines.push('INFO: Web App chua deploy — getUrl()=null (bo qua, khong sao).');
      }
    } catch (eUrl) {
      lines.push('INFO: getUrl bo qua: ' + eUrl.message);
    }

    lines.push('DONE setupEnvironment');
  } catch (e) {
    lines.push('ERR: ' + (e && e.message ? e.message : String(e)));
  }

  const msg = lines.join('\n');
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert('setupEnvironment', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (ignore) {}
  return msg;
}

/**
 * Đăng ký Webhook Telegram trực tiếp từ GAS Editor
 */
function runSetWebhook() {
  const token = PROP.getProperty('bot_token');
  if (!token) {
    Logger.log('❌ Chưa có bot_token trong Script Properties. Vui lòng cài đặt trước!');
    return;
  }
  let secret = PROP.getProperty('webhook_secret');
  if (!secret) {
    secret = Utilities.getUuid();
    PROP.setProperty('webhook_secret', secret);
  }
  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) {
    Logger.log('❌ Chưa triển khai Web App (Deploy as Web App). Hãy triển khai trước!');
    return;
  }
  const url = webAppUrl + '?secret=' + secret;
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}&secret_token=${encodeURIComponent(secret)}`);
  Logger.log('✅ Kết quả setWebhook: ' + res.getContentText());
}

/**
 * Đọc/Ghi Token bảo mật Web UI
 */
function getConfigToken() {
  let token = PROP.getProperty('config_token');
  if (!token) {
    token = Utilities.getUuid();
    PROP.setProperty('config_token', token);
  }
  return token;
}

function getConfigUrl() {
  return ScriptApp.getService().getUrl() + '?config=' + getConfigToken();
}

function doGet(e) {
  if (!e || !e.parameter || e.parameter.config !== getConfigToken()) {
    return HtmlService.createHtmlOutput('<p style="font-family:Arial;padding:20px;color:#d93025;">❌ Không có quyền truy cập trang cấu hình.</p>');
  }
  const tpl = HtmlService.createTemplateFromFile('configui');
  tpl.token = getConfigToken();
  return tpl.evaluate().setTitle('⚙️ Cấu hình Sổ Thu Chi AI v2');
}

function maskApiKey(key) {
  const s = (key || '').toString().trim();
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return s.slice(0, 4) + '••••' + s.slice(-4);
}

function getConfigToUI(token) {
  if (token !== getConfigToken()) throw new Error('Token không hợp lệ');
  const props = PROP.getProperties();
  const rawKeys = props.ai_keys || '[]';
  const rawLabels = props.ai_key_labels || '[]';
  let keys = [];
  let labels = [];
  try { keys = JSON.parse(rawKeys); } catch (e) { keys = []; }
  try { labels = JSON.parse(rawLabels); } catch (e) { labels = []; }

  const maskedList = keys.map(function (k) {
    return maskApiKey(k);
  });

  return {
    model: props.ai_model || 'gemini-2.5-flash',
    keys: maskedList,
    key_labels: labels,
    owner_names: props.owner_names || '',
    prompt: props.ai_prompt || ''
  };
}

function saveConfigFromUI(form, token) {
  if (token !== getConfigToken()) throw new Error('Token không hợp lệ');
  const props = PROP;
  const oldRawKeys = props.getProperty('ai_keys') || '[]';
  let oldKeys = [];
  try { oldKeys = JSON.parse(oldRawKeys); } catch (e) { oldKeys = []; }

  if (form.model) props.setProperty('ai_model', String(form.model).trim());
  if (form.owner_names !== undefined) props.setProperty('owner_names', String(form.owner_names).trim());
  if (form.prompt !== undefined) props.setProperty('ai_prompt', String(form.prompt).trim());

  const keysArr = form.keys || [];
  const labelsArr = form.key_labels || [];
  const merged = [];
  const mergedLabels = [];

  for (let i = 0; i < keysArr.length; i++) {
    const v = (keysArr[i] || '').trim();
    const label = (labelsArr[i] || '').trim() || ('Key #' + (i + 1));
    if (!v) continue;
    if (v.indexOf('••••') !== -1) {
      if (oldKeys[i]) {
        merged.push(oldKeys[i]);
        mergedLabels.push(label);
      } else {
        const found = oldKeys.find(ok => ok && maskApiKey(ok) === v);
        if (found) {
          merged.push(String(found).trim());
          mergedLabels.push(label);
        }
      }
    } else {
      merged.push(v);
      mergedLabels.push(label);
    }
  }

  props.setProperty('ai_keys', JSON.stringify(merged));
  props.setProperty('ai_key_labels', JSON.stringify(mergedLabels));

  return '✅ Đã lưu cấu hình thành công!';
}

/**
 * Check live Meta từ configui.
 * Trả về STRING thuần (tránh lỗi serialize object → "Đã xảy ra lỗi không xác định").
 * Prefix: OK: | ERR:
 */
function checkMetaBillingFromUI(cfgToken, draft) {
  try {
    if (!META_BILLING_ENABLED) return 'ERR:' + metaBillingOffMsg_();
    if (cfgToken !== getConfigToken()) {
      return 'ERR:Token cấu hình không hợp lệ — đóng dialog, mở lại menu Cấu hình.';
    }
    draft = draft || {};

    let accessToken = String(draft.meta_access_token || '').trim();
    if (!accessToken || accessToken.indexOf('••••') !== -1) {
      accessToken = String(PROP.getProperty('META_ACCESS_TOKEN') || '').trim();
    } else {
      // Token mới gõ trên form: lưu tạm để không phải gửi lại token dài lần sau
      PROP.setProperty('META_ACCESS_TOKEN', accessToken);
    }

    const bidDraft = String(draft.meta_business_id || '').trim();
    if (bidDraft) PROP.setProperty('META_BUSINESS_ID', bidDraft);

    if (draft.meta_billing_lookback_days !== undefined && String(draft.meta_billing_lookback_days).trim() !== '') {
      const lb = Math.max(1, parseInt(draft.meta_billing_lookback_days, 10) || META_BILLING_LOOKBACK_DAYS_DEFAULT);
      PROP.setProperty('META_BILLING_LOOKBACK_DAYS', String(lb));
    }

    const accounts = getMetaAdAccountIds_();
    Logger.log('checkMetaBillingFromUI: tokenLen=' + (accessToken ? accessToken.length : 0)
      + ' accounts=' + accounts.join(','));

    if (!accessToken) {
      return 'ERR:Chua co Meta Access Token. Dan token roi bam Check (hoac Luu truoc).';
    }
    if (!accounts.length) {
      return 'ERR:Chua co Ad Account — them ID TK (act_… / so) vao cot A sheet Quet Mail.';
    }

    // 1) Ping nhẹ — xác nhận token + quyền account
    const ping = metaGraphGet_(accounts[0], { fields: 'id,name,account_id' }, accessToken);
    const accName = (ping && ping.name) ? String(ping.name) : accounts[0];
    Logger.log('checkMetaBillingFromUI: ping OK name=' + accName);

    // 2) Thử lấy billing theo lookback đã cấu hình (tối thiểu 30 ngày khi check)
    const lookback = Math.max(30, Math.min(90, getMetaBillingLookbackDays_()));
    let nCharges = 0;
    try {
      const charges = fetchMetaBillingChargesWithToken_(accounts, lookback, accessToken);
      nCharges = charges.length;
    } catch (billErr) {
      Logger.log('checkMetaBillingFromUI: billing warn: ' + (billErr && billErr.message));
      const hint = (!getMetaBusinessId_() && String(billErr.message).toLowerCase().indexOf('business') !== -1)
        ? ' | Thu set META_BUSINESS_ID'
        : '';
      return 'OK:Token+account hop le (' + accName + '). Billing: ' + String(billErr.message || billErr).slice(0, 160) + hint;
    }

    const msg = 'OK:Token+account hop le (' + accName + '). Billing charges: ' + nCharges
      + ' (lookback ' + lookback + 'd'
      + (getMetaBusinessId_() ? ', business_id=OK' : ', business_id=CHUA')
      + '). Neu 0: chay debugMetaBillingActivities.';
    Logger.log('checkMetaBillingFromUI: ' + msg);
    return msg;
  } catch (e) {
    const m = (e && e.message) ? e.message : String(e);
    Logger.log('checkMetaBillingFromUI ERROR: ' + m);
    return 'ERR:' + m.slice(0, 300);
  }
}
