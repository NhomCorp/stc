// ============================================================================
// 👁 7_MONTHVIEW.GS — View chỉ đọc Log/Report tháng (shard ẩn phía sau)
// ============================================================================
// Điều khiển bằng SIDEBAR (viewui.html): dropdown tháng + nút Xem / Sửa.
// - View_Log / View_Report: hàng 1 = banner thông tin, từ hàng 2 = snapshot shard
// - onOpen / F5: ẩn mọi Log_MM_YYYY + Report_MM_YYYY, nạp tháng hiện tại, mở sidebar
// - Sheet gốc chỉ hiện khi bấm Sửa; F5 lại ẩn
// ============================================================================

var VIEW_SHEET_LOG_ = 'View_Log';
var VIEW_SHEET_REPORT_ = 'View_Report';
var VIEW_ROW_CONTENT_ = 2;

// ---------------------------------------------------------------------------
// Tháng: key MM_yyyy ↔ label MM/yyyy
// ---------------------------------------------------------------------------

function currentMonthKey_() {
  return Utilities.formatDate(new Date(), 'GMT+7', 'MM_yyyy');
}

function monthKeyToLabel_(monthKey) {
  const key = normalizeMonthKey_(monthKey);
  return key.replace('_', '/');
}

/** Nhận MM_yyyy, MM/yyyy, Date… → MM_yyyy; không đọc được thì trả tháng hiện tại */
function normalizeMonthKey_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, 'GMT+7', 'MM_yyyy');
  }
  const s = String(raw == null ? '' : raw).trim();
  const m = s.match(/^(\d{1,2})[\/_\-.](\d{4})$/);
  if (m) return m[1].padStart(2, '0') + '_' + m[2];
  return currentMonthKey_();
}

/** Các tháng đang có shard Log, mới nhất trước; luôn kèm tháng hiện tại */
function listMonthKeysForView_() {
  const ss = getSpreadsheet_();
  const seen = {};
  const keys = [];
  ss.getSheets().forEach(function (sh) {
    const m = sh.getName().match(/^Log_(\d{2}_\d{4})$/);
    if (!m || seen[m[1]]) return;
    seen[m[1]] = true;
    keys.push(m[1]);
  });
  const cur = currentMonthKey_();
  if (!seen[cur]) keys.push(cur);
  keys.sort(function (a, b) {
    const pa = a.split('_');
    const pb = b.split('_');
    if (pa[1] !== pb[1]) return Number(pb[1]) - Number(pa[1]);
    return Number(pb[0]) - Number(pa[0]);
  });
  return keys;
}

// ---------------------------------------------------------------------------
// Ẩn / hiện shard tháng
// ---------------------------------------------------------------------------

function isMonthShardName_(name) {
  return /^Log_\d{2}_\d{4}$/.test(name) || /^Report_\d{2}_\d{4}$/.test(name);
}

function hideAllMonthShards_() {
  const ss = getSpreadsheet_();
  let n = 0;
  ss.getSheets().forEach(function (sh) {
    if (!isMonthShardName_(sh.getName())) return;
    if (sh.isSheetHidden()) return;
    try {
      sh.hideSheet();
      n++;
    } catch (e) {}
  });
  return n;
}

function hideMonthShardPair_(logSheet, rptSheet) {
  try { if (logSheet && !logSheet.isSheetHidden()) logSheet.hideSheet(); } catch (e1) {}
  try { if (rptSheet && !rptSheet.isSheetHidden()) rptSheet.hideSheet(); } catch (e2) {}
}

// ---------------------------------------------------------------------------
// Sheet View
// ---------------------------------------------------------------------------

/** Banner hàng 1 — chỉ hiển thị, không có ô bấm (mọi thao tác nằm ở sidebar) */
function paintViewBanner_(viewSheet, kind, monthKey) {
  if (!viewSheet) return;
  const label = monthKey ? monthKeyToLabel_(monthKey) : '(chưa nạp)';
  const title = (kind === 'report' ? '📊 BÁO CÁO' : '📒 SỔ GIAO DỊCH') + ' — Tháng ' + label;

  const row1 = viewSheet.getRange(1, 1, 1, Math.max(viewSheet.getMaxColumns(), 1));
  try { row1.clearDataValidations(); } catch (e1) {}
  try { row1.clearNote(); } catch (e2) {}
  try { row1.breakApart(); } catch (e3) {}

  viewSheet.getRange('A1')
    .setValue(title + '   ·   chỉ đọc — đổi tháng ở bảng điều khiển bên phải')
    .setFontWeight('bold')
    .setFontColor('#FFFFFF')
    .setBackground(kind === 'report' ? '#B45309' : '#0F766E')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  try { viewSheet.getRange(1, 1, 1, 9).merge(); } catch (eMerge) {}
  try { viewSheet.setFrozenRows(1); } catch (eFreeze) {}
}

function ensureViewSheet_(name, kind, tabIndex) {
  const ss = getSpreadsheet_();
  let sh = getSheetByGidOrName(getDynamicGid_(kind === 'report' ? 'view_report_gid' : 'view_log_gid'), name);
  if (!sh) sh = ss.getSheetByName(name);
  if (sh) {
    try {
      PROP.setProperty(kind === 'report' ? 'view_report_gid' : 'view_log_gid', String(sh.getSheetId()));
    } catch (e0) {}
    return sh;
  }

  sh = ss.insertSheet(name, Math.min(tabIndex, ss.getNumSheets()));
  try {
    PROP.setProperty(kind === 'report' ? 'view_report_gid' : 'view_log_gid', String(sh.getSheetId()));
  } catch (e0) {}
  try { sh.setTabColor(kind === 'report' ? '#B45309' : '#0F766E'); } catch (eColor) {}
  paintViewBanner_(sh, kind, null);
  sh.getRange(VIEW_ROW_CONTENT_, 1).setValue('(Chưa nạp dữ liệu)');
  return sh;
}

function ensureViewSheets_() {
  return {
    viewLog: ensureViewSheet_(VIEW_SHEET_LOG_, 'log', 1),
    viewRpt: ensureViewSheet_(VIEW_SHEET_REPORT_, 'report', 2)
  };
}

/**
 * Chuyển tab sang sheet chỉ định.
 * Gọi từ sidebar thì .activate() đơn lẻ hay không ăn — cần setActiveSheet + flush.
 */
function focusSheet_(sheet, cellA1) {
  if (!sheet) return;
  const ss = getSpreadsheet_();
  try { sheet.activate(); } catch (e1) {}
  try { ss.setActiveSheet(sheet); } catch (e2) {}
  if (cellA1) {
    try { sheet.setActiveSelection(cellA1); } catch (e3) {}
  }
  try { SpreadsheetApp.flush(); } catch (e4) {}
}

/**
 * Nạp snapshot shard → View. Hàng 1 giữ banner, nội dung từ hàng 2.
 * kind: 'log' | 'report'
 */
function loadMonthIntoView_(kind, monthKey, options) {
  const opts = options || {};
  const key = normalizeMonthKey_(monthKey);
  const label = monthKeyToLabel_(key);
  const views = ensureViewSheets_();
  const view = kind === 'report' ? views.viewRpt : views.viewLog;

  const sheets = getOrCreateMonthSheets(key);
  hideMonthShardPair_(sheets.logSheet, sheets.rptSheet);
  const source = kind === 'report' ? sheets.rptSheet : sheets.logSheet;
  const startRow = VIEW_ROW_CONTENT_;

  // Dọn vùng nội dung cũ; breakApart trước để lần nạp sau không đụng ô đã merge
  const oldRows = Math.max(view.getLastRow() - startRow + 1, 1);
  const oldCols = Math.max(view.getLastColumn(), 9);
  const oldRange = view.getRange(startRow, 1, oldRows, oldCols);
  try { oldRange.breakApart(); } catch (eBreak) {}
  oldRange.clear();

  if (!source) {
    view.getRange(startRow, 1).setValue('Không có sheet nguồn cho tháng ' + label);
    paintViewBanner_(view, kind, key);
    return { ok: false, monthKey: key, message: 'Thiếu sheet nguồn tháng ' + label };
  }

  const srcRows = Math.max(source.getLastRow(), 1);
  const srcCols = Math.max(source.getLastColumn(), kind === 'report' ? 19 : 9);
  source.getRange(1, 1, srcRows, srcCols).copyTo(
    view.getRange(startRow, 1),
    SpreadsheetApp.CopyPasteType.PASTE_NORMAL,
    false
  );

  // Khớp độ rộng cột để nhìn giống sheet gốc
  for (let c = 1; c <= srcCols; c++) {
    try { view.setColumnWidth(c, source.getColumnWidth(c)); } catch (eW) {}
  }

  paintViewBanner_(view, kind, key);

  if (!opts.silent) {
    try {
      SpreadsheetApp.getActive().toast(
        (kind === 'report' ? 'Report' : 'Log') + ' tháng ' + label,
        '👁 Đã nạp',
        4
      );
    } catch (eToast) {}
  }
  return { ok: true, monthKey: key, message: 'Đã nạp tháng ' + label };
}

/** Mở sheet gốc (bỏ ẩn) để sửa */
function openMonthShardForEdit_(kind, monthKey) {
  const key = normalizeMonthKey_(monthKey);
  const sheets = getOrCreateMonthSheets(key);
  const target = kind === 'report' ? sheets.rptSheet : sheets.logSheet;
  if (!target) {
    return { ok: false, monthKey: key, message: 'Không tìm thấy sheet gốc tháng ' + monthKeyToLabel_(key) };
  }
  target.showSheet();
  focusSheet_(target, 'A1');
  try {
    SpreadsheetApp.getActive().toast(
      'Đang mở ' + target.getName() + '. Tải lại trang sẽ ẩn lại.',
      '✏️ Sheet gốc',
      6
    );
  } catch (eToast) {}
  return { ok: true, monthKey: key, message: 'Đã mở ' + target.getName() };
}

// ---------------------------------------------------------------------------
// Sidebar — bảng điều khiển
// ---------------------------------------------------------------------------

function showViewSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('viewui')
    .setTitle('Sổ & báo cáo');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Sidebar gọi khi mở: danh sách tháng + tháng đang xem */
function viewSidebarState() {
  const months = listMonthKeysForView_().map(function (k) {
    return { key: k, label: monthKeyToLabel_(k) };
  });
  let selected = currentMonthKey_();
  try {
    const stored = PROP.getProperty('view_last_month');
    if (stored && months.some(function (m) { return m.key === stored; })) selected = stored;
  } catch (e) {}
  return { months: months, selected: selected };
}

/** Sidebar → Xem: nhảy sang tab View tương ứng rồi nạp snapshot */
function viewSidebarLoad(monthKey, kind) {
  const key = normalizeMonthKey_(monthKey);
  const isReport = kind === 'report';
  try { PROP.setProperty('view_last_month', key); } catch (e) {}

  // Chuyển tab trước để người dùng thấy ngay, kể cả khi đang đứng ở sheet khác
  const views = ensureViewSheets_();
  const view = isReport ? views.viewRpt : views.viewLog;
  focusSheet_(view);

  const r = loadMonthIntoView_(isReport ? 'report' : 'log', key, { silent: true });
  focusSheet_(view, 'A2');
  if (r.ok) {
    r.message = 'Đã mở ' + view.getName() + ' — tháng ' + monthKeyToLabel_(key);
  }
  return r;
}

/** Sidebar: tính lại báo cáo một tháng rồi cập nhật Tóm tắt. */
function viewSidebarRebuildReport(monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^(0[1-9]|1[0-2])_\d{4}$/.test(key)) {
    return { ok: false, message: 'Tháng không hợp lệ.' };
  }
  const res = rebuildMonthsNow_([key]);
  res.ok = res.errors.length === 0;
  res.message = res.ok ? 'Đã làm mới báo cáo tháng ' + monthKeyToLabel_(key) : res.errors.join('; ');
  return res;
}

/** Sidebar: tính lại báo cáo toàn bộ tháng có Log (giống menu menuRebuildAllMonthReports). */
function viewSidebarRebuildAllReports() {
  const keys = listReportLogMonths_();
  if (!keys.length) return { ok: true, rebuilt: [], errors: [], message: 'Chưa có tháng nào có Log.' };
  const res = rebuildMonthsNow_(keys);
  res.message = 'Đã làm mới ' + res.rebuilt.length + '/' + keys.length + ' báo cáo.' +
    (res.errors.length ? ' Lỗi: ' + res.errors.join('; ') : '');
  res.ok = res.errors.length === 0;
  return res;
}

/** Chỉ lấy tháng thực sự có Log, không thêm tháng hiện tại chưa có dữ liệu. */
function viewSidebarReportMonths() {
  const ss = getSpreadsheet_();
  return listMonthKeysForView_().filter(function (key) {
    return !!ss.getSheetByName(monthSheetName_(key));
  });
}

/** Sidebar → Sửa: bỏ ẩn + mở sheet gốc */
function viewSidebarEdit(monthKey, kind) {
  const key = normalizeMonthKey_(monthKey);
  try { PROP.setProperty('view_last_month', key); } catch (e) {}
  return openMonthShardForEdit_(kind === 'report' ? 'report' : 'log', key);
}

/** Sidebar → Ẩn lại toàn bộ sheet tháng */
function viewSidebarHideShards() {
  const n = hideAllMonthShards_();
  focusSheet_(ensureViewSheets_().viewLog);
  return { ok: true, message: n > 0 ? ('Đã ẩn ' + n + ' sheet tháng') : 'Không còn sheet tháng nào đang hiện' };
}

// ---------------------------------------------------------------------------
// onOpen / menu
// ---------------------------------------------------------------------------

/** onOpen / F5: ẩn shard + nạp tháng hiện tại vào 2 View */
function bootstrapMonthViewsOnOpen_() {
  ensureViewSheets_();
  hideAllMonthShards_();
  const cur = currentMonthKey_();
  loadMonthIntoView_('log', cur, { silent: true });
  loadMonthIntoView_('report', cur, { silent: true });
  try { PROP.setProperty('view_last_month', cur); } catch (e) {}
}

function menuViewLoadLog() {
  const r = viewSidebarLoad(viewLastMonthKey_(), 'log');
  if (!r.ok) SpreadsheetApp.getUi().alert(r.message);
}

function menuViewLoadReport() {
  const r = viewSidebarLoad(viewLastMonthKey_(), 'report');
  if (!r.ok) SpreadsheetApp.getUi().alert(r.message);
}

function menuViewEditLog() {
  const r = viewSidebarEdit(viewLastMonthKey_(), 'log');
  if (!r.ok) SpreadsheetApp.getUi().alert(r.message);
}

function menuViewEditReport() {
  const r = viewSidebarEdit(viewLastMonthKey_(), 'report');
  if (!r.ok) SpreadsheetApp.getUi().alert(r.message);
}

function menuHideAllMonthShards() {
  const r = viewSidebarHideShards();
  SpreadsheetApp.getActive().toast(r.message, '🙈 Ẩn sheet tháng', 4);
}

function viewLastMonthKey_() {
  try {
    const stored = PROP.getProperty('view_last_month');
    if (stored) return normalizeMonthKey_(stored);
  } catch (e) {}
  return currentMonthKey_();
}

/** Dựng lại View từ đầu (khi cần sửa layout / mới cài script) */
function setupMonthViewsManual() {
  bootstrapMonthViewsOnOpen_();
  showViewSidebar();
}

/** Mục Lục → click link: unhide rồi activate */
function activateSheetFromMucLuc_(target) {
  if (!target) return;
  try { target.showSheet(); } catch (e) {}
  target.activate();
}
