(function () {
  'use strict';
  // ───────────────────────────────────────────────────────────────────────────
  // PBT_ENGINE — מנוע "תרגום ספרי PDF לעברית כולל תרגום תמונות" (overlay).
  //
  // אחריות יחידה: הצנרת הטהורה שמשחזרת בדפדפן את הסקיל
  // hebrew-image-overlay-translation — בלי Claude, בלי שרת תרגום שלנו:
  //   1. רינדור עמוד PDF ל-canvas (pdf.js).
  //   2. OCR מקומי עם תיבות-גבול לכל פסקה (Tesseract.js v5 המאורז — אפס העלאה).
  //   3. תרגום EN→HE של כל פסקה (MyMemory — אותו שירות חינמי של כלי תרגום-PDF).
  //   4. כיסוי הטקסט האנגלי במלבן בצבע-רקע נדגם, וציור העברית מעליו (RTL,
  //      התאמת גודל פונט וריווח כדי למלא את מסגרת הבלוק — מקביל ל-fill_column).
  //      דגימת-רקע חסינה (mode), כיסוי תיבה-צבעונית מלאה, ושומר-ניגודיות —
  //      פורט משיפורי צנרת-השרת כדי שטקסט לא ייצא בלתי-נראה ולא יישארו שאריות.
  //   5. הרכבת כל העמודים המתורגמים ל-PDF (pdf-lib המאורז).
  //
  // אין DOM-של-אפליקציה כאן (רק canvas off-screen). ה-UI, בורר-התיקייה והשמירה
  // חיים ב-index.js. כל הספריות נטענות עצלות מהוונדור המקומי — אפס CDN.
  // ───────────────────────────────────────────────────────────────────────────

  // נתיב-בסיס מוחלט של האפליקציה (תומך גם בתת-נתיב כמו /hamachberet-sheli/).
  // קריטי ל-Tesseract: בתוך ה-Worker נתיבים יחסיים לא נפתרים.
  function appBase() {
    return location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  }
  function tessBase() { return appBase() + 'js/vendor/tesseract/'; }

  // ── טעינת ספריות (עצלה, מקומית) ───────────────────────────────────────────
  function initPdfJs() {
    if (window.pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = appBase() + 'js/vendor/pdfjs.worker.min.js';
    }
  }
  var _tessP = null;
  function ensureTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (_tessP) return _tessP;
    _tessP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = tessBase() + 'tesseract.min.js';
      s.onload = function () { window.Tesseract ? res() : rej(new Error('Tesseract missing')); };
      s.onerror = function () { _tessP = null; rej(new Error('טעינת מנוע ה-OCR נכשלה')); };
      document.head.appendChild(s);
    });
    return _tessP;
  }
  var _libP = null;
  function ensurePdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (_libP) return _libP;
    _libP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = appBase() + 'js/vendor/pdf-lib.min.js';
      s.onload = function () { window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib missing')); };
      s.onerror = function () { _libP = null; rej(new Error('טעינת pdf-lib נכשלה')); };
      document.head.appendChild(s);
    });
    return _libP;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function yield_() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // ── תרגום EN→HE דרך MyMemory (עצמאי לחלוטין — אפס תלות בכלי אחר) ───────────
  var _cache = {};
  function splitChunks(text, MAX) {
    MAX = MAX || 450;
    if (!text || !text.trim()) return [];
    text = text.trim();
    if (text.length <= MAX) return [text];
    var parts = [], pos = 0;
    while (pos < text.length) {
      var end = pos + MAX;
      if (end >= text.length) { parts.push(text.slice(pos).trim()); break; }
      var cut = -1, i;
      for (i = end; i > end - 120 && i > pos; i--) { if ('.!?\n'.indexOf(text[i]) >= 0) { cut = i + 1; break; } }
      if (cut === -1) { for (i = end; i > end - 60 && i > pos; i--) { if (text[i] === ' ') { cut = i; break; } } }
      if (cut === -1) cut = end;
      var c = text.slice(pos, cut).trim();
      if (c) parts.push(c);
      pos = cut;
    }
    return parts;
  }
  async function apiTranslate(text, retries) {
    retries = retries || 0;
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en%7Che';
    try {
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      if (data.responseStatus === 200) {
        var t = (data.responseData && data.responseData.translatedText) || '';
        if (t.indexOf('QUERY LIMIT') === 0 || t.indexOf('MYMEMORY') === 0) return text;
        return t;
      }
      if (data.responseStatus === 429 && retries < 2) { await sleep(2000); return apiTranslate(text, retries + 1); }
      return text;
    } catch (e) {
      if (retries < 1) { await sleep(1500); return apiTranslate(text, retries + 1); }
      return text;
    }
  }
  async function translateText(text, cancelled) {
    if (_cache[text] !== undefined) return _cache[text];
    var chunks = splitChunks(text, 450);
    if (!chunks.length) return '';
    var res = [];
    for (var i = 0; i < chunks.length; i++) {
      if (cancelled && cancelled()) throw new Error('CANCELLED');
      res.push(await apiTranslate(chunks[i], 0));
      if (i < chunks.length - 1) await sleep(150);
    }
    var out = res.join(' ');
    _cache[text] = out;
    return out;
  }

  // ── OCR: פסקאות עם תיבות-גבול ──────────────────────────────────────────────
  async function ocrParagraphs(worker, canvas) {
    var ret = await worker.recognize(canvas, {}, { blocks: true, text: false });
    var blocks = (ret.data && ret.data.blocks) || [];
    var out = [];
    blocks.forEach(function (bl) {
      (bl.paragraphs || []).forEach(function (p) {
        var text = p.text;
        if (!text) {
          text = (p.lines || []).map(function (l) {
            return (l.words || []).map(function (w) { return w.text; }).join(' ');
          }).join(' ');
        }
        text = (text || '').replace(/\s+/g, ' ').trim();
        if (text && p.bbox) out.push({ text: text, bbox: p.bbox, lineCount: (p.lines || []).length || 1 });
      });
    });
    // נפילה: אם לא הוחזרו פסקאות, להשתמש בבלוקים עצמם
    if (!out.length) {
      blocks.forEach(function (bl) {
        var t = (bl.text || '').replace(/\s+/g, ' ').trim();
        if (t && bl.bbox) out.push({ text: t, bbox: bl.bbox, lineCount: 1 });
      });
    }
    return out;
  }

  // לא נוגעים: מספרים/מחירים/תאריכים/שעות/ערכי-ציר/סמלים (כמו בסקיל).
  // + העדפת משתמש: לא מתרגמים תוויות שלבים (Phase A/B/C/D) — נשארות במקור.
  function shouldSkip(t) {
    if (!t) return true;
    var c = t.trim();
    if (c.length < 3) return true;
    if (/^phase\b/i.test(c) && c.length <= 12) return true;   // "Phase A"/"Phase |A|"
    if (/^[A-D]$/.test(c)) return true;                       // תווית-שלב בודדת
    var letters = c.replace(/[^A-Za-zÀ-ɏ]/g, '');
    return letters.length < 2;
  }

  // ── ציור העברית על התמונה ──────────────────────────────────────────────────
  // דגימת-קצוות ישנה — נפילה לבלוקים זעירים בלבד.
  function sampleBgEdges(ctx, b) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var pts = [[b.x0 - 3, b.y0 - 3], [b.x1 + 3, b.y0 - 3], [b.x0 - 3, b.y1 + 3],
      [b.x1 + 3, b.y1 + 3], [(b.x0 + b.x1) / 2, b.y0 - 3], [(b.x0 + b.x1) / 2, b.y1 + 3]];
    var r = 0, g = 0, bl = 0, c = 0;
    for (var i = 0; i < pts.length; i++) {
      var x = Math.max(0, Math.min(W - 1, Math.round(pts[i][0])));
      var y = Math.max(0, Math.min(H - 1, Math.round(pts[i][1])));
      var d = ctx.getImageData(x, y, 1, 1).data;
      r += d[0]; g += d[1]; bl += d[2]; c++;
    }
    return { r: Math.round(r / c), g: Math.round(g / c), b: Math.round(bl / c) };
  }
  // צבע-רקע חסין: הצבע הדומיננטי (mode) על פני פנים הבלוק. חסין לקווי-רשת ולרווחים
  // בין אותיות שגרמו לדגימת-פיקסל-בודד להחזיר לבן בטעות (הבאג שתוקן בצנרת השרת).
  function dominantBg(ctx, b) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var x0 = Math.max(0, Math.round(b.x0)), y0 = Math.max(0, Math.round(b.y0));
    var x1 = Math.min(W, Math.round(b.x1)), y1 = Math.min(H, Math.round(b.y1));
    var w = x1 - x0, h = y1 - y0;
    if (w < 4 || h < 4) return sampleBgEdges(ctx, b);
    var img = ctx.getImageData(x0, y0, w, h).data;
    var counts = {}, sums = {}, step = Math.max(2, Math.round(Math.min(w, h) / 20));
    for (var yy = 0; yy < h; yy += step) {
      for (var xx = 0; xx < w; xx += step) {
        var i = (yy * w + xx) * 4, r = img[i], g = img[i + 1], bb = img[i + 2];
        var key = (r >> 4) + ',' + (g >> 4) + ',' + (bb >> 4);
        counts[key] = (counts[key] || 0) + 1;
        var s = sums[key] || (sums[key] = [0, 0, 0, 0]);
        s[0] += r; s[1] += g; s[2] += bb; s[3]++;
      }
    }
    var bestK = null, bestC = -1;
    for (var k in counts) if (counts[k] > bestC) { bestC = counts[k]; bestK = k; }
    var m = sums[bestK];
    return { r: Math.round(m[0] / m[3]), g: Math.round(m[1] / m[3]), b: Math.round(m[2] / m[3]) };
  }
  function lumOf(c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
  function satOf(c) { return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b); }
  // לתיבה צבעונית מלאה: למצוא את גבולות המלבן בצבע אחיד (לכסות שאריות אנגלית
  // ולצייר תיבה נקייה כמו במקור), בסריקה החוצה ממרכז הבלוק.
  function colorBoxBounds(ctx, b, bg) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var mX = Math.min(90, (b.x1 - b.x0)), mY = Math.min(90, (b.y1 - b.y0));
    var rx0 = Math.max(0, Math.round(b.x0) - mX), ry0 = Math.max(0, Math.round(b.y0) - mY);
    var rx1 = Math.min(W, Math.round(b.x1) + mX), ry1 = Math.min(H, Math.round(b.y1) + mY);
    var rw = rx1 - rx0, rh = ry1 - ry0;
    if (rw < 4 || rh < 4) return null;
    var img = ctx.getImageData(rx0, ry0, rw, rh).data;
    // פרופיל-צפיפות: כמה פיקסלים תואמי-רקע בכל שורה/עמודה. גוף התיבה = ספירה גבוהה;
    // טקסט-פנימי רק מוריד מעט (התיבה רחבה), וקווים דקים/שאריות = ספירה זניחה.
    var rowC = new Int32Array(rh), colC = new Int32Array(rw);
    var step = 2;
    for (var yy = 0; yy < rh; yy += step) {
      for (var xx = 0; xx < rw; xx += step) {
        var i = (yy * rw + xx) * 4;
        if (Math.abs(img[i] - bg.r) + Math.abs(img[i + 1] - bg.g) + Math.abs(img[i + 2] - bg.b) < 60) {
          rowC[yy]++; colC[xx]++;
        }
      }
    }
    function band(arr, n) {
      var mx = 0, j;
      for (j = 0; j < n; j++) if (arr[j] > mx) mx = arr[j];
      if (mx < 3) return null;
      var th = mx * 0.4, lo = -1, hi = -1;
      for (j = 0; j < n; j++) if (arr[j] >= th) { if (lo < 0) lo = j; hi = j; }
      return lo < 0 ? null : [lo, hi];
    }
    var yb = band(rowC, rh), xb = band(colC, rw);
    if (!yb || !xb) return null;
    return { x0: rx0 + xb[0], y0: ry0 + yb[0], x1: rx0 + xb[1], y1: ry0 + yb[1] };
  }
  function rgbStr(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }
  function inkFor(bg) { return lumOf(bg) > 140 ? '#1a1a1a' : '#f7f7f7'; }
  function wrapRtl(ctx, text, maxW, fontPx, family) {
    ctx.font = fontPx + 'px ' + family;
    var words = text.split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width <= maxW || !cur) cur = test;
      else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  }
  // מצייר פסקה אחת: כיסוי רקע + טקסט עברי שממלא את גובה הבלוק. מחזיר true אם צויר.
  function drawParagraph(ctx, bbox, text, lineCount, family) {
    var x0 = bbox.x0, y0 = bbox.y0, x1 = bbox.x1, y1 = bbox.y1;
    var w = x1 - x0, h = y1 - y0;
    if (w < 10 || h < 8) return false;
    family = family || 'Arial, "Segoe UI", "Noto Sans Hebrew", sans-serif';

    var bg = dominantBg(ctx, bbox);
    ctx.fillStyle = rgbStr(bg);
    // תיבה צבעונית מלאה → לכסות את כל המלבן בצבע (להעלים שאריות אנגלית);
    // אחרת הרחבה קלה (בעיקר כלפי מעלה) לכיסוי שאריות אותיות.
    if (satOf(bg) > 40) {
      var cb = colorBoxBounds(ctx, bbox, bg);
      if (cb) ctx.fillRect(cb.x0, cb.y0, cb.x1 - cb.x0, cb.y1 - cb.y0);
      else ctx.fillRect(x0 - 2, y0 - 4, w + 4, h + 7);
    } else {
      ctx.fillRect(x0 - 2, y0 - 4, w + 4, h + 7);
    }

    // שומר-ניגודיות: אם הדיו שנבחר קרוב מדי בבהירות לרקע — להכריח קוטב הפוך.
    var ink = inkFor(bg);
    var inkLum = ink === '#1a1a1a' ? 26 : 247;
    if (Math.abs(lumOf(bg) - inkLum) < 60) {
      ink = lumOf(bg) > 140 ? '#111111' : '#ffffff';
      if (window.console && console.warn) console.warn('[PBT] ניגודיות נמוכה rgb', bg, '→ דיו מוכרח', ink);
    }
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    try { ctx.direction = 'rtl'; } catch (e) {}

    // גודל פונט התחלתי לפי גובה השורה המקורי, ואז כיווץ עד שמתאים לגובה
    var fontPx = Math.max(9, Math.min(46, (h / Math.max(1, lineCount)) * 0.80));
    var lines = wrapRtl(ctx, text, w, fontPx, family);
    var guard = 0;
    while (lines.length * fontPx * 1.2 > h && fontPx > 7 && guard++ < 60) {
      fontPx -= 1;
      lines = wrapRtl(ctx, text, w, fontPx, family);
    }
    // מילוי אנכי: פריסת השורות על פני גובה הבלוק (כמו fill_column)
    var n = lines.length;
    var lineGap = n > 1 ? Math.min(fontPx * 1.7, (h - fontPx) / (n - 1)) : 0;
    var startY = y0 + Math.max(0, (h - ((n - 1) * lineGap + fontPx)) / 2);
    ctx.font = fontPx + 'px ' + family;
    for (var i = 0; i < n; i++) ctx.fillText(lines[i], x1, startY + i * lineGap);
    return true;
  }

  function dataUrlToBytes(u) {
    var b = atob(u.split(',')[1]);
    var a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  async function assemblePdf(pages) {
    var PDFDocument = window.PDFLib.PDFDocument;
    var doc = await PDFDocument.create();
    for (var i = 0; i < pages.length; i++) {
      var img = await doc.embedJpg(pages[i].jpeg);
      var page = doc.addPage([pages[i].wPt, pages[i].hPt]);
      page.drawImage(img, { x: 0, y: 0, width: pages[i].wPt, height: pages[i].hPt });
    }
    return await doc.save();
  }

  // ── הריצה המלאה ─────────────────────────────────────────────────────────────
  // opts: { pages?:[1-based], scale?, font?, onStatus(phase,pct,text), cancelCheck() }
  // מחזיר: { pdfBytes, baseName, translatedCount, pages, total }
  async function run(file, opts) {
    opts = opts || {};
    var onStatus = opts.onStatus || function () {};
    var cancelled = opts.cancelCheck || function () { return false; };

    onStatus('progress', 2, 'טוען מנועים (OCR + PDF)…');
    initPdfJs();
    await ensureTesseract();
    await ensurePdfLib();

    var ab = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    var total = pdf.numPages;
    var range = (opts.pages && opts.pages.length) ? opts.pages.slice() : null;
    if (!range) { range = []; for (var k = 1; k <= total; k++) range.push(k); }

    var tb = tessBase();
    var worker = await Tesseract.createWorker('eng', 1, { workerPath: tb + 'worker.min.js', corePath: tb, langPath: tb });

    var outPages = [], translatedCount = 0;
    try {
      for (var idx = 0; idx < range.length; idx++) {
        if (cancelled()) throw new Error('CANCELLED');
        var pageNo = range[idx];
        var pct = 3 + Math.round((idx / range.length) * 92);

        onStatus('progress', pct, 'עמוד ' + pageNo + ' / ' + total + ' — מרנדר…');
        var page = await pdf.getPage(pageNo);
        var scale = opts.scale || 2.0;
        var vp = page.getViewport({ scale: scale });
        var vp1 = page.getViewport({ scale: 1 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        var ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        onStatus('progress', pct, 'עמוד ' + pageNo + ' / ' + total + ' — מזהה טקסט (OCR)…');
        var paras = await ocrParagraphs(worker, canvas);

        onStatus('progress', pct, 'עמוד ' + pageNo + ' / ' + total + ' — מתרגם ' + paras.length + ' בלוקים…');
        for (var pi = 0; pi < paras.length; pi++) {
          if (cancelled()) throw new Error('CANCELLED');
          var p = paras[pi];
          if (shouldSkip(p.text)) continue;
          var he = await translateText(p.text, cancelled);
          if (!he || !he.trim()) continue;
          if (drawParagraph(ctx, p.bbox, he.trim(), p.lineCount, opts.font)) translatedCount++;
        }

        outPages.push({ jpeg: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.85)), wPt: vp1.width, hPt: vp1.height });
        canvas.width = 1; canvas.height = 1; // שחרור זיכרון מיידי
        await yield_();
      }

      onStatus('progress', 96, 'מרכיב PDF מתורגם…');
      var pdfBytes = await assemblePdf(outPages);
      return {
        pdfBytes: pdfBytes,
        baseName: file.name.replace(/\.pdf$/i, ''),
        translatedCount: translatedCount,
        pages: range.length,
        total: total
      };
    } finally {
      try { await worker.terminate(); } catch (e) {}
    }
  }

  window.PBT_ENGINE = {
    run: run,
    // נחשפים גם לבדיקות/שימוש-חוזר:
    translateText: translateText, ocrParagraphs: ocrParagraphs,
    drawParagraph: drawParagraph, shouldSkip: shouldSkip, splitChunks: splitChunks,
    dominantBg: dominantBg, colorBoxBounds: colorBoxBounds
  };
})();
