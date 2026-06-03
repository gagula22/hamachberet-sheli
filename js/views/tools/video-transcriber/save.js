(function () {
  // VT file-save helpers. Extracted from index.js.
  async function _saveBlobViaPicker(blob, suggestedName, opts) {
    opts = opts || {};
    var description = opts.description || 'File';
    var ext = opts.extension || ((suggestedName.match(/\.[^.]+$/) || ['.bin'])[0]);
    var mime = opts.mimeType || blob.type || 'application/octet-stream';
    if (window.showSaveFilePicker) {
      try {
        var accept = {}; accept[mime] = [ext];
        var handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{ description: description, accept: accept }]
        });
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { method: 'picker', name: handle.name };
      } catch (err) {
        if (err && err.name === 'AbortError') return { method: 'cancelled' };
      }
    }
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = blobUrl; a.download = suggestedName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 3000);
    return { method: 'download', name: suggestedName };
  }
  function _saveDocViaPicker(blob, suggestedName) {
    return _saveBlobViaPicker(blob, suggestedName, {
      description: 'Word Document', extension: '.doc', mimeType: 'application/msword'
    });
  }
  function _saveWavViaPicker(blob, suggestedName) {
    return _saveBlobViaPicker(blob, suggestedName, {
      description: 'WAV audio', extension: '.wav', mimeType: 'audio/wav'
    });
  }
  function _saveMp3ViaPicker(blob, suggestedName) {
    return _saveBlobViaPicker(blob, suggestedName, {
      description: 'MP3 audio', extension: '.mp3', mimeType: 'audio/mpeg'
    });
  }
  function _saveVideoViaPicker(blob, suggestedName, ext) {
    ext = ext || '.webm';
    var mime = ext === '.mp4' ? 'video/mp4' : 'video/webm';
    return _saveBlobViaPicker(blob, suggestedName, {
      description: ext === '.mp4' ? 'MP4 video' : 'WebM video',
      extension: ext, mimeType: mime
    });
  }

  // ── Video cut: re-record a time range from a video file via MediaRecorder
  // Plays the video at 1x in real time, captures the stream (video + audio),
  // and writes a WebM (or MP4 where the browser supports it) for the slice.
  // Real-time bound: a 5-min slice takes 5 minutes of wall clock to record.
  // ── ffmpeg.wasm loader (lazy: only loads when first used) ────────────────
  // Files are SELF-HOSTED in /vendor/ffmpeg/ — same origin as the page,
  // which avoids the entire null-origin / blob URL / cross-origin Worker
  // mess that broke earlier attempts (importScripts inside a blob-URL Worker
  // can't reach cross-origin scripts on most browsers).
  window.VT_SAVE = { _saveBlobViaPicker:_saveBlobViaPicker, _saveDocViaPicker:_saveDocViaPicker, _saveWavViaPicker:_saveWavViaPicker, _saveMp3ViaPicker:_saveMp3ViaPicker, _saveVideoViaPicker:_saveVideoViaPicker };
})();