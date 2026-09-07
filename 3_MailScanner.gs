// ============================================================================
// 📧 3_MAILSCANNER.GS — QUÉT & BÓC TÁCH GMAIL TỰ ĐỘNG (HOÁ ĐƠN ADS / BANK)
// ============================================================================

/** Kích hoạt quét mail từ menu trên Google Sheet */
function triggerScanMailUI() {
  const result = scanMail(null);
  SpreadsheetApp.getUi().alert("KẾT QUẢ QUÉT MAIL", result || "Hoàn tất quét mail.", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Quét Gmail theo bộ Rule trong tab 'Quet Mail'
 * @param {string|number|null} chatId Telegram Chat ID nếu gọi từ Bot, null nếu gọi từ Menu Sheet
 */
function scanMail(chatId) {
  const mailSheet = getSheetByGid(GID.QUET_MAIL);
  if (!mailSheet || mailSheet.getLastRow() < 2) {
    const msg = "⚠️ Không tìm thấy sheet 'Quet Mail' hoặc chưa cấu hình quy tắc.";
    if (chatId) sendMessage(chatId, msg);
    return msg;
  }

  // Đọc danh sách Rules từ sheet Quet Mail:
  // [A: Chủ Đề Mail (Keyword/ID TK), B: Ghi chú sẽ điền, C: Nguồn tiền, D: Đối tượng, E: Danh Mục Con]
  const lastRuleRow = mailSheet.getLastRow();
  const rules = mailSheet.getRange(2, 1, lastRuleRow - 1, 5).getValues().filter(r => r[0] && String(r[0]).trim());
  if (!rules.length) {
    const msg = "❌ Tab 'Quet Mail' chưa có rule nào.";
    if (chatId) sendMessage(chatId, msg);
    return msg;
  }

  // 1. Bộ lọc ngày Gmail + cache chống trùng lazy theo tháng (đụng tháng nào mới nạp tháng đó)
  const dateFilter = buildGmailDateFilter_();
  const monthKeyCache = {}; // { 'MM_yyyy': Set<uniqueKey> }
  let count = 0;
  let aiUsed = 0;
  const logMsgs = [];
  const batchData = [];

  // 2. Duyệt từng Rule để quét chính xác theo Keyword/ID TK
  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r];
    const keyword = String(rule[0]).trim();
    const defaultNote = String(rule[1] || '').trim();
    const wallet = String(rule[2] || 'Bank').trim();
    const user = String(rule[3] || 'Bản thân').trim();
    const subCat = String(rule[4] || 'ADS').trim();

    const query = `${dateFilter.queryPart} "${keyword}"`;
    let threads = [];
    try {
      threads = GmailApp.search(query);
    } catch (e) {
      Logger.log(`Lỗi search Gmail query [${query}]: ` + e.message);
      continue;
    }

    for (let t = 0; t < threads.length; t++) {
      const messages = threads[t].getMessages();
      for (let m = 0; m < messages.length; m++) {
        const msg = messages[m];
        const body = msg.getPlainBody() || "";
        const subject = msg.getSubject() || "";
        const fullText = subject + "\n" + body;
        let dateObj = msg.getDate();

        // 3.1. Bóc tách số tiền qua Regex
        const amountMatch = fullText.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:VND|VNĐ|đ|₫)/i);
        let amount = null;
        let uniqueKey = null;
        let paymentMethod = null;
        let fromAi = false;

        if (amountMatch) {
          amount = parseInt(amountMatch[1].replace(/[.,]/g, ''), 10);
          
          // Trích xuất Mã giao dịch / Số tham chiếu (hỗ trợ full chuỗi kể cả dấu gạch ngang/dưới)
          uniqueKey = extractTransactionReference_(fullText);
          if (!uniqueKey) {
            uniqueKey = `${Utilities.formatDate(dateObj, "GMT+7", "yyyyMMdd")}_${wallet}_${amount}`;
          }

          // Trích xuất Phương thức thanh toán từ mail (Visa, MasterCard, MoMo...)
          paymentMethod = extractPaymentMethodFromMail_(fullText);
        } else {
          // 3.2. Fallback sang Gemini AI khi Regex không bắt được số tiền
          if (aiUsed < AI_MAIL_MAX_CALLS) {
            const extracted = extractMailWithGeminiFallback_(fullText, wallet);
            aiUsed++;
            if (extracted && extracted.so_tien > 0) {
              amount = extracted.so_tien;
              uniqueKey = extracted.ma_giao_dich;
              if (extracted.phuong_thuc) paymentMethod = extracted.phuong_thuc;
              if (extracted.ngay_gd && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(extracted.ngay_gd)) {
                const p = extracted.ngay_gd.split("/");
                dateObj = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
              }
              fromAi = true;
            }
          }
        }

        // Bỏ qua nếu không có số tiền hoặc không có mã định danh
        if (!amount || amount <= 0 || !uniqueKey) continue;
        uniqueKey = String(uniqueKey).trim();

        // 3. Chống trùng theo đúng sheet tháng của ngày GD (lazy load)
        const dateStr = Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");
        const monthKey = getMonthKeyFromDate(dateObj);
        const monthKeys = ensureMonthUniqueKeys_(monthKeyCache, monthKey);
        if (monthKeys.has(uniqueKey)) continue;

        // Ưu tiên Ghi chú: Lấy Phương thức thanh toán từ mail, nếu không có lấy Cột B tab Quet Mail
        const finalNote = paymentMethod || defaultNote || subject || "Hóa đơn Ads";

        const gd = {
          ngay_gd: dateStr,
          phan_loai: "Chi",
          so_tien: -amount,
          so_tien_abs: amount,
          vi: wallet || "Bank",
          doi_tuong: user || "Bản thân",
          danh_muc_con: subCat || "ADS",
          ghi_chu: finalNote,
          status: ""
        };

        batchData.push({ data: gd, uniqueKey: uniqueKey });
        monthKeys.add(uniqueKey); // chặn trùng trong cùng lần quét
        count++;

        const moneyDisplay = formatMoney ? formatMoney(amount) : (amount.toLocaleString('vi-VN') + " đ");
        logMsgs.push(`▪️ ${moneyDisplay} (${wallet}) - ${finalNote}${fromAi ? " [AI]" : ""}`);
      }
    }
  }

  // 4. Chuẩn hóa sổ tay + ép giá trị hợp lệ DV, rồi ghi batch Log_MM_YYYY
  if (batchData.length > 0) {
    const liveData = getLiveData();
    for (let i = 0; i < batchData.length; i++) {
      batchData[i].data = normalizeTransactionForSheetWrite(batchData[i].data, liveData);
    }
    const saveRes = saveBatchToMonthShards(batchData);
    if (saveRes !== true) {
      const err = `❌ <b>Lỗi khi ghi dữ liệu:</b> ${saveRes}`;
      if (chatId) sendMessage(chatId, err);
      return err;
    }
  }

  // 5. Tổng kết và gửi thông báo
  const aiNote = aiUsed > 0 ? ` (AI xử lý ${aiUsed} mail)` : "";
  const finalStr = (count > 0 || logMsgs.length > 0)
    ? `✅ <b>QUÉT XONG! Thêm ${count} GD từ Mail</b> (${dateFilter.label})${aiNote}:\n${logMsgs.join("\n")}`
    : `✅ <b>QUÉT XONG!</b> Không có hóa đơn mới nào khớp Keyword trong ${dateFilter.label}.${aiNote}`;

  if (chatId) sendMessage(chatId, finalStr);
  return finalStr;
}

// ============================================================================
// 🔍 CÁC HÀM TRÍCH XUẤT NỘI DUNG (REGEX & LOGIC BÓC TÁCH)
// ============================================================================

/**
 * Trích xuất Mã số tham chiếu / Mã giao dịch / ID (Bắt full kể cả dấu - hoặc _)
 * @param {string} text Toàn bộ nội dung mail
 * @return {string|null} Mã sạch hoặc null
 */
function extractTransactionReference_(text) {
  if (!text) return null;

  // Pattern 1: Bắt sau các từ khóa định danh giao dịch phổ biến
  const patterns = [
    /(?:Mã số tham chiếu|Mã tham chiếu|Số tham chiếu|Mã giao dịch|ID giao dịch|Transaction ID|Reference ID|Reference|Ref ID|FT)[\s:.\n]*([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+|[A-Za-z0-9-_]{6,})/i,
    /(?:Mã số tham chiếu|Mã tham chiếu|Số tham chiếu|Mã giao dịch|ID giao dịch|Transaction ID|Reference ID|Reference|Ref ID|FT)[\s:.\n]*([^\s\r\n,;]+)/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) {
      let code = match[1].trim();
      // Làm sạch dấu chấm, phẩy hoặc ngoặc dính ở đuôi
      code = code.replace(/[.,;:()]+$/, '').trim();
      if (code.length >= 4) return code;
    }
  }
  return null;
}

/**
 * Trích xuất Phương thức thanh toán từ nội dung mail (Visa, Mastercard, Momo...)
 * @param {string} text Toàn bộ nội dung mail
 * @return {string|null}
 */
function extractPaymentMethodFromMail_(text) {
  if (!text) return null;

  // Tìm cụm "Phương thức thanh toán:" hoặc "Payment method:"
  const paymentMatch = text.match(/(?:Phương thức thanh toán|Payment method|Hình thức thanh toán)[\s\n:]*([^\n\r]+)/i);
  if (paymentMatch && paymentMatch[1]) {
    let raw = paymentMatch[1].trim();
    // Cắt bỏ phần mã tham chiếu hoặc ký tự thừa nếu dính cùng dòng
    raw = raw.replace(/\s*(?:Số tham chiếu|Mã tham chiếu|Mã số tham chiếu|Tham chiếu|ID giao dịch|Mã giao dịch|Reference).*$/i, '').trim();
    raw = raw.replace(/[.,;]+$/, '').trim();
    if (raw) return raw;
  }

  // Bắt nhanh các loại thẻ nếu có định dạng "Visa · 1234" hoặc "Mastercard **** 5678"
  const cardMatch = text.match(/\b(Visa|MasterCard|JCB|American Express|MoMo|ShopeePay|ZaloPay)[\s·*•-]*(\d{4})?\b/i);
  if (cardMatch) {
    return cardMatch[0].trim();
  }

  return null;
}

/**
 * Lazy-load UNIQUE_KEY của 1 sheet Log tháng vào cache (chỉ nạp 1 lần / tháng / lần quét).
 * Mail ngày nào → chỉ đối chiếu Log_MM_YYYY của tháng đó.
 * @param {Object} cache map monthKey -> Set
 * @param {string} monthKey MM_yyyy
 * @return {Set<string>}
 */
function ensureMonthUniqueKeys_(cache, monthKey) {
  if (cache[monthKey]) return cache[monthKey];

  const set = new Set();
  try {
    const ss = getSpreadsheet_();
    const sh = ss.getSheetByName(monthSheetName_(monthKey));
    if (sh) {
      const lastRow = sh.getLastRow();
      if (lastRow >= 3) {
        const values = sh.getRange(3, MONTH_LOG_COL.UNIQUE_KEY + 1, lastRow - 2, 1).getValues();
        for (let i = 0; i < values.length; i++) {
          const val = values[i][0];
          if (val) set.add(String(val).trim());
        }
      }
    }
  } catch (e) {
    Logger.log("Lỗi ensureMonthUniqueKeys_ [" + monthKey + "]: " + e.message);
  }

  cache[monthKey] = set;
  return set;
}

/**
 * Xây dựng chuỗi query Gmail theo ngày (sau / trước)
 */
function buildGmailDateFilter_() {
  const soNgay = Number(PROP.getProperty('so_ngay_quet')) || SO_NGAY_QUET_DEFAULT;
  const tuNgay = PROP.getProperty('quet_tu_ngay');
  const denNgay = PROP.getProperty('quet_den_ngay');

  if (tuNgay && denNgay) {
    const startStr = tuNgay.replace(/-/g, '/');
    const endStr = denNgay.replace(/-/g, '/');
    return {
      queryPart: `after:${startStr} before:${endStr}`,
      label: `Từ ${tuNgay} đến ${denNgay}`
    };
  }

  const d = new Date(Date.now() - soNgay * 86400000);
  const afterStr = Utilities.formatDate(d, 'GMT+7', 'yyyy/MM/dd');
  return {
    queryPart: `after:${afterStr}`,
    label: `${soNgay} ngày gần nhất`
  };
}

/**
 * Gemini AI Fallback chuyên biệt bóc tách thông tin hóa đơn khi Regex không bắt được số tiền
 */
function extractMailWithGeminiFallback_(body, wallet) {
  const clipped = String(body || '').slice(0, 3000);
  const prompt = `Bạn bóc tách 1 giao dịch từ nội dung email hóa đơn quảng cáo / ngân hàng.
Ví liên quan: "${wallet || ''}"

BẮT BUỘC trả về ĐÚNG JSON (không markdown, không giải thích thừa):
{
  "so_tien": 100000,
  "ma_giao_dich": "",
  "phuong_thuc": "",
  "ngay_gd": ""
}

Quy tắc:
- so_tien: số tiền nguyên dương (VND), không dấu phẩy
- ma_giao_dich: mã giao dịch / mã số tham chiếu (lấy đầy đủ cả dấu - hoặc _ nếu có)
- phuong_thuc: phương thức thanh toán (vd: Visa · 1234, MoMo...) nếu có, "" nếu không
- ngay_gd: định dạng dd/MM/yyyy nếu có, "" nếu không

Nội dung email:
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

  const res = callGeminiWithKeys_(payload, function (rawText) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const soTien = parseInt(String(parsed.so_tien || "").replace(/[.,\s]/g, ""), 10);
    if (!soTien || soTien <= 0) return null;

    let ma = String(parsed.ma_giao_dich || "").trim();
    const phuongThuc = String(parsed.phuong_thuc || "").trim();
    const ngayGd = String(parsed.ngay_gd || "").trim();
    if (!ma) {
      const dayTag = ngayGd && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ngayGd)
        ? ngayGd.replace(/\//g, "")
        : Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
      ma = "AI_" + dayTag + "_" + soTien;
    }
    return { so_tien: soTien, ma_giao_dich: ma, phuong_thuc: phuongThuc, ngay_gd: ngayGd };
  });

  if (res.error || res.value == null) return null;
  return res.value;
}
