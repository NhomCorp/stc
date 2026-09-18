// ============================================================================
// 📧 8_OPSSIDEBAR.GS — Sidebar cấu hình + chạy Quét Mail / CSV máy / Drive CSV
// ============================================================================
// Điều khiển bằng SIDEBAR (opsui.html) — cùng kiểu viewui.html.
// Khoảng ngày / lịch trigger / folder Drive lưu Script Properties.
// Menu: Bảng điều khiển = mail/csv/drive; Set Trigger = lịch (1 chỗ duy nhất).
// ============================================================================

function showOpsSidebar() {
  return showOpsSidebar_('ops');
}

/** Menu riêng: chỉ set lịch trigger (Mail / Báo cáo / Drive CSV). */
function showOpsTriggerSidebar() {
  return showOpsSidebar_('trigger');
}

function showOpsSidebar_(mode) {
  const isTrigger = mode === 'trigger';
  const tpl = HtmlService.createTemplateFromFile('opsui');
  tpl.opsMode = isTrigger ? 'trigger' : 'ops';
  const html = tpl.evaluate()
    .setTitle(isTrigger ? 'Set Trigger' : 'Quét Mail & CSV');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Sidebar gọi khi mở: cấu hình mail + Drive + lịch hiện tại */
function opsSidebarState() {
  // Dọn trigger Meta cũ nếu còn sót
  try {
    opsDeleteTriggersByHandler_('runScheduledMetaBillingSync');
    PROP.setProperty('META_BILLING_TRIGGER_ON', '0');
    PROP.deleteProperty('META_BILLING_TRIGGER_OK');
  } catch (eClean) {}

  const props = PROP.getProperties();
  const filter = buildGmailDateFilter_();
  const mailMode = props.MAIL_SCAN_TRIGGER_MODE === 'day' ? 'day' : 'hours';
  const mailInterval = opsClampHours_(props.MAIL_SCAN_TRIGGER_INTERVAL_HOURS, MAIL_SCAN_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const mailHour = opsClampHour_(props.MAIL_SCAN_TRIGGER_HOUR, MAIL_SCAN_TRIGGER_HOUR_DEFAULT);
  const mailMin = opsClampMinute_(props.MAIL_SCAN_TRIGGER_MINUTE, MAIL_SCAN_TRIGGER_MINUTE_DEFAULT);
  const reportInterval = opsClampHours_(props.REPORT_TRIGGER_INTERVAL_HOURS, REPORT_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const mailOn = props.MAIL_SCAN_TRIGGER_ON === '1' || opsHasTrigger_(MAIL_SCAN_TRIGGER_HANDLER_);
  const reportOff = props[REPORT_AUTO_TRIGGER_OFF_PROP_] === '1' || props.REPORT_AUTO_TRIGGER_OFF === '1';
  const reportOn = !reportOff
    && (props.REPORT_DIRTY_TRIGGER_OK === '1' || opsHasTrigger_(REPORT_REFRESH_TRIGGER_HANDLER_));
  const driveOn = props.DRIVE_CSV_TRIGGER_ON === '1' || opsHasTrigger_(DRIVE_CSV_TRIGGER_HANDLER_);
  const driveState = getDriveCsvFolderState_();
  const accounts = mailAccountsForUi_();
  let pendingSync = 0;
  try { pendingSync = countAdsBillingPending_(); } catch (eP) {}
  return {
    so_ngay_quet: props.so_ngay_quet || String(SO_NGAY_QUET_DEFAULT),
    quet_tu_ngay: props.quet_tu_ngay || '',
    quet_den_ngay: props.quet_den_ngay || '',
    mail_label: filter.label,
    accounts: accounts,
    drive_inbox_folder_id: driveState.inbox_folder_id,
    drive_archive_folder_id: driveState.archive_folder_id,
    drive_inbox_folder_name: driveState.inbox_folder_name,
    drive_archive_folder_name: driveState.archive_folder_name,
    drive_inbox_ok: driveState.inbox_ok,
    drive_archive_ok: driveState.archive_ok,
    drive_ready: driveState.ready,
    drive_pending_csv: driveState.pending_csv,
    ads_pending_sync: pendingSync,
    mail_trigger_on: mailOn,
    mail_trigger_mode: mailMode,
    mail_trigger_interval_hours: mailInterval,
    mail_trigger_hour: mailHour,
    mail_trigger_minute: mailMin,
    report_trigger_on: reportOn,
    report_trigger_interval_hours: reportInterval,
    drive_trigger_on: driveOn,
    drive_trigger_hour: DRIVE_CSV_TRIGGER_HOUR_DEFAULT,
    drive_trigger_minute: DRIVE_CSV_TRIGGER_MINUTE_DEFAULT,
    trigger_tz: Session.getScriptTimeZone() || 'GMT+7',
    trigger_label: opsTriggerLabel_(mailOn, mailMode, mailInterval, mailHour, mailMin, reportOn, reportInterval, driveOn)
  };
}

function opsSidebarSaveMail(form) {
  const r = opsSaveMailProps_(form || {});
  if (!r.ok) return r;
  const filter = buildGmailDateFilter_();
  return {
    ok: true,
    message: 'Đã lưu. Hotmail trong danh sách: ' + (r.hotmail_count || 0) + '.',
    mail_label: filter.label,
    accounts: mailAccountsForUi_(r.accounts)
  };
}

function opsSidebarScanMail(form, mailboxId) {
  const saved = opsSaveMailProps_(form || {});
  if (!saved.ok) return saved;
  try {
    const raw = scanMail(null, mailboxId || null);
    const msg = opsSidebarPlain_(raw);
    const ok = opsSidebarOk_(raw);
    const filter = buildGmailDateFilter_();
    return { ok: ok, message: msg, mail_label: filter.label, accounts: mailAccountsForUi_() };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarCheckHotmail(form, mailboxId) {
  try {
    const saved = opsSaveMailProps_(form || {});
    if (!saved.ok) {
      return { ok: false, message: 'Lỗi: ' + String(saved.message || 'Không lưu được trước khi Check.') };
    }
    const want = String(mailboxId || '').trim();
    const list = loadMailAccountList_();
    let box = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === want && list[i].type === 'hotmail') {
        box = list[i];
        break;
      }
    }
    if (!box && want) {
      for (let j = 0; j < list.length; j++) {
        if (list[j].type === 'hotmail' && String(list[j].label || '').toLowerCase() === want.toLowerCase()) {
          box = list[j];
          break;
        }
      }
    }
    if (!box) {
      const hotmails = list.filter(function (a) { return a.type === 'hotmail' && a.cred; });
      box = hotmails.length === 1 ? hotmails[0] : null;
    }
    if (!box || !box.cred) {
      return { ok: false, message: 'Lỗi: chưa chọn đúng Hotmail (lưu hộp trước, rồi bấm Check trên dòng đó).' };
    }
    const r = checkHotmailLive_(box.cred);
    const ok = !!(r && r.ok);
    const msg = String((r && r.message) || (ok ? 'OK' : 'Lỗi không rõ'));
    return {
      ok: ok,
      message: (ok ? 'OK — ' : 'Lỗi — ') + msg
    };
  } catch (e) {
    return { ok: false, message: 'Lỗi Check Hotmail: ' + ((e && e.message) ? e.message : String(e)) };
  }
}

function opsSidebarCheckHotmailCred(credLine) {
  try {
    const raw = String(credLine || '').trim();
    if (!raw) return { ok: false, message: 'Lỗi: chưa dán cred Hotmail.' };
    const r = checkHotmailLive_(raw);
    const ok = !!(r && r.ok);
    const msg = String((r && r.message) || (ok ? 'OK' : 'Lỗi không rõ'));
    return { ok: ok, message: (ok ? 'OK — ' : 'Lỗi — ') + msg };
  } catch (e) {
    return { ok: false, message: 'Lỗi Check Hotmail: ' + ((e && e.message) ? e.message : String(e)) };
  }
}

function opsSidebarStageMetaCsv(csvText, fileName) {
  try {
    const r = stageInvoiceCsvFile_(csvText, fileName);
    return { ok: true, message: r.message, staged: r.staged };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

/** Stage + flush (1 file). Multi-file: stage từng file rồi gọi flush. */
function opsSidebarIngestMetaCsv(csvText, fileName) {
  try {
    const msg = ingestMetaInvoiceCsv_(csvText, fileName);
    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarFlushAdsBilling() {
  try {
    const res = flushAdsBillingQueueToLog_();
    return {
      ok: true,
      message: (res && res.message) || 'Xong',
      ads_pending_sync: countAdsBillingPending_()
    };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarSaveDriveFolders(form) {
  try {
    const f = form || {};
    return saveDriveCsvFolders_(f.drive_inbox_folder_id, f.drive_archive_folder_id);
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

/** Chỉ bật/tắt lịch Drive 23:00 — không đụng Mail/Báo cáo/Meta. */
function opsSidebarSaveDriveTrigger(form) {
  try {
    const driveOn = opsIsOn_((form || {}).drive_trigger_on);
    const r = opsApplyDriveTriggerOnly_(driveOn);
    return {
      ok: true,
      message: r.message,
      trigger_label: r.label,
      drive_trigger_on: driveOn
    };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarImportDriveCsv() {
  try {
    const res = importDriveInvoiceCsvFolder_();
    const drive = getDriveCsvFolderState_();
    return {
      ok: !!(res && res.ok),
      message: (res && res.message) || 'Xong',
      drive: drive
    };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarSaveSchedule(form) {
  try {
    const r = opsApplySchedule_(form || {});
    return { ok: true, message: r.message, trigger_label: r.label };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function opsAsArray_(v) {
  if (!v) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') return v;
  if (typeof v === 'object') {
    const out = [];
    const keys = Object.keys(v);
    for (let i = 0; i < keys.length; i++) {
      if (/^\d+$/.test(keys[i])) out[Number(keys[i])] = v[keys[i]];
    }
    return out.filter(function (x) { return x != null; });
  }
  return [];
}

function opsSaveMailProps_(form) {
  const tu = String(form.quet_tu_ngay || '').trim();
  const den = String(form.quet_den_ngay || '').trim();
  if ((tu && !den) || (!tu && den)) {
    return { ok: false, message: 'Khoảng ngày: điền đủ cả Từ và Đến, hoặc để trống cả hai.' };
  }
  const soNgay = Math.max(1, parseInt(form.so_ngay_quet, 10) || SO_NGAY_QUET_DEFAULT);
  PROP.setProperty('so_ngay_quet', String(soNgay));
  PROP.setProperty('quet_tu_ngay', tu);
  PROP.setProperty('quet_den_ngay', den);

  const current = loadMailAccountList_();
  var incoming = null;
  if (form.accounts_json !== undefined && form.accounts_json !== null && String(form.accounts_json) !== '') {
    try {
      incoming = opsAsArray_(JSON.parse(String(form.accounts_json)));
    } catch (eParse) {
      return { ok: false, message: 'Không đọc được danh sách tài khoản — thử Lưu lại.' };
    }
  } else if (form.accounts !== undefined && form.accounts !== null) {
    incoming = opsAsArray_(form.accounts);
  }
  if (incoming === null) {
    return { ok: true, accounts: current };
  }
  const byId = {};
  for (let c = 0; c < current.length; c++) byId[current[c].id] = current[c];
  const merged = [];
  for (let i = 0; i < incoming.length; i++) {
    const row = incoming[i] || {};
    const type = String(row.type || '').trim();
    const id = String(row.id || '').trim();
    if (type === 'gmail' || id === MAILBOX_ID_GMAIL) {
      merged.push({
        id: MAILBOX_ID_GMAIL,
        type: 'gmail',
        label: String(row.label || '').trim() || 'Gmail chính',
        email: String(row.email || '').trim(),
        enabled: opsIsOn_(row.enabled),
        priority: 1
      });
      continue;
    }
    if (type !== 'hotmail') continue;
    const credRaw = String(row.cred || '').replace(/\r/g, '').trim();
    let cred = '';
    const old = byId[id];
    if (credRaw && !isMaskedHotmailCred_(credRaw)) {
      const parsed = parseHotmailCredLine_(credRaw);
      if (!parsed) {
        return { ok: false, message: 'Hotmail cred sai format (dòng ' + (row.label || (i + 1)) + '). Dùng: email|password|refresh_token|client_id (hoặc email|refresh_token|client_id).' };
      }
      cred = rebuildHotmailCredLine_(parsed);
    } else if (old && old.cred) {
      cred = old.cred;
    }
    if (!cred) {
      if (!id || id.indexOf('new-') === 0) continue;
      return { ok: false, message: 'Dòng Hotmail thiếu cred. Dán email|password|refresh_token|client_id rồi Lưu.' };
    }
    const parsedOk = parseHotmailCredLine_(cred);
    merged.push({
      id: id || ('hm-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10)),
      type: 'hotmail',
      label: String(row.label || '').trim() || (parsedOk ? parsedOk.email : 'Hotmail'),
      email: parsedOk ? parsedOk.email : '',
      enabled: row.enabled === undefined ? true : opsIsOn_(row.enabled),
      priority: 10 + merged.length,
      cred: cred
    });
  }
  const savedList = saveMailAccountList_(merged);
  const nHm = savedList.filter(function (a) { return a.type === 'hotmail'; }).length;
  return {
    ok: true,
    accounts: savedList,
    hotmail_count: nHm
  };
}

function opsApplySchedule_(form) {
  const mailOn = opsIsOn_(form.mail_trigger_on);
  const reportOn = opsIsOn_(form.report_trigger_on);
  const driveOn = opsIsOn_(form.drive_trigger_on);
  const mailMode = form.mail_trigger_mode === 'day' ? 'day' : 'hours';
  const mailInterval = opsClampHours_(form.mail_trigger_interval_hours, MAIL_SCAN_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const mailHour = opsClampHour_(form.mail_trigger_hour, MAIL_SCAN_TRIGGER_HOUR_DEFAULT);
  const mailMin = opsClampMinute_(form.mail_trigger_minute, MAIL_SCAN_TRIGGER_MINUTE_DEFAULT);
  const reportInterval = opsClampHours_(form.report_trigger_interval_hours, REPORT_TRIGGER_INTERVAL_HOURS_DEFAULT);

  PROP.setProperty('MAIL_SCAN_TRIGGER_ON', mailOn ? '1' : '0');
  PROP.setProperty('MAIL_SCAN_TRIGGER_MODE', mailMode);
  PROP.setProperty('MAIL_SCAN_TRIGGER_INTERVAL_HOURS', String(mailInterval));
  PROP.setProperty('MAIL_SCAN_TRIGGER_HOUR', String(mailHour));
  PROP.setProperty('MAIL_SCAN_TRIGGER_MINUTE', String(mailMin));
  // Không còn nấu báo cáo sau quét — chỉ dirty; nấu = trigger báo cáo / menu / /report
  PROP.setProperty(MAIL_SCAN_REBUILD_AFTER_PROP_, '0');
  if (mailOn) {
    if (mailMode === 'hours') opsUpsertHoursTrigger_(MAIL_SCAN_TRIGGER_HANDLER_, mailInterval);
    else opsUpsertDailyTrigger_(MAIL_SCAN_TRIGGER_HANDLER_, mailHour, mailMin);
  } else {
    opsDeleteTriggersByHandler_(MAIL_SCAN_TRIGGER_HANDLER_);
  }

  PROP.setProperty('REPORT_TRIGGER_ON', reportOn ? '1' : '0');
  PROP.setProperty('REPORT_TRIGGER_INTERVAL_HOURS', String(reportInterval));
  if (reportOn) {
    PROP.deleteProperty(REPORT_AUTO_TRIGGER_OFF_PROP_);
    PROP.deleteProperty('REPORT_DIRTY_TRIGGER_OK');
    opsUpsertHoursTrigger_(REPORT_REFRESH_TRIGGER_HANDLER_, reportInterval);
  } else {
    disableReportAutoTrigger_();
  }

  // Xóa trigger Meta cũ nếu còn
  try {
    opsDeleteTriggersByHandler_('runScheduledMetaBillingSync');
    PROP.setProperty('META_BILLING_TRIGGER_ON', '0');
  } catch (eMeta) {}

  opsApplyDriveTriggerOnly_(driveOn);

  const label = opsTriggerLabel_(mailOn, mailMode, mailInterval, mailHour, mailMin, reportOn, reportInterval, driveOn);
  const tz = Session.getScriptTimeZone() || 'GMT+7';
  return { label: label, message: 'Đã lưu lịch — ' + label + ' (' + tz + ').' };
}

/**
 * Bật/tắt trigger Drive CSV cố định 23:00. Không đụng trigger khác.
 */
function opsApplyDriveTriggerOnly_(driveOn) {
  const on = !!driveOn;
  PROP.setProperty(DRIVE_CSV_TRIGGER_ON_PROP_, on ? '1' : '0');
  if (on) {
    const st = getDriveCsvFolderState_();
    if (!st.ready) {
      throw new Error('Bật lịch Drive CSV cần cấu hình đủ folder đọc + folder lưu (tab Drive CSV).');
    }
    opsUpsertDailyTrigger_(DRIVE_CSV_TRIGGER_HANDLER_, DRIVE_CSV_TRIGGER_HOUR_DEFAULT, DRIVE_CSV_TRIGGER_MINUTE_DEFAULT);
  } else {
    opsDeleteTriggersByHandler_(DRIVE_CSV_TRIGGER_HANDLER_);
  }
  const props = PROP.getProperties();
  const mailMode = props.MAIL_SCAN_TRIGGER_MODE === 'day' ? 'day' : 'hours';
  const mailOn = props.MAIL_SCAN_TRIGGER_ON === '1' || opsHasTrigger_(MAIL_SCAN_TRIGGER_HANDLER_);
  const reportOff = props[REPORT_AUTO_TRIGGER_OFF_PROP_] === '1' || props.REPORT_AUTO_TRIGGER_OFF === '1';
  const reportOn = !reportOff
    && (props.REPORT_DIRTY_TRIGGER_OK === '1' || opsHasTrigger_(REPORT_REFRESH_TRIGGER_HANDLER_));
  const label = opsTriggerLabel_(
    mailOn,
    mailMode,
    opsClampHours_(props.MAIL_SCAN_TRIGGER_INTERVAL_HOURS, MAIL_SCAN_TRIGGER_INTERVAL_HOURS_DEFAULT),
    opsClampHour_(props.MAIL_SCAN_TRIGGER_HOUR, MAIL_SCAN_TRIGGER_HOUR_DEFAULT),
    opsClampMinute_(props.MAIL_SCAN_TRIGGER_MINUTE, MAIL_SCAN_TRIGGER_MINUTE_DEFAULT),
    reportOn,
    opsClampHours_(props.REPORT_TRIGGER_INTERVAL_HOURS, REPORT_TRIGGER_INTERVAL_HOURS_DEFAULT),
    on
  );
  const tz = Session.getScriptTimeZone() || 'GMT+7';
  return {
    label: label,
    message: on
      ? ('Đã bật Drive CSV 23:00 mỗi ngày (' + tz + ').')
      : ('Đã tắt lịch Drive CSV (' + tz + ').')
  };
}

function opsIsOn_(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function opsClampHour_(raw, fallback) {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.max(0, Math.min(23, n));
}

function opsClampMinute_(raw, fallback) {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  const allowed = [0, 15, 30, 45];
  let best = allowed[0];
  let dist = 99;
  for (let i = 0; i < allowed.length; i++) {
    const d = Math.abs(allowed[i] - n);
    if (d < dist) { best = allowed[i]; dist = d; }
  }
  return best;
}

/** Chuẩn hoá số giờ về giá trị hợp lệ của ScriptApp.everyHours(). */
function opsClampHours_(raw, fallback) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return fallback || TRIGGER_HOURS_ALLOWED[0];
  let best = TRIGGER_HOURS_ALLOWED[0];
  let dist = 1e9;
  for (let i = 0; i < TRIGGER_HOURS_ALLOWED.length; i++) {
    const d = Math.abs(TRIGGER_HOURS_ALLOWED[i] - n);
    if (d < dist) { best = TRIGGER_HOURS_ALLOWED[i]; dist = d; }
  }
  return best;
}

function opsPad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function opsTriggerLabel_(mailOn, mailMode, mailInterval, mailHour, mailMin, reportOn, reportInterval, driveOn) {
  const parts = [];
  parts.push(mailOn
    ? (mailMode === 'day'
      ? ('Mail ' + opsPad2_(mailHour) + ':' + opsPad2_(mailMin) + ' mỗi ngày')
      : ('Mail mỗi ' + mailInterval + 'h'))
    : 'Mail tắt');
  parts.push(reportOn
    ? ('Báo cáo mỗi ' + reportInterval + 'h')
    : 'Báo cáo tắt');
  parts.push(driveOn
    ? ('Drive ' + opsPad2_(DRIVE_CSV_TRIGGER_HOUR_DEFAULT) + ':' + opsPad2_(DRIVE_CSV_TRIGGER_MINUTE_DEFAULT) + ' mỗi ngày')
    : 'Drive tắt');
  return parts.join(' · ');
}

function opsHasTrigger_(handler) {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) return true;
  }
  return false;
}

function opsDeleteTriggersByHandler_(handler) {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function opsUpsertDailyTrigger_(handler, hour, minute) {
  opsDeleteTriggersByHandler_(handler);
  ScriptApp.newTrigger(handler)
    .timeBased()
    .atHour(hour)
    .nearMinute(minute)
    .everyDays(1)
    .create();
}

function opsUpsertHoursTrigger_(handler, hours) {
  const validHours = opsClampHours_(hours, TRIGGER_HOURS_ALLOWED[1]);
  opsDeleteTriggersByHandler_(handler);
  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyHours(validHours)
    .create();
}

function opsSidebarPlain_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function opsSidebarOk_(msg) {
  const s = String(msg || '');
  if (/^ERR/i.test(s) || s.indexOf('❌') === 0 || s.indexOf('⚠️') === 0) return false;
  return true;
}
