/* =========================================================================
 * tripmap/street.js — תצוגת רחוב אימרסיבית            → window.TripMapStreet
 * =========================================================================
 * אחריות (סוכן B): overlay מסך-מלא של Google Street View בתוך iframe,
 * ללא מפתח API וללא תשלום, + מצב "פקק" (קליק על המפה פותח תצוגת רחוב שם).
 *
 * ▎שיטת ההטמעה (אומתה בפועל, יוני 2026):
 *   הכתובת הישנה  https://maps.google.com/maps?layer=c&cbll=...&output=svembed
 *   עושה 301 אל   https://www.google.com/maps/embed?pb=!6m7!1m6!2m2!1d{lat}!2d{lng}!3f{heading}!4f{pitch}!5f1
 *   נבדק עם curl: התשובה הסופית היא 200, *בלי* X-Frame-Options ובלי
 *   frame-ancestors ב-CSP → מותר להציג ב-iframe מכל דומיין. הדף שחוזר
 *   מאתחל פנורמת Street View בקואורדינטות שביקשנו (initEmbed עם [lat,lng])
 *   דרך מפתח פנימי של גוגל — אנחנו לא צריכים מפתח משלנו.
 *   אנו בונים את כתובת ה-pb הסופית ישירות (בלי לעבור דרך ה-redirect, כי
 *   לתשובת ה-301 עצמה יש X-Frame-Options: SAMEORIGIN שעלול להיחסם בדפדפן).
 *   בתוך ה-iframe הניווט מלא: חיצים על הכביש = קדימה/אחורה, גרירה = מבט.
 *
 * ▎fallback: אם ה-iframe לא נטען תוך 8 שניות (אין רשת / חסימה עתידית) —
 *   הודעה ידידותית + כפתור שפותח את הפנורמה בטאב חדש:
 *   https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}
 *   + אופציה ל-Mapillary אם המשתמש הגדיר window.TripMapConfig.mapillaryToken.
 *
 * עיצוב: הכול inline styles (ה-CSS של הפיצ'ר בבעלות סוכן C); שמות הקלאסים
 * עם prefix ‎tm-street-‎ קיימים רק כדי שסוכן C יוכל לדרוס/ללטש.
 * ========================================================================= */
(function () {
  'use strict';

  var ns = {};

  /* ---------- קבועים ---------- */
  var Z_INDEX = 99999;            // מעל כל המודאלים של האפליקציה
  var LOAD_TIMEOUT_MS = 8000;     // אחרי 8 שניות בלי load → fallback
  var STYLE_ID = 'tm-street-style';

  /* ---------- state פנימי ---------- */
  var overlay = null;             // אלמנט ה-overlay הפתוח (אחד לכל היותר)
  var escHandler = null;          // מאזין ESC הנוכחי
  var loadTimer = null;           // טיימר ה-timeout של הטעינה
  var dropStates = [];            // מצבי "פקק" פעילים, רשומה לכל handle

  /* ---------- עזרי כתובות ---------- */

  // כתובת ההטמעה הסופית (keyless) — ראו תיעוד למעלה
  function buildEmbedUrl(lat, lng, heading, pitch) {
    heading = isFinite(heading) ? heading : 0;
    pitch = isFinite(pitch) ? pitch : 0;
    return 'https://www.google.com/maps/embed?pb=' +
      '!6m7!1m6!2m2!1d' + lat + '!2d' + lng +
      '!3f' + heading + '!4f' + pitch + '!5f1&hl=he';
  }

  // פתיחת הפנורמה בטאב חדש (Maps URLs API — רשמי, חינמי, בלי מפתח)
  function buildPanoTabUrl(lat, lng) {
    return 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' +
      lat + ',' + lng;
  }

  // Mapillary — רק אם המשתמש סיפק טוקן חינמי בקונפיג (לא דורשים אותו)
  function getMapillaryToken() {
    var cfg = window.TripMapConfig;
    return (cfg && cfg.mapillaryToken) ? String(cfg.mapillaryToken) : '';
  }

  function buildMapillaryUrl(lat, lng, token) {
    return 'https://www.mapillary.com/embed?lat=' + lat + '&lng=' + lng +
      '&z=17&style=photo&access_token=' + encodeURIComponent(token);
  }

  /* ---------- עזרי DOM ---------- */

  function el(tag, styles, attrs) {
    var node = document.createElement(tag);
    if (styles) { for (var k in styles) node.style[k] = styles[k]; }
    if (attrs) {
      for (var a in attrs) {
        if (a === 'text') node.textContent = attrs[a];
        else node.setAttribute(a, attrs[a]);
      }
    }
    return node;
  }

  // הזרקת keyframes לספינר (אי-אפשר להגדיר @keyframes ב-inline style).
  // זהו style מינימלי שהמודול מזריק בעצמו — לא נוגעים בקובצי CSS.
  function ensureSpinStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '@keyframes tm-street-spin{to{transform:rotate(360deg)}}' +
      '.tm-street-spinner{animation:tm-street-spin .9s linear infinite}';
    document.head.appendChild(st);
  }

  function styledBtn(label, primary) {
    return el('button', {
      cursor: 'pointer', border: 'none', borderRadius: '10px',
      padding: '9px 16px', fontSize: '14px', fontWeight: '600',
      fontFamily: 'inherit',
      background: primary ? '#4285f4' : 'rgba(255,255,255,.14)',
      color: '#fff'
    }, { type: 'button', text: label });
  }

  /* ---------- סגירה ---------- */

  function close() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    if (escHandler) {
      document.removeEventListener('keydown', escHandler, true);
      escHandler = null;
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  /* ---------- פתיחה ---------- */

  /**
   * TripMapStreet.open({lat,lng})
   * פותח overlay מסך-מלא עם תצוגת רחוב בנקודה. ✕ / ESC סוגרים.
   */
  function open(pos) {
    var lat = pos && Number(pos.lat);
    var lng = pos && Number(pos.lng);
    if (!isFinite(lat) || !isFinite(lng)) {
      console.warn('[TripMapStreet] open: קואורדינטות לא תקינות', pos);
      return;
    }
    close(); // overlay אחד בלבד
    ensureSpinStyle();

    var tabUrl = buildPanoTabUrl(lat, lng);

    /* overlay מסך-מלא */
    overlay = el('div', {
      position: 'fixed', inset: '0', zIndex: String(Z_INDEX),
      background: 'rgba(10,12,16,.96)', display: 'flex',
      flexDirection: 'column', direction: 'rtl'
    }, { 'class': 'tm-street-overlay', role: 'dialog', 'aria-modal': 'true',
         'aria-label': 'תצוגת רחוב' });

    /* סרגל עליון: ✕ + כותרת + "פתח ב-Google Maps" */
    var topbar = el('div', {
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 14px', flex: '0 0 auto',
      background: 'rgba(0,0,0,.45)', color: '#fff'
    }, { 'class': 'tm-street-topbar' });

    var closeBtn = el('button', {
      cursor: 'pointer', border: 'none', borderRadius: '50%',
      width: '38px', height: '38px', fontSize: '18px', lineHeight: '1',
      background: 'rgba(255,255,255,.16)', color: '#fff', flex: '0 0 auto'
    }, { type: 'button', 'class': 'tm-street-close',
         'aria-label': 'סגירת תצוגת רחוב', title: 'סגירה (ESC)', text: '✕' });
    closeBtn.addEventListener('click', close);

    var title = el('div', {
      fontSize: '15px', fontWeight: '700', flex: '1 1 auto',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
    }, { 'class': 'tm-street-title',
         text: '🚶 תצוגת רחוב — ' + lat.toFixed(5) + ', ' + lng.toFixed(5) });

    var gmapsBtn = styledBtn('פתח ב-Google Maps ↗', false);
    gmapsBtn.className = 'tm-street-gmaps-btn';
    gmapsBtn.addEventListener('click', function () {
      window.open(tabUrl, '_blank', 'noopener');
    });

    topbar.appendChild(closeBtn);
    topbar.appendChild(title);
    topbar.appendChild(gmapsBtn);

    /* גוף: iframe + שכבת טעינה */
    var body = el('div', {
      position: 'relative', flex: '1 1 auto', minHeight: '0'
    }, { 'class': 'tm-street-body' });

    var frame = el('iframe', {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      border: '0', display: 'block'
    }, { 'class': 'tm-street-frame', title: 'תצוגת רחוב',
         allow: 'accelerometer; gyroscope; fullscreen',
         referrerpolicy: 'no-referrer-when-downgrade', loading: 'eager' });

    /* שכבת טעינה: ספינר + טקסט */
    var loadingBox = el('div', {
      position: 'absolute', inset: '0', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '14px', color: '#fff', pointerEvents: 'none'
    }, { 'class': 'tm-street-loading' });

    var spinner = el('div', {
      width: '44px', height: '44px', borderRadius: '50%',
      border: '4px solid rgba(255,255,255,.25)',
      borderTopColor: '#4285f4'
    }, { 'class': 'tm-street-spinner' });

    var loadingTxt = el('div', { fontSize: '14px', opacity: '.85' },
      { 'class': 'tm-street-loading-text', text: 'טוען תצוגת רחוב…' });

    loadingBox.appendChild(spinner);
    loadingBox.appendChild(loadingTxt);

    body.appendChild(frame);
    body.appendChild(loadingBox);
    overlay.appendChild(topbar);
    overlay.appendChild(body);
    document.body.appendChild(overlay);

    /* הודעת fallback (אם הטעינה נכשלה / איטית מדי) */
    function showFallback() {
      if (!overlay) return;
      loadingBox.style.pointerEvents = 'auto';
      loadingBox.innerHTML = '';
      var panel = el('div', {
        maxWidth: '420px', textAlign: 'center', display: 'flex',
        flexDirection: 'column', gap: '14px', alignItems: 'center',
        padding: '20px', background: 'rgba(255,255,255,.07)',
        borderRadius: '14px'
      }, { 'class': 'tm-street-fallback' });

      var msg = el('div', { fontSize: '15px', lineHeight: '1.6' }, {
        'class': 'tm-street-fallback-msg',
        text: 'תצוגת הרחוב לא נטענה. ייתכן שאין חיבור לאינטרנט, ' +
              'או שאין כיסוי Street View בנקודה הזו. ' +
              'אפשר לפתוח את הפנורמה ישירות ב-Google Maps:'
      });
      panel.appendChild(msg);

      var openBtn = styledBtn('פתח ב-Google Maps בטאב חדש ↗', true);
      openBtn.className = 'tm-street-fallback-btn';
      openBtn.addEventListener('click', function () {
        window.open(tabUrl, '_blank', 'noopener');
      });
      panel.appendChild(openBtn);

      // אופציה שקטה: Mapillary — רק אם המשתמש הזין טוקן חינמי בקונפיג
      var token = getMapillaryToken();
      if (token) {
        var mlyBtn = styledBtn('נסה ב-Mapillary (חלופה חינמית)', false);
        mlyBtn.className = 'tm-street-mapillary-btn';
        mlyBtn.addEventListener('click', function () {
          loadingBox.style.display = 'none';
          frame.src = buildMapillaryUrl(lat, lng, token);
        });
        panel.appendChild(mlyBtn);
      }

      loadingBox.appendChild(panel);
    }

    /* טעינה + timeout */
    frame.addEventListener('load', function () {
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      // ה-iframe נטען — מסירים את שכבת הטעינה.
      // הערה: אם אין פנורמה בנקודה גוגל מציגים מסך ריק — לכן כפתור
      // "פתח ב-Google Maps" נשאר תמיד זמין בסרגל העליון.
      loadingBox.style.display = 'none';
    });
    loadTimer = setTimeout(showFallback, LOAD_TIMEOUT_MS);
    frame.src = buildEmbedUrl(lat, lng, 0, 0);

    /* ESC סוגר (capture, עם stopPropagation — לא מפעיל התנהגויות ESC אחרות) */
    escHandler = function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', escHandler, true);

    closeBtn.focus();
  }

  /* ---------- מצב "פקק" (drop mode) ---------- */

  function findDrop(handle) {
    for (var i = 0; i < dropStates.length; i++) {
      if (dropStates[i].handle === handle) return i;
    }
    return -1;
  }

  // שינוי הסמן על קנבס המפה — עמיד גם אם ה-handle חלקי
  function setMapCursor(handle, cursor) {
    try {
      var canvas = handle && handle.map && handle.map.getCanvas &&
                   handle.map.getCanvas();
      if (canvas) {
        var prev = canvas.style.cursor;
        canvas.style.cursor = cursor;
        return prev;
      }
    } catch (err) { /* לא קריטי */ }
    return '';
  }

  /**
   * TripMapStreet.enableDropMode(handle, onExit?)
   * הסמן הופך לקרוס-הייר; הקליק הבא על המפה פותח תצוגת רחוב בנקודה
   * ויוצא מהמצב. onExit נקרא בכל יציאה מהמצב.
   */
  function enableDropMode(handle, onExit) {
    if (!handle || typeof handle.onClickMap !== 'function') {
      console.warn('[TripMapStreet] enableDropMode: handle לא תקין (חסר onClickMap)');
      return;
    }
    disableDropMode(handle); // אין כפילויות

    var rec = { handle: handle, onExit: onExit || null, off: null, prevCursor: '' };
    rec.prevCursor = setMapCursor(handle, 'crosshair');

    try {
      rec.off = handle.onClickMap(function (pt) {
        disableDropMode(handle);              // קודם יוצאים מהמצב
        if (pt && isFinite(Number(pt.lat))) open(pt); // ואז פותחים שם
      });
    } catch (err) {
      console.warn('[TripMapStreet] enableDropMode נכשל:', err);
      setMapCursor(handle, rec.prevCursor);
      return;
    }
    dropStates.push(rec);
  }

  /**
   * TripMapStreet.disableDropMode(handle) — יציאה נקייה מהמצב (no-op אם כבוי)
   */
  function disableDropMode(handle) {
    var i = findDrop(handle);
    if (i === -1) return;
    var rec = dropStates.splice(i, 1)[0];
    if (typeof rec.off === 'function') {
      try { rec.off(); } catch (err) { /* המאזין כבר הוסר */ }
    }
    setMapCursor(handle, rec.prevCursor || '');
    if (typeof rec.onExit === 'function') {
      try { rec.onExit(); } catch (err) { console.warn('[TripMapStreet] onExit:', err); }
    }
  }

  /* ---------- API ציבורי ---------- */
  ns.open = open;
  ns.close = close;                      // תוספת נוחה (לא בחוזה, לא שוברת דבר)
  ns.enableDropMode = enableDropMode;
  ns.disableDropMode = disableDropMode;

  window.TripMapStreet = ns;
})();
