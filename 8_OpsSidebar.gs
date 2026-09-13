// ============================================================================
// 📧 8_OPSSIDEBAR.GS — Sidebar cấu hình + chạy Quét Mail / Invoice CSV
// ============================================================================
// Điều khiển bằng SIDEBAR (opsui.html) — cùng kiểu viewui.html.
// Token / khoảng ngày / lịch trigger lưu Script Properties.
// Menu: Bảng điều khiển = mail/meta; Set Trigger = lịch (1 chỗ duy nhất).
// Meta Billing API ẩn khi META_BILLING_ENABLED = false (code giữ nguyên).
// Menu cũ (alert) vẫn dùng được khi không mở sidebar.
// ============================================================================

function showOpsSidebar() {
  return showOpsSidebar_('ops');
}

/** Menu riêng: chỉ set lịch trigger (Mail / Báo cáo / Meta). */
function showOpsTriggerSidebar() {
  return showOpsSidebar_('trigger');
}

function showOpsSidebar_(mode) {
  const isTrigger = mode === 'trigger';
  const tpl = HtmlService.createTemplateFromFile('opsui');
  tpl.opsMode = isTrigger ? 'trigger' : 'ops';
  const html = tpl.evaluate()
    .setTitle(isTrigger
      ? 'Set Trigger'
      : (META_BILLING_ENABLED ? 'Mail & Meta' : 'Quét Mail'));
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Sidebar gọi khi mở: cấu hình mail + Meta + lịch hiện tại */
function opsSidebarState() {
  if (!META_BILLING_ENABLED) enforceMetaBillingOff_();
  const props = PROP.getProperties();
  const filter = buildGmailDateFilter_();
  const mailMode = props.MAIL_SCAN_TRIGGER_MODE === 'day' ? 'day' : 'hours';
  const mailInterval = opsClampHours_(props.MAIL_SCAN_TRIGGER_INTERVAL_HOURS, MAIL_SCAN_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const mailHour = opsClampHour_(props.MAIL_SCAN_TRIGGER_HOUR, MAIL_SCAN_TRIGGER_HOUR_DEFAULT);
  const mailMin = opsClampMinute_(props.MAIL_SCAN_TRIGGER_MINUTE, MAIL_SCAN_TRIGGER_MINUTE_DEFAULT);
  const reportInterval = opsClampHours_(props.REPORT_TRIGGER_INTERVAL_HOURS, REPORT_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const metaHour = opsClampHour_(props.META_BILLING_TRIGGER_HOUR, META_BILLING_TRIGGER_HOUR_DEFAULT);
  const metaMin = opsClampMinute_(props.META_BILLING_TRIGGER_MINUTE, META_BILLING_TRIGGER_MINUTE_DEFAULT);
  const mailOn = props.MAIL_SCAN_TRIGGER_ON === '1' || opsHasTrigger_(MAIL_SCAN_TRIGGER_HANDLER_);
  // Báo cáo tự nấu = CÓ trigger 15' đang chạy (chỉ tắt khi CÓ cờ REPORT_AUTO_TRIGGER_OFF).
  const reportOn = props.REPORT_AUTO_TRIGGER_OFF_PROP !== '1'
    && (props.REPORT_DIRTY_TRIGGER_OK === '1' || opsHasTrigger_(REPORT_REFRESH_TRIGGER_HANDLER_));
  const rebuildAfter = props.MAIL_SCAN_REBUILD_AFTER === '1';
  const metaOn = props.META_BILLING_TRIGGER_ON === '1' || opsHasTrigger_(META_BILLING_TRIGGER_HANDLER_);
  const accounts = mailAccountsForUi_();
  return {
    so_ngay_quet: props.so_ngay_quet || String(SO_NGAY_QUET_DEFAULT),
    quet_tu_ngay: props.quet_tu_ngay || '',
    quet_den_ngay: props.quet_den_ngay || '',
    mail_label: filter.label,
    accounts: accounts,
    meta_access_token: maskApiKey(props.META_ACCESS_TOKEN || ''),
    meta_business_id: props.META_BUSINESS_ID || '',
    meta_billing_lookback_days: props.META_BILLING_LOOKBACK_DAYS || String(META_BILLING_LOOKBACK_DAYS_DEFAULT),
    mail_trigger_on: mailOn,
    mail_trigger_mode: mailMode,
    mail_trigger_interval_hours: mailInterval,
    mail_trigger_hour: mailHour,
    mail_trigger_minute: mailMin,
    mail_rebuild_after: rebuildAfter,
    report_trigger_on: reportOn,
    report_trigger_interval_hours: reportInterval,
    meta_billing_enabled: META_BILLING_ENABLED === true,
    meta_trigger_on: META_BILLING_ENABLED && metaOn,
    meta_trigger_hour: metaHour,
    meta_trigger_minute: metaMin,
    trigger_tz: Session.getScriptTimeZone() || 'GMT+7',
    trigger_label: opsTriggerLabel_(mailOn, mailMode, mailInterval, mailHour, mailMin, reportOn, reportInterval, META_BILLING_ENABLED && metaOn, metaHour, metaMin)
      + (META_BILLING_ENABLED && props.META_BILLING_TRIGGER_OK === '1' && props.META_BILLING_TRIGGER_ON !== '1' && opsHasTrigger_(META_BILLING_TRIGGER_HANDLER_)
        ? ' (Meta đang mỗi 6 giờ cũ — bấm Lưu lịch để chuyển sang giờ cố định)'
        : '')
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

function opsSidebarSaveMeta(form) {
  if (!META_BILLING_ENABLED) return { ok: false, message: metaBillingOffMsg_() };
  opsSaveMetaProps_(form || {});
  return { ok: true, message: 'Đã lưu cấu hình Meta Billing.' };
}

function opsSidebarCheckMeta(form) {
  if (!META_BILLING_ENABLED) return { ok: false, message: metaBillingOffMsg_() };
  opsSaveMetaProps_(form || {});
  const text = checkMetaBillingFromUI(getConfigToken(), form || {});
  const ok = String(text || '').indexOf('OK:') === 0;
  return { ok: ok, message: opsSidebarPlain_(text) };
}

function opsSidebarSyncMeta(form, full) {
  if (!META_BILLING_ENABLED) return { ok: false, message: metaBillingOffMsg_() };
  opsSaveMetaProps_(form || {});
  try {
    if (full) resetMetaBillingWatermarks();
    const raw = syncMetaBilling(null, full ? { full: true } : {});
    return { ok: opsSidebarOk_(raw), message: opsSidebarPlain_(raw) };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarWriteMetaLog() {
  if (!META_BILLING_ENABLED) return { ok: false, message: metaBillingOffMsg_() };
  try {
    ensureAdsBillingSyncSheet_();
    matchBillingAgainstMail_();
    const res = writeMissingMetaBillingToLog_();
    if (res.error) return { ok: false, message: 'ERR: ' + res.error };
    return {
      ok: true,
      message: 'Đã ghi ' + res.written + ' dòng vào Log tháng (bỏ qua ' + res.skipped + ').'
    };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

function opsSidebarIngestMetaCsv(csvText, fileName) {
  try {
    const msg = ingestMetaInvoiceCsv_(csvText, fileName);
    return { ok: true, message: msg };
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

function opsSaveMetaProps_(form) {
  if (form.meta_business_id !== undefined) {
    const bid = String(form.meta_business_id || '').trim();
    if (bid) PROP.setProperty('META_BUSINESS_ID', bid);
    else PROP.deleteProperty('META_BUSINESS_ID');
  }
  if (form.meta_billing_lookback_days !== undefined && String(form.meta_billing_lookback_days).trim() !== '') {
    const lb = Math.max(1, parseInt(form.meta_billing_lookback_days, 10) || META_BILLING_LOOKBACK_DAYS_DEFAULT);
    PROP.setProperty('META_BILLING_LOOKBACK_DAYS', String(lb));
  }
  if (form.meta_access_token !== undefined) {
    const metaTok = String(form.meta_access_token || '').trim();
    if (!metaTok) {
      // ô trống khi đang mask = giữ token cũ; ô trống thật (user xóa) thì không đụng
    } else if (metaTok.indexOf('••••') === -1) {
      PROP.setProperty('META_ACCESS_TOKEN', metaTok);
    }
  }
}

function opsApplySchedule_(form) {
  const mailOn = opsIsOn_(form.mail_trigger_on);
  const reportOn = opsIsOn_(form.report_trigger_on);
  const metaOn = META_BILLING_ENABLED && opsIsOn_(form.meta_trigger_on);
  // Mail: chế độ Mỗi N giờ hoặc mỗi ngày giờ:phút.
  const mailMode = form.mail_trigger_mode === 'day' ? 'day' : 'hours';
  const mailInterval = opsClampHours_(form.mail_trigger_interval_hours, MAIL_SCAN_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const mailHour = opsClampHour_(form.mail_trigger_hour, MAIL_SCAN_TRIGGER_HOUR_DEFAULT);
  const mailMin = opsClampMinute_(form.mail_trigger_minute, MAIL_SCAN_TRIGGER_MINUTE_DEFAULT);
  const rebuildAfter = opsIsOn_(form.mail_rebuild_after);
  const reportInterval = opsClampHours_(form.report_trigger_interval_hours, REPORT_TRIGGER_INTERVAL_HOURS_DEFAULT);
  const metaHour = opsClampHour_(form.meta_trigger_hour, META_BILLING_TRIGGER_HOUR_DEFAULT);
  const metaMin = opsClampMinute_(form.meta_trigger_minute, META_BILLING_TRIGGER_MINUTE_DEFAULT);

  // --- Quét Mail ---
  PROP.setProperty('MAIL_SCAN_TRIGGER_ON', mailOn ? '1' : '0');
  PROP.setProperty('MAIL_SCAN_TRIGGER_MODE', mailMode);
  PROP.setProperty('MAIL_SCAN_TRIGGER_INTERVAL_HOURS', String(mailInterval));
  PROP.setProperty('MAIL_SCAN_TRIGGER_HOUR', String(mailHour));
  PROP.setProperty('MAIL_SCAN_TRIGGER_MINUTE', String(mailMin));
  PROP.setProperty(MAIL_SCAN_REBUILD_AFTER_PROP_, rebuildAfter ? '1' : '0');
  if (mailOn) {
    if (mailMode === 'hours') opsUpsertHoursTrigger_(MAIL_SCAN_TRIGGER_HANDLER_, mailInterval);
    else opsUpsertDailyTrigger_(MAIL_SCAN_TRIGGER_HANDLER_, mailHour, mailMin);
  } else {
    opsDeleteTriggersByHandler_(MAIL_SCAN_TRIGGER_HANDLER_);
  }

  // --- Báo cáo tự nấu ---
  PROP.setProperty('REPORT_TRIGGER_ON', reportOn ? '1' : '0');
  PROP.setProperty('REPORT_TRIGGER_INTERVAL_HOURS', String(reportInterval));
  if (reportOn) {
    PROP.deleteProperty(REPORT_AUTO_TRIGGER_OFF_PROP_);
    PROP.deleteProperty('REPORT_DIRTY_TRIGGER_OK');
    opsUpsertHoursTrigger_(REPORT_REFRESH_TRIGGER_HANDLER_, reportInterval);
  } else {
    // Tắt: xóa trigger báo cáo + khóa tái tạo ngầm 15'.
    disableReportAutoTrigger_();
  }

  // --- Meta (giữ nguyên mỗi ngày) ---
  PROP.setProperty('META_BILLING_TRIGGER_ON', metaOn ? '1' : '0');
  PROP.setProperty('META_BILLING_TRIGGER_HOUR', String(metaHour));
  PROP.setProperty('META_BILLING_TRIGGER_MINUTE', String(metaMin));
  PROP.deleteProperty(META_BILLING_TRIGGER_OK_PROP_);
  if (metaOn) opsUpsertDailyTrigger_(META_BILLING_TRIGGER_HANDLER_, metaHour, metaMin);
  else opsDeleteTriggersByHandler_(META_BILLING_TRIGGER_HANDLER_);

  const label = opsTriggerLabel_(mailOn, mailMode, mailInterval, mailHour, mailMin, reportOn, reportInterval, metaOn, metaHour, metaMin);
  const tz = Session.getScriptTimeZone() || 'GMT+7';
  return { label: label, message: 'Đã lưu lịch — ' + label + ' (' + tz + ').' };
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

function opsTriggerLabel_(mailOn, mailMode, mailInterval, mailHour, mailMin, reportOn, reportInterval, metaOn, metaHour, metaMin) {
  const parts = [];
  parts.push(mailOn
    ? (mailMode === 'day'
      ? ('Mail ' + opsPad2_(mailHour) + ':' + opsPad2_(mailMin) + ' mỗi ngày')
      : ('Mail mỗi ' + mailInterval + 'h'))
    : 'Mail tắt');
  parts.push(reportOn
    ? ('Báo cáo mỗi ' + reportInterval + 'h')
    : 'Báo cáo tắt');
  if (META_BILLING_ENABLED) {
    parts.push(metaOn
      ? ('Meta ' + opsPad2_(metaHour) + ':' + opsPad2_(metaMin) + ' mỗi ngày')
      : 'Meta tắt');
  }
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
