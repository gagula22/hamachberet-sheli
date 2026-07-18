(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // תמלול הערות קול — חלק מאחריות הקול (window.VoiceTranscribe).
  // שימוש חוזר מלא בתשתית כלי "תמלול וידאו" (קריאה בלבד ל-namespaces שלו):
  //   • VT_AUDIO._decodeAnyFileToPcm — פענוח ה-webm/opus ל-PCM 16kHz (fallback)
  //   • VT_WORKER._transcribeViaWorkerParallel — Whisper-Large-v3-Turbo בענן,
  //     נתחים מקביליים + retry (המנוע המשותף; במקור נכתב כאן והועבר לשם)
  //   • VT_WORKER.WORKER_URL / LOCAL_WHISPER_SRC — מקורות-אמת יחידים
  //   • VT_UTILS._buildTimestampedHtml — פסקאות עם חותמות זמן למסמך
  // הפלט נשמר על רשומת ההקלטה (memos.js שומר ל-IndexedDB) ומיוצא כ-Word
  // בדיוק בתבנית ה-.doc של שאר האתר (application/msword, RTL, הורדה אוטומטית).
  // אם מודולי הכלי לא נטענו — הכפתור פשוט יציג שגיאה ידידותית, בלי לשבור כלום.
  // ─────────────────────────────────────────────────────────────────────────

  // סדר יעדים לענן: על localhost מנסים קודם את הפרוקסי המקומי (server.py
  // מעביר לענן שרת-אל-שרת — עוקף את חסימת ה-CORS של ה-Worker), ואז את
  // ה-Worker ישירות (יעבוד כשהאתר ירוץ על github.io). נכשלו שניהם → מקומי.
  // כתובת ה-Worker נקראת מ-VT_WORKER (מקור-אמת יחיד) בזמן-ריצה.
  function cloudBases() {
    var bases = [];
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      bases.push(location.origin + '/vt-proxy');
    }
    bases.push(window.VT_WORKER.WORKER_URL);
    return bases;
  }

  function deps() {
    if (!(window.VT_AUDIO && window.VT_WORKER)) {
      throw new Error('מנוע התמלול לא נטען — רענן את הדף ונסה שוב');
    }
    return { A: window.VT_AUDIO, W: window.VT_WORKER, U: window.VT_UTILS || null };
  }

  // ── Whisper מקומי (fallback) ─────────────────────────────────────────────
  // ה-Worker בענן מקבל בקשות רק מ-gagula22.github.io (CORS), ולכן מהעותק
  // המקומי (localhost) הקריאה נחסמת ע"י הדפדפן. כשזה קורה עוברים אוטומטית
  // ל-Whisper שרץ בדפדפן בתוך Web Worker. קוד ה-worker עצמו — עותק יחיד
  // משותף ב-VT_WORKER.LOCAL_WHISPER_SRC (לפני כן שוכפל כאן כמעט אחד-לאחד).
  var _lw = null, _lwReady = null;
  function localWhisper(pcm, onProgress, langName) {
    if (!_lwReady) {
      var blob = new Blob([window.VT_WORKER.LOCAL_WHISPER_SRC], { type: 'text/javascript' });
      _lw = new Worker(URL.createObjectURL(blob));
      _lwReady = new Promise(function (resolve, reject) {
        _lw._onReady = { resolve: resolve, reject: reject };
      });
      _lw.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'progress') {
          if (d.status === 'progress' && _lw._prog) {
            _lw._prog('מוריד מודל Whisper מקומי (~150MB, חד־פעמי)… ' + Math.round(d.progress) + '%');
          }
        } else if (d.type === 'ready') {
          if (_lw._onReady) { _lw._onReady.resolve(); _lw._onReady = null; }
        } else if (d.type === 'error') {
          var err = new Error(d.message);
          if (_lw._onReady) { _lw._onReady.reject(err); _lw._onReady = null; _lwReady = null; }
          if (_lw._onDone) { _lw._onDone.reject(err); _lw._onDone = null; }
        } else if (d.type === 'result') {
          if (_lw._onDone) { _lw._onDone.resolve({ text: d.text, chunks: d.chunks || [] }); _lw._onDone = null; }
        }
      };
      _lw.postMessage({ type: 'init', model: 'Xenova/whisper-small' });
    }
    _lw._prog = onProgress || null;
    return _lwReady.then(function () {
      return new Promise(function (resolve, reject) {
        _lw._onDone = { resolve: resolve, reject: reject };
        _lw.postMessage({ type: 'transcribe', audio: pcm, language: langName || 'hebrew' }, [pcm.buffer]);
      });
    });
  }

  // תמלול מקומי מקוטע: הקלטות ארוכות (גם שעה וחצי ומעלה) מעובדות בנתחים
  // של 5 דקות — אחוז התקדמות אמיתי, צריכת זיכרון קבועה לנתח, וחותמות הזמן
  // מוסטות חזרה לזמן המקורי. _slicePcmSec מחזיר עותק, כך שההעברה ל-Worker
  // (transfer) לא נוגעת ב-PCM המלא.
  var SEG_SEC = 300;
  async function localWhisperChunked(pcm, sampleRate, onProgress, langName) {
    var d = deps();
    var totalSec = pcm.length / sampleRate;
    var segs = [];
    for (var s = 0; s < totalSec; s += SEG_SEC) segs.push([s, Math.min(totalSec, s + SEG_SEC)]);
    if (!segs.length) segs.push([0, totalSec]);

    if (totalSec > 600 && onProgress) {
      onProgress('הקלטה ארוכה (' + Math.round(totalSec / 60) + ' דק׳) — תמלול מקומי אורך בערך כמשך ההקלטה. אפשר להשאיר את הטאב פתוח ברקע.');
    }
    var allText = [], allChunks = [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var label = segs.length === 1
        ? 'מתמלל מקומית בדפדפן…'
        : 'מתמלל מקומית… חלק ' + (i + 1) + '/' + segs.length + ' (' + Math.round((seg[0] / totalSec) * 100) + '%)';
      var progWrap = onProgress ? function (msg) { onProgress(msg.indexOf('%') > -1 && msg.indexOf('מוריד') === 0 ? msg : label); } : null;
      if (onProgress) onProgress(label);
      var piece = d.A._slicePcmSec(pcm, seg[0], seg[1], sampleRate);
      var res = await localWhisper(piece, progWrap || onProgress, langName);
      allText.push((res.text || '').trim());
      (res.chunks || []).forEach(function (c) {
        var ts = c.timestamp || [0, 0];
        allChunks.push({ timestamp: [(ts[0] || 0) + seg[0], (ts[1] || ts[0] || 0) + seg[0]], text: c.text });
      });
    }
    return { text: allText.filter(Boolean).join(' '), chunks: allChunks };
  }

  // ── תמלול ענן מקבילי ─────────────────────────────────────────────────────
  // המנוע (נתחי 90ש׳, 3 lanes, retry עם backoff, המשך-חלקי — 119/120 במקום
  // כלום) נכתב במקור כאן והועבר ל-VT_WORKER._transcribeViaWorkerParallel כדי
  // שגם כלי-הווידאו ייהנה ממנו. כאן נשארת רק ההאצלה + תווית המנוע לתצוגה.
  // זריקה רק אם **כל** הנתחים נכשלו → הקורא נופל לתמלול מקומי.
  async function cloudChunkedParallel(base, pcm, sampleRate, onProgress, lang) {
    var d = deps();
    var r = await d.W._transcribeViaWorkerParallel(base, pcm, sampleRate, lang || 'he', onProgress);
    var engine = 'ענן · Whisper-Large-v3';
    if (r.missing) engine += ' · ' + r.missing + '/' + r.total + ' נתחים חסרים';
    r.engine = engine;
    return r;
  }

  // ── תרגום אנגלית→עברית ───────────────────────────────────────────────────
  // עבור הקלטות באנגלית (memo.lang==='en'): ה-Word המיוצא הוא התרגום לעברית.
  // מקור ראשי: Google Translate (endpoint חינמי gtx, בלי מפתח) — אמין, איכותי,
  // מכסות נדיבות, נגיש CORS גם מ-localhost. fallback: MyMemory דרך window.PTR_ENGINE.
  // ⚠️ הוסר ה-endpoint ‎/translate של ה-Worker: המודל (Llama-3) הוצא משימוש ב-Cloudflare
  // ב-2026-05-30 (‎"5028: model deprecated"‎, HTTP 500) — לכן התרגום נכשל. Google מחליף אותו.
  function _splitForTranslate(text, MAX) {
    MAX = MAX || 1800;
    text = String(text || '').trim();
    if (!text) return [];
    if (text.length <= MAX) return [text];
    var parts = [], pos = 0;
    while (pos < text.length) {
      var end = pos + MAX;
      if (end >= text.length) { parts.push(text.slice(pos).trim()); break; }
      var cut = -1;
      for (var i = end; i > end - 400 && i > pos; i--) {
        if ('.!?\n'.indexOf(text[i]) >= 0) { cut = i + 1; break; }
      }
      if (cut === -1) {
        for (var j = end; j > end - 120 && j > pos; j--) {
          if (text[j] === ' ') { cut = j; break; }
        }
      }
      if (cut === -1) cut = end;
      var piece = text.slice(pos, cut).trim();
      if (piece) parts.push(piece);
      pos = cut;
    }
    return parts;
  }

  // Google Translate דרך ה-endpoint החינמי gtx (בלי מפתח). מחזיר עברית או null.
  // מפצל את התשובה למקטעי-משפט (data[0]) ומאחד. 'iw' = קוד עברית הישן של גוגל (עובד יציב).
  async function _googleTranslateHe(part) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=iw&dt=t&q=' + encodeURIComponent(part);
    var r = await fetch(url);
    if (!r.ok) throw new Error('google ' + r.status);
    var data = await r.json();
    var segs = (data && data[0]) || [];
    var he = segs.map(function (s) { return (s && s[0]) || ''; }).join('').trim();
    return he || null;
  }

  async function translateToHebrew(text, onProgress) {
    text = String(text || '').trim();
    if (!text) return '';
    var parts = _splitForTranslate(text);
    var out = [];
    var googleOk = true;                        // Google נכשל פעם אחת → MyMemory לשאר
    for (var i = 0; i < parts.length; i++) {
      if (onProgress) onProgress('מתרגם לעברית… ' + (i + 1) + '/' + parts.length);
      var t = null;
      // מקור ראשי: Google Translate (אמין, איכותי)
      if (googleOk && navigator.onLine) {
        try {
          t = await _googleTranslateHe(parts[i]);
        } catch (ge) {
          console.warn('[voice-translate] google failed:', ge.message);
          googleOk = false;                     // לא לבזבז round-trip על כל שאר המקטעים
        }
      }
      // fallback: MyMemory דרך מנוע מתרגם ה-PDF (מכסה יומית קטנה, לכן משני)
      if (t === null && window.PTR_ENGINE && PTR_ENGINE._translatePageText) {
        try {
          var m = (await PTR_ENGINE._translatePageText(parts[i]) || '').trim();
          // MyMemory מחזיר את המקור/אזהרה כשנכשל — טקסט זהה למקור = כישלון
          if (m && m !== parts[i] && m.indexOf('MYMEMORY') === -1 && m.indexOf('QUERY LIMIT') === -1) t = m;
        } catch (me) {
          console.warn('[voice-translate] MyMemory failed:', me.message);
        }
      }
      if (t === null) throw new Error('התרגום לעברית נכשל — שירותי התרגום אינם נגישים כרגע');
      out.push(t);
    }
    return out.join('\n\n');
  }

  // ── פענוח חסכוני-בזיכרון (אחריות הקול בלבד) ───────────────────────────────
  // ⚠️ SoC: `VT_AUDIO._decodeAnyFileToPcm` (בעלות P-44 תמלול-וידאו) עושה
  // `new Float32Array(getChannelData(0))` — **העתקה מלאה** של ה-PCM על גבי
  // ה-AudioBuffer → שיא ~1.5GB זיכרון ל-3 שעות (עלול להיכשל בטלפון/מכשיר חלש).
  // לא נוגעים בקובץ של P-44. במקום, הקול מפענח בעצמו ומחזיר **view** אל ערוץ ה-PCM
  // של ה-AudioBuffer (בלי ההעתקה) → שיא יורד ל-~690MB (רק ה-AudioBuffer). ה-AudioBuffer
  // נשמר חי דרך `_buf` כדי שה-view יישאר תקין (הוא עצמאי מה-context אחרי הפענוח).
  // נכשל (container ש-decodeAudioData לא מפענח) → הקורא נופל ל-VT_AUDIO (שכולל
  // גם fallback ל-HTMLVideoElement) — אפס רגרסיה, רק חיסכון זיכרון כשאפשר.
  async function _decodeLean(blob, onProgress) {
    // הקלטה ארוכה = פענוח ארוך (webm/opus של שעתיים ≈ עשרות שניות עד דקות,
    // בלי שום callback התקדמות מהדפדפן) — בלי חיווי זה נראה "נתקע". מציגים
    // גודל + הערכת-משך + שעון-חי כל 5ש כדי שיהיה ברור שהעבודה מתקדמת.
    var sizeMB = (blob.size / 1024 / 1024).toFixed(0);
    var isLong = blob.size > 25 * 1024 * 1024;   // ~25MB ≈ חצי שעה ב-128kbps
    var baseMsg = isLong
      ? 'מפענח הקלטה ארוכה (' + sizeMB + 'MB)… זה יכול לקחת עד 2-3 דקות — לא נתקע'
      : 'מפענח את ההקלטה…';
    if (onProgress) onProgress(baseMsg);
    var tick = null, t0 = Date.now();
    if (onProgress && isLong) {
      tick = setInterval(function () {
        onProgress(baseMsg + ' · ' + Math.round((Date.now() - t0) / 1000) + 'ש');
      }, 5000);
    }
    try {
      var ab = await blob.arrayBuffer();
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('no-audiocontext');
      var ctx = new Ctx({ sampleRate: 16000 });
      var buf = await ctx.decodeAudioData(ab);   // AudioBuffer יחיד; ab משוחרר אחר-כך
      var pcm;
      if (buf.numberOfChannels > 1) {
        // downmix stereo→mono (העתקה — אבל הקלטות-קול הן כמעט תמיד מונו)
        var c0 = buf.getChannelData(0), c1 = buf.getChannelData(1);
        pcm = new Float32Array(c0.length);
        for (var i = 0; i < c0.length; i++) pcm[i] = (c0[i] + c1[i]) * 0.5;
      } else {
        pcm = buf.getChannelData(0);             // VIEW — אפס העתקה
      }
      try { ctx.close(); } catch (e) {}
      if (onProgress && isLong) onProgress('הפענוח הסתיים — מכין נתחי-ענן…');
      return { pcm: pcm, sampleRate: 16000, durationSec: pcm.length / 16000, _buf: buf };
    } finally {
      if (tick) clearInterval(tick);             // שעון-החיווי לעולם לא נשאר דולק
    }
  }

  // ── תמלול ────────────────────────────────────────────────────────────────
  // memo: רשומת הקלטה { name, blob, lang?, ... } ; onProgress(msg) אופציונלי.
  // מחזיר { text, chunks, engine, translation? } — והשומר הוא הקורא (memos.js).
  // שפת התמלול לפי memo.lang ('en' = אנגלית, אחרת עברית); להקלטת אנגלית
  // מתבצע גם תרגום אוטומטי לעברית (translation) — ואם התרגום נכשל, התמלול
  // עדיין מוחזר וייצוא ה-Word ינסה לתרגם שוב על-פי דרישה.
  // אסטרטגיה: ענן (Whisper-Large, איכות גבוהה) ← נפילה אוטומטית למקומי
  // כשהענן לא נגיש (CORS מ-localhost / אין אינטרנט לענן).
  async function run(memo, onProgress) {
    var d = deps();
    var lang = memo.lang === 'en' ? 'en' : 'he';
    // פענוח חסכוני-בזיכרון קודם; נכשל → נפילה ל-VT_AUDIO (P-44) שמכסה כל container
    var decoded;
    try {
      decoded = await _decodeLean(memo.blob, onProgress);
    } catch (leanErr) {
      console.warn('[voice-transcribe] lean decode failed, falling back to VT_AUDIO:', leanErr && leanErr.message);
      if (onProgress) onProgress('מפענח את ההקלטה…');
      decoded = await d.A._decodeAnyFileToPcm(memo.blob, onProgress);
    }
    if (!decoded.pcm || !decoded.pcm.length) throw new Error('ההקלטה ריקה או לא ניתנת לפענוח');

    var result = null;
    if (navigator.onLine) {
      var bases = cloudBases();
      for (var b = 0; b < bases.length && !result; b++) {
        try {
          result = await cloudChunkedParallel(bases[b], decoded.pcm, decoded.sampleRate, onProgress, lang);
        } catch (cloudErr) {
          console.warn('[voice-transcribe] cloud via ' + bases[b] + ' failed:', cloudErr.message);
        }
      }
      if (!result && onProgress) {
        // הקלטה ארוכה: תמלול מקומי אורך בערך כמשך ההקלטה — אומרים זאת ביושר
        // במקום להיראות תקועים שעות.
        var _mins = Math.round(decoded.durationSec / 60);
        onProgress(_mins > 20
          ? 'הענן לא זמין אחרי ניסיונות חוזרים — עובר לתמלול מקומי. הקלטה של ' + _mins + ' דק׳ צפויה להימשך בערך כמשך ההקלטה; אפשר להשאיר את הטאב ברקע'
          : 'הענן לא זמין — עובר לתמלול מקומי…');
      }
    }
    if (!result || !(result.text || '').trim()) {
      if (!navigator.onLine && !_lwReady) throw new Error('אין חיבור לאינטרנט (נדרש להורדת מודל התמלול בפעם הראשונה)');
      result = await localWhisperChunked(decoded.pcm, decoded.sampleRate, onProgress, lang === 'en' ? 'english' : 'hebrew');
      result.engine = 'מקומי · Whisper-small (איכות מופחתת)';
    }
    var text = (result.text || '').trim();
    if (!text) throw new Error('לא זוהה דיבור בהקלטה');
    var out = { text: text, chunks: result.chunks || [], engine: result.engine || 'ענן · Whisper-Large-v3' };
    if (lang === 'en') {
      try {
        out.translation = await translateToHebrew(text, onProgress);
      } catch (te) {
        console.warn('[voice-transcribe] translation failed:', te.message);
        if (onProgress) onProgress('התמלול מוכן; התרגום לעברית נכשל — ינוסה שוב בייצוא ל-Word');
      }
    }
    return out;
  }

  // ── ייצוא Word ───────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function bodyHtml(memo) {
    var U = window.VT_UTILS;
    if (U && U._buildTimestampedHtml && memo.transcriptChunks && memo.transcriptChunks.length) {
      return U._buildTimestampedHtml(memo.transcriptChunks, 0, null, memo.transcript);
    }
    return String(memo.transcript || '').split(/\n+/).filter(function (p) { return p.trim(); })
      .map(function (p) { return '<p>' + esc(p) + '</p>'; })
      .join('\n') || '<p>' + esc(memo.transcript) + '</p>';
  }

  function translationHtml(memo) {
    return String(memo.translation || '').split(/\n+/).filter(function (p) { return p.trim(); })
      .map(function (p) { return '<p>' + esc(p) + '</p>'; })
      .join('\n') || '<p>' + esc(memo.translation) + '</p>';
  }

  // opts.original: להקלטת אנגלית — ייצוא המקור באנגלית בלבד (בלי תרגום).
  // ברירת מחדל להקלטת אנגלית: גוף המסמך הוא התרגום לעברית, והמקור האנגלי
  // מצורף אחריו (עם חותמות הזמן). להקלטת עברית — ללא שינוי.
  function openInWord(memo, opts) {
    opts = opts || {};
    if (!memo.transcript) { App.toast('אין עדיין תמלול להקלטה הזו'); return; }
    var isEn = memo.lang === 'en';
    if (isEn && !opts.original && !memo.translation) {
      App.toast('אין עדיין תרגום לעברית — לחץ 📝 לתמלול ותרגום');
      return;
    }
    var dateStr = new Date(memo.createdAt || Date.now()).toLocaleDateString('he-IL');
    var metaLine = (isEn ? (opts.original ? 'תמלול הקלטה באנגלית (מקור)' : 'תמלול הקלטה באנגלית · תרגום לעברית') : 'תמלול הקלטה') +
      ' · ' + dateStr + (memo.engine ? ' · מנוע: ' + esc(memo.engine) : '');
    var body;
    if (!isEn) {
      body = bodyHtml(memo);
    } else if (opts.original) {
      body = '<div dir="ltr" class="en">' + bodyHtml(memo) + '</div>';
    } else {
      body =
        '<h2>תרגום לעברית</h2>' + translationHtml(memo) +
        '<hr/><h2>המקור באנגלית (English original)</h2>' +
        '<div dir="ltr" class="en">' + bodyHtml(memo) + '</div>';
    }
    var html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="he">' +
      '<head><meta charset="utf-8"><title>' + esc(memo.name) + '</title>' +
      '<style>@page Section1 { size:21cm 29.7cm; margin:1.5cm; } div.Section1 { page:Section1; } ' +
      'body { font-family:"Arial",sans-serif; font-size:11pt; direction:rtl; } ' +
      'h1 { font-size:16pt; } h2 { font-size:13pt; } .meta { color:#777; font-size:9pt; } p { margin:0 0 8pt; line-height:1.5; } ' +
      '.en { direction:ltr; text-align:left; }</style></head>' +
      '<body><div class="Section1" dir="rtl">' +
      '<h1>🎙️ ' + esc(memo.name) + '</h1>' +
      '<p class="meta">' + metaLine + '</p><hr/>' +
      body +
      '</div></body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword' });
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    var suffix = isEn ? (opts.original ? ' - English' : ' - תרגום לעברית') : '';
    a.download = String(memo.name || 'תמלול').replace(/[\\/:*?"<>|]/g, '-') + suffix + '.doc';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    App.toast('📄 קובץ ה-Word ירד — פתח אותו מההורדות');
  }

  window.VoiceTranscribe = { run: run, openInWord: openInWord, translateToHebrew: translateToHebrew };
})();
