// ============================================================================
// 💳 6_METABILLING.GS — Invoice CSV / Drive → Ads_Billing_Sync (hàng đợi) → Log
// ============================================================================
// Không còn Meta Graph API / token Facebook.
// Nguồn ads: quét mail + Invoice Summary CSV (máy / Drive).
// Ads_Billing_Sync: STATUS trống = chưa đẩy Log; "Đã ghi" = đã có trên Log.
// Flow: CSV → ghi Sync (lọc trùng ID) → sort thời gian → batch 10/cùng tháng → Log.
// ============================================================================

var DRIVE_CSV_INBOX_PROP_ = 'DRIVE_CSV_INBOX_FOLDER_ID';
var DRIVE_CSV_ARCHIVE_PROP_ = 'DRIVE_CSV_ARCHIVE_FOLDER_ID';
var DRIVE_CSV_TRIGGER_ON_PROP_ = 'DRIVE_CSV_TRIGGER_ON';
var DRIVE_CSV_TRIGGER_HANDLER_ = 'runScheduledDriveCsvImport';
var DRIVE_CSV_TRIGGER_HOUR_DEFAULT = 23;
var DRIVE_CSV_TRIGGER_MINUTE_DEFAULT = 0;
var DRIVE_CSV_MAX_BYTES_ = 800000;
var ADS_BILLING_FLUSH_BATCH_ = 10;

// ---------------------------------------------------------------------------
// Sheet Ads_Billing_Sync
// ---------------------------------------------------------------------------

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
  } else if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, ADS_BILLING_HEADERS.length).setValues([ADS_BILLING_HEADERS]);
  } else {
    migrateAdsBillingSyncLayout_(sh);
  }
  normalizeAdsBillingLegacyStatus_(sh);
  formatAdsBillingSyncSheet_(sh);
  try {
    PROP.setProperty('ads_billing_sync_gid', String(sh.getSheetId()));
  } catch (e2) {}
  return sh;
}

function migrateAdsBillingSyncLayout_(sh) {
  if (!sh || sh.getLastRow() < 1) return;
  const want = ADS_BILLING_HEADERS.length;
  const headerRow = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), want)).getValues()[0];
  const headers = headerRow.map(function (h) { return String(h || '').trim(); });
  const mailKeyIdx = headers.indexOf('Mail Unique Key');
  if (mailKeyIdx >= 0) {
    sh.deleteColumn(mailKeyIdx + 1);
  }
  const h1 = String(sh.getRange(1, 1).getValue() || '').trim();
  if (h1 !== ADS_BILLING_HEADERS[0]) {
    sh.getRange(1, 1, 1, want).setValues([ADS_BILLING_HEADERS]);
    sh.getRange(1, 1, 1, want).setFontWeight('bold');
  }
}

/** Đổi STATUS cũ (LOGGED_META/MATCHED_MAIL → Đã ghi; SEEN/MISSING… → trống). */
function normalizeAdsBillingLegacyStatus_(sh) {
  if (!sh || sh.getLastRow() < 2) return;
  const colCount = ADS_BILLING_HEADERS.length;
  const numData = sh.getLastRow() - 1;
  const values = sh.getRange(2, 1, numData, colCount).getValues();
  let dirty = false;
  for (let i = 0; i < values.length; i++) {
    const st = String(values[i][ADS_BILLING_COL.STATUS] || '').trim();
    if (isAdsBillingDoneStatus_(st)) {
      if (st !== ADS_BILLING_STATUS.DONE) {
        values[i][ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.DONE;
        dirty = true;
      }
    } else if (st) {
      values[i][ADS_BILLING_COL.STATUS] = '';
      dirty = true;
    }
  }
  if (dirty) {
    prepAdsBillingTextCols_(sh, values.length);
    sh.getRange(2, 1, values.length, colCount).setValues(values);
  }
}

/** getRange(row, col, numRows, numCols) — tham số 3/4 là số hàng/cột. */
function prepAdsBillingTextCols_(sh, numDataRows) {
  if (!sh || numDataRows < 1) return;
  const textFmt = ADS_BILLING_TS_FMT || '@';
  try {
    sh.getRange(2, ADS_BILLING_COL.NGAY + 1, numDataRows, 1).setNumberFormat(textFmt);
    sh.getRange(2, ADS_BILLING_COL.UPDATED_AT + 1, numDataRows, 1).setNumberFormat(textFmt);
    sh.getRange(2, ADS_BILLING_COL.EVENT_TIME + 1, numDataRows, 1).setNumberFormat(textFmt);
  } catch (e) {}
}

function formatAdsBillingSyncSheet_(sh) {
  if (!sh) return;
  const numRows = Math.max(sh.getLastRow() - 1, 1);
  const colCount = ADS_BILLING_HEADERS.length;
  try { sh.setFrozenRows(1); } catch (e0) {}
  try { sh.getRange(1, 1, 1, colCount).setFontWeight('bold'); } catch (e1) {}
  try {
    sh.getRange(2, ADS_BILLING_COL.SO_TIEN + 1, numRows, 1).setNumberFormat(ADS_BILLING_MONEY_FMT);
  } catch (e2) {}
  try {
    const textFmt = ADS_BILLING_TS_FMT || '@';
    const dateCols = [
      { col: ADS_BILLING_COL.NGAY, withTime: false },
      { col: ADS_BILLING_COL.UPDATED_AT, withTime: true },
      { col: ADS_BILLING_COL.EVENT_TIME, withTime: true }
    ];
    for (let i = 0; i < dateCols.length; i++) {
      const range = sh.getRange(2, dateCols[i].col + 1, numRows, 1);
      range.setNumberFormat(textFmt);
      const vals = range.getValues();
      let dirty = false;
      for (let r = 0; r < vals.length; r++) {
        const v = vals[r][0];
        if (v instanceof Date && !isNaN(v.getTime())) {
          vals[r][0] = Utilities.formatDate(v, 'GMT+7',
            dateCols[i].withTime ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy');
          dirty = true;
        }
      }
      if (dirty) range.setValues(vals);
    }
  } catch (e3) {}
}

function getAdsBillingSyncSheet_() {
  const gid = Number(PROP.getProperty('ads_billing_sync_gid') || 0);
  if (gid) {
    const byGid = getSheetByGid(gid);
    if (byGid) {
      migrateAdsBillingSyncLayout_(byGid);
      return byGid;
    }
  }
  return ensureAdsBillingSyncSheet_();
}

function isAdsBillingDoneStatus_(raw) {
  const st = String(raw || '').trim();
  if (!st) return false;
  if (st === ADS_BILLING_STATUS.DONE) return true;
  // Legacy Meta statuses
  return st === 'LOGGED_META' || st === 'MATCHED_MAIL' || st === 'Đã ghi';
}

function isAdsBillingPendingStatus_(raw) {
  return !isAdsBillingDoneStatus_(raw);
}

// ---------------------------------------------------------------------------
// Quet Mail → default Ví / ĐT / DM cho CSV Ads
// ---------------------------------------------------------------------------

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
      if (!actId) continue;
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

function normalizeMetaActIdFromKeyword_(kw) {
  const s = String(kw || '').trim();
  if (!s) return '';
  let m = s.match(/^act_(\d{5,20})$/i);
  if (m) return 'act_' + m[1];
  m = s.match(/^(\d{5,20})$/);
  if (m) return 'act_' + m[1];
  m = s.match(/act_(\d{5,20})/i);
  if (m) return 'act_' + m[1];
  m = s.match(/(\d{10,20})/);
  if (m) return 'act_' + m[1];
  return '';
}

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

// ---------------------------------------------------------------------------
// Log UNIQUE_KEY index (check trùng khi flush)
// ---------------------------------------------------------------------------

function normalizeBillingId_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Map normalized UNIQUE_KEY → original, trong 1 Log tháng. */
function collectMonthLogKeyIndex_(monthKey) {
  const keys = {};
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(monthSheetName_(monthKey));
  if (!sh || sh.getLastRow() < 3) return keys;
  const values = sh.getRange(3, 1, sh.getLastRow() - 2, 9).getValues();
  for (let i = 0; i < values.length; i++) {
    const uk = String(values[i][MONTH_LOG_COL.UNIQUE_KEY] || '').trim();
    if (!uk) continue;
    keys[normalizeBillingId_(uk)] = uk;
  }
  return keys;
}

function findLogKeyByBillingId_(txnId, keyIndex, used) {
  const usedMap = used || {};
  const isFree = function (uk) {
    return !!uk && !usedMap[normalizeBillingId_(uk)];
  };
  const nid = normalizeBillingId_(txnId);
  if (nid && isFree(keyIndex[nid])) return keyIndex[nid];

  const halves = String(txnId || '').split('-').map(normalizeBillingId_)
    .filter(function (p) { return p.length >= 6; });
  for (let h = 0; h < halves.length; h++) {
    if (isFree(keyIndex[halves[h]])) return keyIndex[halves[h]];
  }

  const idList = Object.keys(keyIndex);
  for (let i = 0; i < idList.length; i++) {
    const nk = idList[i];
    if (nk.length < 6 || !isFree(keyIndex[nk])) continue;
    if (nid.length >= 6 && (nk.indexOf(nid) !== -1 || nid.indexOf(nk) !== -1)) {
      return keyIndex[nk];
    }
    for (let h = 0; h < halves.length; h++) {
      if (nk.indexOf(halves[h]) !== -1 || halves[h].indexOf(nk) !== -1) return keyIndex[nk];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 1: CSV → Ads_Billing_Sync (STATUS trống; ID Đã ghi thì bỏ qua)
// ---------------------------------------------------------------------------

/**
 * Upsert charges vào Sync. Trùng ID đã Đã ghi → bỏ. Trùng ID đang chờ → cập nhật.
 * @return {{inserted:number, updated:number, skippedDone:number}}
 */
function stageChargesToAdsBillingSync_(charges) {
  ensureAdsBillingSyncSheet_();
  const sh = getAdsBillingSyncSheet_();
  const colCount = ADS_BILLING_HEADERS.length;
  const lastRow = sh.getLastRow();
  // getRange(row, col, numRows, numCols)
  const grid = lastRow >= 2
    ? sh.getRange(2, 1, lastRow - 1, colCount).getValues()
    : [];
  const indexById = {};
  for (let i = 0; i < grid.length; i++) {
    const id = String(grid[i][ADS_BILLING_COL.META_TXN_ID] || '').trim();
    if (id) indexById[normalizeBillingId_(id)] = i;
  }

  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  let inserted = 0;
  let updated = 0;
  let skippedDone = 0;
  const newRows = [];

  for (let c = 0; c < charges.length; c++) {
    const ch = charges[c];
    const txnId = String(ch.txnId || '').trim();
    if (!txnId) continue;
    const nid = normalizeBillingId_(txnId);
    const eventTimeStr = ch.eventTime instanceof Date && !isNaN(ch.eventTime.getTime())
      ? Utilities.formatDate(ch.eventTime, 'GMT+7', 'dd/MM/yyyy HH:mm:ss')
      : String(ch.dateStr || '');
    const pay = invoicePayNoteFromSync_(ch.note) || String(ch.note || '').trim() || 'CSV Invoice';

    const idx = indexById[nid];
    if (idx != null) {
      const row = grid[idx];
      if (isAdsBillingDoneStatus_(row[ADS_BILLING_COL.STATUS])) {
        skippedDone++;
        continue;
      }
      row[ADS_BILLING_COL.META_TXN_ID] = txnId;
      row[ADS_BILLING_COL.AD_ACCOUNT] = ch.adAccount || row[ADS_BILLING_COL.AD_ACCOUNT];
      row[ADS_BILLING_COL.NGAY] = ch.dateStr;
      row[ADS_BILLING_COL.SO_TIEN] = ch.amount;
      row[ADS_BILLING_COL.CURRENCY] = ch.currency || 'VND';
      row[ADS_BILLING_COL.STATUS] = '';
      row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
      if (pay) row[ADS_BILLING_COL.GHI_CHU] = pay;
      row[ADS_BILLING_COL.EVENT_TIME] = eventTimeStr;
      updated++;
      continue;
    }

    const newRow = new Array(colCount);
    newRow[ADS_BILLING_COL.META_TXN_ID] = txnId;
    newRow[ADS_BILLING_COL.AD_ACCOUNT] = ch.adAccount || '';
    newRow[ADS_BILLING_COL.NGAY] = ch.dateStr;
    newRow[ADS_BILLING_COL.SO_TIEN] = ch.amount;
    newRow[ADS_BILLING_COL.CURRENCY] = ch.currency || 'VND';
    newRow[ADS_BILLING_COL.STATUS] = '';
    newRow[ADS_BILLING_COL.UPDATED_AT] = nowStr;
    newRow[ADS_BILLING_COL.GHI_CHU] = pay;
    newRow[ADS_BILLING_COL.EVENT_TIME] = eventTimeStr;
    indexById[nid] = grid.length + newRows.length;
    newRows.push(newRow);
    inserted++;
  }

  if (grid.length) {
    prepAdsBillingTextCols_(sh, grid.length);
    sh.getRange(2, 1, grid.length, colCount).setValues(grid);
  }
  if (newRows.length) {
    const start = Math.max(sh.getLastRow() + 1, 2);
    prepAdsBillingTextCols_(sh, Math.max(sh.getLastRow() - 1, 0) + newRows.length);
    sh.getRange(start, 1, newRows.length, colCount).setValues(newRows);
  }
  formatAdsBillingSyncSheet_(sh);
  return { inserted: inserted, updated: updated, skippedDone: skippedDone };
}

/** Sort toàn bộ dòng Sync theo Event Time / Ngày (cũ → mới). */
function sortAdsBillingSyncByTime_() {
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return;
  const colCount = ADS_BILLING_HEADERS.length;
  const numData = lastRow - 1;
  const values = sh.getRange(2, 1, numData, colCount).getValues();
  values.sort(function (a, b) {
    const ta = adsBillingRowTimeMs_(a);
    const tb = adsBillingRowTimeMs_(b);
    if (ta !== tb) return ta - tb;
    return String(a[ADS_BILLING_COL.META_TXN_ID] || '').localeCompare(
      String(b[ADS_BILLING_COL.META_TXN_ID] || ''));
  });
  prepAdsBillingTextCols_(sh, values.length);
  sh.getRange(2, 1, values.length, colCount).setValues(values);
  formatAdsBillingSyncSheet_(sh);
}

function adsBillingRowTimeMs_(row) {
  const et = parseLogDate_(row[ADS_BILLING_COL.EVENT_TIME])
    || parseInvoiceCsvDate_(row[ADS_BILLING_COL.EVENT_TIME]);
  if (et) return et.getTime();
  const d = parseLogDate_(row[ADS_BILLING_COL.NGAY]);
  return d ? d.getTime() : 0;
}

function adsBillingRowMonthKey_(row) {
  const d = parseLogDate_(row[ADS_BILLING_COL.NGAY])
    || parseLogDate_(row[ADS_BILLING_COL.EVENT_TIME])
    || parseInvoiceCsvDate_(row[ADS_BILLING_COL.EVENT_TIME]);
  if (!d) return '';
  return Utilities.formatDate(d, 'GMT+7', 'MM_yyyy');
}

/**
 * Stage 1 file CSV vào Sync (chưa flush Log).
 * @return {{ok:boolean, message:string, staged:number, skippedDone:number}}
 */
function stageInvoiceCsvFile_(csvText, fileName) {
  const parsed = parseMetaInvoiceCsv_(csvText);
  if (!parsed.charges.length) {
    throw new Error('Không có giao dịch Visa/Mastercard trong CSV (lọc theo tiền tố PTTT).');
  }
  const resolved = resolveInvoiceCsvAccount_(parsed.accountRaw);
  if (resolved.error) throw new Error(resolved.error);

  const actId = resolved.actId;
  const charges = parsed.charges;
  for (let i = 0; i < charges.length; i++) {
    charges[i].adAccount = actId;
  }

  const upsert = stageChargesToAdsBillingSync_(charges);
  const fname = String(fileName || '').trim() || '(không tên)';
  const staged = upsert.inserted + upsert.updated;
  const lines = [
    'CSV → Sync OK',
    '- File: ' + fname,
    '- TK: ' + actId,
    '- Ghi Sync: ' + staged + ' (mới ' + upsert.inserted + ', cập nhật chờ ' + upsert.updated + ')',
    '- Bỏ qua (đã Đã ghi): ' + upsert.skippedDone
  ];
  if (parsed.period) lines.splice(3, 0, '- Kỳ: ' + parsed.period);
  return {
    ok: true,
    message: lines.join('\n'),
    staged: staged,
    skippedDone: upsert.skippedDone
  };
}

/**
 * Một file: stage + sort + flush (tiện upload lẻ).
 */
function ingestMetaInvoiceCsv_(csvText, fileName) {
  const staged = stageInvoiceCsvFile_(csvText, fileName);
  sortAdsBillingSyncByTime_();
  const flushed = flushAdsBillingQueueToLog_();
  return staged.message + '\n\n' + flushed.message;
}

// ---------------------------------------------------------------------------
// Phase 2: Sync (STATUS trống) → Log theo batch 10 / cùng tháng
// ---------------------------------------------------------------------------

/**
 * Đẩy mọi dòng STATUS trống sang Log.
 * Mỗi batch ≤ 10, cùng tháng; trùng Log cũng đánh Đã ghi.
 * Ngắt giữa chừng → lần sau chỉ lấy dòng còn trống.
 */
function flushAdsBillingQueueToLog_() {
  ensureAdsBillingSyncSheet_();
  sortAdsBillingSyncByTime_();

  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    return { ok: true, message: 'Sync trống — không có gì để đẩy Log.', written: 0, marked: 0 };
  }

  const colCount = ADS_BILLING_HEADERS.length;
  const numData = lastRow - 1;
  const values = sh.getRange(2, 1, numData, colCount).getValues();
  const pendingIdx = [];
  for (let i = 0; i < values.length; i++) {
    if (isAdsBillingPendingStatus_(values[i][ADS_BILLING_COL.STATUS])) {
      pendingIdx.push(i);
    }
  }
  if (!pendingIdx.length) {
    return { ok: true, message: 'Không còn dòng Sync chờ (STATUS trống).', written: 0, marked: 0 };
  }

  const nowStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  const liveData = (typeof getLiveData === 'function') ? getLiveData() : null;
  let written = 0;
  let marked = 0;
  let batchCount = 0;
  let cursor = 0;

  while (cursor < pendingIdx.length) {
    const firstIdx = pendingIdx[cursor];
    const monthKey = adsBillingRowMonthKey_(values[firstIdx]);
    if (!monthKey) {
      cursor++;
      continue;
    }

    const batchIdx = [];
    while (cursor < pendingIdx.length && batchIdx.length < ADS_BILLING_FLUSH_BATCH_) {
      const idx = pendingIdx[cursor];
      const mk = adsBillingRowMonthKey_(values[idx]);
      if (mk !== monthKey) break;
      batchIdx.push(idx);
      cursor++;
    }
    if (!batchIdx.length) {
      cursor++;
      continue;
    }

    const keyIndex = collectMonthLogKeyIndex_(monthKey);
    const used = {};
    const batchData = [];
    const defaultsCache = {};

    for (let b = 0; b < batchIdx.length; b++) {
      const idx = batchIdx[b];
      const row = values[idx];
      const txnId = String(row[ADS_BILLING_COL.META_TXN_ID] || '').trim();
      if (!txnId) {
        row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.DONE;
        row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
        marked++;
        continue;
      }

      const hit = findLogKeyByBillingId_(txnId, keyIndex, used);
      if (hit) {
        used[normalizeBillingId_(hit)] = true;
        used[normalizeBillingId_(txnId)] = true;
        row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.DONE;
        row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
        marked++;
        continue;
      }

      let dateStr = String(row[ADS_BILLING_COL.NGAY] || '').trim();
      const d = parseLogDate_(row[ADS_BILLING_COL.NGAY]);
      if (d) dateStr = Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy');
      const amount = Math.abs(Number(row[ADS_BILLING_COL.SO_TIEN]) || 0);
      if (!dateStr || !(amount > 0)) {
        row[ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.DONE;
        row[ADS_BILLING_COL.UPDATED_AT] = nowStr;
        marked++;
        continue;
      }

      const actId = String(row[ADS_BILLING_COL.AD_ACCOUNT] || '').trim();
      if (!defaultsCache[actId]) defaultsCache[actId] = resolveBillingLogDefaults_(actId);
      const pay = invoicePayNoteFromSync_(row[ADS_BILLING_COL.GHI_CHU]);
      let data = buildQuetMailLogRow_(dateStr, amount, defaultsCache[actId], pay);
      if (liveData && typeof normalizeTransactionForSheetWrite === 'function') {
        data = normalizeTransactionForSheetWrite(data, liveData);
      }
      batchData.push({ uniqueKey: txnId, data: data });
      used[normalizeBillingId_(txnId)] = true;
      keyIndex[normalizeBillingId_(txnId)] = txnId;
    }

    if (batchData.length) {
      const saveRes = saveBatchToMonthShards(batchData);
      if (saveRes !== true) {
        prepAdsBillingTextCols_(sh, values.length);
        sh.getRange(2, 1, values.length, colCount).setValues(values);
        formatAdsBillingSyncSheet_(sh);
        return {
          ok: false,
          message: 'Flush dừng — lỗi ghi Log: ' + String(saveRes)
            + '\nĐã đánh Đã ghi: ' + marked + ', đã ghi mới: ' + written
            + '. Chạy lại để tiếp tục dòng còn trống.',
          written: written,
          marked: marked
        };
      }
      written += batchData.length;
      for (let b = 0; b < batchIdx.length; b++) {
        const idx = batchIdx[b];
        if (isAdsBillingPendingStatus_(values[idx][ADS_BILLING_COL.STATUS])) {
          values[idx][ADS_BILLING_COL.STATUS] = ADS_BILLING_STATUS.DONE;
          values[idx][ADS_BILLING_COL.UPDATED_AT] = nowStr;
          marked++;
        }
      }
    }

    batchCount++;
    prepAdsBillingTextCols_(sh, values.length);
    sh.getRange(2, 1, values.length, colCount).setValues(values);
  }

  formatAdsBillingSyncSheet_(sh);
  const remain = countAdsBillingPending_();
  const lines = [
    'Flush Sync → Log xong',
    '- Batch: ' + batchCount,
    '- Ghi mới Log: ' + written,
    '- Đánh Đã ghi: ' + marked,
    '- Còn chờ: ' + remain
  ];
  return { ok: remain === 0, message: lines.join('\n'), written: written, marked: marked, remain: remain };
}

function countAdsBillingPending_() {
  const sh = getAdsBillingSyncSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const numData = lastRow - 1;
  const statusCol = sh.getRange(2, ADS_BILLING_COL.STATUS + 1, numData, 1).getValues();
  let n = 0;
  for (let i = 0; i < statusCol.length; i++) {
    if (isAdsBillingPendingStatus_(statusCol[i][0])) n++;
  }
  return n;
}

function triggerFlushAdsBillingQueueUI() {
  try {
    const res = flushAdsBillingQueueToLog_();
    const msg = (res && res.message) ? res.message : 'Xong';
    try { SpreadsheetApp.getActive().toast(msg.replace(/\n/g, ' | ').slice(0, 200), 'Ads Sync → Log', 8); } catch (e) {}
    return msg;
  } catch (e) {
    const m = (e && e.message) ? e.message : String(e);
    try { SpreadsheetApp.getActive().toast(m, 'Ads Sync → Log', 8); } catch (e2) {}
    return m;
  }
}

// ---------------------------------------------------------------------------
// Parse Invoice Summary CSV
// ---------------------------------------------------------------------------

function parseMetaInvoiceCsv_(csvText) {
  const text = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!text) throw new Error('File CSV trống.');
  if (text.length > DRIVE_CSV_MAX_BYTES_) throw new Error('File CSV quá lớn (tối đa ~800KB).');

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

  // Layout B: Meta ghi PTTT chung phía trên bảng (không có cột PTTT).
  let defaultPay = extractInvoiceCsvDefaultPay_(rows, headerIdx);
  const charges = [];
  const seen = {};
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const joined = row.join(' ');
    // Đổi khối PTTT giữa chừng (hiếm) → cập nhật mặc định cho các dòng sau.
    const sectionPay = parseInvoiceCsvPayLine_(joined);
    if (sectionPay) {
      defaultPay = sectionPay;
      continue;
    }
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
    // Ưu tiên cột từng dòng; không có thì dùng PTTT mặc định đầu file.
    let pay = (col.pay >= 0) ? normalizeInvoicePayMethod_(row[col.pay]) : '';
    if (!pay) pay = defaultPay;
    // Chỉ nhận giao dịch PTTT thẻ (Visa / Mastercard…)
    if (!isCardPayMethod_(pay)) continue;

    charges.push({
      txnId: txn,
      adAccount: '',
      dateStr: dateStr,
      amount: amount,
      currency: currency,
      eventTime: eventTime,
      note: pay
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

/** PTTT chung phía trên header (layout 1 thẻ cả kỳ). */
function extractInvoiceCsvDefaultPay_(rows, untilIdx) {
  const end = (untilIdx == null || untilIdx < 0) ? (rows || []).length : untilIdx;
  for (let i = 0; i < end; i++) {
    const pay = parseInvoiceCsvPayLine_(((rows[i] || []).join(' ')));
    if (pay) return pay;
  }
  return '';
}

/** Dòng kiểu "Phương thức thanh toán: Visa ···· 1225". */
function parseInvoiceCsvPayLine_(joined) {
  const s = String(joined || '').replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const m = s.match(/^(?:Phương\s*thức\s*thanh\s*toán|Payment\s*method|Hình\s*thức\s*thanh\s*toán)\s*[:：]\s*(.+)$/i);
  return m ? normalizeInvoicePayMethod_(m[1]) : '';
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

function normalizeInvoicePayMethod_(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^CSV\s*[·•.\-–]\s*/i, '');
  return s;
}

function isInvoicePayNote_(raw) {
  return isCardPayMethod_(raw);
}

function invoicePayNoteFromSync_(raw) {
  const s = normalizeInvoicePayMethod_(raw);
  return isCardPayMethod_(s) ? s : '';
}

// ---------------------------------------------------------------------------
// Drive Invoice CSV
// ---------------------------------------------------------------------------

function parseDriveFolderId_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return '';
}

function getDriveFolderSafe_(folderId) {
  const id = String(folderId || '').trim();
  if (!id) return { error: 'Chưa có folderId.' };
  try {
    const folder = DriveApp.getFolderById(id);
    return { folder: folder, id: id, name: folder.getName() };
  } catch (e) {
    return { error: 'Không mở được folder (' + id + '): ' + ((e && e.message) ? e.message : e) };
  }
}

function getDriveCsvFolderState_() {
  const inboxId = String(PROP.getProperty(DRIVE_CSV_INBOX_PROP_) || '').trim();
  const archiveId = String(PROP.getProperty(DRIVE_CSV_ARCHIVE_PROP_) || '').trim();
  const out = {
    inbox_folder_id: inboxId,
    archive_folder_id: archiveId,
    inbox_folder_name: '',
    archive_folder_name: '',
    inbox_ok: false,
    archive_ok: false,
    ready: false,
    pending_csv: 0,
    pending_sync: 0
  };
  if (inboxId) {
    const r = getDriveFolderSafe_(inboxId);
    if (r.folder) {
      out.inbox_ok = true;
      out.inbox_folder_name = r.name;
      out.pending_csv = countDriveCsvInFolder_(r.folder);
    }
  }
  if (archiveId) {
    const r2 = getDriveFolderSafe_(archiveId);
    if (r2.folder) {
      out.archive_ok = true;
      out.archive_folder_name = r2.name;
    }
  }
  try { out.pending_sync = countAdsBillingPending_(); } catch (e) {}
  out.ready = !!(out.inbox_ok && out.archive_ok && inboxId !== archiveId);
  return out;
}

function countDriveCsvInFolder_(folder) {
  let n = 0;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (/\.csv$/i.test(f.getName())) n++;
  }
  return n;
}

function saveDriveCsvFolders_(inboxRaw, archiveRaw) {
  const inboxId = parseDriveFolderId_(inboxRaw);
  const archiveId = parseDriveFolderId_(archiveRaw);
  if (!inboxId) return { ok: false, message: 'Folder đọc: dán link hoặc ID folder Drive.' };
  if (!archiveId) return { ok: false, message: 'Folder lưu: dán link hoặc ID folder Drive.' };
  if (inboxId === archiveId) {
    return { ok: false, message: 'Folder đọc và folder lưu phải khác nhau.' };
  }
  const inbox = getDriveFolderSafe_(inboxId);
  if (inbox.error) return { ok: false, message: 'Folder đọc — ' + inbox.error };
  const archive = getDriveFolderSafe_(archiveId);
  if (archive.error) return { ok: false, message: 'Folder lưu — ' + archive.error };

  PROP.setProperty(DRIVE_CSV_INBOX_PROP_, inboxId);
  PROP.setProperty(DRIVE_CSV_ARCHIVE_PROP_, archiveId);
  const state = getDriveCsvFolderState_();
  return {
    ok: true,
    message: 'Đã lưu folder Drive.\nĐọc: ' + inbox.name + '\nLưu: ' + archive.name
      + (state.pending_csv ? ('\nCSV đang chờ: ' + state.pending_csv) : ''),
    drive: state
  };
}

/**
 * Inbox CSV → stage Sync → Archive; rồi flush Log (batch).
 */
function importDriveInvoiceCsvFolder_() {
  const inboxId = String(PROP.getProperty(DRIVE_CSV_INBOX_PROP_) || '').trim();
  const archiveId = String(PROP.getProperty(DRIVE_CSV_ARCHIVE_PROP_) || '').trim();
  if (!inboxId || !archiveId) {
    throw new Error('Chưa cấu hình folder đọc / folder lưu trên tab Drive CSV.');
  }
  if (inboxId === archiveId) {
    throw new Error('Folder đọc và folder lưu đang trùng ID.');
  }
  const inbox = getDriveFolderSafe_(inboxId);
  if (inbox.error) throw new Error('Folder đọc — ' + inbox.error);
  const archive = getDriveFolderSafe_(archiveId);
  if (archive.error) throw new Error('Folder lưu — ' + archive.error);

  const list = [];
  const files = inbox.folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (/\.csv$/i.test(f.getName() || '')) list.push(f);
  }

  const okLines = [];
  const errLines = [];
  let okN = 0;
  let errN = 0;

  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const fname = file.getName() || ('file_' + (i + 1) + '.csv');
    try {
      if (file.getSize() > DRIVE_CSV_MAX_BYTES_) {
        errN++;
        errLines.push(fname + ': quá lớn');
        continue;
      }
      const csvText = file.getBlob().getDataAsString('UTF-8');
      if (!String(csvText || '').trim()) {
        errN++;
        errLines.push(fname + ': trống');
        continue;
      }
      const staged = stageInvoiceCsvFile_(csvText, fname);
      try {
        file.moveTo(archive.folder);
      } catch (moveErr) {
        errN++;
        errLines.push(fname + ': đã stage Sync nhưng chuyển Archive lỗi — '
          + ((moveErr && moveErr.message) ? moveErr.message : moveErr));
        continue;
      }
      okN++;
      okLines.push(fname + ' — staged ' + staged.staged);
    } catch (e) {
      errN++;
      errLines.push(fname + ': ' + ((e && e.message) ? e.message : e));
    }
  }

  let flushMsg = '';
  if (okN > 0 || countAdsBillingPending_() > 0) {
    const flushed = flushAdsBillingQueueToLog_();
    flushMsg = flushed.message;
  }

  const lines = [
    'Drive CSV: ' + okN + ' OK / ' + errN + ' lỗi / ' + list.length + ' file',
    'Đọc: ' + inbox.name,
    'Lưu: ' + archive.name
  ];
  if (okLines.length) lines.push('', '— Stage Sync —', okLines.join('\n'));
  if (errLines.length) lines.push('', '— Lỗi (giữ Inbox) —', errLines.join('\n'));
  if (flushMsg) lines.push('', '— Flush Log —', flushMsg);
  if (!list.length && !flushMsg) {
    lines.push('Không có file .csv trong folder đọc.');
    if (countAdsBillingPending_() > 0) {
      const flushed = flushAdsBillingQueueToLog_();
      lines.push('', '— Flush Log (còn chờ) —', flushed.message);
    }
  }

  return {
    ok: errN === 0,
    message: lines.join('\n'),
    okN: okN,
    errN: errN,
    total: list.length
  };
}

function runScheduledDriveCsvImport() {
  if (PROP.getProperty(DRIVE_CSV_TRIGGER_ON_PROP_) !== '1') {
    Logger.log('runScheduledDriveCsvImport: bỏ qua — trigger tắt.');
    return { skipped: true };
  }
  try {
    const res = importDriveInvoiceCsvFolder_();
    Logger.log('runScheduledDriveCsvImport: ' + String(res && res.message || '').slice(0, 800));
    return res;
  } catch (e) {
    Logger.log('runScheduledDriveCsvImport ERROR: ' + ((e && e.message) ? e.message : e));
    throw e;
  }
}
