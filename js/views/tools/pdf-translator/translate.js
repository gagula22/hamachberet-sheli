(function () {
  // Translation engine (EN->HE) for the PDF translator tool. Pure, no shared state.
  // ── Translation helpers ──────────────────────────────────────────────────
  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Split text into chunks ≤ MAX chars, breaking at sentence/word boundaries
  function _splitChunks(text, MAX) {
    MAX = MAX || 420;
    if (!text || !text.trim()) return [];
    if (text.length <= MAX) return [text.trim()];
    const parts = [];
    let pos = 0;
    while (pos < text.length) {
      let end = pos + MAX;
      if (end >= text.length) { parts.push(text.slice(pos).trim()); break; }
      let cut = -1;
      for (let i = end; i > end - 120 && i > pos; i--) {
        if ('.!?\n'.indexOf(text[i]) >= 0) { cut = i + 1; break; }
      }
      if (cut === -1) {
        for (let i = end; i > end - 60 && i > pos; i--) {
          if (text[i] === ' ') { cut = i; break; }
        }
      }
      if (cut === -1) cut = end;
      const chunk = text.slice(pos, cut).trim();
      if (chunk) parts.push(chunk);
      pos = cut;
    }
    return parts;
  }

  // Yield to browser event loop — keeps UI responsive between heavy ops
  function _yield() {
    return new Promise(function(r) { setTimeout(r, 0); });
  }

  // Translate one chunk via MyMemory API (server-side, zero CPU/RAM in browser)
  async function _apiTranslateChunk(text, retries) {
    retries = retries || 0;
    const url = 'https://api.mymemory.translated.net/get?q='
      + encodeURIComponent(text)
      + '&langpair=en%7Che';
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      // responseStatus 200 = success, 429 = rate limit
      if (data.responseStatus === 200) {
        const t = (data.responseData && data.responseData.translatedText) || '';
        // MyMemory echoes back QUERY LIMIT errors as translated text
        if (t.startsWith('QUERY LIMIT') || t.startsWith('MYMEMORY')) return text;
        return t;
      }
      if (data.responseStatus === 429 && retries < 2) {
        await new Promise(function(r) { setTimeout(r, 2000); });
        return _apiTranslateChunk(text, retries + 1);
      }
      return text; // fall back to original on persistent error
    } catch (e) {
      if (retries < 1) {
        await new Promise(function(r) { setTimeout(r, 1500); });
        return _apiTranslateChunk(text, retries + 1);
      }
      return text;
    }
  }

  // Translate a full page's text — splits into chunks, calls API sequentially
  async function _translatePageText(text, cancelCheck) {
    if (!text || !text.trim()) return '';
    const chunks = _splitChunks(text, 420);
    if (!chunks.length) return '';
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      if (cancelCheck && cancelCheck()) throw new Error('CANCELLED');
      const translated = await _apiTranslateChunk(chunks[i]);
      results.push(translated);
      // 180ms pause between chunk requests — keeps rate limits comfortable
      if (i < chunks.length - 1) {
        await new Promise(function(r) { setTimeout(r, 180); });
      }
    }
    return results.join(' ');
  }
  window.PTR_ENGINE = {
    _esc: _esc, _splitChunks: _splitChunks, _yield: _yield,
    _apiTranslateChunk: _apiTranslateChunk, _translatePageText: _translatePageText
  };
})();