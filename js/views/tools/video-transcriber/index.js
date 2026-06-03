(function () {
  // Video transcriber: main UI + whisper worker. Helpers are in sibling files.
  var _U=window.VT_UTILS,_A=window.VT_AUDIO,_S=window.VT_SAVE,_F=window.VT_FFMPEG,_W=window.VT_WORKER,_M=window.VT_MP3,_T=window.VT_TOAST;
  var _esc=_U._esc,_parseTimeInput=_U._parseTimeInput,_formatHMS=_U._formatHMS,_extractYouTubeId=_U._extractYouTubeId,_trimAudio=_U._trimAudio,_buildTimestampedHtml=_U._buildTimestampedHtml,_arrayBufferToBase64=_U._arrayBufferToBase64,_filterChunksByRanges=_U._filterChunksByRanges,_buildMultiSectionDocHtml=_U._buildMultiSectionDocHtml;
  var _decodeAnyFileToPcm=_A._decodeAnyFileToPcm,_decodeViaVideoElement=_A._decodeViaVideoElement,_slicePcmSec=_A._slicePcmSec,_pcmToWavBytes=_A._pcmToWavBytes;
  var _saveBlobViaPicker=_S._saveBlobViaPicker,_saveDocViaPicker=_S._saveDocViaPicker,_saveWavViaPicker=_S._saveWavViaPicker,_saveMp3ViaPicker=_S._saveMp3ViaPicker,_saveVideoViaPicker=_S._saveVideoViaPicker;
  var _loadFfmpeg=_F._loadFfmpeg,_mergeVideos=_F._mergeVideos,_cutVideoClip=_F._cutVideoClip,_cutVideoClipLegacy=_F._cutVideoClipLegacy,_explainErr=_F._explainErr;
  var _transcribeViaWorker=_W._transcribeViaWorker,_translateViaWorker=_W._translateViaWorker,_transcribeViaWorkerChunked=_W._transcribeViaWorkerChunked,_pingWorker=_W._pingWorker,_preflightWorker=_W._preflightWorker,_transcribeYouTubeViaWorker=_W._transcribeYouTubeViaWorker;
  var _readMp3Metadata=_M._readMp3Metadata,_sliceMp3ByTimeBytes=_M._sliceMp3ByTimeBytes,_transcribeMp3ByteSliced=_M._transcribeMp3ByteSliced;
  var _getVtToast=_T._getVtToast,_vtToastHtml=_T._vtToastHtml,_vtShowProgress=_T._vtShowProgress,_vtShowDone=_T._vtShowDone,_vtShowError=_T._vtShowError;
  const WHISPER_WORKER_SRC = `
let _pipe = null;
self.onmessage = async function(e) {
  var d = e.data;
  if (d.type === 'init') {
    try {
      var modelName = d.model || 'Xenova/whisper-small';
      var mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      var pipeline = mod.pipeline, env = mod.env;
      env.allowLocalModels = false;
      env.useBrowserCache  = false;
      _pipe = await pipeline('automatic-speech-recognition', modelName, {
        quantized: true,
        progress_callback: function(p) {
          self.postMessage({ type: 'progress', status: p.status, progress: p.progress || 0 });
        }
      });
      self.postMessage({ type: 'ready' });
    } catch(err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  } else if (d.type === 'transcribe') {
    try {
      var result = await _pipe(
        { data: d.audio, sampling_rate: 16000 },
        { language: 'hebrew', task: 'transcribe',
          chunk_length_s: 30, stride_length_s: 5,
          return_timestamps: true }
      );
      self.postMessage({ type: 'result', text: result.text, chunks: result.chunks || [] });
    } catch(err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
`;

  var _ww        = null;   // Whisper Worker instance
  var _wwReady   = null;   // null | Promise<void>
  var _wwModel   = null;   // currently-initialised model name
  var _wwProgCb  = null;   // progress callback
  var _wwDone    = null;   // { resolve, reject }
  var _vtRunning = false;

  function _ensureWhisperWorker(model) {
    model = model || 'Xenova/whisper-small';
    if (_wwReady && _wwModel === model) return _wwReady;
    // Different model requested → tear down and re-init
    if (_ww) { try { _ww.terminate(); } catch(_) {} }
    _ww = null; _wwReady = null; _wwDone = null;
    _wwModel = model;

    var blob = new Blob([WHISPER_WORKER_SRC], { type: 'text/javascript' });
    _ww = new Worker(URL.createObjectURL(blob));
    _wwReady = new Promise(function(resolve, reject) {
      _ww.onmessage = function(e) {
        var d = e.data;
        if (d.type === 'progress') {
          if (_wwProgCb) _wwProgCb(d);
        } else if (d.type === 'ready') {
          resolve();
        } else if (d.type === 'error') {
          _wwReady = null;
          try { _ww.terminate(); } catch(_) {}
          _ww = null; _wwModel = null;
          if (_wwDone) { _wwDone.reject(new Error(d.message)); _wwDone = null; }
          else reject(new Error(d.message));
        } else if (d.type === 'result') {
          if (_wwDone) {
            _wwDone.resolve({ text: d.text, chunks: d.chunks || [] });
            _wwDone = null;
          }
        }
      };
      _ww.onerror = function(err) {
        _wwReady = null; _ww = null; _wwModel = null;
        if (_wwDone) { _wwDone.reject(err); _wwDone = null; }
        else reject(err);
      };
      _ww.postMessage({ type: 'init', model: model });
    });
    return _wwReady;
  }

  function _whisperTranscribe(audioFloat32) {
    return new Promise(function(resolve, reject) {
      _wwDone = { resolve: resolve, reject: reject };
      _ww.postMessage({ type: 'transcribe', audio: audioFloat32 }, [audioFloat32.buffer]);
    });
  }

  // ── Helpers for advanced-settings panel ──────────────────────────────────
  // "600" / "10:00" / "01:23:45" / "10m" / "1h2m3s" / "90s" → seconds
  function buildVideoTranscriber() {
    const MAX_FILE = 2 * 1024 * 1024 * 1024; // 2 GB
    // Hard-coded Worker URL — transparent to the user, no UI field.
    const WORKER_URL = 'https://broad-hall-729c.gagula22.workers.dev';

    const statusEl = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const barTrack = App.el('div', { style: { marginTop: '10px', height: '5px', background: '#e8e8e8', borderRadius: '3px', overflow: 'hidden' } });
    const barFill  = App.el('div', { style: { height: '5px', background: 'linear-gradient(90deg,#cfe4f7,#5ba3d0)', width: '0', transition: 'width 400ms ease' } });
    barTrack.appendChild(barFill);

    const bgBadge = App.el('div', {
      style: { display: 'none', marginTop: '12px', padding: '10px 14px',
               background: '#f0f6fb', border: '1px solid #a0c8e8',
               borderRadius: 'var(--r-sm)', fontSize: '13px', color: '#2d6f9c', lineHeight: '1.5' }
    }, '🎙 התמלול רץ ברקע · תוכל לנווט בחופשיות · תקבל הודעה כשיסיים');

    // ── Advanced settings panel (collapsible) ─────────────────────────────
    // ── Source selector: cloud (Cloudflare Worker) vs local (browser Whisper)
    const sourceSel = document.createElement('select');
    sourceSel.style.cssText = 'padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:rtl;cursor:pointer;flex:1;';
    [
      { v: 'cloud', l: '🚀 Cloudflare Workers AI · large-v3-turbo · מהיר · אפס עומס' },
      { v: 'local', l: '💻 דפדפן (offline) · small/medium · רץ על המחשב' }
    ].forEach(function(o){
      var opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      sourceSel.appendChild(opt);
    });
    sourceSel.value = localStorage.getItem('vt_source') || 'cloud';
    sourceSel.addEventListener('change', function(){
      try { localStorage.setItem('vt_source', sourceSel.value); } catch(_){}
      _toggleSourceFields();
    });

    const modelSel = document.createElement('select');
    modelSel.style.cssText = 'padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:rtl;cursor:pointer;';
    [
      { v: 'Xenova/whisper-small',  l: 'small (~150MB · מהיר · איכות סבירה)' },
      { v: 'Xenova/whisper-medium', l: 'medium (~750MB · איטי · איכות גבוהה)' }
    ].forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      modelSel.appendChild(opt);
    });

    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.placeholder = 'MM:SS / HH:MM:SS';
    startInput.style.cssText = 'padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:ltr;text-align:center;width:130px;';

    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.placeholder = 'MM:SS / HH:MM:SS';
    endInput.style.cssText = startInput.style.cssText;

    const advPanel = document.createElement('details');
    advPanel.style.cssText = 'margin-top:12px;border:1px solid var(--line);border-radius:var(--r-sm);background:#fafafa;';
    advPanel.innerHTML =
      '<summary style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:#555;user-select:none;">⚙️ הגדרות מתקדמות</summary>' +
      '<div id="vt-adv-body" style="padding:12px 14px 14px;border-top:1px solid var(--line);"></div>';
    const advBody = advPanel.querySelector('#vt-adv-body');

    function _advRow(labelText, control) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13px;';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'min-width:90px;color:#555;font-weight:600;';
      lbl.textContent = labelText;
      row.appendChild(lbl); row.appendChild(control);
      return row;
    }

    var sourceRow = _advRow('מקור עיבוד', sourceSel);
    var modelRow  = _advRow('מודל',        modelSel);
    var startRow  = _advRow('זמן התחלה',   startInput);
    var endRow    = _advRow('זמן סיום',    endInput);

    advBody.appendChild(sourceRow);
    advBody.appendChild(modelRow);
    advBody.appendChild(startRow);
    advBody.appendChild(endRow);

    var hint = document.createElement('p');
    hint.style.cssText = 'margin:6px 0 0;font-size:12px;color:#888;line-height:1.5;';
    hint.innerHTML = 'השאר ריק לתמלול הקובץ המלא · דוגמאות: <code style="background:#eee;padding:1px 5px;border-radius:3px;">10:00</code> <code style="background:#eee;padding:1px 5px;border-radius:3px;">1:23:45</code> <code style="background:#eee;padding:1px 5px;border-radius:3px;">90s</code> <code style="background:#eee;padding:1px 5px;border-radius:3px;">1h2m</code>';
    advBody.appendChild(hint);

    function _toggleSourceFields() {
      var isCloud = sourceSel.value === 'cloud';
      modelRow.style.display = isCloud ? 'none' : '';
    }
    _toggleSourceFields();

    // Read & validate advanced settings. Returns full settings object
    // or throws an Error with a Hebrew message on bad input.
    function _readAdvanced() {
      var source   = sourceSel.value || 'cloud';
      var model    = modelSel.value || 'Xenova/whisper-small';
      var rawStart = startInput.value.trim();
      var rawEnd   = endInput.value.trim();
      var startSec = rawStart ? _parseTimeInput(rawStart) : null;
      var endSec   = rawEnd   ? _parseTimeInput(rawEnd)   : null;
      if (Number.isNaN(startSec)) throw new Error('זמן התחלה לא תקין: ' + rawStart);
      if (Number.isNaN(endSec))   throw new Error('זמן סיום לא תקין: ' + rawEnd);
      if (startSec != null && endSec != null && startSec >= endSec) {
        throw new Error('זמן הסיום חייב להיות אחרי זמן ההתחלה');
      }
      var suffix = '';
      if (startSec != null || endSec != null) {
        var a = startSec != null ? _formatHMS(startSec).replace(/^00:/, '') : '0:00';
        var b = endSec   != null ? _formatHMS(endSec).replace(/^00:/, '')   : 'סוף';
        suffix = ' (' + a + '–' + b + ')';
      }
      return {
        source: source,
        workerUrl: WORKER_URL,
        model: model,
        startSec: startSec,
        endSec: endSec,
        suffix: suffix
      };
    }

    // ── Audio file processing ─────────────────────────────────────────────
    async function transcribeFile(file) {
      if (!file || _vtRunning) return;
      if (file.size > MAX_FILE) { statusEl.textContent = 'קובץ גדול מדי — מקסימום 2 GB'; statusEl.style.color = '#c00'; return; }

      // Read advanced settings up-front so validation errors fail fast
      let adv;
      try { adv = _readAdvanced(); }
      catch (err) {
        statusEl.textContent = err.message;
        statusEl.style.color = '#c00';
        _vtShowError(err.message);
        return;
      }

      _vtRunning = true;
      barFill.style.width    = '3%';
      statusEl.style.color   = 'var(--ink-mute)';
      statusEl.textContent   = 'מפענח קובץ אודיו…';
      bgBadge.style.display  = 'block';
      _vtShowProgress(3, 'מפענח קובץ אודיו…');

      // Run everything async — non-blocking even after navigation
      (async function() {
        try {
          var text, chunks, offsetSec, docTitleSrc;
          var detectedLang = null;
          var translation = null;

          if (adv.source === 'cloud') {
            const FAST_LIMIT_BYTES = 95 * 1024 * 1024;
            const noTrim = (adv.startSec == null && adv.endSec == null);
            const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
            const isCompressedAudio = ['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac'].indexOf(ext) >= 0;
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);

            // (Pre-flight removed — it was blocking on transient Cloudflare
            // failures even when the real chunked transcription would have
            // succeeded via the retry mechanism.)

            // ── MP3 BYTE-SLICE PATH: works for any MP3 size, with or without
            // trim. Avoids decoding entirely (which Chrome fails on long MP3s),
            // validates trim against actual duration, and produces correct
            // sub-files at frame boundaries for upload.
            let mp3meta = null;
            if (ext === '.mp3') {
              statusEl.textContent = 'בודק metadata של MP3 (' + sizeMB + ' MB)…';
              _vtShowProgress(8, 'בודק metadata של MP3…');
              try { mp3meta = await _readMp3Metadata(file); } catch (_) {}
            }

            if (mp3meta) {
              const startSec = adv.startSec || 0;
              const endSec = (adv.endSec != null) ? adv.endSec : mp3meta.durationSec;
              if (endSec > mp3meta.durationSec + 0.5) {
                throw new Error('זמן סיום ' + _formatHMS(endSec) + ' חורג ממשך הקובץ (' + _formatHMS(mp3meta.durationSec) + ')');
              }
              const rangeMin = ((endSec - startSec) / 60).toFixed(1);
              statusEl.textContent = 'מתמלל ' + rangeMin + ' דקות MP3 בענן (חיתוך ישיר)…';
              _vtShowProgress(15, 'מתמלל ' + rangeMin + ' דקות MP3 בענן…');

              const cloudResult = await _transcribeMp3ByteSliced(
                adv.workerUrl, mp3meta, startSec, endSec, 'auto',
                function(msg){
                  if (document.body.contains(statusEl)) statusEl.textContent = msg;
                  _vtShowProgress(60, msg);
                }
              );
              text   = cloudResult.text;
              chunks = cloudResult.chunks;
              detectedLang = cloudResult.detectedLanguage || null;
              offsetSec = 0;  // already absolute (helper added startSec to each chunk)
              docTitleSrc = 'תמלול · Cloudflare Workers AI · whisper-large-v3-turbo';
            } else if (file.size <= FAST_LIMIT_BYTES && noTrim && isCompressedAudio) {
              // ── FAST PATH for non-MP3 compressed audio ≤95MB
              statusEl.textContent = 'מעלה ' + sizeMB + ' MB ל-Cloudflare (ללא פענוח)…';
              barFill.style.width  = '15%';
              _vtShowProgress(15, 'מעלה ' + sizeMB + ' MB ל-Cloudflare (מסלול מהיר — ללא פענוח)…');
              const ab = await file.arrayBuffer();
              const cloudResult = await _transcribeViaWorker(adv.workerUrl, ab, 'auto', function(msg){
                if (document.body.contains(statusEl)) statusEl.textContent = msg;
                _vtShowProgress(60, msg);
              });
              text   = cloudResult.text;
              chunks = cloudResult.chunks;
              detectedLang = cloudResult.detectedLanguage || null;
              offsetSec = 0;
              docTitleSrc = 'תמלול · Cloudflare Workers AI · whisper-large-v3-turbo';
            } else {
            // ── CHUNKED PATH: decode → downsample → ~40-min WAV chunks ─────
            // Used for non-MP3 large files, video files, or partial-range trims
            // on non-MP3 sources.
            statusEl.textContent = 'מפענח קובץ ' + sizeMB + ' MB בדפדפן…';
            barFill.style.width  = '8%';
            _vtShowProgress(8, 'מפענח קובץ אודיו בדפדפן…');
            const decoded = await _decodeAnyFileToPcm(file, function(msg){
              if (document.body.contains(statusEl)) statusEl.textContent = msg;
              _vtShowProgress(10, msg);
            });
            let pcm = decoded.pcm;

            // Apply user's trim range (if set)
            if (adv.startSec != null || adv.endSec != null) {
              pcm = _slicePcmSec(pcm, adv.startSec, adv.endSec, decoded.sampleRate);
            }
            offsetSec = adv.startSec || 0;

            const totalMin = (pcm.length / decoded.sampleRate / 60).toFixed(1);
            statusEl.textContent = 'מתמלל בענן (' + totalMin + ' דקות אודיו)…';
            _vtShowProgress(20, 'מתמלל ' + totalMin + ' דקות בענן…');

            const cloudResult = await _transcribeViaWorkerChunked(
              adv.workerUrl, pcm, decoded.sampleRate, 'auto',
              function(msg){
                if (document.body.contains(statusEl)) statusEl.textContent = msg;
                _vtShowProgress(60, msg);
              }
            );
            text   = cloudResult.text;
            chunks = cloudResult.chunks;
            detectedLang = cloudResult.detectedLanguage || null;
            // Apply offset to chunks if user trimmed (timestamps stay absolute
            // from start of original file, like the local path)
            if (offsetSec && chunks) {
              chunks = chunks.map(function(c){
                return { timestamp: [c.timestamp[0] + offsetSec, c.timestamp[1] + offsetSec], text: c.text };
              });
            }
            docTitleSrc = 'תמלול · Cloudflare Workers AI · whisper-large-v3-turbo';
            }  // end of CHUNKED PATH

            // ── AUTO-TRANSLATE TO HEBREW if source language detected and != 'he' ──
            if (detectedLang && detectedLang !== 'he' && detectedLang !== 'iw' && text && text.trim().length > 0) {
              statusEl.textContent = '🌍 מזוהה: ' + detectedLang + ' · מתרגם לעברית באמצעות Llama 3…';
              _vtShowProgress(85, '🌍 מזוהה: ' + detectedLang + ' · מתרגם לעברית…');
              try {
                const translateResult = await _translateViaWorker(adv.workerUrl, text, 'he', function(msg){
                  if (document.body.contains(statusEl)) statusEl.textContent = '🌍 ' + msg;
                  _vtShowProgress(90, '🌍 ' + msg);
                });
                translation = {
                  text: translateResult.translation,
                  sourceLang: detectedLang,
                  targetLang: 'he',
                  targetName: translateResult.targetName || 'Hebrew'
                };
                docTitleSrc += ' · תרגום לעברית: Llama 3';
              } catch (translateErr) {
                console.warn('[transcribe] translation failed:', translateErr);
                // Don't abort — just skip translation and proceed with original transcript
                statusEl.textContent = '⚠️ תרגום נכשל: ' + translateErr.message + ' · ממשיך בלי תרגום';
              }
            }
          } else {
            // ── Local path: decode in browser, run Whisper in Web Worker ─────
            statusEl.textContent = 'מפענח קובץ אודיו…';
            _vtShowProgress(8, 'מפענח קובץ אודיו…');
            const decodedLocal = await _decodeAnyFileToPcm(file, function(msg){
              if (document.body.contains(statusEl)) statusEl.textContent = msg;
              _vtShowProgress(10, msg);
            });
            let audio = decodedLocal.pcm;

            audio = _trimAudio(audio, adv.startSec, adv.endSec);
            const durationMin = Math.round(audio.length / 16000 / 60);
            offsetSec = adv.startSec || 0;

            const isMedium = adv.model.indexOf('medium') >= 0;
            _wwProgCb = function(p) {
              if (p.status === 'progress') {
                const pct = Math.round(p.progress || 0);
                const sizeNote = isMedium ? '~750MB' : '~150MB';
                const msg = `מוריד מודל Whisper (${sizeNote})… ${pct}% — חד-פעמי`;
                if (document.body.contains(statusEl)) { barFill.style.width = (3 + pct * 0.15) + '%'; statusEl.textContent = msg; }
                _vtShowProgress(3 + pct * 0.15, msg);
              }
            };
            const initMsg = 'מאתחל מודל Whisper AI…';
            if (document.body.contains(statusEl)) statusEl.textContent = initMsg;
            _vtShowProgress(18, initMsg);
            await _ensureWhisperWorker(adv.model);

            const transMsg = `מתמלל ${durationMin} דקות אודיו ברקע…`;
            if (document.body.contains(statusEl)) { barFill.style.width = '22%'; statusEl.textContent = transMsg; }
            _vtShowProgress(22, transMsg);

            const localResult = await _whisperTranscribe(audio);
            text   = localResult.text;
            chunks = localResult.chunks;
            docTitleSrc = 'תמלול עברית · Whisper AI ' + (isMedium ? '(medium)' : '(small)');
          }

          // ── Build Word .doc (shared between cloud + local paths) ──────────
          if (document.body.contains(statusEl)) _vtShowProgress(97, 'מכין קובץ Word…');
          const baseName  = file.name.replace(/\.[^.]+$/, '') + adv.suffix;
          const dateStr   = new Date().toLocaleDateString('he-IL');
          const paragraphs = _buildTimestampedHtml(chunks, offsetSec, null, text);

          // Build optional translation block (auto-translate when source != Hebrew)
          let translationBlock = '';
          if (translation && translation.text) {
            const langLabel = ({ en: 'אנגלית', ar: 'ערבית', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית', de: 'גרמנית' })[detectedLang] || detectedLang;
            const transParas = translation.text.split(/\n+/).filter(function(p){ return p.trim(); }).map(function(p){
              return '<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 12px;unicode-bidi:plaintext;">' + _esc(p.trim()) + '</p>';
            }).join('');
            translationBlock =
              '<hr style="border:none;border-top:2px solid #2d7a2d;margin:36px 0 18px;">' +
              '<h2 style="font-size:18px;margin:0 0 4px;direction:rtl;text-align:right;color:#2d7a2d;">🌍 תרגום לעברית</h2>' +
              '<p style="font-size:11px;color:#999;margin:0 0 18px;direction:rtl;text-align:right;">תורגם אוטומטית מ' + _esc(langLabel) + ' באמצעות Llama 3 על Cloudflare Workers AI</p>' +
              transParas;
          }

          // Section header for transcript when translation exists (so the user
          // sees clearly that the first section is the source-language transcript)
          let transcriptHeader = '';
          if (translation && translation.text && detectedLang && detectedLang !== 'he') {
            const sourceLabel = ({ en: 'אנגלית', ar: 'ערבית', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית', de: 'גרמנית' })[detectedLang] || detectedLang;
            transcriptHeader = '<h2 style="font-size:18px;margin:0 0 4px;direction:rtl;text-align:right;color:#2d6f9c;">🎙 תמלול במקור (' + _esc(sourceLabel) + ')</h2>';
          }

          const docHtml = [
            `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
            ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
            ` xmlns='http://www.w3.org/TR/REC-html40'>`,
            `<head><meta charset='utf-8'><title>${_esc(baseName)}</title>`,
            `<style>body{font-family:Arial,sans-serif;padding:36px;max-width:820px;direction:rtl;}`,
            `p{unicode-bidi:plaintext;}</style></head>`,
            `<body dir="rtl">`,
            `<h1 style="font-size:22px;margin-bottom:4px;direction:rtl;text-align:right;">${_esc(baseName)}</h1>`,
            `<p style="font-size:11px;color:#999;margin:0 0 28px;direction:ltr;text-align:left;">`,
            `${_esc(docTitleSrc)} · ${dateStr}</p>`,
            `<hr style="border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;">`,
            transcriptHeader,
            paragraphs,
            translationBlock,
            `</body></html>`
          ].join('');

          const blob    = new Blob(['﻿', docHtml], { type: 'application/msword' });
          const dlName  = baseName + '_תמלול.doc';

          if (document.body.contains(statusEl)) {
            barFill.style.width    = '100%';
            bgBadge.style.display  = 'none';
            statusEl.style.color   = 'var(--sky-deep,#2d6f9c)';
            const wordCount = Math.round(text.split(/\s+/).length);
            const transNote = translation && translation.text
              ? ' + תרגום לעברית (' + (detectedLang || '?') + '→he)'
              : '';
            statusEl.textContent   = `✓ תמלול הושלם · ${wordCount} מילים${transNote} · ראה הודעה בפינה`;
          }
          _vtShowDone(dlName, blob);

        } catch (e) {
          if (document.body.contains(statusEl)) {
            barFill.style.width   = '0';
            bgBadge.style.display = 'none';
            statusEl.style.color  = '#c00';
            statusEl.textContent  = 'שגיאה: ' + e.message;
          }
          _vtShowError(e.message);
          console.error('[Transcriber]', e);
        } finally {
          _vtRunning = false;
        }
      })();
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.mp3,.mp4,.wav,.m4a,.webm,.ogg,.aac,.flac';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function() { transcribeFile(fileInput.files[0]); fileInput.value = ''; });

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: function() { if (!_vtRunning) fileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '🎙'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ אודיו / וידאו לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } },
        '.mp3  .mp4  .wav  .m4a  .webm  .ogg  .aac  .flac · עד 2 GB · תמלול ברקע')
    ]);
    zone.addEventListener('dragover',  function(e) { e.preventDefault(); zone.style.borderColor = 'var(--sky-deep,#5ba3d0)'; zone.style.background = 'var(--sky,#cfe4f7)'; });
    zone.addEventListener('dragleave', function()  { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', function(e) {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      if (!_vtRunning) transcribeFile(e.dataTransfer.files[0]);
    });

    // ── YouTube → external download launcher ──────────────────────────────
    // YouTube actively blocks audio extraction from datacenter IPs (verified
    // 2026: TVHTML5, IOS, ANDROID InnerTube clients all return 400/lockdown
    // from Cloudflare). Solution: paste URL → click → opens a downloader
    // (cobalt/savefrom/yt1s) → user drags MP3 → cloud transcribes + picker.
    const ytInput = document.createElement('input');
    ytInput.type = 'text';
    ytInput.placeholder = 'הדבק קישור YouTube…';
    ytInput.style.cssText = 'flex:1;padding:8px 12px;border:1px solid #d0c080;border-radius:8px;font-size:13px;outline:none;background:#fffef5;direction:ltr;min-width:0;';

    const ytStatusEl = App.el('div', {
      style: { fontSize: '12px', color: 'var(--ink-mute)', marginTop: '10px', lineHeight: '1.55', minHeight: '16px' }
    }, '');

    function _ytStatus(msg, color) {
      ytStatusEl.textContent = msg;
      ytStatusEl.style.color = color || 'var(--ink-mute)';
    }

    // External downloader services. `copyFirst:true` copies the URL to the
    // clipboard before opening (for sites that don't accept URL prefill).
    var YT_SERVICES = [
      { name: '⭐ vidssave',  primary: true, copyFirst: true,
        build: function(){ return 'https://vidssave.com/youtube-video-downloader-3cx'; } },
      { name: 'cobalt.tools', build: function(u){ return 'https://cobalt.tools/#' + encodeURIComponent(u); } },
      { name: 'savefrom',     build: function(u){ return 'https://en.savefrom.net/1-youtube-video-downloader-336/?url=' + encodeURIComponent(u); } },
      { name: 'yt1s',         build: function(u){ return 'https://yt1s.com/youtube-to-mp3?q=' + encodeURIComponent(u); } },
      { name: 'y2mate',       build: function(u, id){ return 'https://www.y2mate.com/youtube-mp3/' + id; } },
      { name: 'ssyoutube',    build: function(u){ return u.replace('youtube.com', 'ssyoutube.com').replace('youtu.be/', 'ssyoutu.be/'); } }
    ];

    async function _openYtService(svc) {
      var url = ytInput.value.trim();
      if (!url) { ytInput.focus(); _ytStatus('❌ הדבק קישור YouTube ואז לחץ על שירות', '#c00'); return; }
      var vidId = _extractYouTubeId(url);
      if (!vidId) { _ytStatus('❌ קישור YouTube לא תקין', '#c00'); return; }

      // For services without URL prefill, copy the YouTube URL to clipboard
      // first so the user just hits Ctrl+V on the destination page.
      var copied = false;
      if (svc.copyFirst && navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(url); copied = true; } catch (_) {}
      }

      var dest = svc.build(url, vidId);
      window.open(dest, '_blank', 'noopener,noreferrer');

      var clipboardNote = copied ? ' · הקישור הועתק ל-clipboard, ב-' + svc.name.replace(/^[^\w]+/, '') + ' הקלד Ctrl+V' : '';
      _ytStatus('✓ נפתח ' + svc.name + ' בכרטיסייה חדשה' + clipboardNote + ' · הורד MP3 → גרור לתיבה למעלה', '#2d7a2d');
    }

    var ytPrimaryRow = document.createElement('div');
    ytPrimaryRow.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;';
    var ytFallbackLabel = document.createElement('div');
    ytFallbackLabel.style.cssText = 'font-size:11px;color:#999;margin-top:14px;margin-bottom:4px;';
    ytFallbackLabel.textContent = 'אם vidssave חסום — נסה אחד מאלה:';
    var ytFallbackRow = document.createElement('div');
    ytFallbackRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    YT_SERVICES.forEach(function(svc) {
      var b = document.createElement('button');
      b.textContent = svc.name;
      if (svc.primary) {
        b.style.cssText = 'padding:10px 22px;background:#f5c842;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#3b3a3a;transition:background 120ms;flex:1;min-width:200px;';
        b.onmouseover = function(){ b.style.background = '#f0b800'; };
        b.onmouseout  = function(){ b.style.background = '#f5c842'; };
        ytPrimaryRow.appendChild(b);
      } else {
        b.style.cssText = 'padding:6px 12px;background:#fff7d6;border:1px solid #d0c080;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#5a4a00;transition:background 120ms;';
        b.onmouseover = function(){ b.style.background = '#f5c842'; };
        b.onmouseout  = function(){ b.style.background = '#fff7d6'; };
        ytFallbackRow.appendChild(b);
      }
      b.onclick = function(){ _openYtService(svc); };
    });
    ytInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter') _openYtService(YT_SERVICES[0]);
    });

    // Helper for step section headers — gives each step a numbered badge
    function _stepHeader(num, title, color) {
      return App.el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }
      }, [
        App.el('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '26px', height: '26px', borderRadius: '50%',
            background: color, color: '#fff', fontWeight: '700', fontSize: '13px',
            flexShrink: '0'
          }
        }, String(num)),
        App.el('div', {
          style: { fontWeight: '700', fontSize: '14px', color: '#3b3a3a' }
        }, title)
      ]);
    }
    function _stepHowto(lines) {
      var ol = document.createElement('ol');
      ol.style.cssText = 'margin:6px 0 12px 26px;padding:0;font-size:12px;color:#666;line-height:1.85;';
      lines.forEach(function(line){
        var li = document.createElement('li');
        li.innerHTML = line;
        ol.appendChild(li);
      });
      return ol;
    }

    const ytSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader(1, 'להוריד את הוידאו מ-YouTube ולשמור במחשב', '#5ba3d0'),
      _stepHowto([
        'הדבק את כתובת הוידאו מ-YouTube בשדה למטה',
        'לחץ על <b>⭐ vidssave</b> · הקישור מועתק ל-clipboard ואתר הורדה ייפתח בכרטיסייה חדשה',
        'באתר ההורדה: לחץ בשדה והקלד <b>Ctrl+V</b> · בחר פורמט (MP3 הכי מהיר; MP4 גם נתמך) · לחץ <b>Download</b>',
        'הקובץ יורד לתיקיית ההורדות במחשב — סיימת את שלב 1'
      ]),
      ytInput,
      ytPrimaryRow,
      ytFallbackLabel,
      ytFallbackRow,
      ytStatusEl
    ]);

    // ── Cut tool: split a file into clips by time ranges, save each ──────
    let _cutFile = null;
    let _cutDecoded = null;
    let _cutMp3Meta = null;   // when set, byte-slice path is used (MP3 fast)
    let _cutRunning = false;

    const cutFileLabel = document.createElement('div');
    cutFileLabel.style.cssText = 'font-size:12px;color:#888;margin-top:8px;min-height:16px;';

    const cutStatusEl = document.createElement('div');
    cutStatusEl.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;line-height:1.55;min-height:16px;';

    function _cutStatus(msg, color) {
      cutStatusEl.textContent = msg;
      cutStatusEl.style.color = color || 'var(--ink-mute)';
    }

    async function _cutLoadFile(file) {
      if (!file || _cutRunning) return;
      _cutFile = file;
      _cutDecoded = null;
      _cutMp3Meta = null;
      cutFileLabel.textContent = '📁 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · קורא…';
      _cutStatus('⏳ קורא קובץ…');
      try {
        // Fast path: MP3 — byte-slice without decoding. Even VBR works because
        // we read Xing/Info header for duration.
        let mp3 = null;
        let mp3Err = null;
        try {
          mp3 = await _readMp3Metadata(file);
        } catch (e) {
          mp3Err = e;
          console.warn('[cut] _readMp3Metadata threw:', e);
        }
        console.log('[cut] MP3 metadata for', file.name, '=', mp3, 'err=', mp3Err);

        if (mp3) {
          _cutMp3Meta = mp3;
          _cutDecoded = { durationSec: mp3.durationSec };
          const min = (mp3.durationSec / 60).toFixed(1);
          const kbps = Math.round(mp3.bitrate / 1000);
          const vbrTag = mp3.isVbr ? ' VBR' : ' CBR';
          cutFileLabel.textContent = '📁 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) +
            ' MB · משך: ' + min + ' דקות · MP3 ' + kbps + 'kbps' + vbrTag + ' · חיתוך ישיר';
          const vbrNote = mp3.isVbr ? ' (VBR — קצוות עשויים לסטות בשנייה־שתיים)' : '';
          _cutStatus('✓ מוכן (מסלול MP3 מהיר v2)' + vbrNote + ' — הקליפים יישמרו כ-MP3', '#2d7a2d');
          return;
        }

        // MP3 parsing failed — show why before falling back to slow decode
        const ext = ((file.name || '').match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (ext === '.mp3') {
          _cutStatus('⚠️ הקובץ הוא MP3 אבל לא הצלחתי לפענח header — נופל למסלול דקודר איטי. בדוק Console (F12)', '#b85c00');
        } else {
          _cutStatus('⏳ פורמט לא-MP3 (' + ext + ') — עובר לדקודר…');
        }
        _cutDecoded = await _decodeAnyFileToPcm(file, function(msg){ _cutStatus('⏳ ' + msg); });
        const min = (_cutDecoded.durationSec / 60).toFixed(1);
        cutFileLabel.textContent = '📁 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · משך: ' + min + ' דקות (דקודר)';
        _cutStatus('✓ מוכן (מסלול דקודר) — הקליפים יישמרו כ-WAV', '#2d7a2d');
      } catch (e) {
        _cutStatus('❌ לא הצלחתי לקרוא: ' + e.message, '#c00');
        cutFileLabel.textContent = '';
      }
    }

    const cutFileInput = document.createElement('input');
    cutFileInput.type = 'file';
    cutFileInput.accept = '.mp3,.mp4,.wav,.m4a,.webm,.ogg,.aac,.flac';
    cutFileInput.style.display = 'none';
    cutFileInput.addEventListener('change', function(){ _cutLoadFile(cutFileInput.files[0]); cutFileInput.value = ''; });

    const cutZone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)',
               marginTop: '10px' },
      onClick: function() { if (!_cutRunning) cutFileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '28px', marginBottom: '4px' } }, '✂️'),
      App.el('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '2px' } },
        'גרור קובץ שמע בלבד לחיתוך כאן'),
      App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
        'MP3 / MP4 / WAV / M4A / WebM · הקליפים יישמרו כ-WAV במקום שתבחר')
    ]);
    cutZone.addEventListener('dragover',  function(e) { e.preventDefault(); cutZone.style.borderColor = 'var(--lavender-deep,#9b8bb8)'; cutZone.style.background = 'var(--lavender,#e6ddf4)'; });
    cutZone.addEventListener('dragleave', function()  { cutZone.style.borderColor = 'var(--line)'; cutZone.style.background = 'var(--cream)'; });
    cutZone.addEventListener('drop', function(e) {
      e.preventDefault(); cutZone.style.borderColor = 'var(--line)'; cutZone.style.background = 'var(--cream)';
      _cutLoadFile(e.dataTransfer.files[0]);
    });

    // Cut ranges UI (independent from transcription's start/end inputs)
    const cutRangesContainer = document.createElement('div');
    cutRangesContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px;';

    function _addCutRangeRow(start, end) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const startBox = document.createElement('input');
      startBox.type = 'text';
      startBox.placeholder = 'התחלה (1:30)';
      startBox.value = start || '';
      startBox.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:ltr;text-align:center;';
      const endBox = document.createElement('input');
      endBox.type = 'text';
      endBox.placeholder = 'סיום (3:00)';
      endBox.value = end || '';
      endBox.style.cssText = startBox.style.cssText;
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '×';
      rmBtn.title = 'הסר קטע';
      rmBtn.style.cssText = 'width:32px;height:32px;background:#fff7d6;border:1px solid #d0c080;border-radius:8px;font-size:16px;cursor:pointer;color:#888;flex-shrink:0;';
      rmBtn.onclick = function(){ row.remove(); };
      row.appendChild(startBox);
      row.appendChild(endBox);
      row.appendChild(rmBtn);
      row.__startBox = startBox;
      row.__endBox = endBox;
      cutRangesContainer.appendChild(row);
    }
    _addCutRangeRow();  // start with one empty row

    const cutAddBtn = document.createElement('button');
    cutAddBtn.textContent = '＋ הוסף קטע';
    cutAddBtn.style.cssText = 'padding:6px 14px;background:#fff;border:1px dashed #d0c080;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#5a4a00;margin-top:6px;align-self:flex-start;';
    cutAddBtn.onclick = function(){ _addCutRangeRow(); };

    const cutGoBtn = document.createElement('button');
    cutGoBtn.textContent = '✂️ חתוך ושמור קליפים';
    cutGoBtn.style.cssText = 'padding:10px 22px;background:#e6ddf4;border:1px solid #9b8bb8;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#3b3a3a;margin-top:12px;align-self:flex-start;';

    async function _cutGo() {
      if (_cutRunning) return;
      if (!_cutDecoded) { _cutStatus('❌ גרור קובץ קודם', '#c00'); return; }

      const ranges = [];
      const rows = cutRangesContainer.children;
      for (let i = 0; i < rows.length; i++) {
        const rs = rows[i].__startBox.value.trim();
        const re = rows[i].__endBox.value.trim();
        if (!rs && !re) continue;
        const s = _parseTimeInput(rs);
        const e = _parseTimeInput(re);
        if (Number.isNaN(s) || s == null) { _cutStatus('❌ זמן התחלה לא תקין: ' + rs, '#c00'); return; }
        if (Number.isNaN(e) || e == null) { _cutStatus('❌ זמן סיום לא תקין: ' + re, '#c00'); return; }
        if (s >= e) { _cutStatus('❌ סיום לפני התחלה (' + rs + '–' + re + ')', '#c00'); return; }
        if (e > _cutDecoded.durationSec + 0.5) {
          _cutStatus('❌ ' + re + ' חורג ממשך הקובץ (' + _formatHMS(_cutDecoded.durationSec) + ')', '#c00');
          return;
        }
        ranges.push([s, e]);
      }
      if (!ranges.length) { _cutStatus('❌ הוסף לפחות טווח אחד', '#c00'); return; }

      _cutRunning = true;
      cutGoBtn.disabled = true;
      cutGoBtn.textContent = '⏳ חותך…';
      let saved = 0, cancelled = 0;
      const baseStem = _cutFile.name.replace(/\.[^.]+$/, '');
      try {
        for (let i = 0; i < ranges.length; i++) {
          const s = ranges[i][0], e = ranges[i][1];
          _cutStatus('⏳ קליפ ' + (i+1) + '/' + ranges.length + ' (' + _formatHMS(s) + '–' + _formatHMS(e) + ') · בחר היכן לשמור…');
          const tag = _formatHMS(s).replace(/:/g, '-') + '_to_' + _formatHMS(e).replace(/:/g, '-');
          let res;
          if (_cutMp3Meta) {
            // MP3 byte-slice path — fast, lossless, output is MP3
            const mp3Bytes = _sliceMp3ByTimeBytes(_cutMp3Meta, s, e);
            const blob = new Blob([mp3Bytes], { type: 'audio/mpeg' });
            res = await _saveMp3ViaPicker(blob, baseStem + '_' + tag + '.mp3');
          } else {
            // PCM-decode path — output is WAV
            const slice = _slicePcmSec(_cutDecoded.pcm, s, e, _cutDecoded.sampleRate);
            const wavBytes = _pcmToWavBytes(slice, _cutDecoded.sampleRate);
            const blob = new Blob([wavBytes], { type: 'audio/wav' });
            res = await _saveWavViaPicker(blob, baseStem + '_' + tag + '.wav');
          }
          if (res.method === 'cancelled') cancelled++;
          else saved++;
        }
        _cutStatus('✓ נשמרו ' + saved + '/' + ranges.length + ' קליפים' + (cancelled ? ' · ' + cancelled + ' ביטולים' : ''), '#2d7a2d');
      } catch (err) {
        _cutStatus('❌ ' + err.message, '#c00');
      } finally {
        _cutRunning = false;
        cutGoBtn.disabled = false;
        cutGoBtn.textContent = '✂️ חתוך ושמור קליפים';
      }
    }
    cutGoBtn.addEventListener('click', _cutGo);

    const cutSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader(2, 'חיתוך אודיו בלבד (אופציונלי) — פלט WAV', '#9b8bb8'),
      _stepHowto([
        'גרור את הקובץ שהורדת לתיבה למטה — <b>MP3 / MP4 / WAV / M4A / WebM</b>',
        'הוסף טווחי זמן <b>בכל אורך</b> שתרצה. דוגמאות: <code style="background:#eee;padding:1px 4px;border-radius:3px;">1:30</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">3:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">5:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">45:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">10:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">1:35:00</code> (90 דק׳!). אין גבול עליון — רק שזמן הסיום ≤ אורך הקובץ',
        '<b>טיפ למהירות:</b> אם הקובץ MP3 — חיתוך ארוך (40 דק׳+) מסתיים ב<b>שניות</b> (byte-slicing). אם MP4 ארוך — מומלץ להוריד מחדש כ-MP3 דרך vidssave',
        'לחץ "<b>✂️ חתוך ושמור קליפים</b>" · לכל קליפ ייפתח דיאלוג שמירה — בחר תיקייה ושם'
      ]),
      cutFileInput, cutZone, cutFileLabel,
      App.el('div', { style: { fontSize: '12px', color: '#777', marginTop: '12px', marginBottom: '4px', fontWeight: '600' } },
        'טווחי החיתוך:'),
      cutRangesContainer,
      cutAddBtn,
      cutGoBtn,
      cutStatusEl
    ]);

    // ── Video cut tool: outputs MP4/WebM clips with both video + audio ────
    let _vcFile = null;
    let _vcDuration = 0;
    let _vcRunning = false;

    const vcFileLabel = document.createElement('div');
    vcFileLabel.style.cssText = 'font-size:12px;color:#888;margin-top:8px;min-height:16px;';
    const vcStatusEl = document.createElement('div');
    vcStatusEl.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;line-height:1.55;min-height:16px;';
    function _vcStatus(msg, color) {
      vcStatusEl.textContent = msg;
      vcStatusEl.style.color = color || 'var(--ink-mute)';
    }

    async function _vcLoadFile(file) {
      if (!file || _vcRunning) return;
      _vcFile = file;
      _vcDuration = 0;
      vcFileLabel.textContent = '🎬 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · קורא…';
      _vcStatus('⏳ טוען וידאו…');
      try {
        // Probe duration via a temp video element
        const blobUrl = URL.createObjectURL(file);
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.src = blobUrl;
        await new Promise(function(resolve, reject) {
          probe.onloadedmetadata = resolve;
          probe.onerror = function(){ reject(new Error('הדפדפן לא הצליח לטעון את הקובץ כוידאו')); };
          setTimeout(function(){ reject(new Error('טעינה ארוכה מדי')); }, 30000);
        });
        _vcDuration = probe.duration;
        URL.revokeObjectURL(blobUrl);
        const min = (_vcDuration / 60).toFixed(1);
        vcFileLabel.textContent = '🎬 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · משך: ' + min + ' דקות';
        _vcStatus('✓ מוכן · הוסף טווחים ולחץ "חתוך וידאו". זכור — חיתוך וידאו רץ בזמן אמת.', '#2d7a2d');
      } catch (e) {
        _vcStatus('❌ ' + e.message, '#c00');
        vcFileLabel.textContent = '';
      }
    }

    const vcFileInput = document.createElement('input');
    vcFileInput.type = 'file';
    vcFileInput.accept = '.mp4,.webm,.mov,.mkv,.avi';
    vcFileInput.style.display = 'none';
    vcFileInput.addEventListener('change', function(){ _vcLoadFile(vcFileInput.files[0]); vcFileInput.value = ''; });

    const vcZone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)',
               marginTop: '10px' },
      onClick: function() { if (!_vcRunning) vcFileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '28px', marginBottom: '4px' } }, '🎬'),
      App.el('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '2px' } },
        'גרור וידאו לחיתוך לכאן'),
      App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
        'MP4 / WebM / MOV · הקליפים יישמרו עם וידאו+קול במקום שתבחר')
    ]);
    vcZone.addEventListener('dragover',  function(e) { e.preventDefault(); vcZone.style.borderColor = '#5ba3d0'; vcZone.style.background = '#cfe4f7'; });
    vcZone.addEventListener('dragleave', function()  { vcZone.style.borderColor = 'var(--line)'; vcZone.style.background = 'var(--cream)'; });
    vcZone.addEventListener('drop', function(e) {
      e.preventDefault(); vcZone.style.borderColor = 'var(--line)'; vcZone.style.background = 'var(--cream)';
      _vcLoadFile(e.dataTransfer.files[0]);
    });

    const vcRangesContainer = document.createElement('div');
    vcRangesContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px;';
    function _vcAddRangeRow(start, end) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const startBox = document.createElement('input');
      startBox.type = 'text';
      startBox.placeholder = 'התחלה (1:30)';
      startBox.value = start || '';
      startBox.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #5ba3d0;border-radius:8px;font-size:13px;background:#f0f6fb;direction:ltr;text-align:center;';
      const endBox = document.createElement('input');
      endBox.type = 'text';
      endBox.placeholder = 'סיום (3:00)';
      endBox.value = end || '';
      endBox.style.cssText = startBox.style.cssText;
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '×';
      rmBtn.title = 'הסר קטע';
      rmBtn.style.cssText = 'width:32px;height:32px;background:#cfe4f7;border:1px solid #5ba3d0;border-radius:8px;font-size:16px;cursor:pointer;color:#888;flex-shrink:0;';
      rmBtn.onclick = function(){ row.remove(); };
      row.appendChild(startBox); row.appendChild(endBox); row.appendChild(rmBtn);
      row.__startBox = startBox; row.__endBox = endBox;
      vcRangesContainer.appendChild(row);
    }
    _vcAddRangeRow();

    const vcAddBtn = document.createElement('button');
    vcAddBtn.textContent = '＋ הוסף קטע';
    vcAddBtn.style.cssText = 'padding:6px 14px;background:#fff;border:1px dashed #5ba3d0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#2d6f9c;margin-top:6px;align-self:flex-start;';
    vcAddBtn.onclick = function(){ _vcAddRangeRow(); };

    const vcGoBtn = document.createElement('button');
    vcGoBtn.textContent = '🎬 חתוך וידאו ושמור';
    vcGoBtn.style.cssText = 'padding:10px 22px;background:linear-gradient(135deg,#cfe4f7,#5ba3d0);border:1px solid #2d6f9c;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#fff;margin-top:12px;align-self:flex-start;';

    async function _vcGo() {
      if (_vcRunning) return;
      if (!_vcFile) { _vcStatus('❌ גרור קובץ וידאו קודם', '#c00'); return; }

      const ranges = [];
      const rows = vcRangesContainer.children;
      for (let i = 0; i < rows.length; i++) {
        const rs = rows[i].__startBox.value.trim();
        const re = rows[i].__endBox.value.trim();
        if (!rs && !re) continue;
        const s = _parseTimeInput(rs);
        const e = _parseTimeInput(re);
        if (Number.isNaN(s) || s == null) { _vcStatus('❌ זמן התחלה לא תקין: ' + rs, '#c00'); return; }
        if (Number.isNaN(e) || e == null) { _vcStatus('❌ זמן סיום לא תקין: ' + re, '#c00'); return; }
        if (s >= e) { _vcStatus('❌ סיום לפני התחלה (' + rs + '–' + re + ')', '#c00'); return; }
        if (e > _vcDuration + 0.5) {
          _vcStatus('❌ ' + re + ' חורג ממשך הקובץ (' + _formatHMS(_vcDuration) + ')', '#c00');
          return;
        }
        ranges.push([s, e]);
      }
      if (!ranges.length) { _vcStatus('❌ הוסף לפחות טווח אחד', '#c00'); return; }

      const totalSec = ranges.reduce(function(t, r){ return t + (r[1] - r[0]); }, 0);

      _vcRunning = true;
      vcGoBtn.disabled = true;
      vcGoBtn.textContent = '⏳ חותך…';
      let saved = 0, cancelled = 0;
      const baseStem = _vcFile.name.replace(/\.[^.]+$/, '');
      try {
        for (let i = 0; i < ranges.length; i++) {
          const s = ranges[i][0], e = ranges[i][1];
          const tag = _formatHMS(s).replace(/:/g, '-') + '_to_' + _formatHMS(e).replace(/:/g, '-');
          _vcStatus('🎬 קליפ ' + (i+1) + '/' + ranges.length + ' (' + _formatHMS(s) + '–' + _formatHMS(e) + ') · חותך עם ffmpeg…');
          const result = await _cutVideoClip(_vcFile, s, e, function(msg){
            _vcStatus('🎬 קליפ ' + (i+1) + '/' + ranges.length + ' · ' + msg);
          });
          _vcStatus('💾 קליפ ' + (i+1) + '/' + ranges.length + ' · ' + result.sizeMB + ' MB ' + result.ext + ' · בחר היכן לשמור…');
          const clipName = baseStem + '_' + tag + result.ext;
          const saveRes = await _saveVideoViaPicker(result.blob, clipName, result.ext);
          if (saveRes.method === 'cancelled') cancelled++;
          else saved++;
        }
        _vcStatus('✓ נשמרו ' + saved + '/' + ranges.length + ' קליפי וידאו' + (cancelled ? ' · ' + cancelled + ' ביטולים' : ''), '#2d7a2d');
      } catch (err) {
        // _cutVideoClip wraps every failure with its stage name and a helpful
        // explanation, so err.message should already be informative.
        console.error('[video cut v9] failed:', err);
        console.error('[video cut v9] stage:', err && err.stage);
        console.error('[video cut v9] original:', err && err.original);
        const display = _explainErr(err);
        _vcStatus('❌ ' + display, '#c00');
      } finally {
        _vcRunning = false;
        vcGoBtn.disabled = false;
        vcGoBtn.textContent = '🎬 חתוך וידאו ושמור';
      }
    }
    vcGoBtn.addEventListener('click', _vcGo);

    const videoCutSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader('🎬', 'חיתוך וידאו (וידאו+קול) · v12 (classic worker)', '#5ba3d0'),
      _stepHowto([
        'גרור קובץ <b>MP4 / WebM / MOV</b> לתיבה למטה (וידאו עם פסקול)',
        'הוסף טווחי זמן <b>בכל אורך</b>. דוגמאות: <code style="background:#eee;padding:1px 4px;border-radius:3px;">2:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">5:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">10:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">50:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">5:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">1:35:00</code>. אין מקסימום — מותר עד אורך הקובץ',
        'לחץ "<b>🎬 חתוך וידאו ושמור</b>" — ffmpeg.wasm מבצע <b>stream copy</b> (העתק בייט-בייט בלי לפענח/לקודד). חיתוך של 40 דק׳ מסתיים תוך <b>שניות</b>',
        'פעם ראשונה ffmpeg יורד (~30MB, חד-פעמי, נשמר ב-cache). אחר כך — מיידי. הקליפים נשמרים כ-MP4'
      ]),
      vcFileInput, vcZone, vcFileLabel,
      App.el('div', { style: { fontSize: '12px', color: '#777', marginTop: '12px', marginBottom: '4px', fontWeight: '600' } },
        'טווחי החיתוך:'),
      vcRangesContainer,
      vcAddBtn,
      vcGoBtn,
      vcStatusEl
    ]);

    // ── Merge: combine multiple video files into one ──────────────────────
    let _mergeFiles = [];
    let _mergeRunning = false;

    const mergeStatusEl = document.createElement('div');
    mergeStatusEl.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;line-height:1.55;min-height:16px;';
    function _mergeStatus(msg, color) {
      mergeStatusEl.textContent = msg;
      mergeStatusEl.style.color = color || 'var(--ink-mute)';
    }

    const mergeFileInput = document.createElement('input');
    mergeFileInput.type = 'file';
    mergeFileInput.accept = '.mp4,.webm,.mov,.mkv';
    mergeFileInput.multiple = true;
    mergeFileInput.style.display = 'none';
    mergeFileInput.addEventListener('change', function(){
      _mergeAddFiles(Array.from(mergeFileInput.files));
      mergeFileInput.value = '';
    });

    const mergeZone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)',
               marginTop: '10px' },
      onClick: function() { if (!_mergeRunning) mergeFileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '28px', marginBottom: '4px' } }, '🎞️'),
      App.el('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '2px' } },
        'גרור או בחר 2+ סרטונים לאיחוד'),
      App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
        'MP4 / WebM / MOV · הקובץ הסופי יישמר כ-MP4')
    ]);
    mergeZone.addEventListener('dragover',  function(e) { e.preventDefault(); mergeZone.style.borderColor = '#f5c842'; mergeZone.style.background = '#fff7d6'; });
    mergeZone.addEventListener('dragleave', function()  { mergeZone.style.borderColor = 'var(--line)'; mergeZone.style.background = 'var(--cream)'; });
    mergeZone.addEventListener('drop', function(e) {
      e.preventDefault(); mergeZone.style.borderColor = 'var(--line)'; mergeZone.style.background = 'var(--cream)';
      _mergeAddFiles(Array.from(e.dataTransfer.files));
    });

    const mergeListContainer = document.createElement('div');
    mergeListContainer.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:12px;';

    function _mergeAddFiles(files) {
      for (const f of files) {
        if (f && f.size > 0) _mergeFiles.push(f);
      }
      _renderMergeList();
    }

    function _renderMergeList() {
      mergeListContainer.innerHTML = '';
      if (_mergeFiles.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'עדיין לא נבחרו סרטונים';
        empty.style.cssText = 'font-size:12px;color:#999;font-style:italic;text-align:center;padding:8px;';
        mergeListContainer.appendChild(empty);
        return;
      }
      _mergeFiles.forEach(function(file, i) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:8px 10px;background:#fff;border:1px solid #e0d4a0;border-radius:6px;';

        const num = document.createElement('span');
        num.textContent = (i + 1) + '.';
        num.style.cssText = 'min-width:24px;color:#666;font-weight:700;font-size:13px;';
        row.appendChild(num);

        const upBtn = document.createElement('button');
        upBtn.innerHTML = '▲';
        upBtn.disabled = (i === 0);
        upBtn.title = 'הזז למעלה';
        upBtn.style.cssText = 'width:26px;height:26px;background:#fff7d6;border:1px solid #d0c080;border-radius:4px;cursor:pointer;font-size:10px;color:#5a4a00;' + (i === 0 ? 'opacity:0.4;' : '');
        upBtn.onclick = function() {
          if (i > 0) {
            const tmp = _mergeFiles[i - 1];
            _mergeFiles[i - 1] = _mergeFiles[i];
            _mergeFiles[i] = tmp;
            _renderMergeList();
          }
        };
        row.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.innerHTML = '▼';
        downBtn.disabled = (i === _mergeFiles.length - 1);
        downBtn.title = 'הזז למטה';
        downBtn.style.cssText = upBtn.style.cssText;
        if (i !== _mergeFiles.length - 1) downBtn.style.opacity = '1';
        else downBtn.style.opacity = '0.4';
        downBtn.onclick = function() {
          if (i < _mergeFiles.length - 1) {
            const tmp = _mergeFiles[i + 1];
            _mergeFiles[i + 1] = _mergeFiles[i];
            _mergeFiles[i] = tmp;
            _renderMergeList();
          }
        };
        row.appendChild(downBtn);

        const info = document.createElement('span');
        info.textContent = file.name + ' · ' + (file.size / 1024 / 1024).toFixed(1) + ' MB';
        info.title = file.name;
        info.style.cssText = 'flex:1;font-size:12px;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right;';
        row.appendChild(info);

        const rmBtn = document.createElement('button');
        rmBtn.textContent = '×';
        rmBtn.title = 'הסר מהרשימה';
        rmBtn.style.cssText = 'width:28px;height:28px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;color:#999;font-size:14px;';
        rmBtn.onclick = function() { _mergeFiles.splice(i, 1); _renderMergeList(); };
        row.appendChild(rmBtn);

        mergeListContainer.appendChild(row);
      });
    }
    _renderMergeList();

    const mergeGoBtn = document.createElement('button');
    mergeGoBtn.textContent = '🎞️ חבר ושמור';
    mergeGoBtn.style.cssText = 'padding:10px 22px;background:linear-gradient(135deg,#fff1c0,#f5c842);border:1px solid #d0c080;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#3b3a3a;margin-top:12px;align-self:flex-start;';

    async function _mergeGo() {
      if (_mergeRunning) return;
      if (_mergeFiles.length < 2) {
        _mergeStatus('❌ צריך לפחות 2 סרטונים לאיחוד', '#c00');
        return;
      }
      _mergeRunning = true;
      mergeGoBtn.disabled = true;
      mergeGoBtn.textContent = '⏳ מעבד…';
      try {
        const blob = await _mergeVideos(_mergeFiles, function(msg){ _mergeStatus('⏳ ' + msg); });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        _mergeStatus('💾 קובץ מאוחד מוכן (' + sizeMB + ' MB) · בחר היכן לשמור…');
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const res = await _saveVideoViaPicker(blob, 'merged_' + stamp + '.mp4', '.mp4');
        if (res.method === 'cancelled') {
          _mergeStatus('ℹ️ ביטלת את השמירה — הקובץ עדיין בזיכרון, לחץ שוב לשמור', '#888');
        } else {
          _mergeStatus('✓ הקובץ המאוחד נשמר! ' + sizeMB + ' MB מ-' + _mergeFiles.length + ' סרטונים', '#2d7a2d');
        }
      } catch (err) {
        _mergeStatus('❌ ' + err.message, '#c00');
        console.error('[merge]', err);
      } finally {
        _mergeRunning = false;
        mergeGoBtn.disabled = false;
        mergeGoBtn.textContent = '🎞️ חבר ושמור';
      }
    }
    mergeGoBtn.addEventListener('click', _mergeGo);

    const mergeSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader('🎞️', 'חיבור כמה סרטונים לסרטון 1', '#f5c842'),
      _stepHowto([
        'גרור או בחר <b>2 סרטונים או יותר</b> (MP4 / WebM / MOV) — אפשר להוסיף כמה פעמים',
        'סדר אותם ברשימה למטה ע"י החיצים <b>▲▼</b> — סדר הרשימה הוא הסדר בקובץ המאוחד',
        'לחץ "<b>🎞️ חבר ושמור</b>" — ffmpeg.wasm רץ ב-Web Worker (ברקע, אינו מעמיס על הדפדפן). פעם ראשונה: ~30MB ההורדה (cache לתמיד)',
        'אם כל הסרטונים באותו קודק (כולם מ-YouTube/אותו מקור): <b>שניות</b> (stream copy). אחרת: re-encoding לוקח זמן יותר'
      ]),
      mergeFileInput, mergeZone,
      App.el('div', { style: { fontSize: '12px', color: '#777', marginTop: '12px', marginBottom: '4px', fontWeight: '600' } },
        'סדר ההופעה בסרטון המאוחד:'),
      mergeListContainer,
      mergeGoBtn,
      mergeStatusEl
    ]);

    const infoBanner = App.el('div', {
      style: { background: '#f0f6fb', border: '1px solid #a0c8e8',
               borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: '14px', lineHeight: '1.55' }
    }, [
      App.el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } },
        '🎙 הזרימה: שלב 1 (הורדה מ-YouTube) → שלב 2 (חיתוך, אופציונלי) → שלב 3 (תמלול בענן). כל קובץ — Whisper-Large-v3-Turbo בענן, ללא עומס על המחשב.')
    ]);

    // ── Step 3: transcribe — wrap the existing drop zone with a header ─────
    const transcribeSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader(3, 'לתמלל את הקובץ בענן ולשמור Word במחשב', '#2d7a2d'),
      _stepHowto([
        'גרור את הקובץ (המקורי או קליפ משלב 2) לתיבה למטה',
        'הענן מתמלל אוטומטית ב-<b>Whisper-Large-v3-Turbo</b> (איכות מקסימלית, ללא עומס על המחשב)',
        'בסיום ייפתח דיאלוג שמירה — <b>בחר תיקייה ושם לקובץ ה-Word</b>',
        'אפשר לפתוח <b>⚙️ הגדרות מתקדמות</b> למצב offline או טווח חלקי'
      ]),
      fileInput, zone, statusEl, barTrack, bgBadge,
      advPanel
    ]);

    // ── Tabbed layout — only one section visible at a time ──────────────
    // Strip the dividers/margins each section was using when stacked.
    [ytSection, cutSection, videoCutSection, mergeSection, transcribeSection].forEach(function(s) {
      s.style.marginTop  = '0';
      s.style.paddingTop = '0';
      s.style.borderTop  = 'none';
    });

    // Tab order follows the natural workflow numbered by the user:
    // 1) download from YouTube → 2) cut audio → 3) transcribe →
    // 4) cut video → 5) merge videos. In RTL the first array item is
    // the right-most tab.
    const tabDefs = [
      { id: 'yt',    icon: '📥', label: 'הורדה מיוטיוב', section: ytSection,         color: '#5ba3d0' },
      { id: 'cut',   icon: '✂️',  label: 'חיתוך אודיו',    section: cutSection,        color: '#9b8bb8' },
      { id: 'trans', icon: '📝', label: 'תמלול',          section: transcribeSection, color: '#2d7a2d' },
      { id: 'vcut',  icon: '🎬', label: 'חיתוך וידאו',   section: videoCutSection,   color: '#5ba3d0' },
      { id: 'merge', icon: '🎞️', label: 'חיבור סרטונים', section: mergeSection,      color: '#f5c842' }
    ];

    const tabBtns = [];
    const tabPanels = [];

    function _setActiveTab(id) {
      tabDefs.forEach(function(t, i) {
        var active = t.id === id;
        tabPanels[i].style.display = active ? 'block' : 'none';
        var b = tabBtns[i];
        if (active) {
          b.style.background  = t.color;
          b.style.color       = '#fff';
          b.style.boxShadow   = '0 2px 8px rgba(60,50,40,.18)';
          b.style.borderColor = t.color;
        } else {
          b.style.background  = '#fff';
          b.style.color       = 'var(--ink-soft)';
          b.style.boxShadow   = '0 1px 2px rgba(60,50,40,.04)';
          b.style.borderColor = 'transparent';
        }
      });
    }

    tabDefs.forEach(function(t, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '<span style="font-size:16px;line-height:1;">' + t.icon + '</span><span>' + t.label + '</span>';
      btn.style.cssText = [
        'padding:10px 16px',
        'border-radius:12px',
        'font-size:13px',
        'font-weight:600',
        'cursor:pointer',
        'white-space:nowrap',
        'transition:all 180ms',
        'border:1.5px solid transparent',
        'background:#fff',
        'color:var(--ink-soft)',
        'display:inline-flex',
        'align-items:center',
        'gap:8px',
        'flex:0 0 auto',
        'box-shadow:0 1px 2px rgba(60,50,40,.04)'
      ].join(';');
      btn.onmouseover = function(){
        if (t.id !== _currentTab) {
          btn.style.background = '#fefcf8';
          btn.style.color = 'var(--ink)';
        }
      };
      btn.onmouseout  = function(){ _setActiveTab(_currentTab); };
      btn.onclick = function(){ _currentTab = t.id; _setActiveTab(t.id); };
      tabBtns.push(btn);

      var panel = App.el('div', {}, [t.section]);
      panel.style.display = i === 0 ? 'block' : 'none';
      tabPanels.push(panel);
    });

    let _currentTab = tabDefs[0].id;

    // Horizontal scroll strip — tabs never wrap or hide on narrow screens.
    const tabStripInner = App.el('div', {
      style: {
        display: 'inline-flex', gap: '8px',
        padding: '6px', minWidth: 'max-content'
      }
    }, tabBtns);
    const tabStrip = App.el('div', {
      style: {
        background: 'var(--cream)',
        borderRadius: 'var(--r-md)',
        marginBottom: '22px',
        border: '1px solid var(--line)',
        overflowX: 'auto', overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch'
      }
    }, [tabStripInner]);

    // Initial active styling
    setTimeout(function(){ _setActiveTab(_currentTab); }, 0);

    const heroHeader = App.el('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '14px',
        flexWrap: 'wrap', marginBottom: '8px'
      }
    }, [
      App.el('div', {
        style: {
          width: '52px', height: '52px', borderRadius: '14px',
          background: 'linear-gradient(135deg,#cfe4f7,#a9ceee)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', flexShrink: '0',
          boxShadow: '0 4px 12px rgba(90,140,200,.18)'
        }
      }, '🎙'),
      App.el('div', { style: { flex: '1', minWidth: '180px' } }, [
        App.el('h2', { style: { margin: '0 0 2px', fontSize: '21px' } }, 'תמלול וידאו בעברית'),
        App.el('div', { style: { fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' } },
          'Whisper AI בענן · איכות גבוהה · ללא עומס על המחשב')
      ]),
      App.el('span', { class: 'chip sky' }, 'ללא עלות')
    ]);

    const flowHint = document.createElement('p');
    flowHint.style.cssText = 'font-size:12.5px;color:var(--ink-mute);margin:0 0 18px;line-height:1.65;';
    flowHint.innerHTML = 'זרימה מומלצת: <b>1.</b> הורדה מיוטיוב → <b>2.</b> חיתוך אודיו (אופציונלי) → <b>3.</b> תמלול. בנוסף — <b>4.</b> חיתוך וידאו · <b>5.</b> חיבור סרטונים. אם הקובץ כבר אצלך, גש ישר לטאב "תמלול".';

    return App.el('div', { class: 'card' }, [
      heroHeader,
      flowHint,
      tabStrip
    ].concat(tabPanels));
  }
  window.Tools = window.Tools || {};
  window.Tools.videoTranscriber = buildVideoTranscriber;
})();