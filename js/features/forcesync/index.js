/* כפתור "העלה הכל לענן" — מעלה כל מחברת בנפרד ל-Firestore ומדווח תוצאה.
 * עוקף את לוגיקת ה-diff (מאלץ העלאה מלאה), ומראה גלוי כמה הצליחו / נכשלו ולמה.
 * שימושי לאבחון וגם כפעולה ידנית אמינה ("הכל לענן").
 */
(function () {
  function bytes(o) { try { return new TextEncoder().encode(JSON.stringify(o)).length; } catch (e) { return 0; } }
  function stripImages(html) {
    return (html || '').replace(/src="data:image\/[^"]{20,}"/g,
      'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');
  }
  function sizeSafe(t) {
    if (bytes(t) <= 900 * 1024) return t;
    var s = Object.assign({}, t, { body: stripImages(t.body || ''), _imgStripped: true });
    if (bytes(s) <= 900 * 1024) return s;
    return Object.assign({}, s, { body: (s.body || '').slice(0, 60000) });
  }

  async function forceUpload(btn) {
    var orig = btn.textContent;
    try {
      var u = firebase.auth().currentUser;
      if (!u) { alert('לא מחובר לחשבון. התחבר קודם ואז נסה שוב.'); return; }
      var db = firebase.firestore();
      var topics = (window.Store && Store.get('topics')) || [];
      if (!topics.length) { alert('אין מחברות מקומיות.'); return; }
      btn.disabled = true; btn.textContent = '⬆️ מעלה… 0/' + topics.length;
      var ok = 0, fail = 0, fails = [];
      for (var i = 0; i < topics.length; i++) {
        var t = topics[i];
        try {
          await db.collection('users/' + u.uid + '/topics').doc(String(t.id)).set(sizeSafe(t));
          ok++;
        } catch (e) {
          fail++; fails.push((t.name || t.id) + ' → ' + (e && (e.code || e.message)));
        }
        btn.textContent = '⬆️ מעלה… ' + (i + 1) + '/' + topics.length;
      }
      btn.disabled = false; btn.textContent = orig;
      var msg = '✓ הועלו לענן: ' + ok + ' מתוך ' + topics.length;
      if (fail) msg += '\n\n✗ נכשלו: ' + fail + '\n' + fails.slice(0, 12).join('\n');
      else msg += '\n\nהכול בענן! רענן את הטלפון.';
      alert(msg);
    } catch (e) {
      btn.disabled = false; btn.textContent = orig;
      alert('שגיאה: ' + (e && e.message));
    }
  }

  function addBtn() {
    if (document.getElementById('forceSyncBtn')) return;
    var footer = document.querySelector('.sidebar-footer');
    if (!footer) { setTimeout(addBtn, 1000); return; }
    var b = document.createElement('button');
    b.id = 'forceSyncBtn';
    b.textContent = '⬆️ העלה הכל לענן';
    b.style.cssText = 'display:block;width:calc(100% - 24px);margin:8px 12px;padding:10px;' +
      'background:#2d8c4f;color:#fff;border:none;border-radius:10px;font-family:Heebo,sans-serif;' +
      'font-size:13px;font-weight:600;cursor:pointer';
    b.addEventListener('click', function () { forceUpload(b); });
    footer.after(b);
  }

  if (document.readyState === 'loading') window.addEventListener('load', function () { setTimeout(addBtn, 1500); });
  else setTimeout(addBtn, 1500);
})();
