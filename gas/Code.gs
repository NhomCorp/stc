// ==========================================
// ⚙️ PHẦN 1: THIẾT LẬP HỆ THỐNG & TỌA ĐỘ
// ==========================================
const PROP = PropertiesService.getScriptProperties();
const SO_NGAY_QUET = 1;
/** Tab Alias trên Sheet (gid=1498755942), data từ dòng 2 */
const ALIAS_SHEET_GID = 1498755942;

const LOG_COL = {
  NGAY: 0,
  PHAN_LOAI: 1,
  SO_TIEN: 2,
  VI: 3,
  DOI_TUONG: 4,
  DANH_MUC_CHA: 5, // Sheet tự công thức — code KHÔNG ghi cột này
  DANH_MUC_CON: 6,
  GHI_CHU: 7,
  UNIQUE_KEY: 8,
  STATUS: 9
};

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('configui').setTitle('Cấu hình Sổ Thu Chi AI v2').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Che API key khi đưa lên UI: AIza••••xxxx */
function maskApiKey(key) {
  const s = String(key || '');
  if (s.length < 12) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

function isMaskedApiKey(value) {
  return String(value || '').indexOf('••••') !== -1;
}

function getStoredAiKeys() {
  const keysRaw = PropertiesService.getScriptProperties().getProperty('ai_keys');
  if (!keysRaw) return [];
  try {
    const parsed = JSON.parse(keysRaw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (parsed) return [String(parsed)];
  } catch (e) {
    if (String(keysRaw).startsWith('AIza')) return [String(keysRaw).trim()];
  }
  return [];
}

function getConfigToUI() {
  const props = PropertiesService.getScriptProperties();
  const keysArr = getStoredAiKeys().map(maskApiKey);
  return {
    model: props.getProperty('ai_model') || 'gemini-2.5-flash',
    prompt: props.getProperty('ai_prompt') || '',
    keys: keysArr
  };
}

function saveConfigFromUI(data) {
  const props = PropertiesService.getScriptProperties();
  const oldKeys = getStoredAiKeys();
  const incoming = Array.isArray(data.keys) ? data.keys : [];
  const resolved = [];

  incoming.forEach(function(raw) {
    const k = String(raw || '').trim();
    if (!k) return;
    if (isMaskedApiKey(k)) {
      const match = oldKeys.find(function(ok) { return maskApiKey(ok) === k; });
      if (match) resolved.push(match);
      // Ô mask không khớp key cũ → bỏ qua (không lưu chuỗi ••••)
    } else {
      resolved.push(k);
    }
  });

  props.setProperty('ai_model', data.model || '');
  // ai_prompt = prompt CÁ NHÂN only (hybrid/JSON nằm trong Code.gs)
  props.setProperty('ai_prompt', data.prompt || '');
  props.setProperty('ai_keys', JSON.stringify(resolved));
  return "Đã lưu cấu hình thành công!";
}

function showConfigDialog() {
  const html = HtmlService.createHtmlOutputFromFile('configui').setWidth(600).setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ Cấu hình Sổ Thu Chi AI v2');
}

/**
 * BẮT BUỘC: Script Property `webapp_url` = URL Deploy đuôi /exec
 * (Deploy → Manage deployments → copy Web app URL).
 * Không dùng ScriptApp.getService().getUrl() — dễ trả /dev → Telegram 401.
 */
function getWebAppExecUrl() {
  let base = PROP.getProperty('webapp_url');
  if (!base) {
    throw new Error(
      'Chưa có Property webapp_url. Vào Deploy → Manage deployments, copy URL kết thúc /exec, ' +
      'dán vào Script Properties tên webapp_url, rồi chạy lại setWebhook.'
    );
  }
  base = String(base).trim().split('?')[0].replace(/\/+$/, '');
  if (/\/dev$/i.test(base)) {
    throw new Error(
      'webapp_url đang là /dev (sai). Đổi thành URL /exec từ Manage deployments.'
    );
  }
  if (!/\/exec$/i.test(base)) {
    throw new Error('webapp_url phải kết thúc bằng /exec. Giá trị hiện tại: ' + base);
  }
  return base;
}

/**
 * Đăng ký webhook Telegram kèm secret (?wh=).
 * Chạy SAU khi đã lưu đúng webapp_url (/exec).
 */
function setWebhook() {
  const token = PROP.getProperty('bot_token');
  const secret = PROP.getProperty('webhook_secret');
  if (!token) throw new Error('Thiếu bot_token trong Script Properties');
  if (!secret) throw new Error('Thiếu webhook_secret trong Script Properties');

  const baseUrl = getWebAppExecUrl(); // fail sớm nếu thiếu / sai webapp_url
  const url = baseUrl + '?wh=' + encodeURIComponent(secret);

  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`, {
    muteHttpExceptions: true
  });

  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      url: url,
      secret_token: secret,
      drop_pending_updates: true
    }),
    muteHttpExceptions: true
  });
  Logger.log('setWebhook URL (phải là /exec?wh=...): ' + url);
  Logger.log(res.getContentText());
  return res.getContentText();
}

/** Xem URL webhook Telegram đang trỏ tới (phải có ?wh=...) */
function getWebhookInfo() {
  const token = PROP.getProperty('bot_token');
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    muteHttpExceptions: true
  });
  Logger.log(res.getContentText());
  return res.getContentText();
}

/** Verify webhook: so e.parameter.wh với webhook_secret */
function isValidWebhookRequest(e) {
  const secret = PROP.getProperty('webhook_secret');
  if (!secret) return false;
  const incoming = (e && e.parameter && e.parameter.wh) ? String(e.parameter.wh) : '';
  return incoming !== '' && incoming === secret;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💎 Sổ Thu Chi v2')
    .addItem('⚙️ Cấu hình AI & Bot', 'showConfigDialog')
    .addItem('📧 Quét Mail thủ công', 'triggerScanMailUI')
    .addToUi();
}

// ==========================================
// 📷 PHẦN 2: ONEDIT
// ==========================================
function onEdit(e) {
  if (!e) return;
  const range = e.range; const sheet = range.getSheet(); const ss = e.source;
  const logRange = ss.getRangeByName("Log");
  if (!logRange || sheet.getName() !== logRange.getSheet().getName()) return;

  const startRow = logRange.getRow(); const startCol = logRange.getColumn();
  const row = range.getRow(); const col = range.getColumn();
  if (row < startRow) return;

  if (col === startCol + LOG_COL.PHAN_LOAI) {
    const type = range.getValue().toString().trim().toLowerCase();
    const amountRange = sheet.getRange(row, startCol + LOG_COL.SO_TIEN);
    let amount = Math.abs(amountRange.getValue());
    if (amount > 0) amountRange.setValue(type === "chi" ? -amount : amount);
  }

  if (col === startCol + LOG_COL.SO_TIEN) {
    const type = sheet.getRange(row, startCol + LOG_COL.PHAN_LOAI).getValue().toString().trim().toLowerCase();
    let amount = Math.abs(range.getValue());
    if (amount > 0 && type === "chi") range.setValue(-amount);
  }
}

// ==========================================
// 🤖 PHẦN 3: TELEGRAM
// ==========================================
function doPost(e) {
  // Chặn request không có đúng webhook_secret (query ?wh=)
  if (!isValidWebhookRequest(e)) return;

  if (!e || !e.postData || !e.postData.contents) return;
  const contents = JSON.parse(e.postData.contents);

  const updateId = contents.update_id;
  if (updateId) {
    const lockKey = "LOCK_" + updateId;
    if (CacheService.getScriptCache().get(lockKey)) return;
    CacheService.getScriptCache().put(lockKey, "DONE", 300);
  }

  if (contents.callback_query) {
    const callbackQuery = contents.callback_query;
    const chatId = callbackQuery.message.chat.id.toString();
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    answerCallbackQuery(callbackQuery.id);

    if (data.startsWith("CONFIRM_")) {
      const uniqueKey = data.replace("CONFIRM_", "");
      const isFound = clearStatusInSheet(uniqueKey);
      const footer = isFound
        ? `✅ <b>Đã xác nhận</b>`
        : `❌ <b>Không tìm thấy GD</b> <code>${escapeHtml(uniqueKey)}</code>`;
      // Luôn dựng lại nội dung từ Sheet — không phụ thuộc text tin cũ
      editMessage(chatId, messageId, buildGdHtmlFromSheet(uniqueKey, footer), { inline_keyboard: [] });
      return;
    }

    if (data.startsWith("EDIT_")) {
      const uniqueKey = data.replace("EDIT_", "");
      const isFound = updateStatusInSheet(uniqueKey);
      const footer = isFound
        ? `🟡 <b>Đã đánh dấu CHECK</b> — mở Sheet sửa dòng vàng.`
        : `❌ <b>Không tìm thấy GD</b> <code>${escapeHtml(uniqueKey)}</code>`;
      editMessage(chatId, messageId, buildGdHtmlFromSheet(uniqueKey, footer), { inline_keyboard: [] });
      return;
    }

    if (data === "REPORT_MONTH") { sendMonthReport(chatId); return; }
    if (data === "REPORT_3MONTH") { send3MonthReport(chatId); return; }
  }

  if (!contents.message) return;
  const chatId = contents.message.chat.id.toString();
  if (chatId !== PROP.getProperty('admin_id')) return;

  let text = contents.message.text || contents.message.caption || "";

  if (text.startsWith('/')) {
    if (text === '/start') sendMessage(chatId, "🤖 Bot Sổ Thu Chi AI v2 sẵn sàng!");
    if (text === '/report') { sendTodayReport(chatId); return; }
    if (text === '/scan') {
      const loadId = sendMessage(chatId, "⏳ Đang dò quét hóa đơn từ Email...");
      scanMail(chatId);
      deleteMessage(chatId, loadId);
    }
    return;
  }

  let base64Image = null;
  let loadingMsgId = null;

  if (contents.message.photo) {
    loadingMsgId = sendMessage(chatId, "⏳ Đang tải ảnh và phân tích...");
    const photoArr = contents.message.photo;
    const imgRes = getTelegramImageBase64(photoArr[photoArr.length - 1].file_id);
    if (imgRes && imgRes.error) return editMessage(chatId, loadingMsgId, "❌ Lỗi tải ảnh: " + imgRes.error);
    base64Image = imgRes;
  } else if (text) {
    loadingMsgId = sendMessage(chatId, "⏳ Đang kết nối AI...");
  } else return;

  const liveData = getLiveData();
  let aiResult = callGeminiAPI(text, base64Image, liveData);

  // === FALLBACK: Nếu AI không phát hiện nhưng text có số tiền ===
  if (!aiResult || !aiResult.giao_dich || aiResult.giao_dich.length === 0) {
    const moneyRegex = /(\d{1,3}(?:[.,]\d{3})*)\s*(k|m|tr|triệu|nghìn|đ|VND|VNĐ)/i;
    const moneyMatch = text.match(moneyRegex);

    if (moneyMatch) {
      let amountStr = moneyMatch[1].replace(/[.,]/g, '');
      let amount = parseInt(amountStr, 10);
      const unit = moneyMatch[2].toLowerCase();

      if (unit === 'k' || unit === 'nghìn') amount *= 1000;
      else if (unit === 'm' || unit === 'tr' || unit.indexOf('triệu') !== -1) amount *= 1000000;

      aiResult = {
        giao_dich: [{
          ngay_gd: "Hôm nay",
          phan_loai: text.toLowerCase().includes("nhận") || text.toLowerCase().includes("thu") ? "Thu" : "Chi",
          so_tien: amount,
          vi: "Chưa phân loại",
          doi_tuong: "Chưa phân loại",
          danh_muc_con: "Chưa phân loại",
          ghi_chu: text.substring(0, 150)
        }]
      };
    }
  }
  deleteMessage(chatId, loadingMsgId);

  if (aiResult && !aiResult.error && aiResult.giao_dich && aiResult.giao_dich.length > 0) {
    const txId = "TX_" + new Date().getTime().toString().slice(-6);
    let batchData = [];

    aiResult.giao_dich.forEach((gd, index) => {
      batchData.push({ data: gd, uniqueKey: `${txId}_${index}` });
    });

    const saveRes = saveBatchToSheet(batchData);
    if (saveRes !== true) return sendMessage(chatId, `❌ <b>Lỗi ghi Sheet:</b> ${saveRes}`);

    // Mỗi GD một message + nút riêng (không gửi tin tóm tắt batch)
    aiResult.giao_dich.forEach((gd, index) => {
      sendTransactionCheckMessage(chatId, gd, `${txId}_${index}`, index + 1);
    });
  } else {
    sendMessage(chatId, "❌ AI không tìm thấy giao dịch: " + ((aiResult && aiResult.error) || ""));
  }
}

function isUncategorizedValue(val) {
  return !val || val === "Chưa phân loại" || val === "Khác";
}

function isUncategorizedGd(gd) {
  return isUncategorizedValue(gd.vi) ||
    isUncategorizedValue(gd.danh_muc_con) ||
    isUncategorizedValue(gd.doi_tuong);
}

/**
 * Mỗi GD một tin:
 * - Thiếu field (Chưa phân loại): đã auto CHECK → KHÔNG gắn nút (thừa)
 * - Map đủ: nút ✅ Đúng / ✏️ Sửa
 */
function sendTransactionCheckMessage(chatId, gd, uniqueKey, stt) {
  const mustFix = isUncategorizedGd(gd);
  const dau = (gd.phan_loai || "").toLowerCase() === "chi" ? "-" : "+";
  let text = mustFix
    ? `⚠️ <b>GD #${stt} — BẮT BUỘC SỬA TRÊN SHEET</b>\n`
    : `🔹 <b>GD #${stt} — kiểm tra</b>\n`;

  text += `${escapeHtml(gd.phan_loai || '')} ${dau}${formatMoney(gd.so_tien)}\n` +
    `├ Nguồn: ${escapeHtml(gd.vi || 'Chưa phân loại')}\n` +
    `├ Danh mục: ${escapeHtml(gd.danh_muc_con || 'Chưa phân loại')}\n` +
    `├ 👤: ${escapeHtml(gd.doi_tuong || 'Chưa phân loại')}\n` +
    `└ Mã: <code>${escapeHtml(uniqueKey)}</code>`;

  if (mustFix) {
    text += `\n\n👉 Đã đánh dấu <b>CHECK</b> — mở Sheet sửa dòng vàng.`;
  }

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };
  // Chỉ GD map đủ mới có nút
  if (!mustFix) {
    payload.reply_markup = {
      inline_keyboard: [[
        { text: "✅ Đúng", callback_data: `CONFIRM_${uniqueKey}` },
        { text: "✏️ Sửa", callback_data: `EDIT_${uniqueKey}` }
      ]]
    };
  }

  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ==========================================
// 🧠 AI GEMINI + ALIAS HYBRID
// ==========================================
function getShuffledKeys() {
  const keysRaw = PROP.getProperty('ai_keys');
  if (!keysRaw) return [];
  let keys = [];
  try {
    keys = JSON.parse(keysRaw);
    if (!Array.isArray(keys)) keys = [keys];
  } catch(e) {
    if (keysRaw.startsWith("AIza")) keys = [keysRaw.trim()];
    else return [];
  }
  if (keys.length === 0) return [];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

/**
 * Đọc tab Alias (gid cố định), từ dòng 2.
 * Cột: Keyword | Wallet | Categories | User
 * 3 cột sau Keyword có thể trống bất kỳ.
 */
function getAliasRules() {
  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const sheet = ss.getSheetById(ALIAS_SHEET_GID);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const numRows = lastRow - 1;
    const rows = sheet.getRange(2, 1, numRows, 4).getValues();

    return rows
      .filter(function(r) { return r[0] && String(r[0]).trim() !== ''; })
      .map(function(r) {
        return {
          keyword: String(r[0]).trim(),
          wallet: r[1] ? String(r[1]).trim() : '',
          category: r[2] ? String(r[2]).trim() : '',
          user: r[3] ? String(r[3]).trim() : ''
        };
      });
  } catch (e) {
    return [];
  }
}

function formatAliasForPrompt(aliasList) {
  if (!aliasList || aliasList.length === 0) return '(chưa có alias)';
  return aliasList.map(function(a) {
    var parts = ['Keyword: ' + a.keyword];
    if (a.wallet) parts.push('Wallet=' + a.wallet);
    if (a.category) parts.push('Categories=' + a.category);
    if (a.user) parts.push('User=' + a.user);
    return '- ' + parts.join(' | ');
  }).join('\n');
}

function callGeminiAPI(text, base64Image, liveData) {
  const keys = getShuffledKeys();
  if (keys.length === 0) return { error: "Chưa cấu hình API Key hoặc Key bị sai định dạng." };

  const model = PROP.getProperty('ai_model') || 'gemini-2.5-flash';
  // Lớp 1: prompt CÁ NHÂN từ Config UI (thói quen nhà). Lớp 2: hybrid/JSON cố định bên dưới.
  const personalPrompt = PROP.getProperty('ai_prompt') || 'Bạn là trợ lý bóc tách thu chi.';

  const aliasText = formatAliasForPrompt(liveData.alias);

  const dynamicPrompt = `PROMPT CÁ NHÂN (thói quen người dùng):
${personalPrompt}

NỘI DUNG NGƯỜI DÙNG GỬI: "${text}"

DANH SÁCH HỢP LỆ (chỉ dùng đúng tên trong list, hoặc "Chưa phân loại"):
- Ví / Wallet: [${(liveData.wallets || []).join(', ')}]
- Đối tượng / User: [${(liveData.users || []).join(', ')}]
- Danh mục con / Categories: [${(liveData.categories || []).join(', ')}]

BẢNG ALIAS (gợi ý mặc định theo Keyword; Wallet/Categories/User có thể trống):
${aliasText}

LUẬT HYBRID (BẮT BUỘC, LÀM THEO THỨ TỰ):
1. TÌM SỐ TIỀN TRƯỚC — số kèm k/m/tr/triệu/nghìn/đ/VND/VNĐ đều là giao dịch.
2. XÁC ĐỊNH NGÀY — có ngày rõ thì dùng; không có thì "Hôm nay".
3. MATCH ALIAS — nếu Keyword xuất hiện trong text/ảnh, lấy các field Alias ĐANG CÓ GIÁ TRỊ làm default. Cột Alias trống = không ép field đó.
4. AI ĐỌC NGỮ CẢNH — tín hiệu rõ trong câu/ảnh được ưu tiên HƠN Alias (ví dụ Alias không có Wallet hoặc default Tiền mặt, nhưng user ghi "bank"/"momo" → dùng ví tương ứng trong list hợp lệ).
5. ƯU TIÊN FIELD: tín hiệu trong câu/ảnh > Alias > "Chưa phân loại". Không bịa tên ngoài list.
6. phan_loai chỉ "Thu" hoặc "Chi".
7. Trả đúng JSON, không thêm chữ thừa:

{
  "giao_dich": [
    {
      "ngay_gd": "dd/MM/yyyy hoặc Hôm nay",
      "phan_loai": "Thu hoặc Chi",
      "so_tien": 500000,
      "vi": "...",
      "doi_tuong": "...",
      "danh_muc_con": "...",
      "ghi_chu": "..."
    }
  ]
}`;

  let parts = [];
  if (base64Image) parts.push({ "inlineData": { "mimeType": "image/jpeg", "data": base64Image } });
  parts.push({ "text": dynamicPrompt });

  const payload = {
    "contents": [{ "parts": parts }],
    "generationConfig": { "responseMimeType": "application/json" },
    "safetySettings": [
      { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
    ]
  };

  let lastError = "";

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      const response = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
      });
      const data = JSON.parse(response.getContentText());

      if (data.error) { lastError = data.error.message; continue; }
      if (!data.candidates || data.candidates.length === 0) { lastError = "AI từ chối trả lời."; continue; }

      let rawText = data.candidates[0].content.parts[0].text;
      let jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!jsonMatch) { lastError = "Không bóc tách được JSON."; continue; }

      let parsedData = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsedData)) return { giao_dich: parsedData };
      return parsedData;

    } catch (e) {
      lastError = e.message;
      continue;
    }
  }
  return { error: `Đã thử ${keys.length} key nhưng thất bại. ${lastError || ''}` };
}

// ==========================================
// 📧 QUÉT MAIL
// ==========================================
function triggerScanMailUI() {
  const ui = SpreadsheetApp.getUi();
  const result = scanMail(null);
  ui.alert("KẾT QUẢ QUÉT MAIL", result, ui.ButtonSet.OK);
}

function scanMail(chatId) {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const logRange = ss.getRangeByName("Log");
  if (!logRange) return returnMsg(chatId, "❌ Lỗi: Không tìm thấy vùng 'Log'");

  const existingIds = logRange.getSheet()
    .getRange(logRange.getRow(), logRange.getColumn() + LOG_COL.UNIQUE_KEY, logRange.getNumRows(), 1)
    .getValues().flat().filter(String);

  const ruleSheet = ss.getSheetByName("Quet Mail");
  if (!ruleSheet) return returnMsg(chatId, "❌ Lỗi: Không tìm thấy Tab 'Quet Mail'");
  const lastRuleRow = ruleSheet.getLastRow();
  if (lastRuleRow < 2) return returnMsg(chatId, "✅ Không có rule quét mail.");
  const rules = ruleSheet.getRange(2, 1, lastRuleRow - 1, 5).getValues().filter(row => row[0]);

  let count = 0;
  let logMsgs = [];
  let batchData = [];

  for (let rule of rules) {
    const keyword = rule[0]; const note = rule[1]; const wallet = rule[2];
    const user = rule[3]; const subCat = rule[4];

    const query = `newer_than:${SO_NGAY_QUET}d "${keyword}"`;
    const threads = GmailApp.search(query);

    for (let thread of threads) {
      const messages = thread.getMessages();
      for (let msg of messages) {
        const body = msg.getPlainBody();
        const dateObj = msg.getDate();

        const amountMatch = body.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(VND|VNĐ|đ|₫)/i);
        if (!amountMatch) continue;
        const amount = parseInt(amountMatch[1].replace(/[.,]/g, ''), 10);

        const refMatch = body.match(/(?:ID giao dịch|Mã giao dịch|Mã số tham chiếu|Số tham chiếu|Tham chiếu|Reference|ID|FT)[\s:.\n]*([A-Za-z0-9-]+)/i);
        const uniqueKey = refMatch ? refMatch[1] : `${Utilities.formatDate(dateObj, "GMT+7", "yyyyMMdd")}_${wallet}_${amount}`;

        if (existingIds.includes(uniqueKey)) continue;

        let finalNote = note;
        const paymentMatch = body.match(/Phương thức thanh toán[\s\n:]*([^\n\r]+)/i);
        if (paymentMatch) {
          let rawPayment = paymentMatch[1].trim();
          rawPayment = rawPayment.replace(/\s*(Số tham chiếu|Mã tham chiếu|Tham chiếu|ID giao dịch|Mã giao dịch|Reference).*$/i, '').trim();
          finalNote = rawPayment;
        }

        const gd = { phan_loai: "Chi", so_tien: amount, vi: wallet, doi_tuong: user, danh_muc_con: subCat, ghi_chu: finalNote };
        batchData.push({ data: gd, uniqueKey: uniqueKey, dateObj: dateObj });

        existingIds.push(uniqueKey);
        count++;
        logMsgs.push(`▪️ ${formatMoney(amount)} (${wallet}) - ${finalNote}`);
      }
    }
  }

  if (batchData.length > 0) {
    const saveRes = saveBatchToSheet(batchData);
    if (saveRes !== true) return returnMsg(chatId, `❌ <b>Lỗi khi ghi dữ liệu lô:</b> ${saveRes}`);
  }

  const finalStr = (count > 0 || logMsgs.length > 0)
    ? `✅ <b>QUÉT XONG! Thêm ${count} GD từ Mail:</b>\n${logMsgs.join("\n")}`
    : `✅ <b>QUÉT XONG!</b> Không có hóa đơn mới nào khớp Keyword.`;
  return returnMsg(chatId, finalStr);
}

// ==========================================
// 💾 SAVE BATCH - GIỮ FILTER + GIỮ DROPDOWN
// ==========================================
function saveBatchToSheet(batchData) {
  if (!batchData || batchData.length === 0) return true;

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return "Hệ thống bận, thử lại sau 15s."; }

  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const logRange = ss.getRangeByName("Log");
    if (!logRange) return "Không tìm thấy Named Range 'Log'";

    const sheet = logRange.getSheet();
    const startCol = logRange.getColumn();
    const startRow = logRange.getRow();
    const numRowsInRange = logRange.getNumRows();
    const lastRowOfLog = startRow + numRowsInRange - 1;

    const requiredCols = startCol + 9;
    if (sheet.getMaxColumns() < requiredCols) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredCols - sheet.getMaxColumns());
    }

    let part1_Array = [];
    let part2_Array = [];

    for (let i = 0; i < batchData.length; i++) {
      let item = batchData[i];
      let data = item.data;
      let dateObj = item.dateObj || new Date();
      if (data.ngay_gd && data.ngay_gd.toLowerCase() !== "hôm nay") {
        const parts = data.ngay_gd.split('/');
        if (parts.length >= 2) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parts.length === 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
          dateObj = new Date(y, m, d);
        }
      }
      const dateStr = Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");
      let phanLoai = (data.phan_loai || "Chi").toString().trim().toLowerCase();
      if (phanLoai.includes("nhận") || phanLoai.includes("cộng") || phanLoai.includes("thu")) {
        phanLoai = "Thu";
      } else {
        phanLoai = "Chi";
      }

      let rawAmount = parseFloat(data.so_tien);
      let finalAmount = isNaN(rawAmount) ? 0 : Math.abs(rawAmount);
      if (phanLoai === "Chi" && finalAmount > 0) finalAmount = -finalAmount;

      let status = "";
      if (isUncategorizedValue(data.vi) || isUncategorizedValue(data.danh_muc_con) ||
          isUncategorizedValue(data.doi_tuong) || finalAmount === 0) {
        status = "CHECK";
      }

      // part1: Ngày..Đối tượng | part2 từ danh mục CON — nhảy qua DANH_MUC_CHA (cột công thức)
      part1_Array.push([ dateStr, phanLoai, finalAmount, data.vi || "Chưa phân loại", data.doi_tuong || "Chưa phân loại" ]);
      part2_Array.push([ data.danh_muc_con || "Chưa phân loại", data.ghi_chu || "", item.uniqueKey, status ]);
    }

    const numNewRows = batchData.length;
    sheet.insertRowsBefore(lastRowOfLog, numNewRows);
    const targetRow = lastRowOfLog;

    const sourceRow = targetRow + numNewRows;
    const formatSource = sheet.getRange(sourceRow, startCol, 1, 10);
    const formatTarget = sheet.getRange(targetRow, startCol, numNewRows, 10);
    formatSource.copyTo(formatTarget, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    const dvSource = sheet.getRange(sourceRow, startCol, 1, 10);
    const dvTarget = sheet.getRange(targetRow, startCol, numNewRows, 10);
    dvSource.copyTo(dvTarget, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);

    sheet.getRange(targetRow, startCol, part1_Array.length, 5).setValues(part1_Array);
    sheet.getRange(targetRow, startCol + 6, part2_Array.length, 4).setValues(part2_Array);

    SpreadsheetApp.flush();
    return true;

  } catch (e) {
    return "Lỗi: " + e.message;
  } finally {
    lock.releaseLock();
  }
}

function findLogRowsByUniqueKey(uniqueKey) {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const logRange = ss.getRangeByName("Log");
  if (!logRange) return null;

  const sheet = logRange.getSheet();
  const startRow = logRange.getRow();
  const startCol = logRange.getColumn();
  const idData = sheet.getRange(startRow, startCol + LOG_COL.UNIQUE_KEY, logRange.getNumRows(), 1).getValues();
  const rows = [];
  const key = String(uniqueKey || '');

  for (let i = 0; i < idData.length; i++) {
    const cell = idData[i][0] ? idData[i][0].toString() : '';
    if (!cell) continue;
    // Ưu tiên khớp đúng uniqueKey (TX_xxx_0); fallback includes cho tương thích
    if (cell === key || cell.indexOf(key) !== -1) {
      rows.push(startRow + i);
    }
  }
  return { sheet: sheet, startCol: startCol, rows: rows };
}

/** Đánh CHECK — bắt buộc sửa trên Sheet */
function updateStatusInSheet(uniqueKey) {
  try {
    const found = findLogRowsByUniqueKey(uniqueKey);
    if (!found || found.rows.length === 0) return false;
    found.rows.forEach(function(row) {
      found.sheet.getRange(row, found.startCol + LOG_COL.STATUS).setValue("CHECK");
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** Xác nhận Đúng — xóa status CHECK */
function clearStatusInSheet(uniqueKey) {
  try {
    const found = findLogRowsByUniqueKey(uniqueKey);
    if (!found || found.rows.length === 0) return false;
    found.rows.forEach(function(row) {
      found.sheet.getRange(row, found.startCol + LOG_COL.STATUS).setValue("");
    });
    return true;
  } catch (e) {
    return false;
  }
}

function getLiveData() {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  try {
    const wallets = ss.getRangeByName("Wallet").getValues().map(row => row[0]).filter(String);
    const users = ss.getRangeByName("userr").getValues().map(row => row[0]).filter(String);
    const categories = ss.getRangeByName("Category").getValues().map(row => row[1]).filter(String);
    // Alias thay history Log — tránh bị mail scan làm bẩn thói quen
    const alias = getAliasRules();

    return { wallets: wallets, categories: categories, users: users, alias: alias };
  } catch (e) {
    return { wallets: [], categories: [], users: [], alias: [] };
  }
}

// ==========================================
// 🛠️ TIỆN ÍCH & BÁO CÁO
// ==========================================
function returnMsg(chatId, text) {
  if (chatId) { sendMessage(chatId, text); return text; }
  return text;
}

function sendMessage(chatId, text) {
  const token = PROP.getProperty('bot_token');
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" }), muteHttpExceptions: true
  });
  const json = JSON.parse(res.getContentText());
  return json.result ? json.result.message_id : null;
}

function deleteMessage(chatId, messageId) {
  if (!messageId) return;
  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, message_id: messageId }), muteHttpExceptions: true
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function answerCallbackQuery(callbackQueryId) {
  if (!callbackQueryId) return;
  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackQueryId }),
    muteHttpExceptions: true
  });
}

/** Dựng HTML GD từ Sheet + footer trạng thái (tránh ghi đè mất chi tiết) */
function buildGdHtmlFromSheet(uniqueKey, footerHtml) {
  try {
    const found = findLogRowsByUniqueKey(uniqueKey);
    if (!found || found.rows.length === 0) {
      return `❌ Không đọc được GD <code>${escapeHtml(uniqueKey)}</code>\n\n${footerHtml}`;
    }
    const row = found.rows[0];
    const vals = found.sheet.getRange(row, found.startCol, 1, 10).getValues()[0];
    const phanLoai = vals[LOG_COL.PHAN_LOAI] || '';
    const soTien = vals[LOG_COL.SO_TIEN];
    const vi = vals[LOG_COL.VI] || 'Chưa phân loại';
    const doiTuong = vals[LOG_COL.DOI_TUONG] || 'Chưa phân loại';
    const dm = vals[LOG_COL.DANH_MUC_CON] || 'Chưa phân loại';
    const amountNum = Math.abs(parseFloat(soTien) || 0);
    const dau = String(phanLoai).toLowerCase() === 'chi' || (parseFloat(soTien) || 0) < 0 ? '-' : '+';

    return (
      `<b>GD</b> ${escapeHtml(phanLoai)} ${dau}${formatMoney(amountNum)}\n` +
      `├ Nguồn: ${escapeHtml(vi)}\n` +
      `├ Danh mục: ${escapeHtml(dm)}\n` +
      `├ 👤: ${escapeHtml(doiTuong)}\n` +
      `└ Mã: <code>${escapeHtml(uniqueKey)}</code>\n\n` +
      footerHtml
    );
  } catch (e) {
    return `❌ Lỗi đọc Sheet: ${escapeHtml(e.message)}\n\n${footerHtml}`;
  }
}

function editMessage(chatId, messageId, text, replyMarkup = null) {
  const token = PROP.getProperty('bot_token');
  const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function formatMoney(amount) {
  if (!amount) return "0 đ";
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " đ";
}

function getTelegramImageBase64(fileId) {
  try {
    const token = PROP.getProperty('bot_token');
    const fileRes = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`, {muteHttpExceptions: true});
    const fileData = JSON.parse(fileRes.getContentText());
    if (!fileData.ok) return { error: fileData.description || "Lỗi getFile." };

    const filePath = fileData.result.file_path;
    const imageRes = UrlFetchApp.fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {muteHttpExceptions: true});
    return Utilities.base64Encode(imageRes.getBlob().getBytes());
  } catch (e) { return { error: e.message }; }
}

function sendTodayReport(chatId) {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const sheet = ss.getSheetByName("Bao Cao");
  const thu = sheet.getRange("B2").getValue() || 0;
  const chi = sheet.getRange("C2").getValue() || 0;
  const loiNhuan = sheet.getRange("D2").getValue() || 0;
  const chuaGhiNhan = sheet.getRange("E2").getValue() || 0;
  const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  let text = `📅 <b>Báo cáo hôm nay - ${now}</b>\n\n` +
             `💰 Tổng Thu: <b>${formatMoney(thu)}</b>\n` +
             `🔴 Tổng Chi: <b>${formatMoney(chi)}</b>\n` +
             `💵 Lợi nhuận: <b>${formatMoney(loiNhuan)}</b>`;

  if (chuaGhiNhan !== 0) text += `\nLợi nhuận chưa ghi nhận: <b>${formatMoney(chuaGhiNhan)}</b>`;

  const keyboard = { inline_keyboard: [[ { text: "📆 Tháng này", callback_data: "REPORT_MONTH" }, { text: "📅 3 tháng", callback_data: "REPORT_3MONTH" } ]] };

  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML", reply_markup: keyboard }), muteHttpExceptions: true
  });
}

function sendMonthReport(chatId) {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const sheet = ss.getSheetByName("Bao Cao");
  const thu = sheet.getRange("B3").getValue() || 0;
  const chi = sheet.getRange("C3").getValue() || 0;
  const loiNhuan = sheet.getRange("D3").getValue() || 0;
  const chuaGhiNhan = sheet.getRange("E3").getValue() || 0;
  const thang = sheet.getRange("A3").getValue();

  let text = `📆 <b>Báo cáo ${thang}</b>\n\n` +
             `💰 Tổng Thu: <b>${formatMoney(thu)}</b>\n` +
             `🔴 Tổng Chi: <b>${formatMoney(chi)}</b>\n` +
             `💵 Lợi nhuận: <b>${formatMoney(loiNhuan)}</b>`;

  if (chuaGhiNhan !== 0) text += `\nLợi nhuận chưa ghi nhận: <b>${formatMoney(chuaGhiNhan)}</b>`;
  sendMessage(chatId, text);
}

function send3MonthReport(chatId) {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const sheet = ss.getSheetByName("Bao Cao");
  let text = `📅 <b>Lợi nhuận 3 tháng gần nhất</b>\n\n`;
  let tong = 0;
  for (let row = 3; row <= 5; row++) {
    const thang = sheet.getRange("A" + row).getValue();
    const loiNhuan = sheet.getRange("D" + row).getValue() || 0;
    const chua = sheet.getRange("E" + row).getValue() || 0;
    text += `${thang}: <b>${formatMoney(loiNhuan)}</b>`;
    if (chua !== 0) text += ` (${formatMoney(chua)} chưa ghi nhận)`;
    text += `\n`;
    tong += loiNhuan;
  }
  text += `─────────────────\nTổng 3 tháng: <b>${formatMoney(tong)}</b>`;
  sendMessage(chatId, text);
}

function sendDailyReport() {
  const adminId = PROP.getProperty('admin_id');
  if (!adminId) {
    console.log("Chưa có admin_id");
    return;
  }
  sendTodayReport(adminId);
}
