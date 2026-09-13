// ============================================================================
// 📧 3_MAILSCANNER.GS — QUÉT MAIL (GMAIL + HOTMAIL GRAPH) THEO RULE QUET MAIL
// ============================================================================

/**
 * Điền 1 dòng Log theo schema scanMail + Quet Mail:
 * B ghi chú · C ví · D đối tượng · E danh mục con; luôn Chi.
 * @param {string} dateStr dd/MM/yyyy
 * @param {number} amount số dương
 * @param {{vi?:string, doi_tuong?:string, danh_muc_con?:string, note?:string}=} rule
 * @param {string=} ghiChu đã resolve (mail: PTTT || B || subject)
 */
function buildQuetMailLogRow_(dateStr, amount, rule, ghiChu) {
  const amt = Math.abs(Number(amount) || 0);
  const r = rule || {};
  const note = String(ghiChu || r.note || '').trim() || 'Hóa đơn Ads';
  return {
    ngay_gd: dateStr,
    phan_loai: 'Chi',
    so_tien: -amt,
    so_tien_abs: amt,
    vi: String(r.vi || 'Bank').trim() || 'Bank',
    doi_tuong: String(r.doi_tuong || 'Bản thân').trim() || 'Bản thân',
    danh_muc_con: String(r.danh_muc_con || 'ADS').trim() || 'ADS',
    ghi_chu: note,
    status: ''
  };
}

/** Kích hoạt quét mail từ menu trên Google Sheet */
function triggerScanMailUI() {
  const result = scanMail(null);
  SpreadsheetApp.getUi().alert("KẾT QUẢ QUÉT MAIL", result || "Hoàn tất quét mail.", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Trigger tự động quét mail (menu Set Trigger → Lịch tự động).
 * Theo cấu hình: mỗi N giờ hoặc mỗi ngày 1 lần — cùng scanMail thủ công.
 * Kèm switch: nấu báo cáo ngay sau khi quét (MAIL_SCAN_REBUILD_AFTER).
 */
function runScheduledScanMail() {
  Logger.log('runScheduledScanMail: start');
  try {
    const rebuildAfter = PROP.getProperty(MAIL_SCAN_REBUILD_AFTER_PROP_) === '1';
    const raw = scanMail(null, null, { rebuildAfter: rebuildAfter });
    Logger.log('runScheduledScanMail: ' + String(raw || '').slice(0, 400));
    return raw;
  } catch (e) {
    Logger.log('runScheduledScanMail ERROR: ' + (e && e.message ? e.message : e));
    throw e;
  }
}

/**
 * Quét mail theo Rule tab 'Quet Mail'. Chỉ ghi Log tháng + dirty; không khớp Meta.
 * @param {string|number|null} chatId Telegram; null = menu / sidebar
 * @param {string=} mailboxId null/omit = mọi hộp đang bật (ưu tiên); 'gmail-default' | 'hotmail-1' = quét lẻ
 * @param {{rebuildAfter?: boolean}=} opts.rebuildAfter — true = nấu báo cáo ngay sau khi ghi Log (trigger tự động dùng)
 */
function scanMail(chatId, mailboxId, opts) {
  const loaded = loadQuetMailScanRules_();
  if (loaded.error) {
    if (chatId) sendMessage(chatId, loaded.error);
    return loaded.error;
  }
  const rules = loaded.rules;
  const rebuildAfter = !!(opts && opts.rebuildAfter);

  const dateFilter = buildGmailDateFilter_();
  const boxes = resolveMailboxesForScan_(mailboxId);
  if (!boxes.length) {
    const msg = mailboxId
      ? '⚠️ Không tìm thấy hộp thư.'
      : '⚠️ Không có hộp thư nào đang bật. Bật Gmail và/hoặc Hotmail trên sidebar.';
    if (chatId) sendMessage(chatId, msg);
    return msg;
  }

  const ctx = {
    monthKeyCache: {},
    batchData: [],
    logMsgs: [],
    count: 0,
    aiUsed: 0
  };
  const boxLines = [];
  let boxErrors = 0;

  for (let b = 0; b < boxes.length; b++) {
    const box = boxes[b];
    const before = ctx.count;
    try {
      if (box.type === 'gmail') scanGmailBox_(rules, dateFilter, ctx);
      else if (box.type === 'hotmail') scanHotmailBox_(box, rules, dateFilter, ctx);
      boxLines.push('• ' + box.label + ': +' + (ctx.count - before) + ' GD');
    } catch (e) {
      boxErrors++;
      const err = (e && e.message) ? e.message : String(e);
      Logger.log('scanMail [' + box.id + ']: ' + err);
      boxLines.push('• ⚠️ ' + box.label + ': ' + err);
    }
  }

  if (ctx.batchData.length > 0) {
    const liveData = getLiveData();
    for (let i = 0; i < ctx.batchData.length; i++) {
      ctx.batchData[i].data = normalizeTransactionForSheetWrite(ctx.batchData[i].data, liveData);
    }
    const saveRes = saveBatchToMonthShards(ctx.batchData, { skipRebuild: true });
    if (saveRes !== true) {
      const err = `❌ <b>Lỗi khi ghi dữ liệu:</b> ${saveRes}`;
      if (chatId) sendMessage(chatId, err);
      return err;
    }
    // Switch "nấu báo cáo ngay sau quét": rebuild các tháng vừa ghi (tháng dirty).
    if (rebuildAfter) {
      const monthKeys = [];
      for (let i = 0; i < ctx.batchData.length; i++) {
        const mk = getMonthKeyFromDate(ctx.batchData[i].data && ctx.batchData[i].data.ngay_gd);
        if (mk && monthKeys.indexOf(mk) === -1) monthKeys.push(mk);
      }
      if (monthKeys.length) {
        const res = rebuildMonthsNow_(monthKeys);
        Logger.log('scanMail rebuildAfter: rebuilt=' + res.rebuilt.join(',') + ' err=' + res.errors.join(';'));
      }
    }
  }

  const aiNote = ctx.aiUsed > 0 ? ` (AI xử lý ${ctx.aiUsed} mail)` : '';
  const boxBlock = boxLines.length ? '\n' + boxLines.join('\n') : '';
  let finalStr;
  if (boxErrors && ctx.count === 0) {
    finalStr = '⚠️ <b>Quét mail lỗi</b> (' + dateFilter.label + '):' + boxBlock;
  } else if (ctx.count > 0 || ctx.logMsgs.length > 0) {
    finalStr = '✅ <b>QUÉT XONG! Thêm ' + ctx.count + ' GD từ Mail vào Log</b> (' + dateFilter.label + ')'
      + aiNote + ':' + boxBlock + '\n' + ctx.logMsgs.join('\n')
      + (rebuildAfter
        ? '\n✔ Báo cáo đã nấu lại các tháng mới ghi.'
        : '\n⚠ Báo cáo chưa nấu — menu Làm mới / lịch báo cáo.');
  } else {
    finalStr = '✅ <b>QUÉT XONG!</b> Không có hóa đơn mới nào khớp Keyword trong '
      + dateFilter.label + '.' + aiNote + boxBlock;
  }

  if (chatId) sendMessage(chatId, finalStr);
  return finalStr;
}

/** Rule Quet Mail hàng 2+: A keyword · B ghi chú · C ví · D đối tượng · E DM con */
function loadQuetMailScanRules_() {
  const mailSheet = getSheetByGid(GID.QUET_MAIL);
  if (!mailSheet || mailSheet.getLastRow() < 2) {
    return { error: "⚠️ Không tìm thấy sheet 'Quet Mail' hoặc chưa cấu hình quy tắc." };
  }
  const lastRuleRow = mailSheet.getLastRow();
  const rows = mailSheet.getRange(2, 1, lastRuleRow - 1, 5).getValues().filter(function (r) {
    return r[0] && String(r[0]).trim();
  });
  if (!rows.length) return { error: "❌ Tab 'Quet Mail' chưa có rule nào." };
  const rules = [];
  for (let i = 0; i < rows.length; i++) {
    rules.push({
      keyword: String(rows[i][0]).trim(),
      defaultNote: String(rows[i][1] || '').trim(),
      wallet: String(rows[i][2] || 'Bank').trim() || 'Bank',
      user: String(rows[i][3] || 'Bản thân').trim() || 'Bản thân',
      subCat: String(rows[i][4] || 'ADS').trim() || 'ADS'
    });
  }
  return { rules: rules };
}

function loadMailboxes_() {
  return loadMailAccountList_();
}

/** Quét tổng = hộp bật theo ưu tiên. Quét lẻ = đúng 1 hộp (kể cả đang tắt). */
function resolveMailboxesForScan_(mailboxId) {
  const all = loadMailboxes_().sort(function (a, b) { return a.priority - b.priority; });
  const want = String(mailboxId || '').trim();
  if (!want) return all.filter(function (b) { return b.enabled; });
  return all.filter(function (b) { return b.id === want; });
}

function scanGmailBox_(rules, dateFilter, ctx) {
  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r];
    const query = dateFilter.queryPart + ' "' + rule.keyword + '"';
    let threads = [];
    try {
      threads = GmailApp.search(query);
    } catch (e) {
      Logger.log('Lỗi search Gmail query [' + query + ']: ' + e.message);
      continue;
    }
    for (let t = 0; t < threads.length; t++) {
      const messages = threads[t].getMessages();
      for (let m = 0; m < messages.length; m++) {
        const msg = messages[m];
        ingestMailItem_({
          subject: msg.getSubject() || '',
          body: msg.getPlainBody() || '',
          date: msg.getDate(),
          source: 'Gmail'
        }, rule, ctx);
      }
    }
  }
}

function scanHotmailBox_(box, rules, dateFilter, ctx) {
  const cred = parseHotmailCredLine_(box.cred);
  if (!cred) throw new Error('Chưa có cred (email|password|refresh_token|client_id).');
  const token = hotmailRefreshAccessToken_(cred);
  const items = hotmailFetchMessages_(token.accessToken, dateFilter);
  const srcLabel = box.label || 'Hotmail';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    item.source = srcLabel;
    const fullText = (item.subject || '') + '\n' + (item.body || '');
    const rule = findFirstMatchingMailRule_(fullText, rules);
    if (!rule) continue;
    ingestMailItem_(item, rule, ctx);
  }
}

function findFirstMatchingMailRule_(fullText, rules) {
  const hay = String(fullText || '').toLowerCase();
  for (let i = 0; i < rules.length; i++) {
    const needle = String(rules[i].keyword || '').trim().toLowerCase();
    if (needle && hay.indexOf(needle) !== -1) return rules[i];
  }
  return null;
}

/**
 * Bóc tách + UNIQUE_KEY vs Log tháng. Hộp trước / lần quét trước thắng.
 * @param {{subject:string, body:string, date:Date, source:string}} item
 * @param {{keyword:string, defaultNote:string, wallet:string, user:string, subCat:string}} rule
 */
function ingestMailItem_(item, rule, ctx) {
  const subject = item.subject || '';
  const fullText = subject + '\n' + (item.body || '');
  let dateObj = item.date instanceof Date ? item.date : new Date(item.date);
  if (isNaN(dateObj.getTime())) dateObj = new Date();

  const amountMatch = fullText.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:VND|VNĐ|đ|₫)/i);
  let amount = null;
  let uniqueKey = null;
  let paymentMethod = null;
  let fromAi = false;
  const wallet = rule.wallet;

  if (amountMatch) {
    amount = parseInt(amountMatch[1].replace(/[.,]/g, ''), 10);
    uniqueKey = extractTransactionReference_(fullText);
    if (!uniqueKey) {
      uniqueKey = Utilities.formatDate(dateObj, 'GMT+7', 'yyyyMMdd') + '_' + wallet + '_' + amount;
    }
    paymentMethod = extractPaymentMethodFromMail_(fullText);
  } else if (ctx.aiUsed < AI_MAIL_MAX_CALLS) {
    const extracted = extractMailWithGeminiFallback_(fullText, wallet);
    ctx.aiUsed++;
    if (extracted && extracted.so_tien > 0) {
      amount = extracted.so_tien;
      uniqueKey = extractMetaTransactionId_(fullText) || extracted.ma_giao_dich;
      if (extracted.phuong_thuc) paymentMethod = extracted.phuong_thuc;
      if (extracted.ngay_gd && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(extracted.ngay_gd)) {
        const p = extracted.ngay_gd.split('/');
        dateObj = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
      }
      fromAi = true;
    }
  }

  if (!amount || amount <= 0 || !uniqueKey) return;
  uniqueKey = String(uniqueKey).trim();

  const dateStr = Utilities.formatDate(dateObj, 'GMT+7', 'dd/MM/yyyy');
  const monthKey = getMonthKeyFromDate(dateObj);
  const monthKeys = ensureMonthUniqueKeys_(ctx.monthKeyCache, monthKey);
  if (monthKeys.has(uniqueKey)) return;

  const finalNote = paymentMethod || rule.defaultNote || subject || 'Hóa đơn Ads';
  const gd = buildQuetMailLogRow_(dateStr, amount, {
    vi: wallet,
    doi_tuong: rule.user,
    danh_muc_con: rule.subCat,
    note: rule.defaultNote
  }, finalNote);

  ctx.batchData.push({ data: gd, uniqueKey: uniqueKey });
  monthKeys.add(uniqueKey);
  ctx.count++;

  const moneyDisplay = formatMoney ? formatMoney(amount) : (amount.toLocaleString('vi-VN') + ' đ');
  const src = item.source ? ' [' + item.source + ']' : '';
  ctx.logMsgs.push('▪️ ' + moneyDisplay + ' (' + wallet + ') - ' + finalNote + (fromAi ? ' [AI]' : '') + src);
}

// ============================================================================
// HOTMAIL — Graph API (public client: client_id + refresh_token)
// Cred: email|password|refresh_token|client_id  (password không dùng)
// ============================================================================

function hotmailRefreshAccessToken_(cred) {
  const tenants = ['common', 'consumers'];
  let lastErr = 'Không đổi được token';
  for (let t = 0; t < tenants.length; t++) {
    const attempts = [
      { scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access' },
      { scope: '' }
    ];
    for (let a = 0; a < attempts.length; a++) {
      const got = hotmailPostRefreshToken_(tenants[t], cred, attempts[a].scope);
      if (got.ok) {
        if (got.refreshToken && got.refreshToken !== cred.refreshToken) {
          persistHotmailCred_(cred, got.refreshToken);
        }
        return got;
      }
      lastErr = got.error || lastErr;
    }
  }
  throw new Error(lastErr);
}

function hotmailPostRefreshToken_(tenant, cred, scope) {
  const payload = {
    client_id: cred.clientId,
    grant_type: 'refresh_token',
    refresh_token: cred.refreshToken
  };
  if (scope) payload.scope = scope;
  try {
    const res = UrlFetchApp.fetch(
      'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token',
      {
        method: 'post',
        muteHttpExceptions: true,
        payload: payload,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    const code = res.getResponseCode();
    const text = res.getContentText() || '';
    let json = {};
    try { json = JSON.parse(text); } catch (e) { json = {}; }
    if (code < 200 || code >= 300 || !json.access_token) {
      const msg = json.error_description || json.error || text.slice(0, 180);
      return { ok: false, error: String(msg).replace(/\r/g, ' ').slice(0, 220) };
    }
    return {
      ok: true,
      accessToken: json.access_token,
      refreshToken: json.refresh_token || ''
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}

function hotmailGraphGet_(url, accessToken, extraHeaders) {
  const headers = {
    Authorization: 'Bearer ' + accessToken,
    Prefer: 'outlook.body-content-type="text"',
    Accept: 'application/json'
  };
  const extra = extraHeaders || {};
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) headers[keys[i]] = extra[keys[i]];
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: headers
  });
  const code = res.getResponseCode();
  const text = res.getContentText() || '';
  let json = {};
  try { json = JSON.parse(text); } catch (e) { json = {}; }
  if (code < 200 || code >= 300) {
    const msg = (json.error && json.error.message) ? json.error.message : text.slice(0, 180);
    throw new Error('Graph HTTP ' + code + ': ' + msg);
  }
  return json;
}

function hotmailFetchMessages_(accessToken, dateFilter) {
  const select = '$select=id,subject,body,receivedDateTime';
  const top = '$top=' + MAIL_HOTMAIL_PAGE_SIZE;
  const order = '$orderby=receivedDateTime desc';
  const filter = 'receivedDateTime ge ' + dateFilter.startIso
    + (dateFilter.endIso ? ' and receivedDateTime lt ' + dateFilter.endIso : '');
  let useFilter = true;
  let next = 'https://graph.microsoft.com/v1.0/me/messages?' + select + '&' + top + '&' + order
    + '&$count=true&$filter=' + encodeURIComponent(filter);
  const items = [];
  let pages = 0;
  const filterHeaders = { ConsistencyLevel: 'eventual' };

  while (next && pages < MAIL_HOTMAIL_MAX_PAGES) {
    let json;
    try {
      json = hotmailGraphGet_(next, accessToken, useFilter ? filterHeaders : null);
    } catch (e) {
      if (useFilter && pages === 0) {
        useFilter = false;
        next = 'https://graph.microsoft.com/v1.0/me/messages?' + select + '&' + top + '&' + order;
        continue;
      }
      throw e;
    }
    const rows = json.value || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const t = row.receivedDateTime ? new Date(row.receivedDateTime).getTime() : 0;
      if (dateFilter.startMs && t && t < dateFilter.startMs) continue;
      if (dateFilter.endExclusiveMs && t && t >= dateFilter.endExclusiveMs) continue;
      items.push(hotmailMessageToItem_(row));
    }
    pages++;
    next = json['@odata.nextLink'] || '';
    if (!useFilter && rows.length) {
      const oldest = rows[rows.length - 1].receivedDateTime
        ? new Date(rows[rows.length - 1].receivedDateTime).getTime()
        : 0;
      if (oldest && oldest < dateFilter.startMs) break;
    }
  }
  return items;
}

function hotmailMessageToItem_(msg) {
  let body = '';
  if (msg.body && msg.body.content) {
    const ctype = String(msg.body.contentType || '').toLowerCase();
    body = ctype === 'html' ? htmlToPlainMail_(msg.body.content) : String(msg.body.content);
  }
  return {
    subject: msg.subject || '',
    body: body,
    date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
    source: 'Hotmail'
  };
}

function htmlToPlainMail_(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Check live Graph — sidebar. Trả {ok, message}. */
function checkHotmailLive_(credLine) {
  try {
    const cred = parseHotmailCredLine_(credLine);
    if (!cred) {
      return { ok: false, message: 'Sai format. Dùng: email|password|refresh_token|client_id' };
    }
    const token = hotmailRefreshAccessToken_(cred);
    let addr = cred.email;
    try {
      const me = hotmailGraphGet_(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
        token.accessToken
      );
      addr = me.mail || me.userPrincipalName || cred.email;
    } catch (ignore) {}
    let n = 0;
    try {
      const box = hotmailGraphGet_(
        'https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=id,subject',
        token.accessToken
      );
      n = (box.value && box.value.length) ? box.value.length : 0;
    } catch (mailErr) {
      return {
        ok: false,
        message: 'Token đổi được (' + addr + ') nhưng Graph không đọc mail: '
          + ((mailErr && mailErr.message) ? mailErr.message : mailErr)
      };
    }
    return { ok: true, message: 'OK Graph: ' + addr + (n ? ' — đọc được Inbox.' : ' — Inbox trống / không có mail mẫu.') };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

// ============================================================================
// 🔍 CÁC HÀM TRÍCH XUẤT NỘI DUNG (REGEX & LOGIC BÓC TÁCH)
// ============================================================================

/**
 * UNIQUE_KEY mail: bill FB → ID giao dịch full (giữ dấu -).
 * Không có thì số tham chiếu bank.
 */
function extractTransactionReference_(text) {
  return extractMetaTransactionId_(text) || extractBankReference_(text);
}

/** Chuẩn hoá gạch ngang Unicode → ASCII, giữ nguyên chuỗi a-b. */
function normalizeTxnDashes_(s) {
  return String(s || '').replace(/[\u2013\u2014\u2212]/g, '-');
}

/**
 * ID giao dịch Meta — full, gồm dấu - giữa hai dãy số.
 * vd: 28297833709901021-28325952603755796
 * @return {string|null}
 */
function extractMetaTransactionId_(text) {
  if (!text) return null;
  const src = normalizeTxnDashes_(text);

  const labeled = src.match(
    /(?:ID\s*giao\s*dịch|Mã\s*giao\s*dịch|Transaction\s*ID)[\s:.\n]*(\d{8,}-\d{4,})/i
  );
  if (labeled && labeled[1]) return labeled[1];

  const bare = src.match(/\b(\d{10,20}-\d{5,20})\b/);
  if (bare) return bare[1];

  return null;
}

/**
 * Số tham chiếu bank / FT — không lấy ID giao dịch Meta.
 * @return {string|null}
 */
function extractBankReference_(text) {
  if (!text) return null;
  const src = normalizeTxnDashes_(text);
  const patterns = [
    /(?:Mã số tham chiếu|Mã tham chiếu|Số tham chiếu|Reference ID|Reference|Ref ID|FT)[\s:.\n]*([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+|[A-Za-z0-9-_]{6,})/i,
    /(?:Mã số tham chiếu|Mã tham chiếu|Số tham chiếu|Reference ID|Reference|Ref ID|FT)[\s:.\n]*([^\s\r\n,;]+)/i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = src.match(patterns[i]);
    if (match && match[1]) {
      let code = match[1].trim().replace(/[.,;:()]+$/, '').trim();
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
 * Khoảng ngày: query Gmail (after/before exclusive) + mốc Graph (ISO UTC).
 */
function buildGmailDateFilter_() {
  const soNgay = Number(PROP.getProperty('so_ngay_quet')) || SO_NGAY_QUET_DEFAULT;
  const tuNgay = PROP.getProperty('quet_tu_ngay');
  const denNgay = PROP.getProperty('quet_den_ngay');

  if (tuNgay && denNgay) {
    const startStr = tuNgay.replace(/-/g, '/');
    const endStr = denNgay.replace(/-/g, '/');
    const afterDay = mailGmt7DayStart_(startStr);
    const beforeDay = mailGmt7DayStart_(endStr);
    const start = new Date(afterDay.getTime());
    start.setDate(start.getDate() + 1); // Gmail after: exclusive
    return mailDateFilterPack_(
      `after:${startStr} before:${endStr}`,
      `Từ ${tuNgay} đến ${denNgay}`,
      start,
      beforeDay
    );
  }

  const d = new Date(Date.now() - soNgay * 86400000);
  const afterStr = Utilities.formatDate(d, 'GMT+7', 'yyyy/MM/dd');
  const afterDay = mailGmt7DayStart_(afterStr);
  const start = new Date(afterDay.getTime());
  start.setDate(start.getDate() + 1);
  const endExclusive = new Date(Date.now() + 3600000);
  return mailDateFilterPack_(
    `after:${afterStr}`,
    `${soNgay} ngày gần nhất`,
    start,
    endExclusive
  );
}

function mailGmt7DayStart_(ymdSlash) {
  const s = String(ymdSlash || '').replace(/-/g, '/');
  const p = s.split('/');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0);
}

function mailDateFilterPack_(queryPart, label, start, endExclusive) {
  return {
    queryPart: queryPart,
    label: label,
    startMs: start.getTime(),
    endExclusiveMs: endExclusive.getTime(),
    startIso: Utilities.formatDate(start, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    endIso: Utilities.formatDate(endExclusive, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'")
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
- ma_giao_dich: hóa đơn Facebook/Meta Ads → lấy "ID giao dịch" / Transaction ID ĐẦY ĐỦ, giữ nguyên dấu - giữa hai dãy số (vd 28297833709901021-28325952603755796). KHÔNG lấy "Số tham chiếu" kiểu M5HKS52QR4. Mail ngân hàng mới lấy số tham chiếu / FT.
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
