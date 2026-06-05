(function () {
  // Notebook export / document generation: templates, mood blocks, Word/PDF.
  // Decoupled from the editor; reads topic data via window.nbTree.
  var getById = window.nbTree.getById, getChildren = window.nbTree.getChildren, updateTopic = window.nbTree.updateTopic;
  const NB_BUILTIN_TEMPLATES = [
    { id: 'meeting', icon: '🤝', name: 'פגישה', desc: 'משתתפים, סדר יום, החלטות, משימות', tags: ['פגישה'],
      html: () => `<h2 dir="rtl">🤝 פגישה — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">משתתפים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">סדר יום</h3><ol dir="rtl"><li></li></ol><h3 dir="rtl">החלטות</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">משימות לביצוע</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">פגישה הבאה</h3><p dir="rtl"></p>` },
    { id: 'idea', icon: '💡', name: 'רעיון', desc: 'בעיה, פתרון, צעדים ראשונים', tags: ['רעיון'],
      html: () => `<h2 dir="rtl">💡 רעיון: </h2><h3 dir="rtl">איזו בעיה זה פותר?</h3><p dir="rtl"></p><h3 dir="rtl">הפתרון</h3><p dir="rtl"></p><h3 dir="rtl">למי זה מיועד?</h3><p dir="rtl"></p><h3 dir="rtl">צעדים ראשונים</h3><div dir="rtl"><input type="checkbox" /> אימות הרעיון</div><div dir="rtl"><input type="checkbox" /> מחקר 30 דקות</div><div dir="rtl"><input type="checkbox" /> פרוטוטייפ ראשוני</div><h3 dir="rtl">אתגרים אפשריים</h3><ul dir="rtl"><li></li></ul>` },
    { id: 'daily', icon: '📅', name: 'יומן יומי', desc: 'מה עשיתי, מה למדתי, מחר', tags: ['יומן'],
      html: () => `<h2 dir="rtl">📅 ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">מצב רוח &amp; אנרגיה</h3><p dir="rtl">😊😐😔  ·  אנרגיה: ▢▢▢▢▢</p><h3 dir="rtl">מה עשיתי היום</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">מה למדתי?</h3><p dir="rtl"></p><h3 dir="rtl">3 דברים שאני מודה עליהם</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">למחר</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'reading', icon: '📚', name: 'הערות קריאה', desc: 'ספר, ציטוטים, מחשבות', tags: ['קריאה'],
      html: () => `<h2 dir="rtl">📚 הערות קריאה</h2><p dir="rtl"><strong>שם:</strong> </p><p dir="rtl"><strong>מחבר:</strong> </p><p dir="rtl"><strong>סוגה:</strong>   ·  <strong>דירוג:</strong> ⭐⭐⭐⭐⭐</p><h3 dir="rtl">תקציר במשפט אחד</h3><p dir="rtl"></p><h3 dir="rtl">3 התובנות המרכזיות</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">ציטוטים</h3><blockquote dir="rtl"></blockquote><h3 dir="rtl">איך אני מיישם את זה?</h3><p dir="rtl"></p>` },
    { id: 'goal', icon: '🎯', name: 'הגדרת מטרה', desc: 'SMART, צעדים, מועד יעד', tags: ['מטרה'],
      html: () => `<h2 dir="rtl">🎯 מטרה: </h2><h3 dir="rtl">למה?</h3><p dir="rtl">למה זה חשוב לי?</p><h3 dir="rtl">SMART</h3><ul dir="rtl"><li><strong>ספציפי:</strong> </li><li><strong>מדיד:</strong> </li><li><strong>בר-השגה:</strong> </li><li><strong>רלוונטי:</strong> </li><li><strong>מוגבל בזמן:</strong> עד </li></ul><h3 dir="rtl">צעדים לביצוע</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">איך אדע שהצלחתי?</h3><p dir="rtl"></p><h3 dir="rtl">מה עלול לעצור אותי?</h3><p dir="rtl"></p>` },
    { id: 'todo', icon: '✅', name: 'רשימת משימות', desc: 'משימות לפי עדיפות', tags: ['משימות'],
      html: () => `<h2 dir="rtl">✅ משימות — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">🔥 דחוף וחשוב</h3><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">⭐ חשוב (לא דחוף)</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">⚡ דחוף (לא חשוב)</h3><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">📋 כשיהיה זמן</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'shopping', icon: '🛒', name: 'רשימת קניות', desc: 'מצרכים מסודרים לפי חנות', tags: ['קניות'],
      html: () => `<h2 dir="rtl">🛒 קניות — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">סופר</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">ירקן</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">מאפייה</h3><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">פארם</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'trip', icon: '✈️', name: 'תכנון טיול', desc: 'יעד, אריזה, יומן יומי', tags: ['טיול'],
      html: () => `<h2 dir="rtl">✈️ טיול: </h2><p dir="rtl"><strong>יעד:</strong>   ·  <strong>תאריכים:</strong> </p><p dir="rtl"><strong>תקציב משוער:</strong> </p><h3 dir="rtl">טיסות / תחבורה</h3><p dir="rtl"></p><h3 dir="rtl">מלון / לינה</h3><p dir="rtl"></p><h3 dir="rtl">תכנית יומית</h3><p dir="rtl"><strong>יום 1:</strong> </p><p dir="rtl"><strong>יום 2:</strong> </p><p dir="rtl"><strong>יום 3:</strong> </p><h3 dir="rtl">רשימת אריזה</h3><div dir="rtl"><input type="checkbox" /> דרכון / ת.ז.</div><div dir="rtl"><input type="checkbox" /> כרטיסי טיסה</div><div dir="rtl"><input type="checkbox" /> מטענים / מתאמים</div><div dir="rtl"><input type="checkbox" /> ביטוח נסיעות</div><div dir="rtl"><input type="checkbox" /> תרופות</div><h3 dir="rtl">לזכור</h3><ul dir="rtl"><li></li></ul>` },
    { id: 'budget', icon: '💰', name: 'תקציב חודשי', desc: 'הכנסות והוצאות', tags: ['תקציב'],
      html: () => `<h2 dir="rtl">💰 תקציב — </h2><p dir="rtl"><strong>חודש:</strong>   ·  <strong>סטטוס:</strong> </p><h3 dir="rtl">הכנסות</h3><table style="border-collapse:collapse;width:100%"><tr><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">מקור</th><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">סכום</th></tr><tr><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr></table><h3 dir="rtl">הוצאות</h3><table style="border-collapse:collapse;width:100%"><tr><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">קטגוריה</th><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">מתוכנן</th><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">בפועל</th></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">שכר דירה</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">מזון</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">תחבורה</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">בילויים</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr></table><h3 dir="rtl">תובנות</h3><p dir="rtl"></p>` },
    { id: 'recipe', icon: '🍳', name: 'מתכון', desc: 'מצרכים והוראות הכנה', tags: ['מתכון'],
      html: () => `<h2 dir="rtl">🍳 </h2><p dir="rtl"><strong>מנות:</strong>   ·  <strong>זמן הכנה:</strong>  דק׳  ·  <strong>זמן בישול:</strong>  דק׳</p><p dir="rtl"><strong>רמת קושי:</strong> ⭐⭐</p><h3 dir="rtl">מצרכים</h3><ul dir="rtl"><li> </li><li> </li><li> </li></ul><h3 dir="rtl">הוראות הכנה</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">טיפים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">הערות אישיות</h3><p dir="rtl"></p>` },
    { id: 'review', icon: '📔', name: 'סיכום שבועי', desc: 'הצלחות, אתגרים, מטרות', tags: ['סיכום שבועי'],
      html: () => `<h2 dir="rtl">📔 סיכום שבוע — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">⭐ 3 הצלחות השבוע</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">📚 מה למדתי</h3><p dir="rtl"></p><h3 dir="rtl">🌱 איפה התקדמתי</h3><p dir="rtl"></p><h3 dir="rtl">⚠️ אתגרים / תקיעות</h3><p dir="rtl"></p><h3 dir="rtl">🎯 3 מטרות לשבוע הבא</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">דירוג כללי לשבוע</h3><p dir="rtl">⭐⭐⭐⭐⭐</p>` },
    { id: 'project', icon: '💼', name: 'תכנון פרויקט', desc: 'מטרה, אבני דרך, סיכונים', tags: ['פרויקט'],
      html: () => `<h2 dir="rtl">💼 פרויקט: </h2><p dir="rtl"><strong>סטטוס:</strong>  · <strong>תאריך התחלה:</strong>  · <strong>יעד סיום:</strong> </p><h3 dir="rtl">מטרת על</h3><p dir="rtl"></p><h3 dir="rtl">תוצרים מצופים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">אבני דרך</h3><div dir="rtl"><input type="checkbox" /> אבן דרך 1 — </div><div dir="rtl"><input type="checkbox" /> אבן דרך 2 — </div><div dir="rtl"><input type="checkbox" /> אבן דרך 3 — </div><h3 dir="rtl">משאבים נדרשים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">משימות פתוחות</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'brainstorm', icon: '🧠', name: 'סיעור מוחות', desc: 'רעיונות חופשיים ובחירה', tags: ['רעיון'],
      html: () => `<h2 dir="rtl">🧠 סיעור מוחות: </h2><h3 dir="rtl">השאלה / הבעיה</h3><p dir="rtl"></p><h3 dir="rtl">רעיונות (אל תשפוט, רק רשום)</h3><ul dir="rtl"><li></li><li></li><li></li><li></li><li></li><li></li></ul><h3 dir="rtl">3 הטובים ביותר</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">המנצח</h3><p dir="rtl"></p><h3 dir="rtl">צעדים הבאים</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'standup', icon: '💬', name: 'סטנדאפ צוות', desc: 'מה עשיתי, מה אעשה, חסמים', tags: ['פגישה', 'סטנדאפ'],
      html: () => `<h2 dir="rtl">💬 סטנדאפ — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">מה עשיתי אתמול?</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">מה אעשה היום?</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">חסמים?</h3><p dir="rtl"></p><h3 dir="rtl">דברים לשתף עם הצוות</h3><p dir="rtl"></p>` }
  ];

  function openTemplateGallery(editor, save, topicId) {
    const esc = (s) => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const tplUid = () => 'tpl_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
    function getCustom() { return Store.get('customTemplates') || []; }
    function setCustom(arr) { Store.set('customTemplates', arr); }

    // Remove existing overlay if any
    document.getElementById('_nb_tpl_overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_nb_tpl_overlay';
    overlay.className = 'nb-tpl-overlay';

    const modal = document.createElement('div');
    modal.className = 'nb-tpl-modal';
    modal.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;';

    // ── Header ──
    const head = document.createElement('div');
    head.className = 'nb-tpl-head';
    head.style.cssText = 'padding:18px 20px 0;flex-shrink:0;';
    head.innerHTML = '<h3 style="font-size:17px;font-weight:600;">📄 בחר תבנית</h3>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'nb-tpl-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => overlay.remove();
    head.appendChild(closeBtn);

    // ── Tabs ──
    const tabsBar = document.createElement('div');
    tabsBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid var(--nb-border-soft);margin:12px 20px 0;flex-shrink:0;';
    const tabBuiltin = document.createElement('button');
    const tabCustom  = document.createElement('button');
    tabBuiltin.textContent = 'תבניות מובנות';
    tabCustom.textContent  = 'התבניות שלי';
    [tabBuiltin, tabCustom].forEach(t => {
      t.style.cssText = 'padding:8px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;color:var(--nb-text-3);border-bottom:2px solid transparent;margin-bottom:-1px;font-family:Heebo,sans-serif;';
    });
    tabsBar.appendChild(tabBuiltin);
    tabsBar.appendChild(tabCustom);

    // ── Grids container ──
    const gridsWrap = document.createElement('div');
    gridsWrap.style.cssText = 'flex:1;overflow-y:auto;padding:14px 20px 0;';

    const gridBuiltin = document.createElement('div');
    const gridCustom  = document.createElement('div');
    gridBuiltin.className = gridCustom.className = 'nb-tpl-grid';

    // ── Save current button ──
    const saveCurrentBtn = document.createElement('button');
    saveCurrentBtn.style.cssText = 'margin:12px 20px 16px;padding:10px 16px;background:var(--nb-bg-page);border:1px dashed var(--nb-accent-soft,#C9826A);border-radius:8px;font-size:13px;color:var(--nb-accent-str,#8C4A2C);width:calc(100% - 40px);font-weight:500;cursor:pointer;font-family:Heebo,sans-serif;flex-shrink:0;';
    saveCurrentBtn.textContent = '💾 שמור הערה זו כתבנית חדשה';
    saveCurrentBtn.onmouseover = () => { saveCurrentBtn.style.background = 'var(--nb-bg-tag)'; saveCurrentBtn.style.borderStyle = 'solid'; };
    saveCurrentBtn.onmouseout  = () => { saveCurrentBtn.style.background = 'var(--nb-bg-page)'; saveCurrentBtn.style.borderStyle = 'dashed'; };

    gridsWrap.appendChild(gridBuiltin);
    gridsWrap.appendChild(gridCustom);
    modal.appendChild(head);
    modal.appendChild(tabsBar);
    modal.appendChild(gridsWrap);
    modal.appendChild(saveCurrentBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ── Render grid ──
    function renderGrids(activeTab) {
      // Tab styles
      if (activeTab === 'builtin') {
        tabBuiltin.style.color = 'var(--nb-accent-str,#8C4A2C)';
        tabBuiltin.style.fontWeight = '600';
        tabBuiltin.style.borderBottomColor = 'var(--nb-accent,#B8762A)';
        tabCustom.style.color = 'var(--nb-text-3)';
        tabCustom.style.fontWeight = '400';
        tabCustom.style.borderBottomColor = 'transparent';
      } else {
        tabCustom.style.color = 'var(--nb-accent-str,#8C4A2C)';
        tabCustom.style.fontWeight = '600';
        tabCustom.style.borderBottomColor = 'var(--nb-accent,#B8762A)';
        tabBuiltin.style.color = 'var(--nb-text-3)';
        tabBuiltin.style.fontWeight = '400';
        tabBuiltin.style.borderBottomColor = 'transparent';
      }
      gridBuiltin.style.display = activeTab === 'builtin' ? 'grid' : 'none';
      gridCustom.style.display  = activeTab === 'custom'  ? 'grid' : 'none';

      // Built-in cards
      if (activeTab === 'builtin' && !gridBuiltin._rendered) {
        gridBuiltin._rendered = true;
        NB_BUILTIN_TEMPLATES.forEach(t => {
          const card = document.createElement('div');
          card.className = 'nb-tpl-card';
          card.style.position = 'relative';
          card.innerHTML = '<span class="nb-tpl-icon">' + t.icon + '</span><div class="nb-tpl-name">' + esc(t.name) + '</div><div class="nb-tpl-desc">' + esc(t.desc) + '</div>';
          // Edit button (fork to custom)
          const editBtn = document.createElement('span');
          editBtn.textContent = '✏️';
          editBtn.title = 'צור עותק שלי לעריכה';
          editBtn.style.cssText = 'display:none;position:absolute;top:4px;right:4px;background:var(--nb-accent);color:white;border-radius:50%;width:18px;height:18px;font-size:10px;align-items:center;justify-content:center;cursor:pointer;line-height:1;';
          card.appendChild(editBtn);
          card.onmouseenter = () => { editBtn.style.display = 'flex'; };
          card.onmouseleave = () => { editBtn.style.display = 'none'; };
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            forkBuiltinTemplate(t);
          });
          card.addEventListener('click', () => applyTemplate(t.html(), t.name, t.tags || []));
          gridBuiltin.appendChild(card);
        });
      }

      // Custom cards
      if (activeTab === 'custom') {
        gridCustom.innerHTML = '';
        const customs = getCustom();
        if (customs.length === 0) {
          gridCustom.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--nb-text-3);font-size:13px;"><div style="font-size:32px;margin-bottom:8px">📭</div><div>עדיין אין תבניות שלך.</div><div style="font-size:11px;margin-top:6px;">לחץ \'💾 שמור הערה זו כתבנית חדשה\' למטה.</div></div>';
        } else {
          customs.forEach(t => {
            const card = document.createElement('div');
            card.className = 'nb-tpl-card';
            card.style.cssText = 'position:relative;border-style:dashed;';
            card.innerHTML = '<span class="nb-tpl-icon">' + (t.icon || '📝') + '</span><div class="nb-tpl-name">' + esc(t.name) + '</div><div class="nb-tpl-desc">תבנית מותאמת אישית</div>';
            // Edit button
            const editBtn = document.createElement('span');
            editBtn.textContent = '✏️';
            editBtn.title = 'ערוך תבנית';
            editBtn.style.cssText = 'display:none;position:absolute;top:4px;right:4px;background:var(--nb-accent);color:white;border-radius:50%;width:18px;height:18px;font-size:10px;align-items:center;justify-content:center;cursor:pointer;line-height:1;';
            // Delete button
            const delBtn = document.createElement('span');
            delBtn.textContent = '×';
            delBtn.title = 'מחק תבנית';
            delBtn.style.cssText = 'display:none;position:absolute;top:4px;left:4px;background:#B5453F;color:white;border-radius:50%;width:18px;height:18px;font-size:13px;align-items:center;justify-content:center;cursor:pointer;line-height:1;';
            card.appendChild(editBtn);
            card.appendChild(delBtn);
            card.onmouseenter = () => { editBtn.style.display = 'flex'; delBtn.style.display = 'flex'; card.style.borderStyle = 'solid'; };
            card.onmouseleave = () => { editBtn.style.display = 'none'; delBtn.style.display = 'none'; card.style.borderStyle = 'dashed'; };
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEditCustomTemplate(t.id); });
            delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (!confirm('למחוק את התבנית "' + t.name + '"?')) return;
              setCustom(getCustom().filter(x => x.id !== t.id));
              App.toast('התבנית נמחקה');
              renderGrids('custom');
            });
            card.addEventListener('click', () => applyTemplate(t.html, t.name));
            gridCustom.appendChild(card);
          });
        }
      }
    }

    function applyTemplate(html, name, tags) {
      editor.focus();
      document.execCommand('insertHTML', false, html);
      save();
      // Auto-add template tags to the current topic (if any)
      if (tags && tags.length && topicId) {
        const current = getById(topicId);
        if (current) {
          const existing = Array.isArray(current.tags) ? current.tags : [];
          const merged = [...existing];
          tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
          if (merged.length !== existing.length) {
            updateTopic(topicId, { tags: merged });
          }
        }
      }
      overlay.remove();
      App.toast('✓ תבנית "' + name + '" הוכנסה');
    }

    function forkBuiltinTemplate(t) {
      const name = prompt('שם לעותק החדש:', t.name + ' (שלי)');
      if (!name || !name.trim()) return;
      const customs = getCustom();
      const newTpl = { id: tplUid(), name: name.trim(), icon: t.icon, html: t.html(), createdAt: Date.now() };
      customs.push(newTpl);
      setCustom(customs);
      App.toast('עותק נוצר — עורך מצב עריכה');
      overlay.remove();
      setTimeout(() => startEditCustomTemplateById(newTpl.id, editor, save), 80);
    }

    function startEditCustomTemplate(tplId) {
      overlay.remove();
      setTimeout(() => startEditCustomTemplateById(tplId, editor, save), 80);
    }

    saveCurrentBtn.addEventListener('click', () => {
      const html = editor.innerHTML || '';
      if (!html.trim() || html === '<br>') { App.toast('אין תוכן בהערה הנוכחית'); return; }
      const name = prompt('שם התבנית:');
      if (!name || !name.trim()) return;
      const icon = prompt('אימוג\'י לתבנית (השאר ריק ל-📝):', '📝') || '📝';
      const customs = getCustom();
      customs.push({ id: tplUid(), name: name.trim(), icon: icon.trim() || '📝', html: html, createdAt: Date.now() });
      setCustom(customs);
      App.toast('💾 נשמרה תבנית: ' + name);
      overlay.remove();
      setTimeout(() => { openTemplateGallery(editor, save, topicId); renderGrids('custom'); }, 200);
    });

    tabBuiltin.addEventListener('click', () => renderGrids('builtin'));
    tabCustom.addEventListener('click',  () => renderGrids('custom'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escClose); }
    });

    renderGrids('builtin');
  }

  // Edit a custom template by loading it into the editor with a banner
  function startEditCustomTemplateById(tplId, editor, save) {
    const customs = Store.get('customTemplates') || [];
    const tpl = customs.find(t => t.id === tplId);
    if (!tpl) return;
    // Inject edit banner above editor-col
    const editorCol = editor.closest('.nb-editor-col');
    if (!editorCol) return;
    // Remove any existing banner
    editorCol.querySelector('.nb-tpl-edit-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'nb-tpl-edit-banner';
    banner.innerHTML = '<span>🔧 עורך תבנית: <strong>' + tpl.name + '</strong> ' + (tpl.icon || '') + '</span>';
    const actions = document.createElement('span');
    actions.style.cssText = 'display:flex;gap:8px;';
    const saveBtn   = document.createElement('button');
    const cancelBtn = document.createElement('button');
    saveBtn.textContent   = '💾 שמור שינויים';
    cancelBtn.textContent = '✕ בטל';
    saveBtn.className   = 'nb-tpl-banner-save';
    cancelBtn.className = 'nb-tpl-banner-cancel';
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    banner.appendChild(actions);
    editorCol.insertBefore(banner, editorCol.firstChild);
    // Load template content into editor
    const origContent = editor.innerHTML;
    editor.innerHTML = tpl.html;
    saveBtn.addEventListener('click', () => {
      const cs = Store.get('customTemplates') || [];
      const idx = cs.findIndex(t => t.id === tplId);
      if (idx !== -1) { cs[idx].html = editor.innerHTML; Store.set('customTemplates', cs); }
      editor.innerHTML = origContent;
      banner.remove();
      save();
      App.toast('✓ התבנית עודכנה: ' + tpl.name);
    });
    cancelBtn.addEventListener('click', () => {
      editor.innerHTML = origContent;
      banner.remove();
      App.toast('עריכת התבנית בוטלה');
    });
  }

  // ── Mood journal modal ────────────────────────────────────────────────────
  function openMoodModal(editor, save) {
    const overlay = document.createElement('div');
    overlay.className = 'nb-tpl-overlay';
    const modal = document.createElement('div');
    modal.className = 'nb-tpl-modal nb-mood-modal';

    modal.innerHTML = `
<div class="nb-tpl-head">
  <h3>🎭 רישום מצב רוח</h3>
  <button class="nb-tpl-close" id="_moodX">×</button>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">איך אני מרגיש עכשיו?</span>
  <div class="nb-mood-emojis">
    <span class="nb-mood-emoji" data-mood="great">😄<div class="nb-mood-tip">מצוין</div></span>
    <span class="nb-mood-emoji" data-mood="good">😊<div class="nb-mood-tip">טוב</div></span>
    <span class="nb-mood-emoji" data-mood="okay">😐<div class="nb-mood-tip">בסדר</div></span>
    <span class="nb-mood-emoji" data-mood="bad">😟<div class="nb-mood-tip">לא טוב</div></span>
    <span class="nb-mood-emoji" data-mood="awful">😢<div class="nb-mood-tip">גרוע</div></span>
  </div>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">⚡ רמת אנרגיה</span>
  <div class="nb-mood-stars" id="_energyS">
    <span class="nb-mood-star" data-val="1">★</span><span class="nb-mood-star" data-val="2">★</span>
    <span class="nb-mood-star" data-val="3">★</span><span class="nb-mood-star" data-val="4">★</span>
    <span class="nb-mood-star" data-val="5">★</span>
  </div>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">😴 איכות שינה אתמול</span>
  <div class="nb-mood-stars" id="_sleepS">
    <span class="nb-mood-star" data-val="1">★</span><span class="nb-mood-star" data-val="2">★</span>
    <span class="nb-mood-star" data-val="3">★</span><span class="nb-mood-star" data-val="4">★</span>
    <span class="nb-mood-star" data-val="5">★</span>
  </div>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">💭 מה השפיע על מצב הרוח שלי?</span>
  <textarea class="nb-mood-textarea" id="_moodTxt" placeholder="כל מה שמתחשק לרשום..."></textarea>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">🙏 3 דברים שאני מודה עליהם</span>
  <input class="nb-mood-input" id="_g1" placeholder="1." /><input class="nb-mood-input" id="_g2" placeholder="2." /><input class="nb-mood-input" id="_g3" placeholder="3." />
</div>
<div class="nb-tpl-actions">
  <button class="nb-tpl-btn-primary" id="_moodSave">💾 שמור ביומן</button>
  <button class="nb-tpl-btn-secondary" id="_moodCancel">ביטול</button>
</div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#_moodX').onclick      = () => overlay.remove();
    modal.querySelector('#_moodCancel').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    let selectedMood = '';
    let energyRating = 0;
    let sleepRating  = 0;

    modal.querySelectorAll('.nb-mood-emoji').forEach(el => {
      el.addEventListener('click', () => {
        modal.querySelectorAll('.nb-mood-emoji').forEach(e2 => e2.classList.remove('selected'));
        el.classList.add('selected');
        selectedMood = el.dataset.mood;
      });
    });

    function setupStars(groupId, onPick) {
      const stars = modal.querySelectorAll('#' + groupId + ' .nb-mood-star');
      stars.forEach(s => {
        s.addEventListener('click', () => {
          const v = parseInt(s.dataset.val);
          onPick(v);
          stars.forEach(s2 => s2.classList.toggle('lit', parseInt(s2.dataset.val) <= v));
        });
      });
    }
    setupStars('_energyS', v => { energyRating = v; });
    setupStars('_sleepS',  v => { sleepRating  = v; });

    modal.querySelector('#_moodSave').addEventListener('click', () => {
      const LABELS = { great: 'מצוין 😄', good: 'טוב 😊', okay: 'בסדר 😐', bad: 'לא טוב 😟', awful: 'גרוע 😢' };
      const moodLbl  = LABELS[selectedMood] || '—';
      const energyStr = energyRating ? '★'.repeat(energyRating) + '☆'.repeat(5 - energyRating) : '—';
      const sleepStr  = sleepRating  ? '★'.repeat(sleepRating)  + '☆'.repeat(5 - sleepRating)  : '—';
      const txt = modal.querySelector('#_moodTxt').value;
      const gratitude = [modal.querySelector('#_g1').value, modal.querySelector('#_g2').value, modal.querySelector('#_g3').value]
        .filter(Boolean).map((g, i) => `<li dir="rtl">${i + 1}. ${g}</li>`).join('');
      const date = new Date().toLocaleDateString('he-IL');

      const BG   = '#E8F5F8';
      const BOR  = '#A8D8E8';
      const LBL  = '#2B6E82';
      const html = `<div dir="rtl" style="background:${BG};border:1px solid ${BOR};border-radius:12px;padding:16px 20px;margin:12px 0;font-family:'Heebo',sans-serif;">
<div style="font-size:11px;color:${LBL};margin-bottom:10px;font-weight:600;letter-spacing:0.3px;">🎭 יומן מצב רוח · ${date}</div>
<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid ${BOR};">
  <span><strong>מצב רוח:</strong> ${moodLbl}</span>
  <span><strong>אנרגיה:</strong> ${energyStr}</span>
  <span><strong>שינה:</strong> ${sleepStr}</span>
</div>
${txt ? `<div style="margin-bottom:10px;">
  <div style="font-size:12px;font-weight:600;color:${LBL};margin-bottom:4px;">💭 מה השפיע על מצב הרוח שלי?</div>
  <div style="font-size:13px;color:#2C4A55;padding:8px 12px;background:rgba(255,255,255,0.65);border-radius:8px;white-space:pre-wrap;">${txt.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
</div>` : ''}
${gratitude ? `<div>
  <div style="font-size:12px;font-weight:600;color:${LBL};margin-bottom:6px;">🙏 3 דברים שאני מודה עליהם</div>
  <ol dir="rtl" style="margin:0;padding-right:20px;font-size:13px;color:#2C4A55;">${gratitude}</ol>
</div>` : ''}
</div><p dir="rtl"><br></p>`;

      editor.focus();
      document.execCommand('insertHTML', false, html);
      save();
      overlay.remove();
      App.toast('🎭 נרשם ביומן מצב הרוח');
    });
  }

  function insertMoodBlock(editor, save) {
    editor.focus();
    const id = Store.uid();
    const block = document.createElement('div');
    block.className = 'nb-mood-embed';
    block.contentEditable = 'false';
    block.dataset.moodId = id;
    block.dataset.level = '';
    block.dataset.note = '';
    const EMOJIS = ['😞','😕','😐','🙂','😄'];
    block.innerHTML =
      '<div class="nb-mood-embed-header"><span>🎭</span><span>יומן מצב רוח</span></div>' +
      '<div class="nb-mood-embed-row">' +
        '<span class="nb-mood-embed-q">איך אתה מרגיש היום?</span>' +
        '<div class="nb-mood-embed-picker">' +
          EMOJIS.map((e, i) => `<button class="nb-mood-btn" data-level="${i + 1}" type="button">${e}</button>`).join('') +
        '</div>' +
      '</div>' +
      '<textarea class="nb-mood-note" placeholder="מה השפיע על מצב הרוח שלך היום?" rows="3"></textarea>';

    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(block);
      const space = document.createTextNode(' ');
      block.after(space);
      const r2 = document.createRange();
      r2.setStartAfter(space);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
    } else {
      editor.appendChild(block);
      editor.appendChild(document.createTextNode(' '));
    }
    save();
  }

  function showExportDialog(currentTopic, editor, format) {
    const fmtLabel = format === 'pdf' ? 'PDF' : 'Word (.doc)';
    let choice = 'current';

    const rootTopics = getChildren(null);
    const others = rootTopics.filter(t => t.id !== currentTopic.id);

    function makeOpt(value, labelText) {
      const wrap = document.createElement('label');
      wrap.className = 'export-opt' + (value === 'current' ? ' selected' : '');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'export-choice';
      radio.value = value;
      radio.checked = value === 'current';
      radio.addEventListener('change', () => {
        choice = value;
        otherSel.style.display = value === 'other' ? 'block' : 'none';
        overlay.querySelectorAll('.export-opt').forEach(el =>
          el.classList.toggle('selected', el.querySelector('input').value === choice)
        );
      });
      wrap.appendChild(radio);
      wrap.appendChild(document.createTextNode(labelText));
      return wrap;
    }

    const otherSel = App.el('select', {
      class: 'input',
      style: { display: 'none', marginTop: '8px', width: '100%' }
    }, others.length
      ? others.map(t => App.el('option', { value: t.id }, t.name))
      : [App.el('option', { value: '' }, '(אין מחברות אחרות)')]
    );

    const overlay = App.el('div', { class: 'export-overlay', onClick: (e) => {
      if (e.target === overlay) overlay.remove();
    }});

    const optsChildren = [
      makeOpt('current', `המחברת הנוכחית — "${currentTopic.name}"`)
    ];
    if (others.length) {
      optsChildren.push(makeOpt('other', 'מחברת אחרת מהרשימה'));
      optsChildren.push(otherSel);
    }
    optsChildren.push(makeOpt('all', 'כל המחברות לפי סדר הופעתן'));

    const modal = App.el('div', { class: 'export-modal' }, [
      App.el('div', { class: 'export-modal-title' }, `יצוא ל-${fmtLabel}`),
      App.el('div', { class: 'export-opts-wrap' }, optsChildren),
      App.el('div', { class: 'export-modal-footer' }, [
        App.el('button', { class: 'btn-ghost', style: { padding: '10px 18px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }, onClick: () => overlay.remove() }, 'ביטול'),
        App.el('button', { class: 'btn', onClick: () => {
          overlay.remove();
          if (choice === 'current') {
            exportDoc(currentTopic, editor, format);
          } else if (choice === 'other') {
            const id = otherSel.value;
            if (id) exportTopicById(id, format);  // already async-safe
          } else {
            exportAllTopics(format);
          }
        }}, `יצוא ל-${fmtLabel}`)
      ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  async function exportTopicById(id, format) {
    const t = getById(id);
    if (!t) return;
    function collectHtml(topicId) {
      const topic = getById(topicId);
      if (!topic) return '';
      let html = topic.body || '';
      getChildren(topicId).forEach(c => {
        html += `<h2 style="margin-top:24px">${c.name}</h2>` + collectHtml(c.id);
      });
      return html;
    }
    const div = document.createElement('div');
    div.innerHTML = collectHtml(id);
    await exportDoc(t, div, format);
  }

  async function exportAllTopics(format) {
    const roots = getChildren(null);
    let html = '';
    function addTopic(topicId, depth) {
      const t = getById(topicId);
      if (!t) return;
      const tag = depth === 0 ? 'h1' : depth === 1 ? 'h2' : 'h3';
      html += `<${tag}>${t.name}</${tag}>` + (t.body || '');
      getChildren(topicId).forEach(c => addTopic(c.id, depth + 1));
    }
    roots.forEach(t => addTopic(t.id, 0));
    const div = document.createElement('div');
    div.innerHTML = html;
    await exportDoc({ name: 'כל המחברות', updatedAt: Date.now() }, div, format);
  }

  // Convert any img to a data-URL via canvas (handles external URLs + ensures inline)
  function imgToDataUrl(img) {
    return new Promise(resolve => {
      if (!img.src || img.src.startsWith('data:')) { resolve(img.src); return; }
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = tmp.naturalWidth; c.height = tmp.naturalHeight;
          c.getContext('2d').drawImage(tmp, 0, 0);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch { resolve(img.src); }
      };
      tmp.onerror = () => resolve(img.src);
      tmp.src = img.src;
    });
  }

  // ── Real PDF file, auto-downloaded as "<notebook>.pdf" — delegated to the
  // shared HTML→PDF engine (window.HtmlToPdf, see components/html-to-pdf.js) so
  // the notebook export and the Word→PDF tool share ONE proven implementation
  // (whole-pass html2canvas render at explicit width + block-boundary pagination).
  function exportPdfFile(title, bodyHtml) {
    if (!window.HtmlToPdf) return Promise.reject(new Error('HtmlToPdf unavailable'));
    return window.HtmlToPdf.generate(title, bodyHtml, { dir: 'rtl' });
  }

  // Fallback: the browser's own Save-as-PDF (used only if the PDF libs can't load,
  // e.g. a corporate network blocking the CDN). Opens the print dialog directly.
  function exportPdfViaPrint(title, body) {
    const printId = 'nb-pdf-content-' + Date.now();
    const printDiv = document.createElement('div');
    printDiv.id = printId;
    printDiv.setAttribute('dir', 'rtl');
    printDiv.setAttribute('style', 'display:none;font-size:11pt;font-family:Arial,sans-serif;');
    printDiv.innerHTML = '<h1 style="font-size:24pt;margin-bottom:18pt;font-family:Arial,sans-serif;">' + title + '</h1>' + body;

    const printStyle = document.createElement('style');
    printStyle.id = printId + '-style';
    printStyle.textContent =
      '@media print {' +
      '  body > *:not(#' + printId + ') { display: none !important; visibility: hidden !important; }' +
      '  #' + printId + ' { display: block !important; visibility: visible !important; position: static !important;' +
      '    font-family: Arial, sans-serif; font-size: 11pt; color: #000; direction: rtl; line-height: 1.7; }' +
      '  #' + printId + ' h1,#' + printId + ' h2,#' + printId + ' h3 { margin-bottom: 8pt; }' +
      '  #' + printId + ' p,#' + printId + ' li,#' + printId + ' td { font-size: 11pt; }' +
      '  #' + printId + ' p { margin: 6pt 0; }' +
      '  #' + printId + ' img { max-width: 100%; height: auto; }' +
      '  #' + printId + ' table[align="center"] { width: 100%; }' +
      '  #' + printId + ' .nb-img-del { display: none !important; }' +
      '  #' + printId + ' figure.nb-img, #' + printId + ' p[align="center"] { page-break-inside: avoid; break-inside: avoid; }' +
      '  @page { margin: 15mm; size: A4; }' +
      '}';
    document.head.appendChild(printStyle);
    document.body.appendChild(printDiv);
    const _origTitle = document.title;
    document.title = title;
    App.toast('נפתח חלון שמירה — שם הקובץ: ' + title);
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        printStyle.remove(); printDiv.remove(); document.title = _origTitle;
      }, 1500);
    }, 250);
  }

  async function exportDoc(topic, editor, format) {
    const title = topic.name || 'מחברת';

    // ── Step 0: ensure all images are inline data-URLs (not external URLs)
    await Promise.all(Array.from(editor.querySelectorAll('figure.nb-img img')).map(async img => {
      if (img.src && !img.src.startsWith('data:')) {
        img.src = await imgToDataUrl(img);
      }
    }));

    // ── Step 1: stamp each figure's rendered pixel-width onto data-ew
    // The editor content width IS the page width: a figure as wide as it exports
    // at 100% (full page); a half-width figure at 50%.
    const _ecs = getComputedStyle(editor);
    const pageW = (function () {
      const w = editor.clientWidth - parseFloat(_ecs.paddingLeft || 0) - parseFloat(_ecs.paddingRight || 0);
      return w > 0 ? w : 600;
    })();
    editor.querySelectorAll('figure.nb-img').forEach(fig => {
      const liveW = fig.getBoundingClientRect().width;
      const styleW = parseInt(fig.style.width) || 0;
      const w = liveW > 0 ? liveW : styleW > 0 ? styleW : 300;
      fig.dataset.ew = String(Math.round(Math.min(w, pageW)));
      // Stamp the rendered aspect ratio so the Word export can compute a correct
      // absolute height (Word needs explicit px width+height; it ignores % on <img>).
      const im = fig.querySelector('img');
      if (im) {
        const r = im.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          fig.dataset.nw = String(Math.round(r.width));
          fig.dataset.nh = String(Math.round(r.height));
        }
      }
    });

    const cloned = editor.cloneNode(true);

    // Clean up stamped data-* from the live editor
    editor.querySelectorAll('figure.nb-img').forEach(fig => {
      delete fig.dataset.ew; delete fig.dataset.nw; delete fig.dataset.nh;
    });

    // ── Step 2: fix mood-embed textarea values in clone
    cloned.querySelectorAll('.nb-mood-embed').forEach(block => {
      const level = block.dataset.level || '';
      block.querySelectorAll('.nb-mood-btn').forEach(b =>
        b.classList.toggle('selected', b.dataset.level === level)
      );
      const ta = block.querySelector('.nb-mood-note');
      if (ta) {
        const noteText = block.dataset.note || '';
        ta.textContent = noteText;
        ta.setAttribute('value', noteText);
      }
    });

    // ── Step 3: replace every figure with a Word-safe <table> wrapper
    //
    //  CRITICAL: MUST use el.setAttribute('style', ...) — NOT el.style.cssText.
    //  el.style.cssText goes through the browser's CSS parser which silently
    //  strips non-standard properties like mso-pagination, mso-break-type etc.
    //  setAttribute stores the raw string; innerHTML serialisation preserves it
    //  so Word sees the MSO directives it needs.
    cloned.querySelectorAll('figure.nb-img').forEach(fig => {
      const img = fig.querySelector('img');
      if (!img) return;
      // Images export at FULL page width (like the body text) — this is the
      // explicit, repeated requirement. The editor-vs-figure pixel measurement was
      // unreliable (landed ~62%), so we don't derive a percentage from it.
      //
      // PDF/print path: width:100% style → fills the print column (real browser).
      // Word path: Word IGNORES % widths on <img> and falls back to the native
      // pixel size (→ overflow). So we ALSO set an absolute px width via the
      // width/height HTML attributes, which Word honours, sized to the A4 content
      // area (18cm @ 1.5cm margins ≈ 680px) so it fills the page without overflow.
      // Browsers ignore the px attributes because the inline width:100% style wins.
      const WORD_CONTENT_W = 670;
      const absPx = WORD_CONTENT_W;
      const nw = parseInt(fig.dataset.nw) || 0;
      const nh = parseInt(fig.dataset.nh) || 0;
      const absH = (nw > 0 && nh > 0) ? Math.round(absPx * nh / nw) : 0;

      const clonedImg = img.cloneNode(true);
      clonedImg.setAttribute('width', String(absPx));        // px — Word uses this
      if (absH > 0) clonedImg.setAttribute('height', String(absH));
      else clonedImg.removeAttribute('height');
      // Inline 100% style — browsers (PDF/print) use this and ignore the px
      // attribute, so the image is full-width on the printed page.
      clonedImg.setAttribute('style', `width:100%;height:auto;display:block;margin:0 auto;max-width:100%;`);

      // <table> is the only element Word reliably keeps on one page.
      // mso-pagination:widow-orphan keep-together = Word's native "keep together" flag.
      const tbl = document.createElement('table');
      tbl.setAttribute('border', '0');
      tbl.setAttribute('cellpadding', '0');
      tbl.setAttribute('cellspacing', '0');
      tbl.setAttribute('align', 'center');
      tbl.setAttribute('width', '100%');
      tbl.setAttribute('style',          // setAttribute = MSO props survive serialisation
        'page-break-inside:avoid;break-inside:avoid;' +
        'mso-pagination:widow-orphan keep-together;' +
        'border-collapse:collapse;margin:8px 0;');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.setAttribute('align', 'center');
      td.setAttribute('style', 'padding:8px 0;text-align:center;');
      td.appendChild(clonedImg);
      tr.appendChild(td);
      tbl.appendChild(tr);
      fig.replaceWith(tbl);
    });

    // ── Step 4: handle page-spacers and remove UI-only elements
    //
    //  CRITICAL WORD QUIRK: Word only respects page-break-after:always on a <p>
    //  when that <p> is a direct child of <body> (i.e. at the top level of the
    //  content).  If the <p> is nested inside a <div>, Word silently ignores it.
    //
    //  Contenteditable wraps everything in <div> elements (one per line), so
    //  the spacer and its adjacent table both live inside such a <div>.
    //  We must walk up the DOM from the spacer until we find the ancestor that
    //  is a direct child of `cloned` (= the editor root that becomes <body>),
    //  then insert the page-break <p> BEFORE that ancestor — not inside it.
    //
    //  → valid spacer (nextSibling is TABLE)  → lift page-break to top level
    //  → stale spacer (no adjacent TABLE)     → just remove (avoid blank pages)
    cloned.querySelectorAll('.nb-page-spacer').forEach(spacer => {
      const next = spacer.nextElementSibling;

      if (next && next.tagName === 'TABLE') {
        // Build the hard page-break paragraph
        const pb = document.createElement('p');
        pb.setAttribute('style',
          'margin:0;padding:0;line-height:0;font-size:1px;' +
          'page-break-after:always;break-after:page;mso-break-type:page-break;');
        const br = document.createElement('br');
        br.setAttribute('style', 'mso-special-character:line-break;page-break-before:always');
        pb.appendChild(br);

        // Walk up to find the direct child of cloned so we can insert pb at the top level
        let anchor = spacer;
        while (anchor.parentElement && anchor.parentElement !== cloned) {
          anchor = anchor.parentElement;
        }
        // Insert page-break paragraph BEFORE the outermost wrapper div
        (anchor.parentElement || spacer.parentElement).insertBefore(pb, anchor);
        spacer.remove();
      } else {
        spacer.remove(); // stale spacer — would create a blank page if kept
      }
    });
    cloned.querySelectorAll('.nb-img-del').forEach(el => el.remove());

    // ── Step 5: Flatten for Word ─────────────────────────────────────────────
    // contenteditable produces one <div> per line.
    // Rules (applied only to direct children of the editor root):
    //   A) div wrapping an image table → lift table out, convert remainder to <p>
    //   B) empty div (just whitespace/br) → collapse (keep at most 1 per run)
    //   C) plain text div with no block children → convert to <p>
    //   SKIP: divs with class names (nb-mood-embed, etc.) — leave untouched
    //   SKIP: divs that contain nested block elements — leave as div
    const BLOCK_TAGS = new Set(['DIV','TABLE','P','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','FIGURE']);
    const kids = Array.from(cloned.children);
    let blankRun = 0;

    for (const child of kids) {
      if (child.tagName !== 'DIV') { blankRun = 0; continue; }

      // SKIP: divs with a class (mood-embed, etc.) — don't touch them
      if (child.className && child.className.trim()) { blankRun = 0; continue; }

      // A) first child element is our image table → lift it out
      const firstEl = child.firstElementChild;
      if (firstEl && firstEl.tagName === 'TABLE') {
        child.before(firstEl);            // move table before this div
        if (!child.textContent.trim()) {
          child.remove();                 // shell is empty — drop it
        } else {
          // Remaining text after the table → convert shell to <p>
          const p = document.createElement('p');
          p.setAttribute('dir', 'rtl');
          p.setAttribute('style', 'margin:3px 0;');
          while (child.firstChild) p.appendChild(child.firstChild);
          child.replaceWith(p);
        }
        blankRun = 0;
        continue;
      }

      // B) empty div → collapse consecutive blank lines (max 1 kept)
      if (!child.textContent.trim()) {
        blankRun++;
        if (blankRun > 1) { child.remove(); continue; }
        const ep = document.createElement('p');
        ep.setAttribute('style', 'margin:0;line-height:1;');
        child.replaceWith(ep);
        continue;
      }

      // C) div with text but no nested block elements → safe to convert to <p>
      blankRun = 0;
      const hasBlock = Array.from(child.children).some(c => BLOCK_TAGS.has(c.tagName));
      if (!hasBlock) {
        const p = document.createElement('p');
        p.setAttribute('dir', 'rtl');
        const cs = child.getAttribute('style') || '';
        p.setAttribute('style', cs + (cs ? ';' : '') + 'margin:3px 0;');
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
      }
      // div with block children → leave as-is (Word handles it)
    }

    const body = cloned.innerHTML;

    const baseStyles = `
      @page Section1{size:595.3pt 841.9pt;margin:1.5cm 1.5cm 1.5cm 1.5cm;mso-header-margin:35.4pt;mso-footer-margin:35.4pt;mso-paper-source:0;}
      div.Section1{page:Section1;}
      body{font-family:Arial,sans-serif;font-size:11pt;direction:rtl;padding:0;margin:0;color:#3b3a3a;}
      p,li,td,div{font-size:11pt;line-height:1.6;}
      img{max-width:100%;height:auto;}
      h1{font-size:28px;margin-bottom:24px;}
      table[align="center"]{border-collapse:collapse;page-break-inside:avoid;mso-pagination:widow-orphan keep-together;}
      table[align="center"] td{text-align:center;padding:8px 0;}
      .nb-mood-embed{border:2px solid #f0c4cc;border-radius:12px;padding:16px;margin:16px 0;background:#fffaf8;}
      .nb-mood-embed-header{font-weight:600;font-size:12px;color:#888;letter-spacing:.05em;margin-bottom:10px;}
      .nb-mood-embed-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px;}
      .nb-mood-embed-q{font-size:15px;font-weight:500;}
      .nb-mood-btn{width:36px;height:36px;border-radius:50%;background:#f5f0ea;font-size:20px;border:1px solid #ddd;cursor:default;}
      .nb-mood-btn.selected{background:#fadadd;border-color:#e5a8b0;box-shadow:0 2px 6px rgba(0,0,0,.12);}
      .nb-mood-note{width:100%;border:1px solid #ddd;border-radius:8px;padding:8px 12px;font-family:Arial,sans-serif;resize:none;box-sizing:border-box;min-height:60px;}`;

    // ── PDF export ────────────────────────────────────────────────────────────
    // Strategy: inject a hidden print-only layer into the current page.
    // ── PDF export: the browser's own Save-as-PDF (reliable RTL + images +
    // selectable text). Opened DIRECTLY — no instruction modal. (html2pdf /
    // html2canvas produced blank pages, so we don't use it.)
    if (format === 'pdf') {
      App.toast('יוצר PDF…');
      try {
        // Real PDF file, auto-downloaded as "<notebook>.pdf" — no Save dialog.
        await exportPdfFile(title, body);
        App.toast('✓ קובץ PDF הורד: ' + title);
      } catch (e) {
        // CDN blocked / lib error → fall back to the browser's Save-as-PDF.
        console.warn('PDF auto-download failed, falling back to print:', e);
        exportPdfViaPrint(title, body);
      }
      return;
    }

    // ── Word export ───────────────────────────────────────────────────────────
    if (format === 'word') {
      const html = [
        `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
        ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
        ` xmlns='http://www.w3.org/TR/REC-html40'>`,
        `<head><meta charset='utf-8'><title>${title}</title>`,
        `<style>${baseStyles}</style></head>`,
        `<body dir="rtl" style="font-size:11pt;font-family:Arial,sans-serif;"><div class="Section1"><h1>${title}</h1>${body}</div></body></html>`
      ].join('');
      const blob = new Blob(['﻿', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = title + '.doc'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      App.toast('✓ קובץ Word הורד');
    }
  }
  window.nbExport = { openTemplateGallery: openTemplateGallery, openMoodModal: openMoodModal, showExportDialog: showExportDialog };
})();