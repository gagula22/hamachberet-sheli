# CONTRACT — מנתח וויקוף עצמאי (wyckoff) · handoff מלא לסוכן הבא

> **קרא קודם.** פיצ'ר: **ניתוח קריפטו לפי שיטת וויקוף, רץ 100% בדפדפן — אפס תלות
> בקלוד, בסקיל, או בשרת.** העברנו את לוגיקת הסקיל `wyckoff-analyzer` למנוע-חוקים
> דטרמיניסטי ב-JS. אותה שיטת אחריות כמו tripmap: כל קובץ = אחריות אחת, namespace על
> window, אפס התנגשות בפיצ'רים אחרים.
>
> **הפיצ'ר חי באתר** (gagula22/hamachberet-sheli) בשם **"ניתוח לפי וויקוף"** (סרגל-צד +
> כרטיס דשבורד + view `#/wyckoff`). מפיק **דוח של 3 מטבעות בדוח אחד: BTC · ETH · SOL**.

## למה זה קיים / ההחלטה המכוננת
הסקיל המקורי השתמש ב-**Claude (LLM)** כ"מוח" שקורא גרפים וכותב נרטיב. כדי שירוץ עצמאית
החלפנו את ה-LLM ב**מנוע-חוקים דטרמיניסטי** שמקודד את `method.md` (טבלאות SC/AR/VSA,
צ'ק-ליסט 8 שאלות). ⚠️ **זהו קירוב** — משתחזר ומהיר, אבל בלי השיפוט/נרטיב החופשי של LLM.
המשתמש אישר את הגישה הזו במפורש.

## ⚠️ שני כלי-וויקוף קיימים באתר — אל תבלבל!
1. **כרטיס הסחר הישן** (`js/views/dashboard/wyckoff/`, "📊 ניתוח Wyckoff — BTCUSDT.P",
   רקע BYBIT) — מבוסס **Cloudflare Worker** ש**דורש TradingView מותקן ופתוח** במחשב
   (לכידת גרפים). order=10 בדשבורד. tooltip מסביר זאת. **לא נגענו בו** מלבד tooltip+order.
2. **"ניתוח לפי וויקוף"** (הפיצ'ר הזה, `js/views/wyckoff/`) — **עצמאי, ללא תוכנה**, מ-Binance.
   order=15 (מתחת לישן, מעל "ביום הזה לפני"). tooltip מסביר את העצמאות.

## בעלות על קבצים (SoC)
| קובץ | אחריות | namespace |
|---|---|---|
| `data.js` | משיכת נרות 1D/4H/1H/15m מ-Binance (fallback Bybit), נרמול | `window.WyckoffData` |
| `engine.js` | לוגיקת וויקוף טהורה: SC/AR, טווח, היצע/ביקוש, V/1%, צ'ק-ליסט, פסיקה, תרחישים | `window.WyckoffEngine` |
| `chart.js` | ציור canvas: `draw` (נרות+נפח+SC/AR+קווי-טווח+חץ-ווליום) ו-`scenario` (סכמה צפויה) | `window.WyckoffChart` |
| `index.js` | ה-view: דוח 3 מטבעות + TOC + רינדור בתבנית הסקיל + ייצוא + כרטיס דשבורד | (App.register) |
| `css/features/wyckoff.css` | עיצוב חי (תבנית הסקיל ממוקדת `.wk-report`); CSS-הייצוא מוטמע ב-index.js | — |

נגיעות בקבצים משותפים: שורת SECTIONS ב-app.js; תגיות ב-index.html; מיון ווידג'טים
(`fn.order`) ב-`dashboard/index.js`; tooltip+order בכרטיס הישן `dashboard/wyckoff/card.js`.
אין מפתח Store (כלי חי בלבד).

## ממשקים (מעודכן)
```js
WyckoffData.fetchAll(symbol, provider?) → Promise<{symbol,d,h4,h1,m15}>   // [{t,o,h,l,c,v}] oldest→newest
WyckoffEngine.analyze(bundle, {btcBias?}) → { verdict, verdictWhy, range:{sup,res,mid,width},
   tfs:{d,h4,h1}, overall, m15read, alerts[], v1Table, checklist[8], scenarios[3], price, asof, money() }
   // scenarios[i]: {kind:'long'|'break'|'short', title, tf, cond, trigger, entry, sl, tp1, tp2, tp3, rr}
WyckoffChart.draw(canvas, candles, {marks, sup, res, take?, levels?, volNote?})
   // volNote:{slope:-1|0|1, text, color} — חץ מגמת-נפח על ההיסטוגרמה
WyckoffChart.scenario(canvas, real4hCandles, scenario, money)
   // בונה מסלול צפוי סכמטי על 20 נרות 4H אמיתיים (buildPath) + ווליום-תאוריה
```
מקור נתונים: **Binance** (CORS אומת). Crypto.com חסום בדפדפן.

## איך זה עובד — המנוע (engine.js)
1. `detectSC(candles, win)` — מאתר את השפל המבני בחלון (יומי=40, 4H/1H=50), מעדיף נר
   נפח-שיא בסביבתו. שפל ב-3 הנרות האחרונים = עדיין יורד → אין טווח (-1).
2. טווח: תמיכה = שפל ה-SC; התנגדות = **השיא הגבוה מאז ה-SC**. `detectAR` = השיא ב-7 נרות
   אחרי SC (לסימון בלבד).
3. `controlRead` — מגמת נפח ירידות (Supply Decrease=שורי) מול עליות (No-Demand=דובי).
4. שלב A–E; תרחישים מרמות הטווח (ספרינג/SOS/UT) עם entry/SL/3 יעדים/RR.
5. צ'ק-ליסט 8 שאלות → פסיקה GO/WAIT/NO-GO. שאלה 7 (יישור BTC): לאלטים נגזרת מ-`opts.btcBias`
   (ב-3 מטבעות: מנתחים BTC קודם, ומעבירים את ההטיה היומית שלו ל-ETH/SOL — חוק הביטקוין).

## איך זה עובד — התצוגה (index.js)
- **דוח 3 מטבעות**: `run()` מושך BTC+ETH+SOL במקביל, מנתח (ETH/SOL עם btcBias של BTC),
  בונה 7 גרפים לכל מטבע, ומרנדר `buildReport3` (TOC + 3 `coinBlock`).
- **7 גרפים לכל מטבע**: 3 בקרה (יומי 50 נרות / 4H 60 / 1H 50) + 15m + 3 תרחישים.
- **גרף בקרה**: רקע **בהיר**, SC/AR מסומנים, קווי טווח, ו**חץ מגמת-נפח** (volNoteFor) על
  ההיסטוגרמה (ביקוש דועך=ענבר / היצע יורד=ירוק / היצע גובר=אדום / מעורב=אפור).
- **גרף תרחיש** (`WyckoffChart.scenario`): **20 נרות 4H אמיתיים** + מסלול צפוי סכמטי
  (`buildPath`) לפי וויקוף — שטיפה→שיא-נפח→התייבשות→מארקאפ (ספרינג); פריצה→BU→מארקאפ (SOS);
  UTAD→LPSY→מארקדאון (שורט) — עם ווליום-תאוריה, קו מפריד "אמיתי | צפוי ◄", וקווי כניסה/SL/יעד.
- **זמן הפקה אמיתי**: "✓ הופק עכשיו: DD.MM.YYYY HH:MM:SS" (`new Date()` בדפדפן) + toast —
  השניות משתנות בכל לחיצה ⇒ הוכחת ריצה טרייה (לא שעת הנר).
- **תבנית הסקיל**: header+verdict לחיץ, טבלת רב-טווחים, "מי שולט", 15m, תרחישים+התראות,
  צ'ק-ליסט לחיץ→מודאל, מסקנה. ⚠️ ה-CSS של הסקיל גלובלי → ממוקד תחת `.wk-report` בתצוגה
  החיה; גרסה לא-ממוקדת ב-`EXPORT_CSS` לקובץ הייצוא. גרפים כ-PNG (canvas→toDataURL).

## מצב נוכחי (נבדק חי, אפס שגיאות קונסול)
דוח 3 מטבעות מלא: BTC/ETH/SOL × 7 גרפים = 21; טווחים זוהו (BTC ~59.1K–64.4K,
ETH ~1.54K–1.78K, SOL ~61–69); חץ-ווליום בכל טווח; גרפי תרחיש על 20 נרות 4H; זמן הפקה
אמיתי; ייצוא HTML עצמאי תקין; כרטיס דשבורד "ניתוח לפי וויקוף" (order=15) + tooltips.

## יומן פיתוח (סדר השלבים — מהישן לחדש)
1. data+engine+chart+index בסיסי (מטבע יחיד, מנוע-חוקים, Binance).
2. דוח בתבנית הסקיל המדויקת + כפתור דשבורד.
3. השלמת פריטים: סעיף 15m, גרף לכל תרחיש, התראות, 3 יעדים.
4. **דוח 3 מטבעות** (BTC·ETH·SOL) + TOC + זמן-הפקה אמיתי + גרפים בהירים + יישור-BTC לאלטים.
5. `detectSC` חזק יותר (מזהה טווח גם ל-ETH/SOL); resistance=שיא מאז SC.
6. גרפי תרחיש **סכמטיים** (`WyckoffChart.scenario` + `buildPath`) — מסלול צפוי לפי וויקוף.
7. **חץ מגמת-ווליום** (volNote) על גרפי יומי/4H/1H.
8. גרף יומי 50 נרות; גרפי תרחיש על 20 נרות 4H אמיתיים.
9. שם מאוחד **"ניתוח לפי וויקוף"** + tooltip עצמאות; מיון דשבורד (order); tooltip TradingView
   לכרטיס הישן.

## נקודות המשך פתוחות (מאיפה להמשיך)
- **OI/פאנדינג** — לא זמין מ-Binance ספוט; אפשר Binance Futures API (שאלה 8 כיום "לא נבדק").
- **זיהוי ספרינג/UT בזמן-אמת ב-15m** לטריגר (כיום שמרני — "חכה"); ⇒ אז verdict GO אמיתי.
- **כוונון ספי SC/AR** ל-4H/1H (אותה היריסטיקה לכל הטווחים).
- **BTC.D אוטומטי** לחיזוק חוק הביטקוין (שאלה 7).
- **בחירת מטבעות** — כרגע BTC/ETH/SOL קבועים; אפשר שדה הוספת מטבע.
- **כוונון ויזואלי של buildPath** אם המשתמש ירצה מסלול/ווליום שונה בתרחישים.

## ⚠️ דפלוי
`.nojekyll` בשורש **חובה** (אחרת Jekyll מתעלם מ-vendor/ → 404). cache: `?v=N` פר-קובץ —
ששינית קובץ, הקפץ את ה-v ב-index.html. `git push origin main` = פריסה ל-live (GitHub Pages).
בדיקה חיה: preview פורט 7788 + shim ל-rAF (חלון מוסתר מקפיא אנימציות):
`window.requestAnimationFrame=function(cb){return setTimeout(function(){cb(performance.now());},16);};`
⚠️ **לא** לכתוב לתיקיית `מחברת/wyckoff/` (שייכת לכלי ה-Worker הישן). דוחות הייצוא יורדים ל-Downloads.
