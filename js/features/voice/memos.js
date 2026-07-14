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
        : (isEn ? 'תמלל באנגלית ותרגם לעברית (Whisper + Llama-3)' : 'תמלל לטקסט (Whisper)')
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
        transBtn.title = isEn ? 'תמלל באנגלית ותרגם לעברית (Whisper + Llama-3)' : 'תמלל לטקסט (Whisper)';
        const row = transBtn.closest('.vm-row');
        const status = row && row.querySelector('.vm-status');
        setTimeout(() => { if (status && status.textContent.startsWith('❌')) status.remove(); }, 6000);
      });
    });

    return el('div', { class: 'vm-row' }, [
      playBtn,
      el('div', { class: 'vm-body' }, [
        name,
        el('span', { class: 'vm-meta' }, fmtDur(memo.duration) + ' · ' + new Date(memo.createdAt).toLocaleDateString('he-IL') + (isEn ? ' · EN' : '') + (memo.engine ? ' · ' + memo.engine : ''))
      ]),
      transBtn,
      wordBtn,
      wordEnBtn,
      el('button', { class: 'vm-act', title: 'הורדה', onClick: () => download(memo) }, '⬇'),
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
    const listWrap = el('div', { class: 'vm-list' });

    const ui = {
      setRecording(on) {
        recBtn.textContent = on ? '⏹ עצור ושמור' : recLabel;
        recBtn.classList.toggle('recording', on);
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
    recBtn.addEventListener('click', () => {
      if (_mr) {
        if (_recLang !== lang) {
          App.toast(_recLang === 'en' ? 'הקלטה באנגלית כבר פעילה — עצור אותה קודם' : 'הקלטה בעברית כבר פעילה — עצור אותה קודם');
          return;
        }
        stopRec();
      } else {
        startRec(lang);
      }
    });

    const card = el('div', { class: 'card vm-card' + (isEn ? ' vm-card-en' : '') }, [
      el('h2', {}, isEn ? '🇬🇧 הערות קול באנגלית' : '🎙️ הערות קול'),
      el('div', { class: 'vm-sub' }, isEn
        ? 'הקלטה ותמלול בשפה האנגלית. כפתור 📝 מתמלל (Whisper) ומתרגם אוטומטית לעברית; כפתור 📄 מייצא ל-Word את התרגום בעברית (עם המקור האנגלי בהמשך המסמך), וכפתור 🇬🇧 מייצא את המקור באנגלית בלבד. ההקלטות נשמרות מקומית בלבד וממשיכות ברקע — כמו בעברית.'
        : 'תזכירים קוליים — מוקלטים ונשמרים מקומית בלבד. ההקלטה ממשיכה ברקע גם במעבר לעמוד או לחלון אחר, עד שעוצרים אותה. להכתבה לטקסט השתמש בכפתור 🎤 שבעורך המחברת.'),
      el('div', { class: 'vm-controls' }, [recBtn, timer]),
      listWrap
    ]);
    return { card, ui };
  }

  function renderView(root) {
    stopPlayback();
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
