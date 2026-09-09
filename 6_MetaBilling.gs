// ============================================================================
// 💳 6_METABILLING.GS — META BILLING ĐỐI SOÁT MAIL (v1: cảnh báo, không ghi sổ)
// ============================================================================
// Script Properties:
//   META_ACCESS_TOKEN       — long-lived / System User token (ads_read)
//   META_AD_ACCOUNT_IDS     — act_123,act_456 hoặc 123,456
//   META_BILLING_LOOKBACK_DAYS (tuỳ chọn, mặc định 60)
// ============================================================================

const META_BILLING_TRIGGER_HANDLER_ = 'runScheduledMetaBillingSync';
const META_BILLING_TRIGGER_OK_PROP_ = 'META_BILLING_TRIGGER_OK';

// ---------------------------------------------------------------------------
// Sheet Ads_Billing_Sync
// ---------------------------------------------------------------------------

/** Tạo / lấy sheet đối soát; cache GID vào Script Properties. */
function ensureAdsBillingSyncSheet_() {
  const ss = getSpreadsheet_();
  let sh = null;
  try {
    sh = ss.getSheetByName(SHEET_NAMES.ADS_BILLING_SYNC);
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
  }
  try {
    PROP.setProperty('ads_billing_sync_gid', String(sh.getSheetId()));
  } catch (e2) {}
  return sh;
}

function getAdsBillingSyncSheet_() {
  const gid = Number(PROP.getProperty('ads_billing_sync_gid') || 0);
  if (gid) {
    const byGid = getSheetByGid(gid);
    if (byGid) return byGid;
  }
  return ensureAdsBillingSyncSheet_();
}

// ---------------------------------------------------------------------------
// Config / Phase 0 helpers
// ---------------------------------------------------------------------------

function getMetaAccessToken_() {
  return String(PROP.getProperty('META_ACCESS_TOKEN') || '').trim();
}

/** Parse danh sách act_… từ Script Property META_AD_ACCOUNT_IDS */
function getMetaAdAccountIds_() {
  const raw = String(PROP.getProperty('META_AD_ACCOUNT_IDS') || '').trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map(function (s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (s.indexOf('act_') === 0) return s;
    return 'act_' + s.replace(/^act_/, '');
  }).filter(Boolean);
}

function getMetaBillingLookbackDays_() {
  const n = parseInt(PROP.getProperty('META_BILLING_LOOKBACK_DAYS'), 10);
  return (n > 0) ? n : META_BILLING_LOOKBACK_DAYS_DEFAULT;
}

/**
 * Chạy trên GAS Editor sau khi Lưu META_ACCESS_TOKEN + META_AD_ACCOUNT_IDS (configui).
 * Chỉ Logger + return string — không gửi Telegram (tránh nhiễu khi test).
 */
function testMetaBillingConnection() {
  try {
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
      const msg = 'MISSING_ACCOUNTS — điền Ad Account ID (act_…) rồi Lưu cấu hình.';
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

/**
 * Lấy billing charges từ activities.
 * Lưu ý Meta: ad account thuộc Business thường BẮT BUỘC param business_id.
 * @param {string=} accessTokenOverride
 * @return {Array<{txnId,adAccount,dateStr,amount,currency,eventTime,note}>}
 */
function fetchMetaBillingCharges_(accountIds, lookbackDays, accessTokenOverride) {
  const since = Math.floor((Date.now() - lookbackDays * 86400000) / 1000);
  const out = [];
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

  for (let a = 0; a < accountIds.length; a++) {
    const actId = accountIds[a];
    let nextUrl = null;
    let page = 0;
    const maxPages = 15;
    let rawBillingSeen = 0;
    let parsedOk = 0;
    let skippedParse = 0;

    do {
      let json;
      if (nextUrl) {
        const res = UrlFetchApp.fetch(nextUrl, { muteHttpExceptions: true });
        const code = res.getResponseCode();
        const body = res.getContentText();
        try { json = JSON.parse(body); } catch (e) { json = {}; }
        if (code < 200 || code >= 300) {
          const errMsg = (json.error && json.error.message) || ('HTTP ' + code);
          throw new Error(actId + ': ' + errMsg);
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

      nextUrl = (json.paging && json.paging.next) ? json.paging.next : null;
      page++;
    } while (nextUrl && page < maxPages);

    Logger.log('fetchMetaBilling ' + actId
      + ' lookback=' + lookbackDays
      + ' business_id=' + (businessId || '(none)')
      + ' billingEvents=' + rawBillingSeen
      + ' parsed=' + parsedOk
      + ' skipped=' + skippedParse);
  }

  return out;
}

/**
 * Debug: liệt kê activities (mọi loại) + billing thô — chạy trên GAS Editor.
 * Giúp xem API có trả charge không, extra_data dạng gì, có cần META_BUSINESS_ID không.
 */
function debugMetaBillingActivities() {
  const token = getMetaAccessToken_();
  const accounts = getMetaAdAccountIds_();
  const lookback = Math.max(getMetaBillingLookbackDays_(), 60);
  const businessId = getMetaBusinessId_();
  const lines = [];
  lines.push('lookback=' + lookback + 'd business_id=' + (businessId || '(CHUA SET — neu account thuoc BM thi CAN set)'));

  if (!token || !accounts.length) {
    const msg = 'Thieu token hoac META_AD_ACCOUNT_IDS';
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

function upsertMetaBillingCharges_(charges) {
  const sh = ensureAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  const colCount = ADS_BILLING_HEADERS.length;
  const idToRow = {}; // txnId -> sheet row number

  if (lastRow >= 2) {
    const existing = sh.getRange(2, 1, lastRow - 1, colCount).getValues();
    for (let i = 0; i < existing.length; i++) {
      const id = String(existing[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
      if (id) idToRow[id] = i + 2;
    }
  }

  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const rowNum = idToRow[c.txnId];
    if (rowNum) {
      // Giữ STATUS / MAIL_KEY nếu đã MATCHED hoặc ALERTED; chỉ refresh số liệu
      const status = String(sh.getRange(rowNum, ADS_BILLING_COL.STATUS + 1).getValue() || '').trim();
      sh.getRange(rowNum, ADS_BILLING_COL.AD_ACCOUNT + 1).setValue(c.adAccount);
      sh.getRange(rowNum, ADS_BILLING_COL.NGAY + 1).setValue(c.dateStr);
      sh.getRange(rowNum, ADS_BILLING_COL.SO_TIEN + 1).setValue(c.amount);
      sh.getRange(rowNum, ADS_BILLING_COL.CURRENCY + 1).setValue(c.currency);
      sh.getRange(rowNum, ADS_BILLING_COL.UPDATED_AT + 1).setValue(nowStr);
      sh.getRange(rowNum, ADS_BILLING_COL.EVENT_TIME + 1).setValue(
        Utilities.formatDate(c.eventTime, 'GMT+7', 'yyyy-MM-dd HH:mm:ss')
      );
      if (!status || status === ADS_BILLING_STATUS.SEEN || status === ADS_BILLING_STATUS.MISSING_MAIL) {
        // để matcher quyết định lại
        if (!status) sh.getRange(rowNum, ADS_BILLING_COL.STATUS + 1).setValue(ADS_BILLING_STATUS.SEEN);
      }
      updated++;
    } else {
      const newRow = [
        c.txnId,
        c.adAccount,
        c.dateStr,
        c.amount,
        c.currency,
        ADS_BILLING_STATUS.SEEN,
        '',
        nowStr,
        c.note || '',
        Utilities.formatDate(c.eventTime, 'GMT+7', 'yyyy-MM-dd HH:mm:ss')
      ];
      sh.appendRow(newRow);
      idToRow[c.txnId] = sh.getLastRow();
      inserted++;
    }
  }

  return { inserted: inserted, updated: updated };
}

function fetchMetaBilling_() {
  const accounts = getMetaAdAccountIds_();
  if (!accounts.length) throw new Error('Chưa cấu hình META_AD_ACCOUNT_IDS.');
  const charges = fetchMetaBillingCharges_(accounts, getMetaBillingLookbackDays_());
  const upsert = upsertMetaBillingCharges_(charges);
  return { charges: charges.length, inserted: upsert.inserted, updated: upsert.updated };
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

function findMailKeyForCharge_(charge, mailIndex) {
  const nid = normalizeBillingId_(charge.txnId);
  if (nid && mailIndex.keys[nid]) return mailIndex.keys[nid];

  // ID chứa nhau (mail key dài hơn / ngắn hơn txn)
  const idList = Object.keys(mailIndex.keys);
  for (let i = 0; i < idList.length; i++) {
    const nk = idList[i];
    if (nk.length < 4 || nid.length < 4) continue;
    if (nk.indexOf(nid) !== -1 || nid.indexOf(nk) !== -1) return mailIndex.keys[nk];
  }

  // Ngày + số tiền (± tolerance)
  const amt = Math.abs(Number(charge.amount) || 0);
  const exactKey = charge.dateStr + '|' + Math.round(amt);
  if (mailIndex.byDateAmount[exactKey] && mailIndex.byDateAmount[exactKey].length) {
    return mailIndex.byDateAmount[exactKey][0];
  }
  const prefixes = Object.keys(mailIndex.byDateAmount);
  for (let i = 0; i < prefixes.length; i++) {
    const parts = prefixes[i].split('|');
    if (parts[0] !== charge.dateStr) continue;
    const otherAmt = Number(parts[1]) || 0;
    if (amountsMatchBilling_(amt, otherAmt)) {
      return mailIndex.byDateAmount[prefixes[i]][0];
    }
  }
  return null;
}

/**
 * Khớp Sync với Log mail. Không ghi thêm dòng sổ.
 * @return {{matched:number, missing:number}}
 */
function matchBillingAgainstMail_() {
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { matched: 0, missing: 0 };

  const lookback = getMetaBillingLookbackDays_();
  const mailIndex = collectRecentMailIndex_(lookback);
  const values = sh.getRange(2, 1, lastRow - 1, ADS_BILLING_HEADERS.length).getValues();
  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  let matched = 0;
  let missing = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const txnId = String(row[ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (!txnId) continue;
    const status = String(row[ADS_BILLING_COL.STATUS] || '').trim();
    // Đã khớp rồi thì giữ
    if (status === ADS_BILLING_STATUS.MATCHED_MAIL) {
      matched++;
      continue;
    }

    const charge = {
      txnId: txnId,
      dateStr: String(row[ADS_BILLING_COL.NGAY] || '').trim(),
      amount: Number(row[ADS_BILLING_COL.SO_TIEN]) || 0
    };
    // Chuẩn hoá ngày nếu sheet lưu Date
    const d = parseLogDate_(row[ADS_BILLING_COL.NGAY]);
    if (d) charge.dateStr = Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy');

    const mailKey = findMailKeyForCharge_(charge, mailIndex);
    const sheetRow = i + 2;
    if (mailKey) {
      sh.getRange(sheetRow, ADS_BILLING_COL.STATUS + 1).setValue(ADS_BILLING_STATUS.MATCHED_MAIL);
      sh.getRange(sheetRow, ADS_BILLING_COL.MAIL_KEY + 1).setValue(mailKey);
      sh.getRange(sheetRow, ADS_BILLING_COL.UPDATED_AT + 1).setValue(nowStr);
      matched++;
    } else {
      if (status !== ADS_BILLING_STATUS.ALERTED) {
        sh.getRange(sheetRow, ADS_BILLING_COL.STATUS + 1).setValue(ADS_BILLING_STATUS.MISSING_MAIL);
        sh.getRange(sheetRow, ADS_BILLING_COL.UPDATED_AT + 1).setValue(nowStr);
      }
      missing++;
    }
  }

  return { matched: matched, missing: missing };
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

  const values = sh.getRange(2, 1, lastRow - 1, ADS_BILLING_HEADERS.length).getValues();
  const lines = [];
  const alertRows = [];
  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');

  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][ADS_BILLING_COL.STATUS] || '').trim();
    if (status !== ADS_BILLING_STATUS.MISSING_MAIL) continue;
    const txnId = String(values[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    const dateStr = values[i][ADS_BILLING_COL.NGAY];
    const amount = Number(values[i][ADS_BILLING_COL.SO_TIEN]) || 0;
    const account = String(values[i][ADS_BILLING_COL.AD_ACCOUNT] || '').trim();
    const money = (typeof formatMoney === 'function')
      ? formatMoney(amount)
      : (amount.toLocaleString('vi-VN') + ' đ');
    lines.push('▪️ ' + money + ' · ' + dateStr + ' · <code>' + escapeHtml(txnId) + '</code> · ' + escapeHtml(account));
    alertRows.push(i + 2);
  }

  if (!lines.length) return 0;

  const target = resolveBillingAlertChatId_(chatId);
  if (!target) {
    Logger.log('alertMissingMailBilling_: không có chatId/admin_id — bỏ qua gửi.');
    return 0;
  }

  const msg = '📬 <b>Meta charge chưa thấy mail</b> (' + lines.length + '):\n' + lines.join('\n');
  sendMessage(target, msg);

  for (let r = 0; r < alertRows.length; r++) {
    sh.getRange(alertRows[r], ADS_BILLING_COL.STATUS + 1).setValue(ADS_BILLING_STATUS.ALERTED);
    sh.getRange(alertRows[r], ADS_BILLING_COL.UPDATED_AT + 1).setValue(nowStr);
  }
  return lines.length;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Fetch Meta → upsert Sync → khớp mail → cảnh báo thiếu mail.
 * @param {string|number|null} chatId
 * @return {string} tóm tắt (plain text, an toàn cho alert)
 */
function syncMetaBilling(chatId) {
  try {
    Logger.log('syncMetaBilling: start');
    if (!getMetaAccessToken_()) {
      return 'ERR: Thieu META_ACCESS_TOKEN. Mo Cau hinh → Luu token → thu lai.';
    }
    if (!getMetaAdAccountIds_().length) {
      return 'ERR: Thieu META_AD_ACCOUNT_IDS (act_...).';
    }

    ensureAdsBillingSyncSheet_();
    Logger.log('syncMetaBilling: sheet OK');

    const fetchRes = fetchMetaBilling_();
    Logger.log('syncMetaBilling: fetch charges=' + fetchRes.charges
      + ' ins=' + fetchRes.inserted + ' upd=' + fetchRes.updated);

    const matchRes = matchBillingAgainstMail_();
    Logger.log('syncMetaBilling: match matched=' + matchRes.matched + ' missing=' + matchRes.missing);

    const alerted = alertMissingMailBilling_(chatId);
    const summary =
      'Meta Billing Sync OK\n'
      + '- API: ' + fetchRes.charges + ' charge(s) (moi ' + fetchRes.inserted + ', cap nhat ' + fetchRes.updated + ')\n'
      + '- Khop mail: ' + matchRes.matched + ' | thieu mail: ' + matchRes.missing + '\n'
      + '- Da canh bao: ' + alerted
      + (fetchRes.charges === 0
        ? '\n(Luu y: 0 charge — tang lookback trong config neu can lich su cu.)'
        : '');

    const target = resolveBillingAlertChatId_(chatId);
    if (target && chatId) {
      try {
        sendMessage(target, '✅ <b>Meta Billing Sync</b>\n' +
          '• API: ' + fetchRes.charges + ' charge(s)\n' +
          '• Khớp: ' + matchRes.matched + ' · thiếu: ' + matchRes.missing + '\n' +
          '• Cảnh báo: ' + alerted);
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

function triggerSyncMetaBillingUI() {
  var result = '';
  try {
    result = syncMetaBilling(null);
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

/** Chỉ chạy matcher (sau scanMail) — không gọi Meta API. */
function runMatchBillingAfterMail_(chatId) {
  try {
    if (!getMetaAccessToken_() && !PROP.getProperty('ads_billing_sync_gid')) {
      // Chưa setup Meta — bỏ qua im lặng
      const ss = getSpreadsheet_();
      if (!ss.getSheetByName(SHEET_NAMES.ADS_BILLING_SYNC)) return null;
    }
    ensureAdsBillingSyncSheet_();
    const matchRes = matchBillingAgainstMail_();
    const alerted = alertMissingMailBilling_(chatId);
    return { matched: matchRes.matched, missing: matchRes.missing, alerted: alerted };
  } catch (e) {
    Logger.log('runMatchBillingAfterMail_: ' + e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Time-driven trigger
// ---------------------------------------------------------------------------

function ensureMetaBillingTrigger_() {
  try {
    if (PROP.getProperty(META_BILLING_TRIGGER_OK_PROP_) === '1') return;
    const triggers = ScriptApp.getProjectTriggers();
    let found = false;
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === META_BILLING_TRIGGER_HANDLER_) {
        found = true;
        break;
      }
    }
    if (!found) {
      ScriptApp.newTrigger(META_BILLING_TRIGGER_HANDLER_)
        .timeBased()
        .everyHours(META_BILLING_TRIGGER_HOURS)
        .create();
    }
    PROP.setProperty(META_BILLING_TRIGGER_OK_PROP_, '1');
  } catch (e) {
    Logger.log('ensureMetaBillingTrigger_: ' + e.message);
  }
}

function runScheduledMetaBillingSync() {
  if (!getMetaAccessToken_() || !getMetaAdAccountIds_().length) {
    Logger.log('runScheduledMetaBillingSync: bỏ qua — chưa cấu hình token/accounts.');
    return { skipped: true };
  }
  return syncMetaBilling(null);
}

function setMetaBillingTriggerManual() {
  PROP.deleteProperty(META_BILLING_TRIGGER_OK_PROP_);
  ensureMetaBillingTrigger_();
  const msg = 'Đã bật sync Meta Billing mỗi ' + META_BILLING_TRIGGER_HOURS + ' giờ.';
  try { SpreadsheetApp.getActive().toast(msg, 'Meta Billing', 5); } catch (e) {}
  return msg;
}
