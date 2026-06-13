(function () {
  'use strict';
  // ── wyckoff/index.js — ה-view של מנתח הוויקוף העצמאי (App.register('wyckoff')) ──
  // אחריות: קלט סימבול → WyckoffData (Binance) → WyckoffEngine → רינדור דוח עם
  // גרפים (WyckoffChart), פסיקה, טבלאות, תרחישים, צ'ק-ליסט, וייצוא. אפס LLM/שרת.

  function el(t, a, k) {
    var n = document.createElement(t);
    if (a) Object.keys(a).forEach(function (key) {
      var v = a[key]; if (v == null) return;
      if (key === 'class') n.className = v;
      else if (key === 'html') n.innerHTML = v;
      else if (key === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (key.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(key.slice(2).toLowerCase(), v);
      else n.setAttribute(key, v);
    });
    if (k != null) (Array.isArray(k) ? k : [k]).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return n;
  }
  var LS = 'wyckoff.lastSymbol';
  var _bundle = null, _result = null;

  function verdictClass(v) { return v === 'GO' ? 'wk-go' : v === 'NO-GO' ? 'wk-nogo' : 'wk-wait'; }
  function verdictIcon(v) { return v === 'GO' ? '🟢 GO' : v === 'NO-GO' ? '✋ NO-GO' : '⏸ WAIT'; }
  function stateMark(s) { return s === 'yes' ? '✓' : s === 'no' ? '✗' : s === 'part' ? '◐' : '⚠'; }
  function stateClass(s) { return s === 'yes' ? 'wk-yes' : s === 'no' ? 'wk-no' : 'wk-part'; }
  function convClass(c) { return c.indexOf('שורי') > -1 ? 'wk-bull' : c.indexOf('דובי') > -1 ? 'wk-bear' : 'wk-neut'; }

  // ── רינדור הדוח ──
  function renderReport(host, r) {
    var M = WyckoffEngine.money;
    host.innerHTML = '';
    var doc = el('div', { class: 'wk-doc' });

    // כותרת + פסיקה
    doc.appendChild(el('div', { class: 'wk-card' }, [
      el('h1', {}, '🤖 מנתח וויקוף — ' + r.symbol),
      el('div', { class: 'wk-sub' }, 'נתוני נרות חיים · Binance · ' + r.asof.toISOString().slice(0, 16).replace('T', ' ') + ' UTC · מחיר: ' + M(r.price)),
      el('div', { class: 'wk-verdict ' + verdictClass(r.verdict) }, verdictIcon(r.verdict)),
      el('div', { class: 'wk-ctrl' }, [
        el('b', {}, '🕐 שליטה כעת: '), r.overall,
        el('div', { class: 'wk-why' }, r.verdictWhy)
      ])
    ]));

    // טבלת רב-טווחים
    var tbl = el('table', { class: 'wk-tbl' });
    tbl.appendChild(el('thead', {}, el('tr', {}, ['טווח', 'שלב', 'מבנה', 'אירוע', 'תודעה', 'שליטה (נפח)'].map(function (h) { return el('th', {}, h); }))));
    var tb = el('tbody');
    [['Daily', r.tfs.d], ['4H', r.tfs.h4], ['1H', r.tfs.h1]].forEach(function (row) {
      var t = row[1];
      tb.appendChild(el('tr', {}, [
        el('td', {}, el('b', {}, row[0])),
        el('td', {}, t.phase),
        el('td', {}, t.structure),
        el('td', {}, t.event),
        el('td', { class: convClass(t.conviction) }, t.conviction + ' · ' + t.strength),
        el('td', {}, t.control.tag)
      ]));
    });
    tbl.appendChild(tb);
    doc.appendChild(el('div', { class: 'wk-card' }, [el('h2', {}, '📊 טבלת רב-טווחים'), tbl,
      el('div', { class: 'wk-hint' }, '💡 ' + r.tfs.d.note)]));

    // גרפים
    [['Daily', r.tfs.d, _bundle.d, 0], ['4H', r.tfs.h4, _bundle.h4, 60], ['1H', r.tfs.h1, _bundle.h1, 50]].forEach(function (g) {
      var name = g[0], tf = g[1], candles = g[2], take = g[3];
      var cv = el('canvas', { width: 1000, height: 420, class: 'wk-canvas' });
      doc.appendChild(el('div', { class: 'wk-card' }, [el('h2', {}, '📈 גרף ' + name), cv,
        el('div', { class: 'wk-legend' }, 'SC/AR מסומנים · אדום מקווקו=התנגדות ' + (tf.res ? M(tf.res) : '—') + ' · ירוק=תמיכה ' + (tf.sup ? M(tf.sup) : '—'))]));
      // צייר אחרי שה-canvas בעץ
      var marks = {}; if (tf.scIdx >= 0) marks[tf.scIdx] = 'SC'; if (tf.arIdx >= 0) marks[tf.arIdx] = 'AR';
      setTimeout(function () { WyckoffChart.draw(cv, candles, { marks: marks, sup: tf.sup, res: tf.res, take: take || undefined }); }, 0);
    });

    // טבלת V/1%
    var vt = el('table', { class: 'wk-tbl' });
    vt.appendChild(el('thead', {}, el('tr', {}, ['תאריך', 'אירוע', 'נפח', 'טווח %', 'V/1%', 'משמעות'].map(function (h) { return el('th', {}, h); }))));
    var vb = el('tbody');
    r.v1Table.forEach(function (row) {
      vb.appendChild(el('tr', {}, [el('td', {}, row.date), el('td', {}, el('b', {}, row.ev)),
        el('td', {}, Math.round(row.vol).toLocaleString('en-US')), el('td', {}, row.rangePct + '%'),
        el('td', {}, Math.round(row.v1).toLocaleString('en-US')), el('td', {}, row.meaning)]));
    });
    vt.appendChild(vb);
    doc.appendChild(el('div', { class: 'wk-card' }, [el('h2', {}, '📊 ניתוח נפח (V/1%)'), vt]));

    // תרחישים
    var scn = el('div', { class: 'wk-card' }, [el('h2', {}, '🎯 תרחישים מזוינים מראש')]);
    r.scenarios.forEach(function (s) {
      scn.appendChild(el('div', { class: 'wk-scn wk-scn-' + s.kind }, [
        el('h3', {}, s.title),
        el('div', { class: 'wk-trig' }, ['⚡ הפעלה: ', s.trigger]),
        el('div', { class: 'wk-lvls' },
          'כניסה ' + M(s.entry) + ' · SL ' + M(s.sl) + ' · TP1 ' + M(s.tp1) + ' · TP2 ' + M(s.tp2) + ' · R:R ≈ ' + s.rr)
      ]));
    });
    doc.appendChild(scn);

    // צ'ק-ליסט
    var ck = el('table', { class: 'wk-tbl wk-chk' });
    var ckb = el('tbody');
    r.checklist.forEach(function (q) {
      ckb.appendChild(el('tr', {}, [
        el('td', { class: stateClass(q.state) }, stateMark(q.state)),
        el('td', {}, q.n + '. ' + q.label),
        el('td', { class: 'wk-note' }, q.note)
      ]));
    });
    ck.appendChild(ckb);
    doc.appendChild(el('div', { class: 'wk-card' }, [el('h2', {}, '✅ צ\'ק-ליסט 8 השאלות'), ck,
      el('div', { class: 'wk-hint' }, 'פסיקה: ' + verdictIcon(r.verdict) + ' — ' + r.verdictWhy)]));

    // דיסקליימר + ייצוא
    doc.appendChild(el('div', { class: 'wk-card wk-foot' }, [
      el('div', { class: 'wk-actions' }, [
        el('button', { class: 'wk-btn', onClick: function () { exportReport(r); } }, '💾 ייצוא ל-HTML'),
        el('button', { class: 'wk-btn', onClick: function () { window.print(); } }, '🖨️ הדפסה')
      ]),
      el('p', { class: 'wk-disc' }, '📚 מידע חינוכי בלבד — אינו ייעוץ השקעות. ניתוח דטרמיניסטי (מנוע-חוקים) — קירוב של שיטת הוויקוף, ללא שיפוט אנושי. נתונים: Binance ספוט.')
    ]));

    host.appendChild(doc);
  }

  // ── ייצוא: צילום ה-canvas ל-PNG והטמעה במסמך עצמאי (כמו דוח הסקיל האמיתי) ──
  function exportReport(r) {
    try {
      var doc = document.querySelector('.wk-doc');
      var clone = doc.cloneNode(true);
      // המר כל canvas ל-img base64
      var srcCanvases = doc.querySelectorAll('canvas');
      var dstCanvases = clone.querySelectorAll('canvas');
      dstCanvases.forEach(function (cnv, i) {
        try {
          var img = document.createElement('img');
          img.src = srcCanvases[i].toDataURL('image/png');
          img.style.width = '100%'; img.className = 'wk-canvas';
          cnv.parentNode.replaceChild(img, cnv);
        } catch (e) {}
      });
      clone.querySelectorAll('.wk-actions').forEach(function (a) { a.remove(); });
      var css = document.getElementById('wk-export-css') ? document.getElementById('wk-export-css').textContent : '';
      var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
        '<title>וויקוף — ' + r.symbol + '</title><style>' + WK_EXPORT_CSS + '</style></head><body>' +
        clone.outerHTML + '</body></html>';
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'wyckoff-' + r.symbol + '-' + r.asof.toISOString().slice(0, 10) + '.html' });
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
      if (window.App && App.toast) App.toast('💾 הדוח יורד כ-HTML עצמאי');
    } catch (e) { if (window.App && App.toast) App.toast('הייצוא נכשל'); }
  }

  // ── הרצת ניתוח ──
  function run(host, symInput, btn) {
    var symbol = (symInput.value || 'BTCUSDT').trim().toUpperCase();
    try { localStorage.setItem(LS, symbol); } catch (e) {}
    host.innerHTML = '';
    host.appendChild(el('div', { class: 'wk-loading' }, [el('div', { class: 'wk-spin' }), el('div', {}, 'מושך נתונים ומנתח ' + symbol + '…')]));
    btn.disabled = true;
    WyckoffData.fetchAll(symbol, 'binance').then(function (bundle) {
      _bundle = bundle;
      _result = WyckoffEngine.analyze(bundle);
      renderReport(host, _result);
    }).catch(function (e) {
      host.innerHTML = '';
      host.appendChild(el('div', { class: 'wk-fail' }, '⚠️ ' + (e && e.message ? e.message : 'שגיאה במשיכת הנתונים — בדקו את שם הזוג (BTCUSDT) ואת החיבור.')));
    }).then(function () { btn.disabled = false; });
  }

  function render(root) {
    if (!window.WyckoffData || !window.WyckoffEngine || !window.WyckoffChart) {
      root.appendChild(el('div', { class: 'wk-fail' }, 'מודולי הוויקוף לא נטענו — רעננו את הדף.'));
      return;
    }
    var saved = ''; try { saved = localStorage.getItem(LS) || 'BTCUSDT'; } catch (e) { saved = 'BTCUSDT'; }
    var input = el('input', { class: 'wk-input', type: 'text', value: saved, placeholder: 'זוג מסחר (BTCUSDT)', autocomplete: 'off' });
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
    run(host, input, btn);   // ריצה ראשונה אוטומטית
  }

  // CSS מוטמע לייצוא (עצמאי, צבעים מפורשים)
  var WK_EXPORT_CSS = '*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;direction:rtl;background:#f4f6f9;color:#1d2430;margin:0;padding:16px;line-height:1.6}.wk-doc{max-width:920px;margin:0 auto}.wk-card{background:#fff;border:1px solid #e3e7ee;border-radius:14px;padding:16px 18px;margin:0 0 14px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 10px}.wk-sub{color:#5b6675;font-size:13px}.wk-verdict{display:inline-block;font-size:30px;font-weight:900;padding:6px 24px;border-radius:12px;margin:8px 0}.wk-wait{background:#fdf4dd;color:#d9a227;border:2px solid #d9a227}.wk-go{background:#e7f7ee;color:#1f9d57;border:2px solid #1f9d57}.wk-nogo{background:#fdecea;color:#d2483b;border:2px solid #d2483b}.wk-ctrl{background:#eef3fb;border:1px solid #d4e0f5;border-radius:10px;padding:10px 14px;font-size:14px}.wk-why{color:#3a4456;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #e3e7ee;padding:6px 9px;text-align:right;vertical-align:top}thead th{background:#eef2f7}.wk-bull{color:#1f9d57;font-weight:700}.wk-bear{color:#d2483b;font-weight:700}.wk-neut{color:#d9a227;font-weight:700}.wk-canvas{width:100%;border-radius:10px;display:block}.wk-legend{font-size:12px;color:#5b6675;margin-top:5px}.wk-hint{background:#fcf7e6;border:1px solid #ecdca6;border-radius:8px;padding:9px 12px;font-size:13px;margin-top:8px}.wk-scn{border-radius:10px;padding:12px 14px;margin:9px 0;border:1px solid #e3e7ee}.wk-scn-long{background:#f0f9f3;border-color:#bce3cc}.wk-scn-short{background:#fdf1ef;border-color:#f0c7c0}.wk-scn-break{background:#eef3fb;border-color:#cfe0f7}.wk-scn h3{margin:0 0 6px;font-size:15px}.wk-trig{font-size:13px;color:#444;margin-bottom:4px}.wk-lvls{font-weight:700;font-variant-numeric:tabular-nums}.wk-chk td:first-child{text-align:center;font-weight:900;width:34px}.wk-yes{color:#1f9d57}.wk-no{color:#d2483b}.wk-part{color:#d9a227}.wk-note{color:#5b6675;font-size:12.5px}.wk-disc{color:#8a93a0;font-size:12px;text-align:center;margin:6px 0 0}';

  if (window.App && App.register) App.register('wyckoff', render);
})();
