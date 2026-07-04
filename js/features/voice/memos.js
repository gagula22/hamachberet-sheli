(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // הערות קול — view עצמאי (אחריות נפרדת).
  // הקלטה ב-MediaRecorder; האודיו והמטא-דאטה נשמרים ב-IndexedDB משלנו
  // ('hamachberet-voice') — אפס נגיעה ב-Store/סכימה/Firebase, כך שקבצי
  // שמע גדולים לעולם לא מנפחים את ה-localStorage או את הסנכרון.
  // ─────────────────────────────────────────────────────────────────────────

  function el(tag, attrs, kids) { return App.el(tag, attrs || {}, kids || []); }

  // ── IndexedDB מקומי ──────────────────────────────────────────────────────
  const DB_NAME = 'hamachberet-voice', STORE = 'memos';
  let _dbP = null;
  function db() {
    if (_dbP) return _dbP;
    _dbP = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return _dbP;
  }
  function tx(mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => rej(t.error);
    }));
  }
  function listMemos() {
    return db().then(d => new Promise((res, rej) => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => res((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => rej(req.error);
    }));
  }
  const putMemo = m => tx('readwrite', s => s.put(m));
  const delMemo = id => tx('readwrite', s => s.delete(id));

  // ── הקלטה ────────────────────────────────────────────────────────────────
  // _ui = ה-ui של הרינדור האחרון של ה-view (מוחלף בכל כניסה לעמוד). ההקלטה
  // חיה ברמת המודול וממשיכה גם כשעוזבים את העמוד/החלון — עד עצירה מפורשת.
  let _mr = null, _chunks = [], _t0 = 0, _timerI = null, _ui = null;

  // ── שלט הקלטה צף ─────────────────────────────────────────────────────────
  // מוצג בכל עמוד בזמן הקלטה: חיווי חי + עצירה מכל מקום (ההקלטה כבר לא
  // נעצרת במעבר עמוד, אז חייבת להיות דרך לעצור בלי לחזור ל-#/voice).
  let _pill = null, _pillTime = null;
  function showRecPill() {
    if (_pill) return;
    _pillTime = el('span', { class: 'vm-pill-time' }, '00:00');
    const stopBtn = el('button', { class: 'vm-pill-stop', title: 'עצור ושמור' }, '⏹');
    stopBtn.addEventListener('click', stopRec);
    _pill = el('div', { class: 'vm-rec-pill', title: 'הקלטה פעילה — ממשיכה בכל עמוד וחלון' },
      [el('span', { class: 'vm-pill-dot' }), _pillTime, stopBtn]);
    document.body.appendChild(_pill);
  }
  function hideRecPill() { if (_pill) { _pill.remove(); _pill = null; _pillTime = null; } }

  // אזהרה לפני סגירת הטאב בזמן הקלטה — סגירה מוחקת את מה שהוקלט עד כה
  function _unloadGuard(e) { e.preventDefault(); e.returnValue = ''; }

  function pickMime() {
    const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (const m of opts) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mmss = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return h ? h + ':' + mmss : mmss;
  }

  function startRec(ui) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      App.toast('הדפדפן לא תומך בהקלטת שמע');
      return;
    }
    // איכות מקור = דיוק תמלול: ביטול הד, סינון רעש ו-AGC משפרים משמעותית
    // את הזיהוי; קצב 128kbps שומר פרטים שהמנוע צריך (עדיין ~1MB לדקה).
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(stream => {
      const mime = pickMime();
      const opts = mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
      _mr = new MediaRecorder(stream, opts);
      _chunks = [];
      _t0 = Date.now();
      _mr.ondataavailable = e => { if (e.data && e.data.size) _chunks.push(e.data); };
      // onstop משתמש ב-_ui (ה-ui החי של הרינדור האחרון) ולא ב-ui שנתפס
      // בסגירה — ההקלטה עשויה להסתיים כשהמשתמש בכלל בעמוד אחר.
      _mr.onstop = () => {
        clearInterval(_timerI); // גם אם onstop הגיע בלי stopRec (למשל התקן נותק)
        stream.getTracks().forEach(t => t.stop());
        const dur = (Date.now() - _t0) / 1000;
        const blob = new Blob(_chunks, { type: _mr.mimeType || 'audio/webm' });
        const d = new Date();
        const memo = {
          id: 'vm' + Date.now().toString(36),
          name: 'הקלטה ' + d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
          mime: blob.type, createdAt: Date.now(), duration: dur, blob: blob
        };
        putMemo(memo).then(() => {
          App.toast('🎙️ ההקלטה נשמרה');
          if (_ui) _ui.refresh();
        }).catch(() => App.toast('שמירת ההקלטה נכשלה'));
        _mr = null;
        hideRecPill();
        window.removeEventListener('beforeunload', _unloadGuard);
        if (_ui) _ui.setRecording(false);
      };
      // timeslice של שנייה: הנתונים נאספים שוטף ולא רק בעצירה — חיוני
      // להקלטות ארוכות (שעה וחצי ≈ 20MB בלבד ב-opus, אין מגבלת זמן)
      _mr.start(1000);
      if (_ui) _ui.setRecording(true);
      showRecPill();
      window.addEventListener('beforeunload', _unloadGuard);
      _timerI = setInterval(() => {
        const t = fmtDur((Date.now() - _t0) / 1000);
        if (_ui) _ui.setTimer(t);
        if (_pillTime) _pillTime.textContent = t;
      }, 500);
    }).catch(() => App.toast('אין הרשאת מיקרופון — אפשר גישה בדפדפן'));
  }
  function stopRec() {
    clearInterval(_timerI);
    if (_mr && _mr.state !== 'inactive') { try { _mr.stop(); } catch (e) {} }
  }

  // ── נגן משותף ────────────────────────────────────────────────────────────
  let _audio = null, _playingId = null, _url = null;
  function stopPlayback() {
    if (_audio) { try { _audio.pause(); } catch (e) {} }
    if (_url) { URL.revokeObjectURL(_url); _url = null; }
    _playingId = null;
    document.querySelectorAll('.vm-play.playing').forEach(b => { b.classList.remove('playing'); b.textContent = '▶'; });
  }
  function togglePlay(memo, btn) {
    if (_playingId === memo.id) { stopPlayback(); return; }
    stopPlayback();
    _audio = _audio || new Audio();
    _url = URL.createObjectURL(memo.blob);
    _audio.src = _url;
    _audio.onended = stopPlayback;
    _audio.play().then(() => {
      _playingId = memo.id;
      btn.classList.add('playing');
      btn.textContent = '⏸';
    }).catch(() => { stopPlayback(); App.toast('הניגון נכשל'); });
  }

  function download(memo) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(memo.blob);
    a.href = url;
    a.download = memo.name.replace(/[\\/:*?"<>|]/g, '-') + (memo.mime.includes('mp4') ? '.m4a' : '.webm');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ── רינדור ────────────────────────────────────────────────────────────────
  function memoRow(memo, ui) {
    const playBtn = el('button', { class: 'vm-play', title: 'נגן / עצור' }, '▶');
    playBtn.addEventListener('click', () => togglePlay(memo, playBtn));
    const name = el('span', { class: 'vm-name', title: 'לחץ לשינוי שם' }, memo.name);
    name.addEventListener('click', () => {
      const input = el('input', { class: 'input vm-rename', type: 'text', value: memo.name });
      name.replaceWith(input);
      input.focus(); input.select();
      const commit = () => {
        memo.name = input.value.trim() || memo.name;
        putMemo(memo).then(() => ui.refresh());
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') ui.refresh();
      });
      input.addEventListener('blur', commit);
    });
    // ── תמלול + Word (משתמש ב-window.VoiceTranscribe מאותה אחריות) ─────────
    const hasT = !!memo.transcript;
    const transBtn = el('button', {
      class: 'vm-act vm-trans' + (hasT ? ' done' : ''),
      title: hasT ? 'תומלל ✓ — לחץ לתמלול מחדש' : 'תמלל לטקסט (Whisper)'
    }, '📝');
    const wordBtn = el('button', {
      class: 'vm-act vm-word',
      title: 'פתח את התמלול ב-Word',
      style: hasT ? '' : 'display:none',
      onClick: () => { if (window.VoiceTranscribe) VoiceTranscribe.openInWord(memo); }
    }, '📄');
    transBtn.addEventListener('click', () => {
      if (!window.VoiceTranscribe) { App.toast('מנוע התמלול לא נטען'); return; }
      if (transBtn.classList.contains('busy')) return;
      if (memo.transcript && !confirm('להקלטה כבר יש תמלול. לתמלל מחדש?')) return;
      transBtn.classList.add('busy');
      transBtn.textContent = '⏳';
      // שורת סטטוס חיה מתחת לשורת ההקלטה
      const row = transBtn.closest('.vm-row');
      let status = row.querySelector('.vm-status');
      if (!status) { status = el('div', { class: 'vm-status' }); row.appendChild(status); }
      const setStatus = msg => { status.textContent = msg; transBtn.title = msg; };
      setStatus('מתחיל תמלול…');
      VoiceTranscribe.run(memo, setStatus).then(res => {
        memo.transcript = res.text;
        memo.transcriptChunks = res.chunks;
        memo.engine = res.engine;
        return putMemo(memo).then(() => {
          App.toast('📝 התמלול מוכן — פותח ב-Word…');
          VoiceTranscribe.openInWord(memo);   // נפתח ישר כ-Word
          ui.refresh();
        });
      }).catch(e => {
        App.toast('התמלול נכשל: ' + (e && e.message || ''));
        setStatus('❌ ' + (e && e.message || 'התמלול נכשל'));
        transBtn.classList.remove('busy');
        transBtn.textContent = '📝';
        transBtn.title = 'תמלל לטקסט (Whisper)';
        setTimeout(() => { if (status.textContent.startsWith('❌')) status.remove(); }, 6000);
      });
    });

    return el('div', { class: 'vm-row' }, [
      playBtn,
      el('div', { class: 'vm-body' }, [
        name,
        el('span', { class: 'vm-meta' }, fmtDur(memo.duration) + ' · ' + new Date(memo.createdAt).toLocaleDateString('he-IL') + (memo.engine ? ' · ' + memo.engine : ''))
      ]),
      transBtn,
      wordBtn,
      el('button', { class: 'vm-act', title: 'הורדה', onClick: () => download(memo) }, '⬇'),
      el('button', { class: 'vm-act vm-del', title: 'מחיקה', onClick: () => {
        if (confirm('למחוק את ההקלטה?')) {
          if (_playingId === memo.id) stopPlayback();
          delMemo(memo.id).then(() => ui.refresh());
        }
      } }, '✕')
    ]);
  }

  function renderView(root) {
    stopPlayback();
    const timer = el('span', { class: 'vm-timer' }, '00:00');
    const recBtn = el('button', { class: 'vm-rec-btn' }, '🎙️ התחל הקלטה');
    const listWrap = el('div', { class: 'vm-list' });

    const ui = {
      setRecording(on) {
        recBtn.textContent = on ? '⏹ עצור ושמור' : '🎙️ התחל הקלטה';
        recBtn.classList.toggle('recording', on);
        timer.style.display = on ? 'inline' : 'none';
        if (!on) timer.textContent = '00:00';
      },
      setTimer(t) { timer.textContent = t; },
      refresh() {
        listMemos().then(memos => {
          listWrap.innerHTML = '';
          if (!memos.length) {
            listWrap.appendChild(el('div', { class: 'vm-empty' }, 'אין הקלטות עדיין. לחץ "התחל הקלטה" ודבר חופשי — הכול נשמר רק במחשב שלך.'));
            return;
          }
          memos.forEach(m => listWrap.appendChild(memoRow(m, ui)));
        }).catch(() => {
          listWrap.innerHTML = '';
          listWrap.appendChild(el('div', { class: 'vm-empty' }, 'טעינת ההקלטות נכשלה.'));
        });
      }
    };
    recBtn.addEventListener('click', () => { if (_mr) stopRec(); else startRec(ui); });

    root.appendChild(el('div', { class: 'card vm-card' }, [
      el('h2', {}, '🎙️ הערות קול'),
      el('div', { class: 'vm-sub' }, 'תזכירים קוליים — מוקלטים ונשמרים מקומית בלבד. ההקלטה ממשיכה ברקע גם במעבר לעמוד או לחלון אחר, עד שעוצרים אותה. להכתבה לטקסט השתמש בכפתור 🎤 שבעורך המחברת.'),
      el('div', { class: 'vm-controls' }, [recBtn, timer]),
      listWrap
    ]));
    // חיבור ה-ui החי + שחזור מצב: אם הקלטה רצה ברקע, הצג אותה נכון בחזרה לעמוד
    _ui = ui;
    if (_mr) {
      ui.setRecording(true);
      ui.setTimer(fmtDur((Date.now() - _t0) / 1000));
    } else {
      ui.setRecording(false);
    }
    ui.refresh();
  }

  // מעבר מסך עוצר ניגון בלבד. ⚠️ הקלטה ממשיכה בכוונה — נעצרת רק בעצירה
  // מפורשת (כפתור העמוד או השלט הצף). אל תחזיר לכאן stopRec().
  window.addEventListener('hashchange', () => { stopPlayback(); });

  if (window.App && App.register) App.register('voice', renderView);
  window.VoiceMemos = { list: listMemos };
})();
