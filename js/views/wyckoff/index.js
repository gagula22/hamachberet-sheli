(function () {
  'use strict';
  // ── wyckoff/index.js — ה-view: דוח 3 מטבעות (BTC·ETH·SOL) בתבנית הסקיל ──
  // אחריות: fetch 3 מטבעות מ-Binance → WyckoffEngine → דוח אחד עם TOC + 3 בלוקים,
  // גרפים בהירים, גרפי תרחישים, זמן-הפקה אמיתי. אפס תלות בקלוד/בסקיל/בשרת.

  function el(t, a, k) {
    var n = document.createElement(t);
    if (a) Object.keys(a).forEach(function (key) {
      var v = a[key]; if (v == null) return;
      if (key === 'class') n.className = v; else if (key === 'html') n.innerHTML = v;
      else if (key.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(key.slice(2).toLowerCase(), v);
      else n.setAttribute(key, v);
    });
    if (k != null) (Array.isArray(k) ? k : [k]).forEach(function (c) {
      if (c == null) return; n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return n;
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  function pad2(n) { return ('0' + n).slice(-2); }
  function vWord(v) { return v === 'GO' ? '🟢 GO' : v === 'NO-GO' ? '✋ NO-GO' : '⏸ WAIT'; }
  function vCls(v) { return v === 'GO' ? 'go' : v === 'NO-GO' ? 'nogo' : ''; }
  function biasCls(c) { return /שורי/.test(c) ? 'g' : /דובי/.test(c) ? 'r' : 'a'; }
  function ctrlCls(t) { return t.indexOf('🟢') === 0 ? 'ctrl-buy' : t.indexOf('🔴') === 0 ? 'ctrl-sell' : 'ctrl-mix'; }
  function ctrlCell(t) { return t.indexOf('🟢') === 0 ? 'g' : t.indexOf('🔴') === 0 ? 'r' : 'a'; }
  function genStamp(d) { return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
  function candleStamp(d) { return pad2(d.getUTCDate()) + '.' + pad2(d.getUTCMonth() + 1) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }
  function weeklyBias(d) {
    if (d.length < 8) return { t: 'ניטרלי', c: 'a' };
    var ch = (d[d.length - 1].c - d[d.length - 8].c) / d[d.length - 8].c;
    return ch < -0.04 ? { t: 'דובי', c: 'r' } : ch > 0.04 ? { t: 'שורי', c: 'g' } : { t: 'ניטרלי', c: 'a' };
  }
  var COINS = [
    { key: 'BTC', name: '₿ Bitcoin', sym: 'BTCUSDT' },
    { key: 'ETH', name: 'Ξ Ethereum', sym: 'ETHUSDT' },
    { key: 'SOL', name: '◎ Solana', sym: 'SOLUSDT' }
  ];
  var WHY = { 1: 'הטיה זה הכיוון הכללי שהדגים הגדולים דוחפים אליו. סוחרים עם הזרם.', 2: 'שלב B = אוסף סחורה, מבלבל. שלב C/D = האירוע האמיתי (ספרינג/פריצה) — שם הכסף.', 3: 'קונפלואנס = כמה סיבות מתכנסות לרמה אחת. אמצע = שטח הפקר.', 4: 'טריגר = נר האישור שאומר "עכשיו". נפח נמוך בטסט = אין מוכרים שנותרו.', 5: 'R:R = סיכון מול רווח. 3R = על כל שקל סיכון, שלושה רווח.', 6: 'לא מסכנים יותר מ-1% בעסקה. רצף הפסדים לא מוחק אותך.', 7: 'אלטים זזים אחרי ביטקוין. אקומולציה באלט לא שווה אם ביטקוין נופל.', 8: 'OI=כסף ממונף פתוח. פאנדינג=מי משלם למי. מגלים אם פריצה אמיתית או מלכודת.' };
  var TIP = { 1: 'אין הטיה ברורה — היד על ההדק נחה.', 2: 'לא נכנסים בשלב B — שם רוב ההפסדים.', 3: 'קנייה באמצע = יחס גרוע. מחכים לקצה.', 4: 'בלי טריגר — אין כניסה.', 5: 'מתחת ל-3R — מוותרים.', 6: 'הגודל חשוב יותר מהכיוון.', 7: 'באלט — בדוק קודם מה ביטקוין עושה.', 8: 'פריצה עם OI עולה = אמיתית. OI יורד = מלכודת.' };

  // חץ מגמת-ווליום לפי קריאת השליטה (היצע/ביקוש) — מצויר על ההיסטוגרמה
  function volNoteFor(tf) {
    if (!tf || !tf.control) return null;
    var c = tf.control;
    if (c.demandTrend < -0.1 && c.tag.indexOf('🔴') === 0) return { slope: -1, text: 'ביקוש דועך (No-Demand)', color: '#cf9224' };
    if (c.supplyTrend < -0.12) return { slope: -1, text: 'היצע יורד — מוכרים מתעייפים', color: '#2faa6a' };
    if (c.supplyTrend > 0.15) return { slope: 1, text: 'היצע גובר', color: '#e06a62' };
    if (c.demandTrend > 0.12) return { slope: 1, text: 'ביקוש גובר (Demand ↑)', color: '#2faa6a' };
    return { slope: 0, text: 'נפח מעורב — איזון', color: '#7a8699' };
  }
  // ── גרף offscreen → dataURL (רקע בהיר) ──
  function chartImg(candles, tf, take, levels, h) {
    var cv = document.createElement('canvas'); cv.width = 1000; cv.height = h || 360;
    var marks = {}; if (tf && tf.scIdx >= 0) marks[tf.scIdx] = 'SC'; if (tf && tf.arIdx >= 0) marks[tf.arIdx] = 'AR';
    try { WyckoffChart.draw(cv, candles, { marks: marks, sup: tf && tf.sup, res: tf && tf.res, take: take || undefined, levels: levels, volNote: volNoteFor(tf) }); return cv.toDataURL('image/png'); }
    catch (e) { return ''; }
  }
  // גרף תרחיש סכמטי (מסלול צפוי לפי וויקוף) — ייחוס נרות 4H
  function scenarioImg(h4, sc, M) {
    var cv = document.createElement('canvas'); cv.width = 1000; cv.height = 340;
    try { WyckoffChart.scenario(cv, h4, sc, M); return cv.toDataURL('image/png'); } catch (e) { return ''; }
  }

  // ── בלוק מטבע יחיד (coinbar + sections) ──
  function coinBlock(coin, r, bundle, imgs) {
    var M = r.money, D = r.tfs.d, H4 = r.tfs.h4, H1 = r.tfs.h1;
    var wk = weeklyBias(bundle.d);
    var posPct = r.range ? Math.round((r.price - r.range.sup) / (r.range.res - r.range.sup) * 100) : 0;
    function row(name, bias, bc, stage, ev, ctl, cc) {
      return '<tr><td>' + name + '</td><td class="' + bc + '">' + bias + '</td><td>' + stage + '</td><td>' + esc(ev) + '</td><td class="' + cc + '">' + esc(ctl) + '</td></tr>';
    }
    var table = '<table><tr><th>טווח</th><th>הטיה</th><th>שלב</th><th>אירוע אחרון</th><th>שליטה (נפח)</th></tr>' +
      row('שבועי', wk.t, wk.c, '—', r.range ? 'שפל ' + M(r.range.sup) : '—', wk.t === 'דובי' ? 'מומנטום שלילי' : 'מומנטום', wk.c) +
      row('יומי', D.conviction, biasCls(D.conviction), '<b>' + D.phase + '</b>', D.event, D.control.tag, ctrlCell(D.control.tag)) +
      row('4H', H4.conviction, biasCls(H4.conviction), H4.phase, H4.event, H4.control.tag, ctrlCell(H4.control.tag)) +
      row('1H', H1.conviction, biasCls(H1.conviction), H1.phase, H1.event, H1.control.tag, ctrlCell(H1.control.tag)) +
      '<tr><td>15m</td><td class="r">דשדוש</td><td>—</td><td>תנועה דקה</td><td class="muted">לא רלוונטי</td></tr></table>' +
      '<p class="sub">טווח: <b>' + (r.range ? M(r.range.sup) + '–' + M(r.range.res) : '—') + '</b> · מיקום <b>' + posPct + '%</b> · OI/פאנדינג: <span class="muted">לא נבדק (Binance ספוט)</span></p>';

    function ctrlB(emoji, nm, tf, img) {
      return '<h3>' + emoji + ' ' + nm + '</h3>' + (img ? '<img class="wkchart" src="' + img + '" alt="גרף ' + nm + '">' : '') +
        '<div class="read"><span class="ctrl-tag ' + ctrlCls(tf.control.tag) + '">' + esc(tf.control.tag) + '</span><br><b class="lbl">קריאת נפח:</b> ' + esc(tf.control.why) + ' שלב ' + tf.phase + ' · ' + esc(tf.event) + '.</div>';
    }
    var control = '<h2 class="ctrl">⚖️ מי שולט? — נפח לכל טווח (יומי→שעתי)</h2>' +
      ctrlB('📅', 'יומי', D, imgs.d) + ctrlB('🕓', '4 שעות', H4, imgs.h4) + ctrlB('🕐', 'שעתי', H1, imgs.h1);

    var m15 = '<h2 class="tf">⏱️ 15 דקות (לביצוע בלבד)</h2>' +
      (imgs.m15 ? '<img class="wkchart" src="' + imgs.m15 + '" alt="גרף 15m">' : '') +
      '<div class="read">' + (r.m15read ? '<span class="ctrl-tag ' + ctrlCls(r.m15read.tag) + '">' + esc(r.m15read.tag) + '</span><br>' : '') +
      '<b class="lbl">Setup:</b> ' + esc(r.m15Setup) + '. טריגר הכניסה (אם יתקיים) מגיע מכאן — נר היפוך/בליעה באזור בנפח טסט 40–60%.</div>';

    var scen = '<h2 class="star">⭐ תרחישים עתידיים (נרות + נפח)</h2>';
    r.scenarios.forEach(function (s, i) {
      scen += '<div class="scen ' + (s.kind === 'short' ? 'short' : 'long') + '"><h3 class="' + (s.kind === 'short' ? 'r' : 'g') + '">' + esc(s.title) + '</h3>' +
        '<div style="font-size:.82rem;color:#4f7fd1;margin-bottom:6px">🕐 <b>טווחי זמן:</b> ' + esc(s.tf || '') + '</div>' +
        (imgs.scen && imgs.scen[i] ? '<img class="wkchart" src="' + imgs.scen[i] + '" alt="גרף תרחיש">' : '') +
        '<ul><li><b>תנאי:</b> ' + esc(s.cond || s.trigger) + '</li>' +
        '<li><b>כניסה:</b> <code>' + M(s.entry) + '</code> · <b>סטופ:</b> <code>' + M(s.sl) + '</code></li>' +
        '<li><b>יעדים:</b> <code>' + M(s.tp1) + '</code> / <code>' + M(s.tp2) + '</code> / <code>' + M(s.tp3 || s.tp2) + '</code> · <b>R:R ≈ ' + s.rr + '</b></li></ul></div>';
    });
    if (r.alerts && r.alerts.length) scen += '<div class="alerts">🔔 <b>התראות מומלצות:</b> ' + r.alerts.map(function (a) { return '<code>' + M(a) + '</code>'; }).join(' · ') + '</div>';

    var crit = r.checklist.slice(0, 4).filter(function (q) { return q.state === 'yes'; }).length;
    var checklist = '<h2 class="sec">✅ צ\'ק-ליסט 8 שאלות</h2><p class="muted" style="font-size:.82rem;margin-bottom:4px">👆 לחץ על שורה להסבר</p>' +
      '<table class="checklist"><tr><th>#</th><th>שאלה</th><th>סטטוס</th></tr>' +
      r.checklist.map(function (q) {
        var cls = q.state === 'yes' ? 'g' : q.state === 'no' ? 'r' : q.state === 'warn' ? 'muted' : 'a';
        var mk = q.state === 'yes' ? '✓ ' : q.state === 'no' ? '✗ ' : '— ';
        return '<tr data-q="' + q.n + '"><td>' + q.n + '</td><td>' + esc(q.label) + '</td><td class="' + cls + '">' + mk + esc(q.note) + '</td></tr>';
      }).join('') + '</table><p style="margin-top:6px"><b>' + crit + '/4 קריטיות ⇒ <span class="a">' + vWord(r.verdict) + '</span>.</b></p>';

    var sp = r.scenarios[0];
    var opt = '<h2 class="fin">🎯 מסקנה</h2><div class="opt"><h3>' + (r.verdict === 'GO' ? 'כניסה פעילה' : 'המתנה לספרינג או לפריצה/UTAD') + '</h3>' +
      '<p>' + esc(r.verdictWhy) + ' נפח: ' + esc(D.control.why) + (sp ? ' התרחיש המועדף ' + esc(sp.title.replace(/[🟢🔵🔴]/g, '').split('—')[0].trim()) + ' (R:R ' + sp.rr + ').' : '') + '</p></div>';

    return '<div class="coinblock" id="c_' + coin.key + '">' +
      '<div class="coinbar"><h2 style="border:none;padding:0">' + coin.name + ' <span class="muted" style="font-size:.78rem">' + coin.sym + '</span> · ' + M(r.price) + '</h2>' +
      '<span class="verdict ' + vCls(r.verdict) + '" data-verdict title="לחץ להסבר">' + vWord(r.verdict) + '</span></div>' +
      '<section><h2 class="sec">טבלת רב-טווחים</h2>' + table + '</section>' +
      '<section>' + control + '</section>' +
      '<section>' + m15 + '</section>' +
      '<section>' + scen + '</section>' +
      '<section>' + checklist + '</section>' +
      '<section>' + opt + '</section></div>';
  }

  // ── הדוח המלא (3 מטבעות) ──
  function buildReport3(coins, gen) {
    var toc = '<div class="toc">' + coins.map(function (c) { return '<a href="#c_' + c.coin.key + '">' + c.coin.name + '</a>'; }).join('') + '</div>';
    var blocks = coins.map(function (c) { return coinBlock(c.coin, c.r, c.bundle, c.imgs); }).join('');
    return '<div class="wrap">' +
      '<div class="exportbar"><button class="exbtn pdf" data-export="pdf">🖨️ ייצוא ל-PDF</button><button class="exbtn html" data-export="html">💾 ייצוא ל-HTML</button></div>' +
      '<header><h1>📊 ניתוח וויקוף — שלושה מטבעות בדוח אחד</h1>' +
      '<p class="sub"><b style="color:#268a55">✓ הופק עכשיו:</b> ' + genStamp(gen) + ' · נתונים חיים מ-Binance · רץ באתר (ללא קלוד) · נר אחרון: ' + candleStamp(coins[0].r.asof) + ' UTC</p></header>' +
      toc + blocks +
      '<div class="disc">📚 מידע חינוכי בלבד — אינו ייעוץ השקעות. ניתוח דטרמיניסטי (מנוע-חוקים) — קירוב שיטת וויקוף, נתוני Binance ספוט. כל לחיצה על "הפק דוח" מושכת נתונים טריים ומחשבת מחדש (ראו זמן ההפקה למעלה).</div>' +
      '<div class="wk-qoverlay" data-overlay><div class="wk-qbox"><h3 id="wk-qt"></h3><div class="qsub" id="wk-qs"></div><div id="wk-qbody"></div><button class="qclose" data-qclose>סגירה</button></div></div></div>';
  }

  function openModal(root, title, sub, body) {
    var ov = root.querySelector('[data-overlay]'); if (!ov) return;
    root.querySelector('#wk-qt').textContent = title; root.querySelector('#wk-qs').textContent = sub || '';
    root.querySelector('#wk-qbody').innerHTML = body; ov.classList.add('show');
  }
  function wireModal(root) {
    root.addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]'), v = e.target.closest('[data-verdict]'), c = e.target.closest('[data-qclose]'),
        o = e.target.closest('[data-overlay]'), ex = e.target.closest('[data-export]');
      if (ex) { if (ex.getAttribute('data-export') === 'pdf') window.print(); else exportReport(root); return; }
      if (c || (o && e.target === o)) { root.querySelector('[data-overlay]').classList.remove('show'); return; }
      if (v) { openModal(root, 'מה אומרת הפסיקה?', '⏸/🟢/✋ אייקונים, לא ספרות',
        '<div class="qblock"><div class="qlabel" style="color:#b9821f">⏸ WAIT</div><p>מבנה תקין אבל אין כניסה — חסר טריגר/מחיר לא באזור. רוב הזמן זו התשובה הנכונה.</p></div>' +
        '<div class="qblock"><div class="qlabel why">🟢 GO</div><p>כל התנאים: הטיה, שלב C/D מאומת-נפח, מחיר באזור, טריגר 15m, R:R≥3.</p></div>' +
        '<div class="qblock"><div class="qlabel" style="color:#c44b42">✋ NO-GO</div><p>משהו פוסל: סתירה בין טווחים, נפח שלא מאשר, או חוק ביטול.</p></div>'); return; }
      if (q) { var n = +q.getAttribute('data-q'), cells = q.querySelectorAll('td');
        openModal(root, n + '. ' + cells[1].textContent, cells[2].textContent,
          '<div class="qblock"><div class="qlabel why">💡 מה זה אומר</div><p>' + esc(WHY[n] || '') + '</p></div>' +
          '<div class="qblock"><div class="qlabel now">📍 עכשיו</div><p>' + esc(cells[2].textContent) + '</p></div>' +
          '<div class="qblock"><div class="qlabel tip">🎯 כסוחר</div><p>' + esc(TIP[n] || '') + '</p></div>'); }
    });
  }

  function exportReport(root) {
    try {
      var inner = root.querySelector('.wrap').outerHTML;
      var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>וויקוף — BTC·ETH·SOL</title><style>' + EXPORT_CSS + '</style></head><body>' + inner + '<scr' + 'ipt>' + EXPORT_JS + '</scr' + 'ipt></body></html>';
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'wyckoff-3coins-' + new Date().toISOString().slice(0, 10) + '.html' });
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
      if (window.App && App.toast) App.toast('💾 הדוח יורד כ-HTML עצמאי');
    } catch (e) { if (window.App && App.toast) App.toast('הייצוא נכשל'); }
  }

  // ── הרצה: 3 מטבעות ──
  function run(host, btn) {
    host.innerHTML = '';
    host.appendChild(el('div', { class: 'wk-loading' }, [el('div', { class: 'wk-spin' }), el('div', {}, 'מושך נתונים חיים ומנתח BTC · ETH · SOL…')]));
    if (btn) { btn.disabled = true; btn.textContent = '⏳ מנתח…'; }
    Promise.all(COINS.map(function (c) { return WyckoffData.fetchAll(c.sym, 'binance'); })).then(function (bundles) {
      var gen = new Date();
      var btcR = WyckoffEngine.analyze(bundles[0]);
      var btcBias = btcR.tfs.d.conviction;
      var coins = COINS.map(function (c, i) {
        var r = i === 0 ? btcR : WyckoffEngine.analyze(bundles[i], { btcBias: btcBias });
        var b = bundles[i];
        var imgs = {
          d: chartImg(b.d, r.tfs.d, 35), h4: chartImg(b.h4, r.tfs.h4, 60), h1: chartImg(b.h1, r.tfs.h1, 50),
          m15: chartImg(b.m15, { scIdx: -1, arIdx: -1, sup: null, res: null }, 0, null, 300),
          scen: r.scenarios.map(function (s) { return scenarioImg(b.h4, s, r.money); })
        };
        return { coin: c, r: r, bundle: b, imgs: imgs };
      });
      var rep = el('div', { class: 'wk-report', html: buildReport3(coins, gen) });
      host.innerHTML = ''; host.appendChild(rep); wireModal(rep);
      if (window.App && App.toast) App.toast('✓ הדוח הופק — ' + pad2(gen.getHours()) + ':' + pad2(gen.getMinutes()) + ':' + pad2(gen.getSeconds()));
    }).catch(function (e) {
      host.innerHTML = ''; host.appendChild(el('div', { class: 'wk-fail' }, '⚠️ ' + (e && e.message ? e.message : 'שגיאה במשיכת הנתונים מ-Binance — בדקו את החיבור.')));
    }).then(function () { if (btn) { btn.disabled = false; btn.textContent = '🔄 הפק דוח חי חדש'; } });
  }

  function render(root) {
    if (!window.WyckoffData || !window.WyckoffEngine || !window.WyckoffChart) {
      root.appendChild(el('div', { class: 'wk-fail' }, 'מודולי הוויקוף לא נטענו — רעננו את הדף.')); return;
    }
    var btn = el('button', { class: 'wk-analyze' }, '🔄 הפק דוח חי חדש');
    var host = el('div', { class: 'wk-host' });
    var bar = el('div', { class: 'wk-bar' }, [
      el('span', { class: 'wk-coin' }, '📈'),
      el('span', { style: 'font-weight:700' }, 'דוח וויקוף עצמאי — BTC · ETH · SOL'),
      el('span', { style: 'flex:1' }), btn
    ]);
    btn.addEventListener('click', function () { run(host, btn); });
    root.appendChild(el('div', { class: 'wk-view' }, [bar, host]));
    run(host, btn);
  }

  // ── כרטיס דשבורד ──
  function dashCard() {
    return el('div', { class: 'card wk-dash-card' }, [
      el('h2', { style: 'margin:0 0 2px' }, '📈 דוח וויקוף עצמאי'),
      el('p', { class: 'sub', style: 'margin:0' }, 'ניתוח חי של BTC·ETH·SOL לפי וויקוף — רץ באתר עצמו, ללא קלוד.'),
      el('div', { class: 'wk-dash-btns' }, [
        el('button', { class: 'wk-dash-btn primary', onClick: function () { location.hash = '#/wyckoff'; } }, '🔍 הפק דוח 3 מטבעות')
      ])
    ]);
  }
  if (window.DASHBOARD_WIDGETS) window.DASHBOARD_WIDGETS.push(dashCard);

  // ── CSS לא-ממוקד לייצוא (תבנית הסקיל) ──
  var EXPORT_CSS = ":root{--bg:#f6f8fb;--card:#fff;--card2:#f3f6fa;--border:#e6eaf0;--text:#2b3648;--muted:#7a8699;--accent:#4f7fd1;--green:#2faa6a;--red:#e06a62;--amber:#cf9224;--cyan:#3a9fb0;--pink:#c77fa6}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.7;padding:26px 14px}.wrap{max-width:980px;margin:0 auto}header{text-align:center;margin-bottom:10px}h1{font-size:1.5rem;color:#34425c}.sub{color:var(--muted);font-size:.9rem}.toc{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0 18px}.toc a{font-size:.9rem;font-weight:600;background:#eef4fc;color:#2b6cb0;border:1px solid #c5d8f0;border-radius:20px;padding:6px 16px;text-decoration:none}.coinblock{margin-bottom:26px}.coinbar{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:11px 16px;margin-bottom:12px;flex-wrap:wrap}.coinbar h2{font-size:1.15rem;color:#34425c;border:none;padding:0}.verdict{font-size:1.2rem;font-weight:800;padding:5px 22px;border-radius:11px;cursor:pointer;background:#fdf6e6;color:#b9821f;border:2px solid #e9c877}.verdict.go{background:#eafaf1;color:#1f8a54;border-color:#b6e6cb}.verdict.nogo{background:#fdeceb;color:#c44b42;border-color:#f0cac6}section{background:var(--card);border:1px solid var(--border);border-radius:13px;padding:16px 18px;margin-bottom:12px}h2{font-size:1.1rem;margin-bottom:10px;padding-right:10px;border-right:4px solid var(--accent);color:#3a4a66}h2.tf{border-right-color:var(--cyan)}h2.star{border-right-color:var(--amber)}h2.fin{border-right-color:var(--green)}h2.ctrl{border-right-color:var(--pink)}h2.sec{border-right-color:var(--accent)}h3{font-size:1rem;color:#3a4a66;margin:12px 0 4px}table{width:100%;border-collapse:collapse;margin:8px 0;font-size:.85rem}th{background:var(--card2);color:#42598a;padding:7px 9px;text-align:right;border:1px solid var(--border)}td{padding:7px 9px;border:1px solid var(--border);vertical-align:top}tr:nth-child(even) td{background:#fafbfd}.g{color:var(--green);font-weight:bold}.r{color:var(--red);font-weight:bold}.a{color:var(--amber);font-weight:bold}.muted{color:var(--muted)}.read{background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:11px 14px;margin:8px 0;font-size:.9rem}.read b.lbl{color:var(--cyan)}.ctrl-tag{display:inline-block;font-size:.78rem;font-weight:bold;border-radius:20px;padding:2px 11px;margin-bottom:6px}.ctrl-buy{background:#e7f5ee;color:#1f8a54}.ctrl-sell{background:#fceae8;color:#c44b42}.ctrl-mix{background:#fbf2e0;color:#9a6f1d}.wkchart{width:100%;border-radius:9px;display:block;margin:4px 0;border:1px solid #e6eaf0}.scen{border-radius:11px;padding:13px;margin:9px 0;border:1px solid var(--border)}.long{background:#f1faf4;border-color:#bce3cd}.short{background:#fdf2f1;border-color:#f0cac6}.scen h3{margin-bottom:6px;font-size:1rem}.scen ul{padding-right:18px;font-size:.86rem}.scen li{margin-bottom:4px}code{background:#eef2f8;border:1px solid var(--border);border-radius:5px;padding:1px 6px;color:#2b6cb0;direction:ltr;display:inline-block;font-size:.85em}.alerts{background:#eef4fc;border:1px solid #c5d8f0;border-radius:9px;padding:9px;margin:8px 0;text-align:center}.opt{background:#f1faf4;border:2px solid var(--green);border-radius:11px;padding:13px;margin:6px 0}.opt h3{color:#268a55;font-size:1.05rem;margin-bottom:6px}.disc{background:#fdf8ec;border:1px solid #ecdcb0;border-radius:9px;padding:10px 14px;margin:13px 0;color:#8a6d2f;font-size:.82rem}ul,ol{padding-right:20px}li{margin-bottom:4px}.checklist tr[data-q]{cursor:pointer}.checklist tr[data-q]:hover td{background:#eaf1fb!important}.exportbar{display:flex;gap:10px;margin-bottom:14px}.exbtn{font-family:inherit;font-size:.9rem;font-weight:600;border-radius:10px;padding:9px 18px;cursor:pointer;border:1px solid}.exbtn.pdf{background:#fdeceb;color:#c44b42;border-color:#f0cac6}.exbtn.html{background:#eaf1fb;color:#2b6cb0;border-color:#c5d8f0}.wk-qoverlay{position:fixed;inset:0;background:rgba(40,55,85,.45);display:none;align-items:center;justify-content:center;z-index:999;padding:18px}.wk-qoverlay.show{display:flex}.wk-qbox{background:#fff;border:1px solid #e6eaf0;border-radius:16px;max-width:560px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(40,60,100,.25);max-height:88vh;overflow:auto}.wk-qbox h3{color:#3a4a66;font-size:1.15rem;margin-bottom:4px}.wk-qbox .qsub{color:#7a8699;font-size:.82rem;margin-bottom:14px}.wk-qbox .qblock{margin-bottom:13px}.wk-qbox .qlabel{font-weight:bold;font-size:.9rem;margin-bottom:3px}.wk-qbox .qlabel.why{color:#2faa6a}.wk-qbox .qlabel.now{color:#cf9224}.wk-qbox .qlabel.tip{color:#3a9fb0}.wk-qbox p{font-size:.92rem;line-height:1.65;color:#3a4456}.wk-qbox .qclose{margin-top:12px;width:100%;background:#eef2f8;color:#3a4a66;border:1px solid #e6eaf0;border-radius:10px;padding:10px;cursor:pointer}@media print{.exportbar{display:none!important}body{padding:0;background:#fff}section,.coinbar{box-shadow:none;break-inside:avoid}.wk-qoverlay{display:none!important}}";
  var EXPORT_JS = "(function(){var ov=document.querySelector('[data-overlay]');function open(t,s,b){document.getElementById('wk-qt').textContent=t;document.getElementById('wk-qs').textContent=s||'';document.getElementById('wk-qbody').innerHTML=b;ov.classList.add('show');}document.addEventListener('click',function(e){var q=e.target.closest('[data-q]'),v=e.target.closest('[data-verdict]'),c=e.target.closest('[data-qclose]'),o=e.target.closest('[data-overlay]'),ex=e.target.closest('[data-export]');if(ex){if(ex.getAttribute('data-export')==='pdf')window.print();return;}if(c||(o&&e.target===o)){ov.classList.remove('show');return;}if(v){open('הפסיקה','אייקונים, לא ספרות','<p>WAIT=המתן · GO=כניסה · NO-GO=הישאר בחוץ.</p>');return;}if(q){var t=q.querySelectorAll('td');open(t[0].textContent+'. '+t[1].textContent,t[2].textContent,'<p>'+t[2].textContent+'</p>');}});})();";

  if (window.App && App.register) App.register('wyckoff', render);
})();
