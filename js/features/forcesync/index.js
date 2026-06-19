/* כפתור "בדוק+העלה לענן" — בדיקת שרת אמיתית (source:'server', עוקף מטמון).
 * קורא כמה מחברות באמת יש בשרת לפני ואחרי ההעלאה, ומדווח מספרים אמיתיים +
 * כשלים עם קוד שגיאה. כך יודעים בוודאות אם המידע באמת בענן (לא ניחוש).
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

  async function serverCount(col) {
    var s = await col.get({ source: 'server' });   // forces a real SERVER read (no cache)
    return s.size;
  }

  async function run(btn) {
    var orig = btn.textContent;
    try {
      var u = firebase.auth().currentUser;
      if (!u) { alert('לא מחובר. התחבר קודם.'); return; }
      var db = firebase.firestore();
      var col = db.collection('users/' + u.uid + '/topics');
      var local = (window.Store && Store.get('topics')) || [];

      btn.disabled = true; btn.textContent = '🔎 בודק שרת…';
      var before;
      try { before = await serverCount(col); }
      catch (e) {
        alert('❌ קריאה מהשרת נכשלה: ' + (e && (e.code || e.message)) +
          '\n\nכלומר החיבור לענן עדיין חסום (Brave Shields / חוסם / רשת).');
        return;
      }

      var ok = 0, fail = 0, fails = [];
      for (var i = 0; i < local.length; i++) {
        var t = local[i];
        try { await col.doc(String(t.id)).set(sizeSafe(t)); ok++; }
        catch (e) { fail++; fails.push((t.name || t.id) + ': ' + (e && (e.code || e.message))); }
        btn.textContent = '⬆️ מעלה… ' + (i + 1) + '/' + local.length;
      }

      btn.textContent = '🔎 מאמת שרת…';
      var after;
      try { after = await serverCount(col); } catch (e) { after = '?'; }

      btn.disabled = false; btn.textContent = orig;
      var msg = '== בדיקת שרת אמיתית ==\n' +
        'מקומי: ' + local.length + '\n' +
        'בענן לפני: ' + before + '\n' +
        'בענן אחרי: ' + after + '\n' +
        'נכתבו: ' + ok + ' | נכשלו: ' + fail;
      if (fail) msg += '\n' + fails.slice(0, 8).join('\n');
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
    b.textContent = '🔎 בדוק והעלה לענן';
    b.style.cssText = 'display:block;width:calc(100% - 24px);margin:8px 12px;padding:10px;' +
      'background:#2d8c4f;color:#fff;border:none;border-radius:10px;font-family:Heebo,sans-serif;' +
      'font-size:13px;font-weight:600;cursor:pointer';
    b.addEventListener('click', function () { run(b); });
    footer.after(b);
  }

  if (document.readyState === 'loading') window.addEventListener('load', function () { setTimeout(addBtn, 1500); });
  else setTimeout(addBtn, 1500);
})();
