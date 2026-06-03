(function () {
  // VT utils (pure helpers). Extracted from index.js.
  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  // ══════════════════════════════════════════════════════════════════════════
  //  HEBREW VIDEO / AUDIO TRANSCRIBER
  //  Browser mode  : Whisper-small (Transformers.js) → Word doc, no freeze
  //  Full quality  : generates Python command for Claude Code / terminal
  // ══════════════════════════════════════════════════════════════════════════

  function _parseTimeInput(str) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if (/^(\d+:)?\d+:\d+(\.\d+)?$/.test(s)) {
      var p = s.split(':').map(parseFloat);
      if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
      if (p.length === 2) return p[0] * 60 + p[1];
    }
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (m && (m[1] || m[2] || m[3])) {
      return (parseInt(m[1] || 0, 10)) * 3600 +
             (parseInt(m[2] || 0, 10)) * 60 +
             (parseInt(m[3] || 0, 10));
    }
    return NaN; // signal "couldn't parse" (vs null = empty)
  }

  function _formatHMS(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(h) + ':' + p(m) + ':' + p(s);
  }

  function _extractYouTubeId(url) {
    if (!url) return null;
    var m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^&?/#]+)/);
    return m ? m[1] : null;
  }

  // Trim a 16kHz Float32 PCM buffer to [startSec, endSec]. null = open.
  function _trimAudio(audio, startSec, endSec) {
    var sr = 16000;
    if ((startSec == null || startSec <= 0) && endSec == null) return audio;
    var s = startSec ? Math.max(0, Math.floor(startSec * sr)) : 0;
    var e = endSec   ? Math.min(audio.length, Math.floor(endSec * sr)) : audio.length;
    if (e <= s) throw new Error('טווח זמן לא חוקי — סיום לפני התחלה');
    return audio.slice(s, e);
  }

  // Build interleaved <p> blocks: "⏱ HH:MM:SS - תצלם את המסך" + body.
  // Groups consecutive Whisper chunks into ~30s paragraphs.
  function _buildTimestampedHtml(chunks, offsetSec, vidId, fallbackText) {
    offsetSec = offsetSec || 0;
    if (!chunks || !chunks.length) {
      // No timestamps available → fall back to plain paragraphs
      return (fallbackText || '').trim().split(/\n+/).map(function(p) {
        var t = p.trim();
        return t ? '<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 10px;unicode-bidi:plaintext;">' + _esc(t) + '</p>' : '';
      }).join('');
    }
    var GROUP_DUR = 30;
    var groups = [];
    var cur = null;
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      var ts = (c.timestamp && c.timestamp[0] != null) ? c.timestamp[0] : 0;
      if (!cur) { cur = { startSec: ts, texts: [c.text] }; }
      else if (ts - cur.startSec < GROUP_DUR) { cur.texts.push(c.text); }
      else { groups.push(cur); cur = { startSec: ts, texts: [c.text] }; }
    }
    if (cur) groups.push(cur);

    return groups.map(function(g) {
      var abs = g.startSec + offsetSec;
      var hms = _formatHMS(abs);
      var stamp;
      if (vidId) {
        stamp = '<a href="https://www.youtube.com/watch?v=' + _esc(vidId) +
                '&t=' + Math.floor(abs) + 's" ' +
                'style="color:#2d6f9c;text-decoration:none;font-weight:600;">' +
                '⏱ ' + hms + ' - תצלם את המסך</a>';
      } else {
        stamp = '<span style="color:#888;font-weight:600;">⏱ ' + hms + ' - תצלם את המסך</span>';
      }
      var body = _esc(g.texts.join('').trim());
      return '<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 14px;unicode-bidi:plaintext;">' +
             stamp + '<br>' + body + '</p>';
    }).join('');
  }

  // ── Cloud transcription via user-deployed Cloudflare Worker ──────────────
  // POSTs the raw audio file to the Worker, which calls Workers AI Whisper
  // (whisper-large-v3-turbo) on Cloudflare's GPUs and returns transcript JSON.
  // Returns the same { text, chunks } shape the local Whisper Worker produces.
  function _arrayBufferToBase64(buf) {
    const u8 = new Uint8Array(buf);
    const chunkSize = 0x8000;
    const parts = [];
    for (let i = 0; i < u8.length; i += chunkSize) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize)));
    }
    return btoa(parts.join(''));
  }

  // POST a YouTube URL to the Worker /youtube endpoint — Worker fetches the
  // audio from YouTube directly (zero load on user's machine) and runs Whisper.
  function _filterChunksByRanges(chunks, ranges) {
    if (!ranges || !ranges.length) {
      return [{ name: null, chunks: chunks }];
    }
    return ranges.map(function(r){
      var s = r[0], e = r[1];
      var label = _formatHMS(s).replace(/^00:/, '') + '–' + _formatHMS(e).replace(/^00:/, '');
      var inRange = (chunks || []).filter(function(c){
        var cs = c.timestamp[0], ce = c.timestamp[1] != null ? c.timestamp[1] : cs;
        return ce >= s && cs <= e;
      });
      return { name: label, chunks: inRange };
    });
  }

  // Build a multi-section DOCX HTML body. Each section gets an H2 + paragraphs.
  function _buildMultiSectionDocHtml(baseName, sourceLine, sections) {
    var dateStr = new Date().toLocaleDateString('he-IL');
    var parts = [
      "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
      " xmlns:w='urn:schemas-microsoft-com:office:word'",
      " xmlns='http://www.w3.org/TR/REC-html40'>",
      "<head><meta charset='utf-8'><title>" + _esc(baseName) + "</title>",
      "<style>body{font-family:Arial,sans-serif;padding:36px;max-width:820px;direction:rtl;}",
      "p{unicode-bidi:plaintext;}h2{color:#2d6f9c;}</style></head>",
      "<body dir='rtl'>",
      "<h1 style='font-size:22px;margin-bottom:4px;direction:rtl;text-align:right;'>" + _esc(baseName) + "</h1>",
      "<p style='font-size:11px;color:#999;margin:0 0 28px;direction:ltr;text-align:left;'>" + _esc(sourceLine) + " · " + dateStr + "</p>",
      "<hr style='border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;'>"
    ];
    sections.forEach(function(sec){
      if (sec.name) {
        parts.push("<h2 style='font-size:18px;margin:24px 0 10px;direction:rtl;text-align:right;'>⏱ " + _esc(sec.name) + "</h2>");
      }
      parts.push(_buildTimestampedHtml(sec.chunks, 0, null, null));
    });
    parts.push("</body></html>");
    return parts.join('');
  }

  // Floating toast for transcription (separate from translation toast)
  window.VT_UTILS = { _esc:_esc, _parseTimeInput:_parseTimeInput, _formatHMS:_formatHMS, _extractYouTubeId:_extractYouTubeId, _trimAudio:_trimAudio, _buildTimestampedHtml:_buildTimestampedHtml, _arrayBufferToBase64:_arrayBufferToBase64, _filterChunksByRanges:_filterChunksByRanges, _buildMultiSectionDocHtml:_buildMultiSectionDocHtml };
})();