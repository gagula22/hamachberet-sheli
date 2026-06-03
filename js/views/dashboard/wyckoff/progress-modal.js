(function () {
  // Wyckoff progress modal (UI). Polls via window.WyckoffAPI.fetchProgress.
  window.openWyckoffProgressModal = function() {
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
        <div id="wpm-stage" style="display:flex;gap:8px;margin-bottom:10px;font-size:12px;">
          <span id="wpm-stage-main" style="flex:1;text-align:center;padding:6px 10px;border-radius:6px;background:#0a7;color:#fff;font-weight:600;">שלב 1/2 — דוח ראשי</span>
          <span id="wpm-stage-skill" style="flex:1;text-align:center;padding:6px 10px;border-radius:6px;background:#e5e7eb;color:#6b7280;">שלב 2/2 — דוח Skill</span>
        </div>
        <div id="wpm-step" style="font-size:14px;color:#3B3A3A;margin-bottom:10px;min-height:20px;">מתחבר ל-Worker...</div>
        <div style="background:#e5e7eb;border-radius:8px;height:14px;overflow:hidden;margin-bottom:14px;">
          <div id="wpm-bar" style="height:100%;background:linear-gradient(90deg,#0a7,#d4a017);width:0%;transition:width .5s ease;"></div>
        </div>
        <div id="wpm-percent" style="font-size:12px;color:#6b7280;margin-bottom:12px;text-align:left;">0%</div>
        <div style="font-size:13px;color:#3B3A3A;margin-bottom:6px;">📋 לוג חי:</div>
        <div id="wpm-log" style="flex:1;overflow-y:auto;background:#1f2937;color:#a7f3d0;border-radius:8px;padding:12px;font-family:'Courier New',Consolas,monospace;font-size:12px;line-height:1.6;direction:ltr;text-align:left;min-height:240px;max-height:380px;">ממתין לתחילת הריצה...</div>
        <div id="wpm-footer" style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center;">⏳ שני הדוחות לוקחים ~10-15 דקות יחד. תוכל לסגור את החלון — הם ימשיכו ברקע.</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const stepEl = overlay.querySelector('#wpm-step');
    const barEl = overlay.querySelector('#wpm-bar');
    const pctEl = overlay.querySelector('#wpm-percent');
    const logEl = overlay.querySelector('#wpm-log');
    const footEl = overlay.querySelector('#wpm-footer');
    const closeBtn = overlay.querySelector('#wpm-close');
    const stageMainEl = overlay.querySelector('#wpm-stage-main');
    const stageSkillEl = overlay.querySelector('#wpm-stage-skill');

    function setActiveStage(stage) {
      // stage: 'main' or 'skill'
      if (stage === 'skill') {
        stageMainEl.style.background = '#86efac';   // soft green = completed
        stageMainEl.style.color = '#047857';
        stageMainEl.textContent = '✅ שלב 1/2 — דוח ראשי';
        stageSkillEl.style.background = '#0a7';     // active = bold green
        stageSkillEl.style.color = '#fff';
        stageSkillEl.style.fontWeight = '600';
      } else {
        // main is active
        stageMainEl.style.background = '#0a7';
        stageMainEl.style.color = '#fff';
        stageSkillEl.style.background = '#e5e7eb';
        stageSkillEl.style.color = '#6b7280';
        stageSkillEl.style.fontWeight = '400';
      }
    }
    function markBothComplete() {
      stageMainEl.style.background = '#86efac';
      stageMainEl.style.color = '#047857';
      stageMainEl.textContent = '✅ שלב 1/2 — דוח ראשי';
      stageSkillEl.style.background = '#86efac';
      stageSkillEl.style.color = '#047857';
      stageSkillEl.textContent = '✅ שלב 2/2 — דוח Skill';
    }

    let pollTimer = null;
    let lastLogLength = 0;
    let firstRender = true;
    let done = false;
    let currentStage = 'main';  // ⭐ Track stage locally — sticky once switched to skill

    function cleanup() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
    closeBtn.onclick = () => { cleanup(); overlay.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); overlay.remove(); } };

    async function tick() {
      try {
        const data = await window.WyckoffAPI.fetchProgress();
        if (!data) return;
        if (firstRender) { logEl.innerHTML = ''; firstRender = false; }

        // Update progress bar
        const pct = Math.max(0, Math.min(100, data.percent || 0));
        barEl.style.width = pct + '%';
        pctEl.textContent = pct + '%';

        // Current step
        if (data.currentStep) stepEl.textContent = data.currentStep;

        // 🔒 LOCKED — Stage indicator STICKY. See agent-website/ENGINEERING_NOTES.md §8.
        // Server only sends `stage:skill` on transition. Subsequent milestone updates omit it.
        // We MUST track currentStage locally — without this, badge flips back to main mid-skill.
        if (data.stage === 'skill') currentStage = 'skill';
        // (Also detect skill stage by milestone text — robust if `stage` field is lost)
        else if (data.currentStep && /שלב 2\/2/.test(data.currentStep)) currentStage = 'skill';
        setActiveStage(currentStage);

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
          // Detect if skill failed (stageLabel contains "נכשל" OR currentStep starts with ⚠️)
          const skillFailed = (data.stageLabel && data.stageLabel.includes('נכשל')) ||
                              (data.currentStep && data.currentStep.startsWith('⚠️'));
          if (skillFailed) {
            // Main OK, skill failed
            stageMainEl.style.background = '#86efac';
            stageMainEl.style.color = '#047857';
            stageMainEl.textContent = '✅ שלב 1/2 — דוח ראשי';
            stageSkillEl.style.background = '#fde68a';
            stageSkillEl.style.color = '#92400e';
            stageSkillEl.textContent = '⚠️ שלב 2/2 — Skill נכשל';
            footEl.innerHTML = '⚠️ <strong>דוח ראשי הסתיים בהצלחה,</strong> אך skill נכשל. בדקי את הלוג מעל.';
            footEl.style.color = '#d97706';
          } else {
            markBothComplete();
            footEl.innerHTML = '✅ <strong>שני הדוחות הושלמו!</strong> ראשי + skill נשלחו ל-gagula22@gmail.com';
            footEl.style.color = '#059669';
          }
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
    pollTimer = setInterval(tick, window.WyckoffConfig.POLL_INTERVAL_MS);
  };
})();