// ============================================================================
// 💾 4_SHEETSTORE.GS — QUẢN LÝ DỮ LIỆU SHARD LOG THÁNG THEO GID & TEMPLATE
// ============================================================================

/** Cache SpreadsheetApp instance trong phạm vi 1 request execution */
let cachedSpreadsheet_ = null;

function getSpreadsheet_() {
  if (!cachedSpreadsheet_) {
    // Ưu tiên spreadsheet đang mở (menu / container-bound) — tránh openById lỗi quyền
    try {
      const active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) {
        cachedSpreadsheet_ = active;
        try { PROP.setProperty('spreadsheet_id', active.getId()); } catch (e0) {}
        return cachedSpreadsheet_;
      }
    } catch (eActive) {
      Logger.log('getSpreadsheet_ active: ' + eActive.message);
    }

    const id = PROP.getProperty('spreadsheet_id');
    if (id) {
      try {
        cachedSpreadsheet_ = SpreadsheetApp.openById(id);
      } catch (e) {
        Logger.log('getSpreadsheet_ openById fail: ' + e.message);
        cachedSpreadsheet_ = null;
      }
    }
    if (!cachedSpreadsheet_) {
      throw new Error('Khong mo duoc Spreadsheet. Mo file Sheet → Extensions → Apps Script, chay setupEnvironment.');
    }
  }
  return cachedSpreadsheet_;
}

/** Lấy Sheet an toàn theo GID */
function getSheetByGid(gid) {
  const ss = getSpreadsheet_();
  const target = Number(gid);
  return ss.getSheets().find(s => s.getSheetId() === target) || null;
}

/** Parse ngày Log (Date hoặc dd/MM/yyyy) — dùng chung Report/Tools */
function parseLogDate_(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const s = String(val == null ? '' : val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

/** Chuẩn hóa khóa tháng MM_YYYY từ chuỗi ngày hoặc Date object */
function getMonthKeyFromDate(dateStr) {
  if (dateStr instanceof Date) {
    return Utilities.formatDate(dateStr, 'GMT+7', 'MM_yyyy');
  }
  const parsed = parseLogDate_(dateStr);
  if (parsed) return Utilities.formatDate(parsed, 'GMT+7', 'MM_yyyy');
  const str = String(dateStr || '').trim();
  const parts = str.split('/');
  if (parts.length >= 3) {
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    return `${mm}_${yyyy}`;
  }
  return Utilities.formatDate(new Date(), 'GMT+7', 'MM_yyyy');
}

/** Đoán tháng MM_YYYY từ UniqueKey nếu có timestamp */
function guessMonthKeyFromUniqueKey_(uniqueKey) {
  if (!uniqueKey) return null;
  const str = String(uniqueKey).trim();

  // Pattern 1: Telegram "TX_<timestamp>..." -> epoch ms
  const txMatch = str.match(/^TX_(\d{10,13})/i);
  if (txMatch) {
    let ts = Number(txMatch[1]);
    if (txMatch[1].length === 10) ts *= 1000;
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'GMT+7', 'MM_yyyy');
    }
  }

  // Pattern 2: Mail scanner fallback "YYYYMMDD_..."
  const mailMatch = str.match(/^(\d{4})(\d{2})\d{2}_/);
  if (mailMatch) {
    return `${mailMatch[2]}_${mailMatch[1]}`;
  }

  return null;
}

/** Tên sheet Log & Report theo tháng */
function monthSheetName_(monthKey) { return 'Log_' + monthKey; }
function monthReportSheetName_(monthKey) { return 'Report_' + monthKey; }

/** Lấy hoặc tự động clone Sheet tháng mới từ Template */
function getOrCreateMonthSheets(monthKey) {
  const ss = getSpreadsheet_();
  const logName = monthSheetName_(monthKey);
  const rptName = monthReportSheetName_(monthKey);
  
  let logSheet = ss.getSheetByName(logName);
  let rptSheet = ss.getSheetByName(rptName);

  if (!logSheet) {
    const tplLog = getSheetByGid(GID.TEMPLATE_LOG) || ss.getSheetByName('Template_Log');
    if (!tplLog) throw new Error('Không tìm thấy Template_Log (GID: ' + GID.TEMPLATE_LOG + ')');
    logSheet = tplLog.copyTo(ss).setName(logName);
    logSheet.getRange('A1:B1').setValues([['Thu Chi tháng', monthKey.replace('_', '/')]]);
    protectMonthLogB1_(logSheet);
  }

  const createdRpt = !rptSheet;
  if (!rptSheet) {
    const tplRpt = getSheetByGid(GID.TEMPLATE_REPORT) || ss.getSheetByName('Template_Report');
    if (tplRpt) {
      rptSheet = tplRpt.copyTo(ss).setName(rptName);
      rptSheet.getRange('A1:B1').setValues([['Báo cáo tháng:', monthKey.replace('_', '/')]]);
    }
  }

  ensureMonthInMucLuc_(monthKey, logSheet, rptSheet);
  try { ensureMonthLinkedOnBaoCao_(monthKey); } catch (eLink) {}
  if (createdRpt && rptSheet) {
    try {
      rptSheet.getRange('D1').setValue('⚠ Chưa nấu báo cáo lần đầu')
        .setFontColor('#B45309').setFontWeight('bold');
      markMonthsDirty_([monthKey]);
    } catch (eDirty) {}
  }
  return { logSheet, rptSheet };
}

/** Chèn các dòng giao dịch mới vào Log tháng (sử dụng Dummy Row bảo toàn format) */
function appendRowsToMonthLog(sheet, rows) {
  if (!rows || !rows.length) return 0;
  
  // Dữ liệu bắt đầu từ dòng 3 (sau Title và Header)
  const startRow = 3;
  const numCols = 9;

  let lastDataRow = sheet.getLastRow();
  if (lastDataRow < startRow) lastDataRow = startRow - 1;

  // Dòng Dummy có sẵn định dạng
  const dummyRow = lastDataRow + 1;
  sheet.insertRowsBefore(dummyRow, rows.length);

  // Copy format & validation từ dòng Dummy đẩy xuống
  const formatSource = sheet.getRange(dummyRow + rows.length, 1, 1, numCols);
  const targetRange = sheet.getRange(dummyRow, 1, rows.length, numCols);
  formatSource.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  formatSource.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);

  // Ghi giá trị
  targetRange.setValues(rows);
  return rows.length;
}

/** Ghi batch giao dịch vào các Shard Log_MM_YYYY (Đơn ghi duy nhất) */
function saveBatchToMonthShards(batchData) {
  if (!batchData || !batchData.length) return true;
  const lock = LockService.getScriptLock();
  let touchedMonths_ = null;
  try {
    lock.waitLock(15000);
  } catch (e) {
    return "Hệ thống đang bận, vui lòng thử lại sau 15 giây.";
  }

  try {
    const monthGroups = {};
    for (let i = 0; i < batchData.length; i++) {
      const item = batchData[i];
      const data = item.data;
      const mKey = getMonthKeyFromDate(data.ngay_gd);
      if (!monthGroups[mKey]) monthGroups[mKey] = [];
      
      monthGroups[mKey].push([
        data.ngay_gd,
        data.phan_loai,
        data.so_tien,
        data.vi || "Chưa phân loại",
        data.doi_tuong || "Chưa phân loại",
        data.danh_muc_con || "Chưa phân loại",
        data.ghi_chu || "",
        item.uniqueKey,
        data.status || ""
      ]);
    }

    const keys = Object.keys(monthGroups);
    for (let k = 0; k < keys.length; k++) {
      const mKey = keys[k];
      const { logSheet } = getOrCreateMonthSheets(mKey);
      appendRowsToMonthLog(logSheet, monthGroups[mKey]);
    }

    SpreadsheetApp.flush();
    touchedMonths_ = keys;
    return true;
  } catch (err) {
    return "Lỗi ghi Sheet: " + err.message;
  } finally {
    lock.releaseLock();
    if (touchedMonths_ && touchedMonths_.length) {
      try { notifyLogMonthsChanged_(touchedMonths_); } catch (eN) {}
    }
  }
}

/** Đọc 1 dòng giao dịch từ Sheet theo Unique Key */
function getRowByUniqueKey(uniqueKey) {
  const ss = getSpreadsheet_();
  const targetMonth = guessMonthKeyFromUniqueKey_(uniqueKey);

  // Thử tìm thẳng trong sheet tháng suy đoán trước (O(1))
  if (targetMonth) {
    const targetSheet = ss.getSheetByName(monthSheetName_(targetMonth));
    if (targetSheet) {
      const found = findRowInLogSheet_(targetSheet, uniqueKey);
      if (found) return found;
    }
  }

  // Fallback: Tìm trong tất cả các sheet Log_ còn lại
  const sheets = ss.getSheets();
  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    const name = sh.getName();
    if (!name.startsWith('Log_') || name === 'Log_Chuyen') continue;
    if (targetMonth && name === monthSheetName_(targetMonth)) continue; // Đã tìm ở trên

    const found = findRowInLogSheet_(sh, uniqueKey);
    if (found) return found;
  }
  return null;
}

/** Helper tìm dữ liệu 1 dòng theo key trong 1 Sheet Log cụ thể */
function findRowInLogSheet_(sh, uniqueKey) {
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return null;

  const keyData = sh.getRange(3, MONTH_LOG_COL.UNIQUE_KEY + 1, lastRow - 2, 1).getValues();
  for (let i = 0; i < keyData.length; i++) {
    if (String(keyData[i][0]) === String(uniqueKey)) {
      const rowVals = sh.getRange(3 + i, 1, 1, 9).getValues()[0];
      let rawDate = rowVals[0];
      let dateStr = "";
      if (rawDate instanceof Date) {
        dateStr = Utilities.formatDate(rawDate, "GMT+7", "dd/MM/yyyy");
      } else {
        dateStr = String(rawDate || "");
      }
      return {
        ngay_gd: dateStr,
        phan_loai: rowVals[1],
        so_tien: rowVals[2],
        so_tien_abs: Math.abs(Number(rowVals[2]) || 0),
        vi: rowVals[3],
        doi_tuong: rowVals[4],
        danh_muc_con: rowVals[5],
        ghi_chu: rowVals[6] || "",
        uniqueKey: uniqueKey,
        status: rowVals[8] || ""
      };
    }
  }
  return null;
}

/** Cập nhật 1 dòng giao dịch theo Unique Key (đổi tháng thì chuyển shard) */
function updateRowByUniqueKey(uniqueKey, data) {
  const located = locateLogSheetByUniqueKey_(uniqueKey);
  if (!located) return false;

  const destMonth = (data && data.ngay_gd)
    ? getMonthKeyFromDate(data.ngay_gd)
    : located.monthKey;

  const touched = [];

  if (destMonth === located.monthKey) {
    if (updateInLogSheet_(located.sheet, uniqueKey, data)) {
      SpreadsheetApp.flush();
      touched.push(located.monthKey);
      try { notifyLogMonthsChanged_(touched); } catch (eN) {}
      return true;
    }
    return false;
  }

  const { logSheet } = getOrCreateMonthSheets(destMonth);
  appendRowsToMonthLog(logSheet, [[
    data.ngay_gd,
    data.phan_loai,
    data.so_tien,
    data.vi || "Chưa phân loại",
    data.doi_tuong || "Chưa phân loại",
    data.danh_muc_con || "Chưa phân loại",
    data.ghi_chu || "",
    uniqueKey,
    data.status || ""
  ]]);

  const subMap = {};
  subMap[String(uniqueKey)] = true;
  deleteKeysInLogSheet_(located.sheet, subMap);
  SpreadsheetApp.flush();
  touched.push(located.monthKey, destMonth);
  try { notifyLogMonthsChanged_(touched); } catch (eN) {}
  return true;
}

/** Tìm sheet Log đang chứa uniqueKey */
function locateLogSheetByUniqueKey_(uniqueKey) {
  const ss = getSpreadsheet_();
  const guessed = guessMonthKeyFromUniqueKey_(uniqueKey);
  if (guessed) {
    const sh = ss.getSheetByName(monthSheetName_(guessed));
    if (sh && findRowInLogSheet_(sh, uniqueKey)) {
      return { sheet: sh, monthKey: guessed };
    }
  }

  const sheets = ss.getSheets();
  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    const name = sh.getName();
    if (!name.startsWith('Log_') || name === 'Log_Chuyen') continue;
    if (guessed && name === monthSheetName_(guessed)) continue;
    if (findRowInLogSheet_(sh, uniqueKey)) {
      return { sheet: sh, monthKey: name.replace(/^Log_/, '') };
    }
  }
  return null;
}

/** Helper cập nhật giá trị trong 1 sheet cụ thể */
function updateInLogSheet_(sh, uniqueKey, data) {
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return false;

  const keyData = sh.getRange(3, MONTH_LOG_COL.UNIQUE_KEY + 1, lastRow - 2, 1).getValues();
  for (let i = 0; i < keyData.length; i++) {
    if (String(keyData[i][0]) === String(uniqueKey)) {
      const row = 3 + i;
      sh.getRange(row, 1, 1, 9).setValues([[
        data.ngay_gd,
        data.phan_loai,
        data.so_tien,
        data.vi || "Chưa phân loại",
        data.doi_tuong || "Chưa phân loại",
        data.danh_muc_con || "Chưa phân loại",
        data.ghi_chu || "",
        uniqueKey,
        data.status || ""
      ]]);
      return true;
    }
  }
  return false;
}

/** Xóa nhiều dòng theo danh sách Unique Keys */
function deleteRowsByUniqueKeys(keys) {
  if (!keys || !keys.length) return 0;
  const ss = getSpreadsheet_();
  const keyMap = {};
  keys.forEach(k => { keyMap[String(k)] = true; });
  let totalDeleted = 0;
  const touchedMonths = {};

  const monthGroups = {};
  keys.forEach(k => {
    const m = guessMonthKeyFromUniqueKey_(k);
    if (m) {
      if (!monthGroups[m]) monthGroups[m] = [];
      monthGroups[m].push(String(k));
    }
  });

  const scannedSheets = new Set();
  const targetMonths = Object.keys(monthGroups);
  for (let m = 0; m < targetMonths.length; m++) {
    const sName = monthSheetName_(targetMonths[m]);
    const sh = ss.getSheetByName(sName);
    if (!sh) continue;
    scannedSheets.add(sName);
    const beforeDel = totalDeleted;
    totalDeleted += deleteKeysInLogSheet_(sh, keyMap);
    if (totalDeleted > beforeDel) touchedMonths[targetMonths[m]] = true;
  }

  const remainingKeys = Object.keys(keyMap);
  if (remainingKeys.length > 0) {
    const sheets = ss.getSheets();
    sheets.forEach(sh => {
      if (Object.keys(keyMap).length === 0) return;
      const name = sh.getName();
      if (!name.startsWith('Log_') || name === 'Log_Chuyen') return;
      if (scannedSheets.has(name)) return;
      const beforeDel = totalDeleted;
      totalDeleted += deleteKeysInLogSheet_(sh, keyMap);
      if (totalDeleted > beforeDel) {
        touchedMonths[name.replace(/^Log_/, '')] = true;
      }
    });
  }

  SpreadsheetApp.flush();
  const months = Object.keys(touchedMonths);
  if (months.length) {
    try { notifyLogMonthsChanged_(months); } catch (eN) {}
  }
  return totalDeleted;
}

/** Helper xóa các dòng khớp keyMap trong 1 Sheet Log; gỡ key đã xóa khỏi map */
function deleteKeysInLogSheet_(sh, keyMap) {
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return 0;

  const values = sh.getRange(3, MONTH_LOG_COL.UNIQUE_KEY + 1, lastRow - 2, 1).getValues();
  const rowsToDelete = [];
  const foundKeys = [];
  for (let i = 0; i < values.length; i++) {
    const k = String(values[i][0]);
    if (keyMap[k]) {
      rowsToDelete.push(3 + i);
      foundKeys.push(k);
    }
  }

  if (rowsToDelete.length > 0) {
    rowsToDelete.sort((a, b) => b - a);
    rowsToDelete.forEach(r => sh.deleteRow(r));
    foundKeys.forEach(k => { delete keyMap[k]; });
  }
  return rowsToDelete.length;
}

/** Tự động bảo vệ ô B1 trên Log tháng */
function protectMonthLogB1_(sheet) {
  try {
    const p = sheet.getRange('B1').protect();
    p.setDescription('Khóa tháng dữ liệu');
    p.removeEditors(p.getEditors());
    if (p.canDomainEdit()) p.setDomainEdit(false);
  } catch (e) {}
}

function guardAllMonthLogB1_() {
  const ss = getSpreadsheet_();
  let count = 0;
  ss.getSheets().forEach(sh => {
    if (sh.getName().startsWith('Log_') && sh.getName() !== 'Log_Chuyen') {
      protectMonthLogB1_(sh);
      count++;
    }
  });
  return count;
}

/** Sửa lại ô B1 nếu lỡ bị đổi tay */
function repairTamperedB1_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  spreadsheet.getSheets().forEach(sh => {
    const m = sh.getName().match(/^Log_(\d{2})_(\d{4})$/);
    if (m) {
      const standard = m[1] + '/' + m[2];
      const b1 = String(sh.getRange('B1').getValue() || '').trim();
      if (b1 !== standard) {
        sh.getRange('B1').setValue(standard);
      }
    }
  });
}

/** Cập nhật hoặc thêm tháng vào Mục Lục */
function ensureMonthInMucLuc_(monthKey, logSheet, rptSheet) {
  const ss = getSpreadsheet_();
  let mucLuc = ss.getSheetByName(SHEET_NAMES.MUC_LUC);
  if (!mucLuc) {
    rebuildMucLuc();
    return;
  }

  const data = mucLuc.getDataRange().getValues();
  const label = monthKey.replace('_', '/');
  for (let i = 2; i < data.length; i++) {
    if (String(data[i][0]).trim() === label) return;
  }

  const startRow = Math.max(mucLuc.getLastRow() + 1, MUC_LUC_DATA_START_ROW);
  mucLuc.getRange(startRow, 1).setNumberFormat('@').setValue(label);
  mucLuc.getRange(startRow, 2).setFormula(
    '=HYPERLINK("#gid=' + logSheet.getSheetId() + '"; "' + logSheet.getName() + '")'
  );
  if (rptSheet) {
    mucLuc.getRange(startRow, 3).setFormula(
      '=HYPERLINK("#gid=' + rptSheet.getSheetId() + '"; "' + rptSheet.getName() + '")'
    );
  }
}

/** Tái tạo toàn bộ sheet Mục Lục từ các Log tháng hiện có */
function rebuildMucLuc() {
  const ss = getSpreadsheet_();
  let mucLuc = ss.getSheetByName(SHEET_NAMES.MUC_LUC);
  if (!mucLuc) mucLuc = ss.insertSheet(SHEET_NAMES.MUC_LUC, 0);

  mucLuc.clearContents();
  mucLuc.getRange('A1:C1').setValues([['📑 MỤC LỤC — Log & Report theo tháng', '', '']]);
  mucLuc.getRange('A2:C2').setValues([['Tháng', 'Log', 'Report']]);

  const sheets = ss.getSheets();
  const labels = [];
  const formulas = [];

  sheets.forEach(sh => {
    const m = sh.getName().match(/^Log_(\d{2}_\d{4})$/);
    if (m) {
      const mKey = m[1];
      labels.push([mKey.replace('_', '/')]);
      const logLink = '=HYPERLINK("#gid=' + sh.getSheetId() + '"; "' + sh.getName() + '")';
      const rpt = ss.getSheetByName('Report_' + mKey);
      const rptLink = rpt
        ? '=HYPERLINK("#gid=' + rpt.getSheetId() + '"; "' + rpt.getName() + '")'
        : '';
      formulas.push([logLink, rptLink]);
    }
  });

  if (labels.length > 0) {
    mucLuc.getRange(3, 1, labels.length, 1).setNumberFormat('@').setValues(labels);
    mucLuc.getRange(3, 2, formulas.length, 2).setFormulas(formulas);
  }
}

// ============================================================================
// 🎯 SHEET TRIGGERS
// ============================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('💎 Sổ Thu Chi AI v2')
    .addItem('⚙️ Cấu hình AI & Bot', 'showConfigDialog')
    .addItem('📧 Quét Mail thủ công', 'triggerScanMailUI')
    .addItem('💳 Sync Meta Billing', 'triggerSyncMetaBillingUI')
    .addItem('📑 Tái tạo Mục Lục', 'rebuildMucLuc')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('📊 Làm mới báo cáo')
        .addItem('Tháng đang mở', 'menuRebuildReportActiveMonth')
        .addItem('Các tháng chờ cập nhật (dirty)', 'menuRebuildAllDirtyReports')
        .addItem('Tất cả tháng (gõ ALL)', 'menuRebuildAllMonthReports')
        .addItem('Bật trigger dirty 15 phút', 'setReportDirtyTriggerManual')
        .addItem('Bật trigger Meta Billing 6 giờ', 'setMetaBillingTriggerManual')
    )
    .addSubMenu(
      ui.createMenu('🔄 Làm mới format/data Log')
        .addItem('Tháng đang mở — format', 'menuRefreshOneFormat')
        .addItem('Tháng đang mở — data', 'menuRefreshOneData')
        .addItem('Tháng đang mở — format + data', 'menuRefreshOneBoth')
        .addItem('Tất cả — format', 'menuRefreshAllFormat')
        .addItem('Tất cả — data', 'menuRefreshAllData')
        .addItem('Tất cả — format + data', 'menuRefreshAllBoth')
    )
    .addSeparator()
    .addSubMenu(
      ui.createMenu('⚠️ Cứu hộ Sheet Cũ (hiếm khi dùng)')
        .addItem('Không ghi đè (stub theme)', 'setupSheetFormulasAndTheme')
        .addItem('Ghi đè Bao Cao v2…', 'updateBaoCaoV2Manual')
        .addItem('Ghi đè Tóm tắt_v2…', 'updateTomTatV2Manual')
    )
    .addToUi();

  try {
    const ss = SpreadsheetApp.getActive();
    guardAllMonthLogB1_();
    repairTamperedB1_(ss);
  } catch (e) {}
  try { ensureReportDirtyTrigger_(); } catch (e2) {}
}

function showConfigDialog() {
  const tpl = HtmlService.createTemplateFromFile('configui');
  tpl.token = getConfigToken();
  SpreadsheetApp.getUi().showModalDialog(tpl.evaluate().setWidth(620).setHeight(920), '⚙️ Cấu hình Sổ Thu Chi AI v2');
}

function guardAllMonthLogB1UI() {
  const count = guardAllMonthLogB1_();
  SpreadsheetApp.getActive().toast(`Đã bảo vệ thành công ${count} sheet Log tháng!`, 'Khóa B1', 5);
}

/** Tự động giữ dấu ± khi sửa cột Số tiền hoặc Phân loại; dirty báo cáo khi sửa Log */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (!name.startsWith('Log_') || name === 'Log_Chuyen') return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < 3) return;

  // Sửa Số tiền (cột 3) hoặc Phân loại (cột 2)
  if (col === MONTH_LOG_COL.SO_TIEN + 1 || col === MONTH_LOG_COL.PHAN_LOAI + 1) {
    const phanLoai = sheet.getRange(row, MONTH_LOG_COL.PHAN_LOAI + 1).getValue();
    const tienRange = sheet.getRange(row, MONTH_LOG_COL.SO_TIEN + 1);
    const val = Number(tienRange.getValue());
    if (!isNaN(val) && val !== 0) {
      if (phanLoai === 'Chi' && val > 0) tienRange.setValue(-val);
      else if (phanLoai === 'Thu' && val < 0) tienRange.setValue(Math.abs(val));
    }
  }

  // P1: sửa data Log → dirty (trigger / menu nấu lại; không rebuild trong simple trigger)
  if (col >= 1 && col <= 9) {
    const m = name.match(/^Log_(\d{2}_\d{4})$/);
    if (m) {
      const dirtyKeys = [m[1]];
      if (col === MONTH_LOG_COL.NGAY + 1) {
        try {
          const newKey = getMonthKeyFromDate(sheet.getRange(row, 1).getValue());
          if (newKey && newKey !== m[1]) dirtyKeys.push(newKey);
        } catch (eDate) {}
      }
      try { markMonthsDirty_(dirtyKeys); } catch (eDirty) {}
    }
  }
}

/** Bấm vào ô trong Mục Lục để điều hướng */
function onSelectionChange(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAMES.MUC_LUC) return;
  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < 3 || col > 3) return;

  const formula = sheet.getRange(row, col).getFormula();
  const m = formula.match(/#gid=(\d+)/);
  if (m && m[1]) {
    const target = getSheetByGid(m[1]);
    if (target) target.activate();
  }
}

// ============================================================================
// 🎨 CÀI ĐẶT CÔNG THỨC & GIAO DIỆN THEME MỆNH THỔ (HOÀN HẢO 100%)
// ============================================================================

/** Break apart + format 1 vùng, flush ngay — tránh lỗi "cột đã nhập" do merge sót. */
function safeSetNumberFormat_(range, numFmt) {
  try {
    range.breakApart();
    SpreadsheetApp.flush();
    range.setNumberFormat(numFmt);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log('skip numFmt ' + range.getA1Notation() + ': ' + e.message);
  }
}

function setupSheetFormulasAndTheme() {
  SpreadsheetApp.getActive().toast(
    'Không ghi đè Bao Cao v2 / Tóm tắt_v2. Dùng menu cứu hộ nếu thật sự cần.',
    'Theme Sheet Cũ',
    8
  );
}

function updateBaoCaoV2Manual() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    'Cứu hộ Bao Cao v2',
    'Sẽ GHI ĐÈ format/công thức Sheet Cũ.\n\n' +
    '• Bảng tháng: giữ link Report (hybrid OK).\n' +
    '• Dòng Hôm nay: cứu hộ ghi SUMIFS tạm — script sẽ khôi phục số tĩnh ngay sau đó.\n\n' +
    'Chỉ dùng khi sheet hỏng cấu trúc. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  SpreadsheetApp.getActive().toast('Đang ghi đè Bao Cao v2 (Sheet Cũ)…', 'Cứu hộ', 5);
  updateBaoCaoV2_(SpreadsheetApp.getActiveSpreadsheet());
  try {
    refreshBaoCaoToday_();
    writeBaoCaoTimestamp_(formatReportTimestamp_(new Date()));
  } catch (eHybrid) {
    Logger.log('Khôi phục hybrid Hôm nay sau cứu hộ: ' + eHybrid.message);
  }
  try { SpreadsheetApp.flush(); } catch (e) {}
  SpreadsheetApp.getActive().toast('Xong. Hôm nay đã khôi phục hybrid (script).', 'Cứu hộ', 8);
}

function updateTomTatV2Manual() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    'Cứu hộ Tóm tắt_v2',
    'Sẽ GHI ĐÈ công thức/format Tóm tắt_v2 (Sheet Cũ).\n\n' +
    'Chỉ dùng khi sheet hỏng cấu trúc. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  SpreadsheetApp.getActive().toast('Đang ghi đè Tóm tắt_v2 (Sheet Cũ)…', 'Cứu hộ', 5);
  updateTomTatV2_(SpreadsheetApp.getActiveSpreadsheet());
  try { SpreadsheetApp.flush(); } catch (e) {}
  SpreadsheetApp.getActive().toast('Đã ghi đè Tóm tắt_v2.', 'Cứu hộ', 5);
}

/** 1. Cập nhật công thức và theme cho Bao Cao v2 */
function updateBaoCaoV2_(ss) {
  const baoCao = getSheetByGid(GID.BAO_CAO) || ss.getSheetByName('Bao Cao v2');
  if (!baoCao) return;

  const numFmt = '#,##0 "₫";[Red]-#,##0 "₫";0 "₫"';
  const borderCol = '#D6D3D1';

  try {
    try {
      baoCao.getRange('A1:E50').breakApart();
      SpreadsheetApp.flush();
    } catch (e) {}

    baoCao.getRange('A1:E1').setValues([['Kỳ', 'Thu', 'Chi', 'Ròng', 'CHECK chưa ghi nhận']]);
    baoCao.getRange('A1:E1').setBackground('#451A03').setFontColor('#FEF3C7').setFontWeight('bold');

    baoCao.getRange('A2').setFormula('=TEXT(TODAY(); "dd/mm/yyyy")');
    baoCao.getRange('B2').setFormula('=IFERROR(SUMIFS(INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!C3:C"); INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!A3:A"); TODAY(); INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!B3:B"); "Thu"); 0)');
    baoCao.getRange('C2').setFormula('=IFERROR(SUMIFS(INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!C3:C"); INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!A3:A"); TODAY(); INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!B3:B"); "Chi"); 0)');
    baoCao.getRange('D2').setFormula('=B2+C2');
    baoCao.getRange('E2').setFormula('=IFERROR(COUNTIFS(INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!A3:A"); TODAY(); INDIRECT("Log_" & TEXT(TODAY(); "mm_yyyy") & "!I3:I"); "*CHECK*"); 0)');

    const allSheetsBc = ss.getSheets().map(s => s.getName());
    const monthKeys = allSheetsBc
      .filter(n => /^Report_\d{2}_\d{4}$/.test(n))
      .map(n => n.replace('Report_', ''))
      .sort((a, b) => {
        const [m1, y1] = a.split('_').map(Number);
        const [m2, y2] = b.split('_').map(Number);
        return new Date(y2, m2 - 1).getTime() - new Date(y1, m1 - 1).getTime();
      });

    if (monthKeys.length > 0) {
      const monthFormulas = monthKeys.map(k => {
        const rpt = 'Report_' + k;
        return [`='${rpt}'!B3`, `='${rpt}'!B4`, `='${rpt}'!B5`, `='${rpt}'!B6`];
      });
      const monthLabels = monthKeys.map(k => [k.replace('_', '/')]);
      baoCao.getRange(3, 2, monthFormulas.length, 4).setFormulas(monthFormulas);
      baoCao.getRange(3, 1, monthLabels.length, 1).setNumberFormat('@').setValues(monthLabels);
    }

    baoCao.setColumnWidth(1, 130);
    baoCao.setColumnWidth(2, 140);
    baoCao.setColumnWidth(3, 140);
    baoCao.setColumnWidth(4, 140);
    baoCao.setColumnWidth(5, 160);
    baoCao.setRowHeight(1, 32);
    baoCao.setRowHeight(2, 28);

    const lastR = Math.max(baoCao.getLastRow(), 2);
    safeSetNumberFormat_(baoCao.getRange(2, 2, lastR, 2), numFmt);
    safeSetNumberFormat_(baoCao.getRange(2, 3, lastR, 3), numFmt);
    safeSetNumberFormat_(baoCao.getRange(2, 4, lastR, 4), numFmt);
    try {
      baoCao.getRange(1, 1, lastR, 5).setBorder(true, true, true, true, true, true, borderCol, SpreadsheetApp.BorderStyle.SOLID);
    } catch (e) {}
  } catch (e) {
    Logger.log('Lỗi Bao Cao v2: ' + e.message);
  }
}

/** 2. Cập nhật công thức và theme cho Tóm tắt_v2 (Đọc danh sách thực tế làm chuẩn) */
function updateTomTatV2_(ss) {
  const tomTat = getSheetByGid(GID.TOM_TAT) || ss.getSheetByName('Tóm tắt_v2');
  if (!tomTat) return;

  const numFmt = '#,##0 "₫";[Red]-#,##0 "₫";0 "₫"';
  const borderCol = '#D6D3D1';

  try {
    const totalRows = Math.max(tomTat.getMaxRows(), 60);

    // Hủy merge toàn vùng UI + dọn dẹp sạch sẽ tránh lỗi spill "cột đã nhập"
    try {
      tomTat.getRange(1, 1, totalRows, 15).breakApart();
      SpreadsheetApp.flush();
      tomTat.getRange('E1:K10').clearContent().clearFormat();
      tomTat.getRange(11, 6, totalRows - 10, 1).clearContent().clearFormat();  // Cột F
      tomTat.getRange(11, 11, totalRows - 10, 1).clearContent().clearFormat(); // Cột K
      tomTat.getRange('C12:E45').clearContent();
      tomTat.getRange(12, 8, totalRows - 11, 3).clearContent();  // Cột H:J
      tomTat.getRange(12, 13, totalRows - 11, 3).clearContent(); // Cột M:O
      SpreadsheetApp.flush();
    } catch (errClean) {
      Logger.log('clean: ' + errClean.message);
    }

    // A. Master data AA (gom toàn bộ Log tháng hiện có)
    const logSheets = ss.getSheets().map(s => s.getName()).filter(n => /^Log_\d{2}_\d{4}$/.test(n));
    if (logSheets.length > 0) {
      const queryRanges = logSheets.map(s => `'${s}'!A3:I`).join('; ');
      tomTat.getRange('AA2').setFormula(`=QUERY({${queryRanges}}; "where Col1 is not null"; 0)`);
    }

    // B. Bảng Ví A1:D
    tomTat.getRange('A1').setValue('Ví');
    tomTat.getRange('B1:D1').clearContent();
    tomTat.getRange('A2:D2').setValues([['Ví', 'Thực tế', 'Thu', 'Chi']]);

    // Đọc danh sách Ví thực tế đang có ở cột A (từ A4 xuống đến trước dòng 11)
    const walletRows = [];
    for (let r = 4; r < 11; r++) {
      const wVal = tomTat.getRange('A' + r).getValue();
      if (wVal && String(wVal).trim() !== '') {
        walletRows.push({ row: r, name: String(wVal).trim() });
      }
    }
    // Nếu chưa có ví nào thì fallback 4 ví cơ bản
    if (walletRows.length === 0) {
      const defaultWallets = ['Cash', 'Bank', 'Credit', 'Chưa phân loại'];
      defaultWallets.forEach((w, idx) => {
        tomTat.getRange('A' + (4 + idx)).setValue(w);
        walletRows.push({ row: 4 + idx, name: w });
      });
    }

    walletRows.forEach(item => {
      const r = item.row;
      const w = item.name;
      tomTat.getRange('C' + r).setFormula(`=IFERROR(SUMIFS(AC:AC; AD:AD; "*${w}*"; AB:AB; "Thu"); 0)`);
      tomTat.getRange('D' + r).setFormula(`=IFERROR(SUMIFS(AC:AC; AD:AD; "*${w}*"; AB:AB; "Chi"); 0)`);
      tomTat.getRange('B' + r).setFormula('=C' + r + '+D' + r);
    });
    const lastWalletRow = walletRows[walletRows.length - 1].row;
    tomTat.getRange('A3').setValue('Tổng');
    tomTat.getRange('C3').setFormula(`=SUM(C4:C${lastWalletRow})`);
    tomTat.getRange('D3').setFormula(`=SUM(D4:D${lastWalletRow})`);
    tomTat.getRange('B3').setFormula('=C3+D3');

    // C. Danh mục Con A11:E45
    tomTat.getRange('A11:E11').setValues([['Danh mục Cha', 'Danh mục Con', 'Thực tế', 'Thu', 'Chi']]);
    const maxSubCatRow = Math.max(tomTat.getLastRow(), 45);
    for (let r = 13; r <= maxSubCatRow; r++) {
      const catName = tomTat.getRange('B' + r).getValue();
      if (catName && String(catName).trim() !== '' && String(catName).trim() !== 'Tổng') {
        tomTat.getRange('D' + r).setFormula(`=IFERROR(SUMIFS(AC:AC; AF:AF; B${r}; AB:AB; "Thu"); 0)`);
        tomTat.getRange('E' + r).setFormula(`=IFERROR(SUMIFS(AC:AC; AF:AF; B${r}; AB:AB; "Chi"); 0)`);
        tomTat.getRange('C' + r).setFormula(`=D${r}+E${r}`);
      }
    }
    tomTat.getRange('A12').setValue('Tổng');
    tomTat.getRange('B12').setValue('');
    tomTat.getRange('D12').setFormula(`=SUM(D13:D${maxSubCatRow})`);
    tomTat.getRange('E12').setFormula(`=SUM(E13:E${maxSubCatRow})`);
    tomTat.getRange('C12').setFormula('=D12+E12');

    // D. Đối tượng G11:J (Đọc danh sách thực tế từ G13 trở đi)
    tomTat.getRange('G11:J11').setValues([['Đối tượng', 'Thực tế', 'Thu', 'Chi']]);
    const maxUserSearchRow = Math.max(tomTat.getLastRow(), 45);
    const userRows = [];
    for (let r = 13; r <= maxUserSearchRow; r++) {
      const uVal = tomTat.getRange('G' + r).getValue();
      if (uVal && String(uVal).trim() !== '' && String(uVal).trim() !== 'Tổng') {
        userRows.push({ row: r, name: String(uVal).trim() });
      }
    }

    userRows.forEach(item => {
      const r = item.row;
      tomTat.getRange('I' + r).setFormula(`=IFERROR(SUMIFS(AC:AC; AE:AE; G${r}; AB:AB; "Thu"); 0)`);
      tomTat.getRange('J' + r).setFormula(`=IFERROR(SUMIFS(AC:AC; AE:AE; G${r}; AB:AB; "Chi"); 0)`);
      tomTat.getRange('H' + r).setFormula(`=I${r}+J${r}`);
    });
    const lastUserRow = userRows.length > 0 ? userRows[userRows.length - 1].row : 13;
    tomTat.getRange('G12').setValue('Tổng');
    tomTat.getRange('I12').setFormula(`=SUM(I13:I${lastUserRow})`);
    tomTat.getRange('J12').setFormula(`=SUM(J13:J${lastUserRow})`);
    tomTat.getRange('H12').setFormula('=I12+J12');

    // E. Danh mục Cha L11:O (Đọc danh sách thực tế từ L13 trở đi)
    tomTat.getRange('L11:O11').setValues([['Danh mục Cha', 'Thực tế', 'Thu', 'Chi']]);
    const maxParentSearchRow = Math.max(tomTat.getLastRow(), 30);
    const parentRows = [];
    for (let r = 13; r <= maxParentSearchRow; r++) {
      const pVal = tomTat.getRange('L' + r).getValue();
      if (pVal && String(pVal).trim() !== '' && String(pVal).trim() !== 'Tổng') {
        parentRows.push({ row: r, name: String(pVal).trim() });
      }
    }

    parentRows.forEach(item => {
      const r = item.row;
      tomTat.getRange('N' + r).setFormula(`=IFERROR(SUMIF($A$13:$A$${maxSubCatRow}; L${r}; $D$13:$D$${maxSubCatRow}); 0)`);
      tomTat.getRange('O' + r).setFormula(`=IFERROR(SUMIF($A$13:$A$${maxSubCatRow}; L${r}; $E$13:$E$${maxSubCatRow}); 0)`);
      tomTat.getRange('M' + r).setFormula(`=N${r}+O${r}`);
    });
    const lastParentRow = parentRows.length > 0 ? parentRows[parentRows.length - 1].row : 13;
    tomTat.getRange('L12').setValue('Tổng');
    tomTat.getRange('N12').setFormula(`=SUM(N13:N${lastParentRow})`);
    tomTat.getRange('O12').setFormula(`=SUM(O13:O${lastParentRow})`);
    tomTat.getRange('M12').setFormula('=N12+O12');

    SpreadsheetApp.flush();

    // --- Theme & Kẻ bảng ---
    tomTat.setColumnWidth(1, 130);
    tomTat.setColumnWidth(2, 140);
    tomTat.setColumnWidth(3, 130);
    tomTat.setColumnWidth(4, 130);
    tomTat.setColumnWidth(5, 130);
    tomTat.setColumnWidth(6, 25);
    tomTat.setColumnWidth(7, 160);
    tomTat.setColumnWidth(8, 130);
    tomTat.setColumnWidth(9, 130);
    tomTat.setColumnWidth(10, 130);
    tomTat.setColumnWidth(11, 25);
    tomTat.setColumnWidth(12, 150);
    tomTat.setColumnWidth(13, 130);
    tomTat.setColumnWidth(14, 130);
    tomTat.setColumnWidth(15, 130);

    tomTat.setRowHeight(1, 30);
    tomTat.setRowHeight(2, 28);
    tomTat.setRowHeight(3, 26);
    tomTat.setRowHeight(11, 34);
    tomTat.setRowHeight(12, 28);
    const maxTableBottom = Math.max(maxSubCatRow, lastUserRow, lastParentRow);
    for (let r = 13; r <= maxTableBottom; r++) {
      tomTat.setRowHeight(r, 24);
    }

    // Header & Summary Backgrounds
    tomTat.getRange('A1').setBackground('#451A03').setFontColor('#FEF3C7').setFontWeight('bold');
    tomTat.getRange('A2:D2').setBackground('#78350F').setFontColor('#FEF3C7').setFontWeight('bold');
    tomTat.getRange('A11:E11').setBackground('#78350F').setFontColor('#FEF3C7').setFontWeight('bold');
    tomTat.getRange('G11:J11').setBackground('#854D0E').setFontColor('#FEF3C7').setFontWeight('bold');
    tomTat.getRange('L11:O11').setBackground('#9A3412').setFontColor('#FEF3C7').setFontWeight('bold');

    tomTat.getRange('A3:D3').setBackground('#FEF3C7').setFontColor('#451A03').setFontWeight('bold');
    tomTat.getRange('A12:E12').setBackground('#FEF3C7').setFontColor('#451A03').setFontWeight('bold');
    tomTat.getRange('G12:J12').setBackground('#FEF3C7').setFontColor('#451A03').setFontWeight('bold');
    tomTat.getRange('L12:O12').setBackground('#FEF3C7').setFontColor('#451A03').setFontWeight('bold');

    tomTat.getRange(`C3:C${lastWalletRow}`).setFontColor('#047857');
    tomTat.getRange(`D3:D${lastWalletRow}`).setFontColor('#B91C1C');
    tomTat.getRange(`D12:D${maxSubCatRow}`).setFontColor('#047857');
    tomTat.getRange(`E12:E${maxSubCatRow}`).setFontColor('#B91C1C');
    tomTat.getRange(`I12:I${lastUserRow}`).setFontColor('#047857');
    tomTat.getRange(`J12:J${lastUserRow}`).setFontColor('#B91C1C');
    tomTat.getRange(`N12:N${lastParentRow}`).setFontColor('#047857');
    tomTat.getRange(`O12:O${lastParentRow}`).setFontColor('#B91C1C');

    // Number format: TỪNG CỘT
    safeSetNumberFormat_(tomTat.getRange(`B3:B${lastWalletRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`C3:C${lastWalletRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`D3:D${lastWalletRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`C12:C${maxSubCatRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`D12:D${maxSubCatRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`E12:E${maxSubCatRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`H12:H${lastUserRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`I12:I${lastUserRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`J12:J${lastUserRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`M12:M${lastParentRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`N12:N${lastParentRow}`), numFmt);
    safeSetNumberFormat_(tomTat.getRange(`O12:O${lastParentRow}`), numFmt);

    try {
      tomTat.getRange(`A1:D${lastWalletRow}`).setBorder(true, true, true, true, true, true, borderCol, SpreadsheetApp.BorderStyle.SOLID);
      tomTat.getRange(`A11:E${maxSubCatRow}`).setBorder(true, true, true, true, true, true, borderCol, SpreadsheetApp.BorderStyle.SOLID);
      tomTat.getRange(`G11:J${lastUserRow}`).setBorder(true, true, true, true, true, true, borderCol, SpreadsheetApp.BorderStyle.SOLID);
      tomTat.getRange(`L11:O${lastParentRow}`).setBorder(true, true, true, true, true, true, borderCol, SpreadsheetApp.BorderStyle.SOLID);
    } catch (e) {}

    // Gộp tiêu đề Ví SAU CÙNG
    try {
      tomTat.getRange('A1:D1').merge().setBackground('#451A03').setFontColor('#FEF3C7').setFontWeight('bold')
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    } catch (e) {}

  } catch (e) {
    Logger.log('Lỗi Tóm tắt_v2: ' + e.message);
  }
}