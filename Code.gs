// ==========================================
// ⚙️ PHẦN 1: THIẾT LẬP HỆ THỐNG & TỌA ĐỘ
// ==========================================
const PROP = PropertiesService.getScriptProperties();
// Default số ngày quét mail nếu chưa cấu hình trong Properties
const SO_NGAY_QUET_DEFAULT = 1;

// BẢN ĐỒ TỌA ĐỘ CỘT CỦA VÙNG "Log" (Chỉ số Index tính từ 0)
const LOG_COL = {
  NGAY: 0,
  PHAN_LOAI: 1,      // Thu/Chi
  SO_TIEN: 2,
  VI: 3,
  DOI_TUONG: 4,
  DANH_MUC_CHA: 5,   // Cột ArrayFormula (Nhảy cóc qua cột này)
  DANH_MUC_CON: 6,
  GHI_CHU: 7,
  UNIQUE_KEY: 8,     // Tracking ID
  STATUS: 9          // Trạng thái CHECK
};

const AI_LEARNING_SHEET = 'AI_Learning';
const ALIAS_SHEET_GID = 1498755942;
const BAO_CAO_SHEET = 'Bao Cao v2';
const DRAFT_TTL = 600;      // 10 phút — draft / await text (chưa ghi)
const UNDO_TTL = 86400;     // 24h — hoàn tác / sửa sau khi ghi (+ gỡ nút Telegram)
const EDIT_SESS_TTL = 1800; // 30 phút — phiên sửa Telegram
const OPTS_PAGE_SIZE = 6;   // phân trang gợi ý ví/DM/ĐT
const AI_MAIL_MAX_CALLS = 15; // quét mail: tối đa N lần gọi Gemini fallback / lần quét

// Token bảo vệ trang cấu hình: chỉ ai có link kèm ?config=<token> mới mở/lưu được
function getConfigToken() {
  let token = PROP.getProperty('config_token');
  if (!token) {
    token = Utilities.getUuid();
    PROP.setProperty('config_token', token);
  }
  return token;
}

function getConfigUrl() {
  return ScriptApp.getService().getUrl() + "?config=" + getConfigToken();
}

function doGet(e) {
  // Không có token hợp lệ → từ chối (bỏ ALLOWALL để chống iframe)
  if (!e || !e.parameter || e.parameter.config !== getConfigToken()) {
    return HtmlService.createHtmlOutput('<p>Không có quyền truy cập.</p>');
  }
  const tpl = HtmlService.createTemplateFromFile('configui');
  tpl.token = getConfigToken();
  return tpl.evaluate().setTitle('Cấu hình Sổ Thu Chi AI v2');
}

function maskApiKey(key) {
  const s = (key || '').toString().trim();
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return s.slice(0, 4) + '••••' + s.slice(-4);
}

function getConfigToUI(token) {
  // Chỉ trả cấu hình khi token hợp lệ (trang cấu hình mở qua link ?config=…)
  if (token !== getConfigToken()) throw new Error('Không có quyền truy cập cấu hình.');
  let props = PropertiesService.getScriptProperties();
  let keysRaw = props.getProperty('ai_keys');
  let keysArr = [];
  if (keysRaw) {
    try {
      keysArr = JSON.parse(keysRaw);
      if (!Array.isArray(keysArr)) keysArr = [keysArr];
    } catch (e) {
      if (keysRaw.startsWith('AIza')) keysArr = [keysRaw.trim()];
    }
  }
  // Chỉ trả bản che — không lộ raw key ra UI
  const maskedKeys = keysArr
    .filter(function (k) { return k && String(k).trim() !== ''; })
    .map(function (k) { return maskApiKey(k); });
  // Labels: lưu riêng, trả về song song với keys (theo index)
  let keyLabels = [];
  const labelsRaw = props.getProperty('ai_key_labels');
  if (labelsRaw) {
    try {
      const parsed = JSON.parse(labelsRaw);
      if (Array.isArray(parsed)) keyLabels = parsed.map(function (v) { return String(v || '').trim(); });
    } catch (e) {
      keyLabels = [];
    }
  }
  let ownerNames = [];
  const ownerRaw = props.getProperty('owner_names');
  if (ownerRaw) {
    try {
      const parsed = JSON.parse(ownerRaw);
      if (Array.isArray(parsed)) ownerNames = parsed.map(function (n) { return String(n).trim(); }).filter(Boolean);
    } catch (e) {
      ownerNames = String(ownerRaw).split(/[\n,]+/).map(function (n) { return n.trim(); }).filter(Boolean);
    }
  }
  return {
    model: props.getProperty('ai_model') || 'gemini-2.5-flash',
    prompt: props.getProperty('ai_prompt') || '',
    owner_names: ownerNames.join('\n'),
    keys: maskedKeys,
    key_labels: keyLabels,
    so_ngay_quet: getSoNgayQuetFromProps(props),
    quet_tu_ngay: props.getProperty('quet_tu_ngay') || '',
    quet_den_ngay: props.getProperty('quet_den_ngay') || ''
  };
}

function getSoNgayQuetFromProps(props) {
  const n = parseInt((props || PROP).getProperty('so_ngay_quet'), 10);
  return (!isNaN(n) && n > 0) ? n : SO_NGAY_QUET_DEFAULT;
}

function getSoNgayQuet() {
  return getSoNgayQuetFromProps(PROP);
}

/** Gmail: newer_than Nd, hoặc after/before (before +1 ngày vì Gmail không gồm ngày cuối). */
function buildGmailDateFilter() {
  const from = (PROP.getProperty('quet_tu_ngay') || '').trim();
  const to = (PROP.getProperty('quet_den_ngay') || '').trim();
  if (from && to) {
    const afterStr = from.replace(/-/g, '/');
    const toParts = to.replace(/\//g, '-').split('-');
    const toDate = new Date(Number(toParts[0]), Number(toParts[1]) - 1, Number(toParts[2]));
    toDate.setDate(toDate.getDate() + 1);
    const beforeStr = Utilities.formatDate(toDate, Session.getScriptTimeZone() || 'GMT+7', 'yyyy/MM/dd');
    const toLabel = to.replace(/-/g, '/');
    return {
      queryPart: `after:${afterStr} before:${beforeStr}`,
      label: `${afterStr} → ${toLabel}`
    };
  }
  const n = getSoNgayQuet();
  return { queryPart: `newer_than:${n}d`, label: `${n} ngày qua` };
}

function normalizeDateInput(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return '';
  // YYYY-MM-DD hoặc YYYY/MM/DD
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (!m) return '';
  const y = m[1];
  const mo = ('0' + m[2]).slice(-2);
  const d = ('0' + m[3]).slice(-2);
  return y + '-' + mo + '-' + d;
}

function parseOwnerNamesInput(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(function (n) { return String(n).trim(); }).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(function (n) { return String(n).trim(); }).filter(Boolean);
  } catch (e) { /* text: xuống dòng / phẩy */ }
  return s.split(/[\n,]+/).map(function (n) { return n.trim(); }).filter(Boolean);
}

function saveConfigFromUI(data, token) {
  // Kiểm tra quyền: token phải khớp (trang cấu hình mở qua link ?config=…)
  if (token !== getConfigToken()) throw new Error('Không có quyền truy cập cấu hình.');
  let props = PropertiesService.getScriptProperties();
  props.setProperty('ai_model', data.model || '');
  props.setProperty('ai_prompt', data.prompt || '');
  props.setProperty('owner_names', JSON.stringify(parseOwnerNamesInput(data.owner_names)));

  let soNgay = parseInt(data.so_ngay_quet, 10);
  if (isNaN(soNgay) || soNgay < 1) soNgay = SO_NGAY_QUET_DEFAULT;
  props.setProperty('so_ngay_quet', String(soNgay));

  const tu = normalizeDateInput(data.quet_tu_ngay);
  const den = normalizeDateInput(data.quet_den_ngay);
  if (tu && den) {
    props.setProperty('quet_tu_ngay', tu);
    props.setProperty('quet_den_ngay', den);
  } else {
    props.deleteProperty('quet_tu_ngay');
    props.deleteProperty('quet_den_ngay');
  }

  // Merge: ô còn •••• giữ key cũ cùng index; key mới đầy đủ thì ghi đè
  let oldKeys = [];
  const keysRaw = props.getProperty('ai_keys');
  if (keysRaw) {
    try {
      oldKeys = JSON.parse(keysRaw);
      if (!Array.isArray(oldKeys)) oldKeys = [oldKeys];
    } catch (e) {
      if (keysRaw.startsWith('AIza')) oldKeys = [keysRaw.trim()];
    }
  }

  const incoming = Array.isArray(data.keys) ? data.keys : [];
  const incomingLabels = Array.isArray(data.key_labels) ? data.key_labels : [];
  const merged = [];
  const mergedLabels = [];
  for (let i = 0; i < incoming.length; i++) {
    const v = (incoming[i] || '').toString().trim();
    if (!v) continue;
    const label = (incomingLabels[i] || '').toString().trim();
    if (v.indexOf('••••') !== -1) {
      // Giữ key cũ cùng vị trí nếu còn; nếu không khớp mask thì bỏ qua ô này
      if (i < oldKeys.length && oldKeys[i] && maskApiKey(oldKeys[i]) === v) {
        merged.push(String(oldKeys[i]).trim());
        mergedLabels.push(label);
      } else {
        // Fallback: tìm old key có cùng mask (khi user xóa/đổi thứ tự hàng)
        const found = oldKeys.find(function (ok) { return ok && maskApiKey(ok) === v; });
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
  let msg = "Đã lưu cấu hình thành công!";
  if (soNgay > 7) msg += " (Cảnh báo: số ngày quét > 7 — có thể chậm / hết quota.)";
  if (tu && den) {
    const a = new Date(tu);
    const b = new Date(den);
    const span = Math.round((b - a) / 86400000) + 1;
    if (span > 30) msg += " (Cảnh báo: khoảng ngày > 30 — dễ vượt quota Gmail.)";
  }
  return msg;
}

function showConfigDialog() {
  const tpl = HtmlService.createTemplateFromFile('configui');
  tpl.token = getConfigToken();
  SpreadsheetApp.getUi().showModalDialog(tpl.evaluate().setWidth(600).setHeight(820), '⚙️ Cấu hình Sổ Thu Chi AI v2');
}

function setWebhook() {
  const token = PROP.getProperty('bot_token');
  // Secret chống spam: Telegram gửi kèm secret trong URL query (GAS không đọc được header)
  let secret = PROP.getProperty('webhook_secret');
  if (!secret) {
    secret = Utilities.getUuid();
    PROP.setProperty('webhook_secret', secret);
  }
  const url = ScriptApp.getService().getUrl() + "?secret=" + secret;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}&secret_token=${encodeURIComponent(secret)}`);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💎 Sổ Thu Chi v2')
    .addItem('⚙️ Cấu hình AI & Bot', 'showConfigDialog')
    .addItem('📧 Quét Mail thủ công', 'triggerScanMailUI')
    .addItem('📊 Báo cáo', 'rebuildBaoCao')
    .addToUi();
}

// ==========================================
// 📷 PHẦN 2: CAMERA GIÁM SÁT SỬA TAY TRÊN SHEET
// ==========================================
function onEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  const ss = e.source;
  const logRange = ss.getRangeByName("Log");
  if (!logRange || sheet.getName() !== logRange.getSheet().getName()) return;

  const logStartRow = logRange.getRow();
  const logEndRow = logRange.getLastRow();
  const startCol = logRange.getColumn();
  const colPhanLoai = startCol + LOG_COL.PHAN_LOAI;
  const colSoTien = startCol + LOG_COL.SO_TIEN;

  const editStartCol = range.getColumn();
  const editEndCol = editStartCol + range.getNumColumns() - 1;
  // Chỉ xử lý khi vùng sửa giao cột Phân loại hoặc Số tiền
  if (editEndCol < colPhanLoai || editStartCol > colSoTien) return;

  const r0 = Math.max(range.getRow(), logStartRow);
  const r1 = Math.min(range.getRow() + range.getNumRows() - 1, logEndRow);
  if (r0 > r1) return;

  const n = r1 - r0 + 1;
  const types = sheet.getRange(r0, colPhanLoai, n, 1).getValues();
  const amounts = sheet.getRange(r0, colSoTien, n, 1).getValues();
  const out = [];
  let changed = false;

  for (let i = 0; i < n; i++) {
    const type = (types[i][0] == null ? "" : String(types[i][0])).trim().toLowerCase();
    const raw = amounts[i][0];
    if (raw === "" || raw === null || raw === undefined) {
      out.push([raw]);
      continue;
    }
    const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
    if (isNaN(num) || num === 0) {
      out.push([raw]);
      continue;
    }
    const abs = Math.abs(num);
    let next = num;
    if (type === "chi") next = -abs;
    else if (type === "thu") next = abs;
    else {
      out.push([raw]);
      continue;
    }
    out.push([next]);
    if (next !== num) changed = true;
  }

  if (changed) sheet.getRange(r0, colSoTien, n, 1).setValues(out);
}

// ==========================================
// 🤖 PHẦN 3: XỬ LÝ TELEGRAM (PREVIEW / AUTO / SỬA)
// ==========================================
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return;

  // Bảo mật: chỉ nhận update từ Telegram (secret do setWebhook gắn vào URL)
  const secret = PROP.getProperty('webhook_secret');
  if (secret && (!e.parameter || e.parameter.secret !== secret)) return;

  // POST rác / không phải JSON → bỏ qua, tránh crash khiến Telegram retry liên tục
  let contents;
  try {
    contents = JSON.parse(e.postData.contents);
  } catch (err) {
    return;
  }
  if (!contents || typeof contents !== 'object') return;

  const updateId = contents.update_id;
  if (updateId) {
    const lockKey = "LOCK_" + updateId;
    if (CacheService.getScriptCache().get(lockKey)) return;
    CacheService.getScriptCache().put(lockKey, "DONE", 300);
  }

  if (contents.callback_query) {
    handleCallbackQuery(contents.callback_query);
    return;
  }

  if (!contents.message) return;
  const chatId = contents.message.chat.id.toString();
  if (chatId !== PROP.getProperty('admin_id')) return;

  let text = contents.message.text || contents.message.caption || "";
  const voiceFileId = (contents.message.voice && contents.message.voice.file_id)
    || (contents.message.audio && contents.message.audio.file_id)
    || null;

  // Voice → chữ (dùng chung cho await / reply / GD mới)
  if (voiceFileId && !text) {
    const listenId = sendMessage(chatId, "🎙️ Đang nghe...");
    const file = getTelegramFileBase64(voiceFileId);
    if (file.error) {
      editMessage(chatId, listenId, "❌ Lỗi tải voice: " + file.error);
      return;
    }
    const tr = transcribeVoiceGemini(file.base64, file.mimeType);
    deleteMessage(chatId, listenId);
    if (tr.error || !tr.text) {
      sendMessage(chatId, "❌ Không nghe được: " + (tr.error || "trống"));
      return;
    }
    text = tr.text;
    sendMessage(chatId, "🎙️ <i>" + escapeHtml(text) + "</i>");
  }

  // Đang chờ nhập sửa nhanh / số tiền / ghi chú / ngày
  const awaitState = getJsonCache("AWAIT_" + chatId);
  if (awaitState && text && !text.startsWith('/')) {
    handleAwaitText(chatId, text, awaitState);
    return;
  }

  if (text.startsWith('/')) {
    if (text === '/start' || text.indexOf('/start') === 0) {
      // remove_keyboard: gỡ Reply Keyboard cũ (Tháng này / 3 tháng…) còn dính trên mobile
      sendMessage(chatId, "🤖 Bot Sổ Thu Chi AI v2 sẵn sàng!\nGửi ảnh/text/voice. Case rõ → ghi ngay (Sửa/Hoàn tác trong 24h); mơ hồ → chờ xác nhận.\nReply tin GD: <code>ví MB</code>, <code>380k</code>, <code>hủy</code>…", { remove_keyboard: true });
      return;
    }
    if (text === '/report' || text.indexOf('/report') === 0) {
      rebuildBaoCao();
      sendTodayReport(chatId);
      return;
    }
    if (text === '/scan' || text.indexOf('/scan') === 0) {
      const loadId = sendMessage(chatId, "⏳ Đang dò quét hóa đơn từ Email...");
      scanMail(chatId);
      deleteMessage(chatId, loadId);
    }
    return;
  }

  // Reply Keyboard cũ (nút dưới khung chat) — vẫn nhận text khi user bấm; gỡ luôn
  if (text === "Tháng này" || text === "📆 Tháng này") {
    sendMonthReport(chatId, { remove_keyboard: true });
    return;
  }
  if (text === "3 tháng gần nhất" || text === "📅 3 tháng gần nhất") {
    send3MonthReport(chatId, { remove_keyboard: true });
    return;
  }

  // Reply tin GD → lệnh tắt (ví MB, 380k, hủy…)
  if (text && contents.message.reply_to_message) {
    if (handleReplyShortcut(chatId, text, contents.message.reply_to_message)) return;
  }

  let base64Image = null;
  let loadingMsgId = null;

  if (contents.message.photo) {
    loadingMsgId = sendMessage(chatId, "⏳ Đang tải ảnh và phân tích (có thể mất 10-15s)...");
    const photoArr = contents.message.photo;
    const imgRes = getTelegramImageBase64(photoArr[photoArr.length - 1].file_id);
    if (imgRes && imgRes.error) return editMessage(chatId, loadingMsgId, "❌ Lỗi tải ảnh: " + imgRes.error);
    base64Image = imgRes;
  } else if (text) {
    loadingMsgId = sendMessage(chatId, "⏳ Đang kết nối AI và phân tích...");
  } else return;

  const liveData = getLiveData();
  const aiResult = callGeminiAPI(text, base64Image, liveData);
  deleteMessage(chatId, loadingMsgId);

  if (!(aiResult && !aiResult.error && aiResult.giao_dich && aiResult.giao_dich.length > 0)) {
    sendMessage(chatId, "❌ AI không tìm thấy giao dịch: " + ((aiResult && aiResult.error) || ""));
    return;
  }

  processAiTransactions(chatId, text, aiResult.giao_dich, liveData);
}

function processAiTransactions(chatId, sourceText, giaoDichList, liveData) {
  // slice(-6) lặp lại mỗi ~16.7 phút → thêm hậu tố random để tránh trùng ID (đè draft / xóa nhầm lô)
  const txId = "TX_" + new Date().getTime().toString().slice(-6) + Math.random().toString(36).slice(2, 6).toUpperCase();
  const items = [];
  for (let i = 0; i < giaoDichList.length; i++) {
    const raw = giaoDichList[i] || {};
    const norm = normalizeTransaction(Object.assign({ source_text: sourceText || "" }, raw), liveData);
    items.push({
      uniqueKey: txId + "_" + i,
      data: norm,
      aiGuess: snapshotTx(norm)
    });
  }

  const draft = {
    txId: txId,
    sourceText: (sourceText || "").toString().slice(0, 500),
    committed: false,
    items: items
  };
  putJsonCache("DRAFT_" + txId, draft, DRAFT_TTL);

  const allPass = items.every(function (it) { return it.data.pass; });
  if (allPass) {
    // Case rõ: ghi Sheet ngay — giữ Sửa / Hoàn tác 24h
    commitDraft(chatId, draft, null);
  } else {
    sendMessage(chatId, buildTxMessage(draft, "preview"), previewKeyboard(txId));
  }
}

function handleCallbackQuery(cq) {
  const chatId = cq.message.chat.id.toString();
  const messageId = cq.message.message_id;
  const data = cq.data || "";
  answerCallback(cq.id);

  if (chatId !== PROP.getProperty('admin_id')) return;

  if (data === "REPORT_MONTH") { sendMonthReport(chatId); return; }
  if (data === "REPORT_3MONTH") { send3MonthReport(chatId); return; }

  // Tin cũ (GitHub): CONFIRM_ chỉ gỡ nút; EDIT_ mở menu sửa nếu còn draft/sheet
  if (data.indexOf("CONFIRM_") === 0) {
    clearInlineKeyboard(chatId, messageId);
    return;
  }
  if (data.indexOf("EDIT_") === 0) {
    const oldTx = data.replace("EDIT_", "");
    startEditFlow(chatId, messageId, oldTx);
    return;
  }

  const parts = data.split(":");
  const op = parts[0];
  const txId = parts[1];

  if (op === "C") {
    const draft = getJsonCache("DRAFT_" + txId);
    if (!draft) return editMessage(chatId, messageId, "⌛ Hết hạn xác nhận. Gửi lại giao dịch.");
    if (draft.committed) return editMessage(chatId, messageId, "ℹ️ Lô <code>" + txId + "</code> đã ghi sổ.");
    commitDraft(chatId, draft, messageId);
    return;
  }
  if (op === "X") {
    const draftX = getJsonCache("DRAFT_" + txId);
    if (draftX && draftX.committed) {
      return editMessage(chatId, messageId, "⌛ Đã ghi sổ — không hủy được. Dùng ↩️ Hoàn tác (trong 24h) hoặc sửa trên Sheet.");
    }
    CacheService.getScriptCache().remove("DRAFT_" + txId);
    editMessage(chatId, messageId, "🗑 Đã hủy lô <code>" + txId + "</code>.", { inline_keyboard: [] });
    return;
  }
  if (op === "U") {
    undoCommitted(chatId, messageId, txId);
    return;
  }
  if (op === "E") {
    if (parts.length === 2) startEditFlow(chatId, messageId, txId);
    else showEditMenu(chatId, messageId, txId, parseInt(parts[2], 10));
    return;
  }
  if (op === "Q") {
    // Q:txId:idx — sửa nhanh bằng câu (gom vào phiên nháp)
    const idx = parseInt(parts[2], 10);
    const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
    if (!sess) return editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    putJsonCache("AWAIT_" + chatId, { mode: "quick", txId: txId, idx: idx, messageId: messageId }, EDIT_SESS_TTL);
    editMessage(chatId, messageId,
      "⚡ <b>Sửa nhanh</b> GD #" + (idx + 1) + "\nGửi câu kiểu: <code>Ví MB, 380k, danh mục Ăn uống</code>\n(Gom vào nháp — chưa ghi Sheet)",
      { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]] });
    return;
  }
  if (op === "F") {
    // F:txId:idx:field
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    beginFieldEdit(chatId, messageId, txId, idx, field);
    return;
  }
  if (op === "L") {
    // L:txId:idx:field:page — phân trang list
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    const page = parseInt(parts[4], 10) || 0;
    showPickList(chatId, messageId, txId, idx, field, page);
    return;
  }
  if (op === "N") {
    // N:txId:idx:field — Nhập khác
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    beginCustomInput(chatId, messageId, txId, idx, field);
    return;
  }
  if (op === "A") {
    // A:txId:idx:1|0 — thêm sổ tay / chỉ lần này
    const idx = parseInt(parts[2], 10);
    const addToBook = parts[3] === "1";
    handleCustomChoice(chatId, messageId, txId, idx, addToBook);
    return;
  }
  if (op === "P") {
    // P:txId:idx:field:optIndex
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    const optIdx = parseInt(parts[4], 10);
    applyPickValue(chatId, messageId, txId, idx, field, optIdx);
    return;
  }
  if (op === "S") {
    // S:txId:idx — lưu ngay vào sổ
    const idx = parseInt(parts[2], 10);
    confirmEditSessionSave(chatId, messageId, txId, idx);
    return;
  }
  if (op === "R") {
    // R:txId:idx — tải lại phiên (sau khi Sheet đổi)
    const idx = parseInt(parts[2], 10);
    CacheService.getScriptCache().remove(editSessKey(txId, idx));
    const draft = getJsonCache("DRAFT_" + txId) || loadDraftFromSheet(txId);
    if (draft) putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);
    openEditSession(txId, idx);
    showEditMenu(chatId, messageId, txId, idx);
    return;
  }
  if (op === "B") {
    // B:txId — về tin chính
    const draft = getJsonCache("DRAFT_" + txId);
    if (!draft) return editMessage(chatId, messageId, "⌛ Phiên đã hết hạn.");
    const kb = draft.committed ? committedKeyboard(txId) : previewKeyboard(txId);
    editMessage(chatId, messageId, buildTxMessage(draft, draft.committed ? "committed" : "preview"), kb);
    return;
  }
}

function previewKeyboard(txId) {
  return {
    inline_keyboard: [[
      { text: "✅ Ghi", callback_data: "C:" + txId },
      { text: "✏️ Sửa", callback_data: "E:" + txId },
      { text: "❌ Hủy", callback_data: "X:" + txId }
    ]]
  };
}

function committedKeyboard(txId) {
  return {
    inline_keyboard: [[
      { text: "✏️ Sửa", callback_data: "E:" + txId },
      { text: "↩️ Hoàn tác", callback_data: "U:" + txId }
    ]]
  };
}

function commitDraft(chatId, draft, messageId) {
  const batchData = draft.items.map(function (it) {
    return { data: it.data, uniqueKey: it.uniqueKey, alreadyNormalized: true };
  });
  const saveRes = saveBatchToSheet(batchData);
  if (saveRes !== true) {
    const err = "❌ <b>Lỗi ghi Sheet:</b> " + saveRes;
    if (messageId) editMessage(chatId, messageId, err);
    else sendMessage(chatId, err);
    return;
  }
  draft.committed = true;
  putJsonCache("DRAFT_" + draft.txId, draft, UNDO_TTL);
  putJsonCache("UNDO_" + draft.txId, {
    keys: draft.items.map(function (it) { return it.uniqueKey; })
  }, UNDO_TTL);

  const text = buildTxMessage(draft, "committed");
  const kb = committedKeyboard(draft.txId);
  let msgId = messageId;
  if (messageId) editMessage(chatId, messageId, text, kb);
  else msgId = sendMessage(chatId, text, kb);
  if (msgId) scheduleClearCommittedKeyboard(chatId, msgId);
}

function undoCommitted(chatId, messageId, txId) {
  const undo = getJsonCache("UNDO_" + txId);
  if (!undo || !undo.keys) {
    editMessage(chatId, messageId, "⌛ Hết hạn hoàn tác (24h) hoặc không tìm thấy lô.");
    return;
  }
  const removed = deleteRowsByUniqueKeys(undo.keys);
  CacheService.getScriptCache().remove("UNDO_" + txId);
  CacheService.getScriptCache().remove("DRAFT_" + txId);
  editMessage(chatId, messageId,
    "↩️ Đã hoàn tác lô <code>" + txId + "</code> (" + removed + " dòng).",
    { inline_keyboard: [] });
}

function startEditFlow(chatId, messageId, txId) {
  let draft = getJsonCache("DRAFT_" + txId);
  if (!draft) {
    draft = loadDraftFromSheet(txId);
    if (draft) putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);
  }
  if (!draft || !draft.items || !draft.items.length) {
    editMessage(chatId, messageId, "⌛ Không còn phiên sửa cho <code>" + txId + "</code> (hết hạn 24h hoặc đã xóa). Gửi lại GD hoặc sửa trên Sheet.");
    return;
  }
  if (draft.items.length === 1) {
    openEditSession(txId, 0);
    showEditMenu(chatId, messageId, txId, 0);
    return;
  }
  const rows = [];
  for (let i = 0; i < draft.items.length; i++) {
    rows.push([{ text: "GD #" + (i + 1), callback_data: "E:" + txId + ":" + i }]);
  }
  rows.push([{ text: "↩️ Quay lại", callback_data: "B:" + txId }]);
  editMessage(chatId, messageId, "✏️ Chọn giao dịch cần sửa:", { inline_keyboard: rows });
}

function showEditMenu(chatId, messageId, txId, idx) {
  let sess = getEditSession(txId, idx);
  if (!sess) sess = openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const d = sess.draft;
  const dirty = diffSnapshots(snapshotTx(sess.base), snapshotTx(sess.draft)).length > 0;
  let text = "✏️ <b>Phiên sửa GD #" + (idx + 1) + "</b>" + (dirty ? " · có nháp chưa lưu" : "") + "\n" +
    formatOneTx(d) + "\n\nChọn field hoặc sửa nhanh — gom vào nháp, rồi bấm Lưu vào sổ.";
  const rows = [
    [{ text: "⚡ Sửa nhanh bằng câu", callback_data: "Q:" + txId + ":" + idx }],
    [
      { text: "💰 Số tiền", callback_data: "F:" + txId + ":" + idx + ":st" },
      { text: "💳 Ví", callback_data: "F:" + txId + ":" + idx + ":vi" }
    ],
    [
      { text: "📁 Danh mục", callback_data: "F:" + txId + ":" + idx + ":dm" },
      { text: "👤 Đối tượng", callback_data: "F:" + txId + ":" + idx + ":dt" }
    ],
    [
      { text: "Thu/Chi", callback_data: "F:" + txId + ":" + idx + ":pl" },
      { text: "Ngày", callback_data: "F:" + txId + ":" + idx + ":ng" },
      { text: "Ghi chú", callback_data: "F:" + txId + ":" + idx + ":gc" }
    ]
  ];
  if (dirty) {
    rows.push([{ text: "✍️ Lưu vào sổ", callback_data: "S:" + txId + ":" + idx }]);
  }
  rows.push([{ text: "↩️ Quay lại", callback_data: "B:" + txId }]);
  const kb = { inline_keyboard: rows };
  if (messageId) editMessage(chatId, messageId, text, kb);
  else sendMessage(chatId, text, kb);
}

function beginFieldEdit(chatId, messageId, txId, idx, field) {
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  if (field === "vi" || field === "dm" || field === "dt") {
    showPickList(chatId, messageId, txId, idx, field, 0);
    return;
  }
  if (field === "pl") {
    const kb = {
      inline_keyboard: [
        [
          { text: "Thu", callback_data: "P:" + txId + ":" + idx + ":pl:0" },
          { text: "Chi", callback_data: "P:" + txId + ":" + idx + ":pl:1" }
        ],
        [{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]
      ]
    };
    putJsonCache("OPTS_" + txId + "_" + idx + "_pl", ["Thu", "Chi"], EDIT_SESS_TTL);
    editMessage(chatId, messageId, "Chọn phân loại (gom vào nháp):", kb);
    return;
  }
  const labels = { st: "số tiền (vd 380k)", ng: "ngày (dd/MM/yyyy)", gc: "ghi chú" };
  putJsonCache("AWAIT_" + chatId, { mode: "field", field: field, txId: txId, idx: idx, messageId: messageId }, EDIT_SESS_TTL);
  editMessage(chatId, messageId,
    "Nhập <b>" + (labels[field] || field) + "</b> (gom vào nháp):",
    { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]] });
}

function showPickList(chatId, messageId, txId, idx, field, page) {
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const liveData = getLiveData();
  const list = field === "vi" ? liveData.wallets : (field === "dm" ? liveData.categories : liveData.users);
  const top = suggestTopOptions(field, list, liveData.lessons || []);
  const opts = top.concat(list.filter(function (x) { return top.indexOf(x) === -1; }));
  putJsonCache("OPTS_" + txId + "_" + idx + "_" + field, opts, EDIT_SESS_TTL);

  const totalPages = Math.max(1, Math.ceil(opts.length / OPTS_PAGE_SIZE));
  page = Math.max(0, Math.min(page || 0, totalPages - 1));
  const slice = opts.slice(page * OPTS_PAGE_SIZE, page * OPTS_PAGE_SIZE + OPTS_PAGE_SIZE);
  const rows = [];
  for (let i = 0; i < slice.length; i++) {
    const absIdx = page * OPTS_PAGE_SIZE + i;
    rows.push([{ text: String(slice[i]).slice(0, 40), callback_data: "P:" + txId + ":" + idx + ":" + field + ":" + absIdx }]);
  }
  const nav = [];
  if (page > 0) nav.push({ text: "⬅️", callback_data: "L:" + txId + ":" + idx + ":" + field + ":" + (page - 1) });
  if (totalPages > 1) nav.push({ text: (page + 1) + "/" + totalPages, callback_data: "L:" + txId + ":" + idx + ":" + field + ":" + page });
  if (page < totalPages - 1) nav.push({ text: "➡️", callback_data: "L:" + txId + ":" + idx + ":" + field + ":" + (page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "✍️ Nhập khác", callback_data: "N:" + txId + ":" + idx + ":" + field }]);
  rows.push([{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]);

  const title = field === "vi" ? "Ví" : (field === "dm" ? "Danh mục" : "Đối tượng");
  editMessage(chatId, messageId, "Chọn <b>" + title + "</b> (trang " + (page + 1) + "/" + totalPages + "):", { inline_keyboard: rows });
}

function beginCustomInput(chatId, messageId, txId, idx, field) {
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const title = field === "vi" ? "ví" : (field === "dm" ? "danh mục" : "đối tượng");
  putJsonCache("AWAIT_" + chatId, { mode: "custom", field: field, txId: txId, idx: idx, messageId: messageId }, EDIT_SESS_TTL);
  editMessage(chatId, messageId,
    "✍️ Nhập <b>" + title + "</b> (tên hoặc alias sổ tay):",
    { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "F:" + txId + ":" + idx + ":" + field }]] });
}

function applyPickValue(chatId, messageId, txId, idx, field, optIdx) {
  const sess = getEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const opts = getJsonCache("OPTS_" + txId + "_" + idx + "_" + field) || [];
  const value = opts[optIdx];
  if (value === undefined || value === null) {
    editMessage(chatId, messageId, "❌ Không tìm thấy lựa chọn.");
    return;
  }
  const patch = {};
  if (field === "vi") patch.vi = value;
  if (field === "dm") patch.danh_muc_con = value;
  if (field === "dt") patch.doi_tuong = value;
  if (field === "pl") patch.phan_loai = value;
  applyToEditSession(sess, patch);
  showEditMenu(chatId, messageId, txId, idx);
}

function handleAwaitText(chatId, text, awaitState) {
  CacheService.getScriptCache().remove("AWAIT_" + chatId);
  const txId = awaitState.txId;
  const idx = awaitState.idx;
  const messageId = awaitState.messageId;
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    sendMessage(chatId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại trên tin GD.");
    return;
  }

  if (awaitState.mode === "custom") {
    resolveCustomDictValue(chatId, messageId, txId, idx, awaitState.field, text);
    return;
  }

  let patch = {};
  if (awaitState.mode === "quick") {
    patch = parseQuickEdit(text);
    if (!Object.keys(patch).length) {
      sendMessage(chatId, "❌ Không hiểu câu sửa. Thử: <code>Ví MB, 380k, danh mục Ăn uống</code>");
      showEditMenu(chatId, messageId, txId, idx);
      return;
    }
  } else if (awaitState.mode === "field") {
    const f = awaitState.field;
    if (f === "st") {
      const amt = parseMoneyToken(text);
      if (amt === null) {
        sendMessage(chatId, "❌ Số tiền không hợp lệ.");
        showEditMenu(chatId, messageId, txId, idx);
        return;
      }
      patch.so_tien_abs = amt;
    } else if (f === "ng") {
      patch.ngay_gd = text.trim();
    } else if (f === "gc") {
      patch.ghi_chu = text.trim();
    }
  }
  applyToEditSession(sess, patch);
  showEditMenu(chatId, messageId || null, txId, idx);
}

function resolveCustomDictValue(chatId, messageId, txId, idx, field, text) {
  const sess = getEditSession(txId, idx);
  if (!sess) {
    sendMessage(chatId, "⌛ Phiên sửa hết hạn.");
    return;
  }
  const raw = (text || "").toString().trim();
  if (!raw) {
    sendMessage(chatId, "❌ Trống.");
    showPickList(chatId, messageId, txId, idx, field, 0);
    return;
  }
  const liveData = getLiveData();
  const list = field === "vi" ? liveData.wallets : (field === "dm" ? liveData.categories : liveData.users);
  let matched = matchDict(raw, list);

  // Alias từ AI_Learning: ai_guess → user_fix (nếu còn trong sổ tay)
  if (!matched) {
    const fname = fieldMapName(field);
    const lessons = liveData.lessons || [];
    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i].field === fname && String(lessons[i].ai_guess).trim().toLowerCase() === raw.toLowerCase()) {
        matched = matchDict(lessons[i].user_fix, list);
        if (matched) break;
      }
    }
  }

  if (matched) {
    const patch = {};
    if (field === "vi") patch.vi = matched;
    if (field === "dm") patch.danh_muc_con = matched;
    if (field === "dt") patch.doi_tuong = matched;
    applyToEditSession(sess, patch);
    if (messageId) showEditMenu(chatId, messageId, txId, idx);
    else sendMessage(chatId, "✅ Đã gom vào nháp: " + matched);
    return;
  }

  putJsonCache("PENDCUSTOM_" + txId + "_" + idx, { field: field, value: raw }, EDIT_SESS_TTL);
  const title = field === "vi" ? "ví" : (field === "dm" ? "danh mục" : "đối tượng");
  const kb = {
    inline_keyboard: [
      [{ text: "➕ Thêm vào sổ tay", callback_data: "A:" + txId + ":" + idx + ":1" }],
      [{ text: "Chỉ dùng lần này", callback_data: "A:" + txId + ":" + idx + ":0" }],
      [{ text: "↩️ Quay lại", callback_data: "F:" + txId + ":" + idx + ":" + field }]
    ]
  };
  const msg = "❓ <b>" + raw + "</b> chưa có trong sổ tay (" + title + ").\nThêm vào sổ tay hay chỉ dùng lần này (có thể CHECK)?";
  if (messageId) editMessage(chatId, messageId, msg, kb);
  else sendMessage(chatId, msg, kb);
}

function handleCustomChoice(chatId, messageId, txId, idx, addToBook) {
  const sess = getEditSession(txId, idx);
  const pend = getJsonCache("PENDCUSTOM_" + txId + "_" + idx);
  if (!sess || !pend) {
    editMessage(chatId, messageId, "⌛ Hết hạn lựa chọn. Bấm ✏️ Sửa lại.");
    return;
  }
  const field = pend.field;
  let value = pend.value;
  CacheService.getScriptCache().remove("PENDCUSTOM_" + txId + "_" + idx);

  if (addToBook) {
    const ok = addToNotebook(field, value);
    if (!ok) {
      editMessage(chatId, messageId, "❌ Không thêm được vào sổ tay. Thử lại hoặc chọn «Chỉ dùng lần này».");
      return;
    }
  }

  const patch = {};
  if (field === "vi") patch.vi = value;
  if (field === "dm") patch.danh_muc_con = value;
  if (field === "dt") patch.doi_tuong = value;
  applyToEditSession(sess, patch);
  showEditMenu(chatId, messageId, txId, idx);
}

function confirmEditSessionSave(chatId, messageId, txId, idx) {
  const reply = function (text, kb) {
    if (messageId) editMessage(chatId, messageId, text, kb || null);
    else sendMessage(chatId, text, kb || null);
  };

  const sess = getEditSession(txId, idx);
  if (!sess) {
    reply("⌛ Phiên sửa hết hạn — không áp dụng mù. Bấm ✏️ Sửa lại.");
    return;
  }
  const before = snapshotTx(sess.base);
  const after = sess.draft;
  const diffs = diffSnapshots(before, snapshotTx(after));
  if (!diffs.length) {
    // Chống double-tap khi không còn thay đổi mới
    reply(
      "✅ Đã lưu — không còn thay đổi mới.\n\n" + formatOneTx(after),
      { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "B:" + txId }]] });
    return;
  }

  if (sess.committed) {
    const fpNow = getSheetFingerprint(sess.uniqueKey);
    if (fpNow === null) {
      reply("❌ Không tìm thấy dòng <code>" + sess.uniqueKey + "</code> trên Sheet.");
      return;
    }
    if (String(fpNow) !== String(sess.sheetFingerprint)) {
      reply(
        "⚠️ Dòng đã đổi trên Sheet kể từ khi mở phiên. Không ghi đè.\nBấm tải lại để sửa trên bản mới.",
        { inline_keyboard: [
          [{ text: "🔄 Tải lại phiên", callback_data: "R:" + txId + ":" + idx }],
          [{ text: "↩️ Quay lại", callback_data: "B:" + txId }]
        ] });
      return;
    }
    const upd = updateRowByUniqueKey(sess.uniqueKey, after);
    if (upd !== true) {
      reply("❌ Không cập nhật được Sheet: " + upd);
      return;
    }
  }

  let draft = getJsonCache("DRAFT_" + txId);
  if (!draft) {
    draft = loadDraftFromSheet(txId);
  }
  if (draft && draft.items[idx]) {
    draft.items[idx].data = after;
    putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);
  }

  saveAiLearning(sess.sourceText || (draft && draft.sourceText) || "", before, snapshotTx(after), sess.sourceText || "");
  CacheService.getScriptCache().remove(editSessKey(txId, idx));

  const finalDraft = draft || { txId: txId, committed: sess.committed, items: [{ data: after, uniqueKey: sess.uniqueKey }] };
  if (!finalDraft.committed) {
    commitDraft(chatId, finalDraft, messageId);
    return;
  }

  reply("✅ Đã lưu sửa.\n\n" + buildTxMessage(finalDraft, "committed"), committedKeyboard(txId));
}

// ——— Phiên sửa: cache / fingerprint / sổ tay ———

function editSessKey(txId, idx) {
  return "EDITSESS_" + txId + "_" + idx;
}

function deepCopyTx(data) {
  return JSON.parse(JSON.stringify(data));
}

function openEditSession(txId, idx) {
  const draft = getJsonCache("DRAFT_" + txId);
  if (!draft || !draft.items || !draft.items[idx]) return null;
  const item = draft.items[idx];
  const base = deepCopyTx(item.data);
  const sess = {
    txId: txId,
    idx: idx,
    uniqueKey: item.uniqueKey,
    committed: !!draft.committed,
    base: base,
    draft: deepCopyTx(item.data),
    openedAt: Date.now(),
    sheetFingerprint: draft.committed ? getSheetFingerprint(item.uniqueKey) : null,
    sourceText: draft.sourceText || ""
  };
  putJsonCache(editSessKey(txId, idx), sess, EDIT_SESS_TTL);
  return sess;
}

function getEditSession(txId, idx) {
  const sess = getJsonCache(editSessKey(txId, idx));
  if (!sess) return null;
  if (sess.openedAt && (Date.now() - sess.openedAt) > EDIT_SESS_TTL * 1000) {
    CacheService.getScriptCache().remove(editSessKey(txId, idx));
    return null;
  }
  return sess;
}

function applyToEditSession(sess, patch) {
  // Mục 12: Dùng trực tiếp liveData tĩnh từ session hoặc cố định qua cache ngắn để tránh lệch pass/CHECK lúc sửa
  const liveData = getLiveData();
  const merged = Object.assign({}, sess.draft, patch);
  if (patch.so_tien_abs !== undefined) merged.so_tien = patch.so_tien_abs;
  sess.draft = normalizeTransaction(merged, liveData, true);
  putJsonCache(editSessKey(sess.txId, sess.idx), sess, EDIT_SESS_TTL);
  return sess;
}

function cellToDisplay(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "GMT+7", "dd/MM/yyyy");
  if (v === null || v === undefined) return "";
  return String(v);
}

function getSheetFingerprint(uniqueKey) {
  const row = readLogRowByUniqueKey(uniqueKey);
  if (!row) return null;
  return [
    row.uniqueKey,
    cellToDisplay(row.ngay_gd),
    cellToDisplay(row.phan_loai),
    String(row.so_tien),
    cellToDisplay(row.vi),
    cellToDisplay(row.doi_tuong),
    cellToDisplay(row.danh_muc_con),
    cellToDisplay(row.ghi_chu),
    cellToDisplay(row.status)
  ].join("|");
}

function readLogRowByUniqueKey(uniqueKey) {
  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const logRange = ss.getRangeByName("Log");
    if (!logRange) return null;
    const sheet = logRange.getSheet();
    const startRow = logRange.getRow();
    const startCol = logRange.getColumn();
    const idData = sheet.getRange(startRow, startCol + LOG_COL.UNIQUE_KEY, logRange.getNumRows(), 1).getValues();
    for (let i = 0; i < idData.length; i++) {
      if (idData[i][0] && idData[i][0].toString() === String(uniqueKey)) {
        const vals = sheet.getRange(startRow + i, startCol, 1, 10).getValues()[0];
        return {
          ngay_gd: vals[LOG_COL.NGAY],
          phan_loai: vals[LOG_COL.PHAN_LOAI],
          so_tien: vals[LOG_COL.SO_TIEN],
          vi: vals[LOG_COL.VI],
          doi_tuong: vals[LOG_COL.DOI_TUONG],
          danh_muc_con: vals[LOG_COL.DANH_MUC_CON],
          ghi_chu: vals[LOG_COL.GHI_CHU] || "",
          uniqueKey: uniqueKey,
          status: vals[LOG_COL.STATUS] || ""
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function addToNotebook(field, value) {
  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    let rangeName = "";
    let valueColOffset = 0;
    if (field === "vi") { rangeName = "Wallet"; valueColOffset = 0; }
    else if (field === "dt") { rangeName = "userr"; valueColOffset = 0; }
    else if (field === "dm") { rangeName = "Category"; valueColOffset = 1; }
    else return false;

    const range = ss.getRangeByName(rangeName);
    if (!range) return false;
    const sheet = range.getSheet();
    const values = range.getValues();
    let insertLocal = -1;
    for (let i = 0; i < values.length; i++) {
      if (!values[i][valueColOffset]) { insertLocal = i; break; }
    }
    if (insertLocal >= 0) {
      sheet.getRange(range.getRow() + insertLocal, range.getColumn() + valueColOffset).setValue(value);
    } else {
      const newRow = range.getLastRow() + 1;
      const nCols = range.getNumColumns();
      if (field === "dm" && nCols >= 2) {
        const rowVals = [];
        for (let c = 0; c < nCols; c++) rowVals.push(c === valueColOffset ? value : "");
        sheet.getRange(newRow, range.getColumn(), 1, nCols).setValues([rowVals]);
      } else {
        sheet.getRange(newRow, range.getColumn() + valueColOffset).setValue(value);
      }
      ss.setNamedRange(rangeName, sheet.getRange(range.getRow(), range.getColumn(), range.getNumRows() + 1, nCols));
    }
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return false;
  }
}

// ==========================================
// 📦 CHUẨN HÓA GD + RULE TỰ GHI
// ==========================================
function normalizeTransaction(raw, liveData, alreadyPartial) {
  liveData = liveData || { wallets: [], users: [], categories: [], aliases: [] };
  const reasons = [];
  const matchedAlias = alreadyPartial ? null : matchAlias_(raw.source_text || "", liveData.aliases || []);

  let dateStr = "";
  let dateOk = false;
  const ngayRaw = (raw.ngay_gd || "").toString().trim();
  if (!ngayRaw || ngayRaw.toLowerCase() === "hôm nay" || ngayRaw.toLowerCase() === "hom nay") {
    dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
    dateOk = true;
  } else {
    const parts = ngayRaw.split(/[\/\-\.]/);
    if (parts.length >= 2) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parts.length === 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime()) && dt.getDate() === d && dt.getMonth() === m) {
        dateStr = Utilities.formatDate(dt, "GMT+7", "dd/MM/yyyy");
        dateOk = true;
      }
    }
  }
  if (!dateOk) {
    dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
    reasons.push("ngày");
  }

  const phanLoaiRaw = (raw.phan_loai == null ? "" : String(raw.phan_loai)).trim().toLowerCase();
  const hasThuSignal = phanLoaiRaw.indexOf("nhận") !== -1 || phanLoaiRaw.indexOf("cong") !== -1 || phanLoaiRaw.indexOf("cộng") !== -1 || phanLoaiRaw.indexOf("thu") !== -1;
  const hasChiSignal = phanLoaiRaw.indexOf("chi") !== -1 || phanLoaiRaw.indexOf("trả") !== -1 || phanLoaiRaw.indexOf("tra") !== -1;
  const phanLoai = hasThuSignal && !hasChiSignal ? "Thu" : "Chi";
  if (!(hasThuSignal && !hasChiSignal) && !(hasChiSignal && !hasThuSignal)) reasons.push("thu/chi");

  const rawAmount = raw.so_tien_abs !== undefined && raw.so_tien_abs !== null && raw.so_tien_abs !== "" ? parseFloat(raw.so_tien_abs) : parseMoneyToken(raw.so_tien);
  const absAmount = isNaN(rawAmount) || rawAmount === null ? 0 : Math.abs(rawAmount);
  if (absAmount <= 0) reasons.push("số tiền");

  const viMatched = matchDict(raw.vi, liveData.wallets);
  const userMatched = matchDict(raw.doi_tuong, liveData.users);
  const catMatched = matchDict(raw.danh_muc_con, liveData.categories);
  const aliasVi = matchedAlias && matchDict(matchedAlias.vi, liveData.wallets);
  const aliasUser = matchedAlias && matchDict(matchedAlias.doi_tuong, liveData.users);
  const aliasCategory = matchedAlias && matchDict(matchedAlias.danh_muc_con, liveData.categories);
  const vi = viMatched || aliasVi || (raw.vi ? String(raw.vi).trim() : "") || "Chưa phân loại";
  const doi_tuong = userMatched || aliasUser || (raw.doi_tuong ? String(raw.doi_tuong).trim() : "") || "Chưa phân loại";
  const danh_muc_con = catMatched || aliasCategory || (raw.danh_muc_con ? String(raw.danh_muc_con).trim() : "") || "Chưa phân loại";
  const ghi_chu = (matchedAlias && matchedAlias.ghi_chu) || (raw.ghi_chu || "").toString();
  if (!viMatched && !aliasVi) reasons.push("ví");
  if (!userMatched && !aliasUser) reasons.push("đối tượng");
  if (!catMatched && !aliasCategory) reasons.push("danh mục");

  const isUncat = function (val) { return !val || val === "Chưa phân loại" || val === "Khác"; };
  const pass = reasons.length === 0 && !isUncat(vi) && !isUncat(doi_tuong) && !isUncat(danh_muc_con) && absAmount > 0 && dateOk;
  return {
    ngay_gd: dateStr, phan_loai: phanLoai, so_tien: phanLoai === "Chi" ? -absAmount : absAmount,
    so_tien_abs: absAmount, vi: vi, doi_tuong: doi_tuong, danh_muc_con: danh_muc_con,
    ghi_chu: ghi_chu, status: pass ? "" : "CHECK", pass: pass, reasons: reasons
  };
}

function matchDict(val, list) {
  if (!val || !list || !list.length) return null;
  const t = String(val).trim().toLowerCase();
  if (!t || t === "chưa phân loại" || t === "khác") return null;
  for (let i = 0; i < list.length; i++) {
    if (String(list[i]).trim().toLowerCase() === t) return String(list[i]).trim();
  }
  return null;
}

function parseMoneyToken(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && !isNaN(raw)) return Math.abs(raw);
  let s = String(raw).trim().toLowerCase().replace(/đ|vnd|vnđ/gi, "").replace(/\s+/g, "");
  if (!s) return null;
  let mult = 1;
  if (/tỷ|ty/.test(s)) {
    mult = 1e9;
    s = s.replace(/tỷ|ty/g, "");
  } else if (/triệu|(^|[^a-z])tr([^a-z]|$)|(^|[^a-z])m([^a-z]|$)/.test(s) || /tr$|m$/.test(s)) {
    mult = 1e6;
    s = s.replace(/triệu|tr|m/g, "");
  } else if (/k$|nghìn|nghin/.test(s) || /k/.test(s)) {
    mult = 1e3;
    s = s.replace(/nghìn|nghin|k/g, "");
  }
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return Math.abs(n * mult);
}

function snapshotTx(d) {
  return {
    ngay_gd: d.ngay_gd,
    phan_loai: d.phan_loai,
    so_tien_abs: d.so_tien_abs,
    vi: d.vi,
    doi_tuong: d.doi_tuong,
    danh_muc_con: d.danh_muc_con,
    ghi_chu: d.ghi_chu || ""
  };
}

function diffSnapshots(before, after) {
  const labels = {
    ngay_gd: "Ngày",
    phan_loai: "Thu/Chi",
    so_tien_abs: "Số tiền",
    vi: "Ví",
    doi_tuong: "Đối tượng",
    danh_muc_con: "Danh mục",
    ghi_chu: "Ghi chú"
  };
  const out = [];
  Object.keys(labels).forEach(function (k) {
    const b = before[k];
    const a = after[k];
    if (String(b) !== String(a)) {
      if (k === "so_tien_abs") out.push(labels[k] + ": " + formatMoney(b) + " → " + formatMoney(a));
      else out.push(labels[k] + ": " + (b || "∅") + " → " + (a || "∅"));
    }
  });
  return out;
}

function formatOneTx(d, opts) {
  opts = opts || {};
  const isChi = d.phan_loai === "Chi";
  const emoji = isChi ? "🔴" : "🔵";
  const dau = isChi ? "−" : "+";
  let flag = "";
  if (!d.pass) {
    flag = opts.showReasons && d.reasons && d.reasons.length
      ? " ⚠️(" + escapeHtml(d.reasons.join(", ")) + ")"
      : " ⚠️";
  }
  const lines = [
    "📅 " + escapeHtml(d.ngay_gd),
    emoji + " " + escapeHtml(d.phan_loai) + " " + dau + formatMoney(d.so_tien_abs) + flag,
    "💳 " + escapeHtml(d.vi) + "  ·  📁 " + escapeHtml(d.danh_muc_con),
    "👤 " + escapeHtml(d.doi_tuong)
  ];
  if (d.ghi_chu) lines.push("📝 " + escapeHtml(d.ghi_chu));
  return lines.join("\n");
}

function buildTxMessage(draft, mode) {
  const n = draft.items.length;
  let head;
  if (mode === "committed") head = "✅ Đã ghi sổ";
  else head = "📋 Xem trước";

  let body = "";
  draft.items.forEach(function (it, index) {
    body += "\n\n";
    if (n > 1) body += "<b>#" + (index + 1) + "</b>\n";
    body += formatOneTx(it.data, { showReasons: mode !== "committed" });
  });
  body += "\n\nID: <code>" + draft.txId + "</code>";
  return "<b>" + head + "</b>" + body;
}

function parseQuickEdit(text) {
  const patch = {};
  const t = (text || "").toString().trim();
  if (!t) return patch;

  const viM = t.match(/(?:ví|vi|nguồn|nguon)\s*[:=]?\s*([^,;#]+)/i);
  if (viM) patch.vi = viM[1].trim();

  const dmM = t.match(/(?:danh\s*mục|danh\s*muc|dm)\s*[:=]?\s*([^,;#]+)/i);
  if (dmM) patch.danh_muc_con = dmM[1].trim();

  const dtM = t.match(/(?:đối\s*tượng|doi\s*tuong|người|nguoi)\s*[:=]?\s*([^,;#]+)/i);
  if (dtM) patch.doi_tuong = dtM[1].trim();

  const gcM = t.match(/(?:ghi\s*chú|ghi\s*chu|note)\s*[:=]?\s*([^,;#]+)/i);
  if (gcM) patch.ghi_chu = gcM[1].trim();

  if (/\bthu\b/i.test(t) && !/\bchi\b/i.test(t)) patch.phan_loai = "Thu";
  if (/\bchi\b/i.test(t) && !/\bthu\b/i.test(t)) patch.phan_loai = "Chi";
  if (/đổi\s*sang\s*thu|sang\s*thu/i.test(t)) patch.phan_loai = "Thu";
  if (/đổi\s*sang\s*chi|sang\s*chi/i.test(t)) patch.phan_loai = "Chi";

  const moneyM = t.match(/(\d+(?:[.,]\d+)?\s*(?:k|m|tr|tỷ|ty)?)/i);
  if (moneyM) {
    const amt = parseMoneyToken(moneyM[1]);
    if (amt !== null) patch.so_tien_abs = amt;
  }

  // "Đổi sang MB" không có prefix ví
  if (!patch.vi) {
    const sang = t.match(/(?:đổi\s*sang|doi\s*sang|sang)\s+([A-Za-zÀ-ỹ0-9 ]{1,30})/i);
    if (sang) {
      const cand = sang[1].trim().split(/[,\s]+/)[0];
      if (cand && !/^\d/.test(cand) && !/^(thu|chi)$/i.test(cand)) patch.vi = cand;
    }
  }
  return patch;
}

/** Reply tin GD: lệnh tắt — ví MB / 380k / dm ăn uống / hủy */
function handleReplyShortcut(chatId, text, replyMsg) {
  const replyText = (replyMsg && (replyMsg.text || replyMsg.caption)) || "";
  const txId = extractTxIdFromText(replyText);
  if (!txId) return false;

  const raw = (text || "").toString().trim();
  if (!raw) return false;

  // #2 ví MB — chọn GD trong lô
  let idx = 0;
  let cmd = raw;
  const idxM = raw.match(/^#(\d+)\s+(.+)$/i);
  if (idxM) {
    idx = Math.max(0, parseInt(idxM[1], 10) - 1);
    cmd = idxM[2].trim();
  }

  if (/^(hủy|huy|cancel)$/i.test(cmd)) {
    const draft = getJsonCache("DRAFT_" + txId);
    if (draft && !draft.committed) {
      CacheService.getScriptCache().remove("DRAFT_" + txId);
      sendMessage(chatId, "🗑 Đã hủy lô <code>" + txId + "</code>.");
      return true;
    }
    if (draft && draft.committed) {
      const undo = getJsonCache("UNDO_" + txId);
      if (undo && undo.keys) {
        const removed = deleteRowsByUniqueKeys(undo.keys);
        CacheService.getScriptCache().remove("UNDO_" + txId);
        CacheService.getScriptCache().remove("DRAFT_" + txId);
        sendMessage(chatId, "↩️ Đã hoàn tác lô <code>" + txId + "</code> (" + removed + " dòng).");
        return true;
      }
      sendMessage(chatId, "⌛ Hết hạn hoàn tác cho <code>" + txId + "</code>.");
      return true;
    }
    sendMessage(chatId, "⌛ Không còn phiên <code>" + txId + "</code>.");
    return true;
  }

  const patch = parseQuickEdit(cmd);
  if (!Object.keys(patch).length) {
    sendMessage(chatId, "❌ Không hiểu lệnh tắt. Thử: <code>ví MB</code>, <code>380k</code>, <code>dm Ăn uống</code>, <code>hủy</code>");
    return true;
  }

  let draft = getJsonCache("DRAFT_" + txId);
  if (!draft) draft = loadDraftFromSheet(txId);
  if (!draft || !draft.items || !draft.items[idx]) {
    sendMessage(chatId, "⌛ Không còn GD #" + (idx + 1) + " của <code>" + txId + "</code>.");
    return true;
  }
  putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);

  const sess = openEditSession(txId, idx);
  if (!sess) {
    sendMessage(chatId, "⌛ Không mở được phiên sửa.");
    return true;
  }
  applyToEditSession(sess, patch);
  // Lưu ngay vào sổ (giống ✍️ Lưu vào sổ)
  confirmEditSessionSave(chatId, null, txId, idx);
  return true;
}

function extractTxIdFromText(text) {
  const m = (text || "").toString().match(/TX_\d+/i);
  if (!m) return null;
  return "TX_" + m[0].replace(/^TX_/i, "");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function scheduleClearCommittedKeyboard(chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    let list = [];
    const raw = PROP.getProperty("PENDING_CLEAR_KEYBOARDS");
    if (raw) {
      try { list = JSON.parse(raw); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
    }
    const expireAt = Date.now() + (UNDO_TTL * 1000);
    list.push({ chatId: String(chatId), messageId: messageId, expireAt: expireAt });
    // Giữ tối đa 50 item gần nhất để tránh phình to Script Properties
    if (list.length > 50) list = list.slice(list.length - 50);
    PROP.setProperty("PENDING_CLEAR_KEYBOARDS", JSON.stringify(list));

    // Đảm bảo có sẵn duy nhất 1 trigger định kỳ quét gỡ nút (mỗi 1 giờ)
    ensureClearKeyboardTrigger();
  } catch (e) {}
}

function ensureClearKeyboardTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let found = false;
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "runClearCommittedKeyboardInterval") {
        found = true;
        break;
      }
    }
    if (!found) {
      ScriptApp.newTrigger("runClearCommittedKeyboardInterval")
        .timeBased()
        .everyHours(1)
        .create();
    }
  } catch (e) {}
}

/** Trigger định kỳ mỗi giờ: quét và gỡ nút Sửa/Hoàn tác quá hạn 24h, tránh vượt trần 20 trigger */
function runClearCommittedKeyboardInterval() {
  try {
    const raw = PROP.getProperty("PENDING_CLEAR_KEYBOARDS");
    if (!raw) return;
    let list = [];
    try { list = JSON.parse(raw); if (!Array.isArray(list)) list = []; } catch (e) { return; }
    if (list.length === 0) return;

    const now = Date.now();
    const remaining = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (now >= item.expireAt) {
        try {
          clearInlineKeyboard(item.chatId, item.messageId);
        } catch (err) {}
      } else {
        remaining.push(item);
      }
    }
    PROP.setProperty("PENDING_CLEAR_KEYBOARDS", JSON.stringify(remaining));
  } catch (err) {}
}

/** Tương thích trigger one-shot cũ (CLR_KB_<uid>) — tự xóa sau khi chạy */
function runClearCommittedKeyboard(e) {
  try {
    if (!e || !e.triggerUid) return;
    const propKey = "CLR_KB_" + e.triggerUid;
    const raw = PROP.getProperty(propKey);
    PROP.deleteProperty(propKey);
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getUniqueId() === e.triggerUid) {
        ScriptApp.deleteTrigger(triggers[i]);
        break;
      }
    }
    if (!raw) return;
    const info = JSON.parse(raw);
    if (info && info.chatId && info.messageId) {
      clearInlineKeyboard(info.chatId, info.messageId);
    }
  } catch (err) {}
}

function suggestTopOptions(field, list, lessons) {
  const fname = fieldMapName(field);
  const fromLessons = (lessons || []).filter(function (L) {
    return L.field === fname;
  }).slice(0, 3).map(function (L) { return L.user_fix; });
  const out = [];
  fromLessons.concat(list).forEach(function (x) {
    const matched = matchDict(x, list);
    if (matched && out.indexOf(matched) === -1) out.push(matched);
  });
  return out.slice(0, 3);
}

function fieldMapName(field) {
  if (field === "vi") return "vi";
  if (field === "dm") return "danh_muc_con";
  if (field === "dt") return "doi_tuong";
  if (field === "pl") return "phan_loai";
  if (field === "st") return "so_tien";
  return field;
}

function putJsonCache(key, obj, ttl) {
  CacheService.getScriptCache().put(key, JSON.stringify(obj), ttl || DRAFT_TTL);
}

function getJsonCache(key) {
  const raw = CacheService.getScriptCache().get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function answerCallback(id) {
  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: id }), muteHttpExceptions: true
  });
}

function clearInlineKeyboard(chatId, messageId) {
  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageReplyMarkup", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    muteHttpExceptions: true
  });
}

// ==========================================
// 🧠 PHẦN 4: AI GEMINI & XOAY TUA API KEY (ĐÃ BỌC THÉP CHỐNG LỖI)
// ==========================================
function getShuffledKeys() {
  const keysRaw = PROP.getProperty('ai_keys');
  if (!keysRaw) return [];
  
  let keys = [];
  try {
    keys = JSON.parse(keysRaw);
    if (!Array.isArray(keys)) keys = [keys]; 
  } catch(e) { 
    // 🛡️ BẢO BỐI 1 (Lỗi Key): Nếu Sếp dán key thô "AIzaSy..." vào cấu hình mà quên bọc trong ngoặc vuông ["..."]
    // Lệnh JSON.parse sẽ sập. Đoạn này tự động cứu hộ, biến chuỗi thành mảng luôn.
    if (keysRaw.startsWith("AIza")) keys = [keysRaw.trim()];
    else return [];
  }
  
  if (keys.length === 0) return [];
  
  // Xáo trộn Key
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

function callGeminiAPI(text, base64Image, liveData) {
  const keys = getShuffledKeys();
  if (keys.length === 0) return { error: "Chưa cấu hình API Key hoặc Key bị sai định dạng." };

  // Đã cập nhật Model mặc định
  const model = PROP.getProperty('ai_model') || 'gemini-2.5-flash';
  const systemPrompt = PROP.getProperty('ai_prompt') || 'Bạn là trợ lý bóc tách thu chi.';
  const ownerNames = parseOwnerNamesInput(PROP.getProperty('owner_names') || '[]');
  const ownerList = ownerNames.length
    ? ownerNames.map(function (n) { return '"' + n + '"'; }).join(', ')
    : '(chưa cấu hình Chủ tài khoản)';

  const hardRules = `QUY ƯỚC TIỀN: k=nghìn, m/tr=triệu, t/tỷ=tỷ.

THU/CHI (ƯU TIÊN CAO, áp dụng cả ảnh bill ngân hàng):
- Chủ tài khoản / biến thể tên: ${ownerList}.
- Chủ TK gửi tiền / chuyển đi → CHI.
- Người khác chuyển cho chủ TK, hoặc ảnh/bill có "Tới" / "Đến" / "to" + tên chủ → THU.
- Chỉ thấy "Chuyển thành công" alone ≠ Chi (không suy Chi từ cụm đó).`;

  const aliasTextList = (liveData.aliases || []).map(function(a) {
    return `"${a.raw}" -> Ví: "${a.vi}", DM: "${a.danh_muc_con}", ĐT: "${a.doi_tuong}", Note: "${a.ghi_chu}"`;
  });

  const dynamicPrompt = `${systemPrompt}\n\n${hardRules}\n\nNội dung/Caption: "${text}"\n
* SỔ TAY TỪ ĐIỂN:
- Ví (vi): [${liveData.wallets.join(', ')}]
- Đối tượng (doi_tuong): [${liveData.users.join(', ')}]
- Danh mục (danh_muc_con): [${liveData.categories.join(', ')}]

* ĐỊNH NGHĨA ALIAS (BẮT BUỘC ưu tiên khớp chính xác các từ khóa này trước):
[ ${(aliasTextList && aliasTextList.length) ? aliasTextList.join(' ]\n[ ') : '(chưa có)'} ]

* BÀI HỌC TỪ LẦN SỬA (ưu tiên cao hơn lịch sử):
[ ${(liveData.lessonsText && liveData.lessonsText.length) ? liveData.lessonsText.join(' ]\n[ ') : '(chưa có)'} ]

* LỊCH SỬ THÓI QUEN: 
[ ${liveData.history.join(' ]\n[ ')} ]

YÊU CẦU BẮT BUỘC:
1. Bóc tách TOÀN BỘ giao dịch. Không có ngày thì ghi "Hôm nay".
2. Map đúng tên trong SỔ TAY.
3. Chỉ ghi "Thu" hoặc "Chi" khi có căn cứ rõ từ nội dung. Nếu chưa đủ căn cứ xác định Thu/Chi, ghi "Không rõ" để hệ thống đánh dấu CHECK; tuyệt đối không đoán.
4. Nếu không khớp sổ tay, ghi "Chưa phân loại".
5. Quy ước tiền: "k"=nghìn, "m/tr"=triệu, "t/tỷ"=tỷ.
6. BẮT BUỘC TRẢ VỀ ĐÚNG CẤU TRÚC JSON SAU (Không thêm text thừa):
{
  "giao_dich": [
    {
      "ngay_gd": "dd/MM/yyyy",
      "phan_loai": "Thu",
      "so_tien": 100000,
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
      
      if (data.error) {
        lastError = data.error.message || "Unknown error";
        continue; 
      }
      
      if (!data.candidates || data.candidates.length === 0) {
         lastError = "AI từ chối trả lời (do nhầm lẫn vi phạm chính sách).";
         continue;
      }

      let rawText = data.candidates[0].content.parts[0].text;
      let jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        lastError = "Không bóc tách được JSON từ phản hồi.";
        continue;
      }

      let parsedData = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsedData)) return { giao_dich: parsedData };
      
      return parsedData;

    } catch (e) {
      lastError = e.message;
      continue;
    }
  }
  
  return { error: `Đã thử ${keys.length} API Key nhưng thất bại. Lỗi: ${lastError}` };
}

// ==========================================
// 📧 PHẦN 5: QUÉT MAIL LÔ (BATCH) & BÓC TÁCH
// ==========================================
function triggerScanMailUI() {
  const ui = SpreadsheetApp.getUi();
  const result = scanMail(null);
  ui.alert("KẾT QUẢ QUÉT MAIL", result, ui.ButtonSet.OK);
}

/** AI fallback khi regex không bắt được số tiền. Trả null nếu thất bại. */
function extractMailWithGemini(body, wallet) {
  const keys = getShuffledKeys();
  if (!keys.length) return null;
  const model = PROP.getProperty('ai_model') || 'gemini-2.5-flash';
  const clipped = String(body || '').slice(0, 3000);
  const prompt = `Bạn bóc tách 1 giao dịch từ nội dung email ngân hàng/ví điện tử.
Ví liên quan (gợi ý ngữ cảnh): "${wallet || ''}"

BẮT BUỘC trả về ĐÚNG JSON (không markdown, không text thừa):
{"so_tien": 100000, "ma_giao_dich": "", "phuong_thuc": "", "ngay_gd": ""}

- so_tien: số tiền nguyên dương (VND), không dấu phẩy
- ma_giao_dich: mã GD / số tham chiếu nếu có, "" nếu không
- phuong_thuc: phương thức thanh toán (vd thẻ) nếu có, "" nếu không
- ngay_gd: dd/MM/yyyy nếu có trong mail, "" nếu không

Nội dung mail:
${clipped}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  for (let i = 0; i < keys.length; i++) {
    try {
      const response = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`,
        { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      const data = JSON.parse(response.getContentText());
      if (data.error || !data.candidates || !data.candidates.length) continue;
      const rawText = ((data.candidates[0].content && data.candidates[0].content.parts) || [])
        .map(function (p) { return p.text || ""; }).join("");
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]);
      const soTien = parseInt(String(parsed.so_tien || "").replace(/[.,\s]/g, ""), 10);
      if (!soTien || soTien <= 0) continue;

      let ma = String(parsed.ma_giao_dich || "").trim();
      const phuongThuc = String(parsed.phuong_thuc || "").trim();
      let ngayGd = String(parsed.ngay_gd || "").trim();
      if (!ma) {
        const dayTag = ngayGd && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ngayGd)
          ? ngayGd.replace(/\//g, "")
          : Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
        ma = "AI_" + dayTag + "_" + soTien;
      }
      return { so_tien: soTien, ma_giao_dich: ma, phuong_thuc: phuongThuc, ngay_gd: ngayGd };
    } catch (e) {
      continue;
    }
  }
  return null;
}

function scanMail(chatId) {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const logRange = ss.getRangeByName("Log");
  if (!logRange) return returnMsg(chatId, "❌ Lỗi: Không tìm thấy vùng đặt tên 'Log'");
  
  // Tối ưu: Chỉ cắt đúng cột UNIQUE_KEY để nạp Blacklist
  const existingIds = new Set(logRange.getSheet()
    .getRange(logRange.getRow(), logRange.getColumn() + LOG_COL.UNIQUE_KEY, logRange.getNumRows(), 1)
    .getValues().flat().filter(String).map(String));

  const ruleSheet = ss.getSheetByName("Quet Mail");
  if (!ruleSheet) return returnMsg(chatId, "❌ Lỗi: Không tìm thấy Tab 'Quet Mail'");
  const lastRuleRow = ruleSheet.getLastRow();
  if (lastRuleRow < 2) return returnMsg(chatId, "❌ Tab 'Quet Mail' chưa có rule nào");
  const rules = ruleSheet.getRange(2, 1, lastRuleRow - 1, 5).getValues().filter(row => row[0]);

  const dateFilter = buildGmailDateFilter();
  let count = 0;
  let aiUsed = 0;
  let logMsgs = [];
  let batchData = [];

  for (let rule of rules) {
    const keyword = rule[0]; const note = rule[1]; const wallet = rule[2];
    const user = rule[3]; const subCat = rule[4];
    
    const query = `${dateFilter.queryPart} "${keyword}"`;
    const threads = GmailApp.search(query);

    for (let thread of threads) {
      const messages = thread.getMessages();
      for (let msg of messages) {
        const body = msg.getPlainBody();
        let dateObj = msg.getDate();

        // Tầng 2: regex số tiền
        const amountMatch = body.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(VND|VNĐ|đ|₫)/i);
        let amount = null;
        let uniqueKey = null;
        let finalNote = note;
        let fromAi = false;

        if (amountMatch) {
          amount = parseInt(amountMatch[1].replace(/[.,]/g, ''), 10);
          const refMatch = body.match(/(?:ID giao dịch|Mã giao dịch|Mã số tham chiếu|Số tham chiếu|Tham chiếu|Reference|ID|FT)[\s:.\n]*([A-Za-z0-9-]+)/i);
          uniqueKey = refMatch ? refMatch[1] : `${Utilities.formatDate(dateObj, "GMT+7", "yyyyMMdd")}_${wallet}_${amount}`;

          const paymentMatch = body.match(/Phương thức thanh toán[\s\n:]*([^\n\r]+)/i);
          if (paymentMatch) {
            let rawPayment = paymentMatch[1].trim();
            rawPayment = rawPayment.replace(/\s*(Số tham chiếu|Mã tham chiếu|Tham chiếu|ID giao dịch|Mã giao dịch|Reference).*$/i, '').trim();
            finalNote = rawPayment;
          }
        } else {
          // Tầng 3: Gemini fallback
          if (aiUsed >= AI_MAIL_MAX_CALLS) continue;
          const extracted = extractMailWithGemini(body, wallet);
          aiUsed++;
          if (!extracted) continue;
          amount = extracted.so_tien;
          uniqueKey = extracted.ma_giao_dich;
          if (extracted.phuong_thuc) finalNote = extracted.phuong_thuc;
          if (extracted.ngay_gd && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(extracted.ngay_gd)) {
            const p = extracted.ngay_gd.split("/");
            dateObj = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
          }
          fromAi = true;
        }

        if (!amount || amount <= 0 || !uniqueKey) continue;
        uniqueKey = String(uniqueKey);
        if (existingIds.has(uniqueKey)) continue;

        const gd = { phan_loai: "Chi", so_tien: amount, vi: wallet, doi_tuong: user, danh_muc_con: subCat, ghi_chu: finalNote };
        batchData.push({ data: gd, uniqueKey: uniqueKey, dateObj: dateObj });
        
        existingIds.add(uniqueKey); 
        count++;
        logMsgs.push(`▪️ ${formatMoney(amount)} (${wallet}) - ${finalNote}${fromAi ? " [AI]" : ""}`);
      }
    }
  }

  if (batchData.length > 0) {
    const saveRes = saveBatchToSheet(batchData);
    if (saveRes !== true) return returnMsg(chatId, `❌ <b>Lỗi khi ghi dữ liệu lô:</b> ${saveRes}`);
    rebuildBaoCao();
  }

  const aiNote = aiUsed > 0 ? ` (AI xử lý ${aiUsed} mail)` : "";
  const finalStr = (count > 0 || logMsgs.length > 0) 
    ? `✅ <b>QUÉT XONG! Thêm ${count} GD từ Mail</b> (${dateFilter.label})${aiNote}:\n${logMsgs.join("\n")}`
    : `✅ <b>QUÉT XONG!</b> Không có hóa đơn mới nào khớp Keyword trong ${dateFilter.label}.${aiNote}`;
  return returnMsg(chatId, finalStr);
}


// ==========================================
// 💾 PHẦN 6: GHI SHEET THEO LÔ & DATA (BẢN TỰ PHỤC HỒI CHỐNG LỖI)
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
    const logStartRow = logRange.getRow();
    const needNorm = batchData.some(function (it) { return !it.alreadyNormalized; });
    const liveData = needNorm ? getLiveData() : { wallets: [], users: [], categories: [] };
    
    // 🛡️ BẢO BỐI 1: TỰ ĐỘNG BÙ CỘT (Trị dứt điểm lỗi Ngoài phạm vi do thiếu cột)
    const requiredCols = startCol + 9; 
    if (sheet.getMaxColumns() < requiredCols) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredCols - sheet.getMaxColumns());
    }

    let part1_Array = []; 
    let part2_Array = [];
    for (let i = 0; i < batchData.length; i++) {
      let item = batchData[i];
      let data = item.data;
      if (!item.alreadyNormalized) {
        if (item.dateObj && (!data.ngay_gd || String(data.ngay_gd).toLowerCase() === "hôm nay")) {
          data = Object.assign({}, data, {
            ngay_gd: Utilities.formatDate(item.dateObj, "GMT+7", "dd/MM/yyyy")
          });
        }
        data = normalizeTransaction(data, liveData);
      }
      part1_Array.push([
        data.ngay_gd,
        data.phan_loai,
        data.so_tien,
        data.vi || "Chưa phân loại",
        data.doi_tuong || "Chưa phân loại"
      ]);
      part2_Array.push([
        data.danh_muc_con || "Chưa phân loại",
        data.ghi_chu || "",
        item.uniqueKey,
        data.status || ""
      ]);
    }

    // 🛡️ BẢO BỐI 2: TÌM DÒNG CHỐT ĐÁY BẰNG MẮT THẦN (Không phụ thuộc Named Range)
    // getLastRow() luôn trả về dòng cuối cùng CÓ CHỮ (Bỏ qua các dòng chỉ có định dạng màu)
    let lastDataRow = sheet.getLastRow();
    if (lastDataRow < logStartRow) lastDataRow = logStartRow - 1; // Khóa an toàn không đè Header
    
    // Dòng Dummy Sếp chừa lại chính là dòng ngay bên dưới dòng Data cuối cùng
    const dummyRow = lastDataRow + 1;
    const numNewRows = batchData.length;

    if (numNewRows > 0) {
      // Chèn lên trên dòng Dummy
      sheet.insertRowsBefore(dummyRow, numNewRows);
    }

    let targetRow = dummyRow;

    // 🛡️ BẢO BỐI 3: COPY ĐỊNH DẠNG TỪ CHÍNH DÒNG DUMMY (Siêu an toàn)
    // Sau khi chèn, dòng Dummy cũ bị đẩy xuống vị trí (targetRow + numNewRows)
    // Ta copy trọn vẹn màu sắc, viền, Data Validation từ dòng Dummy này đè ngược lên các dòng vừa chèn
    const formatSource = sheet.getRange(targetRow + numNewRows, startCol, 1, 10);
    const formatTarget = sheet.getRange(targetRow, startCol, numNewRows, 10);
    formatSource.copyTo(formatTarget, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    // BƯỚC 4: GHI DỮ LIỆU
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

function updateRowByUniqueKey(uniqueKey, data) {
  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const logRange = ss.getRangeByName("Log");
    if (!logRange) return "Không tìm thấy Log";
    const sheet = logRange.getSheet();
    const startRow = logRange.getRow();
    const startCol = logRange.getColumn();
    const idData = sheet.getRange(startRow, startCol + LOG_COL.UNIQUE_KEY, logRange.getNumRows(), 1).getValues();
    for (let i = 0; i < idData.length; i++) {
      if (idData[i][0] && idData[i][0].toString() === String(uniqueKey)) {
        const row = startRow + i;
        sheet.getRange(row, startCol, 1, 5).setValues([[
          data.ngay_gd, data.phan_loai, data.so_tien,
          data.vi || "Chưa phân loại", data.doi_tuong || "Chưa phân loại"
        ]]);
        sheet.getRange(row, startCol + 6, 1, 4).setValues([[
          data.danh_muc_con || "Chưa phân loại", data.ghi_chu || "", uniqueKey, data.status || ""
        ]]);
        SpreadsheetApp.flush();
        return true;
      }
    }
    return "Không tìm thấy dòng " + uniqueKey;
  } catch (e) {
    return e.message;
  }
}

function deleteRowsByUniqueKeys(keys) {
  if (!keys || !keys.length) return 0;
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const logRange = ss.getRangeByName("Log");
  if (!logRange) return 0;
  const sheet = logRange.getSheet();
  const startRow = logRange.getRow();
  const startCol = logRange.getColumn();
  const keySet = new Set(keys.map(String));
  const idData = sheet.getRange(startRow, startCol + LOG_COL.UNIQUE_KEY, logRange.getNumRows(), 1).getValues();
  const rowsToDelete = [];
  for (let i = 0; i < idData.length; i++) {
    const k = idData[i][0] ? String(idData[i][0]) : "";
    if (k && keySet.has(k)) rowsToDelete.push(startRow + i);
  }
  if (!rowsToDelete.length) return 0;

  rowsToDelete.sort(function (a, b) { return b - a; });
  let rangeEnd = rowsToDelete[0];
  let rangeStart = rangeEnd;
  for (let i = 1; i <= rowsToDelete.length; i++) {
    const row = rowsToDelete[i];
    if (row === rangeStart - 1) {
      rangeStart = row;
      continue;
    }
    sheet.deleteRows(rangeStart, rangeEnd - rangeStart + 1);
    rangeStart = row;
    rangeEnd = row;
  }
  SpreadsheetApp.flush();
  return rowsToDelete.length;
}

function loadDraftFromSheet(txId) {
  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const logRange = ss.getRangeByName("Log");
    if (!logRange) return null;
    const sheet = logRange.getSheet();
    const startRow = logRange.getRow();
    const startCol = logRange.getColumn();
    const numRows = logRange.getNumRows();
    const values = sheet.getRange(startRow, startCol, numRows, 10).getValues();
    const items = [];
    for (let i = 0; i < values.length; i++) {
      const key = values[i][LOG_COL.UNIQUE_KEY] ? values[i][LOG_COL.UNIQUE_KEY].toString() : "";
      if (!key || key.indexOf(txId) !== 0) continue;
      const so = Number(values[i][LOG_COL.SO_TIEN]) || 0;
      const phan = values[i][LOG_COL.PHAN_LOAI];
      let ngayVal = values[i][LOG_COL.NGAY];
      if (ngayVal instanceof Date) ngayVal = Utilities.formatDate(ngayVal, "GMT+7", "dd/MM/yyyy");
      else ngayVal = cellToDisplay(ngayVal);
      const data = {
        ngay_gd: ngayVal,
        phan_loai: phan,
        so_tien: so,
        so_tien_abs: Math.abs(so),
        vi: values[i][LOG_COL.VI],
        doi_tuong: values[i][LOG_COL.DOI_TUONG],
        danh_muc_con: values[i][LOG_COL.DANH_MUC_CON],
        ghi_chu: values[i][LOG_COL.GHI_CHU] || "",
        status: values[i][LOG_COL.STATUS] || "",
        pass: values[i][LOG_COL.STATUS] !== "CHECK",
        reasons: []
      };
      items.push({ uniqueKey: key, data: data, aiGuess: snapshotTx(data) });
    }
    if (!items.length) return null;
    return { txId: txId, sourceText: "", committed: true, items: items };
  } catch (e) {
    return null;
  }
}

function ensureAiLearningSheet() {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  let sheet = ss.getSheetByName(AI_LEARNING_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AI_LEARNING_SHEET);
    sheet.hideSheet();
    sheet.getRange(1, 1, 1, 7).setValues([[
      "Thời gian", "Nội dung gốc", "Field", "AI đoán", "User sửa", "Ngữ cảnh", "Số lần"
    ]]);
  }
  return sheet;
}

function saveAiLearning(sourceText, before, after, context) {
  try {
    const sheet = ensureAiLearningSheet();
    const fields = ["vi", "doi_tuong", "danh_muc_con", "phan_loai", "so_tien_abs", "ngay_gd", "ghi_chu"];
    const fieldNames = {
      vi: "vi", doi_tuong: "doi_tuong", danh_muc_con: "danh_muc_con",
      phan_loai: "phan_loai", so_tien_abs: "so_tien", ngay_gd: "ngay_gd", ghi_chu: "ghi_chu"
    };
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
    const ctx = (context || sourceText || "").toString().slice(0, 200);
    const src = (sourceText || "").toString().slice(0, 300);
    const data = sheet.getDataRange().getValues();
    fields.forEach(function (k) {
      if (String(before[k]) === String(after[k])) return;
      const field = fieldNames[k];
      const aiGuess = k === "so_tien_abs" ? formatMoney(before[k]) : before[k];
      const userFix = k === "so_tien_abs" ? formatMoney(after[k]) : after[k];
      let updated = false;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][2]) === field && String(data[r][3]) === String(aiGuess) && String(data[r][4]) === String(userFix)) {
          const cnt = Number(data[r][6]) || 1;
          sheet.getRange(r + 1, 7).setValue(cnt + 1);
          sheet.getRange(r + 1, 1).setValue(now);
          updated = true;
          break;
        }
      }
      if (!updated) {
        sheet.appendRow([now, src, field, aiGuess, userFix, ctx, 1]);
      }
    });
  } catch (e) { /* không chặn luồng Tele */ }
}

function getAiLessons() {
  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const sheet = ss.getSheetByName(AI_LEARNING_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const rows = sheet.getRange(2, 1, sheet.getLastRow(), 7).getValues();
    return rows
      .filter(function (r) { return r[2]; })
      .map(function (r) {
        return {
          field: String(r[2]),
          ai_guess: String(r[3]),
          user_fix: String(r[4]),
          context: String(r[5] || ""),
          count: Number(r[6]) || 1
        };
      })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 30);
  } catch (e) {
    return [];
  }
}

function getAliasRows_(ss, wallets, categories, users) {
  try {
    const aliasSheet = ss.getSheets().find(s => s.getSheetId() === ALIAS_SHEET_GID);
    if (!aliasSheet || aliasSheet.getLastRow() < 2) return [];
    const rows = aliasSheet.getRange(2, 1, aliasSheet.getLastRow() - 1, 5).getValues();
    return rows.filter(r => r[0]).map(r => {
      const keywordRaw = String(r[0] || '').trim();
      const patterns = keywordRaw.split('|').map(p => p.trim().toLowerCase()).filter(Boolean);
      return {
        patterns: patterns,
        raw: keywordRaw,
        vi: matchDict(r[1], wallets) || String(r[1] || '').trim(),
        danh_muc_con: matchDict(r[2], categories) || String(r[2] || '').trim(),
        doi_tuong: matchDict(r[3], users) || String(r[3] || '').trim(),
        ghi_chu: String(r[4] || '').trim()
      };
    }).filter(a => a.patterns.length > 0);
  } catch (e) {
    return [];
  }
}

function matchAlias_(text, aliases) {
  if (!text || !aliases || !aliases.length) return null;
  const t = String(text).trim().toLowerCase();
  if (!t) return null;
  for (let i = 0; i < aliases.length; i++) {
    const alias = aliases[i];
    for (let j = 0; j < alias.patterns.length; j++) {
      if (t.indexOf(alias.patterns[j]) !== -1) return alias;
    }
  }
  return null;
}

function getLiveData() {
  const cacheKey = "CACHED_LIVE_DATA_V2";
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  let result = { wallets: [], categories: [], users: [], aliases: [], history: [], lessons: [], lessonsText: [] };
  try {
    const wallets = ss.getRangeByName("Wallet").getValues().map(row => row[0]).filter(String);    
    const users = ss.getRangeByName("userr").getValues().map(row => row[0]).filter(String);       
    const categories = ss.getRangeByName("Category").getValues().map(row => row[1]).filter(String); 
    const aliases = getAliasRows_(ss, wallets, categories, users);
    
    let history = [];
    const logRange = ss.getRangeByName("Log");
    
    if (logRange) {
      const logSheet = logRange.getSheet();
      const startRow = logRange.getRow();
      const startCol = logRange.getColumn();
      const totalRows = logRange.getNumRows();

      const fetchRows = Math.min(100, totalRows); 
      
      if (fetchRows > 0) {
        const fetchStartRow = startRow + totalRows - fetchRows;
        let rawData = logSheet.getRange(fetchStartRow, startCol, fetchRows, 10).getValues();
        rawData.reverse();
        history = rawData
          .filter(row => row[LOG_COL.SO_TIEN] !== "" && row[LOG_COL.STATUS] !== "CHECK")
          .slice(0, 20) 
          .map(row => `${row[LOG_COL.VI]} | ${row[LOG_COL.DOI_TUONG]} | ${row[LOG_COL.DANH_MUC_CON]} | ${row[LOG_COL.PHAN_LOAI]}`);
      }
    }
    const lessons = getAiLessons();
    const lessonsText = lessons.map(function (L) {
      return L.field + ": \"" + L.ai_guess + "\" → \"" + L.user_fix + "\"" +
        (L.context ? (" | ctx: " + L.context.slice(0, 80)) : "") +
        " (×" + L.count + ")";
    });
    result = { wallets, categories, users, aliases, history, lessons, lessonsText };
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 60); // Cache TTL 60s
  } catch (e) {}
  return result;
}

// ==========================================
// 🛠️ PHẦN 7: CÁC TIỆN ÍCH HỖ TRỢ & HELPER CHUNG (Mục 10)
// ==========================================

function getParsedAiKeys_() {
  let props = PropertiesService.getScriptProperties();
  let keysRaw = props.getProperty('ai_keys');
  let keysArr = [];
  if (keysRaw) {
    try {
      keysArr = JSON.parse(keysRaw);
      if (!Array.isArray(keysArr)) keysArr = [keysArr];
    } catch (e) {
      if (keysRaw.startsWith('AIza')) keysArr = [keysRaw.trim()];
    }
  }
  return keysArr.filter(function (k) { return k && String(k).trim() !== ''; });
}

function callTelegramApi_(method, payloadObj) {
  const token = PROP.getProperty('bot_token');
  const res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payloadObj),
    muteHttpExceptions: true
  });
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, description: res.getContentText() };
  }
}

function findRowIndexByUniqueKey_(sheet, startRow, startCol, numRows, uniqueKey) {
  if (!sheet || numRows <= 0) return -1;
  const idData = sheet.getRange(startRow, startCol + LOG_COL.UNIQUE_KEY, numRows, 1).getValues();
  for (let i = 0; i < idData.length; i++) {
    if (idData[i][0] && String(idData[i][0]) === String(uniqueKey)) return startRow + i;
  }
  return -1;
}

function returnMsg(chatId, text) {
  if (chatId) sendMessage(chatId, text);
  return text;
}

function sendMessage(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const result = callTelegramApi_("sendMessage", payload);
  return result && result.result ? result.result.message_id : null;
}

function deleteMessage(chatId, messageId) {
  if (!messageId) return;
  callTelegramApi_("deleteMessage", { chat_id: chatId, message_id: messageId });
}

function editMessage(chatId, messageId, text, replyMarkup) {
  if (!messageId) return;
  const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  callTelegramApi_("editMessageText", payload);
}

function formatMoney(amount, showSign) {
  if (!amount && amount !== 0) return "0 ₫";
  const num = Number(amount) || 0;
  const abs = Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₫";
  if (num < 0) {
    return "−" + abs;
  }
  if (showSign && num > 0) {
    return "+" + abs;
  }
  return abs;
}

function guessMimeFromPath(filePath) {
  const p = String(filePath || "").toLowerCase();
  if (/\.og[ga]$/.test(p)) return "audio/ogg";
  if (/\.mp3$/.test(p)) return "audio/mpeg";
  if (/\.wav$/.test(p)) return "audio/wav";
  if (/\.m4a$/.test(p)) return "audio/mp4";
  if (/\.jpe?g$/.test(p)) return "image/jpeg";
  if (/\.png$/.test(p)) return "image/png";
  if (/\.webp$/.test(p)) return "image/webp";
  return "application/octet-stream";
}

/** Tải file Telegram → { base64, mimeType } hoặc { error } */
function getTelegramFileBase64(fileId) {
  try {
    const token = PROP.getProperty('bot_token');
    const fileRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + fileId, { muteHttpExceptions: true });
    const fileData = JSON.parse(fileRes.getContentText());
    if (!fileData.ok) return { error: fileData.description || "Lỗi getFile từ Telegram." };
    const filePath = fileData.result.file_path;
    const bin = UrlFetchApp.fetch("https://api.telegram.org/file/bot" + token + "/" + filePath, { muteHttpExceptions: true });
    return {
      base64: Utilities.base64Encode(bin.getBlob().getBytes()),
      mimeType: guessMimeFromPath(filePath)
    };
  } catch (e) {
    return { error: e.message };
  }
}

function getTelegramImageBase64(fileId) {
  const res = getTelegramFileBase64(fileId);
  if (res.error) return { error: res.error };
  return res.base64;
}

/** Voice → chữ (Gemini multimodal) */
function transcribeVoiceGemini(base64Audio, mimeType) {
  const keys = getShuffledKeys();
  if (!keys.length) return { error: "Chưa cấu hình API Key." };
  const model = PROP.getProperty('ai_model') || 'gemini-2.5-flash';
  const prompt = "Đây là tin nhắn thoại tiếng Việt. Hãy chép lại đúng nội dung lời nói. Chỉ trả về chữ đã nghe, không giải thích, không thêm dấu ngoặc.";
  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType || "audio/ogg", data: base64Audio } },
        { text: prompt }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  };
  let lastError = "";
  for (let i = 0; i < keys.length; i++) {
    try {
      const response = UrlFetchApp.fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + keys[i],
        { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      const data = JSON.parse(response.getContentText());
      if (data.error) { lastError = data.error.message || "Unknown error"; continue; }
      if (!data.candidates || !data.candidates.length) {
        lastError = "AI không trả lời được voice.";
        continue;
      }
      const parts = (data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.map(function (p) { return p.text || ""; }).join("").trim();
      if (!text) { lastError = "Transcript trống."; continue; }
      return { text: text };
    } catch (e) {
      lastError = e.message;
    }
  }
  return { error: lastError || "Transcribe thất bại." };
}

// ==========================================
// 📊 PHẦN BÁO CÁO (Bao Cao v2 — Script tính, không công thức)
// ==========================================
function parseLogDate(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const s = String(val == null ? "" : val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function emptyBaoBucket() {
  return { thu: 0, chi: 0, check: 0 };
}

function addToBaoBucket(bucket, soTien, isCheck) {
  // Giao dịch CHECK chưa ghi nhận → không tính vào Thu/Chi/Lợi nhuận
  if (isCheck) {
    bucket.check += soTien;
    return;
  }
  if (soTien > 0) bucket.thu += soTien;
  else if (soTien < 0) bucket.chi += soTien;
}

/** Đọc Log 1 lần → ghi Bao Cao v2!A2:E5 (D=B+C). Menu + /report. */
function rebuildBaoCao() {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    const busy = "Hệ thống bận, thử lại sau 15s.";
    try { SpreadsheetApp.getUi().alert("BÁO CÁO", busy, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
    return busy;
  }

  try {
    const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
    const logRange = ss.getRangeByName("Log");
    if (!logRange) {
      const err = "Không tìm thấy Named Range 'Log'";
      try { SpreadsheetApp.getUi().alert("BÁO CÁO", err, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
      return err;
    }

    const values = logRange.getValues();
    const tz = "GMT+7";
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, "dd/MM/yyyy");

    const months = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: Utilities.formatDate(d, tz, "yyyy-MM"),
        label: Utilities.formatDate(d, tz, "MM/yyyy")
      });
    }

    const todayBucket = emptyBaoBucket();
    const byMonth = {};
    months.forEach(function (m) { byMonth[m.key] = emptyBaoBucket(); });

    for (let r = 0; r < values.length; r++) {
      const row = values[r];
      const ngay = parseLogDate(row[LOG_COL.NGAY]);
      if (!ngay) continue;
      const soTien = Number(row[LOG_COL.SO_TIEN]);
      if (!soTien || isNaN(soTien)) continue;
      const status = String(row[LOG_COL.STATUS] == null ? "" : row[LOG_COL.STATUS]).trim().toUpperCase();
      const isCheck = status.indexOf("CHECK") >= 0;
      const ngayStr = Utilities.formatDate(ngay, tz, "dd/MM/yyyy");
      const mKey = Utilities.formatDate(ngay, tz, "yyyy-MM");

      if (ngayStr === todayStr) addToBaoBucket(todayBucket, soTien, isCheck);
      if (byMonth[mKey]) addToBaoBucket(byMonth[mKey], soTien, isCheck);
    }

    function rowOf(label, b) {
      return [label, b.thu, b.chi, b.thu + b.chi, b.check];
    }

    const out = [
      rowOf(todayStr, todayBucket),
      rowOf(months[0].label, byMonth[months[0].key]),
      rowOf(months[1].label, byMonth[months[1].key]),
      rowOf(months[2].label, byMonth[months[2].key])
    ];

    let sheet = ss.getSheetByName(BAO_CAO_SHEET);
    if (!sheet) sheet = ss.insertSheet(BAO_CAO_SHEET);
    sheet.getRange("A1:E1").setValues([["Kỳ", "Thu", "Chi", "Lợi nhuận", "CHECK chưa ghi nhận"]]);
    sheet.getRange("A2:E5").setValues(out);

    // Format động theo vùng dữ liệu hiện có
    const lastRow = sheet.getLastRow();
    const dataRange = sheet.getRange("A1:E" + lastRow);

    // Font chung (chỉ áp cho vùng dữ liệu)
    dataRange.setFontFamily("Arial")
             .setFontSize(10)
             .setVerticalAlignment("middle");

    // Header
    const headerRange = sheet.getRange("A1:E1");
    headerRange.setFontWeight("bold")
               .setFontColor("#ffffff")
               .setBackground("#1a73e8")
               .setHorizontalAlignment("center")
               .setFontSize(11);

    // Dòng dữ liệu: chỉ format số cho B:E, cột Kỳ giữ nguyên text
    sheet.getRange("B2:E" + lastRow).setNumberFormat('#,##0;[Red]-#,##0;0');
    sheet.getRange("A2:A" + lastRow).setNumberFormat('@');
    sheet.getRange("A2:A" + lastRow).setHorizontalAlignment("center");
    sheet.getRange("B2:E" + lastRow).setHorizontalAlignment("right");

    // Highlight dòng Hôm nay (luôn là hàng 2)
    sheet.getRange("A2:E2").setBackground("#fef7e0");
    if (lastRow > 2) sheet.getRange("A3:E" + lastRow).setBackground("#ffffff");

    // Border
    dataRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
    headerRange.setBorder(true, true, true, true, true, true, "#1a73e8", SpreadsheetApp.BorderStyle.SOLID);

    // Chỉ set row height cho vùng header, không can thiệp layout
    sheet.setRowHeight(1, 32);

    SpreadsheetApp.flush();

    const ok = "Đã cập nhật " + BAO_CAO_SHEET + " (hôm nay + 3 tháng).";
    try { SpreadsheetApp.getUi().alert("BÁO CÁO", ok, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
    return ok;
  } catch (err) {
    const msg = "Lỗi rebuildBaoCao: " + (err && err.message ? err.message : err);
    try { SpreadsheetApp.getUi().alert("BÁO CÁO", msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
    return msg;
  } finally {
    lock.releaseLock();
  }
}

function readBaoCaoV2Block() {
  const ss = SpreadsheetApp.openById(PROP.getProperty('spreadsheet_id'));
  const sheet = ss.getSheetByName(BAO_CAO_SHEET);
  if (!sheet) return null;
  return sheet.getRange("A2:E5").getValues();
}

function formatReportMonthLabel(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, "GMT+7", "MM/yyyy");
  }
  const s = String(val == null ? "" : val).trim();
  if (s.indexOf("GMT") >= 0 || s.indexOf("Indochina") >= 0) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, "GMT+7", "MM/yyyy");
    } catch (e) {}
  }
  return s;
}

/** Ô bảng monospace: nhãn căn trái, số căn phải (dùng cho tin Telegram). */
function baoCaoCell(label, value, labelW, valueW) {
  let l = String(label);
  while (l.length < labelW) l += " ";
  let v = String(value);
  while (v.length < valueW) v = " " + v;
  return "<code>" + l + v + "</code>";
}

/** Khối Thu / Chi / Lợi nhuận dùng chung cho báo cáo Hôm nay & Tháng này. */
function buildBaoCaoDetail(thu, chi, loiNhuan, chuaGhiNhan) {
  let text = "<blockquote>" +
             "📥 " + baoCaoCell("Thu nhập", formatMoney(thu, true), 11, 15) + "\n" +
             "📤 " + baoCaoCell("Chi tiêu", "−" + formatMoney(chi), 11, 15) + "\n" +
             "──────────────────\n" +
             "💰 " + baoCaoCell("Lợi nhuận", formatMoney(loiNhuan, true), 11, 15) +
             "</blockquote>";

  if (chuaGhiNhan !== 0) {
    text += "\n⏳ <i>Chưa ghi nhận: <b>" + formatMoney(chuaGhiNhan, true) + "</b></i>";
  }
  return text;
}

function sendTodayReport(chatId) {
  const block = readBaoCaoV2Block();
  if (!block) {
    sendMessage(chatId, "❌ Chưa có sheet <b>" + BAO_CAO_SHEET + "</b>. Chạy menu 📊 Báo cáo hoặc /report.");
    return;
  }
  const row = block[0];
  const thu = Math.abs(Number(row[1]) || 0);
  const chi = Math.abs(Number(row[2]) || 0);
  const loiNhuan = Number(row[3]) || 0;
  const chuaGhiNhan = Number(row[4]) || 0;
  const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  const text = "📊 <b>BÁO CÁO THU CHI HÔM NAY</b>\n" +
               "🗓 <i>" + now + "</i>\n\n" +
               buildBaoCaoDetail(thu, chi, loiNhuan, chuaGhiNhan);

  // Nút xem Tháng này / 3 tháng dưới tin hôm nay
  sendMessage(chatId, text, {
    inline_keyboard: [[
      { text: "📆 Tháng này", callback_data: "REPORT_MONTH" },
      { text: "📅 3 tháng gần nhất", callback_data: "REPORT_3MONTH" }
    ]]
  });
}

function sendMonthReport(chatId, replyMarkup) {
  const block = readBaoCaoV2Block();
  if (!block) {
    sendMessage(chatId, "❌ Chưa có sheet <b>" + BAO_CAO_SHEET + "</b>. Chạy menu 📊 Báo cáo hoặc /report.", replyMarkup);
    return;
  }
  const row = block[1];
  const thangLabel = formatReportMonthLabel(row[0]);
  const thu = Math.abs(Number(row[1]) || 0);
  const chi = Math.abs(Number(row[2]) || 0);
  const loiNhuan = Number(row[3]) || 0;
  const chuaGhiNhan = Number(row[4]) || 0;

  const text = "📊 <b>BÁO CÁO THÁNG " + thangLabel + "</b>\n\n" +
               buildBaoCaoDetail(thu, chi, loiNhuan, chuaGhiNhan);

  sendMessage(chatId, text, replyMarkup);
}

function send3MonthReport(chatId, replyMarkup) {
  const block = readBaoCaoV2Block();
  if (!block) {
    sendMessage(chatId, "❌ Chưa có sheet <b>" + BAO_CAO_SHEET + "</b>. Chạy menu 📊 Báo cáo hoặc /report.", replyMarkup);
    return;
  }

  let tong = 0;
  let tongChua = 0;
  let rows = "";

  for (let i = 1; i <= 3; i++) {
    const row = block[i];
    if (!row || !row[0]) continue;
    const thangLabel = formatReportMonthLabel(row[0]);
    const loiNhuan = Number(row[3]) || 0;
    tongChua += Number(row[4]) || 0;

    rows += baoCaoCell(thangLabel, formatMoney(loiNhuan, true), 8, 15) + "\n";
    tong += loiNhuan;
  }

  let text = "📈 <b>LỢI NHUẬN 3 THÁNG GẦN NHẤT</b>\n\n" +
             "<blockquote>" +
             rows +
             "──────────────────\n" +
             "💰 " + baoCaoCell("Tổng cộng", formatMoney(tong, true), 8, 15) +
             "</blockquote>";

  if (tongChua !== 0) {
    text += "\n⏳ <i>Chưa ghi nhận: <b>" + formatMoney(tongChua, true) + "</b></i>";
  }

  sendMessage(chatId, text, replyMarkup);
}
