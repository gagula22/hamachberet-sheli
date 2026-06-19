/* התאמת תמונות קיימות לסנכרון לענן.
 * דפים כבדי-תמונות שעוברים את גבול 1MB של Firestore אינם מסתנכרנים. מודול זה
 * רץ פעם אחת אחרי טעינה: כל דף שעובר 900KB — תמונותיו נדחסות בהדרגה עד שהדף
 * נכנס מתחת לגבול, ואז הוא נשמר ומסתנכרן לענן. חינמי, ללא Blaze. הדחיסה בכל
 * סבב מתבצעת מהמקור (לא מצטברת), כדי לא לאבד איכות מיותרת.
 */
(function () {
  var LIMIT = 900 * 1024;
  var PASSES = [[1600, 0.85], [1366, 0.80], [1100, 0.72], [900, 0.65], [760, 0.60]];

  function bytes(o) {
    try { return new TextEncoder().encode(JSON.stringify(o)).length; }
    catch (e) { try { return JSON.stringify(o).length; } catch (_) { return 0; } }
  }

  function reencode(dataUrl, maxW, q) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
          if (!nw || !nh) { res(dataUrl); return; }
          var w = Math.min(nw, maxW), scale = w / nw, h = Math.round(nh * scale);
          if (!w || !h) { res(dataUrl); return; }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          var out = c.toDataURL('image/webp', q);
          if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/jpeg', q);
          res(out.length < dataUrl.length ? out : dataUrl);
        } catch (e) { res(dataUrl); }
      };
      img.onerror = function () { res(dataUrl); };
      img.src = dataUrl;
    });
  }

  async function fitTopic(t) {
    if (!t || bytes(t) <= LIMIT) return null;
    var div = document.createElement('div');
    div.innerHTML = t.body || '';
    var imgs = Array.prototype.slice.call(div.querySelectorAll('img'));
    var originals = imgs.map(function (im) { return im.getAttribute('src') || ''; });
    var idx = [];
    for (var i = 0; i < imgs.length; i++) {
      if (originals[i].indexOf('data:image') === 0) idx.push(i);
    }
    if (!idx.length) return null;
    for (var p = 0; p < PASSES.length; p++) {
      for (var k = 0; k < idx.length; k++) {
        var i2 = idx[k];
        var ne = await reencode(originals[i2], PASSES[p][0], PASSES[p][1]);
        imgs[i2].setAttribute('src', ne);
      }
      var candidate = Object.assign({}, t, { body: div.innerHTML, updatedAt: Date.now() });
      if (bytes(candidate) <= LIMIT) return candidate;
    }
    return Object.assign({}, t, { body: div.innerHTML, updatedAt: Date.now() });
  }

  async function run() {
    try {
      if (!window.Store) return;
      if (Store.ready) { try { await Store.ready(); } catch (e) {} }
      var topics = Store.get('topics') || [];
      if (!topics.length) return;
      if (!topics.some(function (t) { return bytes(t) > LIMIT; })) return;
      if (window.App && App.toast) App.toast('מתאים תמונות גדולות לסנכרון לענן…');
      var next = topics.slice();
      var any = false;
      for (var i = 0; i < next.length; i++) {
        var fixed = await fitTopic(next[i]);
        if (fixed) { next[i] = fixed; any = true; }
      }
      if (any) {
        Store.set('topics', next);
        if (window.App && App.toast) App.toast('✓ התמונות הותאמו ויסונכרנו לענן');
      }
    } catch (e) { console.warn('imgfit failed', e); }
  }

  function boot() { setTimeout(run, 5000); }
  if (document.readyState === 'loading') window.addEventListener('load', boot);
  else boot();
})();
