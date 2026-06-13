# CONTRACT — מנתח וויקוף עצמאי (wyckoff) · handoff

> פיצ'ר: **ניתוח קריפטו לפי שיטת וויקוף, רץ 100% בדפדפן — אפס תלות בקלוד, בסקיל,
> או בשרת.** העברנו את לוגיקת הסקיל `wyckoff-analyzer` למנוע-חוקים דטרמיניסטי ב-JS.
> אותה שיטת אחריות כמו tripmap: כל קובץ = אחריות אחת, namespace על window.

## למה זה קיים / ההחלטה המכוננת
הסקיל המקורי השתמש ב-**Claude (LLM)** כ"מוח" שקורא גרפים וכותב נרטיב. כדי שירוץ עצמאית
החלפנו את ה-LLM ב**מנוע-חוקים דטרמיניסטי** שמקודד את `method.md` (טבלאות SC/AR/VSA,
צ'ק-ליסט 8 שאלות). ⚠️ **זהו קירוב** — משתחזר ומהיר, אבל בלי השיפוט/נרטיב החופשי של LLM.
המשתמש אישר את הגישה הזו במפורש.

## בעלות על קבצים (SoC)
| קובץ | אחריות | namespace |
|---|---|---|
| `data.js` | משיכת נרות רב-טווחיים מ-Binance (fallback Bybit), נרמול | `window.WyckoffData` |
| `engine.js` | לוגיקת וויקוף טהורה: SC/AR, טווח, היצע/ביקוש, V/1%, צ'ק-ליסט, פסיקה, תרחישים | `window.WyckoffEngine` |
| `chart.js` | ציור נרות+נפח מוער (canvas): SC/AR, קווי טווח, מחיר נוכחי | `window.WyckoffChart` |
| `index.js` | ה-view: קלט סימבול → fetch → analyze → רינדור דוח + ייצוא PNG-base64 | (App.register) |
| `css/features/wyckoff.css` | עיצוב התצוגה החיה (CSS הייצוא מוטמע ב-index.js) | — |

נגיעות בקבצים משותפים: שורת SECTIONS ב-app.js, תגיות ב-index.html. אין מפתח Store
(כלי חי; הסימבול האחרון נשמר ב-localStorage `wyckoff.lastSymbol`).

## ממשקים
```js
WyckoffData.fetchAll(symbol, provider?) → Promise<{symbol,d,h4,h1,m15}>  // נרות [{t,o,h,l,c,v}] oldest→newest
WyckoffEngine.analyze(bundle) → { verdict:'GO'|'WAIT'|'NO-GO', verdictWhy, range:{sup,res,mid,width},
   tfs:{d,h4,h1}, overall, v1Table, checklist[8], scenarios[3], price, asof, money() }
WyckoffChart.draw(canvas, candles, {marks:{idx:'SC'}, sup, res, take?})
```
מקור נתונים: **Binance** (CORS אומת). Crypto.com חסום בדפדפן.

## איך זה עובד — המנוע (engine.js)
1. `detectSC` — נר נפח-שיא (≥1.7× ממוצע) ליד תחתית החלון, טווח רחב = Selling Climax.
2. `detectAR` — השיא הגבוה ב-7 נרות אחרי SC = תקרת הטווח.
3. טווח = שפל SC → שיא AR. מיקום המחיר בטווח קובע "בדיקת תקרה/תמיכה/דשדוש".
4. `controlRead` — מגמת נפח ירידות (Supply Decrease=שורי) מול נפח עליות (No Demand=דובי).
5. שלב: B ברירת-מחדל; C אם ספרינג (sweep+reclaim); D אם פריצה.
6. צ'ק-ליסט 8 שאלות → פסיקה: GO (אירוע C/D באזור + טריגר), NO-GO (סתירה), אחרת WAIT.
7. תרחישים מרמות הטווח: ספרינג-לונג, SOS-פריצה, UT-שורט — עם entry/SL/TP/RR.

## מצב נוכחי (נבדק חי על Binance)
זיהה נכון BTC: SC $59,131, AR $64,394, Phase B, פסיקה WAIT (מחיר בראש הטווח על נפח חלש) —
תואם לדוח הסקיל האמיתי. 3 גרפים מצוירים, ייצוא ל-HTML עם 3 PNG מוטמעים, אפס שגיאות
קונסול, ניקוי מלא במעבר בין מסכים.

## נקודות המשך פתוחות
- **דיוק SC/AR בטווחים נמוכים** (4H/1H) — כרגע אותה היריסטיקה; אפשר לכוונן ספים.
- **זיהוי ספרינג/UT בזמן-אמת** ב-15m לטריגר (כרגע שמרני — תמיד "חכה").
- **OI/פאנדינג** — לא זמין מ-Binance ספוט; אפשר להוסיף Binance Futures API.
- **אלטים מול BTC** — חוק הביטקוין (שאלה 7) ידני כרגע; אפשר למשוך BTC.D אוטומטית.
- **גרף 15m + אזורי כניסה** של התרחישים על הגרף.

## ⚠️ דפלוי
`.nojekyll` בשורש חובה (אחרת vendor/ → 404). cache: `?v=N` פר-קובץ. push origin main = live.
