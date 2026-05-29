(function () {
  // ============================================================
  // Wyckoff Live Progress Modal — polls Worker /progress endpoint
  // ============================================================
  window.openWyckoffProgressModal = function(WORKER_URL) {
    // Remove existing modal if open
    const existing = document.getElementById('wyckoff-progress-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wyckoff-progress-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div dir="rtl" style="background:#FAF6F0;border-radius:14px;padding:24px;width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:system-ui,Arial,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="margin:0;font-size:20px;color:#3B3A3A;">🚀 הפקת ניתוח Wyckoff</h2>
          <button id="wpm-close" style="border:none;background:transparent;font-size:24px;cursor:pointer;color:#6b7280;line-height:1;padding:4px 8px;">×</button>
        </div>
        <div id="wpm-step" style="font-size:14px;color:#3B3A3A;margin-bottom:10px;min-height:20px;">מתחבר ל-Worker...</div>
        <div style="background:#e5e7eb;border-radius:8px;height:14px;overflow:hidden;margin-bottom:14px;">
          <div id="wpm-bar" style="height:100%;background:linear-gradient(90deg,#0a7,#d4a017);width:0%;transition:width .5s ease;"></div>
        </div>
        <div id="wpm-percent" style="font-size:12px;color:#6b7280;margin-bottom:12px;text-align:left;">0%</div>
        <div style="font-size:13px;color:#3B3A3A;margin-bottom:6px;">📋 לוג חי:</div>
        <div id="wpm-log" style="flex:1;overflow-y:auto;background:#1f2937;color:#a7f3d0;border-radius:8px;padding:12px;font-family:'Courier New',Consolas,monospace;font-size:12px;line-height:1.6;direction:ltr;text-align:left;min-height:240px;max-height:380px;">ממתין לתחילת הריצה...</div>
        <div id="wpm-footer" style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center;">⏳ הניתוח לוקח ~5-7 דקות. תוכל לסגור את החלון — הוא ימשיך לרוץ ברקע.</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const stepEl = overlay.querySelector('#wpm-step');
    const barEl = overlay.querySelector('#wpm-bar');
    const pctEl = overlay.querySelector('#wpm-percent');
    const logEl = overlay.querySelector('#wpm-log');
    const footEl = overlay.querySelector('#wpm-footer');
    const closeBtn = overlay.querySelector('#wpm-close');

    let pollTimer = null;
    let lastLogLength = 0;
    let firstRender = true;
    let done = false;

    function cleanup() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
    closeBtn.onclick = () => { cleanup(); overlay.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); overlay.remove(); } };

    async function tick() {
      try {
        const res = await fetch(`${WORKER_URL}/progress`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (firstRender) { logEl.innerHTML = ''; firstRender = false; }

        // Update progress bar
        const pct = Math.max(0, Math.min(100, data.percent || 0));
        barEl.style.width = pct + '%';
        pctEl.textContent = pct + '%';

        // Current step
        if (data.currentStep) stepEl.textContent = data.currentStep;

        // Append new log lines
        if (Array.isArray(data.log)) {
          for (let i = lastLogLength; i < data.log.length; i++) {
            const entry = data.log[i];
            const msg = (entry && entry.msg) ? entry.msg : String(entry);
            // Skip internal markers
            if (msg.startsWith('::PROGRESS')) continue;
            const line = document.createElement('div');
            line.textContent = msg;
            // Colorize errors
            if (/❌|FATAL|error|failed/i.test(msg)) line.style.color = '#fca5a5';
            else if (/✅|done|success/i.test(msg)) line.style.color = '#86efac';
            else if (/⚠️|warn/i.test(msg)) line.style.color = '#fde68a';
            logEl.appendChild(line);
          }
          lastLogLength = data.log.length;
          logEl.scrollTop = logEl.scrollHeight;
        }

        // Final states
        if (data.state === 'done' && !done) {
          done = true;
          footEl.innerHTML = '✅ <strong>הניתוח הושלם!</strong> מייל נשלח ל-gagula22@gmail.com';
          footEl.style.color = '#059669';
          cleanup();
        } else if (data.state === 'error' && !done) {
          done = true;
          footEl.innerHTML = '❌ <strong>נכשל:</strong> ' + (data.error || 'unknown error');
          footEl.style.color = '#dc2626';
          cleanup();
        }
      } catch (e) {
        // network blip — keep trying
      }
    }
    tick();
    pollTimer = setInterval(tick, 1500);
  };

  function render(root) {
    const today = Store.todayKey();
    const tasks = Store.get('todos') || [];
    const openTasks = tasks.filter(t => !t.done).length;
    const habits = Store.get('habits') || [];
    const habitsToday = habits.filter(h => h.log[today]).length;
    const mood = Store.get('mood') || {};
    const moodToday = mood[today];
    const notes = Store.get('notes') || [];

    const stats = App.el('div', { class: 'grid grid-4' }, [
      statCard('blush',  openTasks,       'משימות פתוחות',  tasks.length ? `${tasks.length - openTasks} הושלמו` : 'התחל את הרשימה שלך'),
      statCard('sage',   habitsToday + '/' + habits.length, 'הרגלים היום', (habitsToday === habits.length && habits.length) ? 'כל הכבוד! 🌟' : 'להמשיך כך'),
      statCard('sky',    notes.length,    'הערות שנכתבו',   'תפסו עוד רעיונות'),
      statCard('butter', moodEmoji(moodToday), 'מצב הרוח היום', moodToday ? 'נרשם' : 'לחץ כדי לעדכן')
    ]);

    const sectionGrid = App.el('div', { class: 'grid grid-3' },
      App.sections.filter(s => s.id !== 'dashboard').map(s =>
        App.el('div', {
          class: 'section-card',
          onClick: () => { location.hash = `#/${s.id}`; }
        }, [
          App.el('div', { class: 'section-icon', style: { background: `var(--${s.color})` } }, s.icon),
          App.el('div', { class: 'title' }, s.title),
          App.el('div', { class: 'desc' }, s.desc)
        ])
      )
    );

    const recentNotes = notes.slice(0, 3);
    const notesCard = App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h2', {}, 'הערות אחרונות'),
        App.el('button', { class: 'btn btn-ghost btn-sm', onClick: () => location.hash = '#/notes' }, 'לכל ההערות ←')
      ]),
      recentNotes.length
        ? App.el('div', { class: 'list' }, recentNotes.map(n =>
            App.el('div', {
              class: 'list-item',
              onClick: () => { sessionStorage.setItem('openNoteId', n.id); location.hash = '#/notes'; }
            }, [
              App.el('span', { style: { fontSize: '18px' } }, '📝'),
              App.el('div', { class: 'text' }, [
                App.el('div', { style: { fontWeight: 500 } }, n.title || 'ללא כותרת'),
                App.el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, (n.body || '').slice(0, 80))
              ])
            ])
          ))
        : App.el('div', { class: 'empty-state' }, 'עדיין אין הערות. קדימה, להתחיל לכתוב ←')
    ]);

    // Wyckoff Analysis card — opens latest BTC report from local PC
    const wyckoffCard = App.el('div', { class: 'card', style: { background: 'linear-gradient(135deg, #fff8e7 0%, #ffe5e5 100%)', borderLeft: '4px solid #d4a017' } }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h2', { style: { margin: 0 } }, '📊 ניתוח Wyckoff — BTCUSDT.P'),
        App.el('span', { style: { fontSize: '11px', color: 'var(--ink-soft)' } }, 'BYBIT')
      ]),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-soft)', margin: '8px 0' } },
        'דוח אחרון: 1D + 4H + 1H + 30m + 15m עם אסטרטגיית 3 שלבים, ווליום פר 1%, ותרחישים'),
      App.el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, [
        App.el('button', {
          class: 'btn btn-primary',
          style: { background: '#d4a017', borderColor: '#d4a017' },
          onClick: () => {
            window.open('wyckoff/latest.html', '_blank');
          }
        }, '📊 פתח דוח אחרון'),
        App.el('button', {
          class: 'btn btn-primary',
          style: { background: '#0a7', borderColor: '#0a7' },
          onClick: async (ev) => {
            const btn = ev.currentTarget;
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ שולח טריגר...';
            const WORKER_URL = 'https://morning-violet-ce94-wyckoff-trigger.gagula22.workers.dev';
            try {
              const res = await fetch(`${WORKER_URL}/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'BYBIT:BTCUSDT.P' }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              btn.textContent = '✅ נשלח';
              window.openWyckoffProgressModal && window.openWyckoffProgressModal(WORKER_URL);
            } catch (e) {
              btn.textContent = '❌ נכשל';
              alert('שליחת הטריגר נכשלה:\n' + e.message + '\n\nוודא ש-Cloudflare Worker פעיל.');
            } finally {
              setTimeout(() => { btn.disabled = false; btn.textContent = originalText; }, 5000);
            }
          }
        }, '🚀 הפק ניתוח חדש'),
        App.el('button', {
          class: 'btn btn-ghost btn-sm',
          onClick: () => {
            window.open('wyckoff/', '_blank');
          }
        }, '📁 כל הדוחות'),
      ])
    ]);

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        stats,
        wyckoffCard,
        App.el('h2', { style: { marginTop: '8px' } }, 'הכול במקום אחד'),
        sectionGrid,
        notesCard
      ])
    );
  }

  function statCard(color, value, label, sub) {
    return App.el('div', { class: `stat ${color}` }, [
      App.el('div', { class: 'stat-label' }, label),
      App.el('div', { class: 'stat-value' }, String(value)),
      App.el('div', { class: 'stat-sub' }, sub || '')
    ]);
  }

  function moodEmoji(level) {
    return ['—', '😞', '😕', '😐', '🙂', '😄'][level || 0];
  }

  App.register('dashboard', render);
})();
