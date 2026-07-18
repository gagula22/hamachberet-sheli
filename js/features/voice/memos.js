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
  // _cards = ה-ui של שני הכרטיסים ברינדור האחרון של ה-view (he/en, מוחלף בכל
  // כניסה לעמוד). ההקלטה חיה ברמת המודול וממשיכה גם כשעוזבים את העמוד/החלון —
  // עד עצירה מפורשת. _recLang = שפת ההקלטה הפעילה (קובעת גם את שפת התמלול).
  let _mr = null, _chunks = [], _t0 = 0, _timerI = null, _cards = null, _recLang = 'he';
  function activeUi() { return (_cards && _cards[_recLang]) || null; }
  function refreshAll() { if (_cards) { _cards.he.refresh(); _cards.en.refresh(); } }

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

  // גוף ההקלטה המשותף לשני המקורות: מיקרופון (startRec) ושמע-טאב (startTabRec).
  // stream = מה שמוקלט בפועל; extraStream = סטרים-האב של שיתוף המסך (אם יש) —
  // נעצר יחד עם ההקלטה כדי שכרום יוריד את פס "משתף כרטיסייה".
  function beginRecording(stream, extraStream) {
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
        if (extraStream) extraStream.getTracks().forEach(t => t.stop());
        const dur = (Date.now() - _t0) / 1000;
        const blob = new Blob(_chunks, { type: _mr.mimeType || 'audio/webm' });
        const d = new Date();
        const isEn = _recLang === 'en';
        const memo = {
          id: 'vm' + Date.now().toString(36),
          name: isEn
            ? 'Recording ' + d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : 'הקלטה ' + d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
          lang: _recLang,
          mime: blob.type, createdAt: Date.now(), duration: dur, blob: blob
        };
        putMemo(memo).then(() => {
          App.toast('🎙️ ההקלטה נשמרה');
          refreshAll();
        }).catch(() => App.toast('שמירת ההקלטה נכשלה'));
        _mr = null;
        hideRecPill();
        window.removeEventListener('beforeunload', _unloadGuard);
        const u = activeUi();
        if (u) u.setRecording(false);
      };
      // timeslice של שנייה: הנתונים נאספים שוטף ולא רק בעצירה — חיוני
      // להקלטות ארוכות (שעה וחצי ≈ 20MB בלבד ב-opus, אין מגבלת זמן)
      _mr.start(1000);
      const u = activeUi();
      if (u) u.setRecording(true);
      showRecPill();
      window.addEventListener('beforeunload', _unloadGuard);
      _timerI = setInterval(() => {
        const t = fmtDur((Date.now() - _t0) / 1000);
        const cu = activeUi();
        if (cu) cu.setTimer(t);
        if (_pillTime) _pillTime.textContent = t;
      }, 500);
  }

  function startRec(lang) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      App.toast('הדפדפן לא תומך בהקלטת שמע');
      return;
    }
    _recLang = lang === 'en' ? 'en' : 'he';
    // איכות מקור = דיוק תמלול: ביטול הד, סינון רעש ו-AGC משפרים משמעותית
    // את הזיהוי; קצב 128kbps שומר פרטים שהמנוע צריך (עדיין ~1MB לדקה).
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(stream => beginRecording(stream))
      .catch(() => App.toast('אין הרשאת מיקרופון — אפשר גישה בדפדפן'));
  }

  // הקלטת שמע מטאב: לסרטון/שיעור שמתנגן בדפדפן. המיקרופון קולט רמקולים רע
  // (וביטול-ההד אף מוחק את שמע המחשב עצמו) — כאן נלכד השמע הדיגיטלי הנקי של
  // הטאב דרך getDisplayMedia, בלי מיקרופון בכלל. הווידאו לא מוקלט (שמע בלבד);
  // סטרים-האב נשמר חי כדי ששיתוף הטאב לא ייקטע, ונעצר יחד עם ההקלטה.
  function startTabRec(lang) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) {
      App.toast('הדפדפן לא תומך בלכידת שמע מטאב (נדרש Chrome/Edge/Brave)');
      return;
    }
    _recLang = lang === 'en' ? 'en' : 'he';
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(ds => {
      const audio = ds.getAudioTracks();
      if (!audio.length) {
        ds.getTracks().forEach(t => t.stop());
        App.toast('לא שותף שמע — בחר את טאב הסרטון וסמן "שתף גם שמע מהכרטיסייה", ונסה שוב');
        return;
      }
      // לחיצה על "הפסק שיתוף" של הדפדפן עוצרת ושומרת (לא מאבדת את ההקלטה)
      audio[0].addEventListener('ended', stopRec);
      beginRecording(new MediaStream(audio), ds);
    }).catch(() => App.toast('שיתוף הטאב בוטל'));
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
    // הקלטה משוחזרת-מהענן = טקסט בלבד: האודיו מעולם לא גובה (בכוונה), כך
    // שבמכשיר אחר אין מה לנגן/להוריד/לתמלל-מחדש — רק התמלול וייצוא ה-Word.
    const noAudio = !memo.blob;
    const playBtn = el('button', { class: 'vm-play', title: noAudio ? 'שוחזר מהענן — האודיו לא גובה ואינו זמין במכשיר הזה' : 'נגן / עצור', disabled: noAudio || null }, '▶');
    playBtn.addEventListener('click', () => { if (!noAudio) togglePlay(memo, playBtn); });
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
    // הקלטת אנגלית (memo.lang==='en'): 📝 מתמלל באנגלית ומתרגם לעברית;
    // 📄 מייצא Word עם התרגום לעברית (ומתרגם על-פי דרישה אם התרגום חסר);
    // 🇬🇧 מייצא Word עם המקור באנגלית.
    const isEn = memo.lang === 'en';
    const hasT = !!memo.transcript;
    // שורת סטטוס חיה מתחת לשורת ההקלטה (משותפת לתמלול ולתרגום-על-פי-דרישה)
    const rowStatus = btn => {
      const row = btn.closest('.vm-row');
      let status = row.querySelector('.vm-status');
      if (!status) { status = el('div', { class: 'vm-status' }); row.appendChild(status); }
      return msg => { status.textContent = msg; btn.title = msg; };
    };
    const transBtn = el('button', {
      class: 'vm-act vm-trans' + (hasT ? ' done' : ''),
      title: hasT ? 'תומלל ✓ — לחץ לתמלול מחדש'
        : (isEn ? 'תמלל באנגלית ותרגם לעברית (Whisper + Google Translate)' : 'תמלל לטקסט (Whisper)'),
      style: noAudio ? 'display:none' : ''   // בלי אודיו אין מה לתמלל-מחדש
    }, '📝');
    const wordBtn = el('button', {
      class: 'vm-act vm-word',
      title: isEn ? 'ייצוא Word — התרגום לעברית' : 'פתח את התמלול ב-Word',
      style: hasT ? '' : 'display:none'
    }, '📄');
    wordBtn.addEventListener('click', () => {
      if (!window.VoiceTranscribe) { App.toast('מנוע התמלול לא נטען'); return; }
      if (isEn && !memo.translation) {
        // התרגום נכשל/חסר בתמלול — משלימים אותו עכשיו ורק אז מייצאים
        if (wordBtn.classList.contains('busy')) return;
        wordBtn.classList.add('busy');
        const setStatus = rowStatus(wordBtn);
        setStatus('מתרגם לעברית…');
        VoiceTranscribe.translateToHebrew(memo.transcript, setStatus).then(t => {
          memo.translation = t;
          return putMemo(memo).then(() => {
            VoiceTranscribe.openInWord(memo);
            ui.refresh();
          });
        }).catch(e => {
          wordBtn.classList.remove('busy');
          App.toast('התרגום נכשל: ' + (e && e.message || ''));
          setStatus('❌ ' + (e && e.message || 'התרגום נכשל'));
        });
        return;
      }
      VoiceTranscribe.openInWord(memo);
    });
    const wordEnBtn = el('button', {
      class: 'vm-act vm-word vm-word-en',
      title: 'ייצוא Word — המקור באנגלית',
      style: (isEn && hasT) ? '' : 'display:none',
      onClick: () => { if (window.VoiceTranscribe) VoiceTranscribe.openInWord(memo, { original: true }); }
    }, '🇬🇧');
    // ── גיבוי-תמלול לענן — ידני בלבד (החלטת המשתמש: שום גיבוי אוטומטי) ────
    // מגבה את הטקסט (תמלול+תרגום+חותמות) ל-Firestore דרך window.VoiceBackup;
    // האודיו נשאר מקומי. מוצג רק כשיש תמלול. ✓ = כבר גובה (תמלול-מחדש מאפס).
    const hasBk = !!memo.backedUpAt;
    const backupBtn = el('button', {
      class: 'vm-act vm-backup' + (hasBk ? ' done' : ''),
      title: hasBk
        ? 'התמלול גובה בענן ✓ (' + new Date(memo.backedUpAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) + ') — לחץ לגיבוי מחדש'
        : 'גיבוי התמלול לענן (הטקסט בלבד, לא האודיו) — ידני, בלחיצה',
      style: hasT ? '' : 'display:none'
    }, hasBk ? '☁️✓' : '☁️');
    backupBtn.addEventListener('click', () => {
      if (backupBtn.classList.contains('busy')) return;
      if (!window.VoiceBackup) { App.toast('מודול הגיבוי לא נטען — רענן את הדף'); return; }
      if (!VoiceBackup.enabled()) { App.toast('לא מחובר לענן — התחבר קודם (איזור המשתמש בסרגל)'); return; }
      backupBtn.classList.add('busy');
      backupBtn.textContent = '⏳';
      const setStatus = rowStatus(backupBtn);
      setStatus('מגבה את התמלול לענן…');
      VoiceBackup.backup(memo).then(ts => {
        memo.backedUpAt = ts;
        return putMemo(memo).then(() => {
          App.toast('☁️ התמלול גובה ואומת בענן');
          ui.refresh();
        });
      }).catch(e => {
        backupBtn.classList.remove('busy');
        backupBtn.textContent = hasBk ? '☁️✓' : '☁️';
        App.toast('הגיבוי נכשל: ' + (e && e.message || ''));
        setStatus('❌ ' + (e && e.message || 'הגיבוי נכשל'));
        setTimeout(() => {
          const row = backupBtn.closest('.vm-row');
          const status = row && row.querySelector('.vm-status');
          if (status && status.textContent.startsWith('❌')) status.remove();
        }, 6000);
      });
    });
    transBtn.addEventListener('click', () => {
      if (!window.VoiceTranscribe) { App.toast('מנוע התמלול לא נטען'); return; }
      if (transBtn.classList.contains('busy')) return;
      if (memo.transcript && !confirm('להקלטה כבר יש תמלול. לתמלל מחדש?')) return;
      transBtn.classList.add('busy');
      transBtn.textContent = '⏳';
      const setStatus = rowStatus(transBtn);
      setStatus('מתחיל תמלול…');
      VoiceTranscribe.run(memo, setStatus).then(res => {
        memo.transcript = res.text;
        memo.transcriptChunks = res.chunks;
        memo.engine = res.engine;
        if (res.translation) memo.translation = res.translation;
        else delete memo.translation;   // תרגום ישן לא תואם לתמלול החדש
        delete memo.backedUpAt;         // הגיבוי בענן שייך לתמלול הקודם — הכפתור חוזר ל"לא גובה"
        return putMemo(memo).then(() => {
          if (isEn && !memo.translation) {
            App.toast('📝 התמלול מוכן; התרגום נכשל — לחץ 📄 לנסות שוב');
          } else {
            App.toast('📝 התמלול מוכן — פותח ב-Word…');
            VoiceTranscribe.openInWord(memo);   // נפתח ישר כ-Word (באנגלית: התרגום לעברית)
          }
          ui.refresh();
        });
      }).catch(e => {
        App.toast('התמלול נכשל: ' + (e && e.message || ''));
        setStatus('❌ ' + (e && e.message || 'התמלול נכשל'));
        transBtn.classList.remove('busy');
        transBtn.textContent = '📝';
        transBtn.title = isEn ? 'תמלל באנגלית ותרגם לעברית (Whisper + Google Translate)' : 'תמלל לטקסט (Whisper)';
        const row = transBtn.closest('.vm-row');
        const status = row && row.querySelector('.vm-status');
        setTimeout(() => { if (status && status.textContent.startsWith('❌')) status.remove(); }, 6000);
      });
    });

    return el('div', { class: 'vm-row' }, [
      playBtn,
      el('div', { class: 'vm-body' }, [
        name,
        el('span', { class: 'vm-meta' }, fmtDur(memo.duration) + ' · ' + new Date(memo.createdAt).toLocaleDateString('he-IL') + (isEn ? ' · EN' : '') + (memo.restored ? ' · ☁️ שוחזר מהענן (טקסט בלבד)' : '') + (memo.engine ? ' · ' + memo.engine : ''))
      ]),
      transBtn,
      wordBtn,
      wordEnBtn,
      backupBtn,
      el('button', { class: 'vm-act', title: 'הורדה', style: noAudio ? 'display:none' : '', onClick: () => download(memo) }, '⬇'),
      el('button', { class: 'vm-act vm-del', title: 'מחיקה', onClick: () => {
        if (confirm('למחוק את ההקלטה?')) {
          if (_playingId === memo.id) stopPlayback();
          delMemo(memo.id).then(() => ui.refresh());
        }
      } }, '✕')
    ]);
  }

  // כרטיס לשפה (he/en): כותרת, כפתור הקלטה, טיימר ורשימה מסוננת לפי שפה.
  // הקלטה אחת בכל רגע — לחיצה על "התחל" כשהקלטה בשפה האחרת פעילה נחסמת.
  function buildCard(lang) {
    const isEn = lang === 'en';
    const timer = el('span', { class: 'vm-timer' }, '00:00');
    const recLabel = isEn ? '🎙️ Start recording' : '🎙️ התחל הקלטה';
    const recBtn = el('button', { class: 'vm-rec-btn' }, recLabel);
    const tabLabel = isEn ? '🔊 Record tab audio' : '🔊 הקלט שמע מהטאב';
    const tabBtn = el('button', { class: 'vm-rec-btn vm-tab-btn', title: 'הקלטת השמע של סרטון/שיעור שמתנגן בטאב אחר — בלי מיקרופון' }, tabLabel);
    const listWrap = el('div', { class: 'vm-list' });

    const ui = {
      setRecording(on) {
        recBtn.textContent = on ? '⏹ עצור ושמור' : recLabel;
        recBtn.classList.toggle('recording', on);
        // בזמן הקלטה כפתור לכידת-הטאב (והחלון הקופץ שלו) מוסתר — הקלטה אחת בכל
        // רגע; כפתור העצירה הראשי עוצר גם הקלטת-טאב
        tabWrap.style.display = on ? 'none' : '';
        timer.style.display = on ? 'inline' : 'none';
        if (!on) timer.textContent = '00:00';
      },
      setTimer(t) { timer.textContent = t; },
      refresh() {
        listMemos().then(all => {
          const memos = all.filter(m => (m.lang || 'he') === lang);
          listWrap.innerHTML = '';
          if (!memos.length) {
            listWrap.appendChild(el('div', { class: 'vm-empty' }, isEn
              ? 'אין הקלטות באנגלית עדיין. לחץ "Start recording" ודבר באנגלית — הכול נשמר רק במחשב שלך.'
              : 'אין הקלטות עדיין. לחץ "התחל הקלטה" ודבר חופשי — הכול נשמר רק במחשב שלך.'));
            return;
          }
          memos.forEach(m => listWrap.appendChild(memoRow(m, ui)));
        }).catch(() => {
          listWrap.innerHTML = '';
          listWrap.appendChild(el('div', { class: 'vm-empty' }, 'טעינת ההקלטות נכשלה.'));
        });
      }
    };
    const guardOtherLang = () => {
      if (_mr && _recLang !== lang) {
        App.toast(_recLang === 'en' ? 'הקלטה באנגלית כבר פעילה — עצור אותה קודם' : 'הקלטה בעברית כבר פעילה — עצור אותה קודם');
        return true;
      }
      return false;
    };
    recBtn.addEventListener('click', () => {
      if (_mr) { if (guardOtherLang()) return; stopRec(); }
      else startRec(lang);
    });
    tabBtn.addEventListener('click', () => {
      if (_mr) { if (guardOtherLang()) return; stopRec(); }
      else startTabRec(lang);
    });

    // ── תוכן המדריך "הקלט שמע מהטאב": מה הכפתור עושה + שלבי הפעלה למשתמש ──
    // מיוצר מחדש בכל קריאה (אותם צמתים לא יכולים לשבת בשני מקומות) — משמש גם
    // בחלון הקופץ ב-hover וגם בפאנל המתקפל (גיבוי למגע בנייד, ללא hover).
    function guideBody() {
      return [
        el('p', {}, 'לכידת השמע הדיגיטלי של סרטון, שיעור או שיחה שמתנגנים בטאב אחר של הדפדפן — ' +
          'בלי מיקרופון. זה הפתרון הנכון לתמלול סרטונים: המיקרופון קולט את הרמקולים באיכות ירודה ' +
          '(ולפעמים ביטול-ההד של הדפדפן מוחק לגמרי את קול המחשב), ואילו לכידת-הטאב מקבלת את פס-הקול ' +
          'הנקי ישירות → איכות תמלול מקסימלית.'),
        el('p', { class: 'vm-tab-help-steps-title' }, 'שלבי הפעלה:'),
        el('ol', {}, [
          el('li', {}, 'פתח את הסרטון/השיעור בטאב אחר (בדפדפן שבו אתה מחובר לאתר) ולחץ Play.'),
          el('li', {}, 'כאן, בעמוד "הערות קול"' + (isEn ? ' — בכרטיס "🇬🇧 הערות קול באנגלית"' : '') + ', לחץ על "🔊 הקלט שמע מהטאב".'),
          el('li', {}, 'בחלון הבחירה של הדפדפן: לשונית "כרטיסייה" (Tab) → בחר את טאב הסרטון → ' +
            'ודא שהמתג "שיתוף שמע הכרטיסייה" (Share tab audio) דלוק → אשר.'),
          el('li', {}, 'חזור לסרטון ותן לו לנגן (אפשר במהירות רגילה ברקע). ההקלטה רצה — הטיימר והשלט הצף מראים זאת. ' +
            'בסיום לחץ "⏹ עצור ושמור" (כאן או בשלט הצף).'),
          el('li', {}, 'לחץ 📝 לתמלול' + (isEn ? ' באנגלית + תרגום אוטומטי לעברית, ואז 📄 לקובץ Word בעברית (עם המקור האנגלי בהמשך המסמך)' : ' ול-Word') + '. הכול נשמר רק במחשב שלך.')
        ]),
        el('p', { class: 'vm-tab-help-note' }, 'נדרש Chrome / Edge / Brave (שיתוף-שמע-כרטיסייה לא נתמך בכל הדפדפנים). טיפ: לסרטון באנגלית — השתמש בכפתור שבכרטיס "🇬🇧 הערות קול באנגלית".')
      ];
    }
    // חלון קופץ ב-hover על הכפתור (וגם ב-focus מקלדת) — מוצג/מוסתר ב-CSS.
    const tabPop = el('div', { class: 'vm-tab-pop', role: 'tooltip' }, [
      el('div', { class: 'vm-tab-pop-title' }, '🔊 הקלט שמע מהטאב — מדריך')
    ].concat(guideBody()));
    const tabWrap = el('div', { class: 'vm-tab-wrap' }, [tabBtn, tabPop]);
    // חשיפת החלון ב-hover/focus גם דרך JS (אמין בכל דפדפן; נשאר פתוח כשעוברים
    // עם העכבר אל תוך החלון). ה-CSS גם מגבה עם :hover/:focus-within.
    tabWrap.addEventListener('mouseenter', () => tabWrap.classList.add('vm-pop-open'));
    tabWrap.addEventListener('mouseleave', () => tabWrap.classList.remove('vm-pop-open'));
    tabWrap.addEventListener('focusin', () => tabWrap.classList.add('vm-pop-open'));
    tabWrap.addEventListener('focusout', () => tabWrap.classList.remove('vm-pop-open'));
    // פאנל מתקפל (גיבוי למגע/נייד, שם אין hover)
    const help = el('details', { class: 'vm-tab-help' }, [
      el('summary', {}, '🔊 מה זה "הקלט שמע מהטאב"? (מדריך)'),
      el('div', { class: 'vm-tab-help-body' }, guideBody())
    ]);

    const card = el('div', { class: 'card vm-card' + (isEn ? ' vm-card-en' : '') }, [
      el('h2', {}, isEn ? '🇬🇧 הערות קול באנגלית' : '🎙️ הערות קול'),
      el('div', { class: 'vm-sub' }, isEn
        ? 'הקלטה ותמלול בשפה האנגלית — מהמיקרופון או משמע של טאב אחר (🔊, לסרטונים/שיעורים). כפתור 📝 מתמלל (Whisper) ומתרגם אוטומטית לעברית; כפתור 📄 מייצא ל-Word את התרגום בעברית (עם המקור האנגלי בהמשך המסמך), וכפתור 🇬🇧 מייצא את המקור באנגלית בלבד. ההקלטות נשמרות מקומית בלבד וממשיכות ברקע — כמו בעברית.'
        : 'תזכירים קוליים — מהמיקרופון או משמע של טאב אחר (🔊, לסרטונים/שיעורים). מוקלטים ונשמרים מקומית בלבד, וההקלטה ממשיכה ברקע גם במעבר לעמוד או לחלון אחר, עד שעוצרים אותה. להכתבה לטקסט השתמש בכפתור 🎤 שבעורך המחברת.'),
      el('div', { class: 'vm-controls' }, [recBtn, tabWrap, timer]),
      help,
      listWrap
    ]);
    return { card, ui };
  }

  // ── שחזור-תמלולים מהענן (משלים את גיבוי-הלחיצה של backup.js) ─────────────
  // מציג את כל הגיבויים שבענן מול מה שקיים במכשיר, ומשחזר לפי בחירה:
  //   • אין הקלטה כזו במכשיר → נוצרת רשומת טקסט-בלבד (restored:true, בלי blob).
  //   • יש הקלטה אך בלי תמלול → התמלול מוזג אליה (האודיו המקומי נשמר!).
  //   • יש הקלטה עם תמלול → "קיים במכשיר" — בלי כפתור, כדי שגיבוי-ענן ישן
  //     לא ידרוס בטעות תמלול מקומי חדש יותר.
  async function openRestoreModal() {
    if (!window.VoiceBackup) { App.toast('מודול הגיבוי לא נטען — רענן את הדף'); return; }
    if (!VoiceBackup.enabled()) { App.toast('לא מחובר לענן — התחבר קודם (איזור המשתמש בסרגל)'); return; }
    let cloud, local;
    try {
      [cloud, local] = await Promise.all([VoiceBackup.list(), listMemos()]);
    } catch (e) { App.toast('טעינת הגיבויים נכשלה: ' + (e && e.message || '')); return; }
    const byId = {};
    local.forEach(m => { byId[m.id] = m; });

    const overlay = el('div', { class: 'vm-bk-overlay' });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    const listEl = el('div', { class: 'vm-bk-list' });

    async function restoreOne(meta, btn) {
      btn.disabled = true; btn.textContent = '⏳';
      const full = await VoiceBackup.fetchOne(meta.id);
      if (!full || !full.transcript) throw new Error('הגיבוי לא נמצא בענן');
      const loc = byId[meta.id];
      if (loc) {
        // מיזוג לתוך ההקלטה הקיימת — האודיו המקומי נשמר
        loc.transcript = full.transcript;
        if (full.transcriptChunks) loc.transcriptChunks = full.transcriptChunks;
        if (full.translation) loc.translation = full.translation;
        if (full.engine) loc.engine = full.engine;
        loc.backedUpAt = full.backedUpAt;
        await putMemo(loc);
      } else {
        const rec = {
          id: full.id, name: full.name || 'הקלטה משוחזרת', lang: full.lang || 'he',
          mime: '', createdAt: full.createdAt || Date.now(), duration: full.duration || 0,
          transcript: full.transcript, engine: full.engine || '',
          backedUpAt: full.backedUpAt, restored: true
        };
        if (full.transcriptChunks) rec.transcriptChunks = full.transcriptChunks;
        if (full.translation) rec.translation = full.translation;
        await putMemo(rec);
        byId[rec.id] = rec;
      }
      btn.textContent = '✓ שוחזר';
      btn.classList.add('vm-bk-done');
      refreshAll();
    }

    const missing = [];
    if (!cloud.length) {
      listEl.appendChild(el('div', { class: 'vm-empty' },
        'אין עדיין גיבויים בענן. גבה תמלול עם כפתור ☁️ שליד הקלטה מתומללת.'));
    }
    cloud.forEach(meta => {
      const loc = byId[meta.id];
      const state = loc ? (loc.transcript ? 'have' : 'merge') : 'missing';
      if (state === 'missing') missing.push(meta);
      const info = el('div', { class: 'vm-bk-info' }, [
        el('div', { class: 'vm-bk-name' }, (meta.lang === 'en' ? '🇬🇧 ' : '🎙️ ') + (meta.name || meta.id)),
        el('div', { class: 'vm-bk-meta' },
          fmtDur(meta.duration || 0) + ' · הוקלט ' + new Date(meta.createdAt || 0).toLocaleDateString('he-IL') +
          ' · גובה ' + new Date(meta.backedUpAt || 0).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }))
      ]);
      let action;
      if (state === 'have') {
        action = el('span', { class: 'vm-bk-have' }, '✓ קיים במכשיר');
      } else {
        action = el('button', { class: 'vm-bk-btn' }, state === 'merge' ? '⬇ השלם תמלול להקלטה' : '⬇ שחזר');
        action.title = state === 'merge'
          ? 'ההקלטה קיימת במכשיר בלי תמלול — הגיבוי יוזג אליה (האודיו נשמר)'
          : 'ייווצר פתק-תמלול טקסטי (האודיו לא גובה — נשאר רק במכשיר המקורי)';
        action.addEventListener('click', () => {
          restoreOne(meta, action).catch(e => {
            action.disabled = false; action.textContent = '⬇ שחזר';
            App.toast('השחזור נכשל: ' + (e && e.message || ''));
          });
        });
      }
      listEl.appendChild(el('div', { class: 'vm-bk-row' }, [info, action]));
    });

    const head = el('div', { class: 'vm-bk-head' }, [
      el('h3', {}, '☁️ שחזור תמלולים מהענן'),
      el('button', { class: 'vm-bk-close', title: 'סגירה', onClick: () => overlay.remove() }, '✕')
    ]);
    const sub = el('div', { class: 'vm-bk-sub' },
      'הגיבויים הם טקסט בלבד (תמלול + תרגום) — האודיו לא מגובה. שחזור לא דורס תמלול שקיים במכשיר.');
    const modal = el('div', { class: 'vm-bk-modal' }, [head, sub, listEl]);
    if (missing.length > 1) {
      const allBtn = el('button', { class: 'vm-bk-btn vm-bk-all' }, '⬇ שחזר את כל החסרים (' + missing.length + ')');
      allBtn.addEventListener('click', async () => {
        allBtn.disabled = true;
        const btns = [...listEl.querySelectorAll('.vm-bk-btn')].filter(b => b.textContent === '⬇ שחזר');
        let ok = 0;
        for (let i = 0; i < missing.length; i++) {
          try { await restoreOne(missing[i], btns[i] || allBtn); ok++; }
          catch (e) { console.warn('[voice-restore]', missing[i].id, e && e.message); }
        }
        allBtn.textContent = '✓ שוחזרו ' + ok + '/' + missing.length;
        App.toast('☁️ שוחזרו ' + ok + ' תמלולים');
      });
      modal.appendChild(allBtn);
    }
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function renderView(root) {
    stopPlayback();
    // כפתור שחזור-מהענן — פס דק מעל הכרטיסים (זמין לשתי השפות)
    const restoreBtn = el('button', {
      class: 'vm-restore-btn',
      title: 'הצגת התמלולים שגובו לענן (בכל מכשיר) ושחזורם לכאן'
    }, '☁️ שחזור תמלולים מהענן');
    restoreBtn.addEventListener('click', () => { openRestoreModal(); });
    root.appendChild(el('div', { class: 'vm-restore-bar' }, [restoreBtn]));
    const he = buildCard('he');
    const en = buildCard('en');
    root.appendChild(he.card);
    root.appendChild(en.card);
    // חיבור ה-ui החי + שחזור מצב: אם הקלטה רצה ברקע, הצג אותה נכון בכרטיס
    // של השפה שבה היא התחילה (בחזרה לעמוד)
    _cards = { he: he.ui, en: en.ui };
    he.ui.setRecording(false);
    en.ui.setRecording(false);
    if (_mr) {
      const u = activeUi();
      u.setRecording(true);
      u.setTimer(fmtDur((Date.now() - _t0) / 1000));
    }
    he.ui.refresh();
    en.ui.refresh();
  }

  // מעבר מסך עוצר ניגון בלבד. ⚠️ הקלטה ממשיכה בכוונה — נעצרת רק בעצירה
  // מפורשת (כפתור העמוד או השלט הצף). אל תחזיר לכאן stopRec().
  window.addEventListener('hashchange', () => { stopPlayback(); });

  if (window.App && App.register) App.register('voice', renderView);
  window.VoiceMemos = { list: listMemos };
})();
