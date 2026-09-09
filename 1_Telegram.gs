// ============================================================================
// 🤖 1_TELEGRAM.GS — TELEGRAM WEBHOOK & XỬ LÝ GIAO DIỆN BOT
// ============================================================================

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return;

  // Bắt buộc webhook_secret — không cấu hình thì từ chối toàn bộ
  const secret = PROP.getProperty('webhook_secret');
  if (!secret) return;
  if (!e.parameter || e.parameter.secret !== secret) return;

  let contents;
  try {
    contents = JSON.parse(e.postData.contents);
  } catch (err) {
    return;
  }
  if (!contents || typeof contents !== 'object') return;

  // Chống trùng lặp Webhook: khóa ngắn lúc nhận, kéo TTL sau khi xử lý xong
  const updateId = contents.update_id;
  const lockKey = updateId ? "LOCK_" + updateId : null;
  if (lockKey) {
    if (CacheService.getScriptCache().get(lockKey)) return;
    CacheService.getScriptCache().put(lockKey, "BUSY", 30);
  }

  try {
    handleTelegramUpdate_(contents);
  } finally {
    if (lockKey) {
      CacheService.getScriptCache().put(lockKey, "DONE", 300);
    }
  }
}

function handleTelegramUpdate_(contents) {
  // 1. Xử lý Callback nút bấm Inline Keyboard
  if (contents.callback_query) {
    handleCallbackQuery(contents.callback_query);
    return;
  }

  if (!contents.message) return;
  const chatId = contents.message.chat.id.toString();
  const adminId = PROP.getProperty('admin_id');
  // Bắt buộc admin_id — không cấu hình hoặc sai chat → bỏ qua
  if (!adminId || chatId !== adminId) return;

  let text = contents.message.text || contents.message.caption || "";
  const voiceFileId = (contents.message.voice && contents.message.voice.file_id)
    || (contents.message.audio && contents.message.audio.file_id)
    || null;

  // 2. Xử lý Voice -> Text
  if (voiceFileId && !text) {
    const listenId = sendMessage(chatId, "🎙️ Đang nghe giọng nói...");
    const file = getTelegramFileBase64(voiceFileId);
    if (file.error) {
      editMessage(chatId, listenId, "❌ Lỗi tải voice: " + file.error);
      return;
    }
    const tr = transcribeVoiceGemini(file.base64, file.mimeType);
    deleteMessage(chatId, listenId);
    if (tr.error || !tr.text) {
      sendMessage(chatId, "❌ Không nhận dạng được: " + (tr.error || "trống"));
      return;
    }
    text = tr.text;
    sendMessage(chatId, "🎙️ <i>" + escapeHtml(text) + "</i>");
  }

  // 3. Xử lý trạng thái đang chờ nhập dữ liệu (AWAIT)
  const awaitState = getJsonCache("AWAIT_" + chatId);
  if (awaitState && text && !text.startsWith('/')) {
    handleAwaitText(chatId, text, awaitState);
    return;
  }

  // 4. Xử lý các lệnh Slash Commands
  if (text.startsWith('/')) {
    if (text === '/start' || text.indexOf('/start') === 0) {
      try { PROP.setProperty('chat_id', String(chatId)); } catch (e) {}
      sendMessage(chatId, helpMessageHtml_());
      return;
    }
    if (text === '/help' || text.indexOf('/help') === 0) {
      sendMessage(chatId, helpMessageHtml_());
      return;
    }
    if (text === '/report' || text.indexOf('/report') === 0) {
      sendTodayReport(chatId);
      return;
    }
    if (text === '/scan' || text.indexOf('/scan') === 0) {
      const loadId = sendMessage(chatId, "⏳ Đang quét hóa đơn từ Gmail...");
      scanMail(chatId);
      deleteMessage(chatId, loadId);
      return;
    }
    if (text === '/metabilling' || text.indexOf('/metabilling') === 0) {
      const loadId = sendMessage(chatId, "⏳ Đang sync Meta Billing...");
      syncMetaBilling(chatId);
      deleteMessage(chatId, loadId);
      return;
    }
  }

  // Reply Keyboard cũ (Tháng này / 3 tháng) còn dính trên mobile
  if (text === "Tháng này" || text === "📆 Tháng này") {
    sendMonthReport(chatId, { remove_keyboard: true });
    return;
  }
  if (text === "3 tháng gần nhất" || text === "📅 3 tháng gần nhất") {
    send3MonthReport(chatId, { remove_keyboard: true });
    return;
  }

  // 5. Reply vào tin giao dịch để sửa nhanh
  if (text && contents.message.reply_to_message) {
    if (handleReplyShortcut(chatId, text, contents.message.reply_to_message)) return;
  }

  // 6. Xử lý Ảnh Bill
  const photoArray = contents.message.photo;
  let base64Image = null;
  if (photoArray && photoArray.length > 0) {
    const largestPhoto = photoArray[photoArray.length - 1];
    const file = getTelegramFileBase64(largestPhoto.file_id);
    if (!file.error) base64Image = file.base64;
  }

  // 7. Gửi sang Gemini AI bóc tách
  if (text || base64Image) {
    const loadId = sendMessage(chatId, "🧠 Đang xử lý dữ liệu...");
    const liveData = getLiveData();
    const aiRes = callGeminiAPI(text, base64Image, liveData);
    deleteMessage(chatId, loadId);

    if (aiRes.error) {
      sendMessage(chatId, "❌ " + aiRes.error);
      return;
    }

    const list = aiRes.giao_dich || [];
    if (!list.length) {
      sendMessage(chatId, "⚠️ Không tìm thấy giao dịch nào trong nội dung.");
      return;
    }

    processAiTransactions(chatId, text, list, liveData);
  }
}

function helpMessageHtml_() {
  return "🤖 <b>Bot Sổ Thu Chi AI v2</b>\n" +
    "• Gửi text / ảnh bill / voice để ghi sổ.\n" +
    "• <code>/report</code> — báo cáo hôm nay (+ nút Tháng này / 3 tháng).\n" +
    "• <code>/scan</code> — quét mail ngân hàng.\n" +
    "• <code>/metabilling</code> — đối soát Meta Ads billing ↔ mail.\n" +
    "• <code>/help</code> — hiện hướng dẫn này.\n\n" +
    "<b>Sửa</b> — bấm ✏️ → chọn field (Số tiền / Ví / DM / …) hoặc ⚡ sửa nhanh.\n" +
    "• Reply tin GD: <code>ví MB</code> · <code>50k</code> · <code>dm Cafe</code> · <code>hủy</code>\n" +
    "• Lô nhiều dòng: <code>#2 ví MB</code>";
}

// ==========================================
// 🔄 XỬ LÝ GIAO DỊCH & DRAFT / COMMIT
// ==========================================

function processAiTransactions(chatId, sourceText, giaoDichList, liveData) {
  const txId = "TX_" + Date.now();
  let allPass = true;
  const items = [];

  for (let i = 0; i < giaoDichList.length; i++) {
    const norm = normalizeTransaction(giaoDichList[i], liveData);
    if (!norm.pass) allPass = false;
    items.push({
      uniqueKey: `${txId}_${i}`,
      data: norm
    });
  }

  const draft = {
    txId: txId,
    sourceText: sourceText,
    committed: false,
    items: items
  };

  if (allPass) {
    commitDraft(chatId, draft);
  } else {
    putJsonCache("DRAFT_" + txId, draft, DRAFT_TTL);
    const text = buildTxMessage(draft, "preview");
    sendMessage(chatId, text, previewKeyboard(txId));
  }
}

function refreshCommittedMessage_(chatId, draft, messageId) {
  const text = buildTxMessage(draft, "committed");
  const kb = committedKeyboard(draft.txId);
  let mid = messageId;
  if (messageId) {
    editMessage(chatId, messageId, text, kb);
  } else {
    mid = sendMessage(chatId, text, kb);
  }
  if (mid) scheduleClearCommittedKeyboard(chatId, mid);
}

function commitDraft(chatId, draft, messageId) {
  if (!draft) return;
  if (draft.committed || getJsonCache("UNDO_" + draft.txId)) {
    draft.committed = true;
    refreshCommittedMessage_(chatId, draft, messageId);
    return;
  }

  const batchData = draft.items.map(it => ({
    data: it.data,
    uniqueKey: it.uniqueKey
  }));

  const saveRes = saveBatchToMonthShards(batchData);
  if (saveRes !== true) {
    const err = "❌ <b>Lỗi ghi Sheet:</b> " + saveRes;
    if (messageId) editMessage(chatId, messageId, err);
    else sendMessage(chatId, err);
    return;
  }

  draft.committed = true;
  putJsonCache("DRAFT_" + draft.txId, draft, UNDO_TTL);
  putJsonCache("UNDO_" + draft.txId, {
    keys: draft.items.map(it => it.uniqueKey)
  }, UNDO_TTL);

  refreshCommittedMessage_(chatId, draft, messageId);
}

function undoCommitted(chatId, messageId, txId) {
  const undo = getJsonCache("UNDO_" + txId);
  if (!undo || !undo.keys) {
    editMessage(chatId, messageId, "⌛ Hết hạn hoàn tác (24h) hoặc không tìm thấy lô.");
    return;
  }
  const removed = deleteRowsByUniqueKeys(undo.keys);
  CacheService.getScriptCache().remove("UNDO_" + txId);
  CacheService.getScriptCache().remove("DRAFT_" + txId);
  editMessage(chatId, messageId, `↩️ Đã hoàn tác lô <code>${txId}</code> (${removed} dòng).`, { inline_keyboard: [] });
}

// ==========================================
// ⌨️ INLINE KEYBOARDS & MESSAGE BUILDER
// ==========================================

function previewKeyboard(txId) {
  return {
    inline_keyboard: [[
      { text: "✅ Ghi vào sổ", callback_data: "C:" + txId },
      { text: "✏️ Sửa", callback_data: "E:" + txId },
      { text: "❌ Hủy", callback_data: "X:" + txId }
    ]]
  };
}

function committedKeyboard(txId) {
  return {
    inline_keyboard: [[
      { text: "✏️ Sửa", callback_data: "E:" + txId },
      { text: "↩️ Hoàn tác", callback_data: "U:" + txId }
    ]]
  };
}

function buildTxMessage(draft, mode) {
  const items = draft.items || [];
  let header = mode === "committed" ? "✅ <b>ĐÃ GHI VÀO SỔ</b>" : "⚠️ <b>XÁC NHẬN GIAO DỊCH</b>";
  let lines = [header, ""];
  
  items.forEach((it, idx) => {
    const d = it.data;
    const sign = d.phan_loai === "Thu" ? "➕" : "➖";
    let statusIcon = "";
    if (d.status) {
      if (d.status.startsWith("CHECK:")) {
        const labels = {
          "thu_chi": "Thu/Chi",
          "vi": "Ví",
          "doi_tuong": "Đối tượng",
          "danh_muc": "Danh mục"
        };
        const reasons = d.status.replace("CHECK:", "").split(",").map(r => labels[r] || r);
        statusIcon = ` ⚠️ <i>(thiếu: ${reasons.join(", ")})</i>`;
      } else if (d.status === "CHECK") {
        statusIcon = " ⚠️ <i>(cần kiểm tra)</i>";
      }
    }
    lines.push(`<b>#${idx + 1}. ${sign} ${formatMoney(d.so_tien_abs)}</b>${statusIcon}`);
    lines.push(`• Ngày: ${d.ngay_gd} | Loại: ${d.phan_loai}`);
    lines.push(`• Ví: <b>${d.vi}</b> | Đối tượng: <b>${d.doi_tuong}</b>`);
    lines.push(`• Danh mục: <b>${d.danh_muc_con}</b>`);
    if (d.ghi_chu) lines.push(`• Ghi chú: <i>${escapeHtml(d.ghi_chu)}</i>`);
    lines.push(`• Mã: <code>${it.uniqueKey}</code>`);
    lines.push("");
  });

  return lines.join("\n");
}

// ==========================================
// 🔀 CALLBACK QUERY ROUTER
// ==========================================

function handleCallbackQuery(cq) {
  const adminId = PROP.getProperty('admin_id');
  const userId = (cq.from && cq.from.id) ? cq.from.id.toString() : "";
  if (!adminId || userId !== adminId) {
    answerCallback(cq.id, "⛔ Bạn không có quyền thao tác!", true);
    return;
  }

  const chatId = cq.message.chat.id.toString();
  const messageId = cq.message.message_id;
  const data = cq.data || "";
  const parts = data.split(":");
  const op = parts[0];
  const txId = parts[1];

  answerCallback(cq.id);

  if (data === "REPORT_MONTH") { sendMonthReport(chatId); return; }
  if (data === "REPORT_3MONTH") { send3MonthReport(chatId); return; }

  if (op === "C") {
    const draft = getJsonCache("DRAFT_" + txId);
    if (!draft) {
      editMessage(chatId, messageId, "⌛ Giao dịch đã hết hạn xác nhận.");
    } else if (draft.committed) {
      refreshCommittedMessage_(chatId, draft, messageId);
    } else {
      commitDraft(chatId, draft, messageId);
    }
    return;
  }
  if (op === "X") {
    const draftX = getJsonCache("DRAFT_" + txId);
    if (draftX && draftX.committed) {
      editMessage(chatId, messageId, "⌛ Đã ghi sổ — không hủy được. Dùng ↩️ Hoàn tác (trong 24h) hoặc sửa trên Sheet.");
      return;
    }
    CacheService.getScriptCache().remove("DRAFT_" + txId);
    CacheService.getScriptCache().remove("AWAIT_" + chatId);
    editMessage(chatId, messageId, "❌ Đã hủy giao dịch.", { inline_keyboard: [] });
    return;
  }
  if (op === "U") {
    undoCommitted(chatId, messageId, txId);
    return;
  }
  if (op === "E") {
    CacheService.getScriptCache().remove("AWAIT_" + chatId);
    if (parts.length === 2) startEditFlow(chatId, messageId, txId);
    else showEditMenu(chatId, messageId, txId, parseInt(parts[2], 10));
    return;
  }
  if (op === "Q") {
    const idx = parseInt(parts[2], 10);
    const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
    if (!sess) {
      editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
      return;
    }
    putJsonCache("AWAIT_" + chatId, { mode: "quick", txId: txId, idx: idx, messageId: messageId }, EDIT_SESS_TTL);
    editMessage(chatId, messageId,
      "⚡ <b>Sửa nhanh</b> GD #" + (idx + 1) + "\nGửi câu kiểu: <code>Ví MB, 380k, danh mục Ăn uống</code>\n(Gom vào nháp — chưa ghi Sheet)",
      { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]] });
    return;
  }
  if (op === "F") {
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    if (field === "pl") {
      const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
      if (sess) {
        const current = sess.draft.phan_loai || "Chi";
        const next = current === "Thu" ? "Chi" : "Thu";
        applyToEditSession(sess, { phan_loai: next });
        showEditMenu(chatId, messageId, txId, idx);
      }
      return;
    }
    beginFieldEdit(chatId, messageId, txId, idx, field);
    return;
  }
  if (op === "L") {
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    const page = parseInt(parts[4], 10) || 0;
    showPickList(chatId, messageId, txId, idx, field, page);
    return;
  }
  if (op === "N") {
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    beginCustomInput(chatId, messageId, txId, idx, field);
    return;
  }
  if (op === "A") {
    const idx = parseInt(parts[2], 10);
    const addToBook = parts[3] === "1";
    handleCustomChoice(chatId, messageId, txId, idx, addToBook);
    return;
  }
  if (op === "P") {
    const idx = parseInt(parts[2], 10);
    const field = parts[3];
    const optIdx = parseInt(parts[4], 10);
    applyPickValue(chatId, messageId, txId, idx, field, optIdx);
    return;
  }
  if (op === "S") {
    const idx = parseInt(parts[2], 10);
    confirmEditSessionSave(chatId, messageId, txId, idx);
    return;
  }
  if (op === "R") {
    const idx = parseInt(parts[2], 10);
    CacheService.getScriptCache().remove(editSessKey(txId, idx));
    const draft = getJsonCache("DRAFT_" + txId) || loadDraftFromSheet(txId);
    if (draft) putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);
    openEditSession(txId, idx);
    showEditMenu(chatId, messageId, txId, idx);
    return;
  }
  if (op === "B") {
    CacheService.getScriptCache().remove("AWAIT_" + chatId);
    const draft = getJsonCache("DRAFT_" + txId);
    if (!draft) {
      editMessage(chatId, messageId, "⌛ Phiên đã hết hạn.");
      return;
    }
    const kb = draft.committed ? committedKeyboard(txId) : previewKeyboard(txId);
    editMessage(chatId, messageId, buildTxMessage(draft, draft.committed ? "committed" : "preview"), kb);
    if (draft.committed) scheduleClearCommittedKeyboard(chatId, messageId);
  }
}

// ==========================================
// ✏️ PHIÊN SỬA THEO FIELD (UI CŨ)
// ==========================================

function startEditFlow(chatId, messageId, txId) {
  CacheService.getScriptCache().remove("AWAIT_" + chatId);
  let draft = getJsonCache("DRAFT_" + txId);
  if (!draft) {
    draft = loadDraftFromSheet(txId);
    if (draft) putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);
  }
  if (!draft || !draft.items || !draft.items.length) {
    editMessage(chatId, messageId, "⌛ Không còn phiên sửa cho <code>" + txId + "</code> (hết hạn 24h hoặc đã xóa). Gửi lại GD hoặc sửa trên Sheet.");
    return;
  }
  if (draft.items.length === 1) {
    openEditSession(txId, 0);
    showEditMenu(chatId, messageId, txId, 0);
    return;
  }
  const rows = [];
  for (let i = 0; i < draft.items.length; i++) {
    rows.push([{ text: "GD #" + (i + 1), callback_data: "E:" + txId + ":" + i }]);
  }
  rows.push([{ text: "↩️ Quay lại", callback_data: "B:" + txId }]);
  editMessage(chatId, messageId, "✏️ Chọn giao dịch cần sửa:", { inline_keyboard: rows });
}

function showEditMenu(chatId, messageId, txId, idx) {
  let sess = getEditSession(txId, idx);
  if (!sess) sess = openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const d = sess.draft;
  const dirty = diffSnapshots(snapshotTx(sess.base), snapshotTx(sess.draft)).length > 0;
  const currentType = d.phan_loai || "Chi";
  const toggleLabel = currentType === "Thu" ? "Chi" : "Thu";
  let text = "✏️ <b>Phiên sửa GD #" + (idx + 1) + "</b>" + (dirty ? " · có nháp chưa lưu" : "") + "\n" +
    formatOneTx(d) + "\n\nChọn field hoặc sửa nhanh — gom vào nháp, rồi bấm Lưu vào sổ.";
  const rows = [
    [{ text: "⚡ Sửa nhanh bằng câu", callback_data: "Q:" + txId + ":" + idx }],
    [
      { text: "💰 Số tiền", callback_data: "F:" + txId + ":" + idx + ":st" },
      { text: "💳 Ví", callback_data: "F:" + txId + ":" + idx + ":vi" }
    ],
    [
      { text: "📁 Danh mục", callback_data: "F:" + txId + ":" + idx + ":dm" },
      { text: "👤 Đối tượng", callback_data: "F:" + txId + ":" + idx + ":dt" }
    ],
    [
      { text: toggleLabel, callback_data: "F:" + txId + ":" + idx + ":pl" },
      { text: "Ngày", callback_data: "F:" + txId + ":" + idx + ":ng" },
      { text: "Ghi chú", callback_data: "F:" + txId + ":" + idx + ":gc" }
    ]
  ];
  if (dirty) {
    rows.push([{ text: "✍️ Lưu vào sổ", callback_data: "S:" + txId + ":" + idx }]);
  }
  rows.push([{ text: "↩️ Quay lại", callback_data: "B:" + txId }]);
  const kb = { inline_keyboard: rows };
  if (messageId) editMessage(chatId, messageId, text, kb);
  else sendMessage(chatId, text, kb);
}

function beginFieldEdit(chatId, messageId, txId, idx, field) {
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  if (field === "vi" || field === "dm" || field === "dt") {
    showPickList(chatId, messageId, txId, idx, field, 0);
    return;
  }
  if (field === "pl") {
    const kb = {
      inline_keyboard: [
        [
          { text: "Thu", callback_data: "P:" + txId + ":" + idx + ":pl:0" },
          { text: "Chi", callback_data: "P:" + txId + ":" + idx + ":pl:1" }
        ],
        [{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]
      ]
    };
    putJsonCache("OPTS_" + txId + "_" + idx + "_pl", ["Thu", "Chi"], EDIT_SESS_TTL);
    editMessage(chatId, messageId, "Chọn phân loại (gom vào nháp):", kb);
    return;
  }
  const labels = { st: "số tiền (vd 380k)", ng: "ngày (dd/MM/yyyy)", gc: "ghi chú" };
  putJsonCache("AWAIT_" + chatId, { mode: "field", field: field, txId: txId, idx: idx, messageId: messageId }, EDIT_SESS_TTL);
  editMessage(chatId, messageId,
    "Nhập <b>" + (labels[field] || field) + "</b> (gom vào nháp):",
    { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]] });
}

function showPickList(chatId, messageId, txId, idx, field, page) {
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const liveData = getLiveData();
  const list = field === "vi" ? liveData.wallets : (field === "dm" ? liveData.categories : liveData.users);
  const top = suggestTopOptions(field, list, liveData.lessonRows || []);
  const opts = top.concat(list.filter(function (x) { return top.indexOf(x) === -1; }));
  putJsonCache("OPTS_" + txId + "_" + idx + "_" + field, opts, EDIT_SESS_TTL);

  const totalPages = Math.max(1, Math.ceil(opts.length / OPTS_PAGE_SIZE));
  page = Math.max(0, Math.min(page || 0, totalPages - 1));
  const slice = opts.slice(page * OPTS_PAGE_SIZE, page * OPTS_PAGE_SIZE + OPTS_PAGE_SIZE);
  const rows = [];
  for (let i = 0; i < slice.length; i++) {
    const absIdx = page * OPTS_PAGE_SIZE + i;
    rows.push([{ text: String(slice[i]).slice(0, 40), callback_data: "P:" + txId + ":" + idx + ":" + field + ":" + absIdx }]);
  }
  const nav = [];
  if (page > 0) nav.push({ text: "⬅️", callback_data: "L:" + txId + ":" + idx + ":" + field + ":" + (page - 1) });
  if (totalPages > 1) nav.push({ text: (page + 1) + "/" + totalPages, callback_data: "L:" + txId + ":" + idx + ":" + field + ":" + page });
  if (page < totalPages - 1) nav.push({ text: "➡️", callback_data: "L:" + txId + ":" + idx + ":" + field + ":" + (page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "✍️ Nhập khác", callback_data: "N:" + txId + ":" + idx + ":" + field }]);
  rows.push([{ text: "↩️ Quay lại", callback_data: "E:" + txId + ":" + idx }]);

  const title = field === "vi" ? "Ví" : (field === "dm" ? "Danh mục" : "Đối tượng");
  editMessage(chatId, messageId, "Chọn <b>" + title + "</b> (trang " + (page + 1) + "/" + totalPages + "):", { inline_keyboard: rows });
}

function beginCustomInput(chatId, messageId, txId, idx, field) {
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const title = field === "vi" ? "ví" : (field === "dm" ? "danh mục" : "đối tượng");
  putJsonCache("AWAIT_" + chatId, { mode: "custom", field: field, txId: txId, idx: idx, messageId: messageId }, EDIT_SESS_TTL);
  editMessage(chatId, messageId,
    "✍️ Nhập <b>" + title + "</b> (tên hoặc alias sổ tay):",
    { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "F:" + txId + ":" + idx + ":" + field }]] });
}

function applyPickValue(chatId, messageId, txId, idx, field, optIdx) {
  const sess = getEditSession(txId, idx);
  if (!sess) {
    editMessage(chatId, messageId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại.");
    return;
  }
  const opts = getJsonCache("OPTS_" + txId + "_" + idx + "_" + field) || [];
  const value = opts[optIdx];
  if (value === undefined || value === null) {
    editMessage(chatId, messageId, "❌ Không tìm thấy lựa chọn.");
    return;
  }
  const patch = {};
  if (field === "vi") patch.vi = value;
  if (field === "dm") patch.danh_muc_con = value;
  if (field === "dt") patch.doi_tuong = value;
  if (field === "pl") patch.phan_loai = value;
  applyToEditSession(sess, patch);
  showEditMenu(chatId, messageId, txId, idx);
}

function handleAwaitText(chatId, text, awaitState) {
  CacheService.getScriptCache().remove("AWAIT_" + chatId);
  const txId = awaitState.txId;
  const idx = awaitState.idx;
  const messageId = awaitState.messageId;
  const sess = getEditSession(txId, idx) || openEditSession(txId, idx);
  if (!sess) {
    sendMessage(chatId, "⌛ Phiên sửa hết hạn. Bấm ✏️ Sửa lại trên tin GD.");
    return;
  }

  if (awaitState.mode === "custom") {
    resolveCustomDictValue(chatId, messageId, txId, idx, awaitState.field, text);
    return;
  }

  let patch = {};
  if (awaitState.mode === "quick") {
    patch = parseQuickEdit(text);
    if (!Object.keys(patch).length) {
      sendMessage(chatId, "❌ Không hiểu câu sửa. Thử: <code>Ví MB, 380k, danh mục Ăn uống</code>");
      showEditMenu(chatId, messageId, txId, idx);
      return;
    }
  } else if (awaitState.mode === "field") {
    const f = awaitState.field;
    if (f === "st") {
      const amt = parseMoneyToken(text);
      if (amt === null) {
        sendMessage(chatId, "❌ Số tiền không hợp lệ.");
        showEditMenu(chatId, messageId, txId, idx);
        return;
      }
      patch.so_tien_abs = amt;
    } else if (f === "ng") {
      patch.ngay_gd = text.trim();
    } else if (f === "gc") {
      patch.ghi_chu = text.trim();
    }
  } else {
    sendMessage(chatId, "⚠️ Phiên thao tác không hợp lệ.");
    return;
  }
  applyToEditSession(sess, patch);
  showEditMenu(chatId, messageId || null, txId, idx);
}

function resolveCustomDictValue(chatId, messageId, txId, idx, field, text) {
  const sess = getEditSession(txId, idx);
  if (!sess) {
    sendMessage(chatId, "⌛ Phiên sửa hết hạn.");
    return;
  }
  const raw = (text || "").toString().trim();
  if (!raw) {
    sendMessage(chatId, "❌ Trống.");
    showPickList(chatId, messageId, txId, idx, field, 0);
    return;
  }
  const liveData = getLiveData();
  const list = field === "vi" ? liveData.wallets : (field === "dm" ? liveData.categories : liveData.users);
  let matched = matchDict(raw, list);

  if (!matched) {
    const fname = fieldMapName(field);
    const lessons = liveData.lessonRows || [];
    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i].field === fname && String(lessons[i].ai_guess).trim().toLowerCase() === raw.toLowerCase()) {
        matched = matchDict(lessons[i].user_fix, list);
        if (matched) break;
      }
    }
  }

  if (matched) {
    const patch = {};
    if (field === "vi") patch.vi = matched;
    if (field === "dm") patch.danh_muc_con = matched;
    if (field === "dt") patch.doi_tuong = matched;
    applyToEditSession(sess, patch);
    if (messageId) showEditMenu(chatId, messageId, txId, idx);
    else sendMessage(chatId, "✅ Đã gom vào nháp: " + matched);
    return;
  }

  putJsonCache("PENDCUSTOM_" + txId + "_" + idx, { field: field, value: raw }, EDIT_SESS_TTL);
  const title = field === "vi" ? "ví" : (field === "dm" ? "danh mục" : "đối tượng");
  const kb = {
    inline_keyboard: [
      [{ text: "➕ Thêm vào sổ tay", callback_data: "A:" + txId + ":" + idx + ":1" }],
      [{ text: "Chỉ dùng lần này", callback_data: "A:" + txId + ":" + idx + ":0" }],
      [{ text: "↩️ Quay lại", callback_data: "F:" + txId + ":" + idx + ":" + field }]
    ]
  };
  const msg = "❓ <b>" + escapeHtml(raw) + "</b> chưa có trong sổ tay (" + title + ").\nThêm vào sổ tay hay chỉ dùng lần này (có thể CHECK)?";
  if (messageId) editMessage(chatId, messageId, msg, kb);
  else sendMessage(chatId, msg, kb);
}

function handleCustomChoice(chatId, messageId, txId, idx, addToBook) {
  const sess = getEditSession(txId, idx);
  const pend = getJsonCache("PENDCUSTOM_" + txId + "_" + idx);
  if (!sess || !pend) {
    editMessage(chatId, messageId, "⌛ Hết hạn lựa chọn. Bấm ✏️ Sửa lại.");
    return;
  }
  const field = pend.field;
  let value = pend.value;
  CacheService.getScriptCache().remove("PENDCUSTOM_" + txId + "_" + idx);

  if (addToBook) {
    const ok = addToNotebook(field, value);
    if (!ok) {
      editMessage(chatId, messageId, "❌ Không thêm được vào sổ tay. Thử lại hoặc chọn «Chỉ dùng lần này».");
      return;
    }
    invalidateLiveDataCache_();
  }

  const patch = {};
  if (field === "vi") patch.vi = value;
  if (field === "dm") patch.danh_muc_con = value;
  if (field === "dt") patch.doi_tuong = value;
  applyToEditSession(sess, patch);
  showEditMenu(chatId, messageId, txId, idx);
}

function confirmEditSessionSave(chatId, messageId, txId, idx) {
  const reply = function (text, kb) {
    if (messageId) editMessage(chatId, messageId, text, kb || null);
    else sendMessage(chatId, text, kb || null);
  };

  const sess = getEditSession(txId, idx);
  if (!sess) {
    reply("⌛ Phiên sửa hết hạn — không áp dụng mù. Bấm ✏️ Sửa lại.");
    return;
  }
  const before = snapshotTx(sess.base);
  const after = sess.draft;
  const diffs = diffSnapshots(before, snapshotTx(after));
  if (!diffs.length) {
    reply(
      "✅ Đã lưu — không còn thay đổi mới.\n\n" + formatOneTx(after),
      { inline_keyboard: [[{ text: "↩️ Quay lại", callback_data: "B:" + txId }]] });
    return;
  }

  if (sess.committed) {
    const fpNow = getSheetFingerprint(sess.uniqueKey);
    if (fpNow === null) {
      reply("❌ Không tìm thấy dòng <code>" + sess.uniqueKey + "</code> trên Sheet.");
      return;
    }
    if (String(fpNow) !== String(sess.sheetFingerprint)) {
      reply(
        "⚠️ Dòng đã đổi trên Sheet kể từ khi mở phiên. Không ghi đè.\nBấm tải lại để sửa trên bản mới.",
        { inline_keyboard: [
          [{ text: "🔄 Tải lại phiên", callback_data: "R:" + txId + ":" + idx }],
          [{ text: "↩️ Quay lại", callback_data: "B:" + txId }]
        ] });
      return;
    }
    const upd = updateRowByUniqueKey(sess.uniqueKey, after);
    if (upd !== true) {
      reply("❌ Không cập nhật được Sheet.");
      return;
    }
  }

  let draft = getJsonCache("DRAFT_" + txId);
  if (!draft) draft = loadDraftFromSheet(txId);
  if (draft && draft.items[idx]) {
    draft.items[idx].data = after;
    putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);
  }

  recordUserEditLessons_(sess.sourceText || (draft && draft.sourceText) || "", before, after);
  CacheService.getScriptCache().remove(editSessKey(txId, idx));
  CacheService.getScriptCache().remove("AWAIT_" + chatId);

  const finalDraft = draft || { txId: txId, committed: sess.committed, items: [{ data: after, uniqueKey: sess.uniqueKey }] };
  if (!finalDraft.committed) {
    commitDraft(chatId, finalDraft, messageId);
    return;
  }

  if (messageId) {
    editMessage(chatId, messageId, "✅ Đã lưu sửa.\n\n" + buildTxMessage(finalDraft, "committed"), committedKeyboard(txId));
    scheduleClearCommittedKeyboard(chatId, messageId);
  } else {
    const mid = sendMessage(chatId, "✅ Đã lưu sửa.\n\n" + buildTxMessage(finalDraft, "committed"), committedKeyboard(txId));
    if (mid) scheduleClearCommittedKeyboard(chatId, mid);
  }
}

function editSessKey(txId, idx) {
  return "EDITSESS_" + txId + "_" + idx;
}

function deepCopyTx(data) {
  return JSON.parse(JSON.stringify(data));
}

function openEditSession(txId, idx) {
  const draft = getJsonCache("DRAFT_" + txId);
  if (!draft || !draft.items || !draft.items[idx]) return null;
  const item = draft.items[idx];
  const base = deepCopyTx(item.data);
  const sess = {
    txId: txId,
    idx: idx,
    uniqueKey: item.uniqueKey,
    committed: !!draft.committed,
    base: base,
    draft: deepCopyTx(item.data),
    openedAt: Date.now(),
    sheetFingerprint: draft.committed ? getSheetFingerprint(item.uniqueKey) : null,
    sourceText: draft.sourceText || ""
  };
  putJsonCache(editSessKey(txId, idx), sess, EDIT_SESS_TTL);
  return sess;
}

function getEditSession(txId, idx) {
  const sess = getJsonCache(editSessKey(txId, idx));
  if (!sess) return null;
  if (sess.openedAt && (Date.now() - sess.openedAt) > EDIT_SESS_TTL * 1000) {
    CacheService.getScriptCache().remove(editSessKey(txId, idx));
    return null;
  }
  return sess;
}

function applyToEditSession(sess, patch) {
  const liveData = getLiveData();
  const merged = Object.assign({}, sess.draft, patch);
  if (patch.so_tien_abs !== undefined) {
    merged.so_tien_abs = patch.so_tien_abs;
    merged.so_tien = patch.so_tien_abs;
  }
  sess.draft = normalizeTransaction(merged, liveData);
  putJsonCache(editSessKey(sess.txId, sess.idx), sess, EDIT_SESS_TTL);
  return sess;
}

function getSheetFingerprint(uniqueKey) {
  const row = getRowByUniqueKey(uniqueKey);
  if (!row) return null;
  return [
    row.uniqueKey || uniqueKey,
    String(row.ngay_gd || ""),
    String(row.phan_loai || ""),
    String(row.so_tien),
    String(row.vi || ""),
    String(row.doi_tuong || ""),
    String(row.danh_muc_con || ""),
    String(row.ghi_chu || ""),
    String(row.status || "")
  ].join("|");
}

/** Nạp lại draft đã ghi từ các sheet Log_MM_YYYY theo tiền tố TX_… */
function loadDraftFromSheet(txId) {
  try {
    const ss = getSpreadsheet_();
    const items = [];
    const sheets = ss.getSheets();
    for (let s = 0; s < sheets.length; s++) {
      const sh = sheets[s];
      const name = sh.getName();
      if (!name.startsWith("Log_") || name === "Log_Chuyen") continue;
      const lastRow = sh.getLastRow();
      if (lastRow < 3) continue;
      const values = sh.getRange(3, 1, lastRow, 9).getValues();
      for (let i = 0; i < values.length; i++) {
        const key = values[i][MONTH_LOG_COL.UNIQUE_KEY] ? String(values[i][MONTH_LOG_COL.UNIQUE_KEY]) : "";
        if (!key || key.indexOf(txId) !== 0) continue;
        const so = Number(values[i][MONTH_LOG_COL.SO_TIEN]) || 0;
        let ngayVal = values[i][MONTH_LOG_COL.NGAY];
        if (ngayVal instanceof Date) ngayVal = Utilities.formatDate(ngayVal, "GMT+7", "dd/MM/yyyy");
        else ngayVal = String(ngayVal || "");
        const status = values[i][MONTH_LOG_COL.STATUS] || "";
        const data = {
          ngay_gd: ngayVal,
          phan_loai: values[i][MONTH_LOG_COL.PHAN_LOAI],
          so_tien: so,
          so_tien_abs: Math.abs(so),
          vi: values[i][MONTH_LOG_COL.VI],
          doi_tuong: values[i][MONTH_LOG_COL.DOI_TUONG],
          danh_muc_con: values[i][MONTH_LOG_COL.DANH_MUC_CON],
          ghi_chu: values[i][MONTH_LOG_COL.GHI_CHU] || "",
          status: status,
          pass: !String(status).startsWith("CHECK")
        };
        items.push({ uniqueKey: key, data: data });
      }
    }
    if (!items.length) return null;
    items.sort(function (a, b) {
      return String(a.uniqueKey).localeCompare(String(b.uniqueKey));
    });
    return { txId: txId, sourceText: "", committed: true, items: items };
  } catch (e) {
    return null;
  }
}

/** Thêm giá trị mới vào Named Range sổ tay (Wallet / userr / Category) */
function addToNotebook(field, value) {
  try {
    const ss = getSpreadsheet_();
    let rangeName = "";
    let valueColOffset = 0;
    if (field === "vi") { rangeName = "Wallet"; valueColOffset = 0; }
    else if (field === "dt") { rangeName = "userr"; valueColOffset = 0; }
    else if (field === "dm") { rangeName = "Category"; valueColOffset = 1; }
    else return false;

    const range = ss.getRangeByName(rangeName);
    if (!range) return false;
    const sheet = range.getSheet();
    const values = range.getValues();
    let insertLocal = -1;
    for (let i = 0; i < values.length; i++) {
      if (!values[i][valueColOffset]) { insertLocal = i; break; }
    }
    if (insertLocal >= 0) {
      sheet.getRange(range.getRow() + insertLocal, range.getColumn() + valueColOffset).setValue(value);
    } else {
      const newRow = range.getLastRow() + 1;
      const nCols = range.getNumColumns();
      if (field === "dm" && nCols >= 2) {
        const rowVals = [];
        for (let c = 0; c < nCols; c++) rowVals.push(c === valueColOffset ? value : "");
        sheet.getRange(newRow, range.getColumn(), 1, nCols).setValues([rowVals]);
      } else {
        sheet.getRange(newRow, range.getColumn() + valueColOffset).setValue(value);
      }
      ss.setNamedRange(rangeName, sheet.getRange(range.getRow(), range.getColumn(), range.getNumRows() + 1, nCols));
    }
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return false;
  }
}

function suggestTopOptions(field, list, lessons) {
  const fname = fieldMapName(field);
  const fromLessons = (lessons || []).filter(function (L) {
    return L.field === fname;
  }).slice(0, 3).map(function (L) { return L.user_fix; });
  const out = [];
  fromLessons.concat(list).forEach(function (x) {
    const matched = matchDict(x, list);
    if (matched && out.indexOf(matched) === -1) out.push(matched);
  });
  return out.slice(0, 3);
}

function fieldMapName(field) {
  if (field === "vi") return "vi";
  if (field === "dm") return "danh_muc_con";
  if (field === "dt") return "doi_tuong";
  if (field === "pl") return "phan_loai";
  if (field === "st") return "so_tien";
  return field;
}

function snapshotTx(d) {
  return {
    ngay_gd: d.ngay_gd,
    phan_loai: d.phan_loai,
    so_tien_abs: d.so_tien_abs,
    vi: d.vi,
    doi_tuong: d.doi_tuong,
    danh_muc_con: d.danh_muc_con,
    ghi_chu: d.ghi_chu || ""
  };
}

function diffSnapshots(before, after) {
  const labels = {
    ngay_gd: "Ngày",
    phan_loai: "Thu/Chi",
    so_tien_abs: "Số tiền",
    vi: "Ví",
    doi_tuong: "Đối tượng",
    danh_muc_con: "Danh mục",
    ghi_chu: "Ghi chú"
  };
  const out = [];
  Object.keys(labels).forEach(function (k) {
    const b = before[k];
    const a = after[k];
    if (String(b) !== String(a)) {
      if (k === "so_tien_abs") out.push(labels[k] + ": " + formatMoney(b) + " → " + formatMoney(a));
      else out.push(labels[k] + ": " + (b || "∅") + " → " + (a || "∅"));
    }
  });
  return out;
}

function formatOneTx(d) {
  const isChi = d.phan_loai === "Chi";
  const emoji = isChi ? "🔴" : "🔵";
  const dau = isChi ? "−" : "+";
  let flag = "";
  if (d.pass === false || (d.status && String(d.status).startsWith("CHECK"))) {
    flag = " ⚠️";
  }
  const lines = [
    "📅 " + escapeHtml(d.ngay_gd),
    emoji + " " + escapeHtml(d.phan_loai) + " " + dau + formatMoney(d.so_tien_abs) + flag,
    "💳 " + escapeHtml(d.vi) + "  ·  📁 " + escapeHtml(d.danh_muc_con),
    "👤 " + escapeHtml(d.doi_tuong)
  ];
  if (d.ghi_chu) lines.push("📝 " + escapeHtml(d.ghi_chu));
  return lines.join("\n");
}

/** Bóc tách nhanh lệnh tắt sửa giao dịch bằng Regex */
function parseQuickEdit(text) {
  const patch = {};
  const t = (text || "").toString().trim();
  if (!t) return patch;

  const viM = t.match(/(?:ví|vi|nguồn|nguon)\s*[:=]?\s*([^,;#]+)/i);
  if (viM) patch.vi = viM[1].trim();

  const dmM = t.match(/(?:danh\s*mục|danh\s*muc|dm)\s*[:=]?\s*([^,;#]+)/i);
  if (dmM) patch.danh_muc_con = dmM[1].trim();

  const dtM = t.match(/(?:đối\s*tượng|doi\s*tuong|người|nguoi|dt)\s*[:=]?\s*([^,;#]+)/i);
  if (dtM) patch.doi_tuong = dtM[1].trim();

  const gcM = t.match(/(?:ghi\s*chú|ghi\s*chu|note)\s*[:=]?\s*([^,;#]+)/i);
  if (gcM) patch.ghi_chu = gcM[1].trim();

  if (/\bthu\b/i.test(t) && !/\bchi\b/i.test(t)) patch.phan_loai = "Thu";
  if (/\bchi\b/i.test(t) && !/\bthu\b/i.test(t)) patch.phan_loai = "Chi";
  if (/đổi\s*sang\s*thu|sang\s*thu/i.test(t)) patch.phan_loai = "Thu";
  if (/đổi\s*sang\s*chi|sang\s*chi/i.test(t)) patch.phan_loai = "Chi";

  const moneyM = t.match(/(\d+(?:[.,]\d+)?\s*(?:k|m|tr|tỷ|ty)?)/i);
  if (moneyM) {
    const amt = parseMoneyToken(moneyM[1]);
    if (amt !== null) patch.so_tien_abs = amt;
  }

  if (!patch.vi) {
    const sang = t.match(/(?:đổi\s*sang|doi\s*sang|sang)\s+([A-Za-zÀ-ỹ0-9 ]{1,30})/i);
    if (sang) {
      const cand = sang[1].trim().split(/[,\s]+/)[0];
      if (cand && !/^\d/.test(cand) && !/^(thu|chi)$/i.test(cand)) patch.vi = cand;
    }
  }

  return patch;
}

/** Chuyển đổi chuỗi số tiền có đơn vị (k, m, tr, tỷ) thành số nguyên */
function parseMoneyToken(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && !isNaN(raw)) return Math.abs(raw);
  let s = String(raw).trim().toLowerCase().replace(/đ|vnd|vnđ/gi, "").replace(/\s+/g, "");
  if (!s) return null;
  let mult = 1;
  if (/tỷ|ty/.test(s)) {
    mult = 1e9;
    s = s.replace(/tỷ|ty/g, "");
  } else if (/triệu|(^|[^a-z])tr([^a-z]|$)|(^|[^a-z])m([^a-z]|$)/.test(s) || /tr$|m$/.test(s)) {
    mult = 1e6;
    s = s.replace(/triệu|tr|m/g, "");
  } else if (/nghìn|nghin/.test(s) || /k$/.test(s) || /\bk\b/.test(s)) {
    mult = 1e3;
    s = s.replace(/nghìn|nghin|\bk\b|k$/g, "");
  }
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return Math.abs(n * mult);
}

function handleReplyShortcut(chatId, text, replyMsg) {
  const replyText = (replyMsg && (replyMsg.text || replyMsg.caption)) || "";
  const txMatch = replyText.match(/TX_\d+/i);
  if (!txMatch) return false;
  const txId = txMatch[0];

  const raw = (text || "").toString().trim();
  if (!raw) return false;

  let idx = 0;
  let cmd = raw;
  const idxMatch = raw.match(/^#(\d+)\s+(.+)$/i);
  if (idxMatch) {
    idx = Math.max(0, parseInt(idxMatch[1], 10) - 1);
    cmd = idxMatch[2].trim();
  }

  if (/^(hủy|huy|cancel)$/i.test(cmd)) {
    const draft = getJsonCache("DRAFT_" + txId);
    if (draft && !draft.committed) {
      CacheService.getScriptCache().remove("DRAFT_" + txId);
      sendMessage(chatId, "🗑 Đã hủy lô <code>" + txId + "</code>.");
      return true;
    }
    if (draft && draft.committed) {
      const undo = getJsonCache("UNDO_" + txId);
      if (undo && undo.keys) {
        const removed = deleteRowsByUniqueKeys(undo.keys);
        CacheService.getScriptCache().remove("UNDO_" + txId);
        CacheService.getScriptCache().remove("DRAFT_" + txId);
        sendMessage(chatId, "↩️ Đã hoàn tác lô <code>" + txId + "</code> (" + removed + " dòng).");
        return true;
      }
      sendMessage(chatId, "⌛ Hết hạn hoàn tác cho <code>" + txId + "</code>.");
      return true;
    }
    sendMessage(chatId, "⌛ Không còn phiên <code>" + txId + "</code>.");
    return true;
  }

  const patch = parseQuickEdit(cmd);
  if (!Object.keys(patch).length) {
    sendMessage(chatId, "❌ Không hiểu lệnh tắt. Thử: <code>ví MB</code>, <code>380k</code>, <code>dm Ăn uống</code>, <code>hủy</code>");
    return true;
  }

  let draft = getJsonCache("DRAFT_" + txId);
  if (!draft) draft = loadDraftFromSheet(txId);
  if (!draft || !draft.items || !draft.items[idx]) {
    sendMessage(chatId, "⌛ Không còn GD #" + (idx + 1) + " của <code>" + txId + "</code>.");
    return true;
  }
  putJsonCache("DRAFT_" + txId, draft, draft.committed ? UNDO_TTL : DRAFT_TTL);

  const sess = openEditSession(txId, idx);
  if (!sess) {
    sendMessage(chatId, "⌛ Không mở được phiên sửa.");
    return true;
  }
  applyToEditSession(sess, patch);
  confirmEditSessionSave(chatId, null, txId, idx);
  return true;
}

// ==========================================
// 📊 BÁO CÁO TELEGRAM (/report + Tháng / 3 tháng)
// ==========================================

/** Đọc khối Hôm nay (A2) + tối đa 3 tháng (A3:A5) trên Bao Cao v2. */
function readBaoCaoV2Block_() {
  const baoCao = getSheetByGid(GID.BAO_CAO);
  if (!baoCao) return null;
  return baoCao.getRange('A2:E5').getValues();
}

function formatReportMonthLabel_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+7', 'MM/yyyy');
  }
  const s = String(val == null ? '' : val).trim();
  if (s.indexOf('GMT') >= 0 || s.indexOf('Indochina') >= 0) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'GMT+7', 'MM/yyyy');
    } catch (e) {}
  }
  return s;
}

/** Khối Thu / Chi / Ròng dùng chung cho Hôm nay & Tháng này. */
function buildBaoCaoDetail_(thu, chi, rong, checkCount) {
  const rongStr = rong > 0 ? ('+' + formatMoney(rong)) : formatMoney(rong);
  let text = '──────────────────\n' +
    '➕ Thu: <b>' + formatMoney(thu) + '</b>\n' +
    '➖ Chi: <b>' + formatMoney(chi) + '</b>\n' +
    '💵 Ròng: <b>' + rongStr + '</b>';
  const nCheck = Number(checkCount) || 0;
  if (nCheck) {
    text += '\n⚠️ Cần kiểm tra: <b>' + nCheck + '</b> giao dịch';
  }
  return text;
}

function sendTodayReport(chatId) {
  if (!chatId) {
    chatId = PROP.getProperty('chat_id');
  }
  if (!chatId) {
    console.warn('sendTodayReport: chưa có chat_id');
    return;
  }

  let tsLine = '';
  try {
    const refreshed = refreshReportsForView_();
    if (refreshed && refreshed.ts) {
      tsLine = '\n⏱ Cập nhật đến <b>' + escapeHtml(refreshed.ts) + '</b>';
    }
  } catch (e) {
    tsLine = '\n⚠ Không làm mới được báo cáo: ' + escapeHtml(e.message || e);
  }

  const block = readBaoCaoV2Block_();
  if (!block) {
    sendMessage(chatId, '❌ Không tìm thấy Sheet Báo cáo.');
    return;
  }
  const row = block[0];
  const thu = Math.abs(Number(row[1]) || 0);
  const chi = Math.abs(Number(row[2]) || 0);
  const rong = Number(row[3]) || 0;
  const msg = '📊 <b>BÁO CÁO HÔM NAY (' + escapeHtml(formatReportMonthLabel_(row[0])) + ')</b>\n' +
    buildBaoCaoDetail_(thu, chi, rong, row[4]) +
    tsLine;

  sendMessage(chatId, msg, {
    inline_keyboard: [[
      { text: '📆 Tháng này', callback_data: 'REPORT_MONTH' },
      { text: '📅 3 tháng gần nhất', callback_data: 'REPORT_3MONTH' }
    ]]
  });
}

function sendMonthReport(chatId, replyMarkup) {
  const block = readBaoCaoV2Block_();
  if (!block || !block[1] || !block[1][0]) {
    sendMessage(chatId, '❌ Chưa có dòng tháng trên Báo cáo. Chạy /report trước.', replyMarkup);
    return;
  }
  const row = block[1];
  const thangLabel = formatReportMonthLabel_(row[0]);
  const thu = Math.abs(Number(row[1]) || 0);
  const chi = Math.abs(Number(row[2]) || 0);
  const rong = Number(row[3]) || 0;
  const now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy • HH:mm');
  const text = '📊 <b>BÁO CÁO THÁNG ' + escapeHtml(thangLabel) + '</b>\n' +
    '🗓 <i>Cập nhật: ' + now + '</i>\n' +
    buildBaoCaoDetail_(thu, chi, rong, row[4]);
  sendMessage(chatId, text, replyMarkup);
}

function send3MonthReport(chatId, replyMarkup) {
  const block = readBaoCaoV2Block_();
  if (!block) {
    sendMessage(chatId, '❌ Không tìm thấy Sheet Báo cáo.', replyMarkup);
    return;
  }

  let tongRong = 0;
  let rows = '';
  const now = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy • HH:mm');

  for (let i = 1; i <= 3; i++) {
    const row = block[i];
    if (!row || !row[0]) continue;
    const thangLabel = formatReportMonthLabel_(row[0]);
    const rong = Number(row[3]) || 0;
    const rongStr = rong > 0 ? ('+' + formatMoney(rong)) : formatMoney(rong);
    rows += '• Tháng ' + escapeHtml(thangLabel) + ':   <b>' + rongStr + '</b>\n';
    tongRong += rong;
  }

  if (!rows) {
    sendMessage(chatId, '❌ Chưa có dữ liệu tháng trên Báo cáo. Chạy /report trước.', replyMarkup);
    return;
  }

  const tongStr = tongRong > 0 ? ('+' + formatMoney(tongRong)) : formatMoney(tongRong);
  const text = '📊 <b>BÁO CÁO 3 THÁNG GẦN NHẤT</b>\n' +
    '🗓 <i>Cập nhật: ' + now + '</i>\n' +
    '──────────────────\n' +
    rows +
    '──────────────────\n' +
    '💰 <b>Tổng Ròng:</b> <b>' + tongStr + '</b>';
  sendMessage(chatId, text, replyMarkup);
}

// ==========================================
// 🛠️ UTILS I/O TELEGRAM
// ==========================================

function sendMessage(chatId, htmlText, replyMarkup) {
  const token = PROP.getProperty('bot_token');
  const payload = { chat_id: chatId, text: htmlText, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()).result.message_id; } catch (e) { return null; }
}

function editMessage(chatId, messageId, htmlText, replyMarkup) {
  const token = PROP.getProperty('bot_token');
  const payload = { chat_id: chatId, message_id: messageId, text: htmlText, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function deleteMessage(chatId, messageId) {
  if (!messageId) return;
  const token = PROP.getProperty('bot_token');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ chat_id: chatId, message_id: messageId }), muteHttpExceptions: true
  });
}

function answerCallback(cqId, text, showAlert) {
  const token = PROP.getProperty('bot_token');
  const payload = { callback_query_id: cqId };
  if (text) payload.text = text;
  if (showAlert) payload.show_alert = true;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function getTelegramFileBase64(fileId) {
  const token = PROP.getProperty('bot_token');
  try {
    const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const filePath = JSON.parse(res.getContentText()).result.file_path;
    const fileRes = UrlFetchApp.fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    return {
      base64: Utilities.base64Encode(fileRes.getBlob().getBytes()),
      mimeType: fileRes.getBlob().getContentType()
    };
  } catch (e) {
    return { error: e.message };
  }
}

function putJsonCache(key, obj, ttlSec) {
  CacheService.getScriptCache().put(key, JSON.stringify(obj), ttlSec || 600);
}

function getJsonCache(key) {
  const raw = CacheService.getScriptCache().get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(num) {
  return (Number(num) || 0).toLocaleString('vi-VN') + " ₫";
}

// ==========================================
// ⌨️ GỠ NÚT SỬA/HOÀN TÁC SAU 24H
// ==========================================

function scheduleClearCommittedKeyboard(chatId, messageId) {
  if (!chatId || !messageId) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    let list = [];
    const raw = PROP.getProperty("PENDING_CLEAR_KEYBOARDS");
    if (raw) {
      try { list = JSON.parse(raw); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
    }
    const expireAtSec = Math.floor((Date.now() + (UNDO_TTL * 1000)) / 1000);
    list.push({ c: String(chatId), m: messageId, t: expireAtSec });
    if (list.length > 200) list = list.slice(list.length - 200);
    PROP.setProperty("PENDING_CLEAR_KEYBOARDS", JSON.stringify(list));
  } catch (e) {
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
  ensureClearKeyboardTrigger();
}

function ensureClearKeyboardTrigger() {
  try {
    if (PROP.getProperty("HAS_CLEAR_KB_TRIGGER") === "1") return;
    const triggers = ScriptApp.getProjectTriggers();
    let found = false;
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "runClearCommittedKeyboardInterval") {
        found = true;
        break;
      }
    }
    if (!found) {
      ScriptApp.newTrigger("runClearCommittedKeyboardInterval")
        .timeBased()
        .everyHours(1)
        .create();
    }
    PROP.setProperty("HAS_CLEAR_KB_TRIGGER", "1");
  } catch (e) {}
}

/** Trigger mỗi giờ: gỡ inline keyboard đã hết TTL undo (24h) */
function runClearCommittedKeyboardInterval() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const raw = PROP.getProperty("PENDING_CLEAR_KEYBOARDS");
    if (!raw) return;
    let list = [];
    try { list = JSON.parse(raw); if (!Array.isArray(list)) list = []; } catch (e) { return; }
    if (list.length === 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const remaining = [];
    const clearRequests = [];
    const token = PROP.getProperty('bot_token');

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const cId = item.c || item.chatId;
      const mId = item.m || item.messageId;
      let expSec = item.t;
      if (expSec === undefined && item.expireAt) {
        expSec = Math.floor(item.expireAt / 1000);
      }

      if (nowSec >= expSec) {
        if (token && cId && mId) {
          clearRequests.push({
            url: "https://api.telegram.org/bot" + token + "/editMessageReplyMarkup",
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify({
              chat_id: cId,
              message_id: mId,
              reply_markup: { inline_keyboard: [] }
            }),
            muteHttpExceptions: true
          });
        }
      } else {
        remaining.push(item);
      }
    }

    if (clearRequests.length > 0) {
      try { UrlFetchApp.fetchAll(clearRequests); } catch (err) {}
    }
    PROP.setProperty("PENDING_CLEAR_KEYBOARDS", JSON.stringify(remaining));
  } catch (err) {
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
