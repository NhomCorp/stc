// ============================================================================
// ⚙️ 0_CONFIG.GS — HẰNG SỐ, TỌA ĐỘ CỘT & CẤU HÌNH HỆ THỐNG
// ============================================================================

const PROP = PropertiesService.getScriptProperties();

// 🆔 BẢN ĐỒ GID CỦA CÁC SHEET HỆ THỐNG CỐ ĐỊNH (Không sợ đổi tên tab)
const GID = {
  BAO_CAO: 1475474497,       // Sheet 'Bao Cao v2'
  TOM_TAT: 129580313,        // Sheet 'Tóm tắt_v2'
  ALIAS: 1498755942,         // Sheet 'Alias'
  AI_LEARNING: 203251644,    // Sheet 'AI_Learning'
  QUET_MAIL: 2033507127,     // Sheet 'Quet Mail'
  TEMPLATE_LOG: 192263148,   // Sheet 'Template_Log'
  TEMPLATE_REPORT: 56513848  // Sheet 'Template_Report'
};

// 📌 TÊN SHEET QUY ƯỚC ĐẶC BIỆT
const SHEET_NAMES = {
  MUC_LUC: 'Mục Lục',
  LOG_CHUYEN: 'Log_Chuyen',
  AI_LEARNING: 'AI_Learning',
  ADS_BILLING_SYNC: 'Ads_Billing_Sync'
};

// 🗺️ CỘT Ads_Billing_Sync (INDEX 0) — đối soát Meta ↔ Mail
const ADS_BILLING_COL = {
  META_TXN_ID: 0,
  AD_ACCOUNT: 1,
  NGAY: 2,
  SO_TIEN: 3,
  CURRENCY: 4,
  STATUS: 5,       // SEEN | MATCHED_MAIL | MISSING_MAIL | ALERTED
  MAIL_KEY: 6,
  UPDATED_AT: 7,
  GHI_CHU: 8,
  EVENT_TIME: 9
};
const ADS_BILLING_HEADERS = [
  'Meta Txn ID', 'Ad Account', 'Ngày', 'Số tiền', 'Currency',
  'Trạng thái', 'Mail Unique Key', 'Cập nhật', 'Ghi chú', 'Event Time'
];
const ADS_BILLING_STATUS = {
  SEEN: 'SEEN',
  MATCHED_MAIL: 'MATCHED_MAIL',
  MISSING_MAIL: 'MISSING_MAIL',
  ALERTED: 'ALERTED'
};
const META_GRAPH_API_VERSION = 'v26.0';
const META_BILLING_AMOUNT_TOLERANCE = 1; // ±đ khi khớp ngày+tiền
const META_BILLING_LOOKBACK_DAYS_DEFAULT = 60;
const META_BILLING_TRIGGER_HOURS = 6;

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
    prompt: props.ai_prompt || '',
    so_ngay_quet: props.so_ngay_quet || String(SO_NGAY_QUET_DEFAULT),
    quet_tu_ngay: props.quet_tu_ngay || '',
    quet_den_ngay: props.quet_den_ngay || '',
    meta_access_token: maskApiKey(props.META_ACCESS_TOKEN || ''),
    meta_ad_account_ids: props.META_AD_ACCOUNT_IDS || '',
    meta_business_id: props.META_BUSINESS_ID || '',
    meta_billing_lookback_days: props.META_BILLING_LOOKBACK_DAYS || String(META_BILLING_LOOKBACK_DAYS_DEFAULT)
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

  const soNgay = Math.max(1, parseInt(form.so_ngay_quet, 10) || SO_NGAY_QUET_DEFAULT);
  props.setProperty('so_ngay_quet', String(soNgay));
  props.setProperty('quet_tu_ngay', String(form.quet_tu_ngay || '').trim());
  props.setProperty('quet_den_ngay', String(form.quet_den_ngay || '').trim());

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

  // Meta Billing — token mask giống AI keys
  if (form.meta_ad_account_ids !== undefined) {
    props.setProperty('META_AD_ACCOUNT_IDS', String(form.meta_ad_account_ids || '').trim());
  }
  if (form.meta_business_id !== undefined) {
    const bid = String(form.meta_business_id || '').trim();
    if (bid) props.setProperty('META_BUSINESS_ID', bid);
    else props.deleteProperty('META_BUSINESS_ID');
  }
  if (form.meta_billing_lookback_days !== undefined) {
    const lb = Math.max(1, parseInt(form.meta_billing_lookback_days, 10) || META_BILLING_LOOKBACK_DAYS_DEFAULT);
    props.setProperty('META_BILLING_LOOKBACK_DAYS', String(lb));
  }
  if (form.meta_access_token !== undefined) {
    const metaTok = String(form.meta_access_token || '').trim();
    if (!metaTok) {
      props.deleteProperty('META_ACCESS_TOKEN');
    } else if (metaTok.indexOf('••••') === -1) {
      props.setProperty('META_ACCESS_TOKEN', metaTok);
    }
    // còn •••• → giữ token cũ
  }

  return '✅ Đã lưu cấu hình thành công!';
}

/**
 * Check live Meta từ configui.
 * Trả về STRING thuần (tránh lỗi serialize object → "Đã xảy ra lỗi không xác định").
 * Prefix: OK: | ERR:
 */
function checkMetaBillingFromUI(cfgToken, draft) {
  try {
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

    let accountsRaw = String(draft.meta_ad_account_ids || '').trim();
    if (!accountsRaw) {
      accountsRaw = String(PROP.getProperty('META_AD_ACCOUNT_IDS') || '').trim();
    } else {
      PROP.setProperty('META_AD_ACCOUNT_IDS', accountsRaw);
    }
    const bidDraft = String(draft.meta_business_id || '').trim();
    if (bidDraft) PROP.setProperty('META_BUSINESS_ID', bidDraft);

    const accounts = accountsRaw.split(/[,;\s]+/).map(function (s) {
      s = String(s || '').trim();
      if (!s) return '';
      return s.indexOf('act_') === 0 ? s : ('act_' + s.replace(/^act_/, ''));
    }).filter(Boolean);

    if (draft.meta_billing_lookback_days !== undefined && String(draft.meta_billing_lookback_days).trim() !== '') {
      const lb = Math.max(1, parseInt(draft.meta_billing_lookback_days, 10) || META_BILLING_LOOKBACK_DAYS_DEFAULT);
      PROP.setProperty('META_BILLING_LOOKBACK_DAYS', String(lb));
    }

    Logger.log('checkMetaBillingFromUI: tokenLen=' + (accessToken ? accessToken.length : 0)
      + ' accounts=' + accounts.join(','));

    if (!accessToken) {
      return 'ERR:Chua co Meta Access Token. Dan token roi bam Check (hoac Luu truoc).';
    }
    if (!accounts.length) {
      return 'ERR:Chua co Ad Account ID (vd: act_123456789).';
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
