(function () {
  // VT Cloudflare Worker API. Extracted from index.js.
  var _U = window.VT_UTILS, _A = window.VT_AUDIO;
  var _arrayBufferToBase64 = _U._arrayBufferToBase64, _formatHMS = _U._formatHMS, _slicePcmSec = _A._slicePcmSec, _pcmToWavBytes = _A._pcmToWavBytes;
  async function _transcribeViaWorker(workerUrl, fileBuffer, language, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/?language=' + encodeURIComponent(language || 'auto');
    var u8 = new Uint8Array(fileBuffer);
    var sizeMB = (u8.length / 1024 / 1024).toFixed(1);

    // Try streaming upload first (Chromium-only). Encodes base64 lazily as
    // the request body is being uploaded — no full base64 string in memory,
    // no idle timeout because bytes flow continuously. Falls back to
    // buffered upload on browsers that don't support duplex streams.
    var streamingSupported = (typeof ReadableStream === 'function');
    var r;

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
          duplex: 'half'
        });
      } catch (streamErr) {
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
        body: audioBase64
      });
    }
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      throw new Error('Worker שגיאה ' + r.status + ': ' + errBody.slice(0, 200));
    }
    if (onProgress) onProgress('הענן מתמלל ב-Whisper-Large-v3-Turbo…');
    var data = await r.json();
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

  // Call the Worker's /translate endpoint (Llama-3 based) to translate a
  // block of text to a target language. Used when source audio's detected
  // language is not the user's preferred output language.
  async function _translateViaWorker(workerUrl, text, targetLang, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/translate';
    if (onProgress) onProgress('שולח טקסט לתרגום ל-' + (targetLang || 'he') + ' (Llama 3)…');
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, target_language: targetLang || 'he' })
    });
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch(_) {}
      throw new Error('Worker translate שגיאה ' + r.status + ': ' + errBody.slice(0, 200));
    }
    var data = await r.json();
    if (data.error) throw new Error('Translate: ' + data.error);
    return {
      translation: (data.translation || '').trim(),
      targetLanguage: data.target_language,
      targetName: data.target_name
    };
  }

  // ── Audio decode + WAV encode (browser-side) ─────────────────────────────
  // Two-stage decode:
  //  (1) FAST: AudioContext.decodeAudioData on the raw bytes — works for
  //      MP3/WAV/M4A/OGG/FLAC. Native, instant.
  //  (2) FALLBACK: HTMLVideoElement playback at 16x + capture via WebAudio.
  //      Works for MP4/WebM/MOV video containers that decodeAudioData refuses.
  //      Real-time-bound (16x speedup) but reliable for any browser-playable file.
  async function _transcribeViaWorkerChunked(workerUrl, pcm, sampleRate, language, onProgress) {
    const totalSec = pcm.length / sampleRate;
    const CHUNK_DUR = 90;  // 1.5 min per chunk → ~2.9MB WAV
    const boundaries = [];
    for (let s = 0; s < totalSec; s += CHUNK_DUR) {
      boundaries.push([s, Math.min(totalSec, s + CHUNK_DUR)]);
    }
    if (!boundaries.length) boundaries.push([0, 0]);

    const allText = [];
    const allChunks = [];
    let _firstLang = null;
    for (let i = 0; i < boundaries.length; i++) {
      const [s, e] = boundaries[i];
      const headLine = boundaries.length === 1
        ? 'שולח לענן…'
        : 'חלק ' + (i + 1) + '/' + boundaries.length + ' (' + _formatHMS(s) + '–' + _formatHMS(e) + ')…';
      if (onProgress) onProgress(headLine);

      const slice = _slicePcmSec(pcm, s, e, sampleRate);
      const wavBytes = _pcmToWavBytes(slice, sampleRate);
      const result = await _transcribeViaWorker(workerUrl, wavBytes, language, onProgress);
      allText.push((result.text || '').trim());
      if (Array.isArray(result.chunks)) {
        for (const c of result.chunks) {
          allChunks.push({
            timestamp: [c.timestamp[0] + s, c.timestamp[1] + s],
            text: c.text
          });
        }
      }
      if (i === 0 && result.detectedLanguage) _firstLang = result.detectedLanguage;
    }
    return { text: allText.filter(Boolean).join(' '), chunks: allChunks, detectedLanguage: _firstLang };
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
  window.VT_WORKER = { _transcribeViaWorker:_transcribeViaWorker, _translateViaWorker:_translateViaWorker, _transcribeViaWorkerChunked:_transcribeViaWorkerChunked, _pingWorker:_pingWorker, _preflightWorker:_preflightWorker, _transcribeYouTubeViaWorker:_transcribeYouTubeViaWorker };
})();