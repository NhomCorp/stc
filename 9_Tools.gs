// ============================================================================
// 🧹 9_TOOLS.GS — ĐỒNG BỘ GIAO DIỆN + LÀM MỚI (FORMAT / DATA)
// ----------------------------------------------------------------------------
// Theme: chỉ đồng bộ ĐỊNH DẠNG. Không ghi đè giá trị / công thức.
// Làm mới (menu): format | data | both × tháng đang mở | tất cả tháng.
// Data: dry-run xem trước → xác nhận (ALL khi chạy toàn sổ) → chuẩn hoá.
//
// THỨ TỰ CHẠY THEME (GAS Editor):
//   1. showTemplateLog()          -> hiện Template_Log để chỉnh tay
//   2. (chỉnh tay dòng 3 của Template_Log cho đẹp)
//   3. checkTemplateLogReady()    -> xác nhận dòng 3 đã có định dạng
//   4. syncOneMonthLogTheme('09_2026')  -> chạy thử 1 tháng
//   5. syncAllMonthLogTheme()     -> chạy toàn bộ
//   6. hideTemplateLog()          -> ẩn lại
//   7. syncReportBoldBlock()      -> đồng bộ in đậm A3:B7 của Report tháng
// ============================================================================

const THEME_SYNC = {
  NUM_COLS: 9,
  DATA_START_ROW: 3,
  // Dòng trên Template_Log dùng làm khuôn cho MỌI dòng dữ liệu.
  SAMPLE_ROW: 3,
  // Số dòng trống dự phòng giữ lại phía dưới bảng (đã sẵn format).
  SPARE_ROWS: 20,
  // Đóng băng title + header trên mọi Log tháng.
  FROZEN_ROWS: 2,
  // Cắt bớt dòng thừa cuối sheet nếu chúng hoàn toàn trống.
  TRIM_EXTRA_ROWS: true,
  // Tắt nếu muốn giữ độ rộng cột riêng của từng tháng.
  SYNC_COLUMN_WIDTHS: true,
  // Tắt nếu muốn giữ nguyên định dạng dòng 1-2 của từng tháng.
  SYNC_HEADER_FORMAT: true,
  // Bật filter (nút lọc) trên dòng header (dòng 2).
  APPLY_FILTER: true,
  // Màu border vùng dữ liệu.
  BORDER_COLOR: '#999999',
  // Override chiều cao dòng dữ liệu (px). Để null thì lấy từ template.
  DATA_ROW_HEIGHT: 28,
  // Ép màu chữ đen cho cột Ngày (cột A).
  DATE_COL_FONT_COLOR: '#000000',
  // Bỏ qua chốt an toàn (chỉ bật khi bạn chắc chắn Template_Log đã đẹp).
  SKIP_READY_CHECK: false
};

const REPORT_SYNC = {
  NUM_COLS: 19,
  // Khối chỉ số tổng A3:B7 (Thu / Chi / Ròng / Cần xác nhận / Số giao dịch).
  KPI_FIRST_ROW: 3,
  KPI_LAST_ROW: 7,
  KPI_NUM_COLS: 2
};

// ----------------------------------------------------------------------------
// Bước 1 & 6 — Hiện / ẩn Template_Log để chỉnh tay
// ----------------------------------------------------------------------------

function showTemplateLog() {
  const tpl = getTemplateLog_();
  tpl.showSheet();
  tpl.activate();
  Logger.log('✅ Đã hiện Template_Log. Chỉnh dòng 3 xong thì chạy checkTemplateLogReady().');
  return 'Đã hiện Template_Log';
}

function hideTemplateLog() {
  getTemplateLog_().hideSheet();
  Logger.log('✅ Đã ẩn lại Template_Log.');
  return 'Đã ẩn Template_Log';
}

function getTemplateLog_() {
  const ss = getSpreadsheet_();
  const tpl = getSheetByGid(GID.TEMPLATE_LOG) || ss.getSheetByName('Template_Log');
  if (!tpl) throw new Error('Không tìm thấy Template_Log (GID: ' + GID.TEMPLATE_LOG + ')');
  return tpl;
}

// ----------------------------------------------------------------------------
// Bước 3 — Chốt an toàn: dòng khuôn phải có định dạng, tránh copy rỗng đè lên
// ----------------------------------------------------------------------------

function checkTemplateLogReady() {
  const tpl = getTemplateLog_();
  const info = inspectTemplateLogSampleRow_(tpl);
  Logger.log(JSON.stringify(info, null, 2));
  Logger.log(info.ready
    ? '✅ Dòng khuôn đã có định dạng — chạy sync được.'
    : '⚠️ Dòng khuôn còn trống trơn. Chạy sync bây giờ sẽ XOÁ định dạng của các Log tháng.');
  return info;
}

function inspectTemplateLogSampleRow_(tpl) {
  const r = tpl.getRange(THEME_SYNC.SAMPLE_ROW, 1, 1, THEME_SYNC.NUM_COLS);
  const validations = r.getDataValidations()[0].map(v => (v ? v.getCriteriaType().toString() : null));
  const backgrounds = r.getBackgrounds()[0];
  const numberFormats = r.getNumberFormats()[0];

  const hasValidation = validations.some(v => v !== null);
  const hasBackground = backgrounds.some(c => c && c.toLowerCase() !== '#ffffff');
  const hasNumberFormat = numberFormats.some(f => f && f !== '0.###############' && f.toLowerCase() !== 'general');

  return {
    ready: hasValidation || hasBackground || hasNumberFormat,
    hasValidation: hasValidation,
    hasBackground: hasBackground,
    hasNumberFormat: hasNumberFormat,
    validations: validations,
    backgrounds: backgrounds,
    numberFormats: numberFormats,
    conditionalRules: tpl.getConditionalFormatRules().length,
    bandings: tpl.getBandings().length
  };
}

// ----------------------------------------------------------------------------
// Bước 4 & 5 — Đồng bộ giao diện Log tháng theo Template_Log
// ----------------------------------------------------------------------------

/** Đồng bộ toàn bộ Log_MM_YYYY */
function syncAllMonthLogTheme() {
  return runMonthLogThemeSync_(null);
}

/** Đồng bộ đúng 1 tháng, ví dụ: syncOneMonthLogTheme('09_2026') */
function syncOneMonthLogTheme(monthKey) {
  return runMonthLogThemeSync_(String(monthKey || '').trim());
}

function runMonthLogThemeSync_(onlyMonthKey) {
  const ss = getSpreadsheet_();
  const tpl = getTemplateLog_();

  if (!THEME_SYNC.SKIP_READY_CHECK && !inspectTemplateLogSampleRow_(tpl).ready) {
    throw new Error(
      'Dòng ' + THEME_SYNC.SAMPLE_ROW + ' của Template_Log chưa có định dạng. '
      + 'Chạy showTemplateLog() để chỉnh tay trước, hoặc đặt THEME_SYNC.SKIP_READY_CHECK = true nếu cố ý.'
    );
  }

  const spec = readTemplateLogSpec_(tpl);
  const targets = ss.getSheets().filter(sh => {
    const name = sh.getName();
    if (!/^Log_\d{2}_\d{4}$/.test(name)) return false;
    return onlyMonthKey ? name === 'Log_' + onlyMonthKey : true;
  });

  const ok = [];
  const failed = [];

  targets.forEach(sh => {
    try {
      applyLogThemeToSheet_(spec, sh);
      SpreadsheetApp.flush();
      ok.push(sh.getName());
    } catch (e) {
      failed.push(sh.getName() + ' (' + e.message + ')');
      Logger.log('❌ ' + sh.getName() + ': ' + e.message);
    }
  });

  const msg = 'Log tháng: ' + ok.length + ' sheet đồng bộ OK'
    + (failed.length ? ', ' + failed.length + ' lỗi: ' + failed.join('; ') : '');
  Logger.log('✅ ' + msg);
  toast_(msg, 'Đồng bộ giao diện');
  return msg;
}

function readTemplateLogSpec_(tpl) {
  const n = THEME_SYNC.NUM_COLS;

  const colWidths = [];
  for (let c = 1; c <= n; c++) colWidths.push(tpl.getColumnWidth(c));

  return {
    sheet: tpl,
    colWidths: colWidths,
    headerHeights: [tpl.getRowHeight(1), tpl.getRowHeight(2)],
    dataRowHeight: tpl.getRowHeight(THEME_SYNC.SAMPLE_ROW),
    frozenCols: tpl.getFrozenColumns(),
    hiddenGridlines: tpl.hasHiddenGridlines(),
    cfRules: tpl.getConditionalFormatRules(),
    bandings: tpl.getBandings().map(b => ({
      header: b.getHeaderRowColor(),
      first: b.getFirstRowColor(),
      second: b.getSecondRowColor(),
      footer: b.getFooterRowColor()
    }))
  };
}

function applyLogThemeToSheet_(spec, sh) {
  const n = THEME_SYNC.NUM_COLS;
  const startRow = THEME_SYNC.DATA_START_ROW;

  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  // 0. GỠ FILTER CŨ TRƯỚC để tất cả dòng hiện ra đầy đủ (tránh dòng bị ẩn không set được height)
  if (sh.getFilter()) {
    try { sh.getFilter().remove(); } catch (e) {}
  }

  // 1. Khung sheet
  if (THEME_SYNC.SYNC_COLUMN_WIDTHS) {
    for (let c = 1; c <= n; c++) sh.setColumnWidth(c, spec.colWidths[c - 1]);
  }
  sh.setFrozenRows(THEME_SYNC.FROZEN_ROWS);
  sh.setFrozenColumns(spec.frozenCols);
  sh.setHiddenGridlines(spec.hiddenGridlines);

  // 2. Chuẩn hóa số dòng: dữ liệu thực tế + 1 Dummy Row + dòng dự phòng
  const lastDataRow = Math.max(sh.getLastRow(), startRow - 1);
  const targetLastRow = lastDataRow + 1 + THEME_SYNC.SPARE_ROWS;
  resizeSheetRows_(sh, targetLastRow);

  // 3. Header cố định A1:I2 — copy 1-1 từ Template
  if (THEME_SYNC.SYNC_HEADER_FORMAT) {
    spec.sheet.getRange(1, 1, 2, n)
      .copyTo(sh.getRange(1, 1, 2, n), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sh.setRowHeight(1, spec.headerHeights[0]);
    sh.setRowHeight(2, spec.headerHeights[1]);
  }

  // Khôi phục chuẩn ô B1 (tránh bị biến thành số serial date như 46204)
  fixMonthLogB1Cell_(sh);

  // Xóa sạch toàn bộ Banding / CF cũ
  sh.clearConditionalFormatRules();
  sh.getBandings().forEach(b => {
    try { b.remove(); } catch (e) {}
  });

  // 4. Vùng dữ liệu co giãn — nhân format và validation từ dòng khuôn
  const numDataRows = targetLastRow - startRow + 1;
  if (numDataRows > 0) {
    const src = spec.sheet.getRange(THEME_SYNC.SAMPLE_ROW, 1, 1, n);
    const dst = sh.getRange(startRow, 1, numDataRows, n);
    
    // Copy format & data validation
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    
    // XÓA SẠCH banding & CF do copyTo mang sang, rồi xóa màu nền tĩnh
    sh.clearConditionalFormatRules();
    sh.getBandings().forEach(b => {
      try { b.remove(); } catch (e) {}
    });
    dst.setBackground(null);

    // Chiều cao dòng: set dứt khoát cho từng dòng nếu setRowHeights theo cụm không ăn
    const rowH = THEME_SYNC.DATA_ROW_HEIGHT || spec.dataRowHeight;
    try {
      sh.setRowHeights(startRow, numDataRows, rowH);
    } catch (e) {
      for (let r = startRow; r <= targetLastRow; r++) {
        sh.setRowHeight(r, rowH);
      }
    }
  }

  // 5. Kẻ màu xen kẽ (zebra) thủ công — không dùng Banding
  applyZebraStripes_(spec, sh, startRow, targetLastRow, n);

  // 6. Thêm lại Conditional Formatting rules từ Template
  applyCfRules_(spec.cfRules, sh, startRow, targetLastRow, n);

  // 7. ÉP MÀU CHỮ ĐEN CỘT A (NGÀY) CHO TẤT CẢ DÒNG CŨ VÀ MỚI (chạy sau CF để đè lên)
  if (THEME_SYNC.DATE_COL_FONT_COLOR && numDataRows > 0) {
    try {
      sh.getRange(startRow, 1, numDataRows, 1).setFontColor(THEME_SYNC.DATE_COL_FONT_COLOR);
    } catch (e) {}
  }

  // 8. Kẻ khung toàn bộ vùng dữ liệu
  if (THEME_SYNC.BORDER_COLOR && numDataRows > 0) {
    try {
      sh.getRange(startRow, 1, numDataRows, n).setBorder(
        true, true, true, true, true, true, 
        THEME_SYNC.BORDER_COLOR, 
        SpreadsheetApp.BorderStyle.SOLID
      );
    } catch(e) {}
  }

  // 9. Bật Filter lại trên toàn bộ dòng dữ liệu
  if (THEME_SYNC.APPLY_FILTER) {
    const filterRange = sh.getRange(2, 1, targetLastRow - 1, n);
    filterRange.createFilter();
  }

  SpreadsheetApp.flush();
}

/** Đưa số dòng của sheet về đúng targetLastRow (chỉ xóa phần đuôi trống hoàn toàn) */
function resizeSheetRows_(sh, targetLastRow) {
  const maxRows = sh.getMaxRows();
  if (maxRows < targetLastRow) {
    sh.insertRowsAfter(maxRows, targetLastRow - maxRows);
    return;
  }
  if (!THEME_SYNC.TRIM_EXTRA_ROWS || maxRows === targetLastRow) return;

  const count = maxRows - targetLastRow;
  const tail = sh.getRange(targetLastRow + 1, 1, count, sh.getMaxColumns()).getValues();
  const isEmpty = tail.every(row => row.every(cell => cell === '' || cell === null));
  if (isEmpty) sh.deleteRows(targetLastRow + 1, count);
}

function applyCfRules_(tplRules, sh, startRow, lastRow, numCols) {
  if (!tplRules || !tplRules.length) return;
  
  // CHỈ ÁP DỤNG CF RULES TỪ CỘT B ĐẾN CỘT I (CỘT 2 -> 9)
  // LOẠI TRỪ HOÀN TOÀN CỘT A (NGÀY) để không bị rule đổi màu xanh/đỏ đè lên cột Ngày
  const cfStartCol = 2;
  const cfNumCols = numCols - cfStartCol + 1; // 8 cột: B, C, D, E, F, G, H, I
  const range = sh.getRange(startRow, cfStartCol, lastRow - startRow + 1, cfNumCols);
  
  sh.setConditionalFormatRules(tplRules.map(r => r.copy().setRanges([range]).build()));
}

function applyCleanBandings_(tplBandings, sh, startRow, lastRow, numCols) {
  applyZebraStripes_(tplBandings, sh, startRow, lastRow, numCols);
}

/** Kẻ màu xen kẽ (zebra) thủ công bằng setBackgrounds — không dùng Banding để tránh xung đột CF/format copy */
function applyZebraStripes_(spec, sh, startRow, lastRow, numCols) {
  const numRows = lastRow - startRow + 1;
  if (numRows <= 0) return;

  let firstColor = '#ffffff';
  let secondColor = '#f8f9fa';

  // Lấy màu chuẩn từ banding của template nếu có
  const bandings = (spec && spec.bandings) || [];
  if (bandings.length > 0) {
    if (bandings[0].first) firstColor = bandings[0].first;
    if (bandings[0].second) secondColor = bandings[0].second;
  }

  // Xây mảng màu nền theo từng hàng cột (9 cột)
  const bg = [];
  for (let i = 0; i < numRows; i++) {
    const color = (i % 2 === 0) ? firstColor : secondColor;
    const row = [];
    for (let c = 0; c < numCols; c++) row.push(color);
    bg.push(row);
  }

  try {
    sh.getRange(startRow, 1, numRows, numCols).setBackgrounds(bg);
  } catch (e) {
    Logger.log('applyZebraStripes ' + sh.getName() + ': ' + e.message);
  }
}

// ----------------------------------------------------------------------------
// Bước 7 — Report tháng: đồng bộ in đậm khối chỉ số A3:B7 & Kẻ viền co giãn tự động
// ----------------------------------------------------------------------------

function syncReportBoldBlock() {
  return runMonthReportThemeSync_(null);
}

/** Đồng bộ đúng 1 Report tháng, ví dụ: syncOneMonthReportTheme('09_2026') */
function syncOneMonthReportTheme(monthKey) {
  return runMonthReportThemeSync_(String(monthKey || '').trim());
}

function runMonthReportThemeSync_(onlyMonthKey) {
  const ss = getSpreadsheet_();
  const tpl = getSheetByGid(GID.TEMPLATE_REPORT) || ss.getSheetByName('Template_Report');
  if (!tpl) throw new Error('Không tìm thấy Template_Report (GID: ' + GID.TEMPLATE_REPORT + ')');

  const numRows = REPORT_SYNC.KPI_LAST_ROW - REPORT_SYNC.KPI_FIRST_ROW + 1;
  const weights = tpl
    .getRange(REPORT_SYNC.KPI_FIRST_ROW, 1, numRows, REPORT_SYNC.KPI_NUM_COLS)
    .getFontWeights();

  const targets = ss.getSheets().filter(sh => {
    const name = sh.getName();
    if (!/^Report_\d{2}_\d{4}$/.test(name)) return false;
    return onlyMonthKey ? name === 'Report_' + onlyMonthKey : true;
  });

  targets.forEach(sh => {
    sh.getRange(REPORT_SYNC.KPI_FIRST_ROW, 1, numRows, REPORT_SYNC.KPI_NUM_COLS)
      .setFontWeights(weights);
    autoBorderReportTables_(sh);
  });

  SpreadsheetApp.flush();
  const msg = 'Report tháng: đã đồng bộ in đậm & kẻ viền cho ' + targets.length + ' sheet'
    + (onlyMonthKey ? ' (' + onlyMonthKey + ')' : '');
  Logger.log('✅ ' + msg);
  toast_(msg, 'Đồng bộ Report');
  return msg;
}

/** Tự động tìm dòng cuối có dữ liệu và kẻ viền đóng khung mỏng cho 4 bảng Report tháng */
function autoBorderReportTables_(sheet) {
  const maxRows = sheet.getMaxRows();
  const startRow = 10;
  if (maxRows < startRow) return;

  // 4 block bảng: [Tên, Cột bắt đầu, Số cột]
  const blocks = [
    { name: 'Ví', col: 1, numCols: 4 },           // A:D
    { name: 'Đối tượng', col: 6, numCols: 4 },     // F:I
    { name: 'Danh mục cha', col: 11, numCols: 4 },  // K:N
    { name: 'Danh mục con', col: 16, numCols: 4 }   // P:S
  ];

  const clearRows = maxRows - startRow + 1;

  blocks.forEach(b => {
    const fullRange = sheet.getRange(startRow, b.col, clearRows, b.numCols);
    // Xóa border cũ toàn bộ vùng bên dưới header
    fullRange.setBorder(false, false, false, false, false, false);

    // Tìm dòng cuối có dữ liệu trong cột đầu tiên của block
    const colValues = sheet.getRange(startRow, b.col, clearRows, 1).getValues();
    let lastDataIdx = -1;
    for (let i = colValues.length - 1; i >= 0; i--) {
      const val = colValues[i][0];
      if (val !== '' && val !== null && val !== undefined) {
        lastDataIdx = i;
        break;
      }
    }

    // Nếu có dữ liệu, kẻ viền mỏng ôm đúng các dòng thực tế
    if (lastDataIdx >= 0) {
      const dataRows = lastDataIdx + 1;
      const dataRange = sheet.getRange(startRow, b.col, dataRows, b.numCols);
      dataRange.setBorder(true, true, true, true, true, true, '#d0d7de', SpreadsheetApp.BorderStyle.SOLID);
    }
  });
}

function toast_(msg, title) {
  try { SpreadsheetApp.getActive().toast(msg, title, 6); } catch (e) {}
}

/** Khôi phục ô B1 thành chuỗi MM/YYYY và đặt định dạng Text (@) để tránh bị convert thành số serial */
function fixMonthLogB1Cell_(sh) {
  const m = sh.getName().match(/^Log_(\d{2})_(\d{4})$/);
  if (!m) return;
  const standard = m[1] + '/' + m[2];
  const cell = sh.getRange('B1');
  cell.setNumberFormat('@');
  cell.setValue(standard);
}

// ============================================================================
// 🔄 LÀM MỚI — MENU: FORMAT / DATA / BOTH × ONE / ALL
// ----------------------------------------------------------------------------

const REFRESH_BATCH_SIZE = 50;

/** Menu: tháng đang mở */
function menuRefreshOneFormat() { return runRefreshMenuUI_('one', 'format'); }
function menuRefreshOneData() { return runRefreshMenuUI_('one', 'data'); }
function menuRefreshOneBoth() { return runRefreshMenuUI_('one', 'both'); }

/** Menu: tất cả tháng */
function menuRefreshAllFormat() { return runRefreshMenuUI_('all', 'format'); }
function menuRefreshAllData() { return runRefreshMenuUI_('all', 'data'); }
function menuRefreshAllBoth() { return runRefreshMenuUI_('all', 'both'); }

/**
 * Lõi UI: dry-run (data) → xác nhận → chạy → toast/alert kết quả.
 * @param {'one'|'all'} scope
 * @param {'format'|'data'|'both'} mode
 */
function runRefreshMenuUI_(scope, mode) {
  const ui = SpreadsheetApp.getUi();
  let monthKeys = [];
  try {
    monthKeys = resolveRefreshMonthKeys_(scope);
  } catch (e) {
    const err = e && e.message ? e.message : String(e);
    ui.alert('Làm mới', err, ui.ButtonSet.OK);
    return err;
  }

  const scopeLabel = scope === 'one' ? ('tháng ' + monthKeys[0].replace('_', '/')) : ('tất cả ' + monthKeys.length + ' tháng');
  const lines = [];

  // --- DATA: dry-run + xác nhận ---
  if (mode === 'data' || mode === 'both') {
    let preview;
    try {
      preview = normalizeMonthDataScoped_(scope === 'one' ? monthKeys[0] : null, { dryRun: true });
    } catch (e) {
      const err = 'Lỗi xem trước data: ' + (e && e.message ? e.message : e);
      ui.alert('Làm mới', err, ui.ButtonSet.OK);
      return err;
    }

    const previewText = formatNormalizePreview_(preview, scopeLabel);
    if (scope === 'all') {
      const confirm = ui.prompt(
        'Làm mới DATA — TẤT CẢ tháng',
        previewText + '\n\n⚠️ Có thể chuyển dòng giữa nhiều sheet và mất thời gian.\nGõ ALL để xác nhận, hoặc Huỷ.',
        ui.ButtonSet.OK_CANCEL
      );
      if (confirm.getSelectedButton() !== ui.Button.OK) return 'Đã huỷ.';
      if (String(confirm.getResponseText() || '').trim().toUpperCase() !== 'ALL') {
        ui.alert('Làm mới', 'Chưa xác nhận. Phải gõ đúng ALL.', ui.ButtonSet.OK);
        return 'Chưa xác nhận ALL.';
      }
    } else {
      const ans = ui.alert('Làm mới DATA — ' + scopeLabel, previewText + '\n\nTiếp tục chuẩn hoá dữ liệu?', ui.ButtonSet.OK_CANCEL);
      if (ans !== ui.Button.YES && ans !== ui.Button.OK) return 'Đã huỷ.';
    }

    try {
      const dataRes = normalizeMonthDataScoped_(scope === 'one' ? monthKeys[0] : null, { dryRun: false });
      lines.push(dataRes.summary);
      if (dataRes.affected) {
        Object.keys(dataRes.affected).forEach(function (mk) {
          if (monthKeys.indexOf(mk) < 0) monthKeys.push(mk);
        });
      }
      if (scope === 'all') {
        try {
          rebuildMucLuc();
          lines.push('Đã tái tạo Mục Lục.');
        } catch (eMuc) {
          lines.push('⚠ Mục Lục: ' + (eMuc && eMuc.message ? eMuc.message : eMuc));
        }
      }
    } catch (e) {
      const err = 'Lỗi chuẩn hoá data: ' + (e && e.message ? e.message : e);
      ui.alert('Làm mới', err, ui.ButtonSet.OK);
      return err;
    }
  }

  // --- FORMAT ---
  if (mode === 'format' || mode === 'both') {
    if (mode === 'format' && scope === 'all') {
      const ans = ui.alert(
        'Làm mới FORMAT — tất cả tháng',
        'Đồng bộ giao diện ' + monthKeys.length + ' Log + Report từ Template.\nKhông đổi giá trị/công thức.\nTiếp tục?',
        ui.ButtonSet.OK_CANCEL
      );
      if (ans !== ui.Button.YES && ans !== ui.Button.OK) return 'Đã huỷ.';
    }

    try {
      const fmtMsg = applyRefreshFormat_(monthKeys);
      lines.push(fmtMsg);
    } catch (e) {
      const err = 'Lỗi format: ' + (e && e.message ? e.message : e);
      lines.push(err);
      ui.alert('Làm mới', lines.join('\n\n'), ui.ButtonSet.OK);
      return err;
    }
  }

  const finalMsg = lines.join('\n\n') || 'Không có thay đổi.';
  try {
    ui.alert('Làm mới xong — ' + scopeLabel, finalMsg, ui.ButtonSet.OK);
  } catch (e2) {
    toast_(finalMsg, 'Làm mới');
  }
  return finalMsg;
}

/** Lấy danh sách monthKey theo scope */
function resolveRefreshMonthKeys_(scope) {
  const ss = getSpreadsheet_();
  if (scope === 'all') {
    const keys = ss.getSheets()
      .map(function (sh) { return getMonthKeyFromLogOrReportName_(sh.getName()); })
      .filter(Boolean);
    const uniq = [];
    keys.forEach(function (k) { if (uniq.indexOf(k) < 0) uniq.push(k); });
    if (!uniq.length) throw new Error('Không tìm thấy sheet Log_MM_YYYY / Report_MM_YYYY.');
    return uniq;
  }

  const active = SpreadsheetApp.getActiveSheet();
  const key = active ? getMonthKeyFromLogOrReportName_(active.getName()) : '';
  if (!key) {
    throw new Error('Hãy mở tab Log_MM_YYYY hoặc Report_MM_YYYY rồi chạy lại.\nSheet hiện tại: ' + (active ? active.getName() : '(không có)'));
  }
  return [key];
}

function getMonthKeyFromLogOrReportName_(name) {
  const m = String(name || '').match(/^(?:Log|Report)_(\d{2}_\d{4})$/);
  return m ? m[1] : '';
}

function applyRefreshFormat_(monthKeys) {
  const ok = [];
  const failed = [];
  (monthKeys || []).forEach(function (mk) {
    try {
      syncOneMonthLogTheme(mk);
      syncOneMonthReportTheme(mk);
      ok.push(mk);
    } catch (e) {
      failed.push(mk + ' (' + (e && e.message ? e.message : e) + ')');
    }
  });
  return 'Format: ' + ok.length + ' tháng OK'
    + (failed.length ? '; lỗi: ' + failed.join('; ') : '');
}

function formatNormalizePreview_(preview, scopeLabel) {
  const p = preview || {};
  let text = 'Xem trước — ' + scopeLabel + '\n'
    + '• Quét: ' + (p.totalScanned || 0) + ' dòng\n'
    + '• Thiếu mã → sẽ cấp MAN_: ' + (p.filled || 0) + '\n'
    + '• Lệch tháng → sẽ chuyển: ' + (p.movedCount || 0);
  if (p.samples && p.samples.length) {
    text += '\n\nMẫu chuyển:\n• ' + p.samples.slice(0, 8).join('\n• ');
    if (p.samples.length > 8) text += '\n• ...';
  }
  return text;
}

/**
 * Chuẩn hoá data Log tháng. Port thu hẹp từ Code.gs normalizeMonthData.
 * @param {string|null} onlyMonthKey MM_yyyy hoặc null = tất cả
 * @param {{dryRun?: boolean}} [options]
 */
function normalizeMonthDataScoped_(onlyMonthKey, options) {
  const opts = options || {};
  const dryRun = !!opts.dryRun;
  const ss = getSpreadsheet_();

  const moved = [];
  const errors = [];
  const affected = {};
  const samples = [];
  let totalScanned = 0;
  let filled = 0;
  let selfHealedCount = 0;

  const monthSheets = ss.getSheets().filter(function (sh) {
    const name = sh.getName();
    if (!/^Log_\d{2}_\d{4}$/.test(name)) return false;
    if (!onlyMonthKey) return true;
    return name === 'Log_' + onlyMonthKey;
  });

  if (!monthSheets.length) {
    throw new Error(onlyMonthKey
      ? ('Không tìm thấy Log_' + onlyMonthKey)
      : 'Không có sheet Log_MM_YYYY.');
  }

  const targetSheetCache = {};
  const targetKeysCache = {};

  function getTargetSheetContext(monthKey) {
    if (!targetSheetCache[monthKey]) {
      const ms = getOrCreateMonthSheets(monthKey);
      targetSheetCache[monthKey] = ms.logSheet;
      targetKeysCache[monthKey] = getMonthLogUniqueKeySet_(ms.logSheet);
    }
    return { sheet: targetSheetCache[monthKey], keySet: targetKeysCache[monthKey] };
  }

  for (let s = 0; s < monthSheets.length; s++) {
    const sheet = monthSheets[s];
    const nameKey = getMonthKeyFromLogOrReportName_(sheet.getName());
    if (!nameKey) continue;

    if (!dryRun) {
      fixMonthLogB1Cell_(sheet);
    }

    const fromKey = nameKey;
    const startRow = 3;
    const startCol = 1;
    const numCols = 9;
    const lastRow = sheet.getLastRow();
    if (lastRow < startRow) continue;

    const numRows = lastRow - startRow + 1;
    const fullRange = sheet.getRange(startRow, startCol, numRows, numCols);
    const data = fullRange.getValues();
    const bgs = fullRange.getBackgrounds();

    const sheetMoves = [];
    const keepRows = [];
    const keepBgs = [];
    let sheetDataChanged = false;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowBg = bgs[i];
      if (!isMonthLogDataRow_(row)) continue;
      totalScanned++;

      let key = row[MONTH_LOG_COL.UNIQUE_KEY] ? String(row[MONTH_LOG_COL.UNIQUE_KEY]).trim() : '';
      if (!key && hasOtherDataInMonthRow_(row)) {
        if (dryRun) {
          filled++;
          key = '(sẽ cấp MAN_)';
        } else {
          key = generateManualUniqueKey_();
          row[MONTH_LOG_COL.UNIQUE_KEY] = key;
          filled++;
          sheetDataChanged = true;
        }
      }

      const check = checkMonthMatchForKey_(fromKey, row[MONTH_LOG_COL.NGAY]);
      if (check.reason !== 'LECH_THANG') {
        if (!dryRun) {
          for (let c = 0; c < numCols; c++) {
            if (rowBg[c] === MONTH_MISMATCH_BG) {
              rowBg[c] = null;
              sheetDataChanged = true;
            }
          }
        }
        keepRows.push(row);
        keepBgs.push(rowBg);
        continue;
      }

      sheetMoves.push({
        sourceName: sheet.getName(),
        rowValues: row.slice(),
        rowBg: rowBg.slice(),
        uniqueKey: key && key.indexOf('(sẽ') === 0 ? '' : key,
        ngay: row[MONTH_LOG_COL.NGAY],
        fromKey: fromKey,
        toKey: check.txMonthKey
      });

      if (dryRun) {
        samples.push(sheet.getName() + ' → Log_' + check.txMonthKey
          + (key ? ' [' + key + ']' : ''));
      }
    }

    if (dryRun) {
      moved.push.apply(moved, sheetMoves);
      continue;
    }

    if (sheetMoves.length === 0) {
      if (sheetDataChanged) {
        fullRange.setValues(data);
        fullRange.setBackgrounds(bgs);
      }
      continue;
    }

    for (let b = 0; b < sheetMoves.length; b += REFRESH_BATCH_SIZE) {
      const batch = sheetMoves.slice(b, b + REFRESH_BATCH_SIZE);
      const appendByTargetSheet = {};
      const logEntries = [];

      for (let m = 0; m < batch.length; m++) {
        const item = batch[m];
        try {
          if (!item.toKey) {
            errors.push('Không đọc được tháng đích @' + item.sourceName);
            keepRows.push(item.rowValues);
            keepBgs.push(item.rowBg);
            continue;
          }
          if (!item.uniqueKey) {
            errors.push('Thiếu UNIQUE_KEY @' + item.sourceName);
            keepRows.push(item.rowValues);
            keepBgs.push(item.rowBg);
            continue;
          }

          const targetCtx = getTargetSheetContext(item.toKey);
          const targetSheet = targetCtx.sheet;
          const targetKeySet = targetCtx.keySet;

          if (targetKeySet[item.uniqueKey]) {
            logMoveTransactionsBatch_([{
              uniqueKey: item.uniqueKey,
              ngay: item.ngay,
              sourceName: item.sourceName,
              targetName: targetSheet.getName(),
              status: 'HEALED',
              note: 'Đã tồn tại ở đích — dọn dòng dư ở nguồn'
            }]);
            selfHealedCount++;
            affected[item.fromKey] = true;
            affected[item.toKey] = true;
            continue;
          }

          const targetName = targetSheet.getName();
          if (!appendByTargetSheet[targetName]) {
            appendByTargetSheet[targetName] = { sheet: targetSheet, rows: [] };
          }
          appendByTargetSheet[targetName].rows.push(item.rowValues.slice());
          targetKeySet[item.uniqueKey] = true;
          logEntries.push({
            uniqueKey: item.uniqueKey,
            ngay: item.ngay,
            sourceName: item.sourceName,
            targetName: targetName,
            status: 'OK',
            note: ''
          });
          moved.push(item);
          affected[item.fromKey] = true;
          affected[item.toKey] = true;
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          errors.push('Lỗi di chuyển ' + (item.uniqueKey || '?') + ': ' + msg);
          keepRows.push(item.rowValues);
          keepBgs.push(item.rowBg);
        }
      }

          Object.keys(appendByTargetSheet).forEach(function (tName) {
        const targetObj = appendByTargetSheet[tName];
        if (targetObj.rows && targetObj.rows.length > 0) {
          let lastBefore = targetObj.sheet.getLastRow();
          if (lastBefore < 3) lastBefore = 2;
          appendRowsToMonthLog(targetObj.sheet, targetObj.rows);
          targetObj.sheet
            .getRange(lastBefore + 1, 1, targetObj.rows.length, 9)
            .setBackground(null);
        }
      });

      if (logEntries.length > 0) logMoveTransactionsBatch_(logEntries);
    }

    const originalCount = numRows;
    const newCount = keepRows.length;
    const deletedCount = originalCount - newCount;

    if (newCount > 0) {
      const updateRange = sheet.getRange(startRow, startCol, newCount, numCols);
      updateRange.setValues(keepRows);
      updateRange.setBackgrounds(keepBgs);
    }

    if (deletedCount > 0) {
      const deleteStartRow = startRow + newCount;
      if (deleteStartRow <= sheet.getLastRow()) {
        const rowsToDelete = Math.min(deletedCount, sheet.getLastRow() - deleteStartRow + 1);
        if (rowsToDelete > 0) sheet.deleteRows(deleteStartRow, rowsToDelete);
      }
    }

    affected[fromKey] = true;
  }

  if (!dryRun) {
    Object.keys(affected).forEach(function (mk) {
      try {
        const ms = getOrCreateMonthSheets(mk);
        ensureMonthInMucLuc_(mk, ms.logSheet, ms.rptSheet);
      } catch (e) {
        errors.push('Mục Lục ' + mk + ': ' + (e && e.message ? e.message : e));
      }
    });
    SpreadsheetApp.flush();
  }

  let summary = (dryRun ? '[Xem trước] ' : '')
    + 'Đã quét ' + totalScanned + ' dòng.\n'
    + 'Sinh/ sẽ sinh mã MAN_: ' + filled + '.\n'
    + 'Di chuyển/ sẽ chuyển lệch tháng: ' + moved.length + '.\n';
  if (selfHealedCount > 0) summary += 'Tự chữa lành: ' + selfHealedCount + '.\n';
  summary += 'Lịch sử: sheet ' + SHEET_NAMES.LOG_CHUYEN + '.\n';
  if (errors.length) {
    summary += 'Cảnh báo (' + errors.length + '): ' + errors.slice(0, 5).join(' | ');
    if (errors.length > 5) summary += ' ...';
  } else if (!dryRun) {
    summary += 'Hoàn tất data.';
  }

  return {
    summary: summary,
    affected: affected,
    errors: errors,
    filled: filled,
    movedCount: moved.length,
    totalScanned: totalScanned,
    selfHealedCount: selfHealedCount,
    samples: samples
  };
}

function getTransactionMonthKey_(ngayVal) {
  const d = parseLogDate_(ngayVal);
  if (!d) return '';
  return Utilities.formatDate(d, 'GMT+7', 'MM_yyyy');
}

/** So khớp ngày GD với tháng sheet (nameKey MM_yyyy) */
function checkMonthMatchForKey_(sheetMonthKey, ngayVal) {
  const txMonthKey = getTransactionMonthKey_(ngayVal);
  if (!sheetMonthKey) {
    return { sheetMonthKey: '', txMonthKey: txMonthKey, match: true, reason: 'THIEU_B1' };
  }
  if (!txMonthKey) {
    return { sheetMonthKey: sheetMonthKey, txMonthKey: '', match: true, reason: 'THIEU_NGAY' };
  }
  const match = sheetMonthKey === txMonthKey;
  return {
    sheetMonthKey: sheetMonthKey,
    txMonthKey: txMonthKey,
    match: match,
    reason: match ? 'OK' : 'LECH_THANG'
  };
}

function generateManualUniqueKey_() {
  const now = new Date();
  const datePart = Utilities.formatDate(now, 'GMT+7', 'yyyyMMdd');
  const timePart = Utilities.formatDate(now, 'GMT+7', 'HHmmss');
  const randA = Math.random().toString(36).slice(2, 10).toUpperCase();
  const randB = Math.random().toString(36).slice(2, 6).toUpperCase();
  return MANUAL_KEY_PREFIX + datePart + '_' + timePart + '_' + randA + randB;
}

function hasOtherDataInMonthRow_(row) {
  if (!row || !row.length) return false;
  const keyCol = MONTH_LOG_COL.UNIQUE_KEY;
  for (let c = 0; c < row.length; c++) {
    if (c === keyCol) continue;
    const v = row[c];
    if (v !== '' && v !== null && v !== undefined && String(v).trim() !== '') return true;
  }
  return false;
}

function isMonthLogDataRow_(row) {
  if (!row || !row.length) return false;
  for (let c = 0; c < row.length; c++) {
    const v = row[c];
    if (v !== '' && v !== null && v !== undefined && String(v).trim() !== '') return true;
  }
  return false;
}

function getMonthLogUniqueKeySet_(sheet) {
  const set = {};
  if (!sheet) return set;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return set;
  const col = MONTH_LOG_COL.UNIQUE_KEY + 1;
  const numRows = lastRow - 2;
  const keys = sheet.getRange(3, col, numRows, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i][0];
    if (k != null && String(k).trim() !== '') set[String(k).trim()] = true;
  }
  return set;
}

function ensureLogChuyenSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAMES.LOG_CHUYEN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.LOG_CHUYEN);
    sheet.appendRow(LOG_CHUYEN_HEADERS);
    sheet.getRange(1, 1, 1, LOG_CHUYEN_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() < 1) {
    sheet.appendRow(LOG_CHUYEN_HEADERS);
    sheet.getRange(1, 1, 1, LOG_CHUYEN_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function logMoveTransactionsBatch_(entries) {
  if (!entries || !entries.length) return;
  const sheet = ensureLogChuyenSheet_();
  const now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
  const rows = entries.map(function (e) {
    let ngayStr = e.ngay;
    if (e.ngay instanceof Date) {
      ngayStr = Utilities.formatDate(e.ngay, 'GMT+7', 'dd/MM/yyyy');
    }
    return [
      now,
      e.uniqueKey || '',
      ngayStr == null ? '' : ngayStr,
      e.sourceName || '',
      e.targetName || '',
      e.status || 'OK',
      e.note || ''
    ];
  });
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, LOG_CHUYEN_HEADERS.length).setValues(rows);
}
