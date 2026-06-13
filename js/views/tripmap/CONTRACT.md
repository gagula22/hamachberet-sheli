# CONTRACT — מפת טיולים (tripmap) · חוזה ממשקים וחלוקת אחריות

> פיצ'ר חדש: מפת ארץ ישראל ברזולוציה מקסימלית, תצוגת תלת־מימד בסגנון Google Maps,
> תצוגת רחוב אימרסיבית (ניווט קדימה/אחורה/צדדים), ושילוב עם תכנון טיולים
> (פורמט הסקיל trip-planner-metakhnen-tiyulim).
>
> **כל סוכן נוגע אך ורק בקבצים שבבעלותו.** תקשורת בין מודולים — דרך ה־namespaces
> המוגדרים כאן בלבד (מוסכמת הפרויקט: ARCHITECTURE.md §3).

## אילוצים גלובליים
- אתר סטטי (GitHub Pages) + preview מקומי. אין שרת. הכל client-side.
- אסור לדרוש כרטיס אשראי / מפתח בתשלום. ספקי אריחים/תמונות חינמיים בלבד
  (מפתח חינמי אופציונלי מותר רק כשדרוג, עם fallback מלא בלעדיו).
- עברית + RTL בכל ה־UI. סגנון עיצוב לפי tokens.css (משתני CSS קיימים).
- כל קובץ עובר `node --check`. אפס שגיאות קונסול.
- ספריות צד-שלישי: עדיפות ל־vendoring תחת `js/vendor/` (כמו pdf-lib/tesseract). אם
  הקובץ ענק — CDN עם טעינה עצלה + הודעת שגיאה ידידותית כשאין רשת.
- IIFE + namespace על window. אין modules/bundler.

## בעלות על קבצים (אסור לחרוג!)

| סוכן | קבצים בבעלותו בלבד |
|---|---|
| A — מנוע מפה | `js/views/tripmap/config.js`, `js/views/tripmap/engine.js`, `js/vendor/maplibre/*` |
| B — תצוגת רחוב וניווט | `js/views/tripmap/street.js`, `js/views/tripmap/controls.js` |
| C — אינטגרציה וטיולים | `js/views/tripmap/index.js`, `js/views/tripmap/trip-layer.js`, `css/features/tripmap.css`, ושורות החיווט: `js/app.js` (שורת SECTIONS אחת), `index.html` (תגיות script/css), `js/store-schema.js` (מפתח `trips`), `js/firebase-sync.js` (עדכון assertion אם נדרש) |

קובץ זה (CONTRACT.md) — לקריאה בלבד לכל הסוכנים.

## ממשק A — `window.TripMapEngine` (engine.js + config.js)

```js
TripMapEngine.ensureLib() → Promise            // טוען maplibre-gl (vendored/CDN), פעם אחת
TripMapEngine.create(containerEl, opts?) → Promise<handle>
// opts: {center:{lat,lng}, zoom, pitch, mode:'2d'|'3d', basemap:'satellite'|'streets'}
// ברירת מחדל: מרכז ישראל, zoom 7.5, גבולות ישראל (maxBounds רחב), maxZoom גבוה ככל שהאריחים מאפשרים (19+)

handle.map                                      // אובייקט maplibre גולמי (לשימוש B בלבד)
handle.setMode('2d'|'3d')                       // 3d = terrain + pitch + מבנים extrusion
handle.setBasemap('satellite'|'streets')
handle.setLabels(on)                            // שמות רחובות/שכונות/ערים + גבולות (ברירת-מחדל: דולק)
handle.flyTo({lat,lng,zoom?,pitch?,bearing?})
handle.fitBounds(points /*[[lng,lat],…]*/, {padding?,maxZoom?,duration?,pitch?})  // מיקוד שכל הנקודות ייכנסו
handle.addMarker({id?,lat,lng,label?,color?,group?,onClick?,badge?,pinKind?}) → markerId
//   badge: טקסט/אמוג'י על פני הסיכה (מספר/🚩/🏁). pinKind: 'start'|'end'|'stop' (גודל).
handle.clearMarkers(group?)                     // בלי group = הכל
handle.drawRoute(coords /*[[lng,lat],…]*/, {id?,color?,group?,width?,opacity?,dash?})

// ניתוב נסיעה אמיתי (routing.js → window.TripRouting) — מסלול לפי כבישים כמו Waze
TripRouting.route(coords /*[[lng,lat],…] ≥2*/) → Promise<{ok, routes:[{coords,distanceKm,durationMin,roads:[…]}]}>
// routes[0]=ראשי, routes[1]=חלופה. נכשל (רשת/שרת) → reject; הקורא נופל לקו אווירי.
TripRouting.durHuman(min) → "1 ש' 35 דק'"
handle.clearRoutes(group?)
handle.onClickMap(cb /*({lat,lng})=>{}*/ )      // להחזיר פונקציית הסרה
handle.resize() ; handle.destroy()
```

config.js → `window.TripMapConfig`: כתובות מקורות אריחים (לוויין, רחובות, terrain-RGB,
vector למבנים), attribution, גבולות ישראל, ברירות מחדל. **רק כאן** משנים ספקים.

## ממשק B — `window.TripMapStreet` + `window.TripMapControls`

```js
TripMapStreet.open({lat,lng})                   // פותח overlay מסך-מלא של תצוגת רחוב
                                                // עם ✕ + ESC (מוסכמת המודאלים של הכלים)
TripMapStreet.enableDropMode(handle, onExit?)   // מצב "פקק": קליק על המפה → open() שם
TripMapStreet.disableDropMode(handle)
// בתוך הצופה: ניווט קדימה/אחורה/צדדים והסתכלות עם העכבר — חובה.
// מחקר: Google Street View ללא מפתח (iframe) / Mapillary (טוקן חינמי) — עם fallback.

TripMapControls.attach(handle)                  // ניווט גוף-ראשון על מפת ה-3D עצמה:
                                                // חיצים/WASD קדימה־אחורה־צדדים, גרירת עכבר = מבט,
                                                // גלגלת = גובה/זום. לא דורס את ברירות המחדל של maplibre.
TripMapControls.detach(handle)
```

B משתמש רק ב־API הציבורי של handle (כולל handle.map). לא נוגע בקבצי A/C.

## ממשק C — view + שכבת טיולים

- View בשם `tripmap`, כותרת **"מפת טיולים"**, אייקון 🗺️, נרשם `App.register('tripmap', render)`.
- `trip-layer.js` → `window.TripLayer`: ניהול טיולים על המפה (סימון ימים, מסלולים,
  קליק על יום → flyTo). מודל נתונים:

```js
// Store key: 'trips'  (מערך)
{ id, title, region, createdAt,
  days: [ { n, title, stops: [ { name, lat, lng, time?, note?, type? } ] } ] }
```

- ייבוא תוכנית מהסקיל: כפתור "תכנן טיול עם Claude" שמעתיק פרומפט מוכן (כולל סכמת
  ה-JSON הזו) ללוח + כפתור "ייבוא JSON" שמדביק את תוצאת הסקיל ושומר ל-Store.
- חיפוש מקום: Nominatim (חינמי, בלי מפתח) עם debounce ו-User-Agent תקין.

## מתכנן הטיולים העצמאי (planner) — שלושה מודולים, אפס תלות ב-LLM

> כל תכנון הטיול מתבצע **בתוך האתר**: אשף בחירות → מחולל תוכנית מקומי → תוצאה על
> המפה + מסמך תוכנית. ארבעת המסלולים של הסקיל: בארץ / חו"ל / חופשה קצרה / הפתע אותי.

| בעלות | קובץ | namespace |
|---|---|---|
| סוכן D — מאגר ידע | `js/views/tripmap/planner-data.js` | `window.TripPlannerData` |
| סוכן E — מנוע תכנון | `js/views/tripmap/planner-engine.js` | `window.TripPlannerEngine` |
| סוכן F — אשף UI | `js/views/tripmap/planner-ui.js` + `css/features/tripplanner.css` | `window.TripPlannerUI` |

### צורת הנתונים (TripPlannerData) — מקובעת, כולם כותבים מולה
```js
{
  regions: [{ id, name, center:{lat,lng}, seasons:['spring','summer','autumn','winter'],
              desc, audiences:['family','couple','friends','solo'] }],
  attractions: [{ id, name, region, lat, lng,
                  type:'nature'|'water'|'beach'|'history'|'museum'|'fun'|'view'|'market'|'spa',
                  durationH, cost:0|1|2|3, kids:'all'|'4+'|'8+'|'teens'|'no',
                  seasons:[...], shabbatOpen:bool, needsBooking:bool, rainOk:bool, desc, tip? }],
  restaurants: [{ id, name, region, lat, lng, style, price:1|2|3, kosher:bool, desc }],
  lodging:     [{ id, name, region, lat, lng, level:'free'|'budget'|'mid'|'premium',
                  priceNight:[min,max], romantic:bool, family:bool, pool:bool, desc }],
  abroad: { destinations: [{ id, name, daily:{lodging:[lo,hi],food:[..],attractions:[..],transport:[..]},
            flight:{low:[..],regular:[..],peak:[..]}, bestSeasons, language, currency, timeDiff,
            kosher:bool, days:[{title, morning, lunch, afternoon, evening, tip}...] /*תבנית עד 10 ימים*/,
            why, vibe:'classic'|'adventure'|'pamper' }] },
  packing: { base:[], summer:[], winter:[], kids:[], baby:[], hiking:[], beach:[], abroad:[] },
  checklist: [],            // צ'קליסט לפני טיסה (מהסקיל)
  pitfalls: [{trap, truth}],// מלכודות נפוצות (מהסקיל)
  israelNotes: { shabbat, seasons, kids }
}
```

### ממשק המנוע (TripPlannerEngine) — לוגיקה טהורה, אפס DOM/רשת
```js
plan(params) → result
// params: { kind:'israel'|'abroad'|'getaway'|'surprise',
//   days, nights?, month? /*1-12*/,
//   composition:{ type:'couple'|'family'|'friends'|'solo', kidsAges?:[] },
//   budgetLevel:'free'|'budget'|'mid'|'premium' | budgetTotal?,
//   style:'nature'|'attractions'|'food'|'mixed', region? /*israel*/,
//   origin? /*israel: נקודת מוצא — {name, lat?, lng?} או מחרוזת שם עיר. אם יש
//            קואורדינטות, המנוע מחשב מרחק/זמן-נסיעה לאזור ומשבץ בתוכנית*/,
//   destination? /*abroad id*/, important? /*getaway*/, avoid? /*surprise*/ }
// result.kind==='israel':  { trip /*סכמת TripLayer מלאה עם lat/lng אמיתיים*/, doc }
// result.kind==='abroad':  { trip:null, doc }
// result.kind==='getaway': { options:[3 × { title, lodging, doc }] }
// result.kind==='surprise':{ suggestions:[3 × { destination, why, estCost }] }
// doc = { title, overview, days:[{n,title,blocks:[{when,what,desc,cost?}],transport?,tip?,costPerDay?}],
//         budgetTable:[{cat,perDay,total}], packing:[], checklist:[], tips:[], lodging?, rainAlt? }
```

### ממשק האשף (TripPlannerUI)
```js
TripPlannerUI.open({ onSave:function(trip, doc){} })  // אשף מלא במודאל (מוסכמת ✕/ESC/רקע)
TripPlannerUI.showDoc(doc)                            // הצגת מסמך תוכנית שמור
```
- האשף שומר doc בתוך הטיול: `trip.doc = doc` (השדה אופציונלי בסכמת trips).
- טיולי חו"ל/אופציות getaway בלי קואורדינטות → נשמרים עם `days:[]` ו-doc מלא.

## סדר טעינה ב-index.html (באחריות C)
vendor/maplibre → tripmap/config.js → engine.js → street.js → controls.js → planner-data.js → planner-engine.js → planner-ui.js → trip-layer.js → index.js

## עמידות (חובה לכולם)
כל מודול בודק שהתלות שלו קיימת (`if (!window.TripMapEngine) …`) ומציג הודעה ידידותית
במקום לקרוס. אין רשת → המפה מציגה הודעת "נדרש חיבור אינטרנט למפה" — האפליקציה ממשיכה לעבוד.
