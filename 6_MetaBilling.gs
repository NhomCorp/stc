// ============================================================================
// 💳 6_METABILLING.GS — BỔ TRỢ scanMail: API / Invoice CSV → Ads_Billing_Sync → Log thiếu
// ============================================================================
// Script Properties:
//   META_ACCESS_TOKEN       — long-lived / System User token (ads_read)
//   META_BILLING_LOOKBACK_DAYS (tuỳ chọn, mặc định 60)
// Ad Account: cột A sheet Quet Mail (act_… / số). META_AD_ACCOUNT_IDS còn đọc nếu đã lưu cũ.
// API Graph: META_BILLING_ENABLED ở 0_Config.gs. false = tắt sync/lịch; CSV vẫn chạy.
// ============================================================================

const META_BILLING_TRIGGER_HANDLER_ = 'runScheduledMetaBillingSync';
const META_BILLING_TRIGGER_OK_PROP_ = 'META_BILLING_TRIGGER_OK';

function isMetaBillingEnabled_() {
  return META_BILLING_ENABLED === true;
}

function metaBillingOffMsg_() {
  return 'Meta Billing API đang tắt. Dùng quét mail hoặc upload Invoice CSV.';
}

/** Tắt lịch Graph API (không đụng upload CSV). Gọi từ onOpen / sidebar khi flag = false. */
function enforceMetaBillingOff_() {
  if (isMetaBillingEnabled_()) return;
  try { PROP.setProperty('META_BILLING_TRIGGER_ON', '0'); } catch (e) {}
  try { PROP.deleteProperty(META_BILLING_TRIGGER_OK_PROP_); } catch (e2) {}
  try { opsDeleteTriggersByHandler_(META_BILLING_TRIGGER_HANDLER_); } catch (e3) {}
}

// ---------------------------------------------------------------------------
// Sheet Ads_Billing_Sync
// ---------------------------------------------------------------------------

/** Tạo / lấy sheet đối soát; cache GID vào Script Properties. */
function ensureAdsBillingSyncSheet_() {
  const ss = getSpreadsheet_();
  let sh = null;
  try {
    sh = getSheetByGidOrName(getDynamicGid_('ads_billing_sync_gid'), SHEET_NAMES.ADS_BILLING_SYNC);
    if (!sh) sh = ss.getSheetByName(SHEET_NAMES.ADS_BILLING_SYNC);
  } catch (e) {
    Logger.log('ensureAdsBillingSyncSheet_ getSheetByName: ' + e.message);
  }
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES.ADS_BILLING_SYNC);
    sh.getRange(1, 1, 1, ADS_BILLING_HEADERS.length).setValues([ADS_BILLING_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ADS_BILLING_HEADERS.length).setFontWeight('bold');
    Logger.log('ensureAdsBillingSyncSheet_: created sheet id=' + sh.getSheetId());
  } else if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, ADS_BILLING_HEADERS.length).setValues([ADS_BILLING_HEADERS]);
  } else {
    migrateAdsBillingSyncLayout_(sh);
  }
  formatAdsBillingSyncSheet_(sh);
  try {
    PROP.setProperty('ads_billing_sync_gid', String(sh.getSheetId()));
  } catch (e2) {}
  return sh;
}

/**
 * Layout cũ có cột "Mail Unique Key" (trùng Unique Key) → xóa cột đó, đổi header.
 * An toàn khi đã đúng layout mới.
 */
function migrateAdsBillingSyncLayout_(sh) {
  if (!sh || sh.getLastRow() < 1) return;
  const want = ADS_BILLING_HEADERS.length;
  const headerRow = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), want)).getValues()[0];
  const headers = headerRow.map(function (h) { return String(h || '').trim(); });
  const mailKeyIdx = headers.indexOf('Mail Unique Key');
  if (mailKeyIdx >= 0) {
    sh.deleteColumn(mailKeyIdx + 1);
    Logger.log('migrateAdsBillingSyncLayout_: removed Mail Unique Key col=' + (mailKeyIdx + 1));
  }
  // Đổi header nếu còn tên cũ / lệch layout
  const h1 = String(sh.getRange(1, 1).getValue() || '').trim();
  if (h1 !== ADS_BILLING_HEADERS[0]) {
    sh.getRange(1, 1, 1, want).setValues([ADS_BILLING_HEADERS]);
    sh.getRange(1, 1, 1, want).setFontWeight('bold');
  }
}

/** Ép cột Ngày / Cập nhật / Event Time = text trước khi setValues. */
function prepAdsBillingTextCols_(sh, numDataRows) {
  if (!sh || numDataRows < 1) return;
  const textFmt = (typeof ADS_BILLING_TS_FMT !== 'undefined') ? ADS_BILLING_TS_FMT : '@';
  try {
    sh.getRange(2, ADS_BILLING_COL.NGAY + 1, numDataRows, 1).setNumberFormat(textFmt);
    sh.getRange(2, ADS_BILLING_COL.UPDATED_AT + 1, numDataRows, 1).setNumberFormat(textFmt);
    sh.getRange(2, ADS_BILLING_COL.EVENT_TIME + 1, numDataRows, 1).setNumberFormat(textFmt);
  } catch (e) {
    Logger.log('prepAdsBillingTextCols_: ' + e.message);
  }
}

/** Format số tiền + cột thời gian dạng text + freeze header. */
function formatAdsBillingSyncSheet_(sh) {
  if (!sh) return;
  const numRows = Math.max(sh.getLastRow() - 1, 1);
  const colCount = ADS_BILLING_HEADERS.length;
  try { sh.setFrozenRows(1); } catch (e0) {}
  try {
    sh.getRange(1, 1, 1, colCount).setFontWeight('bold');
  } catch (e1) {}
  try {
    const moneyFmt = (typeof ADS_BILLING_MONEY_FMT !== 'undefined')
      ? ADS_BILLING_MONEY_FMT
      : '#,##0;[Red]-#,##0;0';
    sh.getRange(2, ADS_BILLING_COL.SO_TIEN + 1, numRows, 1).setNumberFormat(moneyFmt);
  } catch (e2) {
    Logger.log('formatAdsBillingSyncSheet_ money: ' + e2.message);
  }
  // Cập nhật / Event Time / Ngày: text — tránh Sheets đổi thành Date
  try {
    const textFmt = (typeof ADS_BILLING_TS_FMT !== 'undefined') ? ADS_BILLING_TS_FMT : '@';
    const dateCols = [
      { col: ADS_BILLING_COL.NGAY, withTime: false },
      { col: ADS_BILLING_COL.UPDATED_AT, withTime: true },
      { col: ADS_BILLING_COL.EVENT_TIME, withTime: true }
    ];
    for (let c = 0; c < dateCols.length; c++) {
      const range = sh.getRange(2, dateCols[c].col + 1, numRows, 1);
      range.setNumberFormat(textFmt);
      const vals = range.getValues();
      let dirty = false;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i][0];
        if (v instanceof Date && !isNaN(v.getTime())) {
          vals[i][0] = dateCols[c].withTime
            ? Utilities.formatDate(v, 'GMT+7', 'dd/MM/yyyy HH:mm:ss')
            : Utilities.formatDate(v, 'GMT+7', 'dd/MM/yyyy');
          dirty = true;
        }
      }
      if (dirty) range.setValues(vals);
    }
  } catch (e3) {
    Logger.log('formatAdsBillingSyncSheet_ ts: ' + e3.message);
  }
}

function getAdsBillingSyncSheet_() {
  const gid = Number(PROP.getProperty('ads_billing_sync_gid') || 0);
  if (gid) {
    const byGid = getSheetByGid(gid);
    if (byGid) {
      migrateAdsBillingSyncLayout_(byGid);
      formatAdsBillingSyncSheet_(byGid);
      return byGid;
    }
  }
  return ensureAdsBillingSyncSheet_();
}

// ---------------------------------------------------------------------------
// Config / Phase 0 helpers
// ---------------------------------------------------------------------------

function getMetaAccessToken_() {
  return String(PROP.getProperty('META_ACCESS_TOKEN') || '').trim();
}

/**
 * Đọc rule Quet Mail (cùng schema scanMail):
 * A keyword/ID TK · B ghi chú · C ví · D đối tượng · E danh mục con
 * Chỉ giữ dòng keyword nhận diện được thành act_… (ID tài khoản Ads).
 * @return {Array<{keyword,actId,note,vi,doi_tuong,danh_muc_con}>}
 */
function loadQuetMailBillingRules_() {
  const out = [];
  const seen = {};
  try {
    const mailSheet = getSheetByGid(GID.QUET_MAIL);
    if (!mailSheet || mailSheet.getLastRow() < 2) return out;
    const rules = mailSheet.getRange(2, 1, mailSheet.getLastRow() - 1, 5).getValues();
    for (let i = 0; i < rules.length; i++) {
      const keyword = String(rules[i][0] || '').trim();
      if (!keyword) continue;
      const actId = normalizeMetaActIdFromKeyword_(keyword);
      if (!actId) continue; // keyword Gmail thuần (bank…) — không quét Meta
      if (seen[actId]) continue;
      seen[actId] = true;
      out.push({
        keyword: keyword,
        actId: actId,
        note: String(rules[i][1] || '').trim(),
        vi: String(rules[i][2] || 'Bank').trim() || 'Bank',
        doi_tuong: String(rules[i][3] || 'Bản thân').trim() || 'Bản thân',
        danh_muc_con: String(rules[i][4] || 'ADS').trim() || 'ADS'
      });
    }
  } catch (e) {
    Logger.log('loadQuetMailBillingRules_: ' + e.message);
  }
  return out;
}

/** Keyword Quet Mail → act_… nếu là ID tài khoản Ads; ngược lại ''. */
function normalizeMetaActIdFromKeyword_(kw) {
  const s = String(kw || '').trim();
  if (!s) return '';
  let m = s.match(/^act_(\d{5,20})$/i);
  if (m) return 'act_' + m[1];
  m = s.match(/^(\d{5,20})$/);
  if (m) return 'act_' + m[1];
  m = s.match(/act_(\d{5,20})/i);
  if (m) return 'act_' + m[1];
  // Keyword lẫn chữ: lấy dãy số dài nhất ≥10 (vd "TK 1380758639667220 ads")
  m = s.match(/(\d{10,20})/);
  if (m) return 'act_' + m[1];
  return '';
}

/**
 * Danh sách act_… để quét Meta.
 * Cột A Quet Mail; nếu còn property cũ META_AD_ACCOUNT_IDS thì gộp thêm.
 */
function getMetaAdAccountIds_() {
  const seen = {};
  const out = [];
  const add = function (actId) {
    if (!actId || seen[actId]) return;
    seen[actId] = true;
    out.push(actId);
  };

  const rules = loadQuetMailBillingRules_();
  for (let i = 0; i < rules.length; i++) add(rules[i].actId);

  const raw = String(PROP.getProperty('META_AD_ACCOUNT_IDS') || '').trim();
  if (raw) {
    raw.split(/[,;\s]+/).forEach(function (s) {
      s = String(s || '').trim();
      if (!s) return;
      add(normalizeMetaActIdFromKeyword_(s)
        || (s.indexOf('act_') === 0 ? s : ('act_' + s.replace(/^act_/, ''))));
    });
  }

  return out;
}

function getMetaBillingLookbackDays_() {
  const n = parseInt(PROP.getProperty('META_BILLING_LOOKBACK_DAYS'), 10);
  return (n > 0) ? n : META_BILLING_LOOKBACK_DAYS_DEFAULT;
}

/**
 * Chạy trên GAS Editor sau khi Lưu META_ACCESS_TOKEN + Business ID (configui).
 * Chỉ Logger + return string — không gửi Telegram (tránh nhiễu khi test).
 */
function testMetaBillingConnection() {
  try {
    if (!isMetaBillingEnabled_()) {
      const msg = metaBillingOffMsg_();
      Logger.log('testMetaBillingConnection: ' + msg);
      tryAlertMetaTest_(msg);
      return 'DISABLED';
    }
    const token = getMetaAccessToken_();
    const accounts = getMetaAdAccountIds_();
    Logger.log('testMetaBillingConnection: tokenLen=' + (token ? token.length : 0)
      + ' accounts=' + JSON.stringify(accounts));

    if (!token) {
      const msg = 'MISSING_TOKEN — Check live chỉ test form; cần bấm «Lưu cấu hình» rồi chạy lại.';
      Logger.log('❌ ' + msg);
      tryAlertMetaTest_(msg);
      return msg;
    }
    if (!accounts.length) {
      const msg = 'MISSING_ACCOUNTS — thêm ID TK Ads vào cột A sheet Quet Mail.';
      Logger.log('❌ ' + msg);
      tryAlertMetaTest_(msg);
      return msg;
    }

    const lookback = Math.min(14, getMetaBillingLookbackDays_());
    const charges = fetchMetaBillingCharges_(accounts, lookback);
    Logger.log('✅ API OK — ' + charges.length + ' billing charge(s), lookback=' + lookback);
    for (let i = 0; i < Math.min(charges.length, 10); i++) {
      const c = charges[i];
      Logger.log(
        '#' + (i + 1) +
        ' id=' + c.txnId +
        ' account=' + c.adAccount +
        ' date=' + c.dateStr +
        ' amount=' + c.amount +
        ' ' + c.currency
      );
    }
    const ok = 'OK:' + charges.length;
    tryAlertMetaTest_('Meta API OK — ' + charges.length + ' charge(s) (lookback ' + lookback + ' ngày).');
    return ok;
  } catch (e) {
    const detail = (e && e.stack) ? (e.message + '\n' + e.stack) : String(e && e.message ? e.message : e);
    Logger.log('❌ testMetaBillingConnection: ' + detail);
    tryAlertMetaTest_('Lỗi Meta API:\n' + (e && e.message ? e.message : String(e)));
    return 'ERROR:' + (e && e.message ? e.message : String(e));
  }
}

function tryAlertMetaTest_(msg) {
  try {
    SpreadsheetApp.getUi().alert('Meta Billing Test', String(msg || ''), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (ignore) {
    // Chạy từ Editor thuần (không gắn UI sheet) — chỉ Logger
  }
}

// ---------------------------------------------------------------------------
// Meta Marketing API — activities / ad_account_billing_charge
// ---------------------------------------------------------------------------

function metaGraphGet_(path, queryParams, accessTokenOverride) {
  const token = String(accessTokenOverride || getMetaAccessToken_() || '').trim();
  if (!token) throw new Error('Chưa cấu hình META_ACCESS_TOKEN.');

  const params = Object.assign({}, queryParams || {}, { access_token: token });
  const qs = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  const url = 'https://graph.facebook.com/' + META_GRAPH_API_VERSION + '/' + path + '?' + qs;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = res.getResponseCode();
  const body = res.getContentText();
  let json = null;
  try { json = JSON.parse(body); } catch (e) { json = null; }

  if (code < 200 || code >= 300) {
    const errMsg = (json && json.error && json.error.message)
      ? json.error.message
      : ('HTTP ' + code + ': ' + body.slice(0, 300));
    throw new Error(errMsg);
  }
  return json || {};
}

function getMetaBusinessId_() {
  return String(PROP.getProperty('META_BUSINESS_ID') || '').trim();
}

// ---------------------------------------------------------------------------
// Watermark: mốc event_time đã quét của từng account
// ---------------------------------------------------------------------------

function getMetaBillingWatermarkKey_(actId) {
  return 'meta_billing_wm_' + String(actId || '').replace(/^act_/, '');
}

function getMetaBillingWatermark_(actId) {
  const n = parseInt(PROP.getProperty(getMetaBillingWatermarkKey_(actId)), 10);
  return (n > 0) ? n : 0;
}

function setMetaBillingWatermark_(actId, unixSec) {
  if (!(unixSec > 0)) return;
  try {
    PROP.setProperty(getMetaBillingWatermarkKey_(actId), String(unixSec));
  } catch (e) {
    Logger.log('setMetaBillingWatermark_: ' + e.message);
  }
}

/** Xoá watermark → lần sync tới quét lại full lookback (chạy tay khi cần lịch sử cũ). */
function resetMetaBillingWatermarks() {
  const accounts = getMetaAdAccountIds_();
  for (let i = 0; i < accounts.length; i++) {
    try { PROP.deleteProperty(getMetaBillingWatermarkKey_(accounts[i])); } catch (e) {}
  }
  const msg = 'Đã xoá watermark ' + accounts.length + ' account — lần sync tới quét lại '
    + getMetaBillingLookbackDays_() + ' ngày.';
  Logger.log(msg);
  try { SpreadsheetApp.getActive().toast(msg, 'Meta Billing', 6); } catch (e) {}
  return msg;
}

/**
 * Lấy billing charges từ activities.
 * Lưu ý Meta: ad account thuộc Business thường BẮT BUỘC param business_id.
 * @param {string=} accessTokenOverride
 * @param {{useWatermark:boolean}=} opts useWatermark: chỉ quét từ mốc lần trước (sync định kỳ)
 * @return {Array<{txnId,adAccount,dateStr,amount,currency,eventTime,note}>}
 */
function fetchMetaBillingCharges_(accountIds, lookbackDays, accessTokenOverride, opts) {
  const useWatermark = !!(opts && opts.useWatermark);
  const nowSec = Math.floor(Date.now() / 1000);
  const lookbackSince = nowSec - lookbackDays * 86400;
  const out = [];
  const skippedAccounts = [];
  const tokenOverride = accessTokenOverride || null;
  const businessId = getMetaBusinessId_();
  const billingTypes = {
    ad_account_billing_charge: 1,
    ad_account_billing_charge_back: 1,
    ad_account_billing_charge_back_reversal: 1,
    ad_account_billing_decline: 1,
    ad_account_billing_refund: 1,
    billing_event: 1
  };

  Logger.log('fetchMetaBillingCharges_: accounts=' + JSON.stringify(accountIds));

  for (let a = 0; a < accountIds.length; a++) {
    const actId = accountIds[a];
    const watermark = useWatermark ? getMetaBillingWatermark_(actId) : 0;
    const since = watermark
      ? Math.max(lookbackSince, watermark - META_BILLING_WATERMARK_BUFFER_HOURS * 3600)
      : lookbackSince;
    let nextUrl = null;
    let page = 0;
    const maxPages = 15;
    let rawBillingSeen = 0;
    let parsedOk = 0;
    let skippedParse = 0;
    let maxEventSec = 0;

    try {
      do {
        let json;
        if (nextUrl) {
          const res = UrlFetchApp.fetch(nextUrl, { muteHttpExceptions: true });
          const code = res.getResponseCode();
          const body = res.getContentText();
          try { json = JSON.parse(body); } catch (e) { json = {}; }
          if (code < 200 || code >= 300) {
            const errMsg = (json.error && json.error.message) || ('HTTP ' + code);
            throw new Error(errMsg);
          }
        } else {
          const q = {
            fields: 'event_time,event_type,extra_data,date_time_in_timezone,translated_event_type,object_name',
            since: String(since),
            limit: '100'
          };
          if (businessId) q.business_id = businessId;
          json = metaGraphGet_(actId + '/activities', q, tokenOverride);
        }

        const data = json.data || [];
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowTime = parseMetaEventTime_(row);
          if (rowTime) {
            const sec = Math.floor(rowTime.getTime() / 1000);
            if (sec > maxEventSec) maxEventSec = sec;
          }
          const et = String(row.event_type || '');
          if (!billingTypes[et]) continue;
          rawBillingSeen++;
          const parsed = parseMetaBillingActivity_(row, actId);
          if (parsed) {
            out.push(parsed);
            parsedOk++;
          } else {
            skippedParse++;
            Logger.log('billing skip parse act=' + actId + ' type=' + et
              + ' extra=' + String(row.extra_data || '').slice(0, 240));
          }
        }

        nextUrl = (data.length && json.paging && json.paging.next) ? json.paging.next : null;
        page++;
      } while (nextUrl && page < maxPages);

      if (useWatermark) setMetaBillingWatermark_(actId, maxEventSec);

      Logger.log('fetchMetaBilling ' + actId
        + ' since=' + Utilities.formatDate(new Date(since * 1000), 'GMT+7', 'yyyy-MM-dd HH:mm')
        + (watermark ? ' (watermark)' : ' (full ' + lookbackDays + 'd)')
        + ' pages=' + page
        + ' business_id=' + (businessId || '(none)')
        + ' billingEvents=' + rawBillingSeen
        + ' parsed=' + parsedOk
        + ' skipped=' + skippedParse);
    } catch (actErr) {
      const msg = (actErr && actErr.message) ? actErr.message : String(actErr);
      Logger.log('fetchMetaBilling SKIP ' + actId + ': ' + msg);
      skippedAccounts.push({ actId: actId, error: msg });
    }
  }

  // Giữ tương thích: trả về mảng charges; gắn .skipped cho caller cần biết
  out.skipped = skippedAccounts;
  return out;
}

/**
 * Debug: liệt kê activities (mọi loại) + billing thô — chạy trên GAS Editor.
 * Giúp xem API có trả charge không, extra_data dạng gì, có cần META_BUSINESS_ID không.
 */
function debugMetaBillingActivities() {
  if (!isMetaBillingEnabled_()) {
    const msg = metaBillingOffMsg_();
    Logger.log(msg);
    return msg;
  }
  const token = getMetaAccessToken_();
  const accounts = getMetaAdAccountIds_();
  const lookback = Math.max(getMetaBillingLookbackDays_(), 60);
  const businessId = getMetaBusinessId_();
  const lines = [];
  lines.push('lookback=' + lookback + 'd business_id=' + (businessId || '(CHUA SET — neu account thuoc BM thi CAN set)'));

  if (!token || !accounts.length) {
    const msg = 'Thieu token hoac Ad Account (cot A Quet Mail)';
    Logger.log(msg);
    return msg;
  }

  for (let a = 0; a < accounts.length; a++) {
    const actId = accounts[a];
    const since = Math.floor((Date.now() - lookback * 86400000) / 1000);
    const q = {
      fields: 'event_time,event_type,extra_data,date_time_in_timezone,translated_event_type',
      since: String(since),
      limit: '50'
    };
    if (businessId) q.business_id = businessId;

    let json;
    try {
      json = metaGraphGet_(actId + '/activities', q, token);
    } catch (e) {
      lines.push(actId + ' ERROR: ' + e.message);
      if (String(e.message).indexOf('business') !== -1 || String(e.message).indexOf('Business') !== -1) {
        lines.push('→ Thu set Script Property META_BUSINESS_ID = ID Business Manager');
      }
      continue;
    }

    const data = json.data || [];
    lines.push(actId + ': activities_page1=' + data.length);
    const typeCount = {};
    let billingSamples = 0;
    for (let i = 0; i < data.length; i++) {
      const et = String(data[i].event_type || '?');
      typeCount[et] = (typeCount[et] || 0) + 1;
      if (et.indexOf('billing') !== -1 || et === 'billing_event') {
        if (billingSamples < 5) {
          lines.push('  BILLING ' + et + ' t=' + data[i].event_time
            + ' extra=' + String(data[i].extra_data || '').slice(0, 200));
          billingSamples++;
        }
      }
    }
    const types = Object.keys(typeCount).sort();
    for (let t = 0; t < types.length; t++) {
      lines.push('  type ' + types[t] + ': ' + typeCount[types[t]]);
    }
    if (!billingSamples) {
      lines.push('  (Khong thay event billing trong 50 activity dau — tang lookback / sai account / thieu business_id)');
    }
  }

  const msg = lines.join('\n');
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert('debugMetaBillingActivities', msg.slice(0, 1500), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (ignore) {}
  return msg;
}

/** Alias rõ ràng cho UI check live */
function fetchMetaBillingChargesWithToken_(accountIds, lookbackDays, accessToken) {
  return fetchMetaBillingCharges_(accountIds, lookbackDays, accessToken);
}

/** Parse extra_data JSON của activity billing → record chuẩn (nới lỏng field). */
function parseMetaBillingActivity_(activity, actId) {
  let extra = {};
  const raw = activity.extra_data;
  if (typeof raw === 'string' && raw) {
    try { extra = JSON.parse(raw); } catch (e) { extra = {}; }
  } else if (raw && typeof raw === 'object') {
    extra = raw;
  }

  // new_value đôi khi là object {amount, currency} hoặc string số
  if (extra.new_value && typeof extra.new_value === 'object') {
    if (extra.new_value.amount != null && extra.amount == null) extra.amount = extra.new_value.amount;
    if (extra.new_value.currency && !extra.currency) extra.currency = extra.new_value.currency;
  }

  let amountMinor = null;
  const amountCandidates = [
    extra.amount, extra.new_value, extra.old_value, extra.total_amount,
    extra.billing_amount, extra.charge_amount, extra.value, extra.funding_amount
  ];
  for (let i = 0; i < amountCandidates.length; i++) {
    const cand = amountCandidates[i];
    if (cand && typeof cand === 'object') continue;
    const n = parseMetaAmountNumber_(cand);
    if (n !== null) { amountMinor = n; break; }
  }

  const currency = String(extra.currency || extra.currency_code || 'VND').trim().toUpperCase() || 'VND';
  const amount = (amountMinor !== null) ? normalizeMetaBillingAmount_(amountMinor, currency) : 0;

  // Meta trả event_time dạng unix (số) HOẶC ISO string — Number(ISO)*1000 = NaN → trước đây bỏ hết charge
  const eventTime = parseMetaEventTime_(activity);
  if (!eventTime) return null;
  const dateStr = Utilities.formatDate(eventTime, 'GMT+7', 'dd/MM/yyyy');

  let txnId = String(
    extra.transaction_id ||
    extra.transactionId ||
    extra.charge_id ||
    extra.invoice_id ||
    extra.id ||
    ''
  ).trim();
  // Không có ID trong extra_data → synthetize để vẫn ghi Sync (đối soát ngày+tiền)
  if (!txnId) {
    if (amountMinor === null && !raw) return null;
    txnId = 'META_' + actId.replace(/^act_/, '') + '_'
      + Utilities.formatDate(eventTime, 'GMT+7', 'yyyyMMddHHmmss')
      + '_' + Math.round(amount || 0);
  }
  if (amountMinor === null && amount === 0) {
    // Vẫn giữ event (số tiền 0) — matcher ngày+tiền sẽ yếu; ưu tiên ID
    Logger.log('billing amount missing id=' + txnId + ' extra=' + String(raw || '').slice(0, 120));
  }

  return {
    txnId: txnId,
    adAccount: actId,
    dateStr: dateStr,
    amount: amount,
    currency: currency,
    eventTime: eventTime,
    note: String(activity.event_type || 'Meta billing')
  };
}

/**
 * Parse event_time từ activities API.
 * Graph Explorer / v26+: "2026-09-07T07:01:09+0000"
 * Một số bản unix: 1725688869 hoặc "1725688869"
 * @return {Date|null}
 */
function parseMetaEventTime_(activity) {
  const raw = activity && activity.event_time;
  if (raw !== null && raw !== undefined && raw !== '') {
    if (typeof raw === 'number' && isFinite(raw)) {
      const d = new Date(raw < 1e12 ? raw * 1000 : raw);
      if (!isNaN(d.getTime())) return d;
    }
    const s = String(raw).trim();
    if (/^\d{9,13}$/.test(s)) {
      const n = Number(s);
      const d = new Date(n < 1e12 ? n * 1000 : n);
      if (!isNaN(d.getTime())) return d;
    }
    const dIso = new Date(s);
    if (!isNaN(dIso.getTime())) return dIso;
  }
  if (activity && activity.date_time_in_timezone) {
    const dTz = new Date(activity.date_time_in_timezone);
    if (!isNaN(dTz.getTime())) return dTz;
  }
  return null;
}

function parseMetaAmountNumber_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return Math.abs(v);
  const s = String(v).replace(/,/g, '').trim();
  const n = parseFloat(s);
  return (isFinite(n) && n !== 0) ? Math.abs(n) : null;
}

/**
 * Meta thường trả minor units (cents) cho USD; VND thường là đơn vị chính.
 * Heuristic: currency có 0 decimal (VND, JPY, KRW) → giữ nguyên; còn lại ÷100 nếu số lớn kiểu cents.
 */
function normalizeMetaBillingAmount_(raw, currency) {
  const zeroDecimal = { VND: 1, JPY: 1, KRW: 1, CLP: 1, ISK: 1 };
  if (zeroDecimal[currency]) return Math.round(raw);
  // USD/EUR… nếu giá trị có vẻ đã là major (vd 12.34) giữ nguyên; nếu integer lớn coi là cents
  if (raw !== Math.floor(raw)) return Math.round(raw * 100) / 100;
  return Math.round(raw) / 100;
}

// ---------------------------------------------------------------------------
// Upsert Sync sheet
// ---------------------------------------------------------------------------

/** Upsert charges vào Sync sheet — đọc 1 lần, ghi 1 lần (batch). */
function upsertMetaBillingCharges_(charges) {
  const sh = ensureAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  const colCount = ADS_BILLING_HEADERS.length;
  const grid = (lastRow >= 2) ? sh.getRange(2, 1, lastRow - 1, colCount).getValues() : [];
  const idToIdx = {}; // txnId -> index trong grid

  for (let i = 0; i < grid.length; i++) {
    const id = String(grid[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (id) idToIdx[id] = i;
  }

  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const eventTimeStr = Utilities.formatDate(c.eventTime, 'GMT+7', 'yyyy-MM-dd HH:mm:ss');
    const idx = idToIdx[c.txnId];

    if (idx !== undefined) {
      // Giữ STATUS đã có; chỉ refresh số liệu
      const row = grid[idx];
      row[ADS_BILLING_COL.AD_ACCOUNT] = c.adAccount;
      row[ADS_BILLING_COL.NGAY] = c.dateStr;
      row[ADS_BILLING_COL.SO_TIEN] = c.amount;
      row[ADS_BILLING_COL.CURRENCY] = c.currency;
      row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
      row[ADS_BILLING_COL.EVENT_TIME] = eventTimeStr;
      if (!String(row[ADS_BILLING_COL.STATUS] || '').trim()) {
        row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.SEEN;
      }
      // CSV PTTT ghi đè ghi chú; API event-type không đè PTTT đã có
      if (c.note && (isInvoicePayNote_(c.note) || !String(row[ADS_BILLING_COL.GHI_CHU] || '').trim())) {
        row[ADS_BILLING_COL.GHI_CHU] = c.note;
      }
      updated++;
    } else {
      const newRow = new Array(colCount);
      for (let k = 0; k < colCount; k++) newRow[k] = '';
      newRow[ADS_BILLING_COL.META_TXN_ID] = c.txnId;
      newRow[ADS_BILLING_COL.AD_ACCOUNT] = c.adAccount;
      newRow[ADS_BILLING_COL.NGAY] = c.dateStr;
      newRow[ADS_BILLING_COL.SO_TIEN] = c.amount;
      newRow[ADS_BILLING_COL.CURRENCY] = c.currency;
      newRow[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.SEEN;
      newRow[ADS_BILLING_COL.UPDATED_AT] = nowStr;
      newRow[ADS_BILLING_COL.GHI_CHU] = c.note || '';
      newRow[ADS_BILLING_COL.EVENT_TIME] = eventTimeStr;
      grid.push(newRow);
      idToIdx[c.txnId] = grid.length - 1;
      inserted++;
    }
  }

  if (grid.length && (inserted || updated)) {
    prepAdsBillingTextCols_(sh, grid.length);
    sh.getRange(2, 1, grid.length, colCount).setValues(grid);
    formatAdsBillingSyncSheet_(sh);
  }

  return { inserted: inserted, updated: updated };
}

function fetchMetaBilling_(opts) {
  const accounts = getMetaAdAccountIds_();
  if (!accounts.length) throw new Error('Chưa có Ad Account — thêm ID TK (act_… / số) vào cột A sheet Quet Mail.');
  const useWatermark = !(opts && opts.full);
  const charges = fetchMetaBillingCharges_(accounts, getMetaBillingLookbackDays_(), null, {
    useWatermark: useWatermark
  });
  const skipped = charges.skipped || [];
  const upsert = upsertMetaBillingCharges_(charges);
  return {
    charges: charges.length,
    inserted: upsert.inserted,
    updated: upsert.updated,
    accounts: accounts,
    skipped: skipped
  };
}

// ---------------------------------------------------------------------------
// Matcher: Meta ↔ Mail (Log tháng)
// ---------------------------------------------------------------------------

function normalizeBillingId_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

function amountsMatchBilling_(a, b) {
  const na = Math.abs(Number(a) || 0);
  const nb = Math.abs(Number(b) || 0);
  return Math.abs(na - nb) <= META_BILLING_AMOUNT_TOLERANCE;
}

/**
 * Thu thập UNIQUE_KEY + (ngày, |số tiền|) từ Log tháng trong lookback.
 * @return {{keys:Object, byDateAmount:Object}} keys: normalizedId -> original uniqueKey
 */
function collectRecentMailIndex_(lookbackDays) {
  const keys = {}; // normalized -> original
  const byDateAmount = {}; // 'dd/MM/yyyy|amount' -> [uniqueKey,...]
  const ss = getSpreadsheet_();
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - lookbackDays);

  const monthKeys = {};
  const probe = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (probe <= endMonth) {
    monthKeys[Utilities.formatDate(probe, 'GMT+7', 'MM_yyyy')] = true;
    probe.setMonth(probe.getMonth() + 1);
  }

  Object.keys(monthKeys).forEach(function (mk) {
    const sh = ss.getSheetByName(monthSheetName_(mk));
    if (!sh || sh.getLastRow() < 3) return;
    const values = sh.getRange(3, 1, sh.getLastRow() - 2, 9).getValues();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const uk = String(row[MONTH_LOG_COL.UNIQUE_KEY] || '').trim();
      if (!uk) continue;
      keys[normalizeBillingId_(uk)] = uk;

      const d = parseLogDate_(row[MONTH_LOG_COL.NGAY]);
      if (!d) continue;
      if (d < start) continue;
      const dateStr = Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy');
      const amt = Math.abs(Number(row[MONTH_LOG_COL.SO_TIEN]) || 0);
      if (amt <= 0) continue;
      const k = dateStr + '|' + Math.round(amt);
      if (!byDateAmount[k]) byDateAmount[k] = [];
      byDateAmount[k].push(uk);
    }
  });

  return { keys: keys, byDateAmount: byDateAmount };
}

/** Ngày charge + các ngày lệch ±tolerance (UTC ↔ GMT+7). */
function billingDateCandidates_(dateStr) {
  const out = [dateStr];
  const base = parseLogDate_(dateStr);
  if (!base) return out;
  for (let step = 1; step <= META_BILLING_DATE_TOLERANCE_DAYS; step++) {
    const back = new Date(base.getTime());
    back.setDate(back.getDate() - step);
    const fwd = new Date(base.getTime());
    fwd.setDate(fwd.getDate() + step);
    out.push(Utilities.formatDate(back, 'GMT+7', 'dd/MM/yyyy'));
    out.push(Utilities.formatDate(fwd, 'GMT+7', 'dd/MM/yyyy'));
  }
  return out;
}

/**
 * Tìm UNIQUE_KEY trên Log theo ID giao dịch (full / nửa a-b / chứa nhau).
 * Không dùng ngày+tiền — tránh nuốt charge CSV.
 */
function findLogKeyByBillingId_(charge, mailIndex, used) {
  const usedMap = used || {};
  const isFree = function (uk) {
    return !!uk && !usedMap[normalizeBillingId_(uk)];
  };

  const nid = normalizeBillingId_(charge.txnId);
  if (nid && isFree(mailIndex.keys[nid])) return mailIndex.keys[nid];

  const halves = String(charge.txnId || '').split('-').map(normalizeBillingId_)
    .filter(function (p) { return p.length >= 6; });
  for (let h = 0; h < halves.length; h++) {
    if (isFree(mailIndex.keys[halves[h]])) return mailIndex.keys[halves[h]];
  }

  const idList = Object.keys(mailIndex.keys);
  for (let i = 0; i < idList.length; i++) {
    const nk = idList[i];
    if (nk.length < 6 || !isFree(mailIndex.keys[nk])) continue;
    if (nid.length >= 6 && (nk.indexOf(nid) !== -1 || nid.indexOf(nk) !== -1)) {
      return mailIndex.keys[nk];
    }
    for (let h = 0; h < halves.length; h++) {
      if (nk.indexOf(halves[h]) !== -1 || halves[h].indexOf(nk) !== -1) return mailIndex.keys[nk];
    }
  }
  return null;
}

/**
 * Tìm UNIQUE_KEY mail cho 1 charge. Ưu tiên ID → nửa ID → chứa nhau → ngày ±1 + tiền.
 * @param {Object=} used map normalizedKey -> true (mail key đã gán charge khác → bỏ qua)
 */
function findMailKeyForCharge_(charge, mailIndex, used) {
  const byId = findLogKeyByBillingId_(charge, mailIndex, used);
  if (byId) return byId;

  const usedMap = used || {};
  const isFree = function (uk) {
    return !!uk && !usedMap[normalizeBillingId_(uk)];
  };

  // Ngày (±tolerance) + số tiền
  const amt = Math.abs(Number(charge.amount) || 0);
  const dates = billingDateCandidates_(charge.dateStr);
  const pickFree = function (list) {
    if (!list) return null;
    for (let k = 0; k < list.length; k++) {
      if (isFree(list[k])) return list[k];
    }
    return null;
  };

  for (let d = 0; d < dates.length; d++) {
    const hit = pickFree(mailIndex.byDateAmount[dates[d] + '|' + Math.round(amt)]);
    if (hit) return hit;
  }
  const prefixes = Object.keys(mailIndex.byDateAmount);
  for (let i = 0; i < prefixes.length; i++) {
    const parts = prefixes[i].split('|');
    if (dates.indexOf(parts[0]) === -1) continue;
    if (!amountsMatchBilling_(amt, Number(parts[1]) || 0)) continue;
    const hit = pickFree(mailIndex.byDateAmount[prefixes[i]]);
    if (hit) return hit;
  }
  return null;
}

/**
 * Khớp Sync với Log mail. Không ghi thêm dòng sổ.
 * @param {number=} lookbackDays mặc định META_BILLING_LOOKBACK_DAYS
 * @return {{matched:number, missing:number}}
 */
function matchBillingAgainstMail_(lookbackDays) {
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { matched: 0, missing: 0 };

  const colCount = ADS_BILLING_HEADERS.length;
  const lookback = (lookbackDays && lookbackDays > 0) ? lookbackDays : getMetaBillingLookbackDays_();
  const mailIndex = collectRecentMailIndex_(lookback);
  const values = sh.getRange(2, 1, lastRow - 1, colCount).getValues();
  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  let matched = 0;
  let missing = 0;
  let dirty = false;

  // Unique Key = Meta txn id — khoá key đã khớp / đã ghi Log
  const used = {};
  for (let i = 0; i < values.length; i++) {
    const st = String(values[i][ADS_BILLING_COL.STATUS] || '').trim();
    if (st !== ADS_BILLING_STATUS.MATCHED_MAIL && st !== ADS_BILLING_STATUS.LOGGED_META) continue;
    const id = String(values[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (id) used[normalizeBillingId_(id)] = true;
  }

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const txnId = String(row[ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (!txnId) continue;
    const status = String(row[ADS_BILLING_COL.STATUS] || '').trim();
    // Đã khớp mail hoặc đã ghi Log từ Meta → giữ
    if (status === ADS_BILLING_STATUS.MATCHED_MAIL
      || status === ADS_BILLING_STATUS.LOGGED_META) {
      matched++;
      continue;
    }

    const charge = {
      txnId: txnId,
      dateStr: String(row[ADS_BILLING_COL.NGAY] || '').trim(),
      amount: Math.abs(Number(row[ADS_BILLING_COL.SO_TIEN]) || 0)
    };
    // Chuẩn hoá ngày nếu sheet lưu Date
    const d = parseLogDate_(row[ADS_BILLING_COL.NGAY]);
    if (d) charge.dateStr = Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy');

    const mailKey = findMailKeyForCharge_(charge, mailIndex, used);
    if (mailKey) {
      used[normalizeBillingId_(mailKey)] = true;
      used[normalizeBillingId_(txnId)] = true;
      row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.MATCHED_MAIL;
      row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
      dirty = true;
      matched++;
    } else {
      if (status !== ADS_BILLING_STATUS.ALERTED) {
        row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.MISSING_MAIL;
        row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
        dirty = true;
      }
      missing++;
    }
  }

  if (dirty) {
    prepAdsBillingTextCols_(sh, values.length);
    sh.getRange(2, 1, values.length, colCount).setValues(values);
    formatAdsBillingSyncSheet_(sh);
  }

  return { matched: matched, missing: missing };
}

// ---------------------------------------------------------------------------
// Ghi Log tháng từ charge chưa có mail
// ---------------------------------------------------------------------------

/**
 * Default Ví / Đối tượng / DM / ghi chú — cùng nguồn Quet Mail như scanMail
 * (A→act, B ghi chú, C ví, D đối tượng, E danh mục).
 */
function resolveBillingLogDefaults_(actId) {
  const out = {
    vi: 'Bank',
    doi_tuong: 'Bản thân',
    danh_muc_con: 'ADS',
    note: 'Hóa đơn Ads',
    ghi_chu: 'Hóa đơn Ads'
  };
  const want = normalizeMetaActIdFromKeyword_(actId) || String(actId || '').trim();
  if (!want) return out;

  const rules = loadQuetMailBillingRules_();
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].actId === want) {
      out.vi = rules[i].vi;
      out.doi_tuong = rules[i].doi_tuong;
      out.danh_muc_con = rules[i].danh_muc_con;
      if (rules[i].note) {
        out.note = rules[i].note;
        out.ghi_chu = rules[i].note;
      }
      return out;
    }
  }
  return out;
}

/**
 * Ghi các dòng Sync chưa có mail (MISSING_MAIL / ALERTED / SEEN sau match)
 * vào Log_MM_YYYY. UNIQUE_KEY = Meta transaction_id → chống trùng khi sync lại.
 * @param {{lookbackDays?:number, onlyTxnIds?:Object}=} opts
 *   onlyTxnIds: map normalizeBillingId_ → true — chỉ xét ID trong lô CSV
 * @return {{written:number, skipped:number, error:?string}}
 */
function writeMissingMetaBillingToLog_(opts) {
  opts = opts || {};
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { written: 0, skipped: 0, error: null };

  const colCount = ADS_BILLING_HEADERS.length;
  const values = sh.getRange(2, 1, lastRow - 1, colCount).getValues();
  const lookback = (opts.lookbackDays && opts.lookbackDays > 0)
    ? opts.lookbackDays
    : getMetaBillingLookbackDays_();
  const onlyIds = opts.onlyTxnIds || null;
  const mailIndex = collectRecentMailIndex_(lookback);
  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  const defaultsCache = {};
  const batchData = [];
  const writeIdx = []; // index trong values sẽ đánh LOGGED_META
  let skipped = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const txnProbe = String(row[ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (onlyIds && (!txnProbe || !onlyIds[normalizeBillingId_(txnProbe)])) continue;
    const status = String(row[ADS_BILLING_COL.STATUS] || '').trim();
    if (status === ADS_BILLING_STATUS.MATCHED_MAIL
      || status === ADS_BILLING_STATUS.LOGGED_META) {
      skipped++;
      continue;
    }
    // Chỉ ghi khi đã xác định thiếu mail (hoặc SEEN vừa fetch chưa match)
    if (status && status !== ADS_BILLING_STATUS.MISSING_MAIL
      && status !== ADS_BILLING_STATUS.ALERTED
      && status !== ADS_BILLING_STATUS.SEEN) {
      skipped++;
      continue;
    }

    const txnId = String(row[ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (!txnId) { skipped++; continue; }

    // Đã có trong Log (txn hoặc đã paste trước) → chỉ đánh dấu Sync
    if (mailIndex.keys[normalizeBillingId_(txnId)]) {
      row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.LOGGED_META;
      row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
      writeIdx.push(i); // reuse: dirty sync row without new Log write
      continue;
    }

    let dateStr = String(row[ADS_BILLING_COL.NGAY] || '').trim();
    const d = parseLogDate_(row[ADS_BILLING_COL.NGAY]);
    if (d) dateStr = Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy');
    if (!dateStr) { skipped++; continue; }

    const amount = Math.abs(Number(row[ADS_BILLING_COL.SO_TIEN]) || 0);
    if (amount <= 0) { skipped++; continue; }

    const actId = String(row[ADS_BILLING_COL.AD_ACCOUNT] || '').trim();
    if (!defaultsCache[actId]) defaultsCache[actId] = resolveBillingLogDefaults_(actId);
    const def = defaultsCache[actId];
    const payNote = invoicePayNoteFromSync_(row[ADS_BILLING_COL.GHI_CHU]);
    batchData.push({
      uniqueKey: txnId,
      data: buildQuetMailLogRow_(dateStr, amount, def, payNote)
    });
    writeIdx.push(i);
  }

  // Đánh dấu các dòng đã có trong Log (nhánh continue ở trên) — chưa có batch
  const alreadyLoggedOnly = writeIdx.filter(function (idx) {
    return String(values[idx][ADS_BILLING_COL.STATUS] || '') === ADS_BILLING_STATUS.LOGGED_META;
  });

  if (!batchData.length && !alreadyLoggedOnly.length) {
    return { written: 0, skipped: skipped, error: null };
  }

  if (batchData.length) {
    const liveData = (typeof getLiveData === 'function') ? getLiveData() : null;
    for (let b = 0; b < batchData.length; b++) {
      if (liveData && typeof normalizeTransactionForSheetWrite === 'function') {
        batchData[b].data = normalizeTransactionForSheetWrite(batchData[b].data, liveData);
      }
    }
    const saveRes = saveBatchToMonthShards(batchData);
    if (saveRes !== true) {
      return { written: 0, skipped: skipped, error: String(saveRes) };
    }
  }

  // Cập nhật Sync: các index trong writeIdx mà chưa LOGGED → LOGGED_META
  for (let w = 0; w < writeIdx.length; w++) {
    const idx = writeIdx[w];
    if (String(values[idx][ADS_BILLING_COL.STATUS] || '') === ADS_BILLING_STATUS.LOGGED_META) continue;
    values[idx][ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.LOGGED_META;
    values[idx][ADS_BILLING_COL.UPDATED_AT] = nowStr;
  }
  prepAdsBillingTextCols_(sh, values.length);
  sh.getRange(2, 1, values.length, colCount).setValues(values);
  formatAdsBillingSyncSheet_(sh);

  const written = batchData.length;
  Logger.log('writeMissingMetaBillingToLog_: written=' + written
    + ' marked=' + writeIdx.length + ' skipped=' + skipped);
  return { written: written, skipped: skipped, error: null };
}

/** Menu / Editor: chỉ ghi Log từ Sync (không gọi Meta API). */
function triggerWriteMetaBillingToLogUI() {
  if (!isMetaBillingEnabled_()) {
    const msg = metaBillingOffMsg_();
    try { SpreadsheetApp.getActive().toast(msg, 'Meta → Log', 6); } catch (t) {}
    try { SpreadsheetApp.getUi().alert(msg); } catch (uiErr) {}
    return msg;
  }
  var result = '';
  try {
    ensureAdsBillingSyncSheet_();
    // Rematch trước — tránh ghi trùng khi mail đã về
    matchBillingAgainstMail_();
    const res = writeMissingMetaBillingToLog_();
    if (res.error) result = 'ERR: ' + res.error;
    else result = 'Đã ghi ' + res.written + ' dòng vào Log tháng (bỏ qua ' + res.skipped + ').';
  } catch (e) {
    result = 'ERR: ' + (e && e.message ? e.message : String(e));
  }
  try { SpreadsheetApp.getActive().toast(String(result).slice(0, 200), 'Meta → Log', 8); } catch (t) {}
  try {
    SpreadsheetApp.getUi().alert('META → LOG', String(result || 'Xong'), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (uiErr) {}
  return result;
}

// ---------------------------------------------------------------------------
// Telegram alerts
// ---------------------------------------------------------------------------

function resolveBillingAlertChatId_(chatId) {
  if (chatId) return String(chatId);
  return String(PROP.getProperty('admin_id') || PROP.getProperty('chat_id') || '').trim() || null;
}

function notifyMetaBillingError_(message) {
  const chatId = resolveBillingAlertChatId_(null);
  if (!chatId) {
    Logger.log('Meta billing error (no chat): ' + message);
    return;
  }
  try {
    sendMessage(chatId, '⚠️ <b>Meta Billing</b>\n' + escapeHtml(String(message || 'Lỗi không rõ')));
  } catch (e) {
    Logger.log('notifyMetaBillingError_ send fail: ' + e.message);
  }
}

/**
 * Cảnh báo 1 lần các dòng MISSING_MAIL → ALERTED.
 * @return {number} số tin đã gửi (gộp 1 message)
 */
function alertMissingMailBilling_(chatId) {
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  const colCount = ADS_BILLING_HEADERS.length;
  const values = sh.getRange(2, 1, lastRow - 1, colCount).getValues();
  const lines = [];
  const alertIdx = [];
  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');

  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][ADS_BILLING_COL.STATUS] || '').trim();
    if (status !== ADS_BILLING_STATUS.MISSING_MAIL) continue;
    const txnId = String(values[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    const dateStr = values[i][ADS_BILLING_COL.NGAY];
    const amount = Math.abs(Number(values[i][ADS_BILLING_COL.SO_TIEN]) || 0);
    const account = String(values[i][ADS_BILLING_COL.AD_ACCOUNT] || '').trim();
    const money = (typeof formatMoney === 'function')
      ? formatMoney(amount)
      : (amount.toLocaleString('vi-VN') + ' đ');
    lines.push('▪️ ' + money + ' · ' + dateStr + ' · <code>' + escapeHtml(txnId) + '</code> · ' + escapeHtml(account));
    alertIdx.push(i);
  }

  if (!lines.length) return 0;

  const target = resolveBillingAlertChatId_(chatId);
  if (!target) {
    Logger.log('alertMissingMailBilling_: không có chatId/admin_id — bỏ qua gửi.');
    return 0;
  }

  const msg = '📬 <b>Meta charge chưa thấy mail</b> (' + lines.length + '):\n' + lines.join('\n');
  sendMessage(target, msg);

  for (let r = 0; r < alertIdx.length; r++) {
    values[alertIdx[r]][ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.ALERTED;
    values[alertIdx[r]][ADS_BILLING_COL.UPDATED_AT] = nowStr;
  }
  prepAdsBillingTextCols_(sh, values.length);
  sh.getRange(2, 1, values.length, colCount).setValues(values);
  formatAdsBillingSyncSheet_(sh);
  return lines.length;
}

// ---------------------------------------------------------------------------
// Invoice Summary CSV (Ads Manager) → dò ID Log → ghi thẳng
// ---------------------------------------------------------------------------

/**
 * Sidebar: CSV → dò ID trên Log → ghi thẳng dòng chưa có.
 * Ví / Đối tượng / DM lấy Quet Mail; ghi chú = PTTT CSV.
 */
function ingestMetaInvoiceCsv_(csvText, fileName) {
  const parsed = parseMetaInvoiceCsv_(csvText);
  if (!parsed.charges.length) {
    throw new Error('Không có giao dịch trong CSV. Dùng Invoice Summary (.csv), không phải PDF.');
  }
  const resolved = resolveInvoiceCsvAccount_(parsed.accountRaw);
  if (resolved.error) throw new Error(resolved.error);

  const actId = resolved.actId;
  const charges = parsed.charges;
  for (let i = 0; i < charges.length; i++) {
    charges[i].adAccount = actId;
  }

  ensureAdsBillingSyncSheet_();
  const upsert = upsertMetaBillingCharges_(charges);
  const lookback = lookbackDaysCoveringCharges_(charges);
  const writeRes = writeInvoiceCsvToLog_(charges, resolved.rule, lookback);
  if (writeRes.error) throw new Error(writeRes.error);

  const notesPatched = applyInvoicePayNotesToLoggedMeta_(charges);

  const kw = resolved.rule && resolved.rule.keyword ? resolved.rule.keyword : actId;
  const fname = String(fileName || '').trim() || '(không tên)';
  const lines = [
    'CSV Invoice OK — dò ID rồi ghi thẳng Log',
    '- File: ' + fname,
    '- Tài khoản: ' + actId + ' (keyword Quet Mail: ' + kw + ')',
    '- CSV: ' + charges.length + ' giao dịch (file tạm mới ' + upsert.inserted + ', đã có ' + upsert.updated + ')',
    '- Đã ghi Log: ' + writeRes.written + ' dòng',
    '- Bỏ qua (ID đã có trên Log): ' + writeRes.skipped,
    '- Cập nhật ghi chú PTTT: ' + notesPatched + ' dòng đã có'
  ];
  if (parsed.period) lines.splice(3, 0, '- Kỳ: ' + parsed.period);
  if (writeRes.written === 0 && writeRes.skipped === charges.length) {
    lines.push('(Log đã đủ ID trong file.)');
  }
  const msg = lines.join('\n');
  Logger.log('ingestMetaInvoiceCsv_: ' + msg.replace(/\n/g, ' | '));
  return msg;
}

/**
 * Dò UNIQUE_KEY (full / nửa ID) → ID chưa có thì append Log.
 * Không ghi đè dòng đã có; không chặn vì khớp ngày+tiền.
 */
function writeInvoiceCsvToLog_(charges, rule, lookbackDays) {
  const mailIndex = collectRecentMailIndex_(lookbackDays);
  const used = {};
  const batchData = [];
  const idStatus = {};
  let skipped = 0;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const txnId = String(c.txnId || '').trim();
    if (!txnId) { skipped++; continue; }
    const nid = normalizeBillingId_(txnId);
    const hit = findLogKeyByBillingId_(c, mailIndex, used);
    if (hit) {
      used[normalizeBillingId_(hit)] = true;
      used[nid] = true;
      skipped++;
      const same = normalizeBillingId_(hit) === nid;
      idStatus[nid] = same ? ADS_BILLING_STATUS.LOGGED_META : ADS_BILLING_STATUS.MATCHED_MAIL;
      continue;
    }
    const pay = invoicePayNoteFromSync_(c.note);
    batchData.push({
      uniqueKey: txnId,
      data: buildQuetMailLogRow_(c.dateStr, c.amount, rule || {}, pay)
    });
    used[nid] = true;
    idStatus[nid] = ADS_BILLING_STATUS.LOGGED_META;
  }

  if (batchData.length) {
    const liveData = (typeof getLiveData === 'function') ? getLiveData() : null;
    for (let b = 0; b < batchData.length; b++) {
      if (liveData && typeof normalizeTransactionForSheetWrite === 'function') {
        batchData[b].data = normalizeTransactionForSheetWrite(batchData[b].data, liveData);
      }
    }
    const saveRes = saveBatchToMonthShards(batchData);
    if (saveRes !== true) {
      return { written: 0, skipped: skipped, error: String(saveRes) };
    }
  }

  markAdsBillingStatusForIds_(idStatus);
  return { written: batchData.length, skipped: skipped, error: null };
}

function markAdsBillingStatusForIds_(idStatus) {
  if (!idStatus) return;
  const ids = Object.keys(idStatus);
  if (!ids.length) return;
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const colCount = ADS_BILLING_HEADERS.length;
  const values = sh.getRange(2, 1, lastRow - 1, colCount).getValues();
  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  let dirty = false;
  for (let i = 0; i < values.length; i++) {
    const txnId = String(values[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (!txnId) continue;
    const st = idStatus[normalizeBillingId_(txnId)];
    if (!st) continue;
    values[i][ADS_BILLING_COL.STATUS] = st;
    values[i][ADS_BILLING_COL.UPDATED_AT] = nowStr;
    dirty = true;
  }
  if (!dirty) return;
  prepAdsBillingTextCols_(sh, values.length);
  sh.getRange(2, 1, values.length, colCount).setValues(values);
  formatAdsBillingSyncSheet_(sh);
}

/** Lookback đủ phủ ngày CSV → hôm nay (tối đa 400 ngày). */
function lookbackDaysCoveringCharges_(charges) {
  const fallback = getMetaBillingLookbackDays_();
  let min = null;
  for (let i = 0; i < (charges || []).length; i++) {
    const d = parseLogDate_((charges[i] && charges[i].dateStr) || '');
    if (d && (!min || d.getTime() < min.getTime())) min = d;
  }
  if (!min) return fallback;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((today.getTime() - min.getTime()) / 86400000)
    + META_BILLING_DATE_TOLERANCE_DAYS + 1;
  const need = Math.max(1, days);
  return Math.max(fallback, Math.min(400, need));
}

/**
 * ID tài khoản CSV ↔ cột A Quet Mail (cùng normalize act_…).
 * @return {{actId?:string, rule?:Object, error?:string}}
 */
function resolveInvoiceCsvAccount_(accountRaw) {
  const actId = normalizeMetaActIdFromKeyword_(accountRaw);
  if (!actId) {
    return { error: 'Không đọc được ID tài khoản từ CSV (dòng Tài khoản: …).' };
  }
  const rules = loadQuetMailBillingRules_();
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].actId === actId) return { actId: actId, rule: rules[i] };
  }
  const listed = rules.map(function (r) { return r.actId; }).join(', ');
  return {
    error: 'ID ' + actId + ' không khớp keyword cột A Quet Mail.'
      + (listed ? ' Keyword ads hiện có: ' + listed + '.' : ' Chưa có ID TK Ads trên Quet Mail.')
  };
}

/**
 * Parse Invoice Summary CSV (VN/EN). Bỏ dòng tổng / VAT.
 * @return {{accountRaw:string, period:string, charges:Array}}
 */
function parseMetaInvoiceCsv_(csvText) {
  const text = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!text) throw new Error('File CSV trống.');
  if (text.length > 800000) throw new Error('File CSV quá lớn (tối đa ~800KB).');

  let rows;
  try {
    rows = Utilities.parseCsv(text);
  } catch (e) {
    throw new Error('Không đọc được CSV: ' + ((e && e.message) ? e.message : e));
  }
  if (rows && rows.length && rows[0].length === 1 && text.indexOf(';') !== -1) {
    try { rows = Utilities.parseCsv(text, ';'); } catch (e2) {}
  }
  if (!rows || !rows.length) throw new Error('CSV không có dòng nào.');

  const accountRaw = extractInvoiceCsvAccount_(rows);
  const period = extractInvoiceCsvPeriod_(rows);
  let headerIdx = -1;
  let col = null;
  for (let i = 0; i < rows.length; i++) {
    if (isInvoiceCsvHeaderRow_(rows[i])) {
      headerIdx = i;
      col = mapInvoiceCsvColumns_(rows[i]);
      break;
    }
  }
  if (headerIdx < 0 || !col || col.id < 0 || col.date < 0 || col.amount < 0) {
    throw new Error('Không thấy bảng giao dịch (cần cột Ngày, ID giao dịch, Số tiền).');
  }

  const charges = [];
  const seen = {};
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const joined = row.join(' ');
    if (/tổng\s*số\s*tiền|total\s*(amount|billed)|vat\s*(rate|amount)/i.test(joined)) continue;

    let txn = String(row[col.id] || '').trim();
    if (typeof normalizeTxnDashes_ === 'function') txn = normalizeTxnDashes_(txn);
    txn = txn.replace(/\s+/g, '');
    if (!txn) continue;
    if (!(/^\d{8,}-\d{4,}$/.test(txn) || /^\d{10,20}$/.test(txn))) continue;

    const eventTime = parseInvoiceCsvDate_(row[col.date]);
    if (!eventTime) continue;
    const dateStr = Utilities.formatDate(eventTime, 'GMT+7', 'dd/MM/yyyy');
    const amount = parseInvoiceCsvAmount_(row[col.amount]);
    if (!(amount > 0)) continue;

    if (seen[txn]) continue;
    seen[txn] = true;

    const currency = (col.currency >= 0)
      ? String(row[col.currency] || 'VND').trim().toUpperCase() || 'VND'
      : 'VND';
    const pay = (col.pay >= 0)
      ? normalizeInvoicePayMethod_(row[col.pay])
      : '';

    charges.push({
      txnId: txn,
      adAccount: '',
      dateStr: dateStr,
      amount: amount,
      currency: currency,
      eventTime: eventTime,
      note: pay || 'CSV Invoice'
    });
  }

  return { accountRaw: accountRaw, period: period, charges: charges };
}

function extractInvoiceCsvAccount_(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim();
      let m = cell.match(/Tài\s*khoản\s*[:：]?\s*(?:act_)?(\d{5,20})/i)
        || cell.match(/Account\s*[:：]?\s*(?:act_)?(\d{5,20})/i);
      if (m) return m[1];
      if (/^(Tài\s*khoản|Account)$/i.test(cell) && row[c + 1] != null) {
        m = String(row[c + 1] || '').trim().match(/^(?:act_)?(\d{5,20})$/i);
        if (m) return m[1];
      }
    }
  }
  return '';
}

function extractInvoiceCsvPeriod_(rows) {
  for (let i = 0; i < rows.length; i++) {
    const joined = (rows[i] || []).join(' ');
    const m = joined.match(/Báo\s*cáo\s*lập\s*hóa\s*đơn\s*[:：]\s*(.+)/i)
      || joined.match(/Invoice\s*report\s*[:：]\s*(.+)/i);
    if (m) return String(m[1] || '').trim();
  }
  return '';
}

function isInvoiceCsvHeaderRow_(row) {
  const cells = (row || []).map(function (h) {
    return String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();
  });
  for (let i = 0; i < cells.length; i++) {
    if (/id\s*giao\s*dịch|transaction\s*id/.test(cells[i])) return true;
  }
  return false;
}

function mapInvoiceCsvColumns_(row) {
  const col = { date: -1, id: -1, pay: -1, amount: -1, currency: -1 };
  const cells = (row || []).map(function (h) {
    return String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();
  });
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i];
    if (col.date < 0 && (h === 'ngày' || h === 'date' || h === 'transaction date')) col.date = i;
    else if (col.id < 0 && (/id\s*giao\s*dịch|transaction\s*id/.test(h))) col.id = i;
    else if (col.pay < 0 && (/phương\s*thức|payment\s*method/.test(h))) col.pay = i;
    else if (col.amount < 0 && (h === 'số tiền' || h === 'amount') && h.indexOf('vat') === -1) col.amount = i;
    else if (col.currency < 0 && (h === 'tiền tệ' || h === 'currency')) col.currency = i;
  }
  return col;
}

function parseInvoiceCsvDate_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const dmy = parseLogDate_(s);
  if (dmy) return dmy;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

/** 6.278.661 (VN) / 6,278,661.00 (EN) → số dương. */
function parseInvoiceCsvAmount_(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\s\u00a0]/g, '');
  s = s.replace(/[đ₫]/g, '').replace(/VND|USD|EUR/gi, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
    return Math.abs(parseFloat(s) || 0);
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
    return Math.abs(parseFloat(s) || 0);
  }
  const n = parseFloat(s.replace(/,/g, ''));
  return (isFinite(n) && n > 0) ? Math.abs(n) : 0;
}

/** MasterCard ···· 6993 / Visa ···· 9851 — bỏ NBSP, prefix CSV. */
function normalizeInvoicePayMethod_(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^CSV\s*[·•.\-–]\s*/i, '');
  return s;
}

function isInvoicePayNote_(raw) {
  const s = normalizeInvoicePayMethod_(raw);
  if (!s) return false;
  return /visa|master\s*card|mastercard|amex|american\s*express|paypal|jcb|discover|unionpay|····|\*{2,}|x{4}/i.test(s);
}

/** Ghi chú Log: PTTT từ Sync; không lấy event-type API. */
function invoicePayNoteFromSync_(raw) {
  const s = normalizeInvoicePayMethod_(raw);
  return isInvoicePayNote_(s) ? s : '';
}

/**
 * Dòng CSV đã ghi Log trước (LOGGED_META, chưa có PTTT) → cập nhật cột ghi chú.
 * MATCHED_MAIL giữ ghi chú mail.
 */
function applyInvoicePayNotesToLoggedMeta_(charges) {
  if (!charges || !charges.length) return 0;
  if (typeof getRowByUniqueKey !== 'function' || typeof updateRowByUniqueKey !== 'function') return 0;

  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const values = sh.getRange(2, 1, lastRow - 1, ADS_BILLING_HEADERS.length).getValues();
  const statusById = {};
  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (id) statusById[normalizeBillingId_(id)] = String(values[i][ADS_BILLING_COL.STATUS] || '').trim();
  }

  let n = 0;
  for (let c = 0; c < charges.length; c++) {
    const pay = invoicePayNoteFromSync_(charges[c].note);
    if (!pay) continue;
    const txnId = String(charges[c].txnId || '').trim();
    if (!txnId) continue;
    if (statusById[normalizeBillingId_(txnId)] === ADS_BILLING_STATUS.MATCHED_MAIL) continue;
    const existing = getRowByUniqueKey(txnId);
    if (!existing) continue;
    if (String(existing.ghi_chu || '').trim() === pay) continue;
    existing.ghi_chu = pay;
    if (updateRowByUniqueKey(txnId, existing)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Quét Meta → file tạm Ads_Billing_Sync → khớp mail. Không ghi Log.
 * Ghi Log thiếu mail: sau scanMail hoặc menu «Ghi charge Meta thiếu mail → Log».
 * @param {string|number|null} chatId
 * @param {{full:boolean}=} opts full: bỏ watermark, quét lại toàn bộ lookback
 * @return {string} tóm tắt (plain text, an toàn cho alert)
 */
function syncMetaBilling(chatId, opts) {
  try {
    Logger.log('syncMetaBilling: start');
    if (!isMetaBillingEnabled_()) {
      Logger.log('syncMetaBilling: ' + metaBillingOffMsg_());
      return 'ERR: ' + metaBillingOffMsg_();
    }
    if (!getMetaAccessToken_()) {
      return 'ERR: Thieu META_ACCESS_TOKEN. Mo Cau hinh → Luu token → thu lai.';
    }
    if (!getMetaAdAccountIds_().length) {
      return 'ERR: Thieu Ad Account — them ID TK (act_… / so) vao cot A sheet Quet Mail.';
    }

    ensureAdsBillingSyncSheet_();
    const rules = loadQuetMailBillingRules_();
    Logger.log('syncMetaBilling: sheet OK; QuetMail acts=' + rules.map(function (r) {
      return r.actId;
    }).join(','));

    const fetchRes = fetchMetaBilling_(opts);
    Logger.log('syncMetaBilling: fetch charges=' + fetchRes.charges
      + ' ins=' + fetchRes.inserted + ' upd=' + fetchRes.updated
      + ' skippedActs=' + (fetchRes.skipped ? fetchRes.skipped.length : 0));

    const matchRes = matchBillingAgainstMail_();
    Logger.log('syncMetaBilling: match matched=' + matchRes.matched + ' missing=' + matchRes.missing);

    const alerted = alertMissingMailBilling_(chatId);
    let skipLines = '';
    if (fetchRes.skipped && fetchRes.skipped.length) {
      skipLines = '\n- Bo qua account (thieu quyen/asset):\n'
        + fetchRes.skipped.map(function (s) {
          return '  · ' + s.actId + ': ' + String(s.error || '').slice(0, 80);
        }).join('\n');
    }
    const summary =
      'Meta Billing Sync OK (file tam Ads_Billing_Sync, chua ghi Log)\n'
      + '- Accounts: ' + (fetchRes.accounts || getMetaAdAccountIds_()).join(', ') + '\n'
      + '- Quet Mail rules (act): ' + (rules.length ? rules.length : 0) + '\n'
      + '- API: ' + fetchRes.charges + ' charge(s) (moi ' + fetchRes.inserted + ', cap nhat ' + fetchRes.updated + ')\n'
      + '- Khop mail: ' + matchRes.matched + ' | thieu mail: ' + matchRes.missing + '\n'
      + '- Da canh bao: ' + alerted
      + skipLines
      + (matchRes.missing
        ? '\n(Thieu mail: /scan hoac menu «Ghi charge Meta thieu mail → Log».)'
        : '')
      + (fetchRes.charges === 0 && !(fetchRes.skipped && fetchRes.skipped.length)
        ? '\n(0 charge moi — chay «Sync lai toan bo» neu can quet lai lich su.)'
        : '');

    const target = resolveBillingAlertChatId_(chatId);
    if (target && chatId) {
      try {
        sendMessage(target, '✅ <b>Meta Billing</b> (file tạm, chưa ghi Log)\n' +
          '• API: ' + fetchRes.charges + ' charge(s)\n' +
          '• Khớp: ' + matchRes.matched + ' · thiếu: ' + matchRes.missing + '\n' +
          '• Cảnh báo: ' + alerted +
          (matchRes.missing ? '\n• Bù Log: <code>/scan</code> hoặc menu Ghi charge → Log' : ''));
      } catch (tgErr) {
        Logger.log('syncMetaBilling telegram: ' + tgErr.message);
      }
    }
    Logger.log(summary);
    return summary;
  } catch (e) {
    const detail = (e && e.stack) ? (e.message + '\n' + e.stack) : String(e && e.message ? e.message : e);
    Logger.log('syncMetaBilling ERROR: ' + detail);
    try { notifyMetaBillingError_(e && e.message ? e.message : String(e)); } catch (ignore) {}
    return 'ERR: ' + (e && e.message ? e.message : String(e));
  }
}

/** Menu: quét lại full lookback (bỏ watermark) — dùng khi cần lấy lịch sử cũ. */
function triggerSyncMetaBillingFullUI() {
  if (!isMetaBillingEnabled_()) return triggerSyncMetaBillingUI({ full: true });
  resetMetaBillingWatermarks();
  return triggerSyncMetaBillingUI({ full: true });
}

function triggerSyncMetaBillingUI(opts) {
  var result = '';
  try {
    result = syncMetaBilling(null, opts);
  } catch (e) {
    result = 'ERR: ' + (e && e.message ? e.message : String(e));
    Logger.log('triggerSyncMetaBillingUI: ' + result);
  }
  try {
    SpreadsheetApp.getActive().toast(String(result).slice(0, 200), 'Meta Billing', 8);
  } catch (t) {}
  try {
    SpreadsheetApp.getUi().alert('META BILLING SYNC', String(result || 'Xong'), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (uiErr) {
    Logger.log('triggerSyncMetaBillingUI alert fail: ' + uiErr.message + ' | result=' + result);
  }
  return result;
}

/**
 * Khớp file tạm với Log rồi bù charge thiếu mail.
 * Không tự chạy sau scanMail (scan chỉ ghi Log). Gọi từ menu / sidebar Meta.
 * Field Ví/ĐT/DM/ghi chú = cùng buildQuetMailLogRow_ như scanMail.
 */
function runMatchBillingAfterMail_(chatId) {
  try {
    if (!isMetaBillingEnabled_()) return null;
    if (!getMetaAccessToken_() && !PROP.getProperty('ads_billing_sync_gid')) {
      const ss = getSpreadsheet_();
      if (!(getDynamicGid_('ads_billing_sync_gid') || ss.getSheetByName(SHEET_NAMES.ADS_BILLING_SYNC))) return null;
    }
    ensureAdsBillingSyncSheet_();
    const matchRes = matchBillingAgainstMail_();
    const writeRes = writeMissingMetaBillingToLog_();
    if (writeRes.error) {
      Logger.log('runMatchBillingAfterMail_: write ERR ' + writeRes.error);
    }
    const alerted = alertMissingMailBilling_(chatId);
    if (chatId && writeRes.written > 0) {
      try {
        sendMessage(chatId, '💳 <b>Meta bù Log</b> (thiếu mail): ' + writeRes.written + ' dòng — field giống Quet Mail.');
      } catch (tgErr) {
        Logger.log('runMatchBillingAfterMail_ telegram: ' + tgErr.message);
      }
    }
    return {
      matched: matchRes.matched,
      missing: matchRes.missing,
      written: writeRes.written,
      alerted: alerted
    };
  } catch (e) {
    Logger.log('runMatchBillingAfterMail_: ' + e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Time-driven trigger
// ---------------------------------------------------------------------------

function runScheduledMetaBillingSync() {
  if (!isMetaBillingEnabled_()) {
    Logger.log('runScheduledMetaBillingSync: bỏ qua — META_BILLING_ENABLED=false.');
    enforceMetaBillingOff_();
    return { skipped: true, disabled: true };
  }
  if (!getMetaAccessToken_() || !getMetaAdAccountIds_().length) {
    Logger.log('runScheduledMetaBillingSync: bỏ qua — chưa cấu hình token/accounts.');
    return { skipped: true };
  }
  return syncMetaBilling(null);
}

/** Editor: bật Meta 08:30 mỗi ngày. Lịch chi tiết ở menu Set Trigger. */
function setMetaBillingTriggerManual() {
  if (!isMetaBillingEnabled_()) {
    enforceMetaBillingOff_();
    const msg = metaBillingOffMsg_();
    try { SpreadsheetApp.getActive().toast(msg, 'Meta Billing', 5); } catch (e) {}
    return msg;
  }
  const res = opsSidebarSaveSchedule({
    mail_trigger_on: PROP.getProperty('MAIL_SCAN_TRIGGER_ON') === '1',
    mail_trigger_hour: PROP.getProperty('MAIL_SCAN_TRIGGER_HOUR'),
    mail_trigger_minute: PROP.getProperty('MAIL_SCAN_TRIGGER_MINUTE'),
    meta_trigger_on: true,
    meta_trigger_hour: META_BILLING_TRIGGER_HOUR_DEFAULT,
    meta_trigger_minute: META_BILLING_TRIGGER_MINUTE_DEFAULT
  });
  const msg = (res && res.message) ? res.message : 'Đã lưu lịch Meta.';
  try { SpreadsheetApp.getActive().toast(msg, 'Meta Billing', 5); } catch (e) {}
  return msg;
}
