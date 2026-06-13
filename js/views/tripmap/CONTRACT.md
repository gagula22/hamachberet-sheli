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
config.js → engine.js → street.js → controls.js → planner-data.js → planner-engine.js → planner-ui.js → routing.js → trip-layer.js → index.js
(maplibre עצמו נטען עצל ע"י engine.js — לא ב-index.html. Leaflet נטען רק בקובץ ה-HTML המיוצא.)

## עמידות (חובה לכולם)
כל מודול בודק שהתלות שלו קיימת (`if (!window.TripMapEngine) …`) ומציג הודעה ידידותית
במקום לקרוס. אין רשת → המפה מציגה הודעת "נדרש חיבור אינטרנט למפה" — האפליקציה ממשיכה לעבוד.

---

# 📖 היסטוריית פיתוח, מצב נוכחי ונקודות המשך (handoff לסוכן הבא)

> **קרא את החלק הזה קודם.** הוא נותן תמונה מלאה: מה נבנה, באיזה סדר, מה עובד, מה
> המגבלות, ואיפה בדיוק להמשיך. הפיצ'ר עצמאי לחלוטין — אחריות משלו, namespaces משלו,
> CSS משלו, ו-guards שמריצים אותו בלי לקרוס גם אם מודול חסר. הנגיעות היחידות בקבצים
> משותפים: שורת SECTIONS אחת ב-app.js, תגיות ב-index.html, מפתח `trips` ב-store-schema.js,
> ושורת assertion ב-firebase-sync.js. **אפס התנגשות עם פיצ'רים אחרים.**

## איך לעבוד על הפיצ'ר הזה
- **לפני כל שינוי:** קרא את החוזה למעלה (ממשקים + בעלות קבצים) ואת ARCHITECTURE.md §9.
- **גע רק בקובץ שאחראי על הנושא** (טבלת הבעלות למעלה). תקשורת בין מודולים — רק דרך
  ה-namespaces על `window`.
- **כל שינוי:** `node --check` על הקובץ + הקפצת `?v=N` שלו ב-index.html (מוסכמת cache פר-קובץ).
- **בדיקה חיה:** preview על פורט 7788 (`.claude/launch.json` → "hamachberet"). ⚠️ חלון
  ה-preview רץ ברקע ומקפיא `requestAnimationFrame` — כדי לבדוק את המפה צריך shim:
  `window.requestAnimationFrame = function(cb){return setTimeout(function(){cb(performance.now());},16);};`
  ואז לנווט ל-`#/tripmap`. בדפדפן אמיתי אין צורך ב-shim.

## ציר זמן הפיתוח (יוני 2026, לפי קומיטים — מהישן לחדש)
1. **`feature: מפת טיולים`** — מפת MapLibre (לוויין Esri z19, terrain AWS, מבני
   OpenFreeMap), תצוגת רחוב (Google embed ללא מפתח), ניווט גוף-ראשון, פאנל טיולים +
   ייבוא JSON. נבנה ע"י 3 סוכנים (A/B/C) לפי החוזה הזה.
2. **`שמות רחובות/שכונות/ערים`** — שכבות symbol מ-OpenFreeMap + תוסף RTL מאורז; כפתור
   "🏷️ שמות"; מבני 3D שקופים יותר (opacity 0.55).
3. **`מתכנן טיולים עצמאי`** — ⭐ העברת כל הסקיל trip-planner-metakhnen-tiyulim לאתר,
   אפס תלות ב-LLM: planner-data (122 אטרקציות מאומתות Nominatim, 46 מסעדות, 40 לינה,
   12 יעדי חו"ל), planner-engine (4 מסלולים), planner-ui (אשף 3 שלבים). נבנה ע"י
   סוכנים D/E/F (הופעלו ברצף בגלל מגבלת מכסה).
4. **`נקודת מוצא`** — שדה "מאיפה יוצאים?" (38 ערים, נשמר ב-localStorage); המנוע מחשב
   מרחק/זמן-נסיעה מהבית לאזור.
5. **`ניתוב נסיעה אמיתי`** — routing.js (OSRM ציבורי): מסלול לפי כבישים במקום קו אווירי,
   מרחק/זמן/מספרי-כבישים, `handle.fitBounds` למיקוד.
6. **`ייצוא ל-HTML + הדפסת A4`** — מסמך HTML עצמאי (CSS מוטמע, A4, RTL) דרך iframe נקי;
   הדפסה אף פעם לא משתבשת.
7. **`התחלה/סוף/מספרים + מסלול חלופי + מפות בייצוא`** — סיכות 🚩/מספר/🏁 (engine.addMarker
   badge); כפתור "🔀 מסלול חלופי" (אחד בכל פעם, לא שניהם); מפה אינטראקטיבית (Leaflet) +
   גיבוי SVG אופליין לכל יום בקובץ המיוצא.
8. **`רציפות מסלול יומי`** (אחרון) — תיקון שתי סיבות-שורש לזיגזג: (א) `stops` נבנה
   כרונולוגית (צהריים בין בוקר לאחה"צ, לא נדחף לסוף) → אין קפיצה אחורה; (ב) `clusterIntoDays`
   מקבץ אטרקציות לימים גיאוגרפית-רציפים במקום לפי ניקוד.

## איך זה עובד — המנגנון לכל מודול (כדי לתקן/להרחיב בביטחון)
- **engine.js (`TripMapEngine`)** — `ensureLib()` מזריק את maplibre המקומי בטעינה עצלה
  (fallback ל-CDN) + רושם תוסף RTL. `create()` בונה **style אחד** עם כל המקורות, ומחליף
  לוויין/רחובות/3D דרך `visibility` של שכבות (לא setStyle) כדי לא לאבד markers/routes.
  3D = `setTerrain` (raster-dem terrarium) + `fill-extrusion` על שכבת building + pitch.
  `addMarker` עם `badge` בונה אלמנט-סיכה מותאם (מספר/🚩/🏁). `fitBounds` ממקד על נקודות.
- **routing.js (`TripRouting`)** — `route(coords)` שולח ל-OSRM הציבורי
  (`/route/v1/driving/...&geometries=geojson&steps=true&alternatives=true`), ומחזיר
  `{coords, distanceKm, durationMin, roads}` לכל מסלול (roads מחולץ מ-`steps[].ref`). cache
  פנימי לפי מפתח-קואורדינטות. נכשל → reject (הקורא נופל לקו אווירי).
- **planner-data.js (`TripPlannerData`)** — אובייקט נתונים סטטי בלבד (regions/attractions/
  restaurants/lodging/abroad/originCities/packing/checklist/pitfalls/israelNotes). קואורדינטות
  אמיתיות (מדגם אומת מול Nominatim).
- **planner-engine.js (`TripPlannerEngine.plan`)** — לוגיקה טהורה. israel: `pickRegion` →
  `candidateAttractions` (ניקוד לפי סגנון/הרכב/עונה/גיל) → **`clusterIntoDays`**: שרשרת
  nearest-neighbor מנקודת הבסיס, חתוכה לקטעים רצופים = ימים גיאוגרפית-קומפקטיים → לכל יום
  `orderGeographically` + בניית **ציר-זמן כרונולוגי** (בוקר→צהריים→אחה"צ→ערב) שממנו נגזרים
  `blocks` ו-`stops` *באותו סדר* (כך אין קפיצה אחורה). מסעדות: צהריים ליד אטרקציית הבוקר,
  ערב ליד הלינה. תקציב לפי priceNight/price/cost. abroad/getaway/surprise — ראה הקוד.
- **planner-ui.js (`TripPlannerUI`)** — אשף 3 מסכים במודאל; `plan()` נקרא במסך התוצאה.
  **ייצוא:** `buildStandaloneHTML` בונה מסמך עם CSS מוטמע (A4/RTL); הדפסה דרך **iframe נקי**
  (לא @media print על ה-DOM החי). `buildMapsSection` מנתב כל יום (TripRouting), מטמיע נתוני
  Leaflet + **SVG-גיבוי** אופליין; הסקריפט המוטמע מצייר Leaflet ומסתיר את ה-SVG כשהאריחים עולים.
- **trip-layer.js (`TripLayer`)** — פאנל הטיולים + ציור על המפה: `showTripOnMap` מצייר
  🚩התחלה (origin) + עצירות ממוספרות + 🏁סוף, ומנתב כל יום (`drawDayRoute` → רק המסלול
  הפעיל; `cycleRoute` מחליף לחלופי). `_drawToken` מבטל ציורים אסינכרוניים ישנים. שמירה ל-Store('trips').
- **index.js** — ה-view: פריסה, סרגל צף, חיפוש Nominatim, ו**ניהול חיים**: MutationObserver +
  Store.subscribe מזהים עזיבת ה-view ומריצים `cleanup` (destroy למפה, detach ל-controls,
  הסרת מאזיני window/resize) — אומת: אפס דליפה במעבר חוזר בין מסכים.

## מצב נוכחי — מה עובד (נבדק חי, אפס שגיאות קונסול)
- מפה 2D/3D, לוויין/רחובות, שמות, חיפוש Nominatim, תצוגת רחוב, ניווט גוף-ראשון.
- אשף תכנון מלא ל-4 המסלולים; טיול בארץ → עצירות+מסלול אמיתי על המפה; חו"ל → מסמך מלא.
- נקודת מוצא, התחלה/סוף/מספרים, מסלול חלופי כשזמין, ניתוב OSRM, ייצוא HTML+מפות, הדפסת A4.
- רציפות יומית: סדר כרונולוגי + קיבוץ גיאוגרפי.

## מגבלות ידועות (לא באגים — אילוצי ספקים חינמיים)
- **אין תלת-מימד פוטוריאליסטי לישראל** — גוגל לא פתחו 3D Tiles לארץ; הקוביות הן
  קווי-מתאר אמיתיים מ-OSM. ל"איך זה נראה" → תצוגת רחוב.
- **מסלולים חלופיים** — OSRM הציבורי מחזיר חלופה בעיקר למסלולי 2-נקודות; ביום רב-עצירות
  לרוב מסלול יחיד, אז כפתור החלופה יופיע רק כשבאמת קיימת חלופה.
- **מפות בייצוא** — האריחים נטענים מהרשת בפתיחת הקובץ (גיבוי ה-SVG עובד אופליין).
- **שבת** — בוטלה העדפת בחירת-אטרקציות לפי shabbatOpen (סתרה את הרציפות); אזהרת השבת
  הכללית נשמרה ב-tips.

## נקודות המשך פתוחות (מאיפה להמשיך)
- **ג' — ליטוש 2-opt** (לא בוצע, הוצע למשתמש): להריץ סידור-קצר-ביותר על *כל* נקודות
  היום יחד (כולל מסעדות) + פאס 2-opt ליישור הצטלבויות, תוך שמירת שעות. שיפור שולי אחרי
  א'+ב'. מקום: `planner-engine.js`, אזור בניית ה-timeline ב-`planIsrael`.
- **חלופות-מסלול מובטחות** — אם רוצים תמיד 2 חלופות: לעבור ל-OpenRouteService/GraphHopper
  (מפתח חינמי) או לבקש first→last עם alternatives. מקום: `routing.js` + `config.routing`.
- **ייצוא PDF ישיר** — כרגע "הדפס → שמור כ-PDF" של הדפדפן. אפשר כפתור PDF ייעודי.
- **שבת חכמה** — להחזיר העדפת shabbatOpen מבלי לפגוע ברציפות (למשל לבחור את היום שכבר
  עשיר ב-shabbatOpen כ"יום השבת").

## ⚠️ דפלוי — ידע תפעולי קריטי (אל תסיר!)
- האתר באוויר ב-**GitHub Pages** מענף `main` (root). פריסה = `git push origin main`.
- **קובץ `.nojekyll` בשורש חובה** — בלעדיו GitHub Pages מריץ Jekyll ש**מתעלם מתיקיות בשם
  `vendor`**, וכל `js/vendor/*` (maplibre, pdfjs, mammoth, chart, tesseract, firebase)
  מוחזר 404. הקובץ הזה מכבה את Jekyll ומגיש הכל סטטית. **לא למחוק אותו.**
- מוסכמת cache: `?v=N` פר-קובץ ב-index.html. ששינית קובץ → הקפץ את ה-`v` שלו.
- הבנייה הראשונה אחרי שינוי סוג (הוספת .nojekyll) לוקחת עד ~כמה דקות; אחרי זה ~1-2 דק'.

## איפה עצרנו (עדכני)
הכל מוטמע, נדחף ונפרס לאתר החי (gagula22.github.io/hamachberet-sheli, ענף main, נכון ל-13.6.2026).
אומת מקצה-לקצה: כל הקבצים מוגשים (200), 25 המסכים מרנדרים, אפס שגיאות קונסול, ניקוי משאבים
מלא במעבר בין מסכים, בידוד מקלדת/namespace/overlays, ו-`.nojekyll` תיקן את 404 ה-vendor.
git נקי ומסונכרן עם origin. **הצעד הבא תלוי בבקשת המשתמש** (ראה "נקודות המשך פתוחות" —
ג'/2-opt, חלופות מובטחות, ייצוא PDF, שבת חכמה).
