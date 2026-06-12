/* =========================================================================
 * tripmap/controls.js — ניווט גוף-ראשון על מפת ה-3D   → window.TripMapControls
 * =========================================================================
 * אחריות (סוכן B): תחושת "טיסה" כמו ב-Google Earth על מפת maplibre:
 *   חיצים / WASD = תנועה קדימה/אחורה/צדדים יחסית ל-bearing הנוכחי
 *   Q / E        = סיבוב המבט (bearing)
 *   R / F        = הטיית המבט מעלה/מטה (pitch)
 *   Shift        = האצה (טיסה מהירה)
 *   גלגלת        = זום (ברירת המחדל של maplibre — לא נוגעים)
 *   גרירה ימנית / Ctrl+גרירה = סיבוב מבט (ברירת המחדל של maplibre — לא נוגעים)
 *
 * עקרונות:
 * - מאזינים רק על container המפה (עם tabindex) — לא על document, ולכן
 *   קיצורים גלובליים (Ctrl+K של החיפוש המהיר וכו') לא נפגעים.
 * - מתעלמים מאירועים עם Ctrl/Alt/Meta; preventDefault רק על מקשים שלנו.
 * - תנועה חלקה: לולאת requestAnimationFrame עם easing (האצה/בלימה רכות),
 *   לא קפיצות בדידות. הצעד מותאם לזום אוטומטית (panBy עובד בפיקסלים,
 *   ופיקסל = פחות מטרים ככל שהזום גבוה) וכן ל-bearing (panBy הוא יחסי
 *   למסך, ו"למעלה במסך" = כיוון ה-bearing).
 * - שימוש ב-e.code (KeyW וכו') — עובד גם בפריסת מקלדת עברית.
 * - detach מנקה את כל המאזינים ועוצר את הלולאה.
 * ========================================================================= */
(function () {
  'use strict';

  var ns = {};

  /* ---------- קבועי תנועה ---------- */
  var MOVE_SPEED_PX = 520;   // מהירות שיוט בפיקסלים לשנייה
  var ROT_SPEED_DEG = 80;    // מהירות סיבוב במעלות לשנייה
  var PITCH_SPEED_DEG = 55;  // מהירות הטיה במעלות לשנייה
  var BOOST_FACTOR = 2.6;    // מכפיל מהירות עם Shift
  var EASE_RATE = 9;         // קצב התכנסות ה-easing (גבוה יותר = חד יותר)
  var MAX_PITCH = 85;

  /* מיפוי e.code → פעולה */
  var KEY_ACTIONS = {
    ArrowUp: 'fwd',    KeyW: 'fwd',
    ArrowDown: 'back', KeyS: 'back',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    KeyQ: 'rotL', KeyE: 'rotR',
    KeyR: 'pitchUp', KeyF: 'pitchDown'
  };

  /* state פנימי — רשומה לכל handle מחובר (תומך בכמה מפות) */
  var states = [];

  function findState(handle) {
    for (var i = 0; i < states.length; i++) {
      if (states[i].handle === handle) return states[i];
    }
    return null;
  }

  /* האם המקלדת כרגע בתוך שדה קלט/עורך — אז לא מתערבים */
  function isEditableTarget(t) {
    if (!t) return false;
    var tag = (t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           t.isContentEditable === true;
  }

  /* ---------- לולאת האנימציה ---------- */

  function anyKeyDown(keys) {
    for (var k in keys) { if (keys[k]) return true; }
    return false;
  }

  function startLoop(st) {
    if (st.raf) return;
    st.last = 0;
    st.raf = requestAnimationFrame(function tick(t) {
      st.raf = 0;
      if (!st.attached) return;
      frame(st, t);
    });
  }

  function frame(st, t) {
    var map = st.map;
    if (!map) return;

    var dt = st.last ? Math.min((t - st.last) / 1000, 0.05) : 0.016;
    st.last = t;

    var k = st.keys;
    var boost = st.shift ? BOOST_FACTOR : 1;

    /* יעדי מהירות (-1..1) לפי המקשים הלחוצים */
    var targetX = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    var targetY = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    var targetR = (k.rotR ? 1 : 0) - (k.rotL ? 1 : 0);
    var targetP = (k.pitchUp ? 1 : 0) - (k.pitchDown ? 1 : 0);

    /* easing אקספוננציאלי — האצה ובלימה רכות */
    var ease = 1 - Math.exp(-EASE_RATE * dt);
    var v = st.vel;
    v.x += (targetX - v.x) * ease;
    v.y += (targetY - v.y) * ease;
    v.r += (targetR - v.r) * ease;
    v.p += (targetP - v.p) * ease;

    try {
      /* תנועה: panBy בפיקסלים — יחסית למסך, כלומר יחסית ל-bearing,
         והסקאלה תלוית-zoom מקבלת טיפול אוטומטי (פיקסל=פחות מטרים בזום גבוה) */
      var dx = v.x * MOVE_SPEED_PX * boost * dt;
      var dy = -v.y * MOVE_SPEED_PX * boost * dt; // שלילי = "למעלה במסך" = קדימה
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        map.panBy([dx, dy], { duration: 0, animate: false });
      }

      /* סיבוב bearing */
      if (Math.abs(v.r) > 0.002) {
        map.setBearing(map.getBearing() + v.r * ROT_SPEED_DEG * boost * dt);
      }

      /* הטיית pitch (תחום 0..85) */
      if (Math.abs(v.p) > 0.002) {
        var pitch = map.getPitch() + v.p * PITCH_SPEED_DEG * dt;
        map.setPitch(Math.max(0, Math.min(MAX_PITCH, pitch)));
      }
    } catch (err) {
      /* המפה נהרסה באמצע פריים — עוצרים בשקט */
      stopLoop(st);
      return;
    }

    /* ממשיכים כל עוד יש מקש לחוץ או שהמהירות עוד לא דעכה (בלימה רכה) */
    var moving = Math.abs(v.x) > 0.01 || Math.abs(v.y) > 0.01 ||
                 Math.abs(v.r) > 0.01 || Math.abs(v.p) > 0.01;
    if (anyKeyDown(st.keys) || moving) {
      st.raf = requestAnimationFrame(function (t2) {
        st.raf = 0;
        if (st.attached) frame(st, t2);
      });
    } else {
      st.last = 0;
      st.vel = { x: 0, y: 0, r: 0, p: 0 };
    }
  }

  function stopLoop(st) {
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    st.keys = {};
    st.vel = { x: 0, y: 0, r: 0, p: 0 };
    st.last = 0;
  }

  /* ---------- חיבור / ניתוק ---------- */

  /**
   * TripMapControls.attach(handle)
   * מאזיני מקלדת על container המפה בלבד. אידמפוטנטי לכל handle.
   */
  function attach(handle) {
    if (!handle || !handle.map || typeof handle.map.getContainer !== 'function') {
      console.warn('[TripMapControls] attach: handle לא תקין (חסר map)');
      return;
    }
    if (findState(handle)) return; // כבר מחובר

    var map = handle.map;
    var container;
    try { container = map.getContainer(); } catch (err) { return; }
    if (!container) return;

    var st = {
      handle: handle, map: map, container: container,
      keys: {}, vel: { x: 0, y: 0, r: 0, p: 0 },
      raf: 0, last: 0, shift: false,
      attached: true, addedTabindex: false
    };

    /* tabindex — כדי שה-container יוכל לקבל פוקוס מקלדת */
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '0');
      st.addedTabindex = true;
    }
    container.style.outline = 'none';

    st.onKeyDown = function (e) {
      /* לא דורסים קיצורים גלובליים (Ctrl+K וכו') ולא שדות קלט */
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      var action = KEY_ACTIONS[e.code];
      if (!action) return;            // לא מקש שלנו — לא נוגעים
      st.shift = e.shiftKey;
      e.preventDefault();             // רק על המקשים שלנו (חיצים מגלגלים דף)
      e.stopPropagation();
      if (!st.keys[action]) st.keys[action] = true;
      startLoop(st);
    };

    st.onKeyUp = function (e) {
      var action = KEY_ACTIONS[e.code];
      if (action) delete st.keys[action];
      st.shift = e.shiftKey;
    };

    /* איבוד פוקוס/עזיבת חלון — משחררים את כל המקשים (הבלימה הרכה תעצור) */
    st.onBlur = function () { st.keys = {}; st.shift = false; };

    /* קליק על המפה מחזיר פוקוס ל-container (שהמקלדת תעבוד מיד) */
    st.onMouseDown = function () {
      try { container.focus({ preventScroll: true }); } catch (err) { /* */ }
    };

    container.addEventListener('keydown', st.onKeyDown);
    container.addEventListener('keyup', st.onKeyUp);
    container.addEventListener('blur', st.onBlur, true);
    container.addEventListener('mousedown', st.onMouseDown);

    states.push(st);
  }

  /**
   * TripMapControls.detach(handle) — מנקה את כל המאזינים והלולאה.
   */
  function detach(handle) {
    var st = findState(handle);
    if (!st) return;
    st.attached = false;
    stopLoop(st);

    var c = st.container;
    if (c) {
      c.removeEventListener('keydown', st.onKeyDown);
      c.removeEventListener('keyup', st.onKeyUp);
      c.removeEventListener('blur', st.onBlur, true);
      c.removeEventListener('mousedown', st.onMouseDown);
      if (st.addedTabindex) c.removeAttribute('tabindex');
    }
    states.splice(states.indexOf(st), 1);
  }

  /* ---------- תקציר עזרה (סוכן C מציג) ---------- */
  ns.helpHTML =
    '<div class="tm-controls-help" dir="rtl" style="line-height:1.9;font-size:13px">' +
      '<b>ניווט טיסה על המפה</b> (לחצו על המפה כדי לקבל פוקוס):<br>' +
      '<kbd class="tm-key">W</kbd>/<kbd class="tm-key">▲</kbd> קדימה · ' +
      '<kbd class="tm-key">S</kbd>/<kbd class="tm-key">▼</kbd> אחורה · ' +
      '<kbd class="tm-key">A</kbd>/<kbd class="tm-key">◀</kbd> שמאלה · ' +
      '<kbd class="tm-key">D</kbd>/<kbd class="tm-key">▶</kbd> ימינה<br>' +
      '<kbd class="tm-key">Q</kbd>/<kbd class="tm-key">E</kbd> סיבוב המבט · ' +
      '<kbd class="tm-key">R</kbd>/<kbd class="tm-key">F</kbd> הטיה מעלה/מטה · ' +
      '<kbd class="tm-key">Shift</kbd> האצה<br>' +
      'גלגלת = זום · גרירה עם כפתור ימני (או Ctrl+גרירה) = סיבוב המבט' +
    '</div>';

  /* ---------- API ציבורי ---------- */
  ns.attach = attach;
  ns.detach = detach;

  window.TripMapControls = ns;
})();
