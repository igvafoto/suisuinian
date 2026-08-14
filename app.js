/* 碎碎念 · 语音日记 —— 纯前端 PWA，数据只存在你本地手机里 */
(function () {
  'use strict';

  var K_ENTRIES = 'murmur_entries';
  var K_REPORTS = 'murmur_reports';
  var K_SETTINGS = 'murmur_settings';
  var K_TRASH = 'murmur_trash';

  /* ---------- 存储 ---------- */
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function getEntries() { return load(K_ENTRIES, []); }
  function getReports() { return load(K_REPORTS, []); }
  function getSettings() {
    return Object.assign({ apiKey: '', notifyTime: '09:00', lastBackupAt: '' }, load(K_SETTINGS, {}));
  }
  function setSettings(s) { save(K_SETTINGS, s); }
  function getTrash() { return load(K_TRASH, []); }
  function setTrash(v) { save(K_TRASH, v); }

  /* ---------- 日期 ---------- */
  function dateStr(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function shiftDate(ds, n) {
    var p = ds.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var elLive = $('liveText'), elInput = $('inputBox'), elMic = $('btnMic');
  var editingId = null;
  var elToday = $('todayEntries'), elAll = $('allEntries'), elReports = $('reportList');
  var elTodayCount = $('todayCount'), elBanner = $('reportBanner'), elBannerCount = $('bannerCount');
  var elBackupBanner = $('backupBanner');
  var elToast = $('toast');
  var elTrash = $('trashEntries'), elTrashCount = $('trashCount');

  var toastTimer;
  function toast(msg) {
    elToast.textContent = msg;
    elToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.hidden = true; }, 2600);
  }

  /* ---------- 条目 ---------- */
  function saveEntry(text) {
    text = (text || '').trim();
    if (!text) return false;
    var entries = getEntries();
    entries.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 7), text: text, ts: new Date().toISOString() });
    save(K_ENTRIES, entries);
    elInput.value = '';
    elLive.hidden = true; elLive.textContent = '';
    accumText = '';
    renderAll();
    return true;
  }
  function addEntry(text) {
    if (saveEntry(text)) toast('已记下 ✨');
  }
  function deleteEntry(id) {
    if (editingId === id) cancelEdit();
    var entries = getEntries();
    var idx = -1;
    for (var i = 0; i < entries.length; i++) { if (entries[i].id === id) { idx = i; break; } }
    if (idx < 0) return;
    var removed = entries[idx];
    entries.splice(idx, 1);
    save(K_ENTRIES, entries);
    var trash = getTrash();
    trash.push({ entry: removed, index: idx, deletedAt: Date.now() });
    setTrash(trash);
    renderAll();
    toast('已移到回收站 🗑');
  }
  function restoreFromTrash(id) {
    var trash = getTrash(), pos = -1;
    for (var i = 0; i < trash.length; i++) { if (trash[i].entry.id === id) { pos = i; break; } }
    if (pos < 0) return;
    var item = trash[pos];
    trash.splice(pos, 1); setTrash(trash);
    var entries = getEntries();
    var idx = Math.max(0, Math.min(item.index, entries.length));
    entries.splice(idx, 0, item.entry);
    save(K_ENTRIES, entries);
    renderAll();
    toast('已恢复 ✨');
  }
  function eraseFromTrash(id) {
    var trash = getTrash().filter(function (it) { return it.entry.id !== id; });
    setTrash(trash);
    renderTrash();
    toast('已彻底删除');
  }
  function emptyTrash() {
    if (!getTrash().length) { toast('回收站本来就是空的'); return; }
    if (confirm('确定清空回收站吗？里面的内容会永久删除，无法恢复。')) {
      setTrash([]); renderTrash(); toast('回收站已清空');
    }
  }
  var TRASH_DAYS = 30;
  function purgeExpiredTrash() {
    var t = getTrash();
    if (!t.length) return;
    var kept = t.filter(function (it) { return (it.deletedAt || Date.now()) > Date.now() - TRASH_DAYS * 86400000; });
    if (kept.length !== t.length) setTrash(kept);
  }
  function renderTrash() {
    if (elTrashCount) elTrashCount.textContent = getTrash().length;
    var trash = getTrash();
    if (!trash.length) {
      elTrash.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;padding:6px 4px">回收站是空的，放心～</p>';
      return;
    }
    elTrash.innerHTML = '';
    trash.forEach(function (it) {
      var left = Math.max(0, Math.ceil(((it.deletedAt || Date.now()) + TRASH_DAYS * 86400000 - Date.now()) / 86400000));
      var div = document.createElement('div');
      div.className = 'entry';
      var t = document.createElement('div'); t.className = 'entry-text'; t.textContent = it.entry.text;
      var time = document.createElement('div'); time.className = 'entry-time';
      time.textContent = fmtTime(it.entry.ts) + ' · ' + left + ' 天后自动清空';
      var restore = document.createElement('button'); restore.className = 'entry-restore'; restore.textContent = '♻️'; restore.setAttribute('aria-label', '恢复');
      restore.onclick = function () { restoreFromTrash(it.entry.id); };
      var erase = document.createElement('button'); erase.className = 'entry-del'; erase.textContent = '🗑'; erase.setAttribute('aria-label', '彻底删除');
      erase.onclick = function () { eraseFromTrash(it.entry.id); };
      div.appendChild(t); div.appendChild(time); div.appendChild(restore); div.appendChild(erase);
      elTrash.appendChild(div);
    });
  }
  function updateEntry(id, text) {
    text = (text || '').trim();
    if (!text) return false;
    var entries = getEntries(), found = null;
    for (var i = 0; i < entries.length; i++) { if (entries[i].id === id) { found = entries[i]; break; } }
    if (!found) return false;
    found.text = text;
    save(K_ENTRIES, entries);
    renderAll();
    return true;
  }
  function setSaveMode(editing) {
    $('btnSave').textContent = editing ? '保存修改 ✓' : '保存这条碎碎念';
    $('btnCancelEdit').hidden = !editing;
  }
  function startEdit(e) {
    if (listening) { wantListening = false; try { recog.stop(); } catch (x) {} }
    editingId = e.id;
    elInput.value = e.text;
    accumText = '';
    elLive.hidden = true; elLive.textContent = '';
    setSaveMode(true);
    elInput.focus();
    try { elInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (x) {}
    toast('正在修改这条，改完点保存 ✏️');
  }
  function cancelEdit() {
    editingId = null;
    elInput.value = '';
    accumText = '';
    elLive.hidden = true; elLive.textContent = '';
    setSaveMode(false);
  }
  function commitInput() {
    var text = elInput.value.trim();
    if (!text) {
      if (editingId) { cancelEdit(); toast('内容空了，已取消修改'); }
      else toast('先说点什么吧～');
      return;
    }
    if (editingId) {
      updateEntry(editingId, text);
      editingId = null;
      elInput.value = '';
      accumText = '';
      elLive.hidden = true; elLive.textContent = '';
      setSaveMode(false);
      toast('已修改 ✏️');
    } else {
      addEntry(text);
    }
  }

  function entriesOfDate(ds) {
    return getEntries().filter(function (e) { return dateStr(new Date(e.ts)) === ds; });
  }

  function renderEntries(container, list) {
    if (!list.length) {
      container.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;padding:6px 4px">还没有内容，去上面记一条吧 🌱</p>';
      return;
    }
    container.innerHTML = '';
    list.slice().reverse().forEach(function (e) {
      var div = document.createElement('div');
      div.className = 'entry';
      var t = document.createElement('div'); t.className = 'entry-text'; t.textContent = e.text;
      var time = document.createElement('div'); time.className = 'entry-time'; time.textContent = fmtTime(e.ts);
      var edit = document.createElement('button'); edit.className = 'entry-edit'; edit.textContent = '✏️'; edit.setAttribute('aria-label', '编辑');
      edit.onclick = function () { startEdit(e); };
      var del = document.createElement('button'); del.className = 'entry-del'; del.textContent = '🗑'; del.setAttribute('aria-label', '删除');
      del.onclick = function () { deleteEntry(e.id); };
      div.appendChild(t); div.appendChild(time); div.appendChild(edit); div.appendChild(del);
      container.appendChild(div);
    });
  }

  function renderAll() {
    var today = dateStr();
    renderEntries(elToday, entriesOfDate(today));
    elTodayCount.textContent = entriesOfDate(today).length + ' 条';
    renderEntries(elAll, getEntries());
    renderReports();
    renderTrash();
    checkBanner();
    checkBackupReminder();
  }

  function checkBackupReminder() {
    var entries = getEntries();
    if (!entries.length) { elBackupBanner.hidden = true; return; }
    var s = getSettings();
    var last = s.lastBackupAt ? new Date(s.lastBackupAt).getTime() : 0;
    var days = (Date.now() - last) / 86400000;
    elBackupBanner.hidden = days < 7;
  }

  /* ---------- 报告 ---------- */
  function unreportedDate() {
    // 返回最近一个「有记录、且还没生成报告」的过去日期
    var dates = {};
    getEntries().forEach(function (e) { dates[dateStr(new Date(e.ts))] = true; });
    var reported = {};
    getReports().forEach(function (r) { reported[r.date] = true; });
    var today = dateStr();
    var cursor = shiftDate(today, -1);
    for (var i = 0; i < 60; i++) {
      if (dates[cursor] && !reported[cursor]) return cursor;
      cursor = shiftDate(cursor, -1);
    }
    return null;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 把 DeepSeek 返回的「【板块】+内容」拆成结构化数组
  function parseReport(content) {
    var re = /【([^】]+)】/g, matches = [], m;
    while ((m = re.exec(content)) !== null) matches.push({ name: m[1], index: m.index });
    if (!matches.length) return null;
    return matches.map(function (mm, i) {
      var start = mm.index + mm.name.length + 2;
      var end = (i + 1 < matches.length) ? matches[i + 1].index : content.length;
      return { name: mm.name, body: content.slice(start, end).trim() };
    });
  }

  function reportType(name) {
    if (name.indexOf('关键词') >= 0) return 'keywords';
    if (name.indexOf('心情') >= 0) return 'mood';
    if (name.indexOf('收尾') >= 0) return 'closing';
    if (name.indexOf('小叮嘱') >= 0) return 'tips';
    if (name.indexOf('待办') >= 0) return 'todos';
    return 'text';
  }

  function splitItems(body) {
    return body.split('\n').map(function (l) { return l.replace(/^[\s·\-\*]+/, '').trim(); })
      .filter(function (l) { return l.length; });
  }

  // 渲染成杂志级排版
  function renderReportHTML(sections) {
    return sections.map(function (s, i) {
      var type = reportType(s.name);
      var idx = ('0' + (i + 1)).slice(-2);
      var inner = '';
      if (type === 'keywords') {
        var ks = s.body.split(/[、，,\s]+/).filter(function (k) { return k.length; });
        inner = '<div class="rp-pills">' + ks.map(function (k) {
          return '<span class="rp-pill">' + escapeHtml(k) + '</span>';
        }).join('') + '</div>';
      } else if (type === 'mood') {
        var lines = s.body.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
        var word = lines.shift() || '';
        var desc = lines.join(' ');
        inner = '<div class="rp-mood"><span class="rp-mood-word">' + escapeHtml(word) + '</span>' +
          (desc ? '<span class="rp-mood-desc">' + escapeHtml(desc) + '</span>' : '') + '</div>';
      } else if (type === 'closing') {
        inner = '<blockquote class="rp-closing">『' + escapeHtml(s.body) + '』</blockquote>';
      } else if (type === 'tips' || type === 'todos') {
        var items = splitItems(s.body).map(function (it) {
          var near = (it.indexOf('⏰') >= 0 || it.indexOf('临近') >= 0);
          var safe = escapeHtml(it).replace(/⏰/g, '<span class="rp-near-ic">⏰</span>');
          return '<li class="rp-item' + (near ? ' rp-near' : '') + '">' + safe + '</li>';
        }).join('');
        inner = '<ul class="rp-list">' + items + '</ul>';
      } else {
        var its = splitItems(s.body);
        if (its.length && s.body.indexOf('·') >= 0) {
          inner = '<ul class="rp-list">' + its.map(function (it) {
            return '<li class="rp-item">' + escapeHtml(it) + '</li>';
          }).join('') + '</ul>';
        } else {
          inner = '<p class="rp-text">' + escapeHtml(s.body) + '</p>';
        }
      }
      return '<section class="rp-sec rp-' + type + '">' +
        '<div class="rp-head"><span class="rp-idx">' + idx + '</span><span class="rp-name">' + escapeHtml(s.name) + '</span></div>' +
        inner + '</section>';
    }).join('');
  }

  function renderReports() {
    var reps = getReports();
    if (!reps.length) {
      elReports.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;padding:6px 4px">还没有回顾报告。第二天打开 App 时会提醒你生成 🌿</p>';
      return;
    }
    elReports.innerHTML = '';
    reps.slice().reverse().forEach(function (r) {
      var card = document.createElement('div'); card.className = 'report-card';
      var h = document.createElement('h4'); h.textContent = '📅 ' + r.date + ' 的回顾';
      var body = document.createElement('div'); body.className = 'report-body';
      var secs = parseReport(r.content);
      body.innerHTML = secs ? renderReportHTML(secs) : escapeHtml(r.content);
      var d = document.createElement('div'); d.className = 'report-date'; d.textContent = '生成于 ' + fmtTime(r.ts);
      card.appendChild(h); card.appendChild(body); card.appendChild(d);
      elReports.appendChild(card);
    });
  }

  function checkBanner() {
    var ds = unreportedDate();
    if (ds) {
      elBannerCount.textContent = entriesOfDate(ds).length;
      elBanner.hidden = false;
    } else {
      elBanner.hidden = true;
    }
  }

  function buildPrompt(ds) {
    var list = entriesOfDate(ds).map(function (e) { return '· ' + e.text; }).join('\n');
    return '你是一个温柔的生活记录助手，名字叫小巴。下面是一位用户在「' + ds + '」这一天里随口说出的碎碎念' +
      '（语音转文字，可能有口语、重复、错别字或不完整的句子）。请帮 ta 整理成一份温暖的「今日回顾」报告。\n\n' +
      '请严格按以下 9 个板块输出，每板块一行标题（带【】）：\n' +
      '1. 【今日关键词】用 3-6 个词提炼。\n' +
      '2. 【今天在想什么】归纳 2-4 条主题，每条一两句话。\n' +
      '3. 【心情基调】用两三个字判断（如平静 / 雀跃 / 焦虑 / 疲惫 / 温柔），并配一句说明。\n' +
      '4. 【碎碎念回顾】把零散的话串成一段通顺、有温度的小结，不要逐字照搬。\n' +
      '5. 【待办与临近提醒】从碎碎念里提取用户「将来要做的事」，尽量带上时间；若某件事时间临近（如明天 / 近几天），在后面标「⏰ 临近」。若当天没有待办，写「今天没有留下的待办～」。\n' +
      '6. 【给依依的小叮嘱】根据内容，用朋友轻轻提醒的口吻写 1-3 条关爱提醒（如累了提醒早点睡、别太拼、记得吃饭喝水）。温柔，不要说教。\n' +
      '7. 【今日小确幸】提炼当天 1-2 个最温暖、最治愈的小瞬间（像晒到太阳、和狗狗玩）。没有就写「今天平平淡淡，也很好」。\n' +
      '8. 【未完成的牵挂】记下用户想做还没做、或挂念的人 / 事，帮 ta 记着、留到以后。没有就写「今天心里很轻，没什么放不下的」。\n' +
      '9. 【一句收尾】给一句温柔的、像朋友说的话作为结尾。\n\n' +
      '整体语言轻松温暖，像在轻声读 ta 的日记。小叮嘱和提醒用关心的口吻，不要生硬说教、不要给压力。\n\n' +
      '今日碎碎念：\n' + list;
  }

  function callDeepSeek(prompt, apiKey) {
    return fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        stream: false
      })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('API ' + r.status + ': ' + t); });
      return r.json();
    }).then(function (d) {
      if (!d.choices || !d.choices[0]) throw new Error('返回格式异常');
      return d.choices[0].message.content.trim();
    });
  }

  function generateReport() {
    var ds = unreportedDate();
    if (!ds) { toast('没有待生成的回顾啦～'); return; }
    var settings = getSettings();
    if (!settings.apiKey) {
      toast('还没填 API Key，去设置里填一下，或用「复制给小巴」');
      openSettings();
      return;
    }
    toast('正在整理' + ds + '的碎碎念…');
    callDeepSeek(buildPrompt(ds), settings.apiKey)
      .then(function (content) {
        var reps = getReports();
        reps.push({ date: ds, ts: new Date().toISOString(), content: content });
        save(K_REPORTS, reps);
        renderAll();
        switchTab('report');
        toast('今日回顾已生成 🌿');
      })
      .catch(function (err) {
        console.error(err);
        toast('生成失败：可能是网络或 Key 问题。可点「复制给小巴」让我来写');
      });
  }

  /* ---------- 语音识别 ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, listening = false, wantListening = false, accumText = '';

  function setupSpeech() {
    if (!SR) {
      $('captureHint').textContent = '当前浏览器不支持语音识别，用文本框+键盘麦克风也能说（iPhone 自带）';
      return;
    }
    recog = new SR();
    recog.lang = 'zh-CN';
    recog.interimResults = true;
    recog.continuous = true; // 连续识别：一句话后不自动停

    recog.onresult = function (ev) {
      var current = '';
      for (var i = 0; i < ev.results.length; i++) current += ev.results[i][0].transcript;
      elLive.hidden = false;
      elInput.value = accumText + current; // 累积上一段 + 本段，续录不丢
      elLive.textContent = elInput.value;
    };
    recog.onerror = function (ev) {
      console.warn('speech error', ev.error);
      if (ev.error === 'not-allowed') { wantListening = false; toast('需要允许使用麦克风哦'); }
      // no-speech / network 等交给 onend 决定要不要续录，这里不打扰用户
    };
    recog.onend = function () {
      if (wantListening) {
        // 系统把录音掐断了（iOS 约 60 秒或静音会触发），累积已识别内容并自动续录
        accumText = (elInput.value || '').trim();
        if (accumText) accumText += ' ';
        setTimeout(function () {
          try { recog.start(); }
          catch (e) { try { recog.start(); } catch (e2) { stopAndSave(); } }
        }, 120);
      } else {
        stopAndSave();
      }
    };
  }

  // 停止并把当前没保存的内容自动存成一条碎碎念
  function stopAndSave() {
    wantListening = false;
    setListening(false);
    autoSaveDraft();
  }

  function autoSaveDraft() {
    if (editingId) return; // 编辑模式下不自动存，避免新增重复条
    if (saveEntry(elInput.value)) toast('已自动保存刚才的碎碎念 ✨');
  }

  function setListening(on) {
    listening = on;
    elMic.classList.toggle('listening', on);
    $('captureHint').textContent = on ? '正在听…再点一下麦克风就自动保存' : '点麦克风开始说，会一直听，再点一下自动保存';
  }

  function toggleMic() {
    if (!recog) { toast('这个浏览器不支持语音，用键盘麦克风说话吧'); return; }
    if (listening) { wantListening = false; recog.stop(); return; } // 停止 → onend 里自动保存
    if (editingId) cancelEdit(); // 编辑中开新录音则放弃编辑
    // 开始前，若文本框里还有没保存的内容，先自动存为一条，避免丢
    if (elInput.value.trim()) saveEntry(elInput.value);
    accumText = '';
    wantListening = true;
    try { recog.start(); setListening(true); }
    catch (e) { try { recog.start(); setListening(true); } catch (e2) {} }
  }

  /* ---------- Tab ---------- */
  function switchTab(name) {
    ['capture', 'all', 'trash', 'report'].forEach(function (n) {
      $('screen' + n.charAt(0).toUpperCase() + n.slice(1)).hidden = (n !== name);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
  }

  /* ---------- 设置 ---------- */
  function openSettings() {
    var s = getSettings();
    $('inputApiKey').value = s.apiKey || '';
    $('inputNotifyTime').value = s.notifyTime || '09:00';
    $('settingsMask').hidden = false;
  }
  function closeSettings() {
    $('settingsMask').hidden = true;
    var s = getSettings();
    s.apiKey = $('inputApiKey').value.trim();
    s.notifyTime = $('inputNotifyTime').value;
    setSettings(s);
    toast('已保存');
  }
  function exportToXiaoba() {
    var entries = getEntries();
    if (!entries.length) { toast('还没有内容可复制'); return; }
    var text = '小巴，帮我把这些碎碎念整理成一份温暖的今日回顾报告：\n\n';
    entries.slice().reverse().forEach(function (e) {
      text += '【' + fmtTime(e.ts) + '】' + e.text + '\n';
    });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制，去发给小巴吧 🐾'); },
        function () { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('已复制，去发给小巴吧 🐾'); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }
  function clearAll() {
    if (confirm('确定清空所有碎碎念和报告吗？此操作无法恢复。')) {
      save(K_ENTRIES, []); save(K_REPORTS, []); setTrash([]);
      renderAll(); toast('已清空');
    }
  }

  /* ---------- 备份 / 恢复 ---------- */
  function exportBackupFile() {
    var data = {
      app: 'murmur', version: 1,
      entries: getEntries(), reports: getReports(), settings: getSettings(),
      exportedAt: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '碎碎念备份_' + dateStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    var s = getSettings(); s.lastBackupAt = new Date().toISOString(); setSettings(s);
    checkBackupReminder();
    toast('备份文件已生成，存到「文件」App 最保险 📦');
  }
  function importBackupFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (Array.isArray(data.entries)) save(K_ENTRIES, data.entries);
        if (Array.isArray(data.reports)) save(K_REPORTS, data.reports);
        if (data.settings) save(K_SETTINGS, data.settings);
        renderAll();
        toast('已从备份恢复，共 ' + (data.entries ? data.entries.length : 0) + ' 条碎碎念 ✅');
      } catch (e) {
        toast('这个文件读不懂，恢复失败');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 通知 ---------- */
  function askNotify() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(function () {});
    }
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    elMic.onclick = toggleMic;
    $('btnEmptyTrash').onclick = emptyTrash;
    $('btnSave').onclick = commitInput;
    $('btnCancelEdit').onclick = cancelEdit;
    $('btnSettings').onclick = openSettings;
    $('btnCloseSettings').onclick = closeSettings;
    $('btnExport').onclick = exportToXiaoba;
    $('btnClearAll').onclick = clearAll;
    $('btnExportFile').onclick = exportBackupFile;
    $('btnImportFile').onclick = function () { $('fileImport').click(); };
    $('btnBackupNow').onclick = openSettings;
    $('fileImport').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) { if (confirm('恢复备份会覆盖现有数据，确定继续？')) importBackupFile(f); }
      e.target.value = '';
    };
    $('btnGenReport').onclick = generateReport;
    $('btnGenFromBanner').onclick = generateReport;
    $('settingsMask').onclick = function (e) { if (e.target === this) closeSettings(); };
    document.querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () { switchTab(t.getAttribute('data-tab')); };
    });
    if (elInput.setSelectionRange) {
      elInput.addEventListener('focus', function () { setTimeout(function () { elInput.setSelectionRange(elInput.value.length, elInput.value.length); }, 50); });
    }
  }

  /* ---------- 启动 ---------- */
  function init() {
    setupSpeech();
    bind();
    purgeExpiredTrash();
    renderAll();
    askNotify();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
