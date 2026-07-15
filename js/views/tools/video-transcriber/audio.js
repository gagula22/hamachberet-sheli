(function () {
  // VT audio decode/PCM. Extracted from index.js.
  // Memory-lean decode: for MONO sources the returned pcm is a *view* onto the
  // AudioBuffer's channel data (no full-PCM copy) — peak RAM for a 3-hour file
  // drops from ~1.5GB to ~690MB (the AudioBuffer alone). The AudioBuffer is
  // kept alive via `_buf` on the result so the view stays valid. Stereo still
  // downmixes (a copy is unavoidable there).
  // ⚠️ A view's .buffer belongs to the AudioBuffer — callers that TRANSFER the
  // buffer to a Web Worker (local Whisper) must copy first when `_buf` is set;
  // slicing (`_slicePcmSec`/`.slice`) already copies, so the cloud path is safe.
  async function _decodeAnyFileToPcm(file, onProgress) {
    const ab = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    try {
      const decoded = await audioCtx.decodeAudioData(ab);
      const ch = decoded.numberOfChannels;
      let pcm;
      if (ch > 1) {
        const c0 = decoded.getChannelData(0);
        const c1 = decoded.getChannelData(1);
        pcm = new Float32Array(c0.length);
        for (let i = 0; i < c0.length; i++) pcm[i] = (c0[i] + c1[i]) * 0.5;
      } else {
        pcm = decoded.getChannelData(0);   // VIEW — zero copy (see note above)
      }
      audioCtx.close();
      return { pcm: pcm, sampleRate: 16000, durationSec: pcm.length / 16000, _buf: ch > 1 ? null : decoded };
    } catch (decodeErr) {
      try { audioCtx.close(); } catch (_) {}
      // Fallback for video / unusual containers
      if (onProgress) onProgress('פענוח ישיר נכשל — עובר ל-HTMLVideoElement (איטי יותר אבל עובד על MP4 וידאו)…');
      return _decodeViaVideoElement(file, onProgress);
    }
  }

  // Fallback decoder via real-time playback. Used for MP4/WebM/MOV that
  // decodeAudioData rejects. Plays the file at max playbackRate (16x in
  // most browsers) routed through a Web Audio graph that captures samples
  // into a Float32 buffer. Audio is silenced via GainNode(0).
  async function _decodeViaVideoElement(file, onProgress) {
    const blobUrl = URL.createObjectURL(file);
    const media = document.createElement('video');
    media.src = blobUrl;
    media.preload = 'auto';
    media.crossOrigin = 'anonymous';

    // Wait for the file to be ready to play
    await new Promise(function(resolve, reject) {
      let settled = false;
      function done(err) {
        if (settled) return;
        settled = true;
        if (err) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} reject(err); }
        else resolve();
      }
      media.oncanplaythrough = function(){ done(); };
      media.onerror = function(){ done(new Error('הדפדפן לא הצליח לטעון את הקובץ (codec לא נתמך, או פגום)')); };
      try { media.load(); } catch (e) { done(e); }
      setTimeout(function(){ done(new Error('זמן טעינה ארוך מדי — נסה קובץ אחר')); }, 45000);
    });

    const duration = media.duration;
    if (!isFinite(duration) || duration === 0) {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
      throw new Error('הקובץ לא מכיל אודיו תקין (משך לא ידוע)');
    }

    const sampleRate = 16000;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sampleRate });
    const source = audioCtx.createMediaElementSource(media);
    const gain = audioCtx.createGain();
    gain.gain.value = 0; // silent, but ScriptProcessor still fires
    const bufSize = 16384;
    const processor = audioCtx.createScriptProcessor(bufSize, 1, 1);

    const chunks = [];
    let totalSamples = 0;
    processor.onaudioprocess = function(ev) {
      const inBuf = ev.inputBuffer;
      const ch = inBuf.numberOfChannels;
      let mono;
      if (ch > 1) {
        const c0 = inBuf.getChannelData(0);
        const c1 = inBuf.getChannelData(1);
        mono = new Float32Array(c0.length);
        for (let i = 0; i < c0.length; i++) mono[i] = (c0[i] + c1[i]) * 0.5;
      } else {
        mono = new Float32Array(inBuf.getChannelData(0));
      }
      chunks.push(mono);
      totalSamples += mono.length;
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioCtx.destination);

    try { media.playbackRate = 16; } catch (_) {}
    await media.play();

    // Progress reporter while playing back
    let progressTimer = null;
    if (onProgress) {
      progressTimer = setInterval(function(){
        const pct = duration ? (media.currentTime / duration) * 100 : 0;
        const remainingWall = (duration - media.currentTime) / (media.playbackRate || 1);
        onProgress('פורק וידאו: ' + pct.toFixed(0) + '% · נשארו ~' + Math.max(0, Math.round(remainingWall)) + ' שנ׳');
      }, 1000);
    }

    await new Promise(function(resolve){ media.onended = resolve; });

    if (progressTimer) clearInterval(progressTimer);
    try { processor.disconnect(); source.disconnect(); gain.disconnect(); } catch (_) {}
    try { await audioCtx.close(); } catch (_) {}
    try { URL.revokeObjectURL(blobUrl); } catch (_) {}

    if (totalSamples === 0) {
      throw new Error('לא נקלטו דגימות אודיו — ייתכן שלקובץ אין פסקול');
    }
    const pcm = new Float32Array(totalSamples);
    let off = 0;
    for (let i = 0; i < chunks.length; i++) {
      pcm.set(chunks[i], off);
      off += chunks[i].length;
    }
    return { pcm: pcm, sampleRate: sampleRate, durationSec: pcm.length / sampleRate };
  }

  // ── MP3 byte-slice path (no full decode required) ───────────────────────
  // For long CBR MP3 files (e.g. 256kbps × 45 min = 82MB), Chrome's
  // decodeAudioData often fails — and the HTMLVideoElement fallback is too
  // slow / can truncate. Byte-slicing reads the original bytes, finds frame
  // boundaries, and produces valid MP3 sub-files for any time range.

  function _slicePcmSec(pcm, startSec, endSec, sampleRate) {
    const start = Math.max(0, Math.floor((startSec || 0) * sampleRate));
    const end   = Math.min(pcm.length, Math.floor((endSec || (pcm.length / sampleRate)) * sampleRate));
    return pcm.slice(start, end);
  }

  function _pcmToWavBytes(pcm, sampleRate) {
    const n = pcm.length;
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    function writeStr(o, s) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, n * 2, true);
    let offset = 44;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return buffer;
  }

  // Chunked Whisper-via-Worker. ~1.5-min PCM pieces → ~2.9MB WAV each → safe
  // for low-RAM machines where the browser silently aborts fetch under
  // memory pressure.
  window.VT_AUDIO = { _decodeAnyFileToPcm:_decodeAnyFileToPcm, _decodeViaVideoElement:_decodeViaVideoElement, _slicePcmSec:_slicePcmSec, _pcmToWavBytes:_pcmToWavBytes };
})();