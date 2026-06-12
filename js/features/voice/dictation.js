(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // הכתבה קולית לעורך המחברת — אחריות עצמאית, אפס עריכה בקבצי המחברת.
  // MutationObserver מאתר את סרגל הכלים (.nb-ribbon) בכל פעם שהוא נבנה
  // (הוא נבנה מחדש בכל פתיחת נושא) ומזריק קבוצת כפתור 🎤 בעיצוב הסרגל
  // הקיים. אם מבנה הסרגל ישתנה — הפיצ׳ר פשוט לא יופיע, בלי לשבור כלום.
  // זיהוי דיבור: Web Speech API (he-IL). טקסט סופי נכנס דרך
  // document.execCommand('insertText') ולכן השמירה האוטומטית וה-undo של
  // העורך עובדים בחינם. טקסט ביניים מוצג בבועה צפה בלבד.
  // ─────────────────────────────────────────────────────────────────────────

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  let _rec = null;          // מופע זיהוי פעיל
  let _btn = null;          // הכפתור המוזרק הנוכחי
  let _pill = null;         // בועת טקסט-ביניים

  function editorEl() { return document.querySelector('.nb-editor'); }

  function showPill(text) {
    if (!_pill) {
      _pill = document.createElement('div');
      _pill.className = 'voice-pill';
      document.body.appendChild(_pill);
    }
    _pill.textContent = '🎤 ' + (text || 'מקשיב…');
    _pill.style.display = 'block';
  }
  function hidePill() { if (_pill) _pill.style.display = 'none'; }

  function insertFinal(text) {
    const ed = editorEl();
    if (!ed || !text) return;
    // ודא שהסמן בתוך העורך (אם המשתמש יצא ממנו — נכניס בסוף)
    const sel = window.getSelection();
    const inside = sel && sel.anchorNode && ed.contains(sel.anchorNode);
    if (!inside) {
      ed.focus();
      const range = document.createRange();
      range.selectNodeContents(ed);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('insertText', false, text + ' ');
  }

  function stop() {
    if (_rec) { try { _rec.stop(); } catch (e) {} _rec = null; }
    if (_btn) _btn.classList.remove('voice-recording');
    hidePill();
  }

  function start() {
    if (!SR) { App.toast('הדפדפן לא תומך בהקלדה קולית — נסה Chrome או Edge'); return; }
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) insertFinal(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      if (interim) showPill(interim);
      else showPill('');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        App.toast('אין הרשאת מיקרופון — אפשר גישה בהגדרות הדפדפן');
      } else if (e.error === 'network') {
        App.toast('זיהוי הדיבור דורש חיבור לאינטרנט');
      }
      stop();
    };
    rec.onend = () => { if (_rec === rec) stop(); };

    try {
      rec.start();
      _rec = rec;
      if (_btn) _btn.classList.add('voice-recording');
      showPill('');
      App.toast('🎤 מדבר? אני כותב…');
    } catch (e) {
      App.toast('לא הצלחתי להפעיל את המיקרופון');
      stop();
    }
  }

  function toggle() { if (_rec) stop(); else start(); }

  // ── הזרקה לסרגל ──────────────────────────────────────────────────────────
  function inject(ribbon) {
    if (!ribbon || ribbon.dataset.voice) return;
    ribbon.dataset.voice = '1';
    const rows = ribbon.querySelectorAll('.nb-ribbon-row');
    const row = rows[rows.length - 1] || ribbon;
    const group = document.createElement('div');
    group.className = 'nb-tb-group';
    _btn = document.createElement('button');
    _btn.className = 'nb-tb-btn voice-dict-btn';
    _btn.title = 'הכתבה קולית (עברית)';
    _btn.setAttribute('aria-label', 'הכתבה קולית');
    _btn.textContent = '🎤';
    _btn.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
    group.appendChild(_btn);
    row.appendChild(group);
  }

  function scan() {
    const ribbon = document.querySelector('.nb-ribbon:not([data-voice])');
    if (ribbon) inject(ribbon);
  }

  const view = document.getElementById('view');
  if (view && window.MutationObserver) {
    new MutationObserver(scan).observe(view, { childList: true, subtree: true });
  }
  scan();

  // מעבר מסך עוצר הקלטה פעילה
  window.addEventListener('hashchange', stop);

  window.VoiceDictation = { start: start, stop: stop, toggle: toggle, supported: !!SR };
})();
