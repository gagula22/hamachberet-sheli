(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // P-93 · סיכום מיילים (Gmail) — אחריות עצמאית, בלי Claude ובלי שרת.
  // כרטיס בלוח הבקרה (window.DASHBOARD_WIDGETS): לחיצה → שאלת טווח → סיכום
  // טבלה (לחיצה על שורה פותחת חלונית) → שליחה למייל של המשתמש עצמו →
  // רשימת ספאם ממוספרת עם כפתור "העבר לפח" (אחרי אישור נוסף).
  // התחברות: Google Identity Services (token client) בדפדפן בלבד. הטוקן חי
  // בזיכרון הדף ולא נשמר. נשמר רק ה-Client ID (לא סוד) ב-localStorage.
  // סיווג: כללים קבועים (classify) — אותם כללים של הסקיל gmail-topic-summary.
  // מחיקה = threads.trash בלבד (ניתן לשחזור כ-30 יום). אין מחיקה לצמיתות.
  // ─────────────────────────────────────────────────────────────────────────

  var SELF = 'gagula22@gmail.com';
  var SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';
  var API = 'https://gmail.googleapis.com/gmail/v1/users/me/';
  var LS_ID = 'emailSummary.clientId';
  // Client ID ציבורי (לא סוד) של אפליקציית ה-OAuth של המשתמש; ניתן לדרוס דרך localStorage.
  var DEFAULT_CLIENT_ID = '360506076697-4clpne30mkl4rj3s6q2qtej29mban19q.apps.googleusercontent.com';
  var MAX_MSGS_PER_TAB = 600;

  var CAT = { bank: 'התראות בנקאיות ומסחר', order: 'הזמנות ומשלוחים', job: 'התראות עבודה',
    news: 'ניוזלטרים מקצועיים', upd: 'עדכונים', pers: 'אישי ואבטחה', spam: 'ספאם' };

  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function getClientId() { try { return localStorage.getItem(LS_ID) || (window.EMAIL_SUMMARY_CONFIG || {}).CLIENT_ID || DEFAULT_CLIENT_ID; } catch (e) { return ''; } }
  function setClientId(v) { try { localStorage.setItem(LS_ID, v); } catch (e) { /* ignore */ } }

  // ── התחברות ──────────────────────────────────────────────────────────────
  var token = null, tokenExp = 0, gisPromise = null, tokenClient = null;

  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { gisPromise = null; rej(new Error('טעינת ספריית ההתחברות של Google נכשלה (אולי חסימת רשת).')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  var pendingSign = null;
  function signIn() {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    if (pendingSign) return pendingSign;
    pendingSign = signIn0().then(function (t) { pendingSign = null; return t; }, function (e) { pendingSign = null; throw e; });
    return pendingSign;
  }
  function signIn0() {
    var cid = getClientId();
    if (!cid) return Promise.reject(new Error('חסר Client ID. הוסף אותו בכרטיס.'));
    return loadGis().then(function () {
      return new Promise(function (res, rej) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: cid, scope: SCOPE,
          callback: function (r) {
            if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; res(token); }
            else rej(new Error('ההתחברות נכשלה או בוטלה' + (r && r.error ? ' (' + r.error + ')' : '') + '.'));
          },
          error_callback: function (e) { rej(new Error('ההתחברות בוטלה' + (e && e.type ? ' (' + e.type + ')' : '') + '.')); }
        });
        tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
      });
    });
  }

  function api(path, opts, retry) {
    opts = opts || {};
    return signIn().then(function (tk) {
      var h = { Authorization: 'Bearer ' + tk };
      if (opts.body) h['Content-Type'] = 'application/json';
      return fetch(API + path, { method: opts.method || 'GET', headers: h, body: opts.body });
    }).then(function (r) {
      if (r.status === 401) { token = null; if (!retry) return api(path, opts, true); }
      if (r.status === 429 || r.status >= 500) {
        if ((retry || 0) < 3) return sleep(800 * ((retry || 0) + 1)).then(function () { return api(path, opts, (retry || 0) + 1); });
      }
      if (!r.ok) return r.text().then(function (t) { throw new Error('Gmail ' + r.status + ': ' + t.slice(0, 160)); });
      return r.status === 204 ? {} : r.json();
    });
  }

  // ── שליפה ────────────────────────────────────────────────────────────────
  function listIds(q, cap) {
    var ids = [], tok = '';
    function page() {
      return api('messages?maxResults=100&q=' + encodeURIComponent(q) + (tok ? '&pageToken=' + tok : '')).then(function (r) {
        (r.messages || []).forEach(function (m) { ids.push(m.id); });
        tok = r.nextPageToken;
        if (tok && ids.length < cap) return page();
        return { ids: ids.slice(0, cap), truncated: !!tok };
      });
    }
    return page();
  }

  function getMeta(id) {
    return api('messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe').then(function (m) {
      var h = {};
      ((m.payload && m.payload.headers) || []).forEach(function (x) { h[x.name.toLowerCase()] = x.value; });
      return { id: m.id, threadId: m.threadId, labels: m.labelIds || [], from: h.from || '', subject: maskNums(h.subject || '(ללא נושא)'),
        ts: +m.internalDate || Date.parse(h.date) || 0, snippet: m.snippet || '', bulk: !!h['list-unsubscribe'] };
    });
  }

  function pool(items, n, fn) {
    var i = 0, out = [];
    function worker() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return fn(items[k], k).then(function (v) { out[k] = v; }, function () { out[k] = null; }).then(worker);
    }
    var ws = []; for (var j = 0; j < n; j++) ws.push(worker());
    return Promise.all(ws).then(function () { return out; });
  }

  // ── סיווג (כללים קבועים) ────────────────────────────────────────────────
  function senderName(from) {
    var m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from);
    var name = m ? m[1].trim() : '';
    var mail = m ? m[2] : from.trim();
    name = name.replace(/\\/g, '').replace(/"/g, '').trim();
    if (!name || name.length > 36) name = mail.split('@')[1] || mail;
    return { name: name, mail: mail.toLowerCase() };
  }

  function classify(m, tab) {
    var s = senderName(m.from), f = (s.name + ' ' + s.mail).toLowerCase(), sub = m.subject;
    var promo = tab === 'promotions' || m.labels.indexOf('CATEGORY_PROMOTIONS') >= 0;
    var adSub = /פרסומת|מבצע|הנחה|% off|sale|deal|coupon|קופון/i.test(sub);
    // מוגנים: אישי, יומן, אבטחה
    if (m.labels.indexOf('SENT') >= 0 || s.mail === SELF) return 'pers';
    if (/calendar-notification@google|calendar\.google/.test(s.mail)) return 'pers';
    if (/new device|new ip|security alert|sign-in|signed in|login|התחברות|מכשיר חדש|הרשאות|permissions|verify|אימות|נכנסה לחשבון/i.test(sub) &&
        /github|google|accounts|families/i.test(f)) return 'pers';
    // חשבונות פיננסיים/ביטוח/תרומות: מוגנים
    if (/harel|הראל|phoenix|הפניקס|ביטוח ישיר|direct|אור יצחק|lis-noreply@google/i.test(f)) return 'pers';
    // אישורי הגשת מועמדות
    if (/thanks for applying|position you applied|you applied|הגשת מועמדות|קורות החיים/i.test(sub)) return 'job';
    // הקטגוריות שנבחרו
    if (/glassnode|rekt capital|wyckoff|hebrex|cryptojungle|crypto jungle/i.test(f)) return 'news';
    if (/jobalerts|jobs-listings|linkedin job|indeed|jobnet|challenge|jobs2web|googlealerts|google alerts/i.test(f) ||
        (/linkedin/.test(f) && /משרה|jobs?|מנהל|hiring|alert/i.test(sub) && !/צפה|viewed/i.test(sub))) return 'job';
    if (/temu|aliexpress|amazon|ebay|shein|israel post|דואר ישראל|cheetah|wallashops/i.test(f) && !adSub && !promo &&
        /הזמנה|משלוח|order|ship|deliver|tracking|חבילה|package/i.test(sub)) return 'order';
    if (/tradingview/.test(f)) return 'bank';
    if (/mexc/.test(f) && !promo && !/realstocks|promo|reward|bonus|airdrop/i.test(sub)) return 'bank';
    if (/leumi|hapoalim|discount|mizrahi|isracard|bank|בנק|ישראכרט|מקס|cal-online|כאל|ביט\b|paybox/i.test(f) && !adSub && !promo) return 'bank';
    // עדכונים שהמשתמש בחר לשמור
    if (/coingecko|binance|ffa|cryptocrew|ogen|tumblr/i.test(f) || (/linkedin/.test(f)) || (/okx|mexc/.test(f) && !promo)) return 'upd';
    // אישי: מאדם אמיתי (לא רשימת תפוצה, לא noreply)
    if (!m.bulk && !/no-?reply|noreply|donotreply|newsletter|mailer|notifications?@/i.test(s.mail) && !promo &&
        m.labels.indexOf('CATEGORY_PROMOTIONS') < 0 && m.labels.indexOf('CATEGORY_UPDATES') < 0 &&
        m.labels.indexOf('CATEGORY_SOCIAL') < 0) return 'pers';
    return 'spam';
  }

  var ATTN = [
    [/new device|new ip|מכשיר חדש|login|התחברות/i, 'כניסה ממכשיר או IP חדש'],
    [/triggered|stop.?loss|\bSL\b|liquidat|margin call|הנזלה/i, 'פקודה או התראה על פוזיציה'],
    [/permission|הרשאות|security alert|התראת אבטחה/i, 'בקשת הרשאות או התראת אבטחה'],
    [/מסתיים|expires|expir|פג תוקף|חידוש/i, 'תוקף שמסתיים'],
    [/השלמת מסמכים|documents required|action required|נדרשת פעולה/i, 'נדרשת פעולה ממך']
  ];
  function attention(m, cat) {
    if (cat === 'spam' || cat === 'job' || cat === 'news') return '';
    for (var i = 0; i < ATTN.length; i++) if (ATTN[i][0].test(m.subject)) return ATTN[i][1];
    return '';
  }
  function maskNums(t) { return String(t).replace(/\d{5,}/g, '•••'); }
  function maskSnippet(t) {
    return (t || '').replace(/\d{5,}/g, '•••').replace(/\s+/g, ' ').trim().slice(0, 110);
  }

  // ── הפקה ─────────────────────────────────────────────────────────────────
  function buildSummary(rangeDays, rangeLabel, onProg) {
    var after = Math.floor((Date.now() - rangeDays * 86400000) / 1000);
    var tabs = ['primary', 'updates', 'promotions', 'social'];
    var perTab = {}, seen = {}, all = [], notScanned = [];
    function next(i) {
      if (i >= tabs.length) return Promise.resolve();
      var t = tabs[i];
      onProg('סורק ' + { primary: 'דואר נכנס', updates: 'עדכונים', promotions: 'פרסומות', social: 'חברתי' }[t] + '...');
      return listIds('category:' + t + ' after:' + after + ' -in:trash -in:spam', MAX_MSGS_PER_TAB).then(function (r) {
        if (r.truncated) notScanned.push({ primary: 'דואר נכנס', updates: 'עדכונים', promotions: 'פרסומות', social: 'חברתי' }[t]);
        var fresh = r.ids.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; });
        perTab[t] = { total: r.ids.length };
        var done = 0;
        return pool(fresh, 8, function (id) { return getMeta(id).then(function (m) { done++; if (done % 20 === 0) onProg('קורא מיילים (' + t + '): ' + done + '/' + fresh.length); m.tab = t; return m; }); })
          .then(function (ms) { ms.forEach(function (m) { if (m) all.push(m); }); });
      }).then(function () { return next(i + 1); });
    }
    return next(0).then(function () {
      var threads = {};
      all.forEach(function (m) {
        m.cat = classify(m, m.tab);
        var t = threads[m.threadId];
        if (!t) threads[m.threadId] = t = { id: m.threadId, msgs: [], tab: m.tab };
        t.msgs.push(m);
      });
      var rows = [], spamT = [];
      Object.keys(threads).forEach(function (k) {
        var t = threads[k];
        t.msgs.sort(function (a, b) { return b.ts - a.ts; });
        var keep = t.msgs.filter(function (m) { return m.cat !== 'spam'; })[0];
        var starred = t.msgs.some(function (m) { return m.labels.indexOf('STARRED') >= 0; });
        if (keep || starred) {
          var m = keep || t.msgs[0];
          rows.push({ threadId: t.id, cat: keep ? keep.cat : 'pers', sender: senderName(m.from).name, subject: m.subject, ts: m.ts,
            box: ({ primary: 'דואר נכנס', updates: 'עדכונים', promotions: 'פרסומות', social: 'חברתי' })[t.tab], snippet: maskSnippet(m.snippet),
            attn: attention(m, keep ? keep.cat : 'pers') });
        } else spamT.push({ threadId: t.id, sender: senderName(t.msgs[0].from).name, subject: t.msgs[0].subject });
      });
      rows.sort(function (a, b) { return (b.attn ? 1 : 0) - (a.attn ? 1 : 0) || b.ts - a.ts; });
      var g = {};
      spamT.forEach(function (s) { var k = s.sender.toLowerCase(); (g[k] = g[k] || { sender: s.sender, ids: [], example: s.subject }).ids.push(s.threadId); });
      var groups = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.ids.length - a.ids.length; });
      return { rows: rows, groups: groups, counts: perTab, notScanned: notScanned, rangeLabel: rangeLabel, after: after, scanned: all.length };
    });
  }

  // ── מייל ─────────────────────────────────────────────────────────────────
  function u8b64(str) {
    var bytes = new TextEncoder().encode(str), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmt(ts) { var d = new Date(ts); return d.getDate() + '.' + (d.getMonth() + 1) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function gmailLink(id) { return 'https://mail.google.com/mail/u/0/#all/' + id; }

  function emailBodies(S) {
    var att = S.rows.filter(function (r) { return r.attn; }).slice(0, 5);
    var byCat = {};
    S.rows.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + 1; });
    var txt = ['סיכום מיילים: ' + S.rangeLabel, 'נסרקו ' + S.scanned + ' מיילים.'];
    if (S.notScanned.length) txt.push('לא נסרק במלואו: ' + S.notScanned.join(', ') + ' (מגבלת ' + MAX_MSGS_PER_TAB + ' לכל לשונית).');
    txt.push('', 'דורש תשומת לב:');
    if (!att.length) txt.push('אין.');
    att.forEach(function (r, i) { txt.push((i + 1) + '. ' + r.sender + ': ' + r.subject + ' (' + r.attn + ')'); });
    txt.push('', 'לפי קטגוריה:');
    Object.keys(CAT).forEach(function (k) { if (k !== 'spam' && byCat[k]) txt.push(CAT[k] + ': ' + byCat[k]); });
    txt.push('', 'לפתיחת הסיכום האינטראקטיבי (חלונית לכל מייל + בחירה למחיקת ספאם): ' + SITE_URL + ' ואז "פתח את הסיכום האחרון" (באותו דפדפן שבו הופק).', '', 'ספאם ופרסומות (לא נמחק כלום; המחיקה נעשית באתר):');
    S.groups.forEach(function (g, i) { txt.push((i + 1) + '. ' + g.sender + ', ' + g.ids.length + ' | ' + g.example); });

    var td = 'style="border:1px solid #ccc;padding:3px 7px;text-align:right"';
    var h = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px"><h2>סיכום מיילים: ' + esc(S.rangeLabel) + '</h2><p>הדף האינטראקטיבי: <a href="' + SITE_URL + '">פתח את הסיכום (חלונית לכל מייל + מחיקת ספאם)</a></p><p>נסרקו ' + S.scanned + ' מיילים.' +
      (S.notScanned.length ? ' לא נסרק במלואו: ' + esc(S.notScanned.join(', ')) + '.' : '') + '</p>';
    h += '<h3>דורש תשומת לב</h3>' + (att.length ? '<ol>' + att.map(function (r) { return '<li>' + esc(r.sender) + ': ' + esc(r.subject) + ' (' + esc(r.attn) + ')</li>'; }).join('') + '</ol>' : '<p>אין.</p>');
    h += '<table style="border-collapse:collapse;font-size:13px"><tr>' + ['קטגוריה', 'שולח', 'נושא', 'תאריך', 'במשפט אחד', 'מייל'].map(function (x) { return '<th ' + td + '>' + x + '</th>'; }).join('') + '</tr>';
    S.rows.forEach(function (r) {
      h += '<tr' + (r.attn ? ' style="background:#fbeadb"' : '') + '><td ' + td + '>' + esc(CAT[r.cat]) + '</td><td ' + td + '>' + esc(r.sender) + '</td><td ' + td + '>' + esc(r.subject) +
        '</td><td ' + td + '>' + fmt(r.ts) + '</td><td ' + td + '>' + esc(r.snippet || '') + '</td><td ' + td + '><a href="' + gmailLink(r.threadId) + '">פתח</a></td></tr>';
    });
    h += '</table><h3>ספאם ופרסומות</h3><table style="border-collapse:collapse;font-size:13px"><tr><th ' + td + '>#</th><th ' + td + '>שולח</th><th ' + td + '>כמה</th><th ' + td + '>נושא לדוגמה</th></tr>';
    S.groups.forEach(function (g, i) { h += '<tr><td ' + td + '>' + (i + 1) + '</td><td ' + td + '>' + esc(g.sender) + '</td><td ' + td + '>' + g.ids.length + '</td><td ' + td + '>' + esc(g.example) + '</td></tr>'; });
    h += '</table><p><b>למחוק את אלה? ענה בשיחה / בחר באתר: הכל / מספרים מסוימים / לא</b><br>בדף האינטראקטיבי יש תיבות סימון וכפתור העברה לפח. לא נמחק כלום עד אישור שלך.</p></div>';
    return { text: txt.join('\n'), html: h };
  }

  var SITE_URL = 'https://gagula22.github.io/hamachberet-sheli/?es=last#/dashboard';
  var LS_LAST = 'emailSummary.last';
  function saveLast(S) { try { localStorage.setItem(LS_LAST, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function loadLast() { try { var v = localStorage.getItem(LS_LAST); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function sendToSelf(S) {
    var b = emailBodies(S), bd = 'b' + Date.now().toString(36);
    var subject = 'סיכום מיילים: ' + S.rangeLabel;
    var raw = ['To: ' + SELF, 'Subject: =?UTF-8?B?' + u8b64(subject) + '?=', 'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + bd + '"', '',
      '--' + bd, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', u8b64(b.text),
      '--' + bd, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', u8b64(b.html),
      '--' + bd + '--', ''].join('\r\n');
    var enc = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return api('messages/send', { method: 'POST', body: JSON.stringify({ raw: enc }) });
  }

  // ── ממשק ─────────────────────────────────────────────────────────────────
  var overlay = null;
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; document.removeEventListener('keydown', onKey); } }
  function onKey(e) { if (e.key === 'Escape') { var top = document.querySelector('.es-overlay:last-of-type'); if (top) top.remove(); if (!document.querySelector('.es-overlay')) { overlay = null; document.removeEventListener('keydown', onKey); } } }
  function openOverlay(title, wide) {
    var body = el('div', { class: 'es-body' });
    var box = el('div', { class: 'es-modal' + (wide ? ' es-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }, [
      el('button', { class: 'es-x', 'aria-label': 'סגור', onClick: function () { ov.remove(); if (!document.querySelector('.es-overlay')) { overlay = null; document.removeEventListener('keydown', onKey); } } }, '✕'),
      el('h3', {}, title), body]);
    var ov = el('div', { class: 'es-overlay', onClick: function (e) { if (e.target === ov) { ov.remove(); if (!document.querySelector('.es-overlay')) { overlay = null; document.removeEventListener('keydown', onKey); } } } }, [box]);
    document.body.appendChild(ov);
    overlay = ov; document.addEventListener('keydown', onKey); box.focus();
    return { body: body, close: function () { ov.remove(); } };
  }

  function askRange() {
    var m = openOverlay('סיכום מיילים: איזה טווח?');
    var sel = { days: 7, label: '7 ימים אחרונים' };
    var opts = [[1, '24 שעות אחרונות'], [7, '7 ימים אחרונים'], [30, '30 ימים אחרונים']];
    var row = el('div', { class: 'es-chips' });
    var custom = el('input', { type: 'number', min: '1', max: '90', placeholder: 'מספר ימים', class: 'es-num', id: 'es-days', 'aria-label': 'מספר ימים' });
    function mark() { Array.prototype.forEach.call(row.children, function (c) { c.classList.toggle('on', c.dataset.d === String(sel.days) && !custom.value); }); }
    opts.forEach(function (o) {
      row.appendChild(el('button', { class: 'es-chip', 'data-d': String(o[0]), type: 'button', onClick: function () { custom.value = ''; sel = { days: o[0], label: o[1] }; mark(); } }, o[1]));
    });
    var go = el('button', { class: 'btn', type: 'button', onClick: function () {
      if (custom.value) { var n = Math.max(1, Math.min(90, +custom.value || 7)); sel = { days: n, label: n + ' ימים אחרונים' }; }
      m.close(); run(sel);
    } }, 'הפק סיכום ושלח למייל');
    m.body.append(row, el('div', { class: 'es-row' }, [el('span', {}, 'או מספר ימים:'), custom]), go,
      el('p', { class: 'es-note' }, 'הסיכום נשלח רק לכתובת ' + SELF + '. בלי אישור שלך כאן לא נמחק כלום.'));
    mark();
  }

  function run(sel) {
    var m = openOverlay('סיכום מיילים: ' + sel.label, true);
    var status = el('p', { class: 'es-status', role: 'status' }, 'מתחבר ל-Gmail...');
    m.body.append(status);
    buildSummary(sel.days, sel.label, function (t) { status.textContent = t; }).then(function (S) {
      saveLast(S);
      status.textContent = 'שולח את הסיכום למייל...';
      renderSummary(m.body, S, status);
      return sendToSelf(S).then(function () { status.textContent = 'הסיכום נשלח אל ' + SELF + '.'; })
        .catch(function (e) { status.textContent = 'הסיכום מוכן אבל השליחה נכשלה: ' + e.message; });
    }).catch(function (e) { status.textContent = 'נכשל: ' + e.message; });
  }

  function renderSummary(body, S, status) {
    var att = S.rows.filter(function (r) { return r.attn; }).slice(0, 5);
    body.textContent = '';
    body.appendChild(status);
    var counts = Object.keys(S.counts).length ? 'נסרקו ' + S.scanned + ' מיילים' + (S.notScanned.length ? ' (לא נסרק במלואו: ' + S.notScanned.join(', ') + ')' : '') : '';
    body.appendChild(el('p', { class: 'es-note' }, counts));
    body.appendChild(el('div', { class: 'es-attn' }, [el('strong', {}, 'דורש תשומת לב')].concat(att.length ?
      [el('ol', {}, att.map(function (r) { return el('li', {}, r.sender + ': ' + r.subject + ' (' + r.attn + ')'); }))] : [el('div', {}, 'אין.')])));

    var fcat = el('select', { id: 'es-fcat', 'aria-label': 'סינון לפי קטגוריה' }, [el('option', { value: '' }, 'כל הקטגוריות')].concat(
      Object.keys(CAT).filter(function (k) { return k !== 'spam'; }).map(function (k) { return el('option', { value: k }, CAT[k]); })));
    var tb = el('tbody');
    var th = el('thead', {}, [el('tr', {}, ['קטגוריה', 'שולח', 'נושא', 'תאריך', 'תיבה', 'במשפט אחד'].map(function (x) { return el('th', {}, x); }))]);
    function draw() {
      tb.textContent = '';
      S.rows.filter(function (r) { return !fcat.value || r.cat === fcat.value; }).forEach(function (r) {
        var tr = el('tr', { class: 'es-row-click' + (r.attn ? ' attn' : ''), tabindex: '0', role: 'button', onClick: function () { openMail(r); },
          onKeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMail(r); } } },
          [r.cat, r.sender, r.subject, fmt(r.ts), r.box, r.snippet].map(function (x, i) { return el('td', {}, i === 0 ? CAT[x] : x); }));
        tb.appendChild(tr);
      });
    }
    fcat.onchange = draw; draw();
    body.appendChild(el('div', { class: 'es-filters' }, [el('label', {}, ['קטגוריה ', fcat])]));
    body.appendChild(el('div', { class: 'es-tablewrap' }, [el('table', { class: 'es-table' }, [th, tb])]));

    // ספאם
    body.appendChild(el('h4', {}, 'ספאם ופרסומות (' + S.groups.reduce(function (a, g) { return a + g.ids.length; }, 0) + ' שיחות)'));
    var checks = [];
    var sb = el('tbody', {}, S.groups.map(function (g, i) {
      var cb = el('input', { type: 'checkbox', id: 'es-sp' + i, checked: 'checked', 'aria-label': 'סמן שורה ' + (i + 1) });
      cb.checked = true; checks.push(cb);
      return el('tr', {}, [el('td', {}, String(i + 1)), el('td', {}, g.sender), el('td', {}, String(g.ids.length)), el('td', {}, g.example), el('td', {}, [cb])]);
    }));
    body.appendChild(el('div', { class: 'es-tablewrap' }, [el('table', { class: 'es-table' }, [
      el('thead', {}, [el('tr', {}, ['#', 'שולח', 'כמה', 'נושא לדוגמה', 'סמן'].map(function (x) { return el('th', {}, x); }))]), sb])]));
    body.appendChild(el('p', { class: 'es-note' }, 'למחוק את אלה? "הכל" מעביר את כל השורות לפח, "המסומנים" רק את מה שסימנת. אישי ואבטחה והקטגוריות שבחרת לא נכללים. הפח ניתן לשחזור כ-30 יום.'));
    var plan = el('div', { class: 'es-plan', hidden: 'hidden' });
    plan.hidden = true;
    function prep(onlyChecked) {
      var ids = [];
      S.groups.forEach(function (g, i) { if (!onlyChecked || checks[i].checked) ids = ids.concat(g.ids); });
      plan.textContent = '';
      if (!ids.length) { plan.hidden = false; plan.appendChild(el('div', {}, 'לא נבחר דבר.')); return; }
      var out = el('div', { class: 'es-status', role: 'status' });
      var ok = el('button', { class: 'btn', type: 'button', onClick: function () { trashAll(ids, ok, no, status, out); } }, 'אשר: העבר ' + ids.length + ' שיחות לפח');
      var no = el('button', { class: 'btn btn-ghost', type: 'button', onClick: function () { plan.hidden = true; } }, 'בטל');
      plan.hidden = false;
      plan.append(el('div', {}, 'יועברו לפח ' + ids.length + ' שיחות. עדיין לא נמחק כלום.'), el('div', { class: 'es-row' }, [ok, no]), out);
    }
    body.appendChild(el('div', { class: 'es-row' }, [
      el('button', { class: 'btn', type: 'button', onClick: function () { prep(false); } }, 'הכל: העבר לפח'),
      el('button', { class: 'btn btn-soft', type: 'button', onClick: function () { prep(true); } }, 'המסומנים: העבר לפח')]));
    body.appendChild(plan);
  }

  function trashAll(ids, ok, no, status, out) {
    ok.disabled = no.disabled = true;
    function say(t) { status.textContent = t; if (out) out.textContent = t; }
    say('מתחבר ל-Gmail (אם נפתח חלון של Google, אשר בו)...');
    var done = 0, fail = 0, lastErr = '';
    return signIn().then(function () {
      say('מעביר לפח 0 מתוך ' + ids.length + '...');
      return pool(ids, 4, function (id) {
        return api('threads/' + id + '/trash', { method: 'POST' }).then(function () { done++; }, function (e) { fail++; lastErr = e && e.message || ''; }).then(function () {
          say('מעביר לפח ' + (done + fail) + ' מתוך ' + ids.length + '...');
        });
      });
    }).then(function () {
      say('הועברו לפח ' + done + ' שיחות' + (fail ? ', נכשלו ' + fail + (lastErr ? ' (' + lastErr + ')' : '') : '') + '. אפשר לשחזר מהפח ב-Gmail כ-30 יום.');
      if (fail) { ok.disabled = no.disabled = false; }
    }, function (e) {
      say('נכשל: ' + e.message + ' נסה שוב.');
      ok.disabled = no.disabled = false;
    });
  }

  function openMail(r) {
    var m = openOverlay(r.subject);
    m.body.append(
      el('dl', { class: 'es-dl' }, [el('dt', {}, 'שולח'), el('dd', {}, r.sender), el('dt', {}, 'תאריך'), el('dd', {}, fmt(r.ts)), el('dt', {}, 'קטגוריה'), el('dd', {}, CAT[r.cat]), el('dt', {}, 'תיבה'), el('dd', {}, r.box)]),
      el('div', { class: 'es-mailtext' }, (r.snippet || '(אין תקציר)') + '\n\n(תקציר בלבד. הטקסט המלא ב-Gmail.)'),
      el('a', { class: 'btn', href: gmailLink(r.threadId), target: '_blank', rel: 'noopener' }, 'פתח ב-Gmail'));
  }

  // ── כרטיס בלוח הבקרה ────────────────────────────────────────────────────
  function openLast() {
    var S = loadLast();
    if (!S) { App.toast('אין סיכום שמור בדפדפן הזה'); return; }
    var m = openOverlay('סיכום מיילים: ' + S.rangeLabel, true);
    var status = el('p', { class: 'es-status', role: 'status' }, 'הסיכום האחרון שהופק בדפדפן הזה.');
    renderSummary(m.body, S, status);
  }

  function renderCard() {
    var has = !!getClientId();
    var kids = [el('h2', {}, '📧 סיכום מיילים'),
      el('p', { class: 'es-note' }, 'לחיצה אחת: בוחרים טווח, מקבלים סיכום באתר ובמייל, ומחליטים מה להעביר לפח. עובד ישירות מול Gmail, בלי Claude.')];
    if (has) {
      kids.push(el('div', { class: 'es-row' }, [el('button', { class: 'btn', type: 'button', onClick: askRange }, 'הפק סיכום מיילים'),
        loadLast() ? el('button', { class: 'btn btn-soft', type: 'button', onClick: openLast }, 'פתח את הסיכום האחרון') : null,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { setClientId(''); App.toast('ה-Client ID נמחק'); location.reload(); } }, 'החלף Client ID')].filter(Boolean)));
    } else {
      var inp = el('input', { type: 'text', id: 'es-cid', class: 'es-cid', placeholder: 'xxxx.apps.googleusercontent.com', dir: 'ltr', 'aria-label': 'Google Client ID' });
      kids.push(el('details', { class: 'es-setup', open: 'open' }, [el('summary', {}, 'הגדרה חד-פעמית (3 דקות)'),
        el('ol', {}, [
          el('li', {}, 'ב-Google Cloud Console: צור פרויקט והפעל את Gmail API.'),
          el('li', {}, 'מסך הסכמה (OAuth consent): סוג External, מצב Testing, והוסף את ' + SELF + ' כ-Test user.'),
          el('li', {}, 'Credentials → Create OAuth client ID → Web application. ב-Authorized JavaScript origins הוסף: https://gagula22.github.io'),
          el('li', {}, 'הדבק כאן את ה-Client ID ולחץ שמור (הוא לא סוד).')]),
        el('div', { class: 'es-row' }, [inp, el('button', { class: 'btn', type: 'button', onClick: function () {
          var v = inp.value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { App.toast('Client ID לא תקין'); return; }
          setClientId(v); location.reload(); } }, 'שמור')]),
        el('p', { class: 'es-note' }, 'במצב Testing ההתחברות של Google פגה אחרי 7 ימים, ואז מתחברים שוב בלחיצה.')]));
    }
    return el('div', { class: 'card es-card' }, kids);
  }
  renderCard.order = 40;
  (window.DASHBOARD_WIDGETS = window.DASHBOARD_WIDGETS || []).push(renderCard);
  try { if (/[?&]es=last/.test(location.search)) setTimeout(function () { if (loadLast()) openLast(); }, 600); } catch (e) { /* ignore */ }
  window.EmailSummary = { classify: classify, senderName: senderName };
})();
