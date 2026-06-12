(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // תמלול הערות קול — חלק מאחריות הקול (window.VoiceTranscribe).
  // שימוש חוזר מלא בתשתית כלי "תמלול וידאו" (קריאה בלבד ל-namespaces שלו):
  //   • VT_AUDIO._decodeAnyFileToPcm — פענוח ה-webm/opus ל-PCM 16kHz
  //   • VT_WORKER._transcribeViaWorkerChunked — Whisper-Large-v3-Turbo בענן
  //     (ה-Cloudflare Worker הפרטי של המשתמש — אותו יעד שכלי התמלול משתמש בו)
  //   • VT_UTILS._buildTimestampedHtml — פסקאות עם חותמות זמן למסמך
  // הפלט נשמר על רשומת ההקלטה (memos.js שומר ל-IndexedDB) ומיוצא כ-Word
  // בדיוק בתבנית ה-.doc של שאר האתר (application/msword, RTL, הורדה אוטומטית).
  // אם מודולי הכלי לא נטענו — הכפתור פשוט יציג שגיאה ידידותית, בלי לשבור כלום.
  // ─────────────────────────────────────────────────────────────────────────

  // אותו Worker פרטי שמוגדר בכלי התמלול (js/views/tools/video-transcriber/index.js)
  var WORKER_URL = 'https://broad-hall-729c.gagula22.workers.dev';

  // סדר יעדים לענן: על localhost מנסים קודם את הפרוקסי המקומי (server.py
  // מעביר לענן שרת-אל-שרת — עוקף את חסימת ה-CORS של ה-Worker), ואז את
  // ה-Worker ישירות (יעבוד כשהאתר ירוץ על github.io). נכשלו שניהם → מקומי.
  function cloudBases() {
    var bases = [];
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      bases.push(location.origin + '/vt-proxy');
    }
    bases.push(WORKER_URL);
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
  // ל-Whisper שרץ בדפדפן בתוך Web Worker — אותו דפוס בדיוק כמו המצב המקומי
  // של כלי "תמלול וידאו" (Transformers.js, מודל ~150MB בהורדה חד-פעמית).
  var WHISPER_SRC = '\n' +
    'let _pipe = null;\n' +
    'self.onmessage = async function (e) {\n' +
    '  var d = e.data;\n' +
    '  if (d.type === "init") {\n' +
    '    try {\n' +
    '      var mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");\n' +
    '      mod.env.allowLocalModels = false;\n' +
    '      mod.env.useBrowserCache = false;\n' +
    '      _pipe = await mod.pipeline("automatic-speech-recognition", d.model || "Xenova/whisper-small", {\n' +
    '        quantized: true,\n' +
    '        progress_callback: function (p) { self.postMessage({ type: "progress", status: p.status, progress: p.progress || 0 }); }\n' +
    '      });\n' +
    '      self.postMessage({ type: "ready" });\n' +
    '    } catch (err) { self.postMessage({ type: "error", message: err.message }); }\n' +
    '  } else if (d.type === "transcribe") {\n' +
    '    try {\n' +
    '      var result = await _pipe({ data: d.audio, sampling_rate: 16000 },\n' +
    '        { language: "hebrew", task: "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });\n' +
    '      self.postMessage({ type: "result", text: result.text, chunks: result.chunks || [] });\n' +
    '    } catch (err) { self.postMessage({ type: "error", message: err.message }); }\n' +
    '  }\n' +
    '};\n';

  var _lw = null, _lwReady = null;
  function localWhisper(pcm, onProgress) {
    if (!_lwReady) {
      var blob = new Blob([WHISPER_SRC], { type: 'text/javascript' });
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
        _lw.postMessage({ type: 'transcribe', audio: pcm }, [pcm.buffer]);
      });
    });
  }

  // תמלול מקומי מקוטע: הקלטות ארוכות (גם שעה וחצי ומעלה) מעובדות בנתחים
  // של 5 דקות — אחוז התקדמות אמיתי, צריכת זיכרון קבועה לנתח, וחותמות הזמן
  // מוסטות חזרה לזמן המקורי. _slicePcmSec מחזיר עותק, כך שההעברה ל-Worker
  // (transfer) לא נוגעת ב-PCM המלא.
  var SEG_SEC = 300;
  async function localWhisperChunked(pcm, sampleRate, onProgress) {
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
      var res = await localWhisper(piece, progWrap || onProgress);
      allText.push((res.text || '').trim());
      (res.chunks || []).forEach(function (c) {
        var ts = c.timestamp || [0, 0];
        allChunks.push({ timestamp: [(ts[0] || 0) + seg[0], (ts[1] || ts[0] || 0) + seg[0]], text: c.text });
      });
    }
    return { text: allText.filter(Boolean).join(' '), chunks: allChunks };
  }

  // ── תמלול ענן מקבילי ─────────────────────────────────────────────────────
  // נמדד: נתח 90 שניות ≈ 5 שניות הלוך-חזור. בעיבוד טורי שעה וחצי ≈ 5+ דקות;
  // 3 נתחים במקביל חופפים העלאה עם תמלול ומורידים לאזור 2-3 דקות.
  // משתמש ב-_transcribeViaWorker פר-נתח (לא בלולאה הטורית של הכלי) ומרכיב
  // את התוצאות לפי הסדר עם היסט חותמות-זמן.
  var CLOUD_CHUNK_SEC = 90, CLOUD_CONCURRENCY = 3;
  async function cloudChunkedParallel(base, pcm, sampleRate, onProgress) {
    var d = deps();
    var totalSec = pcm.length / sampleRate;
    var bounds = [];
    for (var s = 0; s < totalSec; s += CLOUD_CHUNK_SEC) {
      bounds.push([s, Math.min(totalSec, s + CLOUD_CHUNK_SEC)]);
    }
    if (!bounds.length) bounds.push([0, totalSec]);

    if (onProgress) onProgress('מתמלל בענן… 0/' + bounds.length);
    var results = new Array(bounds.length);
    var next = 0, done = 0;
    async function lane() {
      while (next < bounds.length) {
        var i = next++;
        var b = bounds[i];
        var wav = d.A._pcmToWavBytes(d.A._slicePcmSec(pcm, b[0], b[1], sampleRate), sampleRate);
        var r = await d.W._transcribeViaWorker(base, wav, 'he', null);
        results[i] = { r: r, off: b[0] };
        done++;
        if (onProgress) onProgress('מתמלל בענן… ' + done + '/' + bounds.length + ' (' + Math.round((done / bounds.length) * 100) + '%)');
      }
    }
    var lanes = [];
    for (var k = 0; k < Math.min(CLOUD_CONCURRENCY, bounds.length); k++) lanes.push(lane());
    await Promise.all(lanes);

    var text = [], chunks = [];
    results.forEach(function (x) {
      if (!x) return;
      text.push((x.r.text || '').trim());
      (x.r.chunks || []).forEach(function (c) {
        var ts = c.timestamp || [0, 0];
        chunks.push({ timestamp: [(ts[0] || 0) + x.off, (ts[1] || ts[0] || 0) + x.off], text: c.text });
      });
    });
    return { text: text.filter(Boolean).join(' '), chunks: chunks, engine: 'ענן · Whisper-Large-v3' };
  }

  // ── תמלול ────────────────────────────────────────────────────────────────
  // memo: רשומת הקלטה { name, blob, ... } ; onProgress(msg) אופציונלי.
  // מחזיר { text, chunks } — והשומר הוא הקורא (memos.js).
  // אסטרטגיה: ענן (Whisper-Large, איכות גבוהה) ← נפילה אוטומטית למקומי
  // כשהענן לא נגיש (CORS מ-localhost / אין אינטרנט לענן).
  async function run(memo, onProgress) {
    var d = deps();
    if (onProgress) onProgress('מפענח את ההקלטה…');
    var decoded = await d.A._decodeAnyFileToPcm(memo.blob, onProgress);
    if (!decoded.pcm || !decoded.pcm.length) throw new Error('ההקלטה ריקה או לא ניתנת לפענוח');

    var result = null;
    if (navigator.onLine) {
      var bases = cloudBases();
      for (var b = 0; b < bases.length && !result; b++) {
        try {
          result = await cloudChunkedParallel(bases[b], decoded.pcm, decoded.sampleRate, onProgress);
        } catch (cloudErr) {
          console.warn('[voice-transcribe] cloud via ' + bases[b] + ' failed:', cloudErr.message);
        }
      }
      if (!result && onProgress) onProgress('הענן לא זמין — עובר לתמלול מקומי…');
    }
    if (!result || !(result.text || '').trim()) {
      if (!navigator.onLine && !_lwReady) throw new Error('אין חיבור לאינטרנט (נדרש להורדת מודל התמלול בפעם הראשונה)');
      result = await localWhisperChunked(decoded.pcm, decoded.sampleRate, onProgress);
      result.engine = 'מקומי · Whisper-small (איכות מופחתת)';
    }
    var text = (result.text || '').trim();
    if (!text) throw new Error('לא זוהה דיבור בהקלטה');
    return { text: text, chunks: result.chunks || [], engine: result.engine || 'ענן · Whisper-Large-v3' };
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

  function openInWord(memo) {
    if (!memo.transcript) { App.toast('אין עדיין תמלול להקלטה הזו'); return; }
    var dateStr = new Date(memo.createdAt || Date.now()).toLocaleDateString('he-IL');
    var html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="he">' +
      '<head><meta charset="utf-8"><title>' + esc(memo.name) + '</title>' +
      '<style>@page Section1 { size:21cm 29.7cm; margin:1.5cm; } div.Section1 { page:Section1; } ' +
      'body { font-family:"Arial",sans-serif; font-size:11pt; direction:rtl; } ' +
      'h1 { font-size:16pt; } .meta { color:#777; font-size:9pt; } p { margin:0 0 8pt; line-height:1.5; }</style></head>' +
      '<body><div class="Section1" dir="rtl">' +
      '<h1>🎙️ ' + esc(memo.name) + '</h1>' +
      '<p class="meta">תמלול הקלטה · ' + dateStr + (memo.engine ? ' · מנוע: ' + esc(memo.engine) : '') + '</p><hr/>' +
      bodyHtml(memo) +
      '</div></body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword' });
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = String(memo.name || 'תמלול').replace(/[\\/:*?"<>|]/g, '-') + '.doc';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    App.toast('📄 קובץ ה-Word ירד — פתח אותו מההורדות');
  }

  window.VoiceTranscribe = { run: run, openInWord: openInWord };
})();
