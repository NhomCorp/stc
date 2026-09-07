// ============================================================================
// 📊 5_REPORTREBUILD.GS — HYBRID: Report tháng (script) + Bao Cao link công thức
// Dirty-set · rebuild hẹp · lọc CHECK / Chưa phân loại · timestamp · trigger
// ============================================================================

const REPORT_DIRTY_PROP_ = 'DIRTY_REPORT_MONTHS';
const REPORT_REFRESH_TRIGGER_HANDLER_ = 'runScheduledDirtyReportRefresh';
const REPORT_REFRESH_INTERVAL_MINUTES_ = 15;
const REPORT_MONTH_TITLE_ = 'Báo cáo tháng:';
const REPORT_TS_A1_ = 'D1';
const BAO_CAO_TS_A1_ = 'F1';
const UNCLASSIFIED_LABEL_ = 'Chưa phân loại';

// ---------------------------------------------------------------------------
// Dirty-set
// ---------------------------------------------------------------------------

function getDirtyMonths_() {
  try {
    const raw = PROP.getProperty(REPORT_DIRTY_PROP_);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function setDirtyMonths_(list) {
  const uniq = [];
  const seen = {};
  (list || []).forEach(function (k) {
    const key = String(k || '').trim();
    if (!key || seen[key]) return;
    seen[key] = true;
    uniq.push(key);
  });
  if (uniq.length) PROP.setProperty(REPORT_DIRTY_PROP_, JSON.stringify(uniq));
  else PROP.deleteProperty(REPORT_DIRTY_PROP_);
  return uniq;
}

/** Đánh dấu tháng dirty + badge trên Report (không rebuild). */
function markMonthsDirty_(monthKeys) {
  if (!monthKeys || !monthKeys.length) return getDirtyMonths_();
  const merged = getDirtyMonths_().concat(monthKeys);
  const dirty = setDirtyMonths_(merged);
  const ss = getSpreadsheet_();
  (monthKeys || []).forEach(function (mk) {
    const rpt = ss.getSheetByName(monthReportSheetName_(mk));
    if (rpt) {
      rpt.getRange(REPORT_TS_A1_).setValue('⚠ Có thay đổi chưa vào báo cáo')
        .setFontColor('#B45309').setFontWeight('bold');
    }
  });
  return dirty;
}

function clearMonthsDirty_(monthKeys) {
  if (!monthKeys || !monthKeys.length) return getDirtyMonths_();
  const remove = {};
  monthKeys.forEach(function (k) { remove[String(k)] = true; });
  const left = getDirtyMonths_().filter(function (k) { return !remove[String(k)]; });
  return setDirtyMonths_(left);
}

/**
 * Sau khi Log đổi: dirty + rebuild ngay các tháng đụng (P0).
 * Gọi SAU khi đã nhả LockService ghi Log.
 */
function notifyLogMonthsChanged_(monthKeys) {
  const keys = (monthKeys || []).filter(Boolean);
  if (!keys.length) return { rebuilt: [], errors: [] };
  markMonthsDirty_(keys);
  return rebuildMonthsNow_(keys);
}

// ---------------------------------------------------------------------------
// Lọc ghi nhận (rule B: CHECK* hoặc còn Chưa phân loại → chưa ghi nhận)
// ---------------------------------------------------------------------------

function normalizeReportLabel_(val) {
  return String(val == null ? '' : val).trim();
}

function isRowRecognized_(row) {
  const status = normalizeReportLabel_(row[MONTH_LOG_COL.STATUS]).toUpperCase();
  if (status.indexOf('CHECK') >= 0) return false;
  const vi = normalizeReportLabel_(row[MONTH_LOG_COL.VI]);
  const dt = normalizeReportLabel_(row[MONTH_LOG_COL.DOI_TUONG]);
  const dm = normalizeReportLabel_(row[MONTH_LOG_COL.DANH_MUC_CON]);
  if (!vi || vi === UNCLASSIFIED_LABEL_) return false;
  if (!dt || dt === UNCLASSIFIED_LABEL_) return false;
  if (!dm || dm === UNCLASSIFIED_LABEL_) return false;
  return true;
}

function emptyReportBucket_() {
  return { thu: 0, chi: 0, checkCount: 0 };
}

function addToReportBucket_(bucket, soTien, recognized) {
  if (!recognized) {
    bucket.checkCount += 1;
    return;
  }
  if (soTien > 0) bucket.thu += soTien;
  else if (soTien < 0) bucket.chi += soTien;
}

function addToReportGroup_(groups, key, soTien, recognized) {
  if (!recognized) return;
  const name = normalizeReportLabel_(key) || UNCLASSIFIED_LABEL_;
  if (!groups[name]) groups[name] = emptyReportBucket_();
  addToReportBucket_(groups[name], soTien, true);
}

function groupsToReportRows_(groups) {
  return Object.keys(groups).sort().map(function (name) {
    const b = groups[name];
    return [name, b.thu, b.chi, b.thu + b.chi];
  });
}

function setReportBlockValues_(sheet, startRow, startCol, numCols, values) {
  const clearRows = Math.max(1, sheet.getMaxRows() - startRow + 1);
  sheet.getRange(startRow, startCol, clearRows, numCols).clearContent();
  if (values && values.length) {
    sheet.getRange(startRow, startCol, values.length, numCols).setValues(values);
  }
}

function getCategoryParentMap_() {
  const map = {};
  try {
    const ss = getSpreadsheet_();
    const range = ss.getRangeByName('Category');
    if (!range) return map;
    const values = range.getValues();
    for (let i = 0; i < values.length; i++) {
      const parent = normalizeReportLabel_(values[i][0]);
      const child = normalizeReportLabel_(values[i][1]);
      if (!child || map[child]) continue;
      map[child] = parent || UNCLASSIFIED_LABEL_;
    }
  } catch (e) {}
  return map;
}

function getCurrentMonthKey_() {
  return Utilities.formatDate(new Date(), 'GMT+7', 'MM_yyyy');
}

function formatReportTimestamp_(date) {
  return Utilities.formatDate(date || new Date(), 'GMT+7', "dd/MM/yyyy HH:mm");
}

// ---------------------------------------------------------------------------
// Rebuild Report tháng
// ---------------------------------------------------------------------------

/**
 * Nấu lại số liệu Report_MM_YYYY từ Log cùng tháng.
 * @return {{ok:boolean, monthKey:string, message:string, ts?:string}}
 */
function rebuildReportMonth(monthKey) {
  const key = String(monthKey || getCurrentMonthKey_()).trim();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { ok: false, monthKey: key, message: 'Hệ thống bận, thử lại sau 15s.' };
  }

  try {
    const ss = getSpreadsheet_();
    const logSheet = ss.getSheetByName(monthSheetName_(key));
    if (!logSheet) {
      return { ok: false, monthKey: key, message: 'Không tìm thấy ' + monthSheetName_(key) };
    }

    const sheets = getOrCreateMonthSheets(key);
    const rpt = sheets.rptSheet;
    if (!rpt) {
      return { ok: false, monthKey: key, message: 'Không tạo được ' + monthReportSheetName_(key) };
    }

    ensureMonthLinkedOnBaoCao_(key);

    const total = emptyReportBucket_();
    const byWallet = {};
    const byUser = {};
    const byParent = {};
    const byChild = {};
    const parentMap = getCategoryParentMap_();
    let txCount = 0;

    const lastRow = logSheet.getLastRow();
    if (lastRow >= 3) {
      const values = logSheet.getRange(3, 1, lastRow - 2, 9).getValues();
      for (let r = 0; r < values.length; r++) {
        const row = values[r];
        const soTien = Number(row[MONTH_LOG_COL.SO_TIEN]);
        if (!soTien || isNaN(soTien)) continue;
        txCount++;
        const recognized = isRowRecognized_(row);
        const child = normalizeReportLabel_(row[MONTH_LOG_COL.DANH_MUC_CON]) || UNCLASSIFIED_LABEL_;
        const parent = parentMap[child] || UNCLASSIFIED_LABEL_;

        addToReportBucket_(total, soTien, recognized);
        addToReportGroup_(byWallet, row[MONTH_LOG_COL.VI], soTien, recognized);
        addToReportGroup_(byUser, row[MONTH_LOG_COL.DOI_TUONG], soTien, recognized);
        addToReportGroup_(byParent, parent, soTien, recognized);
        addToReportGroup_(byChild, child, soTien, recognized);
      }
    }

    rpt.getRange('A1:B1').setValues([[REPORT_MONTH_TITLE_, key.replace('_', '/')]]);

    rpt.getRange('A3:A7').setValues([
      ['Thu:'],
      ['Chi:'],
      ['Ròng:'],
      ['Cần xác nhận:'],
      ['Số giao dịch:']
    ]);
    rpt.getRange('B3:B7').setValues([
      [total.thu],
      [total.chi],
      [total.thu + total.chi],
      [total.checkCount],
      [txCount]
    ]);

    setReportBlockValues_(rpt, 10, 1, 4, groupsToReportRows_(byWallet));
    setReportBlockValues_(rpt, 10, 6, 4, groupsToReportRows_(byUser));
    setReportBlockValues_(rpt, 10, 11, 4, groupsToReportRows_(byParent));
    setReportBlockValues_(rpt, 10, 16, 4, groupsToReportRows_(byChild));

    const numberFormat = '#,##0;[Red]-#,##0;0';
    const blockRows = Math.max(1, rpt.getMaxRows() - 9);
    rpt.getRange('B3:B5').setNumberFormat(numberFormat);
    rpt.getRange('B6:B7').setNumberFormat('0');
    [2, 7, 12, 17].forEach(function (startCol) {
      rpt.getRange(10, startCol, blockRows, 3).setNumberFormat(numberFormat);
    });

    const ts = formatReportTimestamp_();
    rpt.getRange(REPORT_TS_A1_).setValue('Cập nhật đến ' + ts)
      .setFontColor('#065F46').setFontWeight('normal');

    clearMonthsDirty_([key]);
    writeBaoCaoTimestamp_(ts);
    SpreadsheetApp.flush();

    return { ok: true, monthKey: key, message: 'OK', ts: ts };
  } catch (err) {
    return {
      ok: false,
      monthKey: key,
      message: 'Lỗi rebuildReportMonth: ' + (err && err.message ? err.message : err)
    };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/** Rebuild nhiều tháng tuần tự (đã nhả lock ghi Log). */
function rebuildMonthsNow_(monthKeys) {
  const uniq = [];
  const seen = {};
  (monthKeys || []).forEach(function (k) {
    const key = String(k || '').trim();
    if (!key || seen[key]) return;
    seen[key] = true;
    uniq.push(key);
  });

  const rebuilt = [];
  const errors = [];
  let lastTs = '';

  uniq.forEach(function (mk) {
    const res = rebuildReportMonth(mk);
    if (res.ok) {
      rebuilt.push(mk);
      if (res.ts) lastTs = res.ts;
    } else {
      errors.push(mk + ': ' + res.message);
    }
  });

  if (rebuilt.indexOf(getCurrentMonthKey_()) >= 0) {
    refreshBaoCaoToday_();
  }

  if (lastTs) writeBaoCaoTimestamp_(lastTs);
  return { rebuilt: rebuilt, errors: errors, ts: lastTs };
}

// ---------------------------------------------------------------------------
// Bao Cao v2 — link tháng + Hôm nay (static, cùng rule lọc)
// ---------------------------------------------------------------------------

/** Thêm dòng link Report vào Bao Cao nếu chưa có (không clear toàn sheet). */
function ensureMonthLinkedOnBaoCao_(monthKey) {
  const baoCao = getSheetByGid(GID.BAO_CAO);
  if (!baoCao) return;

  const label = String(monthKey).replace('_', '/');
  const lastRow = baoCao.getLastRow();
  if (lastRow >= 3) {
    const labels = baoCao.getRange(3, 1, lastRow - 2, 1).getValues();
    for (let i = 0; i < labels.length; i++) {
      if (normalizeReportLabel_(labels[i][0]) === label) return;
    }
  }

  baoCao.insertRowBefore(3);
  baoCao.getRange(3, 1).setNumberFormat('@').setValue(label);
  const rptName = monthReportSheetName_(monthKey);
  baoCao.getRange(3, 2, 1, 4).setFormulas([[
    "='" + rptName + "'!B3",
    "='" + rptName + "'!B4",
    "='" + rptName + "'!B5",
    "='" + rptName + "'!B6"
  ]]);
}

function writeBaoCaoTimestamp_(ts) {
  const baoCao = getSheetByGid(GID.BAO_CAO);
  if (!baoCao) return;
  const text = 'Cập nhật đến ' + (ts || formatReportTimestamp_());
  baoCao.getRange(BAO_CAO_TS_A1_).setValue(text)
    .setFontColor('#57534E').setFontStyle('italic').setFontWeight('normal');
}

/** Ghi dòng Hôm nay (A2:E2) từ Log tháng hiện tại — cùng rule lọc. */
function refreshBaoCaoToday_() {
  const baoCao = getSheetByGid(GID.BAO_CAO);
  if (!baoCao) return null;

  const tz = 'GMT+7';
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const monthKey = getCurrentMonthKey_();
  const logSheet = getSpreadsheet_().getSheetByName(monthSheetName_(monthKey));

  const bucket = emptyReportBucket_();
  if (logSheet && logSheet.getLastRow() >= 3) {
    const values = logSheet.getRange(3, 1, logSheet.getLastRow() - 2, 9).getValues();
    for (let r = 0; r < values.length; r++) {
      const row = values[r];
      const ngay = parseLogDate_(row[MONTH_LOG_COL.NGAY]);
      if (!ngay) continue;
      if (Utilities.formatDate(ngay, tz, 'dd/MM/yyyy') !== todayStr) continue;
      const soTien = Number(row[MONTH_LOG_COL.SO_TIEN]);
      if (!soTien || isNaN(soTien)) continue;
      addToReportBucket_(bucket, soTien, isRowRecognized_(row));
    }
  }

  baoCao.getRange('A2:E2').setValues([[
    todayStr,
    bucket.thu,
    bucket.chi,
    bucket.thu + bucket.chi,
    bucket.checkCount
  ]]);
  baoCao.getRange('B2:D2').setNumberFormat('#,##0;[Red]-#,##0;0');
  baoCao.getRange('E2').setNumberFormat('0');
  baoCao.getRange('A2').setNumberFormat('@');

  const ts = formatReportTimestamp_(now);
  writeBaoCaoTimestamp_(ts);
  SpreadsheetApp.flush();
  return { todayStr: todayStr, bucket: bucket, ts: ts };
}

/** /report & menu: rebuild tháng hiện tại + Hôm nay rồi trả số. */
function refreshReportsForView_() {
  const mk = getCurrentMonthKey_();
  const rebuild = rebuildMonthsNow_([mk]);
  const today = refreshBaoCaoToday_();
  return {
    monthKey: mk,
    rebuild: rebuild,
    today: today,
    ts: (today && today.ts) || rebuild.ts || formatReportTimestamp_()
  };
}

// ---------------------------------------------------------------------------
// Trigger định kỳ — chỉ tháng dirty
// ---------------------------------------------------------------------------

function ensureReportDirtyTrigger_() {
  try {
    if (PROP.getProperty('REPORT_DIRTY_TRIGGER_OK') === '1') return;
    const triggers = ScriptApp.getProjectTriggers();
    let found = false;
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === REPORT_REFRESH_TRIGGER_HANDLER_) {
        found = true;
        break;
      }
    }
    if (!found) {
      ScriptApp.newTrigger(REPORT_REFRESH_TRIGGER_HANDLER_)
        .timeBased()
        .everyMinutes(REPORT_REFRESH_INTERVAL_MINUTES_)
        .create();
    }
    PROP.setProperty('REPORT_DIRTY_TRIGGER_OK', '1');
  } catch (e) {
    Logger.log('ensureReportDirtyTrigger_: ' + e.message);
  }
}

function runScheduledDirtyReportRefresh() {
  const dirty = getDirtyMonths_();
  if (!dirty.length) {
    return { rebuilt: [], skipped: true };
  }
  return rebuildMonthsNow_(dirty);
}

function setReportDirtyTriggerManual() {
  PROP.deleteProperty('REPORT_DIRTY_TRIGGER_OK');
  ensureReportDirtyTrigger_();
  const msg = 'Đã bật tự cập nhật Report dirty mỗi ' + REPORT_REFRESH_INTERVAL_MINUTES_ + ' phút.';
  try { SpreadsheetApp.getActive().toast(msg, 'Báo cáo', 5); } catch (e) {}
  return msg;
}

// ---------------------------------------------------------------------------
// Menu UI
// ---------------------------------------------------------------------------

function menuRebuildReportActiveMonth() {
  const sh = SpreadsheetApp.getActiveSheet();
  const name = sh ? sh.getName() : '';
  let mk = null;
  const mLog = name.match(/^Log_(\d{2}_\d{4})$/);
  const mRpt = name.match(/^Report_(\d{2}_\d{4})$/);
  if (mLog) mk = mLog[1];
  else if (mRpt) mk = mRpt[1];
  else mk = getCurrentMonthKey_();

  const res = rebuildMonthsNow_([mk]);
  const ui = SpreadsheetApp.getUi();
  if (res.errors.length) {
    ui.alert('Làm mới báo cáo', 'Tháng ' + mk + '\n' + res.errors.join('\n'), ui.ButtonSet.OK);
  } else {
    ui.alert('Làm mới báo cáo', 'Đã cập nhật Report_' + mk + '\nCập nhật đến ' + (res.ts || ''), ui.ButtonSet.OK);
  }
}

function menuRebuildAllDirtyReports() {
  const dirty = getDirtyMonths_();
  if (!dirty.length) {
    SpreadsheetApp.getUi().alert('Làm mới báo cáo', 'Không có tháng nào đang chờ cập nhật (dirty).', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const res = rebuildMonthsNow_(dirty);
  SpreadsheetApp.getUi().alert(
    'Làm mới báo cáo (dirty)',
    'Đã nấu: ' + (res.rebuilt.join(', ') || '(không)') +
      (res.errors.length ? '\nLỗi:\n' + res.errors.join('\n') : '') +
      '\nCập nhật đến ' + (res.ts || ''),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function menuRebuildAllMonthReports() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.prompt(
    'Làm mới TẤT CẢ báo cáo tháng',
    'Gõ ALL để xác nhận (có thể mất vài phút):',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm.getSelectedButton() !== ui.Button.OK) return;
  if (String(confirm.getResponseText() || '').trim() !== 'ALL') {
    ui.alert('Chưa xác nhận. Phải gõ đúng ALL.');
    return;
  }

  const ss = getSpreadsheet_();
  const keys = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .map(function (n) {
      const m = n.match(/^Log_(\d{2}_\d{4})$/);
      return m ? m[1] : null;
    })
    .filter(Boolean);

  const res = rebuildMonthsNow_(keys);
  ui.alert(
    'Làm mới tất cả',
    'OK: ' + res.rebuilt.length + '/' + keys.length +
      (res.errors.length ? '\nLỗi:\n' + res.errors.join('\n') : '') +
      '\nCập nhật đến ' + (res.ts || ''),
    ui.ButtonSet.OK
  );
}
