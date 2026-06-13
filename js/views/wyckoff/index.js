(function () {
  'use strict';
  // ── wyckoff/index.js — ה-view של מנתח הוויקוף העצמאי (App.register('wyckoff')) ──
  // אחריות: קלט סימבול → WyckoffData (Binance) → WyckoffEngine → רינדור דוח
  // **בתבנית הסקיל המדויקת** (CSS ממוקד .wk-report) + ייצוא עצמאי + כרטיס דשבורד.
  // אפס תלות בקלוד/בסקיל/בשרת.

  function el(t, a, k) {
    var n = document.createElement(t);
    if (a) Object.keys(a).forEach(function (key) {
      var v = a[key]; if (v == null) return;
      if (key === 'class') n.className = v;
      else if (key === 'html') n.innerHTML = v;
      else if (key.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(key.slice(2).toLowerCase(), v);
      else n.setAttribute(key, v);
    });
    if (k != null) (Array.isArray(k) ? k : [k]).forEach(function (c) {
      if (c == null) return; n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return n;
  }
  var LS = 'wyckoff.lastSymbol';
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  // ── עזרי תבנית ──
  function vWord(v) { return v === 'GO' ? '🟢 GO' : v === 'NO-GO' ? '✋ NO-GO' : '⏸ WAIT'; }
  function vCls(v) { return v === 'GO' ? 'go' : v === 'NO-GO' ? 'nogo' : ''; }
  function biasCls(c) { return /שורי/.test(c) ? 'g' : /דובי/.test(c) ? 'r' : 'a'; }
  function ctrlCls(tag) { return tag.indexOf('🟢') === 0 ? 'ctrl-buy' : tag.indexOf('🔴') === 0 ? 'ctrl-sell' : 'ctrl-mix'; }
  function ctrlCellCls(tag) { return tag.indexOf('🟢') === 0 ? 'g' : tag.indexOf('🔴') === 0 ? 'r' : 'a'; }
  function fmtDate(d) {
    return ('0' + d.getUTCDate()).slice(-2) + '.' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '.' + d.getUTCFullYear() +
      ', ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function weeklyBias(dCandles) {
    if (dCandles.length < 8) return { t: 'ניטרלי', c: 'a' };
    var last = dCandles[dCandles.length - 1].c, wk = dCandles[dCandles.length - 8].c;
    var ch = (last - wk) / wk;
    if (ch < -0.04) return { t: 'דובי', c: 'r' };
    if (ch > 0.04) return { t: 'שורי', c: 'g' };
    return { t: 'ניטרלי', c: 'a' };
  }

  // ── ציור גרף offscreen → dataURL (כדי להטמיע כ-PNG, כמו דוח הסקיל) ──
  function chartImg(candles, tf, take) {
    var cv = document.createElement('canvas'); cv.width = 1000; cv.height = 380;
    var marks = {}; if (tf.scIdx >= 0) marks[tf.scIdx] = 'SC'; if (tf.arIdx >= 0) marks[tf.arIdx] = 'AR';
    try {
      WyckoffChart.draw(cv, candles, { marks: marks, sup: tf.sup, res: tf.res, take: take || undefined });
      return cv.toDataURL('image/png');
    } catch (e) { return ''; }
  }

  // ── QDATA לצ'ק-ליסט (הסברי-סוחרים גנריים + "עכשיו" מהנתונים שלי) ──
  function buildQData(r) {
    var WHY = {
      1: 'הטיה זה הכיוון הכללי שהדגים הגדולים דוחפים אליו. סוחרים רק עם הזרם, לא נגדו.',
      2: 'שלב B = השוק עדיין אוסף סחורה, מבלבל. שלב C/D = האירוע האמיתי (ספרינג/פריצה) — שם הכסף.',
      3: 'קונפלואנס = כמה סיבות שמתכנסות לאותה רמה. שם העסקאות הטובות. אמצע = שטח הפקר.',
      4: 'טריגר = נר האישור שאומר "עכשיו". נפח נמוך בטסט מוכיח שאין מוכרים שנותרו.',
      5: 'R:R = כמה מסכנים מול כמה אפשר להרוויח. 3R = על כל שקל סיכון, שלושה רווח.',
      6: 'לא מסכנים יותר מ-1% בעסקה. רצף הפסדים לא מוחק אותך.',
      7: 'אלטים זזים אחרי ביטקוין. אקומולציה באלט לא שווה כלום אם ביטקוין נופל.',
      8: 'OI = כמה כסף ממונף פתוח. פאנדינג = מי משלם למי. מגלים אם פריצה אמיתית או מלכודת.'
    };
    var TIP = {
      1: 'כשאין הטיה ברורה — היד על ההדק נחה. מחכים שהשוק יחליט.',
      2: 'לא נכנסים בשלב B — שם רוב ההפסדים. מחכים לאירוע של שלב C.',
      3: 'קנייה באמצע = סטופ רחוק ויעד קרוב = יחס גרוע. מחכים לקצה.',
      4: 'בלי טריגר — אין כניסה. וכשהנפח דק, אפילו טריגר "יפה" חשוד.',
      5: 'הפילטר שמפריד מקצוענים מחובבים. מתחת ל-3R — מוותרים.',
      6: 'זה מה שמשאיר אותך במשחק. הגודל חשוב יותר מהכיוון.',
      7: 'כשתסחור אלט: תמיד תבדוק קודם מה ביטקוין עושה.',
      8: 'פריצה עם OI עולה = אמיתית. עם OI יורד = מלכודת, תתרחק.'
    };
    var q = {};
    r.checklist.forEach(function (c) {
      q[c.n] = { t: c.label, s: (c.state === 'yes' ? '✓ ' : c.state === 'no' ? '✗ ' : '— ') + c.note, why: WHY[c.n], now: c.note, tip: TIP[c.n] };
    });
    return q;
  }

  // ── בניית ה-HTML של הדוח (תבנית הסקיל) ──
  function buildReportHTML(r, bundle, imgs) {
    var M = r.money, D = r.tfs.d, H4 = r.tfs.h4, H1 = r.tfs.h1;
    var wk = weeklyBias(bundle.d);
    var rngTxt = r.range ? (M(r.range.sup) + '–' + M(r.range.res)) : '—';

    function tfRow(name, bias, biasC, stage, event, ctrlTxt, ctrlC) {
      return '<tr><td>' + name + '</td><td class="' + biasC + '">' + bias + '</td><td>' + stage +
        '</td><td>' + esc(event) + '</td><td class="' + ctrlC + '">' + esc(ctrlTxt) + '</td></tr>';
    }
    var table =
      '<table><tr><th>טווח</th><th>הטיה</th><th>שלב</th><th>אירוע אחרון</th><th>שליטה (נפח)</th></tr>' +
      tfRow('שבועי', wk.t, wk.c, '—', r.range ? 'שפל ' + M(r.range.sup) : '—', wk.t === 'דובי' ? 'מומנטום שלילי' : 'מומנטום', wk.c) +
      tfRow('יומי', D.conviction, biasCls(D.conviction), '<b>' + D.phase + '</b>', D.event, D.control.tag, ctrlCellCls(D.control.tag)) +
      tfRow('4H', H4.conviction, biasCls(H4.conviction), H4.phase, H4.event, H4.control.tag, ctrlCellCls(H4.control.tag)) +
      tfRow('1H', H1.conviction, biasCls(H1.conviction), H1.phase, H1.event, H1.control.tag, ctrlCellCls(H1.control.tag)) +
      '<tr><td>15m</td><td class="r">דשדוש</td><td>—</td><td>תנועה דקה</td><td class="muted">לא רלוונטי</td></tr>' +
      '</table><p class="sub">OI/פאנדינג: <span class="muted">לא נבדק (פיד ספוט Binance)</span></p>';

    function ctrlBlock(emoji, name, tf, img) {
      return '<h3>' + emoji + ' ' + name + '</h3>' +
        (img ? '<img class="wkchart" src="' + img + '" alt="גרף ' + name + '">' : '') +
        '<div class="read"><span class="ctrl-tag ' + ctrlCls(tf.control.tag) + '">' + esc(tf.control.tag) + '</span><br>' +
        '<b class="lbl">קריאת נפח:</b> ' + esc(tf.control.why) + ' שלב ' + tf.phase + ' · ' + esc(tf.event) + '.</div>';
    }
    var control =
      '<h2 class="ctrl">⚖️ מי שולט? — היצע מול ביקוש לפי הנפח (יומי → שעתי)</h2>' +
      '<p class="muted" style="margin-bottom:6px">בשיטת וויקוף בודקים את <b>מגמת הנפח</b> ישירות על ההיסטוגרמה: נפח בעליות = ביקוש, נפח בירידות = היצע. נפח ירידות שפוחת (Supply decrease) = המוכרים מתעייפים; נפח עליות שמתייבש (No Demand) = הקונים נעלמים.</p>' +
      ctrlBlock('📅', 'יומי', D, imgs.d) + ctrlBlock('🕓', '4 שעות', H4, imgs.h4) + ctrlBlock('🕐', 'שעתי', H1, imgs.h1);

    // תרחישים
    var scen = '<h2 class="star">⭐ תרחישים עתידיים בנקודות מפתח</h2>';
    r.scenarios.forEach(function (s) {
      var cls = s.kind === 'short' ? 'short' : 'long';
      scen += '<div class="scen ' + cls + '"><h3 class="' + (s.kind === 'short' ? 'r' : 'g') + '">' + esc(s.title) + '</h3>' +
        '<ul><li><b>טריגר:</b> ' + esc(s.trigger) + '</li>' +
        '<li><b>כניסה:</b> <code>' + M(s.entry) + '</code> · <b>סטופ:</b> <code>' + M(s.sl) + '</code></li>' +
        '<li><b>יעד 1:</b> <code>' + M(s.tp1) + '</code> · <b>יעד 2:</b> <code>' + M(s.tp2) + '</code> · <b>R:R ≈ ' + s.rr + '</b></li></ul></div>';
    });

    // מסקנה
    var spring = r.scenarios[0] || null;
    var optHtml = '';
    if (spring && r.range) {
      optHtml = '<h2 class="fin">🎯 מסקנה — נקודת הכניסה האופטימלית</h2>' +
        '<div class="opt"><h3>לונג בספרינג סביב ' + M(r.range.sup) + '–' + M(r.range.sup * 1.03) + '</h3>' +
        '<p>ניתוח הנפח: <b>' + esc(D.control.why) + '</b> זה הרקע שמקדים ספרינג — ניעור אחרון מתחת לתמיכה לפני מארקאפ. <b>לונג A</b> נותן R:R ≈ ' + spring.rr + ', סטופ מתחת לבריכת הנזילות, יעד ' + M(spring.tp2) + '.</p>' +
        '<p style="margin-bottom:0"><b>למה לא עכשיו:</b> ' + esc(r.verdictWhy) + ' <span class="a">' + vWord(r.verdict) + '.</span></p></div>' +
        '<table><tr><th>תרחיש</th><th>טריגר</th><th>R:R</th><th>דירוג</th></tr>' +
        r.scenarios.map(function (s, i) {
          var stars = i === 0 ? '★★★ מועדף' : i === 1 ? '★★ טוב' : '★★ מותנה';
          return '<tr><td class="' + (s.kind === 'short' ? 'r' : 'g') + '">' + esc(s.title.replace(/^[^—]*—\s*/, '').replace(/[🟢🔵🔴]/g, '')) +
            '</td><td>' + esc(s.trigger.slice(0, 40)) + '…</td><td>≈' + s.rr + 'R</td><td class="a">' + stars + '</td></tr>';
        }).join('') + '</table>';
    }

    // צ'ק-ליסט
    var critCount = r.checklist.slice(0, 4).filter(function (q) { return q.state === 'yes'; }).length;
    var checklist = '<h2>✅ צ\'ק-ליסט 8 השאלות — מצב נוכחי</h2>' +
      '<p class="muted" style="font-size:.85rem;margin-bottom:6px">👆 לחץ על כל שורה להסבר בשפה של סוחרים</p>' +
      '<table class="checklist"><tr><th>#</th><th>שאלה</th><th>סטטוס</th></tr>' +
      r.checklist.map(function (q) {
        var cls = q.state === 'yes' ? 'g' : q.state === 'no' ? 'r' : q.state === 'warn' ? 'muted' : 'a';
        var mark = q.state === 'yes' ? '✓ ' : q.state === 'no' ? '✗ ' : '— ';
        return '<tr data-q="' + q.n + '"><td>' + q.n + '</td><td>' + esc(q.label) + '</td><td class="' + cls + '">' + mark + esc(q.note) + '</td></tr>';
      }).join('') + '</table>' +
      '<p style="margin-top:8px"><b>' + critCount + '/4 בשאלות הקריטיות ⇒ <span class="a">' + vWord(r.verdict) + '</span>.</b></p>';

    // מה מבטל
    var invalid = '<h2>🚫 מה מבטל הכל</h2><ul>' +
      (r.range ? '<li><b>סגירת יומי מתחת ' + M(r.range.sup) + '</b> ללא ריקליים → אין ספרינג; המבנה הופך לדובי.</li>' +
        '<li><b>פריצת ' + M(r.range.res) + ' בנפח נמוך</b> שחוזרת לטווח → UT, מבטל את הפריצה הלונגית.</li>' : '') +
      '<li><b>טסט/פולבק בנפח 80%+</b> מהממוצע → ההיצע נשאר, הסטאפ מבוטל.</li></ul>';

    var header =
      '<header><h1>📈 מנתח וויקוף עצמאי — ' + esc(r.symbol) + '</h1>' +
      '<p class="sub">' + fmtDate(r.asof) + ' UTC · מחיר <b>' + M(r.price) + '</b> · Binance · מנוע-חוקים (ללא קלוד) · 4 טווחים</p>' +
      '<div class="verdict ' + vCls(r.verdict) + '" data-verdict title="לחץ להסבר">' + vWord(r.verdict) + '</div>' +
      '<div style="font-size:.78rem;color:#7a8699;margin-top:-4px">👆 לחץ על הפסיקה להסבר על WAIT / GO / NO-GO</div>' +
      '<p class="sub">' + esc(r.verdictWhy) + '</p></header>';

    return '<div class="wrap">' +
      '<div class="exportbar"><button class="exbtn pdf" data-export="pdf">🖨️ ייצוא ל-PDF</button>' +
      '<button class="exbtn html" data-export="html">💾 ייצוא ל-HTML</button></div>' +
      header +
      '<section><h2>טבלת רב-טווחים</h2>' + table + '</section>' +
      '<section>' + control + '</section>' +
      '<section>' + scen + '</section>' +
      '<section>' + optHtml + '</section>' +
      '<section>' + checklist + '</section>' +
      '<section>' + invalid + '</section>' +
      '<div class="disc">📚 מידע חינוכי בלבד — אינו ייעוץ השקעות. ניתוח דטרמיניסטי (מנוע-חוקים) — קירוב שיטת וויקוף ללא שיפוט אנושי. נתונים: Binance ספוט.</div>' +
      '<div class="wk-qoverlay" data-overlay><div class="wk-qbox"><h3 id="wk-qt"></h3><div class="qsub" id="wk-qs"></div><div id="wk-qbody"></div><button class="qclose" data-qclose>סגירה</button></div></div>' +
      '</div>';
  }

  // ── מודאל (פסיקה + שאלה) — חי, דרך delegation ──
  function openModal(root, title, sub, bodyHtml) {
    var ov = root.querySelector('[data-overlay]'); if (!ov) return;
    root.querySelector('#wk-qt').textContent = title;
    root.querySelector('#wk-qs').textContent = sub || '';
    root.querySelector('#wk-qbody').innerHTML = bodyHtml;
    ov.classList.add('show');
  }
  function wireModal(root, r) {
    var QD = buildQData(r);
    root.addEventListener('click', function (e) {
      var qrow = e.target.closest('[data-q]');
      var vEl = e.target.closest('[data-verdict]');
      var close = e.target.closest('[data-qclose]');
      var ov = e.target.closest('[data-overlay]');
      if (qrow) {
        var n = +qrow.getAttribute('data-q'), d = QD[n]; if (!d) return;
        openModal(root, n + '. ' + d.t, d.s, '<div class="qblock"><div class="qlabel why">💡 מה זה אומר</div><p>' + esc(d.why) + '</p></div>' +
          '<div class="qblock"><div class="qlabel now">📍 איפה אנחנו עכשיו</div><p>' + esc(d.now) + '</p></div>' +
          '<div class="qblock"><div class="qlabel tip">🎯 מה זה אומר לך כסוחר</div><p>' + esc(d.tip) + '</p></div>');
      } else if (vEl) {
        openModal(root, 'מה אומרת הפסיקה? ' + vWord(r.verdict), 'הפסיקה היא תמונת-מצב לעכשיו. ⏸/🟢/✋ הם אייקונים, לא ספרות.',
          '<div class="qblock"><div class="qlabel" style="color:#b9821f">⏸ WAIT</div><p>המבנה תקין אבל אין כניסה — חסר טריגר/מחיר לא באזור. רוב הזמן בוויקוף זו התשובה הנכונה.</p></div>' +
          '<div class="qblock"><div class="qlabel why">🟢 GO</div><p>כל התנאים מתקיימים: הטיה, שלב C/D מאומת-נפח, מחיר באזור, טריגר 15m, R:R≥3.</p></div>' +
          '<div class="qblock"><div class="qlabel" style="color:#c44b42">✋ NO-GO</div><p>משהו פוסל: סתירה בין טווחים, נפח שלא מאשר, או חוק ביטול.</p></div>');
      } else if (close || (ov && e.target === ov)) {
        root.querySelector('[data-overlay]').classList.remove('show');
      } else if (e.target.closest('[data-export]')) {
        var kind = e.target.closest('[data-export]').getAttribute('data-export');
        if (kind === 'pdf') window.print(); else exportReport(root, r);
      }
    });
  }

  // ── ייצוא: מסמך עצמאי עם CSS לא-ממוקד + סקריפט מודאל מוטמע ──
  function exportReport(root, r) {
    try {
      var inner = root.querySelector('.wrap').outerHTML;
      var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>וויקוף — ' + esc(r.symbol) + '</title>' +
        '<style>' + EXPORT_CSS + '</style></head><body>' + inner +
        '<script>' + EXPORT_JS + '<\/script></body></html>';
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'wyckoff-' + r.symbol + '-' + r.asof.toISOString().slice(0, 10) + '.html' });
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
      if (window.App && App.toast) App.toast('💾 הדוח יורד כ-HTML עצמאי');
    } catch (e) { if (window.App && App.toast) App.toast('הייצוא נכשל'); }
  }

  // ── הרצה ──
  function run(host, symInput, btn) {
    var symbol = (symInput.value || 'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    try { localStorage.setItem(LS, symbol); } catch (e) {}
    host.innerHTML = '';
    host.appendChild(el('div', { class: 'wk-loading' }, [el('div', { class: 'wk-spin' }), el('div', {}, 'מושך נתונים ומנתח ' + symbol + '…')]));
    btn.disabled = true;
    WyckoffData.fetchAll(symbol, 'binance').then(function (bundle) {
      var r = WyckoffEngine.analyze(bundle);
      var imgs = { d: chartImg(bundle.d, r.tfs.d), h4: chartImg(bundle.h4, r.tfs.h4, 60), h1: chartImg(bundle.h1, r.tfs.h1, 50) };
      var report = el('div', { class: 'wk-report', html: buildReportHTML(r, bundle, imgs) });
      host.innerHTML = ''; host.appendChild(report);
      wireModal(report, r);
    }).catch(function (e) {
      host.innerHTML = '';
      host.appendChild(el('div', { class: 'wk-fail' }, '⚠️ ' + (e && e.message ? e.message : 'שגיאה במשיכת הנתונים — בדקו את שם הזוג (BTCUSDT).')));
    }).then(function () { btn.disabled = false; });
  }

  function render(root) {
    if (!window.WyckoffData || !window.WyckoffEngine || !window.WyckoffChart) {
      root.appendChild(el('div', { class: 'wk-fail' }, 'מודולי הוויקוף לא נטענו — רעננו את הדף.')); return;
    }
    var saved = 'BTCUSDT'; try { saved = localStorage.getItem(LS) || 'BTCUSDT'; } catch (e) {}
    var input = el('input', { class: 'wk-input', type: 'text', value: saved, placeholder: 'BTCUSDT', autocomplete: 'off' });
    var btn = el('button', { class: 'wk-analyze' }, '🔍 נתח');
    var host = el('div', { class: 'wk-host' });
    var bar = el('div', { class: 'wk-bar' }, [
      el('span', { class: 'wk-coin' }, '₿'), input, btn,
      el('span', { class: 'wk-quick' }, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(function (s) {
        return el('button', { class: 'wk-chip', onClick: function () { input.value = s; run(host, input, btn); } }, s.replace('USDT', ''));
      }))
    ]);
    btn.addEventListener('click', function () { run(host, input, btn); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(host, input, btn); });
    root.appendChild(el('div', { class: 'wk-view' }, [bar, host]));
    run(host, input, btn);
  }

  // ── כרטיס דשבורד: "📈 דוח וויקוף עצמאי" (הרחבה רכה דרך DASHBOARD_WIDGETS) ──
  function dashCard() {
    var card = el('div', { class: 'card wk-dash-card' }, [
      el('h2', { style: 'margin:0 0 2px' }, '📈 דוח וויקוף עצמאי'),
      el('p', { class: 'sub', style: 'margin:0' }, 'ניתוח קריפטו חי לפי שיטת וויקוף — רץ באתר עצמו, ללא קלוד.'),
      el('div', { class: 'wk-dash-btns' }, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(function (s) {
        return el('button', { class: 'wk-dash-btn primary', onClick: function () {
          try { localStorage.setItem(LS, s); } catch (e) {}
          location.hash = '#/wyckoff';
        } }, s.replace('USDT', ''));
      }))
    ]);
    return card;
  }
  if (window.DASHBOARD_WIDGETS) window.DASHBOARD_WIDGETS.push(dashCard);

  // ── CSS לא-ממוקד לייצוא (תבנית הסקיל המקורית, מסמך עצמאי) ──
  var EXPORT_CSS = ":root{--bg:#f6f8fb;--card:#fff;--card2:#f3f6fa;--border:#e6eaf0;--text:#2b3648;--muted:#7a8699;--accent:#4f7fd1;--green:#2faa6a;--red:#e06a62;--amber:#cf9224;--cyan:#3a9fb0;--pink:#c77fa6}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.7;padding:26px 14px}.wrap{max-width:980px;margin:0 auto}header{text-align:center;margin-bottom:16px}h1{font-size:1.5rem;color:#34425c}.verdict{display:inline-block;font-size:2rem;font-weight:800;letter-spacing:2px;padding:7px 38px;border-radius:13px;margin:10px 0;background:#fdf6e6;color:#b9821f;border:2px solid #e9c877;cursor:pointer}.verdict.go{background:#e7f7ee;color:#1f8a54;border-color:#97d8b4}.verdict.nogo{background:#fceae8;color:#c44b42;border-color:#f0b7b0}.sub{color:var(--muted);font-size:.9rem}section{background:var(--card);border:1px solid var(--border);border-radius:13px;padding:18px 20px;margin-bottom:15px}h2{font-size:1.15rem;margin-bottom:10px;padding-right:10px;border-right:4px solid var(--accent);color:#3a4a66}h2.tf{border-right-color:var(--cyan)}h2.star{border-right-color:var(--amber)}h2.fin{border-right-color:var(--green)}h2.ctrl{border-right-color:var(--pink)}h3{font-size:1rem;color:#3a4a66;margin:12px 0 4px}table{width:100%;border-collapse:collapse;margin:8px 0;font-size:.85rem}th{background:var(--card2);color:#42598a;padding:7px 9px;text-align:right;border:1px solid var(--border)}td{padding:7px 9px;border:1px solid var(--border);vertical-align:top}tr:nth-child(even) td{background:#fafbfd}.g{color:var(--green);font-weight:bold}.r{color:var(--red);font-weight:bold}.a{color:var(--amber);font-weight:bold}.muted{color:var(--muted)}.read{background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:11px 14px;margin:8px 0;font-size:.9rem}.read b.lbl{color:var(--cyan)}.ctrl-tag{display:inline-block;font-size:.78rem;font-weight:bold;border-radius:20px;padding:2px 11px;margin-bottom:6px}.ctrl-buy{background:#e7f5ee;color:#1f8a54}.ctrl-sell{background:#fceae8;color:#c44b42}.ctrl-mix{background:#fbf2e0;color:#9a6f1d}.wkchart{width:100%;border-radius:9px;display:block;margin:4px 0}.scen{border-radius:11px;padding:14px;margin:10px 0;border:1px solid var(--border)}.long{background:#f1faf4;border-color:#bce3cd}.short{background:#fdf2f1;border-color:#f0cac6}.scen h3{margin-bottom:6px;font-size:1rem}.scen ul{padding-right:18px;font-size:.86rem}.scen li{margin-bottom:4px}code{background:#eef2f8;border:1px solid var(--border);border-radius:5px;padding:1px 6px;color:#2b6cb0;direction:ltr;display:inline-block;font-size:.85em}.opt{background:#f1faf4;border:2px solid var(--green);border-radius:12px;padding:16px;margin:10px 0}.opt h3{color:#268a55;font-size:1.1rem;margin-bottom:8px}.disc{background:#fdf8ec;border:1px solid #ecdcb0;border-radius:9px;padding:10px 14px;margin:13px 0;color:#8a6d2f;font-size:.82rem}ul,ol{padding-right:20px}li{margin-bottom:4px}.checklist tr[data-q]{cursor:pointer}.checklist tr[data-q]:hover td{background:#eaf1fb!important}.exportbar{display:flex;gap:10px;margin-bottom:14px}.exbtn{font-family:inherit;font-size:.9rem;font-weight:600;border-radius:10px;padding:9px 18px;cursor:pointer;border:1px solid}.exbtn.pdf{background:#fdeceb;color:#c44b42;border-color:#f0cac6}.exbtn.html{background:#eaf1fb;color:#2b6cb0;border-color:#c5d8f0}.wk-qoverlay{position:fixed;inset:0;background:rgba(40,55,85,.45);display:none;align-items:center;justify-content:center;z-index:999;padding:18px}.wk-qoverlay.show{display:flex}.wk-qbox{background:#fff;border:1px solid #e6eaf0;border-radius:16px;max-width:560px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(40,60,100,.25)}.wk-qbox h3{color:#3a4a66;font-size:1.15rem;margin-bottom:4px}.wk-qbox .qsub{color:#7a8699;font-size:.82rem;margin-bottom:14px}.wk-qbox .qblock{margin-bottom:13px}.wk-qbox .qlabel{font-weight:bold;font-size:.9rem;margin-bottom:3px}.wk-qbox .qlabel.why{color:#2faa6a}.wk-qbox .qlabel.now{color:#cf9224}.wk-qbox .qlabel.tip{color:#3a9fb0}.wk-qbox p{font-size:.92rem;line-height:1.65;color:#3a4456}.wk-qbox .qclose{margin-top:12px;width:100%;background:#eef2f8;color:#3a4a66;border:1px solid #e6eaf0;border-radius:10px;padding:10px;cursor:pointer}@media print{.exportbar{display:none!important}body{padding:0;background:#fff}section{box-shadow:none;break-inside:avoid}.wk-qoverlay{display:none!important}}";

  // ── סקריפט מודאל מוטמע בייצוא (delegation, ללא תלות חיצונית) ──
  var EXPORT_JS = "(function(){var ov=document.querySelector('[data-overlay]');function open(t,s,b){document.getElementById('wk-qt').textContent=t;document.getElementById('wk-qs').textContent=s||'';document.getElementById('wk-qbody').innerHTML=b;ov.classList.add('show');}document.addEventListener('click',function(e){var q=e.target.closest('[data-q]'),v=e.target.closest('[data-verdict]'),c=e.target.closest('[data-qclose]'),o=e.target.closest('[data-overlay]'),ex=e.target.closest('[data-export]');if(ex){if(ex.getAttribute('data-export')==='pdf')window.print();else{var blob=new Blob([document.documentElement.outerHTML],{type:'text/html'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wyckoff.html';a.click();}return;}if(c||(o&&e.target===o)){ov.classList.remove('show');return;}if(v){open('הפסיקה','⏸/🟢/✋ אייקונים, לא ספרות','<p>WAIT=המתן · GO=כניסה · NO-GO=הישאר בחוץ.</p>');return;}if(q){var tr=q;var cells=tr.querySelectorAll('td');open(cells[0].textContent+'. '+cells[1].textContent,cells[2].textContent,'<p>הסבר מלא זמין בתצוגה החיה באתר.</p>');}});})();";

  if (window.App && App.register) App.register('wyckoff', render);
})();
