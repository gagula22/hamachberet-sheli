(function () {
  'use strict';
  // ============================================================================
  // tripmap/planner-ui.js — אשף הבחירות + מסך התוכנית של מתכנן-הטיולים העצמאי
  // ----------------------------------------------------------------------------
  // בעלות: סוכן F בלבד. namespace: window.TripPlannerUI.
  // צורך את window.TripPlannerEngine (plan) ו-window.TripPlannerData (כרטיסים).
  // ממשק מקובע ב-CONTRACT.md:
  //   TripPlannerUI.open({ onSave:function(trip, doc){} })   // אשף מלא במודאל
  //   TripPlannerUI.showDoc(doc)                             // הצגת מסמך שמור
  // ✕ / ESC / קליק-רקע. RTL, עברית. prefix: tp-. עיצוב ב-css/features/tripplanner.css.
  // משחזר את נוסחי/סדר הסקיל trip-planner-metakhnen-tiyulim כרכיבי UI.
  // ============================================================================

  // ── עזרי DOM ────────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'text') n.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          n.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) n.setAttribute(k, '');
        else if (v !== false) n.setAttribute(k, v);
      });
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function nis(v) {
    var n = Math.round(Number(v) || 0);
    return n.toLocaleString('he-IL') + ' ₪';
  }

  function toast(msg) {
    if (window.App && typeof window.App.toast === 'function') window.App.toast(msg);
  }

  var MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  // ── תשתית מודאל (✕ / ESC / קליק-רקע) ────────────────────────────────────────
  function buildModal(opts) {
    opts = opts || {};
    var overlay = el('div', { class: 'tp-overlay', role: 'dialog', 'aria-modal': 'true' });
    var head = el('div', { class: 'tp-head' });
    var titleEl = el('h2', { class: 'tp-title' }, opts.title || '');
    var closeBtn = el('button', { class: 'tp-close', type: 'button', title: 'סגירה', 'aria-label': 'סגירה' }, '✕');
    head.appendChild(titleEl);
    head.appendChild(closeBtn);
    var body = el('div', { class: 'tp-body' });
    var box = el('div', { class: 'tp-modal' }, [head, body]);
    overlay.appendChild(box);

    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.add('tp-leaving');
      var t = setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 180);
      overlay.addEventListener('transitionend', function () { clearTimeout(t); if (overlay.parentNode) overlay.remove(); }, { once: true });
      if (typeof opts.onClose === 'function') opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);

    return {
      overlay: overlay, body: body, close: close,
      setTitle: function (t) { titleEl.textContent = t; }
    };
  }

  // הודעת כשל ידידותית בתוך מודאל (במקום קריסה)
  function openFailModal(title, message) {
    var m = buildModal({ title: title || 'אופס' });
    m.body.appendChild(el('div', { class: 'tp-empty' }, [
      el('div', { class: 'tp-empty-emoji' }, '🧭'),
      el('p', {}, message || 'משהו השתבש. נסו שוב מאוחר יותר.')
    ]));
    return m;
  }

  // ── רכיבי בחירה כלליים ───────────────────────────────────────────────────────

  // קבוצת כפתורי-בחירה (single/multi). options: [{value,label,sub?,emoji?}]
  function choiceGroup(options, opts) {
    opts = opts || {};
    var multi = !!opts.multi;
    var state = { value: multi ? (opts.value || []) : (opts.value != null ? opts.value : null) };
    var wrap = el('div', { class: 'tp-choices' + (opts.compact ? ' tp-choices-compact' : '') });
    var btns = [];

    function isSel(v) { return multi ? state.value.indexOf(v) !== -1 : state.value === v; }
    function refresh() {
      btns.forEach(function (b) { b.classList.toggle('tp-sel', isSel(b.dataset.val)); });
    }
    options.forEach(function (o) {
      var inner = [];
      if (o.emoji) inner.push(el('span', { class: 'tp-choice-emoji' }, o.emoji));
      inner.push(el('span', { class: 'tp-choice-label' }, o.label));
      if (o.sub) inner.push(el('span', { class: 'tp-choice-sub' }, o.sub));
      var b = el('button', { class: 'tp-choice', type: 'button' }, inner);
      b.dataset.val = o.value;
      b.addEventListener('click', function () {
        if (multi) {
          var i = state.value.indexOf(o.value);
          if (i === -1) state.value.push(o.value); else state.value.splice(i, 1);
        } else {
          state.value = o.value;
        }
        refresh();
        if (typeof opts.onChange === 'function') opts.onChange(state.value);
      });
      btns.push(b); wrap.appendChild(b);
    });
    refresh();
    return { node: wrap, get: function () { return state.value; }, set: function (v) { state.value = v; refresh(); } };
  }

  // סליידר טווח עם תווית חיה
  function rangeField(opts) {
    opts = opts || {};
    var val = opts.value != null ? opts.value : opts.min;
    var out = el('output', { class: 'tp-range-out' }, (opts.format ? opts.format(val) : String(val)));
    var input = el('input', {
      class: 'tp-range', type: 'range',
      min: opts.min, max: opts.max, step: opts.step || 1, value: val
    });
    input.addEventListener('input', function () {
      val = parseInt(input.value, 10);
      out.textContent = opts.format ? opts.format(val) : String(val);
    });
    var row = el('div', { class: 'tp-range-row' }, [input, out]);
    return { node: row, get: function () { return parseInt(input.value, 10); } };
  }

  // שדה מספרי (₪)
  function numberField(opts) {
    opts = opts || {};
    var input = el('input', {
      class: 'tp-num', type: 'number', inputmode: 'numeric',
      min: opts.min != null ? opts.min : 0, step: opts.step || 100,
      placeholder: opts.placeholder || '', value: opts.value != null ? opts.value : ''
    });
    var wrap = el('div', { class: 'tp-num-wrap' }, [
      el('span', { class: 'tp-num-affix' }, opts.affix || '₪'),
      input
    ]);
    return { node: wrap, get: function () { var v = parseInt(input.value, 10); return isFinite(v) ? v : null; } };
  }

  // בלוק שאלה: כותרת + רכיב
  function question(label, controlNode, opts) {
    opts = opts || {};
    return el('div', { class: 'tp-q' + (opts.required ? ' tp-q-req' : '') }, [
      el('label', { class: 'tp-q-label' }, [
        label,
        opts.required ? el('span', { class: 'tp-req-star', title: 'שדה חובה' }, ' *') : null
      ]),
      opts.hint ? el('div', { class: 'tp-q-hint' }, opts.hint) : null,
      controlNode
    ]);
  }

  // בורר גילאי ילדים (מוסיף/מסיר צ'יפים)
  function kidsAgesField() {
    var ages = [];
    var chips = el('div', { class: 'tp-kid-chips' });
    var input = el('input', { class: 'tp-kid-input', type: 'number', min: '0', max: '17', placeholder: 'גיל ילד/ה' });
    var addBtn = el('button', { class: 'tp-kid-add', type: 'button' }, '+ הוסף');

    function render() {
      clear(chips);
      ages.forEach(function (a, idx) {
        var chip = el('span', { class: 'tp-kid-chip' }, [
          'גיל ' + a,
          el('button', { class: 'tp-kid-x', type: 'button', title: 'הסרה', 'aria-label': 'הסרה' }, '✕')
        ]);
        chip.querySelector('.tp-kid-x').addEventListener('click', function () { ages.splice(idx, 1); render(); });
        chips.appendChild(chip);
      });
      if (!ages.length) chips.appendChild(el('span', { class: 'tp-kid-empty' }, 'הוסיפו גיל לכל ילד/ה'));
    }
    function add() {
      var v = parseInt(input.value, 10);
      if (isFinite(v) && v >= 0 && v <= 17) { ages.push(v); input.value = ''; render(); }
      input.focus();
    }
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    render();
    var node = el('div', { class: 'tp-kids' }, [
      el('div', { class: 'tp-kid-row' }, [input, addBtn]),
      chips
    ]);
    return { node: node, get: function () { return ages.slice(); } };
  }

  // ── הרכב נוסעים (משותף לכל המסלולים) — מחזיר {type, kidsAges, getNode} ──────
  // שדה עיר-מוצא: input חופשי + datalist מערי המוצא של המאגר. זוכר את הבחירה
  // האחרונה ב-localStorage כך שעיר המגורים נשמרת בין טיולים.
  var ORIGIN_LS = 'tripmap.originCity';
  function originField(cities) {
    var listId = 'tp-origin-list';
    var dl = el('datalist', { id: listId });
    (cities || []).forEach(function (c) { dl.appendChild(el('option', { value: c.name })); });
    var saved = '';
    try { saved = window.localStorage.getItem(ORIGIN_LS) || ''; } catch (e) {}
    var input = el('input', {
      class: 'tp-origin-input', type: 'text', list: listId,
      placeholder: 'עיר המגורים שלכם', autocomplete: 'off', value: saved
    });
    var wrap = el('div', { class: 'tp-origin-wrap' }, [el('span', { class: 'tp-origin-pin' }, '🏠'), input, dl]);
    return {
      node: wrap,
      get: function () {
        var name = input.value.trim();
        if (!name) return null;
        try { window.localStorage.setItem(ORIGIN_LS, name); } catch (e) {}
        var match = (cities || []).filter(function (c) {
          return c.name === name || c.name.indexOf(name) === 0 || name.indexOf(c.name) === 0;
        })[0];
        return match ? { name: match.name, lat: match.lat, lng: match.lng } : { name: name };
      }
    };
  }

  function compositionBlock(opts) {
    opts = opts || {};
    var labels = opts.labels || {
      couple: 'זוג', family: 'משפחה', friends: 'חברים', solo: 'סולו'
    };
    var emojis = { couple: '💑', family: '👨‍👩‍👧', friends: '👯', solo: '🎒' };
    var kids = kidsAgesField();
    var kidsWrap = el('div', { class: 'tp-kids-wrap', hidden: true }, [
      el('div', { class: 'tp-q-hint' }, 'גילאי הילדים עוזרים להתאים מסלולים ובטיחות'),
      kids.node
    ]);
    var group = choiceGroup([
      { value: 'couple', label: labels.couple, emoji: emojis.couple },
      { value: 'family', label: labels.family, emoji: emojis.family },
      { value: 'friends', label: labels.friends, emoji: emojis.friends },
      { value: 'solo', label: labels.solo, emoji: emojis.solo }
    ], {
      value: opts.value || null,
      onChange: function (v) { kidsWrap.hidden = (v !== 'family'); }
    });
    var node = el('div', {}, [group.node, kidsWrap]);
    return {
      node: node,
      type: function () { return group.get(); },
      kidsAges: function () { return kids.get(); }
    };
  }

  // ── עזרי תרגום ערכים → עברית לתצוגה ──────────────────────────────────────────
  function styleHe(s) {
    return { nature: 'טבע ושבילים', attractions: 'אטרקציות ובילויים', food: 'אוכל ויין', mixed: 'מעורב' }[s] || s;
  }

  // ============================================================================
  // האשף — open({onSave})
  // ============================================================================
  function open(cfg) {
    cfg = cfg || {};
    var onSave = typeof cfg.onSave === 'function' ? cfg.onSave : function () {};

    // עמידות: תלות חסרה → הודעה ידידותית במקום קריסה
    if (!window.TripPlannerEngine || typeof window.TripPlannerEngine.plan !== 'function' || !window.TripPlannerData) {
      openFailModal('מתכנן הטיולים', 'מתכנן הטיולים עדיין לא מוכן (רכיב חסר). רעננו את הדף ונסו שוב — ושאר האפליקציה ממשיכה לעבוד כרגיל.');
      return;
    }

    var modal = buildModal({ title: '🧳 מתכנן הטיולים' });
    var DATA = window.TripPlannerData;

    // מצב האשף
    var st = { step: 1, kind: null, controls: {}, lastResult: null, lastParams: null, surpriseDest: null, carry: null };

    // מיכל גוף + פס התקדמות
    var progress = el('div', { class: 'tp-progress' });
    var stage = el('div', { class: 'tp-stage' });
    modal.body.appendChild(progress);
    modal.body.appendChild(stage);

    function renderProgress() {
      clear(progress);
      var steps = ['מה מתכננים?', 'פרטי הטיול', 'התוכנית'];
      var bar = el('div', { class: 'tp-steps' });
      steps.forEach(function (label, i) {
        var n = i + 1;
        bar.appendChild(el('div', {
          class: 'tp-step' + (st.step === n ? ' tp-step-cur' : '') + (st.step > n ? ' tp-step-done' : '')
        }, [
          el('span', { class: 'tp-step-dot' }, st.step > n ? '✓' : String(n)),
          el('span', { class: 'tp-step-label' }, label)
        ]));
      });
      progress.appendChild(bar);
    }

    function transitionTo(renderFn) {
      stage.classList.remove('tp-fade-in');
      // reflow כדי שהאנימציה תתחיל מחדש
      void stage.offsetWidth;
      clear(stage);
      renderFn();
      stage.classList.add('tp-fade-in');
      stage.scrollTop = 0;
    }

    function go(step) { st.step = step; renderProgress(); render(); }

    function render() {
      renderProgress();
      if (st.step === 1) transitionTo(renderStep1);
      else if (st.step === 2) transitionTo(renderStep2);
      else transitionTo(renderStep3);
    }

    // ── מסך 1: מה מתכננים? ─────────────────────────────────────────────────────
    function renderStep1() {
      var intro = el('p', { class: 'tp-lead' }, 'תכננו טיול מושלם בלי לפתוח 47 טאבים. בחרו מה מתכננים — ונבנה תוכנית יום-יום, תקציב וציוד.');
      var cards = el('div', { class: 'tp-kind-grid' });
      [
        { kind: 'israel', emoji: '🇮🇱', title: 'טיול בארץ', sub: 'צפון, דרום, מרכז, ירושלים — או "תציעו לי"' },
        { kind: 'abroad', emoji: '✈️', title: 'טיול בחו"ל', sub: 'יעד ספציפי או "עזרו לי לבחור"' },
        { kind: 'getaway', emoji: '🏖️', title: 'חופשה קצרה', sub: 'סופ"ש או חופשת חג (1-3 לילות)' },
        { kind: 'surprise', emoji: '🎲', title: 'הפתע אותי', sub: 'יעד לפי תקציב, עונה והעדפות' }
      ].forEach(function (c) {
        var card = el('button', { class: 'tp-kind-card', type: 'button' }, [
          el('span', { class: 'tp-kind-emoji' }, c.emoji),
          el('span', { class: 'tp-kind-title' }, c.title),
          el('span', { class: 'tp-kind-sub' }, c.sub)
        ]);
        card.addEventListener('click', function () {
          st.kind = c.kind; st.controls = {}; st.surpriseDest = null; st.carry = null;
          go(2);
        });
        cards.appendChild(card);
      });
      stage.appendChild(intro);
      stage.appendChild(cards);
    }

    // ── מסך 2: שאלות לפי המסלול ─────────────────────────────────────────────────
    function renderStep2() {
      var form = el('div', { class: 'tp-form' });
      var c = st.controls = {};

      if (st.kind === 'israel') buildIsraelForm(form, c);
      else if (st.kind === 'abroad') buildAbroadForm(form, c);
      else if (st.kind === 'getaway') buildGetawayForm(form, c);
      else buildSurpriseForm(form, c);

      stage.appendChild(form);

      // ניווט
      var err = el('div', { class: 'tp-form-err', role: 'alert' });
      var nav = el('div', { class: 'tp-nav' }, [
        el('button', { class: 'tp-btn tp-btn-ghost', type: 'button', onClick: function () { go(1); } }, '→ חזרה'),
        el('button', {
          class: 'tp-btn tp-btn-primary', type: 'button',
          onClick: function () { submitStep2(err); }
        }, st.kind === 'surprise' ? 'הצע יעדים ✨' : (st.kind === 'getaway' ? 'הצע אופציות ✨' : 'בנה תוכנית ✨'))
      ]);
      stage.appendChild(err);
      stage.appendChild(nav);
    }

    // אזור — כולל "תציעו לי"
    function regionChoices() {
      var opts = DATA.regions.map(function (r) { return { value: r.id, label: r.name }; });
      opts.unshift({ value: 'suggest', label: 'תציעו לי', emoji: '✨' });
      return opts;
    }

    var BUDGET_LEVELS = [
      { value: 'free', label: 'חינם', sub: 'קמפינג / לינת שטח' },
      { value: 'budget', label: 'זול', sub: 'צימר עד ₪500' },
      { value: 'mid', label: 'בינוני', sub: '₪500–1,000' },
      { value: 'premium', label: 'פרימיום', sub: '₪1,000+' }
    ];
    var STYLES = [
      { value: 'nature', label: 'טבע ושבילים', emoji: '🌿' },
      { value: 'attractions', label: 'אטרקציות ובילויים', emoji: '🎡' },
      { value: 'food', label: 'אוכל ויין', emoji: '🍷' },
      { value: 'mixed', label: 'מעורב', emoji: '✨' }
    ];

    function monthChoices() {
      return MONTHS_HE.map(function (m, i) { return { value: String(i + 1), label: m }; });
    }

    function buildIsraelForm(form, c) {
      c.origin = originField(DATA.originCities || []);
      form.appendChild(question('1. מאיפה יוצאים?', c.origin.node, { hint: 'עיר המגורים — לפיה נחשב את הנסיעה לאזור (נשמרת לפעם הבאה)' }));

      c.region = choiceGroup(regionChoices(), {});
      form.appendChild(question('2. אזור', c.region.node, { required: true }));

      c.days = rangeField({ min: 1, max: 7, value: 3, format: function (v) { return v + (v === 1 ? ' יום' : ' ימים'); } });
      form.appendChild(question('3. כמה ימים', c.days.node));

      c.comp = compositionBlock({});
      form.appendChild(question('4. הרכב', c.comp.node, { required: true }));

      c.budget = choiceGroup(BUDGET_LEVELS, {});
      form.appendChild(question('5. תקציב לינה', c.budget.node, { required: true }));

      c.style = choiceGroup(STYLES, {});
      form.appendChild(question('6. סגנון', c.style.node, { required: true }));

      c.month = choiceGroup(monthChoices(), { compact: true });
      form.appendChild(question('7. חודש נסיעה', c.month.node, { hint: 'משפיע על עונה, מסלולי מים ומזג אוויר' }));
    }

    function buildAbroadForm(form, c) {
      // יעד — כרטיסים מ-DATA.abroad.destinations + "עזרו לי לבחור"
      var destWrap = el('div', { class: 'tp-dest-grid' });
      var destState = { value: st.surpriseDest || null };
      function refreshDest() {
        Array.prototype.forEach.call(destWrap.children, function (ch) {
          ch.classList.toggle('tp-sel', ch.dataset.val === destState.value);
        });
      }
      (DATA.abroad && DATA.abroad.destinations || []).forEach(function (d) {
        var card = el('button', { class: 'tp-dest-card', type: 'button' }, [
          el('span', { class: 'tp-dest-name' }, d.name),
          el('span', { class: 'tp-dest-why' }, d.why || ''),
          el('span', { class: 'tp-dest-meta' }, (d.currency || '') + (d.timeDiff ? ' · ' + d.timeDiff : ''))
        ]);
        card.dataset.val = d.id;
        card.addEventListener('click', function () { destState.value = d.id; refreshDest(); });
        destWrap.appendChild(card);
      });
      var helpBtn = el('button', { class: 'tp-btn tp-btn-soft tp-help-choose', type: 'button' }, '🎲 עזרו לי לבחור');
      helpBtn.addEventListener('click', function () {
        // קופץ למסלול ההפתעה
        st.kind = 'surprise'; st.controls = {}; render();
      });
      refreshDest();
      c.destination = { get: function () { return destState.value; } };
      form.appendChild(question('1. יעד', el('div', {}, [destWrap, helpBtn]), { required: true }));

      // הגעה ממסלול "הפתע אותי" → ממלאים מראש את מה שכבר נבחר שם
      var carry = st.carry || {};

      c.days = rangeField({ min: 3, max: 14, value: carry.days || 5, format: function (v) { return v + ' ימים'; } });
      form.appendChild(question('2. כמה ימים', c.days.node));

      c.comp = compositionBlock({ value: carry.composition && carry.composition.type });
      form.appendChild(question('3. הרכב', c.comp.node, { required: true }));

      c.budgetTotal = numberField({ placeholder: 'תקציב כולל לאדם', step: 500, value: carry.budgetTotal || null });
      c.budgetFlights = choiceGroup([
        { value: 'incl', label: 'כולל טיסות' },
        { value: 'excl', label: 'ללא טיסות' }
      ], { value: 'incl', compact: true });
      form.appendChild(question('4. תקציב כולל (לאדם)', el('div', { class: 'tp-budget-row' }, [c.budgetTotal.node, c.budgetFlights.node]),
        { hint: 'אופציונלי — עוזר לסנן יעדים בהפתעה ולהשוות לטבלת התקציב' }));

      c.style = choiceGroup(STYLES, {});
      form.appendChild(question('5. סגנון', c.style.node, { required: true }));

      c.kosher = choiceGroup([{ value: 'yes', label: 'חשובה לי כשרות', emoji: '✡️' }], { multi: true, compact: true });
      form.appendChild(question('6. דרישות', c.kosher.node, { hint: 'אופציונלי' }));

      c.month = choiceGroup(monthChoices(), { compact: true, value: carry.month ? String(carry.month) : null });
      form.appendChild(question('7. חודש נסיעה', c.month.node, { hint: 'משפיע על מחיר הטיסה ועל העונה' }));
    }

    function buildGetawayForm(form, c) {
      c.nights = choiceGroup([
        { value: '1', label: 'לילה' }, { value: '2', label: 'לילתיים' }, { value: '3', label: '3 לילות' }
      ], { compact: true });
      form.appendChild(question('1. כמה לילות', c.nights.node, { required: true }));

      c.distance = choiceGroup([
        { value: 'hour', label: 'עד שעה' }, { value: 'two', label: 'עד שעתיים' }, { value: 'any', label: 'לא משנה' }
      ], { compact: true });
      form.appendChild(question('2. מרחק מהבית', c.distance.node));

      c.comp = compositionBlock({
        labels: { couple: 'זוג רומנטי', family: 'משפחה', friends: 'חברים', solo: 'סולו' }
      });
      form.appendChild(question('3. הרכב', c.comp.node, { required: true }));

      c.budget = choiceGroup([
        { value: 'budget', label: 'עד ₪500', sub: 'ללילה' },
        { value: 'mid', label: 'עד ₪1,000', sub: 'ללילה' },
        { value: 'premium', label: '₪1,000+', sub: 'ללילה' }
      ], {});
      form.appendChild(question('4. תקציב ללילה', c.budget.node, { required: true }));

      c.important = choiceGroup([
        { value: 'pool', label: 'בריכה/ג\'קוזי', emoji: '🛁' },
        { value: 'nature', label: 'טבע', emoji: '🌲' },
        { value: 'food', label: 'אוכל', emoji: '🍽️' },
        { value: 'quiet', label: 'שקט מוחלט', emoji: '🤫' }
      ], { multi: true });
      form.appendChild(question('5. מה חשוב לך', c.important.node, { hint: 'אפשר לבחור כמה' }));

      c.month = choiceGroup(monthChoices(), { compact: true });
      form.appendChild(question('6. חודש (אופציונלי)', c.month.node));
    }

    function buildSurpriseForm(form, c) {
      c.budgetTotal = choiceGroup([
        { value: '3000', label: 'עד ₪3,000', sub: 'לאדם, כולל טיסה' },
        { value: '5000', label: 'עד ₪5,000', sub: 'לאדם, כולל טיסה' },
        { value: '8000', label: 'עד ₪8,000', sub: 'לאדם, כולל טיסה' },
        { value: '99000', label: '₪8,000+', sub: 'בלי תקרה' }
      ], {});
      form.appendChild(question('1. תקציב לאדם (כולל טיסה)', c.budgetTotal.node, { required: true }));

      c.days = rangeField({ min: 3, max: 14, value: 5, format: function (v) { return v + ' ימים'; } });
      form.appendChild(question('2. כמה ימים', c.days.node));

      c.comp = compositionBlock({});
      form.appendChild(question('3. הרכב', c.comp.node, { required: true }));

      c.month = choiceGroup(monthChoices(), { compact: true });
      form.appendChild(question('4. תקופה (חודש)', c.month.node, { hint: 'משפיע על מחיר הטיסה ועל מה שמתאים', required: true }));

      c.avoid = choiceGroup([
        { value: 'heat', label: 'חום קיצוני', emoji: '🥵' },
        { value: 'long', label: 'טיסה ארוכה', emoji: '🛫' },
        { value: 'cold', label: 'קור', emoji: '🥶' }
      ], { multi: true });
      form.appendChild(question('5. מה לא רוצה', c.avoid.node, { hint: 'אופציונלי' }));
    }

    // ── איסוף params + ולידציה עדינה ────────────────────────────────────────────
    function buildParams(seed) {
      var c = st.controls, p = { kind: st.kind };
      if (seed != null) p.seed = seed;

      if (st.kind === 'israel') {
        var reg = c.region.get();
        p.region = reg;
        if (c.origin) { var og = c.origin.get(); if (og) p.origin = og; }
        p.days = c.days.get();
        p.composition = { type: c.comp.type(), kidsAges: c.comp.kidsAges() };
        p.budgetLevel = c.budget.get();
        p.style = c.style.get();
        if (c.month.get()) p.month = +c.month.get();
      } else if (st.kind === 'abroad') {
        p.destination = c.destination.get();
        p.days = c.days.get();
        p.composition = { type: c.comp.type(), kidsAges: c.comp.kidsAges() };
        var bt = c.budgetTotal.get();
        if (bt != null) p.budgetTotal = bt;
        p.style = c.style.get();
        if (c.kosher.get().length) { p.kosher = true; p.important = 'kosher'; }
        if (c.month.get()) p.month = +c.month.get();
      } else if (st.kind === 'getaway') {
        p.nights = +(c.nights.get() || 2);
        p.days = p.nights + 1;
        p.region = c.distance.get() === 'hour' ? 'hour' : null;
        p.composition = { type: c.comp.type(), kidsAges: c.comp.kidsAges() };
        p.budgetLevel = c.budget.get();
        var imp = c.important.get();
        if (imp.indexOf('pool') !== -1) p.important = 'pool';
        else if (imp.indexOf('nature') !== -1) p.important = 'nature';
        else if (imp.indexOf('food') !== -1) { p.important = 'food'; p.style = 'food'; }
        else if (imp.indexOf('quiet') !== -1) p.important = 'quiet';
        if (c.month.get()) p.month = +c.month.get();
      } else { // surprise
        var b = +(c.budgetTotal.get() || 0);
        if (b && b < 99000) p.budgetTotal = b;
        p.days = c.days.get();
        p.composition = { type: c.comp.type(), kidsAges: c.comp.kidsAges() };
        if (c.month.get()) p.month = +c.month.get();
        var av = c.avoid.get(), avTxt = [];
        if (av.indexOf('heat') !== -1) avTxt.push('חום');
        if (av.indexOf('long') !== -1) avTxt.push('טיסה ארוכה');
        if (av.indexOf('cold') !== -1) avTxt.push('קור');
        if (avTxt.length) p.avoid = avTxt.join(', ');
      }
      return p;
    }

    function validate() {
      var c = st.controls, miss = [];
      if (st.kind === 'israel') {
        if (!c.region.get()) miss.push('בחרו אזור');
        if (!c.comp.type()) miss.push('בחרו הרכב');
        if (!c.budget.get()) miss.push('בחרו תקציב לינה');
        if (!c.style.get()) miss.push('בחרו סגנון');
      } else if (st.kind === 'abroad') {
        if (!c.destination.get()) miss.push('בחרו יעד (או "עזרו לי לבחור")');
        if (!c.comp.type()) miss.push('בחרו הרכב');
        if (!c.style.get()) miss.push('בחרו סגנון');
      } else if (st.kind === 'getaway') {
        if (!c.nights.get()) miss.push('בחרו כמה לילות');
        if (!c.comp.type()) miss.push('בחרו הרכב');
        if (!c.budget.get()) miss.push('בחרו תקציב ללילה');
      } else {
        if (!c.budgetTotal.get()) miss.push('בחרו תקציב');
        if (!c.comp.type()) miss.push('בחרו הרכב');
        if (!c.month.get()) miss.push('בחרו תקופה');
      }
      return miss;
    }

    function submitStep2(errNode) {
      var miss = validate();
      if (miss.length) {
        errNode.textContent = 'כדי להמשיך: ' + miss.join(' · ');
        errNode.classList.add('tp-shake');
        setTimeout(function () { errNode.classList.remove('tp-shake'); }, 500);
        return;
      }
      errNode.textContent = '';
      runPlan(null);
    }

    function runPlan(seed) {
      var params = buildParams(seed);
      st.lastParams = params;
      try {
        st.lastResult = window.TripPlannerEngine.plan(params);
        go(3);
      } catch (e) {
        var m = (e && e.message) ? e.message : 'לא הצלחנו לבנות תוכנית כרגע.';
        var errNode = stage.querySelector('.tp-form-err');
        if (errNode) errNode.textContent = m;
        else { st.step = 3; renderProgress(); transitionTo(function () { renderPlanError(m); }); }
      }
    }

    function renderPlanError(msg) {
      stage.appendChild(el('div', { class: 'tp-empty' }, [
        el('div', { class: 'tp-empty-emoji' }, '😕'),
        el('p', {}, msg),
        el('button', { class: 'tp-btn tp-btn-primary', type: 'button', onClick: function () { go(2); } }, '→ חזרה לשאלות')
      ]));
    }

    // ── מסך 3: תוצאה ─────────────────────────────────────────────────────────────
    function renderStep3() {
      var res = st.lastResult;
      if (!res) { renderPlanError('אין תוצאה להצגה.'); return; }
      if (res.kind === 'israel') renderIsraelResult(res);
      else if (res.kind === 'abroad') renderAbroadResult(res);
      else if (res.kind === 'getaway') renderGetawayResult(res);
      else if (res.kind === 'surprise') renderSurpriseResult(res);
      else renderPlanError('סוג תוצאה לא מוכר.');
    }

    function resultNav(extraButtons) {
      var btns = [el('button', { class: 'tp-btn tp-btn-ghost', type: 'button', onClick: function () { go(2); } }, '→ חזרה לשאלות')];
      // "תוכנית אחרת" — seed שונה
      btns.push(el('button', {
        class: 'tp-btn tp-btn-soft', type: 'button',
        onClick: function () { runPlan(Math.floor(Math.random() * 1e9)); }
      }, '🔄 תוכנית אחרת'));
      (extraButtons || []).forEach(function (b) { btns.push(b); });
      return el('div', { class: 'tp-nav tp-nav-result' }, btns);
    }

    function renderIsraelResult(res) {
      var docNode = renderDoc(res.doc);
      stage.appendChild(docNode);
      var saveBtn = el('button', { class: 'tp-btn tp-btn-primary', type: 'button' }, '🗺️ שמור והצג על המפה');
      saveBtn.addEventListener('click', function () {
        var trip = res.trip || {};
        trip.doc = res.doc;
        onSave(trip, res.doc);
        toast('🗺️ הטיול נשמר ומוצג על המפה');
        modal.close();
      });
      stage.appendChild(resultNav(docActionButtons(docNode, res.doc).concat([saveBtn])));
    }

    function renderAbroadResult(res) {
      var docNode = renderDoc(res.doc);
      stage.appendChild(docNode);
      var saveBtn = el('button', { class: 'tp-btn tp-btn-primary', type: 'button' }, '💾 שמור תוכנית');
      saveBtn.addEventListener('click', function () {
        var doc = res.doc;
        var trip = { title: doc.title, region: (doc.title || '').split(' — ')[0], days: [], doc: doc };
        onSave(trip, doc);
        toast('💾 תוכנית החו"ל נשמרה');
        modal.close();
      });
      stage.appendChild(resultNav(docActionButtons(docNode, res.doc).concat([saveBtn])));
    }

    function renderGetawayResult(res) {
      stage.appendChild(el('p', { class: 'tp-lead' }, '3 אופציות לפי התקציב והדרישות שלך — בחרו אחת לצפייה מלאה ושמירה.'));
      var grid = el('div', { class: 'tp-options-grid' });
      (res.options || []).forEach(function (opt, idx) {
        var badge = ['💸', '⚖️', '👑'][idx] || '🏨';
        var card = el('div', { class: 'tp-option-card' }, [
          el('div', { class: 'tp-option-badge' }, badge),
          el('div', { class: 'tp-option-title' }, opt.title),
          el('div', { class: 'tp-option-lodging' }, opt.lodging || ''),
          el('p', { class: 'tp-option-overview' }, (opt.doc && opt.doc.overview) || ''),
          el('button', { class: 'tp-btn tp-btn-primary tp-btn-block', type: 'button' }, 'בחר אופציה זו →')
        ]);
        card.querySelector('button').addEventListener('click', function () {
          // פתח doc + שמירה
          transitionTo(function () { renderGetawayChosen(opt); });
        });
        grid.appendChild(card);
      });
      stage.appendChild(grid);
      stage.appendChild(resultNav([]));
    }

    function renderGetawayChosen(opt) {
      var docNode = renderDoc(opt.doc);
      stage.appendChild(docNode);
      var saveBtn = el('button', { class: 'tp-btn tp-btn-primary', type: 'button' }, '💾 שמור תוכנית');
      saveBtn.addEventListener('click', function () {
        var doc = opt.doc;
        var trip = { title: doc.title, region: opt.lodging || '', days: [], doc: doc };
        onSave(trip, doc);
        toast('💾 התוכנית נשמרה');
        modal.close();
      });
      var back = el('button', { class: 'tp-btn tp-btn-ghost', type: 'button', onClick: function () { transitionTo(function () { renderGetawayResult(st.lastResult); }); } }, '→ חזרה לאופציות');
      stage.appendChild(el('div', { class: 'tp-nav tp-nav-result' }, [back].concat(docActionButtons(docNode, opt.doc)).concat([saveBtn])));
    }

    function renderSurpriseResult(res) {
      stage.appendChild(el('p', { class: 'tp-lead' }, '3 יעדים מפתיעים בשבילך. בחרו אחד — ונמשיך לתכנן את הטיול המלא שם.'));
      var grid = el('div', { class: 'tp-options-grid' });
      (res.suggestions || []).forEach(function (s, idx) {
        var badge = ['🎯', '🧗', '💎'][idx] || '✨';
        var card = el('div', { class: 'tp-option-card tp-surprise-card' }, [
          el('div', { class: 'tp-option-badge' }, badge),
          el('div', { class: 'tp-option-title' }, s.label || (s.destination && s.destination.name)),
          el('div', { class: 'tp-option-lodging' }, s.destination && s.destination.name),
          el('p', { class: 'tp-option-overview' }, s.why || ''),
          el('div', { class: 'tp-surprise-cost' }, s.estCost || ''),
          el('button', { class: 'tp-btn tp-btn-primary tp-btn-block', type: 'button' }, 'תכנן טיול לכאן →')
        ]);
        card.querySelector('button').addEventListener('click', function () {
          // המשך למסלול חו"ל מלא עם היעד הנבחר. נשמרות התשובות שכבר נבחרו
          // בהפתעה (ימים/הרכב/חודש/תקציב) כדי שלא יישאלו פעמיים.
          st.surpriseDest = s.destination && s.destination.id;
          st.carry = (st.lastParams && st.lastParams.kind === 'surprise') ? {
            days: st.lastParams.days,
            composition: st.lastParams.composition,
            month: st.lastParams.month,
            budgetTotal: st.lastParams.budgetTotal
          } : null;
          st.kind = 'abroad';
          st.controls = {};
          go(2);
        });
        grid.appendChild(card);
      });
      stage.appendChild(grid);
      stage.appendChild(resultNav([]));
    }

    // אתחול
    render();
    return { close: modal.close };
  }

  // ============================================================================
  // רנדרר המסמך — משותף ל-open() ול-showDoc()
  // ============================================================================
  var WHEN_ICON = {
    'בוקר': '🌅', 'צהריים': '🍽️', 'אחה"צ': '🌇', 'לפנות ערב': '🌇', 'ערב': '🌙',
    'לעשות': '📍', 'לאכול': '🍽️'
  };

  function renderDoc(doc) {
    doc = doc || {};
    var root = el('article', { class: 'tp-doc' });

    // כותרת + overview
    var header = el('header', { class: 'tp-doc-head' }, [
      el('h3', { class: 'tp-doc-title' }, doc.title || 'תוכנית טיול'),
      doc.overview ? el('p', { class: 'tp-doc-overview' }, doc.overview) : null,
      doc.lodging ? el('div', { class: 'tp-doc-lodging' }, ['🛏️ ', doc.lodging]) : null
    ]);
    root.appendChild(header);

    // ימים כקלפים
    if (Array.isArray(doc.days) && doc.days.length) {
      var daysWrap = el('div', { class: 'tp-doc-days' });
      doc.days.forEach(function (d) {
        var card = el('section', { class: 'tp-day' });
        card.appendChild(el('div', { class: 'tp-day-head' }, [
          el('h4', { class: 'tp-day-title' }, d.title || ('יום ' + (d.n != null ? d.n : '')))
        ]));
        var blocks = el('div', { class: 'tp-day-blocks' });
        (d.blocks || []).forEach(function (b) {
          var icon = WHEN_ICON[b.when] || '•';
          blocks.appendChild(el('div', { class: 'tp-block' }, [
            el('span', { class: 'tp-block-icon' }, icon),
            el('div', { class: 'tp-block-body' }, [
              el('div', { class: 'tp-block-line' }, [
                el('span', { class: 'tp-block-when' }, b.when || ''),
                el('span', { class: 'tp-block-what' }, b.what || ''),
                (b.cost != null && b.cost > 0) ? el('span', { class: 'tp-block-cost' }, nis(b.cost)) : null
              ]),
              b.desc ? el('div', { class: 'tp-block-desc' }, b.desc) : null
            ])
          ]));
        });
        card.appendChild(blocks);

        var foot = [];
        if (d.costPerDay != null && d.costPerDay > 0) foot.push(el('div', { class: 'tp-day-cost' }, ['💰 הערכת עלות ליום: ', nis(d.costPerDay)]));
        if (d.transport) foot.push(el('div', { class: 'tp-day-transport' }, ['🚌 ', d.transport]));
        if (d.tip) foot.push(el('div', { class: 'tp-day-tip' }, ['💡 ', d.tip]));
        if (foot.length) card.appendChild(el('div', { class: 'tp-day-foot' }, foot));
        daysWrap.appendChild(card);
      });
      root.appendChild(daysWrap);
    }

    // טבלת תקציב
    if (Array.isArray(doc.budgetTable) && doc.budgetTable.length) {
      var table = el('table', { class: 'tp-budget-table' });
      table.appendChild(el('thead', {}, el('tr', {}, [
        el('th', {}, 'קטגוריה'), el('th', {}, 'הערכה ליום'), el('th', {}, 'סה"כ')
      ])));
      var tb = el('tbody');
      doc.budgetTable.forEach(function (row) {
        var isTotal = (row.cat || '').indexOf('סה"כ') !== -1;
        tb.appendChild(el('tr', { class: isTotal ? 'tp-budget-total' : null }, [
          el('td', {}, row.cat || ''),
          el('td', {}, row.perDay != null ? nis(row.perDay) : '—'),
          el('td', {}, row.total != null ? nis(row.total) : '—')
        ]));
      });
      table.appendChild(tb);
      root.appendChild(el('div', { class: 'tp-doc-section' }, [
        el('h4', { class: 'tp-section-title' }, '💰 סיכום תקציב'),
        el('div', { class: 'tp-table-wrap' }, table)
      ]));
    }

    // אקורדיונים
    var accWrap = el('div', { class: 'tp-accordions' });
    if (Array.isArray(doc.packing) && doc.packing.length) {
      accWrap.appendChild(accordion('🎒 רשימת ציוד', packingList(doc.packing), true));
    }
    if (Array.isArray(doc.checklist) && doc.checklist.length) {
      accWrap.appendChild(accordion('✅ צ\'קליסט לפני טיסה', checkList(doc.checklist)));
    }
    if (Array.isArray(doc.tips) && doc.tips.length) {
      accWrap.appendChild(accordion('⚠️ טיפים ומלכודות', bulletList(doc.tips, 'tp-tip-item')));
    }
    if (doc.rainAlt) {
      accWrap.appendChild(accordion('☔ חלופת גשם', el('p', { class: 'tp-rain' }, doc.rainAlt)));
    }
    if (accWrap.children.length) root.appendChild(accWrap);

    return root;
  }

  function accordion(title, contentNode, openByDefault) {
    var details = el('details', { class: 'tp-acc' });
    if (openByDefault) details.open = true;
    details.appendChild(el('summary', { class: 'tp-acc-sum' }, [
      el('span', { class: 'tp-acc-title' }, title),
      el('span', { class: 'tp-acc-chev' }, '⌄')
    ]));
    details.appendChild(el('div', { class: 'tp-acc-body' }, contentNode));
    return details;
  }

  function packingList(items) {
    var ul = el('ul', { class: 'tp-pack-list' });
    items.forEach(function (it, i) {
      var id = 'tp-pack-' + i + '-' + Math.random().toString(36).slice(2, 7);
      ul.appendChild(el('li', { class: 'tp-pack-item' }, [
        el('input', { type: 'checkbox', id: id, class: 'tp-check' }),
        el('label', { for: id }, it)
      ]));
    });
    return ul;
  }

  function checkList(items) {
    var ul = el('ul', { class: 'tp-check-list' });
    items.forEach(function (it, i) {
      var id = 'tp-cl-' + i + '-' + Math.random().toString(36).slice(2, 7);
      ul.appendChild(el('li', { class: 'tp-check-item' }, [
        el('input', { type: 'checkbox', id: id, class: 'tp-check' }),
        el('label', { for: id }, it)
      ]));
    });
    return ul;
  }

  function bulletList(items, cls) {
    var ul = el('ul', { class: 'tp-bullets' });
    items.forEach(function (it) { ul.appendChild(el('li', { class: cls || '' }, it)); });
    return ul;
  }

  // ── ייצוא / הדפסה דרך מסמך HTML עצמאי ────────────────────────────────────────
  // במקום להסתיר את שאר העמוד (שמשתבש בהדפסה), בונים מסמך HTML שלם ועצמאי עם CSS
  // מוטמע מותאם A4, ומדפיסים אותו ב-iframe נקי / מורידים אותו כקובץ. כך ההדפסה
  // יוצאת מושלמת תמיד, וקובץ ה-HTML נפתח לבד בכל דפדפן (גם אופליין).

  // CSS עצמאי (צבעים מפורשים, בלי תלות בטוקנים של האתר) — מסך + A4.
  var EXPORT_CSS = [
    '@page{size:A4;margin:14mm 13mm}',
    '*{box-sizing:border-box}',
    'html,body{margin:0;padding:0}',
    'body{font-family:"Segoe UI",Arial,"Heebo",sans-serif;direction:rtl;color:#23272f;background:#f4f1ea;font-size:11.5pt;line-height:1.55}',
    '.tp-doc{max-width:188mm;margin:0 auto;background:#fff;padding:16mm 14mm;box-shadow:0 1px 6px rgba(0,0,0,.08)}',
    '@media print{body{background:#fff}.tp-doc{box-shadow:none;padding:0;max-width:none;margin:0}}',
    '.tp-doc-head{border-bottom:2px solid #e4dccb;padding-bottom:10px;margin-bottom:14px}',
    '.tp-doc-title{font-size:21pt;margin:0 0 6px;color:#1f3a5f;font-weight:800}',
    '.tp-doc-overview{color:#444;margin:0 0 8px}',
    '.tp-doc-lodging{background:#f3f0e8;padding:6px 11px;border-radius:7px;display:inline-block;font-size:11pt}',
    '.tp-day{border:1px solid #ddd6c6;border-radius:9px;padding:11px 13px;margin:0 0 11px;break-inside:avoid;page-break-inside:avoid}',
    '.tp-day-head{margin-bottom:6px}',
    '.tp-day-title{font-size:14pt;margin:0;color:#1f6b46;font-weight:700}',
    '.tp-day-blocks{display:block}',
    '.tp-block{display:flex;gap:9px;align-items:flex-start;padding:5px 0;border-top:1px dashed #efe9da}',
    '.tp-block:first-child{border-top:0}',
    '.tp-block-icon{font-size:14pt;line-height:1.3;flex-shrink:0}',
    '.tp-block-body{min-width:0;flex:1}',
    '.tp-block-line{display:flex;flex-wrap:wrap;gap:7px;align-items:baseline}',
    '.tp-block-when{font-weight:700;color:#555;min-width:52px}',
    '.tp-block-what{font-weight:600;color:#23272f}',
    '.tp-block-cost{margin-inline-start:auto;color:#b3503f;font-weight:700;white-space:nowrap}',
    '.tp-block-desc{color:#666;font-size:10.5pt;margin-top:2px}',
    '.tp-day-foot{margin-top:7px;border-top:1px solid #eee;padding-top:6px;font-size:10.5pt;color:#555;display:flex;flex-direction:column;gap:3px}',
    '.tp-doc-section{margin:14px 0;break-inside:avoid}',
    '.tp-section-title{font-size:13.5pt;color:#1f3a5f;margin:0 0 6px;font-weight:700}',
    '.tp-budget-table{width:100%;border-collapse:collapse;font-size:11pt}',
    '.tp-budget-table th,.tp-budget-table td{border:1px solid #d6cfbe;padding:6px 9px;text-align:right}',
    '.tp-budget-table thead th{background:#eef2f7;color:#1f3a5f;font-weight:700}',
    '.tp-budget-total{font-weight:800;background:#f7f3e8}',
    '.tp-accordions{margin-top:8px}',
    '.tp-acc{margin:9px 0;break-inside:avoid;page-break-inside:avoid}',
    '.tp-acc-sum{list-style:none;font-weight:700;font-size:12.5pt;color:#1f3a5f;border-bottom:1px solid #e4dccb;padding-bottom:4px;margin-bottom:6px}',
    '.tp-acc-sum::-webkit-details-marker{display:none}',
    '.tp-acc-chev{display:none}',
    'ul{margin:5px 0;padding-inline-start:0;list-style:none}',
    '.tp-pack-list,.tp-check-list{columns:2;column-gap:18px}',
    '.tp-pack-item,.tp-check-item{padding:2px 0;break-inside:avoid}',
    '.tp-check{margin-inline-end:7px;vertical-align:middle}',
    '.tp-bullets li{padding:3px 0 3px 0;position:relative;padding-inline-start:16px}',
    '.tp-bullets li::before{content:"•";position:absolute;inset-inline-start:0;color:#b3503f;font-weight:700}',
    '.tp-rain{margin:0;color:#444}',
    '.tp-export-foot{margin-top:16px;padding-top:9px;border-top:1px solid #e4dccb;font-size:9pt;color:#9a948a;text-align:center}',
    'a{color:inherit}'
  ].join('');

  // לוקח את צומת המסמך המוצג, מנקה אינטראקטיביות ומחזיר מחרוזת HTML עצמאית
  function buildStandaloneHTML(docNode, title) {
    var clone = docNode.cloneNode(true);
    // פותחים את כל האקורדיונים כדי שהכול יודפס/ייוצא, ומסירים שאריות אינטראקטיביות
    Array.prototype.forEach.call(clone.querySelectorAll('details'), function (d) { d.setAttribute('open', ''); });
    var safeTitle = (title || 'תוכנית טיול').replace(/[<>&]/g, ' ').trim();
    var foot = '<div class="tp-export-foot">נוצר באפליקציית "המחברת שלי" · מתכנן הטיולים</div>';
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + safeTitle + '</title><style>' + EXPORT_CSS + '</style></head>' +
      '<body>' + clone.outerHTML + foot + '</body></html>';
  }

  // הדפסה דרך iframe נקי — לא נוגעים ב-DOM של האפליקציה, אז הפלט מושלם תמיד
  function printDoc(docNode, title) {
    var html = buildStandaloneHTML(docNode, title);
    var ifr = el('iframe', { class: 'tp-print-frame', 'aria-hidden': 'true' });
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(ifr);
    var fired = false;
    function go() {
      if (fired) return; fired = true;
      try {
        var win = ifr.contentWindow;
        win.focus();
        win.print();
      } catch (e) { toast('ההדפסה נכשלה — נסו ייצוא ל-HTML'); }
      setTimeout(function () { try { ifr.remove(); } catch (e) {} }, 1500);
    }
    ifr.onload = function () { setTimeout(go, 250); };  // המתנה קצרה לציור
    var d = ifr.contentWindow.document;
    d.open(); d.write(html); d.close();
    setTimeout(go, 1200);   // fallback אם onload לא נורה
  }

  // ייצוא: הורדת קובץ HTML עצמאי (נפתח בכל דפדפן, גם בלי רשת)
  function exportDoc(docNode, title) {
    try {
      var html = buildStandaloneHTML(docNode, title);
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var fname = ((title || 'תוכנית-טיול').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'תוכנית-טיול') + '.html';
      var a = el('a', { href: url, download: fname });
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
      toast('📄 קובץ ה-HTML יורד — ניתן לפתוח ולהדפיס בכל דפדפן');
    } catch (e) { toast('הייצוא נכשל'); }
  }

  // שני כפתורי פעולה למסמך: ייצוא ל-HTML + הדפסה (A4)
  function docActionButtons(docNode, doc) {
    var title = (doc && doc.title) || 'תוכנית טיול';
    var exp = el('button', { class: 'tp-btn tp-btn-soft', type: 'button' }, '📄 ייצוא ל-HTML');
    exp.addEventListener('click', function () { exportDoc(docNode, title); });
    var prn = el('button', { class: 'tp-btn tp-btn-soft', type: 'button' }, '🖨️ הדפסה (A4)');
    prn.addEventListener('click', function () { printDoc(docNode, title); });
    return [exp, prn];
  }

  // ============================================================================
  // showDoc(doc) — הצגת מסמך תוכנית שמור
  // ============================================================================
  function showDoc(doc) {
    if (!doc || typeof doc !== 'object') {
      openFailModal('תוכנית הטיול', 'אין מסמך תוכנית לתצוגה.');
      return;
    }
    var modal = buildModal({ title: '🧾 תוכנית הטיול' });
    var docNode = renderDoc(doc);
    modal.body.appendChild(docNode);

    var closeBtn = el('button', { class: 'tp-btn tp-btn-ghost', type: 'button', onClick: modal.close }, 'סגירה');
    modal.body.appendChild(el('div', { class: 'tp-nav tp-nav-result tp-doc-actions' },
      [closeBtn].concat(docActionButtons(docNode, doc))));
    return { close: modal.close };
  }

  // הוסף כפתור הדפסה גם לתוצאות האשף (israel/abroad/getaway) — נטמע ב-renderDoc דרך showDoc.
  // באשף עצמו ההדפסה נגישה לאחר שמירה; כאן מספקים אותה דרך showDoc.

  window.TripPlannerUI = { open: open, showDoc: showDoc };

})();
