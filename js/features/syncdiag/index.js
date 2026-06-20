/* כפתור "🔬 אבחון ענן" — קריאה-בלבד. מציג על המסך את המספרים האמיתיים של מצב
 * הסנכרון (Store מול שרת מול מטמון, שורשים/יתומים/נגישים-בעץ, גרסת קוד, תחבורה),
 * כדי לאבחן בעיות סנכרון בטלפון בלי קונסול. אחריות עצמאית, לא כותב כלום בענן.
 */
(function () {
  // כמה נושאים נגישים מהשורש בעץ (יתום שה-parentId שלו חסר — לא ייספר/לא יוצג).
  function reachableCount(S) {
    var byParent = {};
    S.forEach(function (t) { var p = t.parentId || null; (byParent[p] = byParent[p] || []).push(t); });
    var seen = {}, stack = (byParent[null] || []).slice();
    while (stack.length) {
      var t = stack.pop();
      if (!t || seen[t.id]) continue;
      seen[t.id] = 1;
      (byParent[t.id] || []).forEach(function (c) { stack.push(c); });
    }
    return Object.keys(seen).length;
  }

  async function run(btn) {
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = '🔬 בודק…';
    try {
      var S = (window.Store && Store.get('topics')) || [];
      var ids = {};
      S.forEach(function (t) { if (t && t.id != null) ids[String(t.id)] = 1; });
      var roots   = S.filter(function (t) { return !t.parentId; }).length;
      var orphans = S.filter(function (t) { return t.parentId && !ids[String(t.parentId)]; }).length;
      var reach   = reachableCount(S);

      var ver = '?';
      try {
        var sc = document.querySelector('script[src*="firebase-sync.js"]');
        if (sc) ver = (sc.getAttribute('src').match(/v=(\d+)/) || [])[1] || '?';
      } catch (e) {}
      var lp = 'off';
      try { lp = localStorage.getItem('mahberet.forceLP') === '1' ? 'ON' : 'off'; } catch (e) {}
      var sw = (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'yes' : 'no';

      var srv = '?', cache = '-';
      try {
        var u = firebase.auth().currentUser;
        var col = firebase.firestore().collection('users/' + u.uid + '/topics');
        try { srv = (await col.get({ source: 'server' })).size; }
        catch (e) { srv = 'ERR ' + (e && (e.code || e.message)); }
        try { cache = (await col.get({ source: 'cache' })).size; } catch (e) { cache = '-'; }
      } catch (e) { srv = 'לא מחובר'; }

      btn.disabled = false; btn.textContent = orig;
      alert('🔬 אבחון ענן\n' +
        '— תצוגה —\n' +
        'Store: ' + S.length + '  |  שורשים: ' + roots + '  |  יתומים: ' + orphans + '  |  נגישים בעץ: ' + reach + '\n\n' +
        '— ענן —\n' +
        'שרת (get): ' + srv + '  |  מטמון: ' + cache + '\n\n' +
        '— מערכת —\n' +
        'גרסת sync: v' + ver + '  |  SW פעיל: ' + sw + '  |  long-polling: ' + lp);
    } catch (e) {
      btn.disabled = false; btn.textContent = orig;
      alert('שגיאה באבחון: ' + (e && e.message));
    }
  }

  function addBtn() {
    if (document.getElementById('syncDiagBtn')) return;
    var footer = document.querySelector('.sidebar-footer');
    if (!footer) { setTimeout(addBtn, 1000); return; }
    var b = document.createElement('button');
    b.id = 'syncDiagBtn';
    b.textContent = '🔬 אבחון ענן';
    b.style.cssText = 'display:block;width:calc(100% - 24px);margin:8px 12px;padding:10px;' +
      'background:#6b46c1;color:#fff;border:none;border-radius:10px;font-family:Heebo,sans-serif;' +
      'font-size:13px;font-weight:600;cursor:pointer';
    b.addEventListener('click', function () { run(b); });
    footer.after(b);
  }

  if (document.readyState === 'loading') window.addEventListener('load', function () { setTimeout(addBtn, 1600); });
  else setTimeout(addBtn, 1600);
})();
