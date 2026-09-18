// ============================================================================
// 🧠 2_GEMINIAI.GS — GEMINI AI PARSER & DATA NORMALIZATION
// ============================================================================

const LIVE_DATA_CACHE_KEY_ = "CACHED_LIVE_DATA_V3";

function getShuffledKeys() {
  const raw = PROP.getProperty('ai_keys');
  let keys = [];
  try { keys = JSON.parse(raw || '[]'); } catch(e) { keys = []; }
  // Xáo trộn ngẫu nhiên để cân bằng tải
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

/**
 * Gọi Gemini generateContent, xoay vòng API key.
 * @param {Object} payload - body request
 * @param {function(string):*=} mapText - nhận text phản hồi; trả null để thử key tiếp
 * @returns {{ text: string }|{ value: * }|{ error: string }}
 */
function callGeminiWithKeys_(payload, mapText) {
  const keys = getShuffledKeys();
  if (!keys.length) return { error: "Chưa cấu hình API Key Gemini trong hệ thống." };

  const model = PROP.getProperty('ai_model') || 'gemini-2.5-flash';
  let lastError = "";

  for (let i = 0; i < keys.length; i++) {
    try {
      const res = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`,
        {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        }
      );
      const data = JSON.parse(res.getContentText());
      if (data.error) {
        lastError = data.error.message || String(data.error);
        continue;
      }
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.map(function (p) { return p.text || ""; }).join("");
      if (!text) {
        lastError = "Gemini không trả về nội dung.";
        continue;
      }
      if (typeof mapText === "function") {
        try {
          const mapped = mapText(text);
          if (mapped == null) {
            lastError = "Không parse được phản hồi Gemini.";
            continue;
          }
          return { value: mapped };
        } catch (eMap) {
          lastError = eMap.message;
          continue;
        }
      }
      return { text: text };
    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  return { error: lastError || "Không thể kết nối Gemini API." };
}

function callGeminiAPI(text, base64Image, liveData) {
  const systemPrompt = PROP.getProperty('ai_prompt') || 'Bạn là trợ lý kế toán bóc tách thu chi cá nhân.';
  const ownerNames = PROP.getProperty('owner_names') || '';

  const hardRules = `QUY ƯỚC TIỀN TỆ:
- k = nghìn (x1.000), m/tr = triệu (x1.000.000), t/tỷ = tỷ.

QUY TẮC THU/CHI (Đặc biệt với Bill ngân hàng):
- Chủ tài khoản: ${ownerNames || '(Chưa cấu hình)'}.
- Chủ TK chuyển tiền đi / thanh toán / mua sắm -> CHI.
- Người khác chuyển tiền tới cho Chủ TK -> THU.
- Nếu không có bất kỳ dấu hiệu nào rõ ràng -> Phân loại là "Không rõ".`;

  const aliasList = (liveData.aliases || []).map(a => 
    `"${a.raw}" -> Ví: "${a.vi}", Danh mục: "${a.danh_muc_con}", Đối tượng: "${a.doi_tuong}", Note: "${a.ghi_chu}"`
  );

  const dynamicPrompt = `${systemPrompt}\n\n${hardRules}\n\nNội dung: "${text}"\n
* SỔ TAY TỪ ĐIỂN:
- Danh sách Ví: [${liveData.wallets.join(', ')}]
- Danh sách Đối tượng: [${liveData.users.join(', ')}]
- Danh sách Danh mục: [${liveData.categories.join(', ')}]

* TỪ KHÓA VIẾT TẮT (ALIAS):
[ ${aliasList.length ? aliasList.join(' ]\n[ ') : '(Chưa có)'} ]

* BÀI HỌC TỪ SỬA TAY:
[ ${(liveData.lessons || []).join(' ]\n[ ')} ]

YÊU CẦU:
1. Bóc tách toàn bộ giao dịch trong tin nhắn/ảnh. Nếu không có ngày, ghi "Hôm nay".
2. Khớp đúng tên trong SỔ TAY. Nếu không khớp, ghi "Chưa phân loại".
3. Trả về định dạng JSON DUY NHẤT theo schema:
{
  "giao_dich": [
    {
      "ngay_gd": "dd/MM/yyyy",
      "phan_loai": "Thu/Chi/Không rõ",
      "so_tien": 150000,
      "vi": "...",
      "doi_tuong": "...",
      "danh_muc_con": "...",
      "ghi_chu": "..."
    }
  ]
}`;

  const payload = {
    contents: [{
      parts: [
        ...(base64Image ? [{ inlineData: { mimeType: "image/jpeg", data: base64Image } }] : []),
        { text: dynamicPrompt }
      ]
    }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const res = callGeminiWithKeys_(payload, function (rawText) {
    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed) ? { giao_dich: parsed } : parsed;
  });
  if (res.error) return { error: `Không thể kết nối Gemini API. Chi tiết: ${res.error}` };
  return res.value;
}

/** Chuyển đổi giọng nói thành văn bản */
function transcribeVoiceGemini(base64Audio, mimeType) {
  const keys = getShuffledKeys();
  if (!keys.length) return { error: "Chưa cấu hình API Key." };

  const model = PROP.getProperty('ai_model') || 'gemini-2.5-flash';
  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType || "audio/ogg", data: base64Audio } },
        { text: "Hãy nghe và gõ lại chính xác nội dung tiếng Việt trong đoạn ghi âm này. Chỉ trả về nội dung text thuần túy." }
      ]
    }]
  };

  for (let i = 0; i < keys.length; i++) {
    try {
      const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const data = JSON.parse(res.getContentText());
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        return { text: data.candidates[0].content.parts[0].text.trim() };
      }
    } catch (e) {
      continue;
    }
  }
  return { error: "Lỗi nhận dạng giọng nói." };
}

/** Khớp giá trị với sổ tay (không phân biệt hoa thường). Trả tên chuẩn hoặc null. */
function matchDict(val, list) {
  if (!val || !list || !list.length) return null;
  const t = String(val).trim().toLowerCase();
  if (!t || t === "chưa phân loại" || t === "khác") return null;
  for (let i = 0; i < list.length; i++) {
    if (String(list[i]).trim().toLowerCase() === t) return String(list[i]).trim();
  }
  return null;
}

/**
 * Ép về tên sổ tay; không khớp → "Chưa phân loại".
 * @returns {{ value: string, ok: boolean }}
 */
function resolveDictField_(rawVal, list) {
  const matched = matchDict(rawVal, list);
  if (matched) return { value: matched, ok: true };
  const raw = String(rawVal || "").trim();
  // Giữ giá trị user gõ (sửa tay / chỉ dùng lần này) — gắn CHECK thay vì đè "Chưa phân loại"
  if (raw) return { value: raw, ok: false };
  return { value: "Chưa phân loại", ok: false };
}

/**
 * Chọn giá trị chắc chắn nằm trong list dropdown (tránh vỡ Data Validation reject).
 * Ưu tiên: khớp preferred → "Chưa phân loại" → phần tử đầu list.
 */
function pickDictSafeValue_(preferred, list) {
  const matched = matchDict(preferred, list);
  if (matched) return matched;
  const unclassified = matchDict("Chưa phân loại", list);
  if (unclassified) return unclassified;
  if (list && list.length) return String(list[0]).trim();
  return "Chưa phân loại";
}

/**
 * Chuẩn hóa GD rồi ép Ví / Đối tượng / Danh mục về giá trị có trong sổ tay
 * (dùng cho ghi Sheet không tương tác: /scan, v.v.).
 */
function normalizeTransactionForSheetWrite(raw, liveData) {
  const norm = normalizeTransaction(raw, liveData);
  const wallets = (liveData && liveData.wallets) || [];
  const users = (liveData && liveData.users) || [];
  const categories = (liveData && liveData.categories) || [];
  norm.vi = pickDictSafeValue_(norm.vi, wallets);
  norm.doi_tuong = pickDictSafeValue_(norm.doi_tuong, users);
  norm.danh_muc_con = pickDictSafeValue_(norm.danh_muc_con, categories);
  return norm;
}

/** Chuẩn hóa và gắn cờ kiểm tra CHECK cho từng giao dịch */
function normalizeTransaction(raw, liveData) {
  let phanLoai = raw.phan_loai || "Chi";
  if (phanLoai !== "Thu" && phanLoai !== "Chi") phanLoai = "Chi";

  const amountSrc = (raw.so_tien_abs !== undefined && raw.so_tien_abs !== null && raw.so_tien_abs !== "")
    ? raw.so_tien_abs
    : raw.so_tien;
  let soTienAbs = Math.abs(Number(amountSrc) || 0);
  let soTien = phanLoai === "Chi" ? -soTienAbs : soTienAbs;

  let ngay = raw.ngay_gd || "";
  if (!ngay || ngay.toLowerCase() === "hôm nay") {
    ngay = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy');
  }

  const wallets = (liveData && liveData.wallets) || [];
  const users = (liveData && liveData.users) || [];
  const categories = (liveData && liveData.categories) || [];

  const viRes = resolveDictField_(raw.vi, wallets);
  const dtRes = resolveDictField_(raw.doi_tuong, users);
  const dmRes = resolveDictField_(raw.danh_muc_con, categories);

  const checkReasons = [];
  if (raw.phan_loai === "Không rõ") checkReasons.push("thu_chi");
  if (!viRes.ok) checkReasons.push("vi");
  if (!dtRes.ok) checkReasons.push("doi_tuong");
  if (!dmRes.ok) checkReasons.push("danh_muc");

  const status = checkReasons.length > 0 ? "CHECK:" + checkReasons.join(",") : "";

  return {
    ngay_gd: ngay,
    phan_loai: phanLoai,
    so_tien: soTien,
    so_tien_abs: soTienAbs,
    vi: viRes.value,
    doi_tuong: dtRes.value,
    danh_muc_con: dmRes.value,
    ghi_chu: raw.ghi_chu || "",
    status: status,
    pass: checkReasons.length === 0
  };
}

/**
 * Gom nhãn sổ tay từ mảng 2D (cột valueCol), bỏ trống / "Tổng" / trùng.
 * DV kiểu RANGE hoặc named range nhiều cột phải lấy đúng 1 cột tên.
 */
function uniqueNotebookLabels_(rows, valueCol) {
  const col = valueCol || 0;
  const out = [];
  const seen = {};
  (rows || []).forEach(function (row) {
    const cell = row && row[col];
    const v = String(cell == null ? '' : cell).trim();
    const key = v.toLowerCase();
    if (!v || v === 'Tổng' || seen[key]) return;
    seen[key] = true;
    out.push(v);
  });
  return out;
}

/**
 * Category = dải danh mục con.
 * 1 cột (B13:B…) → con ở index 0; 2+ cột (layout cũ A:B) → con ở index 1.
 */
function categoryNamedRangeLayout_(ss) {
  try {
    const range = ss ? ss.getRangeByName('Category') : null;
    if (!range) return { range: null, conCol: 0, isConOnly: true };
    const isConOnly = range.getNumColumns() < 2;
    return { range: range, conCol: isConOnly ? 0 : 1, isConOnly: isConOnly };
  } catch (e) {
    return { range: null, conCol: 0, isConOnly: true };
  }
}

/** Đọc named range sổ tay: Wallet / userr / Category (cột valueCol). */
function notebookListFromNamedRange_(ss, rangeName, valueCol) {
  try {
    const range = ss.getRangeByName(rangeName);
    if (!range) return [];
    return uniqueNotebookLabels_(range.getValues(), valueCol);
  } catch (e) {
    return [];
  }
}

/**
 * Bóc list từ Data Validation.
 * VALUE_IN_LIST → mảng string; VALUE_IN_RANGE → Range (getCriteriaValues không ra mảng tên).
 */
function listFromDataValidation_(dv, valueCol) {
  if (!dv) return [];
  try {
    const raw = dv.getCriteriaValues()[0];
    if (!raw) return [];
    if (typeof raw.getValues === 'function') {
      return uniqueNotebookLabels_(raw.getValues(), valueCol);
    }
    if (Array.isArray(raw)) {
      const rows = raw.map(function (x) { return Array.isArray(x) ? x : [x]; });
      return uniqueNotebookLabels_(rows, valueCol);
    }
  } catch (e) {}
  return [];
}

/** Đọc danh bạ LiveData: named range Wallet / userr / Category là nguồn chính; DV Template_Log chỉ bổ sung khi range trống. */
function getLiveData() {
  const cacheKey = LIVE_DATA_CACHE_KEY_;
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  // Danh mục mặc định (fallback an toàn khi sheet chưa có sổ tay)
  let wallets = ["Cash", "Bank", "Credit"];
  let users = ["Bản thân", "Couple", "Gia đình", "Bạn bè", "Khách lẻ"];
  let categories = ["Ăn sáng", "Ăn trưa", "Ăn tối", "Cafe", "Xăng xe", "Mua sắm", "ADS", "Giải trí", "Điện nước"];

  try {
    const ss = getSpreadsheet_();
    const fromWallet = notebookListFromNamedRange_(ss, 'Wallet', 0);
    const fromUsers = notebookListFromNamedRange_(ss, 'userr', 0);
    const catLayout = categoryNamedRangeLayout_(ss);
    const fromCat = catLayout.range
      ? uniqueNotebookLabels_(catLayout.range.getValues(), catLayout.conCol)
      : [];
    if (fromWallet.length) wallets = fromWallet;
    if (fromUsers.length) users = fromUsers;
    if (fromCat.length) categories = fromCat;

    if (!fromWallet.length || !fromUsers.length || !fromCat.length) {
      const tplLog = getSheetByGid(GID.TEMPLATE_LOG);
      if (tplLog) {
        const validations = tplLog.getRange(3, 1, 1, 9).getDataValidations()[0];
        if (!fromWallet.length) {
          const dvW = listFromDataValidation_(validations[MONTH_LOG_COL.VI], 0);
          if (dvW.length) wallets = dvW;
        }
        if (!fromUsers.length) {
          const dvU = listFromDataValidation_(validations[MONTH_LOG_COL.DOI_TUONG], 0);
          if (dvU.length) users = dvU;
        }
        if (!fromCat.length) {
          const dvC = listFromDataValidation_(validations[MONTH_LOG_COL.DANH_MUC_CON], 0);
          if (dvC.length) categories = dvC;
        }
      }
    }
  } catch (e) {
    Logger.log("Lỗi khi đọc sổ tay LiveData: " + e.message);
  }

  // Đọc sheet Alias theo GID
  const aliases = [];
  try {
    const aliasSheet = getSheetByGid(GID.ALIAS);
    if (aliasSheet && aliasSheet.getLastRow() >= 2) {
      const rows = aliasSheet.getRange(2, 1, aliasSheet.getLastRow() - 1, 5).getValues();
      rows.forEach(r => {
        if (r[0]) {
          aliases.push({
            raw: String(r[0]),
            vi: String(r[1] || ''),
            danh_muc_con: String(r[2] || ''),
            doi_tuong: String(r[3] || ''),
            ghi_chu: String(r[4] || '')
          });
        }
      });
    }
  } catch (e) {}

  // Đọc bài học sửa tay AI_Learning theo GID
  const lessons = [];
  const lessonRows = [];
  try {
    const learnSheet = getSheetByGid(GID.AI_LEARNING);
    if (learnSheet && learnSheet.getLastRow() >= 2) {
      const rows = learnSheet.getRange(2, 1, Math.min(learnSheet.getLastRow() - 1, 30), 7).getValues();
      rows.forEach(r => {
        if (r[2]) {
          const field = String(r[2]);
          const aiGuess = String(r[3] || "");
          const userFix = String(r[4] || "");
          lessons.push(`${field}: AI đoán "${aiGuess}" -> User sửa "${userFix}"`);
          lessonRows.push({ field: field, ai_guess: aiGuess, user_fix: userFix });
        }
      });
    }
  } catch (e) {}

  const result = { wallets, users, categories, aliases, lessons, lessonRows };

  // Cache 60 giây để giảm tải gọi SpreadsheetApp
  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 60);
  } catch (e) {}

  return result;
}

function invalidateLiveDataCache_() {
  try { CacheService.getScriptCache().remove(LIVE_DATA_CACHE_KEY_); } catch (e) {}
}

/** Ghi vết sửa ví / đối tượng / danh mục lên AI_Learning (không đổi header) */
function recordUserEditLessons_(sourceText, before, after) {
  if (!before || !after) return;
  const fields = [
    { key: "vi", label: "vi" },
    { key: "doi_tuong", label: "doi_tuong" },
    { key: "danh_muc_con", label: "danh_muc_con" }
  ];
  fields.forEach(function (f) {
    const oldVal = String(before[f.key] || "").trim();
    const newVal = String(after[f.key] || "").trim();
    if (!newVal || oldVal === newVal) return;
    appendAiLearningRow_(sourceText, f.label, oldVal, newVal);
  });
}

function appendAiLearningRow_(sourceText, field, aiGuess, userFix) {
  try {
    const sheet = getSheetByGid(GID.AI_LEARNING);
    if (!sheet) return;
    const now = new Date();
    const src = String(sourceText || "").slice(0, 200);
    const ctx = "";
    if (sheet.getLastRow() >= 2) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
      for (let r = 0; r < data.length; r++) {
        if (String(data[r][2]) === field && String(data[r][3]) === String(aiGuess) && String(data[r][4]) === String(userFix)) {
          const cnt = Number(data[r][6]) || 1;
          sheet.getRange(r + 2, 7).setValue(cnt + 1);
          sheet.getRange(r + 2, 1).setValue(now);
          invalidateLiveDataCache_();
          return;
        }
      }
    }
    sheet.appendRow([now, src, field, aiGuess, userFix, ctx, 1]);
    invalidateLiveDataCache_();
  } catch (e) { /* không chặn luồng Tele */ }
}
