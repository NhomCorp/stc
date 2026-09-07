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
  AI_LEARNING: 'AI_Learning'
};

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
 * Khởi tạo Spreadsheet ID và sinh Token bảo mật cấu hình Web.
 * Nhấp nút "Chạy" (Run) hàm này trên GAS Editor.
 */
function setupEnvironment() {
  const activeSs = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = activeSs ? activeSs.getId() : PROP.getProperty('spreadsheet_id');
  if (ssId) {
    PROP.setProperty('spreadsheet_id', ssId);
    Logger.log('✅ Đã lưu Spreadsheet ID: ' + ssId);
  }
  
  if (!PROP.getProperty('config_token')) {
    PROP.setProperty('config_token', Utilities.getUuid());
  }
  if (!PROP.getProperty('webhook_secret')) {
    PROP.setProperty('webhook_secret', Utilities.getUuid());
    Logger.log('🔐 Đã sinh webhook_secret mới — chạy runSetWebhook() để đăng ký lại.');
  }
  if (!PROP.getProperty('admin_id')) {
    Logger.log('⚠️ Chưa có admin_id — bot sẽ từ chối mọi tin/callback đến khi bạn set Script Property admin_id = chat ID Telegram.');
  }
  const configUrl = ScriptApp.getService().getUrl() + '?config=' + PROP.getProperty('config_token');
  Logger.log('🔑 Web App Config URL: ' + configUrl);
  Logger.log('🎉 Hoàn tất cấu hình môi trường!');
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
    quet_den_ngay: props.quet_den_ngay || ''
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
  return '✅ Đã lưu cấu hình thành công!';
}
