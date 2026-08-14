/* 碎碎念 · 语音日记 —— 纯前端 PWA，数据只存在你本地手机里 */
(function () {
  'use strict';

  var K_ENTRIES = 'murmur_entries';
  var K_REPORTS = 'murmur_reports';
  var K_SETTINGS = 'murmur_settings';

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
    return Object.assign({ apiKey: '', notifyTime: '09:00' }, load(K_SETTINGS, {}));
  }
  function setSettings(s) { save(K_SETTINGS, s); }

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
  var elToday = $('todayEntries'), elAll = $('allEntries'), elReports = $('reportList');
  var elTodayCount = $('todayCount'), elBanner = $('reportBanner'), elBannerCount = $('bannerCount');
  var elToast = $('toast');

  var toastTimer;
  function toast(msg) {
    elToast.textContent = msg;
    elToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.hidden = true; }, 2600);
  }

  /* ---------- 条目 ---------- */
  function addEntry(text) {
    text = (text || '').trim();
    if (!text) { toast('先说点什么吧～'); return; }
    var entries = getEntries();
    entries.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 7), text: text, ts: new Date().toISOString() });
    save(K_ENTRIES, entries);
    elInput.value = '';
    elLive.hidden = true; elLive.textContent = '';
    renderAll();
    toast('已记下 ✨');
  }
  function deleteEntry(id) {
    var entries = getEntries().filter(function (e) { return e.id !== id; });
    save(K_ENTRIES, entries);
    renderAll();
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
      var del = document.createElement('button'); del.className = 'entry-del'; del.textContent = '🗑'; del.setAttribute('aria-label', '删除');
      del.onclick = function () { deleteEntry(e.id); };
      div.appendChild(t); div.appendChild(time); div.appendChild(del);
      container.appendChild(div);
    });
  }

  function renderAll() {
    var today = dateStr();
    renderEntries(elToday, entriesOfDate(today));
    elTodayCount.textContent = entriesOfDate(today).length + ' 条';
    renderEntries(elAll, getEntries());
    renderReports();
    checkBanner();
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
      var body = document.createElement('div'); body.className = 'report-body'; body.textContent = r.content;
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
    return '你是一个温柔的生活记录助手。下面是一位用户在「' + ds + '」这一天里随口说出的碎碎念' +
      '（语音转文字，可能有口语、重复、错别字或不完整的句子）。请帮 ta 整理成一份温暖的「今日回顾」报告。\n\n' +
      '要求：\n' +
      '1. 【今日关键词】用 3-6 个词提炼。\n' +
      '2. 【今天在想什么】归纳 2-4 条主题，每条一两句话。\n' +
      '3. 【心情基调】用两三个字判断（如平静 / 雀跃 / 焦虑 / 疲惫 / 温柔），并配一句说明。\n' +
      '4. 【碎碎念回顾】把零散的话串成一段通顺、有温度的小结，不要逐字照搬。\n' +
      '5. 【一句收尾】给一句温柔的、像朋友说的话作为结尾。\n\n' +
      '语言轻松温暖，像在轻声读 ta 的日记。不要说教、不要给建议。\n\n' +
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
  var recog = null, listening = false;

  function setupSpeech() {
    if (!SR) {
      $('captureHint').textContent = '当前浏览器不支持语音识别，用文本框+键盘麦克风也能说（iPhone 自带）';
      return;
    }
    recog = new SR();
    recog.lang = 'zh-CN';
    recog.interimResults = true;
    recog.continuous = false;

    recog.onresult = function (ev) {
      var txt = '';
      for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
      elLive.hidden = false;
      elLive.textContent = txt;
      elInput.value = txt;
    };
    recog.onerror = function (ev) {
      console.warn('speech error', ev.error);
      if (ev.error === 'not-allowed') toast('需要允许使用麦克风哦');
    };
    recog.onend = function () { setListening(false); };
  }

  function setListening(on) {
    listening = on;
    elMic.classList.toggle('listening', on);
    $('captureHint').textContent = on ? '正在听…说完点一下麦克风停止' : '想说什么，按住说话，或点麦克风开始';
  }

  function toggleMic() {
    if (!recog) { toast('这个浏览器不支持语音，用键盘麦克风说话吧'); return; }
    if (listening) { recog.stop(); return; }
    try { recog.start(); setListening(true); }
    catch (e) { /* iOS 有时需重试 */ recog.start(); }
  }

  /* ---------- Tab ---------- */
  function switchTab(name) {
    ['capture', 'all', 'report'].forEach(function (n) {
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
      save(K_ENTRIES, []); save(K_REPORTS, []);
      renderAll(); toast('已清空');
    }
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
    $('btnSave').onclick = function () { addEntry(elInput.value); };
    $('btnSettings').onclick = openSettings;
    $('btnCloseSettings').onclick = closeSettings;
    $('btnExport').onclick = exportToXiaoba;
    $('btnClearAll').onclick = clearAll;
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
    renderAll();
    askNotify();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
