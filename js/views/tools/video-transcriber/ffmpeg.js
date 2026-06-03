(function () {
  // VT ffmpeg video cut/merge (owns _ffmpeg* state). Extracted from index.js.
  let _ffmpegInstance = null;
  let _ffmpegLoading = null;
  async function _loadFfmpeg(onProgress) {
    if (_ffmpegInstance) return _ffmpegInstance;
    if (_ffmpegLoading) return _ffmpegLoading;
    _ffmpegLoading = (async function() {
      function loadScript(src) {
        return new Promise(function(resolve, reject) {
          var s = document.createElement('script');
          s.src = src; s.async = true;
          s.onload = function(){ resolve(); };
          s.onerror = function(){ reject(new Error('Failed to load ' + src)); };
          document.head.appendChild(s);
        });
      }

      // Resolve repo-local paths regardless of where the page itself was
      // loaded from (works for /, /index.html, /#/stickers, etc.)
      const here = location.href.replace(/#.*$/, '').replace(/\?.*$/, '');
      const dir  = here.replace(/[^/]*$/, '');         // strip filename if any
      const vendorBase = dir + 'vendor/ffmpeg/';

      if (onProgress) onProgress('טוען ffmpeg.wasm מהריפו (~30MB, פעם אחת, נשמר ב-cache)…');
      if (!window.FFmpegWASM) await loadScript(vendorBase + 'ffmpeg.js');
      if (!window.FFmpegUtil) await loadScript(vendorBase + 'util.js');

      const FFmpeg = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
      if (!FFmpeg) throw new Error('FFmpeg class לא נטען מ-' + vendorBase + 'ffmpeg.js');

      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', function(e){ if (e && e.message) console.log('[ffmpeg]', e.message); });

      if (onProgress) onProgress('מאתחל ffmpeg core (single-threaded)…');
      // All paths are now same-origin → no Blob URL gymnastics needed.
      // IMPORTANT: do NOT pass classWorkerURL here. With classWorkerURL the
      // library spawns a *module* worker ({type:"module"}), but the bundled
      // 814.ffmpeg.js worker uses importScripts(), which is only available
      // in classic workers. Without classWorkerURL the library auto-creates
      // a classic worker from the publicPath it derived from ffmpeg.js's
      // <script src>, i.e. our vendorBase, which is exactly what we want.
      await ffmpeg.load({
        coreURL: vendorBase + 'ffmpeg-core.js',
        wasmURL: vendorBase + 'ffmpeg-core.wasm'
      });

      _ffmpegInstance = ffmpeg;
      if (onProgress) onProgress('ffmpeg מוכן ✓');
      return ffmpeg;
    })().catch(function(err){
      _ffmpegLoading = null;  // allow retry on next call
      throw err;
    });
    return _ffmpegLoading;
  }

  // Concatenate ordered video files into a single MP4 (stream copy when
  // possible, re-encode fallback). Runs entirely in the Worker; main thread
  // stays free.
  async function _mergeVideos(files, onProgress) {
    if (!files || files.length < 2) throw new Error('צריך לפחות 2 סרטונים');
    const ffmpeg = await _loadFfmpeg(onProgress);

    // Write inputs into ffmpeg FS
    const inputNames = [];
    for (let i = 0; i < files.length; i++) {
      if (onProgress) {
        onProgress('מעלה ל-ffmpeg ' + (i + 1) + '/' + files.length + ': ' +
                   files[i].name + ' (' + (files[i].size / 1024 / 1024).toFixed(1) + ' MB)…');
      }
      const ext = ((files[i].name.match(/\.[^.]+$/) || ['.mp4'])[0]).toLowerCase();
      const name = 'in_' + i + ext;
      const buf = new Uint8Array(await files[i].arrayBuffer());
      await ffmpeg.writeFile(name, buf);
      inputNames.push(name);
    }

    // concat list (ffmpeg concat demuxer format)
    const listText = inputNames.map(function(n){ return "file '" + n + "'"; }).join('\n');
    await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listText));

    // Track ffmpeg progress events
    let lastPct = 0;
    const onProg = function(e){
      if (e && typeof e.progress === 'number') {
        lastPct = Math.max(0, Math.min(100, e.progress * 100));
        if (onProgress) onProgress('ffmpeg מעבד: ' + lastPct.toFixed(0) + '%');
      }
    };
    ffmpeg.on('progress', onProg);

    let success = false;
    try {
      // Try stream copy first — fast, lossless, low CPU
      if (onProgress) onProgress('מנסה איחוד מהיר (stream copy, ללא re-encoding)…');
      try {
        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
          '-c', 'copy', '-movflags', '+faststart', 'output.mp4'
        ]);
        success = true;
      } catch (firstErr) {
        // Fall back to re-encoding (slower, but works for mismatched codecs)
        if (onProgress) onProgress('stream copy נכשל (קודקים לא תואמים) — מבצע re-encoding…');
        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart', 'output.mp4'
        ]);
        success = true;
      }
    } finally {
      try { ffmpeg.off('progress', onProg); } catch (_) {}
    }
    if (!success) throw new Error('ffmpeg concat failed');

    if (onProgress) onProgress('קורא קובץ פלט…');
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Cleanup ffmpeg FS
    for (const n of inputNames) { try { await ffmpeg.deleteFile(n); } catch (_) {} }
    try { await ffmpeg.deleteFile('concat_list.txt'); } catch (_) {}
    try { await ffmpeg.deleteFile('output.mp4'); } catch (_) {}

    return blob;
  }

  // Helper: extract every available shred of info from an error object
  function _explainErr(err) {
    if (!err) return '(שגיאה ריקה — נזרק null/undefined)';
    if (typeof err === 'string') return err;
    if (typeof err === 'number') return 'exit code ' + err;
    const bits = [];
    if (err.message && err.message !== 'undefined') bits.push(err.message);
    if (err.name && err.name !== 'Error' && err.name !== err.message) bits.push('[' + err.name + ']');
    if (err.code) bits.push('code=' + err.code);
    if (err.stack && bits.length === 0) bits.push(err.stack.split('\n')[0]);
    if (!bits.length) {
      try {
        const j = JSON.stringify(err);
        if (j && j !== '{}' && j !== '"undefined"' && j !== 'null') bits.push(j);
      } catch (_) {}
    }
    return bits.length ? bits.join(' · ') : '(אובייקט שגיאה ריק — בדוק Console לפרטים מלאים)';
  }

  async function _cutVideoClip(file, startSec, endSec, onProgress) {
    // Track every stage so on failure the error message names exactly where
    // the run died. ffmpeg.wasm sometimes throws shapes without a message,
    // so the stage name itself is the most reliable diagnostic.
    let stage = 'init';

    try {
      stage = '1/5 טעינת ffmpeg.wasm';
      if (onProgress) onProgress('שלב 1/5: טוען ffmpeg.wasm…');
      const ffmpeg = await _loadFfmpeg(onProgress);

      const ext = ((file.name.match(/\.[^.]+$/) || ['.mp4'])[0]).toLowerCase();
      const inputName = 'cut_input' + ext;
      const outputName = 'cut_output.mp4';

      stage = '2/5 העלאת הקובץ ל-ffmpeg FS';
      if (onProgress) onProgress('שלב 2/5: מעלה ל-ffmpeg ' + (file.size / 1024 / 1024).toFixed(1) + ' MB…');
      const buf = new Uint8Array(await file.arrayBuffer());
      await ffmpeg.writeFile(inputName, buf);

      const duration = endSec - startSec;
      const onProg = function(e) {
        if (e && typeof e.progress === 'number') {
          const pct = Math.max(0, Math.min(100, e.progress * 100));
          if (onProgress) onProgress('שלב 3/5: חותך · ' + pct.toFixed(0) + '%');
        }
      };
      ffmpeg.on('progress', onProg);

      function cleanup() {
        try { ffmpeg.off('progress', onProg); } catch (_) {}
        try { ffmpeg.deleteFile(inputName); } catch (_) {}
        try { ffmpeg.deleteFile(outputName); } catch (_) {}
      }

      try {
        stage = '3a/5 stream copy (חיתוך ללא re-encoding)';
        if (onProgress) onProgress('שלב 3/5: מבצע stream copy (העתקת בייטים, מהיר)…');
        let firstErrInfo = null;
        try {
          await ffmpeg.exec([
            '-ss', String(startSec),
            '-i', inputName,
            '-t', String(duration),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            '-movflags', '+faststart',
            outputName
          ]);
        } catch (firstErr) {
          firstErrInfo = firstErr;
          console.warn('[video cut] stream copy failed:', firstErr);
          stage = '3b/5 re-encoding ב-libx264 (אחרי כשל stream copy)';
          if (onProgress) onProgress('שלב 3/5: stream copy נכשל (' + _explainErr(firstErr) + ') · עובר ל-re-encoding…');
          try {
            await ffmpeg.exec([
              '-i', inputName,
              '-ss', String(startSec),
              '-t', String(duration),
              '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
              '-c:a', 'aac', '-b:a', '128k',
              '-movflags', '+faststart',
              outputName
            ]);
          } catch (secondErr) {
            console.error('[video cut] both stream copy AND re-encode failed', { firstErr, secondErr });
            throw new Error(
              'שני נסיונות החיתוך נכשלו. ' +
              'stream copy: ' + _explainErr(firstErrInfo) + ' · ' +
              're-encode: ' + _explainErr(secondErr)
            );
          }
        }

        stage = '4/5 קריאת קובץ הפלט מ-ffmpeg FS';
        if (onProgress) onProgress('שלב 4/5: קורא קובץ פלט…');
        let data;
        try {
          data = await ffmpeg.readFile(outputName);
        } catch (readErr) {
          throw new Error('ffmpeg רץ אבל לא יצר קובץ פלט: ' + _explainErr(readErr) +
            ' (נראה ש-ffmpeg החזיר exit code שאינו 0)');
        }
        if (!data || (data.byteLength === 0 && (!data.buffer || data.buffer.byteLength === 0))) {
          throw new Error('ffmpeg יצר קובץ ריק (0 בייטים). הסיבה הסבירה: codec של MP4 שלא נתמך, או הטווח שביקשת מחוץ לתחום הקובץ.');
        }

        stage = '5/5 בניית Blob';
        const blob = new Blob([data.buffer || data], { type: 'video/mp4' });
        cleanup();
        return {
          blob: blob,
          ext: '.mp4',
          mimeType: 'video/mp4',
          sizeMB: (blob.size / 1024 / 1024).toFixed(1)
        };
      } catch (e) {
        cleanup();
        throw e;
      }
    } catch (outerErr) {
      // Wrap every error with the stage name so the caller knows what failed
      console.error('[video cut v9] failed at stage:', stage, 'error:', outerErr);
      const explained = _explainErr(outerErr);
      const msg = 'נכשל ב' + stage + ': ' + explained;
      const wrapped = new Error(msg);
      wrapped.stage = stage;
      wrapped.original = outerErr;
      throw wrapped;
    }
  }

  // Legacy MediaRecorder-based cut (kept as reference, not used)
  async function _cutVideoClipLegacy(file, startSec, endSec, onProgress) {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('הדפדפן הזה לא תומך ב-MediaRecorder — נסה Chrome/Brave/Edge עדכניים');
    }
    var blobUrl = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.src = blobUrl;
    video.preload = 'auto';
    video.muted = false;
    video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
    document.body.appendChild(video);

    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var audioSource = audioCtx.createMediaElementSource(video);
    var audioDest = audioCtx.createMediaStreamDestination();
    audioSource.connect(audioDest);

    function cleanup() {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
      try { video.remove(); } catch (_) {}
      try { audioCtx.close(); } catch (_) {}
    }

    try {
      // Wait for metadata + data ready
      await new Promise(function(resolve, reject) {
        var settled = false;
        function done(err) {
          if (settled) return; settled = true;
          if (err) reject(err); else resolve();
        }
        video.oncanplay = function(){ done(); };
        video.onerror = function(){ done(new Error('הדפדפן לא הצליח לטעון את הקובץ הזה כוידאו')); };
        try { video.load(); } catch (e) { done(e); }
        setTimeout(function(){ done(new Error('זמן טעינה ארוך מדי')); }, 30000);
      });

      if (!isFinite(video.duration) || video.duration === 0) {
        throw new Error('הקובץ לא מכיל משך תקין');
      }
      if (endSec > video.duration + 0.5) {
        throw new Error('זמן סיום (' + endSec + ') חורג ממשך הקובץ (' + video.duration.toFixed(1) + ')');
      }

      // captureStream: prefer standard, fallback to mozCaptureStream
      var srcStream = (typeof video.captureStream === 'function')
        ? video.captureStream()
        : (typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream() : null);
      if (!srcStream) throw new Error('captureStream לא נתמך בדפדפן הזה');

      // Combine: video tracks from captureStream + audio track from Web Audio
      // (the captureStream's audio track is empty since createMediaElementSource
      // captured the element's audio exclusively into the Web Audio graph)
      var stream = new MediaStream(
        [].concat(srcStream.getVideoTracks(), audioDest.stream.getAudioTracks())
      );

      // Pick best supported MIME type (WebM/Opus is usually safest)
      var mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ];
      var mimeType = '';
      for (var mi = 0; mi < mimeCandidates.length; mi++) {
        if (MediaRecorder.isTypeSupported(mimeCandidates[mi])) { mimeType = mimeCandidates[mi]; break; }
      }
      if (!mimeType) throw new Error('אף mime type של MediaRecorder לא נתמך');

      var recorder = new MediaRecorder(stream, { mimeType: mimeType });
      var chunks = [];
      recorder.ondataavailable = function(e) { if (e.data && e.data.size > 0) chunks.push(e.data); };

      // Seek to start
      video.currentTime = startSec;
      await new Promise(function(r){ video.onseeked = r; });

      // Start recording, then play. Stop when we've passed endSec.
      var recPromise = new Promise(function(resolve, reject) {
        recorder.onstop = resolve;
        recorder.onerror = reject;
      });
      recorder.start(250);  // emit chunks every 250ms (more accurate stop)

      await video.play();

      var totalSec = endSec - startSec;
      await new Promise(function(resolve) {
        var t = setInterval(function() {
          var elapsed = video.currentTime - startSec;
          var pct = Math.min(100, Math.max(0, (elapsed / totalSec) * 100));
          if (onProgress) {
            var remaining = Math.max(0, totalSec - elapsed);
            onProgress('מקליט וידאו: ' + pct.toFixed(0) + '% · נשארו ~' + remaining.toFixed(0) + ' שנ׳');
          }
          if (video.currentTime >= endSec || video.ended) {
            clearInterval(t);
            try { video.pause(); } catch (_) {}
            try { recorder.stop(); } catch (_) {}
            resolve();
          }
        }, 200);
      });

      await recPromise;
      var ext = mimeType.indexOf('mp4') >= 0 ? '.mp4' : '.webm';
      var blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      cleanup();
      return { blob: blob, ext: ext, mimeType: mimeType, sizeMB: (blob.size / 1024 / 1024).toFixed(1) };
    } catch (e) {
      cleanup();
      throw e;
    }
  }

  // Filter Whisper chunks by user-selected time ranges and group into sections.
  // Returns array of { name, chunks } — each section becomes a heading in DOCX.
  // If no ranges → single full-transcript section.
  window.VT_FFMPEG = { _loadFfmpeg:_loadFfmpeg, _mergeVideos:_mergeVideos, _cutVideoClip:_cutVideoClip, _cutVideoClipLegacy:_cutVideoClipLegacy, _explainErr:_explainErr };
})();