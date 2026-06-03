(function () {
  // VT floating toast UI (owns _vtToast state). Extracted from index.js.
  var _esc = window.VT_UTILS._esc, _saveDocViaPicker = window.VT_SAVE._saveDocViaPicker;
  var _vtToast   = null;
  function _getVtToast() {
    if (_vtToast && document.body.contains(_vtToast)) return _vtToast;
    _vtToast = document.createElement('div');
    _vtToast.style.cssText = [
      'position:fixed;bottom:24px;right:24px;z-index:99997;',
      'min-width:300px;max-width:360px;',
      'background:#fff;border-radius:18px;',
      'box-shadow:0 8px 36px rgba(0,0,0,.20);',
      'border:1px solid #e4e4e4;overflow:hidden;',
      'direction:rtl;font-family:inherit;display:none;'
    ].join('');
    document.body.appendChild(_vtToast);
    return _vtToast;
  }
  function _vtToastHtml(html) { _getVtToast().innerHTML = html; _vtToast.style.display = 'block'; }

  function _vtShowProgress(pct, text) {
    _vtToastHtml(`
      <div style="background:linear-gradient(135deg,#5ba3d0,#2d6f9c);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">🎙</span>
        <strong style="font-size:13px;">תמלול וידאו — רץ ברקע</strong>
      </div>
      <div style="padding:13px 16px;">
        <div style="font-size:12px;color:#555;margin-bottom:9px;line-height:1.5;">${text}</div>
        <div style="background:#e8e8e8;border-radius:3px;height:5px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,#cfe4f7,#5ba3d0);height:5px;width:${pct}%;transition:width 400ms ease;"></div>
        </div>
      </div>`);
  }

  // Show the done-toast. Accepts either (dlName, blob) or (dlName, blobUrl) for
  // backward compat — if blobOrUrl is a Blob, the save button uses the File
  // System Access API picker (so the user picks where to save).
  function _vtShowDone(dlName, blobOrUrl) {
    var pickerSupported = typeof window.showSaveFilePicker === 'function';
    var btnLabel = pickerSupported ? '💾 שמור בתיקייה שלי…' : '⬇ הורד קובץ Word';
    _vtToastHtml(`
      <div style="background:linear-gradient(135deg,#5ba3d0,#2d6f9c);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✅</span>
        <strong style="font-size:13px;">התמלול הושלם!</strong>
      </div>
      <div style="padding:14px 16px;">
        <div style="font-size:12px;color:#666;margin-bottom:12px;">${_esc(dlName)}</div>
        <button id="vt-dl-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#cfe4f7,#5ba3d0);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;margin-bottom:8px;">${btnLabel}</button>
        <button id="vt-close-btn" style="width:100%;padding:7px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;cursor:pointer;color:#888;">סגור</button>
      </div>`);
    _vtToast.querySelector('#vt-dl-btn').onclick = async function() {
      var blob = (blobOrUrl instanceof Blob) ? blobOrUrl : null;
      if (blob) {
        var res = await _saveDocViaPicker(blob, dlName);
        if (res.method === 'cancelled') return;       // user changed their mind, keep toast open
        _vtToast.style.display = 'none';
      } else {
        // Legacy URL path
        var a = document.createElement('a'); a.href = blobOrUrl; a.download = dlName; a.click();
        setTimeout(function() { try { URL.revokeObjectURL(blobOrUrl); } catch(_){} _vtToast.style.display = 'none'; }, 3000);
      }
    };
    _vtToast.querySelector('#vt-close-btn').onclick = function() { _vtToast.style.display = 'none'; };
  }

  function _vtShowError(msg) {
    _vtToastHtml(`
      <div style="background:#c33;padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">❌</span><strong style="font-size:13px;">שגיאה בתמלול</strong>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:#555;line-height:1.6;">${_esc(msg)}
        <br><button id="vt-close-err" style="margin-top:8px;padding:5px 14px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;cursor:pointer;">סגור</button>
      </div>`);
    _vtToast.querySelector('#vt-close-err').onclick = function() { _vtToast.style.display = 'none'; };
  }

  // ── Tool 4: תמלול וידאו בעברית ───────────────────────────────────────────
  window.VT_TOAST = { _getVtToast:_getVtToast, _vtToastHtml:_vtToastHtml, _vtShowProgress:_vtShowProgress, _vtShowDone:_vtShowDone, _vtShowError:_vtShowError };
})();