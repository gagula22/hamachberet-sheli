(function () {
  // VT Cloudflare Worker API. Extracted from index.js.
  var _U = window.VT_UTILS, _A = window.VT_AUDIO;
  var _arrayBufferToBase64 = _U._arrayBufferToBase64, _slicePcmSec = _A._slicePcmSec, _pcmToWavBytes = _A._pcmToWavBytes;

  // ── Single sources of truth (dedup) ───────────────────────────────────────
  // כתובת ה-Cloudflare Worker הפרטי — מוגדרת פעם אחת בלבד כאן. גם כלי-הווידאו
  // (index.js) וגם הערות-הקול (js/features/voice/transcribe.js) קוראים מכאן;
  // לפני כן הכתובת שוכפלה בשני קבצים והייתה מועדת לסטייה. משנים? רק כאן.
  var WORKER_URL = 'https://broad-hall-729c.gagula22.workers.dev';

  // קוד ה-Web-Worker של Whisper המקומי (Transformers.js) — עותק יחיד, משותף
  // לשני הכלים (לפני כן שוכפל כמעט אחד-לאחד בשני קבצים). פרמטרי: d.model
  // בבחירת המודל, d.language בשפת התמלול (ברירת מחדל עברית — זהה להתנהגות
  // הקודמת של כלי-הווידאו ששלח בלי שפה).
  // useBrowserCache: true — המודל (~150MB) נשמר ב-Cache API של הדפדפן ויורד
  // פעם אחת באמת, במקום בכל סשן מחדש (הדגל היה false מאז ההטמעה המקורית,
  // בלי סיבה מתועדת — נבדק בהיסטוריית git).
  var LOCAL_WHISPER_SRC = '\n' +
    'let _pipe = null;\n' +
    'self.onmessage = async function (e) {\n' +
    '  var d = e.data;\n' +
    '  if (d.type === "init") {\n' +
    '    try {\n' +
    '      var mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");\n' +
    '      mod.env.allowLocalModels = false;\n' +
    '      mod.env.useBrowserCache = true;\n' +
    '      _pipe = await mod.pipeline("automatic-speech-recognition", d.model || "Xenova/whisper-small", {\n' +
    '        quantized: true,\n' +
    '        progress_callback: function (p) { self.postMessage({ type: "progress", status: p.status, progress: p.progress || 0 }); }\n' +
    '      });\n' +
    '      self.postMessage({ type: "ready" });\n' +
    '    } catch (err) { self.postMessage({ type: "error", message: err.message }); }\n' +
    '  } else if (d.type === "transcribe") {\n' +
    '    try {\n' +
    '      var result = await _pipe({ data: d.audio, sampling_rate: 16000 },\n' +
    '        { language: d.language || "hebrew", task: "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });\n' +
    '      self.postMessage({ type: "result", text: result.text, chunks: result.chunks || [] });\n' +
    '    } catch (err) { self.postMessage({ type: "error", message: err.message }); }\n' +
    '  }\n' +
    '};\n';
  async function _transcribeViaWorker(workerUrl, fileBuffer, language, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/?language=' + encodeURIComponent(language || 'auto');
    var u8 = new Uint8Array(fileBuffer);
    var sizeMB = (u8.length / 1024 / 1024).toFixed(1);

    // Try streaming upload first (Chromium-only). Encodes base64 lazily as
    // the request body is being uploaded — no full base64 string in memory,
    // no idle timeout because bytes flow continuously. Falls back to
    // buffered upload on browsers that don't support duplex streams.
    //
    // ⚠️ Watchdog-timeout (תיקון "התמלול נתקע בהקלטות ארוכות", 15.7.2026):
    // בלי timeout, בקשה שנתלית (חיבור שנפל בשקט / Worker שלא עונה) מקפיאה
    // את ה-lane שלה לנצח; בהקלטה של שעתיים-שלוש (‎90-120 נתחים) הסיכוי שזה
    // יקרה לפחות פעם אחת גבוה — ושלושה fetch-ים תלויים = כל המנוע קפוא בלי
    // שום שגיאה ("נתקע"). AbortController קוטע כל ניסיון אחרי
    // VT_WORKER.FETCH_TIMEOUT_MS (ברירת מחדל 3 דק' — נדיב גם לחיבור איטי),
    // מה שהופך תקיעה לכשל רגיל שמנגנון ה-retry של ה-lanes מטפל בו.
    // ה-signal מכסה גם את קריאת גוף-התשובה (r.json), לא רק את ההעלאה.
    var timeoutMs = (window.VT_WORKER && VT_WORKER.FETCH_TIMEOUT_MS) || 180000;
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timedOut = false;
    var timer = ctrl ? setTimeout(function () { timedOut = true; ctrl.abort(); }, timeoutMs) : null;
    var streamingSupported = (typeof ReadableStream === 'function');
    var r;

    try {
    if (streamingSupported) {
      try {
        if (onProgress) onProgress('שולח ' + sizeMB + ' MB ל-Cloudflare (streaming)…');
        // Each non-final chunk must be a multiple of 3 input bytes so the
        // resulting base64 chunks concatenate into valid base64.
        const CHUNK_INPUT = 30000;
        let pos = 0;
        const tenc = new TextEncoder();
        const stream = new ReadableStream({
          pull: function(controller) {
            if (pos >= u8.length) { controller.close(); return; }
            const end = Math.min(pos + CHUNK_INPUT, u8.length);
            const slice = u8.subarray(pos, end);
            let bin = '';
            for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]);
            controller.enqueue(tenc.encode(btoa(bin)));
            pos = end;
            if (onProgress) {
              const pct = Math.round((pos / u8.length) * 100);
              onProgress('שולח ' + sizeMB + ' MB ל-Cloudflare (streaming · ' + pct + '%)…');
            }
          }
        });
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: stream,
          duplex: 'half',
          signal: ctrl ? ctrl.signal : undefined
        });
      } catch (streamErr) {
        // timeout שלנו ≠ חוסר-תמיכה ב-streaming: אסור ליפול ל-buffered (שהיה
        // מוסיף עוד 3 דק' תלויות לאותו ניסיון) — זורקים כדי שה-retry יטפל.
        if (timedOut) throw new Error('הענן לא הגיב תוך ' + Math.round(timeoutMs / 60000) + ' דק׳ (timeout) — מנסה שוב');
        console.warn('[transcribe] stream upload failed, falling back to buffered:', streamErr);
        r = null;
      }
    }

    if (!r) {
      // Buffered fallback (Firefox / older Chromium). Builds the full base64
      // string in memory and sends it as a single body.
      if (onProgress) onProgress('מקודד base64 בדפדפן…');
      var audioBase64 = _arrayBufferToBase64(fileBuffer);
      if (onProgress) onProgress('שולח ' + (audioBase64.length / 1024 / 1024).toFixed(1) + ' MB ל-Cloudflare…');
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: audioBase64,
        signal: ctrl ? ctrl.signal : undefined
      });
    }
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      throw new Error('Worker שגיאה ' + r.status + ': ' + errBody.slice(0, 200));
    }
    if (onProgress) onProgress('הענן מתמלל ב-Whisper-Large-v3-Turbo…');
    var data = await r.json();
    } catch (err) {
      if (timedOut) throw new Error('הענן לא הגיב תוך ' + Math.round(timeoutMs / 60000) + ' דק׳ (timeout) — מנסה שוב');
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (data.error) throw new Error('Worker: ' + data.error);

    // Normalise to { text, chunks: [{timestamp:[s,e], text}] }
    var text = (data.text || '').trim();
    var chunks = [];

    if (Array.isArray(data.segments) && data.segments.length) {
      // OpenAI-style segment list
      chunks = data.segments.map(function(s){
        var st = (s.start != null ? s.start : 0);
        var en = (s.end   != null ? s.end   : st + 1);
        return { timestamp: [st, en], text: ' ' + (s.text || '').trim() };
      });
    } else if (Array.isArray(data.words) && data.words.length) {
      // Word-level → group every ~30s into a paragraph
      var GROUP = 30;
      var cur = null;
      for (var i = 0; i < data.words.length; i++) {
        var w  = data.words[i];
        var ws = (w.start != null ? w.start : (w.startTime || 0));
        var we = (w.end   != null ? w.end   : (w.endTime || ws));
        var wt = (w.word || w.text || '').trim();
        if (!cur || ws - cur.s > GROUP) {
          if (cur) chunks.push({ timestamp: [cur.s, cur.e], text: ' ' + cur.t.join(' ') });
          cur = { s: ws, e: we, t: [wt] };
        } else {
          cur.e = we; cur.t.push(wt);
        }
      }
      if (cur) chunks.push({ timestamp: [cur.s, cur.e], text: ' ' + cur.t.join(' ') });
    } else if (data.vtt && typeof data.vtt === 'string') {
      // WEBVTT fallback parsing
      var re = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\n([\s\S]*?)(?=\n\n|\n*$)/g;
      var m;
      function _hmsToSec(hms) {
        var p = hms.split(':'); return parseInt(p[0])*3600 + parseInt(p[1])*60 + parseFloat(p[2]);
      }
      while ((m = re.exec(data.vtt)) !== null) {
        chunks.push({ timestamp: [_hmsToSec(m[1]), _hmsToSec(m[2])], text: ' ' + m[3].replace(/\n/g,' ').trim() });
      }
    }
    return { text: text, chunks: chunks, raw: data, detectedLanguage: (data.transcription_info && data.transcription_info.language) || null };
  }

  // ── Text translation (Google Translate gtx) ──────────────────────────────
  // ⚠️ ה-endpoint ‎/translate של ה-Worker הוסר לצמיתות: מודל ה-Llama-3 שלו הוצא
  // משימוש ב-Cloudflare ב-2026-05-30 ("5028: model deprecated" → HTTP 500 קבוע)
  // וה-Worker מתארח בנפרד — אי אפשר לתקן אותו מכאן. הוחלף באותו מנוע שכבר
  // הוכח בהערות-הקול (P-51, תוקן 15.7): Google Translate דרך ה-endpoint
  // החינמי gtx — בלי מפתח, CORS פתוח (גם מ-localhost), מכסות נדיבות, עם זיהוי
  // שפת-מקור אוטומטי (sl=auto). fallback ליעד-עברית: MyMemory דרך מנוע מתרגם
  // ה-PDF (window.PTR_ENGINE — מכסה יומית קטנה, לכן משני בלבד).
  // הטקסט מפוצל ל~1800 תווים לבקשה בגבולות משפט (מתחת למגבלת ה-GET של gtx).
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

  // מקטע יחיד דרך gtx. 'iw' = קוד העברית הישן של גוגל (עובד יציב). מחזיר null אם ריק.
  // ⚠️ timeout חובה (15.7): בלי abort, בקשת-תרגום תלויה תוקעת את הריצה לנצח
  // אחרי שהתמלול כבר הצליח — אותה מחלקת-באג כמו תקיעת-ההעלאות. timeout ⇒
  // נזרק ⇒ הקורא נופל ל-MyMemory / מדווח כשל-תרגום, והתמלול עצמו תמיד נשמר.
  var TRANSLATE_TIMEOUT_MS = 25000;
  async function _googleTranslatePart(part, targetLang) {
    var tl = (!targetLang || targetLang === 'he') ? 'iw' : targetLang;
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
              encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(part);
    var c = (typeof AbortController === 'function') ? new AbortController() : null;
    var t = c ? setTimeout(function () { c.abort(); }, TRANSLATE_TIMEOUT_MS) : null;
    var data;
    try {
      var r = await fetch(url, c ? { signal: c.signal } : undefined);
      if (!r.ok) throw new Error('google ' + r.status);
      data = await r.json();
    } finally { if (t) clearTimeout(t); }
    var segs = (data && data[0]) || [];
    var out = segs.map(function (s) { return (s && s[0]) || ''; }).join('').trim();
    return out || null;
  }

  // תוחם promise חיצוני (PTR_ENGINE של P-43) בזמן — המפסיד רץ ברקע, אנחנו לא נתקעים.
  function _raceTimeout(promise, ms, msg) {
    return Promise.race([promise, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error(msg || 'timeout')); }, ms);
    })]);
  }

  // תרגום בלוק טקסט מלא. מחזיר { translation, targetLanguage, targetName }
  // (אותו shape שהחזיר ה-endpoint הישן — הקוראים לא משתנים).
  async function _translateText(text, targetLang, onProgress) {
    text = String(text || '').trim();
    targetLang = targetLang || 'he';
    if (!text) return { translation: '', targetLanguage: targetLang, targetName: targetLang === 'he' ? 'Hebrew' : targetLang };
    var parts = _splitForTranslate(text);
    var out = [];
    var googleOk = true;                       // Google נכשל פעם אחת → לא מבזבזים round-trip על השאר
    for (var i = 0; i < parts.length; i++) {
      if (onProgress) onProgress('מתרגם (Google)… ' + (i + 1) + '/' + parts.length);
      var t = null;
      if (googleOk && navigator.onLine) {
        try {
          t = await _googleTranslatePart(parts[i], targetLang);
        } catch (ge) {
          console.warn('[vt-translate] google failed:', ge.message);
          googleOk = false;
        }
      }
      // fallback (יעד עברית בלבד): MyMemory דרך מנוע מתרגם ה-PDF
      if (t === null && targetLang === 'he' && window.PTR_ENGINE && PTR_ENGINE._translatePageText) {
        try {
          var m = (await _raceTimeout(PTR_ENGINE._translatePageText(parts[i]), 20000, 'MyMemory timeout') || '').trim();
          // MyMemory מחזיר את המקור/אזהרה כשנכשל — טקסט זהה למקור = כישלון
          if (m && m !== parts[i] && m.indexOf('MYMEMORY') === -1 && m.indexOf('QUERY LIMIT') === -1) t = m;
        } catch (me) {
          console.warn('[vt-translate] MyMemory failed:', me.message);
        }
      }
      if (t === null) throw new Error('התרגום נכשל — שירותי התרגום אינם נגישים כרגע');
      out.push(t);
    }
    return {
      translation: out.join('\n\n'),
      targetLanguage: targetLang,
      targetName: targetLang === 'he' ? 'Hebrew' : targetLang
    };
  }

  // ── Parallel chunk engine (shared: this tool + voice memos) ──────────────
  // 3 מסלולים (lanes) במקביל + עד 3 ניסיונות לנתח עם backoff מדורג + המשך-חלקי:
  // נתח שנכשל סופית מדולג ולא מפיל את השאר (מתקבל 119/120 במקום כלום); זריקה
  // רק אם *כל* הנתחים נכשלו. נמדד בהערות-הקול: נתח 90ש׳ ≈ 5ש׳ הלוך-חזור, ולכן
  // 3 lanes חופפים העלאה-עם-תמלול ומורידים שעה-וחצי מ~5+ דקות ל~2-3 דקות.
  // ⚠️ החליף את המסלול הטורי הישן (_transcribeViaWorkerChunked) שבו כשל נתח
  // בודד הפיל את כל הריצה — אל תחזירו לולאה טורית בלי retry.
  var LANE_COUNT = 3, CHUNK_TRIES = 3;
  async function _runChunkLanes(count, runOne, onUpdate) {
    var results = new Array(count);
    var next = 0, done = 0, failed = 0;
    async function lane() {
      while (next < count) {
        var i = next++;
        var ok = false, lastErr = null;
        for (var attempt = 1; attempt <= CHUNK_TRIES && !ok; attempt++) {
          try {
            results[i] = await runOne(i);
            ok = true;
          } catch (err) {
            lastErr = err;
            // המתנה מדורגת (2.5ש, 5ש) — נותנת ל-rate-limit של Cloudflare להתאושש
            if (attempt < CHUNK_TRIES) await new Promise(function (r) { setTimeout(r, attempt * 2500); });
          }
        }
        done++;
        if (!ok) {
          failed++;
          console.warn('[vt-lanes] chunk ' + (i + 1) + '/' + count + ' failed after ' +
            CHUNK_TRIES + ' tries:', lastErr && lastErr.message);
        }
        if (onUpdate) onUpdate(done, count, failed);
      }
    }
    var lanes = [];
    for (var k = 0; k < Math.min(LANE_COUNT, count); k++) lanes.push(lane());
    await Promise.all(lanes);
    return { results: results, failed: failed };
  }

  // תמלול PCM מקבילי: נתחי 90 שניות (~2.9MB WAV — בטוח גם למכונות עם מעט RAM).
  // מחזיר { text, chunks, detectedLanguage, missing, total }.
  async function _transcribeViaWorkerParallel(workerUrl, pcm, sampleRate, language, onProgress) {
    var CHUNK_DUR = 90;
    var totalSec = pcm.length / sampleRate;
    var bounds = [];
    for (var s = 0; s < totalSec; s += CHUNK_DUR) {
      bounds.push([s, Math.min(totalSec, s + CHUNK_DUR)]);
    }
    if (!bounds.length) bounds.push([0, totalSec]);

    if (onProgress) onProgress('מתמלל בענן… 0/' + bounds.length);
    var run = await _runChunkLanes(bounds.length, function (i) {
      var b = bounds[i];
      var wav = _pcmToWavBytes(_slicePcmSec(pcm, b[0], b[1], sampleRate), sampleRate);
      // onProgress פר-נתח = null בכוונה: 3 lanes במקביל היו מערבבים הודעות; הדיווח דרך המונה
      return _transcribeViaWorker(workerUrl, wav, language || 'auto', null)
        .then(function (r) { return { r: r, off: b[0] }; });
    }, function (done, count, failed) {
      if (onProgress) onProgress('מתמלל בענן… ' + done + '/' + count +
        ' (' + Math.round((done / count) * 100) + '%)' +
        (failed ? ' · ⚠️ ' + failed + ' נתחים נכשלו' : ''));
    });
    if (run.failed === bounds.length) throw new Error('כל ' + bounds.length + ' נתחי הענן נכשלו');

    var text = [], chunks = [], detected = null;
    run.results.forEach(function (x) {
      if (!x) return;
      if (detected === null && x.r.detectedLanguage) detected = x.r.detectedLanguage;
      text.push((x.r.text || '').trim());
      (x.r.chunks || []).forEach(function (c) {
        var ts = c.timestamp || [0, 0];
        chunks.push({ timestamp: [(ts[0] || 0) + x.off, (ts[1] || ts[0] || 0) + x.off], text: c.text });
      });
    });
    return { text: text.filter(Boolean).join(' '), chunks: chunks, detectedLanguage: detected, missing: run.failed, total: bounds.length };
  }

  // Quick health check — returns true if Worker URL responds (any 2xx/4xx OK)
  async function _pingWorker(workerUrl) {
    try {
      var r = await fetch(workerUrl.replace(/\/+$/, '') + '/', { method: 'OPTIONS' });
      return r.ok || r.status === 204;
    } catch (_) { return false; }
  }

  // Pre-flight test: send a tiny 5MB silent payload to the Worker. If this
  // fails, transcription is going to fail too — surface a precise reason
  // (CPU/RAM cap → deploy Worker v4) instead of a generic "Failed to fetch"
  // halfway through chunk 1.
  async function _preflightWorker(workerUrl, sizeMB, onProgress) {
    sizeMB = sizeMB || 5;
    if (onProgress) onProgress('בודק חיבור ל-Worker עם payload של ' + sizeMB + 'MB…');
    // Build a silent WAV at 16kHz mono, sized roughly to sizeMB
    const samples = sizeMB * 1024 * 1024 / 2;  // int16 = 2 bytes/sample
    const pcm = new Float32Array(Math.floor(samples));  // all zeros = silence
    const wavBuf = _pcmToWavBytes(pcm, 16000);
    try {
      const r = await fetch(workerUrl.replace(/\/+$/, '') + '/?language=he', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: wavBuf
      });
      if (!r.ok) {
        const txt = await r.text().catch(function(){ return ''; });
        return { ok: false, code: r.status, body: txt.slice(0, 300) };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, fetchErr: e.message };
    }
  }

  // base64-encode an ArrayBuffer in chunks (avoids the 64KB stack limit of
  // String.fromCharCode.apply when the buffer is large).
  async function _transcribeYouTubeViaWorker(workerUrl, ytUrl, language, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/youtube';
    if (onProgress) onProgress('מבקש מ-Cloudflare למשוך אודיו מ-YouTube…');
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: ytUrl, language: language || 'he' })
    });
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      var msg = errBody;
      try { var j = JSON.parse(errBody); if (j.error) msg = j.error; } catch (_) {}
      throw new Error((msg || 'Worker שגיאה ' + r.status).slice(0, 250));
    }
    if (onProgress) onProgress('הענן מתמלל ב-Whisper-Large-v3-Turbo…');
    var data = await r.json();
    if (data.error) throw new Error(data.error);

    var text = (data.text || '').trim();
    var chunks = [];
    if (Array.isArray(data.segments) && data.segments.length) {
      chunks = data.segments.map(function(s){
        var st = (s.start != null ? s.start : 0);
        var en = (s.end   != null ? s.end   : st + 1);
        return { timestamp: [st, en], text: ' ' + (s.text || '').trim() };
      });
    }
    return { text: text, chunks: chunks, video: data.video || null, raw: data };
  }

  // File System Access API — let the user pick where to save. Falls back to
  // a normal anchor download in browsers that don't support the picker.
  // opts: { description, extension, mimeType }
  window.VT_WORKER = { WORKER_URL:WORKER_URL, LOCAL_WHISPER_SRC:LOCAL_WHISPER_SRC, FETCH_TIMEOUT_MS:180000, _transcribeViaWorker:_transcribeViaWorker, _translateText:_translateText, _runChunkLanes:_runChunkLanes, _transcribeViaWorkerParallel:_transcribeViaWorkerParallel, _pingWorker:_pingWorker, _preflightWorker:_preflightWorker, _transcribeYouTubeViaWorker:_transcribeYouTubeViaWorker };
})();