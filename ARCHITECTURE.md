# ARCHITECTURE — מפת אחריות (Separation of Concerns)

> **העיקרון:** כל חלק = אחריות אחת ויחידה. כדי לשנות נושא מסוים — נוגעים **רק** בקובץ
> שאחראי עליו. אסור לערבב אחריות. שינוי בנושא אחד לא אמור לגעת בקוד של נושא אחר.
>
> **כלל עבודה:** לפני כל שינוי — מאתרים במפה למטה מי האחריות, ועובדים רק שם.

עודכן: יוני 2026 · ענף עבודה: `main` (הרפקטור מוזג והוטמע)

---

## 1. מבנה הקבצים לפי אחריות

```
מחברת/
├── index.html                       טוען את כל המודולים לפי סדר תלות
│
├── css/
│   ├── tokens.css                   משתני CSS (צבעים, פונטים, spacing)
│   ├── layout.css                   sidebar, topbar, grid ראשי
│   ├── components.css               בסיס משותף (card/btn/grid/chip/stat) + features קטנים + responsive
│   └── features/
│       └── notebook.css             ⭐ כל העיצוב של המחברת בלבד (ribbon, עורך, נושאים, תגיות)
│
├── js/
│   ├── app.js                       bootstrap + hash-router + רשימת SECTIONS
│   ├── store.js                     אחסון (IndexedDB/localStorage) + state + ייצוא/ייבוא JSON
│   ├── firebase-config.js           הגדרות Firebase
│   ├── store-schema.js              ⭐ מקור-אמת יחיד למודל הנתונים (default+sync+merge לכל key)
│   ├── firebase-sync.js             לוגיקת סנכרון + זרימת התחברות (login modal נשאר עם ה-auth)
│   ├── firebase-ui.js               ⭐ UI של הסנכרון: באנר, שבב סטטוס, כפתור סנכרון, סרגל משתמש
│   │
│   ├── components/
│   │   ├── sidebar.js               ניווט בלבד (רישום הסקשנים + active state)
│   │   ├── data-transfer.js         ⭐ בר גיבוי: ייצוא/ייבוא/הדבקת JSON → window.DataBackup
│   │   ├── html-to-pdf.js           ⭐ מנוע משותף: HTML → קובץ PDF אמיתי (רינדור html2canvas + עימוד לפי בלוקים) → window.HtmlToPdf
│   │   └── editable/                רכיב עריכה משותף (מחברת + הערות)
│   │       ├── utils.js             debounce, compressImage            → window.EditableUtils
│   │       ├── image.js             ⭐ תמונות/צילומי-מסך: הדבקה, הוספה, figures, גרירה, snap
│   │       │                                                            → window.EditableImage
│   │       └── index.js             מרכיב את הממשק הציבורי              → window.Editable
│   │
│   └── views/                       כל view = נושא אחד, נרשם דרך App.register(id, render)
│       ├── dashboard/
│       │   ├── index.js             לוח הבקרה. מארח גנרי — מרנדר widgets מ-window.DASHBOARD_WIDGETS.
│       │   │                        אינו יודע דבר על Wyckoff.
│       │   └── wyckoff/             "הפקת ניתוח/דוח" — מנותק לחלוטין מהמחברת
│       │       ├── config.js        קבועים: WORKER_URL, fallbacks, intervals  → window.WyckoffConfig
│       │       ├── api.js           תקשורת Worker (trigger/progress/watchlist), בלי DOM → window.WyckoffAPI
│       │       ├── progress-modal.js  UI של מודאל ההתקדמות
│       │       ├── symbol-picker.js   UI של בורר המטבעות               → window.Wyckoff
│       │       └── card.js          הכרטיס בדשבורד — רושם את עצמו ל-DASHBOARD_WIDGETS
│       │
│       ├── notebook/
│       │   ├── index.js             עץ הנושאים + layout/sidebar. חושף window.nbTree / nbCore / nbActive
│       │   ├── editor.js            ⭐ העורך: contenteditable, undo/redo, toolbar, טבלאות → window.nbEditor
│       │   ├── media.js             ⭐ תמונות/קבצים/טבלאות/בלוקי mood   → window.nbMedia
│       │   └── export.js            ⭐ הפקת מסמך: תבניות, mood, ייצוא Word/PDF → window.nbExport
│       │
│       ├── tools/                   view "כלים" — כל כלי עצמאי לחלוטין
│       │   ├── word-to-pdf/index.js          → window.Tools.wordToPdf (משתף components/html-to-pdf.js)
│       │   ├── pdf-to-word/index.js           → window.Tools.pdfToWord (טקסט נערך+שחזור Win-1255 / מראה-מדויק; ראה §6)
│       │   ├── pdf-ops/              ⭐ פעולות PDF מקומיות (pdf-lib מאורז ב-js/vendor) — אפס העלאה
│       │   │   ├── shared.js         ensureLib/ensureZip/download/dropzone/parseRanges → window.PdfOps (pdf-lib+JSZip מאורזים)
│       │   │   ├── merge.js  split.js  delete.js  rotate.js → window.Tools.pdf{Merge,Split,Delete,Rotate}
│       │   │   ├── pdf-to-jpg.js      רינדור עמודים→JPG (zip ל-רב-עמודי) → window.Tools.pdfToJpg
│       │   │   ├── img-to-pdf.js      JPG/PNG→PDF (pdf-lib)               → window.Tools.imgToPdf
│       │   │   ├── compress.js        דחיסה ע"י רסטור עמודים→JPG          → window.Tools.pdfCompress
│       │   │   ├── flatten.js         שיטוח טפסים (pdf-lib form.flatten)  → window.Tools.pdfFlatten
│       │   │   ├── unlock.js          הסרת הגבלות בעלים (re-save)         → window.Tools.pdfUnlock
│       │   │   └── ocr.js             PDF סרוק→Word נערך, OCR עברי מקומי (Tesseract.js מאורז ב-js/vendor/tesseract) → window.Tools.pdfOcr
│       │   ├── pdf-translator/
│       │   │   ├── translate.js     מנוע התרגום הטהור   → window.PTR_ENGINE
│       │   │   └── index.js         UI + תזמור           → window.Tools.pdfTranslator
│       │   └── video-transcriber/   → window.Tools.videoTranscriber
│       │       ├── utils.js         פונקציות טהורות      → window.VT_UTILS
│       │       ├── audio.js         פענוח PCM/WAV        → window.VT_AUDIO
│       │       ├── mp3.js           ניתוח/חיתוך MP3      → window.VT_MP3
│       │       ├── worker-api.js    תקשורת Cloudflare    → window.VT_WORKER
│       │       ├── ffmpeg.js        חיתוך/חיבור וידאו    → window.VT_FFMPEG
│       │       ├── save.js          שמירת קבצים          → window.VT_SAVE
│       │       ├── ui-toast.js      התראות צפות          → window.VT_TOAST
│       │       └── index.js         main UI + whisper (מחזיק whisper state)
│       │
│       ├── assistant/              ⭐ העוזר החכם — אחריות עצמאית, 100% מקומי (אפס רשת/כתיבה)
│       │   ├── knowledge.js         ידע-עזרה סטטי על כל פיצ'ר/כפתור        → window.AsstKnowledge
│       │   ├── engine.js            טוקנייזר עברי + אינדוקס Store + חיפוש מדורג + תשובות מחושבות → window.AsstEngine
│       │   └── ui.js                כפתור צף + פאנל צ'אט + view 'assistant'  → window.Assistant
│       ├── stickers.js              מעטפת "כלים": hero + רשת אריחים לפי קטגוריה; כל אריח פותח את הכלי ב-MODAL מוקפץ (✕/ESC/רקע). הכרטיסים נבנים lazily ונשמרים. קורא ל-window.Tools.*
│       ├── calendar.js              ניתוב יומן → daily/weekly/monthly
│       ├── daily.js weekly.js monthly.js   תצוגות יומן
│       └── notes.js todos.js habits.js mood.js water.js budget.js goals.js
│
└── wyckoff/                         נתוני דוחות (גרפים, דוחות HTML, watchlist.json) — לא קוד אפליקציה
```

⭐ = אחריות שחולצה לקובץ ייעודי במהלך הרפקטור.

---

## 2. "איפה משנים מה" — מדריך מהיר

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| כתובת ה-Worker של Wyckoff / רשימת מטבעות ברירת-מחדל | `dashboard/wyckoff/config.js` |
| איך מדברים עם ה-Worker (endpoints, fetch) | `dashboard/wyckoff/api.js` |
| מראה מודאל ההתקדמות של הניתוח | `dashboard/wyckoff/progress-modal.js` |
| מסך בחירת המטבע | `dashboard/wyckoff/symbol-picker.js` |
| הכרטיס של Wyckoff בדשבורד | `dashboard/wyckoff/card.js` |
| הלוח-בקרה עצמו (סטטיסטיקות, גריד) | `dashboard/index.js` |
| הדבקת/הוספת **צילום מסך** או תמונה (כללי) | `components/editable/image.js` |
| תמונות/קבצים/טבלאות במחברת | `notebook/media.js` |
| ייצוא מחברת ל-Word/PDF, תבניות, mood | `notebook/export.js` |
| עריכת טקסט במחברת (עורך, toolbar, undo, טבלאות) | `notebook/editor.js` |
| עץ הנושאים / סרגל צד של המחברת | `notebook/index.js` |
| כלי תמלול — לוגיקת אודיו / mp3 / whisper / ffmpeg | `tools/video-transcriber/<האחריות>.js` |
| כלי המרת PDF↔Word / תרגום PDF | `tools/<הכלי>/index.js` |
| יצירת קובץ PDF מ-HTML (מחברת + Word→PDF) | `components/html-to-pdf.js` (`window.HtmlToPdf`) |
| עיצוב המחברת | `css/features/notebook.css` |
| עיצוב משותף (כפתורים, כרטיסים) | `css/components.css` |
| מודל הנתונים — default/סיווג-סנכרון לכל key | `store-schema.js` |
| אחסון מקומי / לוגיקת מיזוג בענן | `store.js` · `firebase-sync.js` |
| UI של הסנכרון (באנר, סטטוס, כפתור, סרגל משתמש) | `firebase-ui.js` |
| העוזר החכם — ידע/הסברי-עזרה | `js/views/assistant/knowledge.js` |
| העוזר החכם — חיפוש/דירוג/תשובות מחושבות | `js/views/assistant/engine.js` |
| העוזר החכם — כפתור צף / פאנל / view / עיצוב | `js/views/assistant/ui.js` · `css/features/assistant.css` |

---

## 3. מוסכמות חיווט (Wiring)

- **רישום view:** כל view קורא `App.register('id', renderFn)` פעם אחת.
- **תקשורת בין מודולים:** דרך אובייקט namespace על `window` (למשל `window.nbMedia`).
  קובץ צרכן "מייבא" בשורה אחת בראש ה-IIFE: `var x = window.NS.x;` (rebind) — כך **אפס שינוי ב-call-sites**.
- **State משתנה (mutable):** נשאר תמיד בקובץ אחד עם כל הקוראים/כותבים שלו. לא מועבר by-value בין קבצים.
- **סדר טעינה ב-index.html:** קודם תלויות, אחר כך הצרכנים (utils → audio/save → worker → mp3 → ui → index).
- **Widgets בדשבורד:** פיצ'ר שרוצה כרטיס בדשבורד דוחף פונקציית-render ל-`window.DASHBOARD_WIDGETS`.
  הדשבורד מרנדר את כולן — בלי לדעת מה הן.

---

## 4. טרם הופרד (TODO — לפי סדר עדיפות/סיכון)

| נושא | סטטוס | סיכון |
|---|---|---|
| ליבת ה-notebook | ✅ editor.js חולץ. tree+layout נשארו ב-index.js (מלוכדים, 510 ש' — תקין) | — |
| firebase auth-UI | ✅ UI חולץ ל-`firebase-ui.js` (באנר/סטטוס/כפתור/סרגל). login modal נשאר עם ה-auth (מכוון) | — |
| איחוד `insertImage` | ✅ נותב למימוש הקנוני (editable/image.js). מימושי media.js הישנים = dead code | — |
| `store-schema` | ✅ `store-schema.js` = מקור-אמת; defaults + key-lists נגזרים ממנו + assertion קשיח | — |
| `sidebar.js` → הפרדת ייצוא/ייבוא | ✅ בר הגיבוי חולץ ל-`data-transfer.js` (window.DataBackup) | — |
| גרסת cache גלובלית | ⏸️ **הוחלט לא לבצע** — `?v=N` פר-קובץ עדיף ל-caching (רק קובץ ששונה נטען מחדש). גרסה גלובלית = כל הקבצים נטענים מחדש בכל שינוי. לשקול רק אם קונפליקטים על מספרי-גרסה ב-branches מקבילים ייהפכו לכאב אמיתי | — |

---

## 5. רשת ביטחון
- כל שינוי = commit נפרד. חזרה: `git revert <sha>` או checkout לקומיט קודם.
- גיבוי מלא: `מחברת-backup-2026-06-03/`.
- אחרי כל שינוי: `node --check` + סריקת הפניות + בדיקה חיה (preview port 7788) + אפס שגיאות קונסול.

---

## 6. ייצוא מסמכים — פרטי מימוש (`notebook/export.js`, `window.nbExport`)

> כל מה שקשור לייצוא Word/PDF נמצא **רק כאן**. אל תיגע בעורך (`editor.js`) או בתמונות
> (`image.js`) כדי לשנות התנהגות ייצוא.

**צינור משותף (`exportDoc`)** בונה `body` HTML אחיד משני הפורמטים:
- **תמונות ברוחב מלא:** כל `figure.nb-img` מומר ל-`<table>` (העטיפה היחידה ש-Word שומר
  על עמוד אחד). ה-`<img>` מקבל **רוחב כפול**: `style="width:100%"` (לדפדפן/PDF) **וגם**
  `width`/`height` בפיקסלים = שטח התוכן של A4 (~670px). הכרחי כי **Word מתעלם מ-`%` על תמונות**
  ונופל לגודל הפיקסלים המקורי → גלישה. הדפדפן מתעלם מתכונות ה-px כי ה-`style` גובר.
- גופן 11pt, מעברי-עמוד (`nb-page-spacer` → `page-break-after`), שיטוח `<div>` → `<p>`.

**ייצוא Word (`format==='word'`):** Blob עם MIME `application/msword` + הוראות MSO.
גאומטריית A4 דרך `@page Section1` (שוליים 1.5 ס"מ) + עטיפת `<div class="Section1">`.
הורדה אוטומטית `<שם המחברת>.doc`.

**ייצוא PDF (`format==='pdf'`):** **יצירת PDF אמיתי + הורדה אוטומטית** `<שם המחברת>.pdf`
(כמו Word, בלי חלון שמירה). `exportPdfFile` מאצל למנוע המשותף `window.HtmlToPdf.generate`
(`components/html-to-pdf.js`) — אותו מנוע משמש גם את כלי Word→PDF. מה המנוע עושה:
1. **טעינה עצלה** של `html2canvas` + `jsPDF` מ-CDN (`ensureLibs`, נטען פעם אחת).
   הספרייה המקומית `vendor/html2pdf` **שבורה** (דף ריק) — לא בשימוש.
2. **רינדור בפעם אחת** של כל התוכן ל-canvas יחיד עם **`width`/`windowWidth=680` מפורשים**.
   ⚠️ קריטי: בלי זה html2canvas חותך לרוחב ה-viewport → טקסט עברית נחתך בצד ושורות חופפות.
   רינדור בלוק-בלוק *גם* מעוות RTL — חייב פאס אחד.
3. **חיתוך לעמודים רק בגבולות בלוקים** (תחתית כל ילד ישיר): מעבר עמוד אף פעם לא חותך
   פסקה/תמונה. בלוק גבוה מעמוד → חיתוך קשיח (נדיר).
4. **fallback:** אם ה-CDN חסום (רשת עבודה) → `exportPdfViaPrint` (שמור-כ-PDF של הדפדפן,
   עם החלפת `document.title` לשם המחברת כברירת-מחדל).
- מגבלה ידועה: ב-PDF הטקסט הוא תמונה (לא בר-חיפוש). למי שצריך טקסט בר-חיפוש → Word.

**כלי Word→PDF (`tools/word-to-pdf/index.js`):** טוען .doc/.docx (mammoth → HTML, תמונות כ-base64),
מציג תצוגה מקדימה, וביצוא קורא ל-`HtmlToPdf.generate(..., {dir:'auto'})` — הורדה אוטומטית בשם
הקובץ, תמונות ברוחב מלא בלי חיתוך/גלישה. החליף את מודאל ההדפסה המסורבל הישן.

**כלי PDF→Word (`tools/pdf-to-word/index.js`):** מפיק **Word נערך** (HTML-as-.doc, application/msword).
חילוץ דרך PDF.js: `getTextContent` (טקסט+גיאומטריה) + `getOperatorList` (צבע/הדגשה/תמונות). משחזר
שורות→פסקאות/כותרות/רשימות, **צבע טקסט + הדגשות רקע** (מתאם מלבני-fill מ-operator-list מול תיבות הטקסט),
**Bold/Italic**, ותמונות מוטמעות במקומן (מפענח עמיד כולל 1bpp packed + ImageBitmap/JPEG).
⚠️ **זיהוי-אוטומטי:** PDF ללא שכבת טקסט (סרוק/מבוסס-תמונה, כמו ייצוא-PDF של המחברת) → לא ניתן לחלץ ממנו
טקסט; הכלי מזהה (`totalTextChars<12`), מטמיע את תמונות העמודים, ומציג הודעה ברורה שמפנה ל"ייצוא ל-Word"
של המחברת. *(נבנה ע"י workflow רב-סוכנים — מימוש מנצח שנבחר ע"י judge; ראה memory.)*

---

## 7. אחריויות חדשות (תוספות Fable 5) — כל אחת תיקייה עצמאית

> חמש אחריויות שנוספו ביוני 2026. כל אחת חיה בתיקייה משלה + CSS משלה + namespace משלה,
> והנגיעות היחידות בקבצים קיימים: שורת SECTIONS ב-app.js ותגיות ב-index.html.
> מנגנוני הרחבה רכים: `window.DASHBOARD_WIDGETS` (קיים) ו-`window.SETTINGS_CARDS` (חדש).

**ערכת נושא (`js/features/theme/`, `window.Theme`):** `boot.js` רץ סינכרונית ב-`<head>` לפני
ה-CSS — קורא מראה מ-`localStorage('mahberet.theme')` ומחיל `data-theme`/`data-fs` על `<html>`
לפני הציור הראשון (אפס הבזק). `index.js` — API (`set`/`setFontSize`), סנכרון דו-כיווני עם
`Store.settings` (Store מנצח אחרי `ready()` — מכסה ייבוא/שחזור), מצב `auto` שעוקב אחרי
`prefers-color-scheme`, עדכון `<meta theme-color>` ואירוע `themechange`. **כל ההתאמות לכהה
רק ב-`css/features/theme-dark.css`** — דריסת טוקנים תחת `[data-theme=dark]` + דריסות נקודתיות
לצבעים קשיחים של layout/components (אסור לערוך אותם). ⚠️ החלטת עיצוב: דף העורך וגוף ההערה
נשארים בהירים גם בכהה (טקסט שהמשתמש צבע חייב להישאר קריא).

**מסך הגדרות (`js/views/settings/index.js`, view `settings`):** שם משתמש (מזין את הברכה
הקיימת — `app.js` כבר קרא `settings.userName`), בורר ערכה, גודל טקסט. חושף את
**`window.SETTINGS_CARDS`** — מערך פונקציות-רינדור שמודולים אחרים דוחפים אליו כרטיס
(מקביל ל-DASHBOARD_WIDGETS, עם try/catch סביב כל כרטיס).

**לוח תובנות (`js/views/insights/`, view `insights`):** `charts.js` — 5 בוני גרפים קריאה-בלבד
(מצב רוח 30 יום, התמדה בהרגלים 8 שבועות, הוצאות לפי קטגוריה, הכנסות/הוצאות 6 חודשים, מים+שינה);
צבעים/פונט נקראים מטוקני CSS בזמן בנייה → כהה נכון אוטומטית. `index.js` — טעינה עצלה של
**Chart.js 4.4.3 (MIT, `js/vendor/chart.umd.min.js`, לעולם לא ב-index.html)**, וניהול חיים בלי
unmount-hook: הריסת גרפים בכל רינדור + `Store.subscribe` שבודק `document.contains` ומתנתק לבד
+ בנייה מחדש ב-`themechange`.

**חיפוש מהיר (`js/features/palette/index.js`, `window.Palette`):** לא view — אין שינוי ב-app.js.
Ctrl/Cmd+K ב-capture מכל מקום (העורך מיירט רק z/s/y/חצים — אין התנגשות); `/` רק מחוץ לשדות.
שלושה מקורות קריאה-בלבד: `App.sections` החי, `AsstEngine.searchContent` (מיחזור מנוע הבוט,
מדולג בשקט אם חסר), ופעולות מהירות. Esc סוגר עם stopPropagation (לא מפעיל יציאה ממצב מיקוד).

**קול (`js/features/voice/`):** `dictation.js` (`window.VoiceDictation`) — כפתור 🎤 מוזרק לסרגל
המחברת **בלי לערוך את המחברת**: MutationObserver על `#view` מאתר `.nb-ribbon:not([data-voice])`
בכל בנייה-מחדש ומוסיף קבוצה משלו (אידמפוטנטי; אם הסרגל ישתנה — הפיצ׳ר פשוט לא יופיע).
Web Speech he-IL; טקסט סופי דרך `execCommand('insertText')` → שמירה/undo של העורך בחינם;
ביניים בבועה צפה בלבד. `memos.js` (view `voice`, `window.VoiceMemos`) — MediaRecorder
(webm/opus→mp4 fallback), בלובים ב-**IndexedDB משלו (`hamachberet-voice`)** — אפס נגיעה
ב-Store/סכימה כדי שאודיו לא ינפח localStorage/סנכרון.

**גיבוי אוטומטי (`js/features/autobackup/index.js`, `window.AutoBackup`):** צילום יומי מלא של
`Store.get()` ל-IndexedDB משלו (`hamachberet-backups`), שמירת 14; שחזור = צילום-בטיחות ←
`Store.importJSON(File)` (המסלול המוכח של data-transfer) ← reload. UI = כרטיס ב-SETTINGS_CARDS
(תלות רכה — הגיבוי רץ גם בלי מסך ההגדרות).

---

## 8. עשר התוספות (יוני 2026) — אחריות נפרדת לכל אחת

> CSS של כולן ב-`css/features/extras.css` (בלוק נפרד לכל אחריות). עוזר משותף חדש:
> `js/components/topic-open.js` (`window.TopicOpen.open(tid)`) — פותח נושא מחברת מכל מקום
> דרך `window._nbWikiClick` שהמחברת חושפת. מפתחות Store חדשים (store-schema +
> עדכון האסרציה ב-firebase-sync): `readingList`/`flashcards` (subcol), `eisenhower`/`weeklyReviews` (maindoc).

- **קישורים-חוזרים** `js/features/backlinks/` — פאנל "מי מקשר לכאן" מוזרק ל-`.nb-stage` דרך
  MutationObserver (אפס עריכה במחברת); קישורים מפורשים (data-tid) + אזכורי-שם. הנושא הפעיל
  מזוהה מ-`.nb-topic.active` + `nbTree`.
- **מפת קשרים** `js/views/graph/` (view `graph`) — SVG ידני: פריסת-כוחות, צמתים=נושאים,
  קשתות=ויקי+היררכיה, זום/הזזה דרך viewBox, לחיצה → TopicOpen.
- **"ביום הזה לפני…"** `js/features/onthisday/` — כרטיס DASHBOARD_WIDGETS: מצב רוח/הערות/נושאים
  מלפני שבוע/חודש/שנה (השוואת updatedAt מקומית).
- **סקירה שבועית** `js/views/weekly-review/` (view, מפתח `weeklyReviews`) — סיכום שבוע, רפלקציה,
  העברת משימות-יומן פתוחות +7 ימים (עיגון T12:00 — dateKey הוא UTC!). כתיבה ל-tasks = פעולת
  משתמש מפורשת (חריגה מתועדת).
- **מטריצת אייזנהאואר** `js/views/eisenhower/` (view, מפתח `eisenhower` = map todoId→רבע) —
  4 רבעים + מגירה, גרירה; סימון-בוצע כותב ל-todos (פעולת משתמש מפורשת).
- **לוח שרטוט** `js/views/sketch/` (view `sketch`) — Canvas API נקי (עט/קו/חץ/מלבן/עיגול/מחק,
  undo 30); "הוסף למחברת" = בורר נושא/מחברת-חדשה ← מוסיף `figure.nb-img` ל-body (התנהגויות
  התמונה של העורך נדבקות אוטומטית בפתיחה).
- **כרטיסיות זיכרון** `js/views/flashcards/` (view, מפתח `flashcards`) — חזרה מרווחת פשוטה:
  כישלון→מחר, הצלחה→המדרגה הבאה ב-[1,3,7,15,30,60,120].
- **מרכז הדגשות** `js/views/highlights/` (view) — DOMParser על topics+notes, חילוץ אלמנטים עם
  background-color אינליין (לא לבן), קיבוץ לפי מקור, קפיצה דרך TopicOpen/openNoteId.
- **סריקת מסמך** `js/views/tools/doc-scan/` (אריח בכלים, `window.Tools.docScan`) — מצלמה/קובץ ←
  Tesseract heb+eng מקומי (⚠️ נתיבי vendor חייבים להיות מוחלטים — `location.origin+…` — יחסיים
  נשברים בתוך ה-Worker) ← טקסט לעריכה ← בורר מחברת קיימת/חדשה-בשם ← עמוד-בן חדש (אייקון 📷).
- **רשימת קריאה** `js/views/readinglist/` (view, מפתח `readingList`) — קישור+כותרת+תגית,
  לשוניות לקריאה/נקראו/הכול.

---

## 9. מפת טיולים (`js/views/tripmap/`, view `tripmap`) — יוני 2026

> מפת ישראל בתלת־מימד + תצוגת רחוב + תכנון מסלולים. נבנה ע"י 3 סוכנים במקביל לפי
> חוזה ממשקים — **`js/views/tripmap/CONTRACT.md` הוא מקור-האמת לממשקים ולבעלות על
> הקבצים**; לפני כל שינוי שם — לקרוא אותו. CSS: `css/features/tripmap.css`. מפתח Store:
> `trips` (subcol, merge by-id).

| רוצה לשנות... | גע רק בקובץ |
|---|---|
| ספקי אריחים (לוויין/רחובות/גבהים/מבנים), גבולות, ברירות מחדל | `tripmap/config.js` (`window.TripMapConfig`) |
| מנוע המפה: 2D/3D, terrain, markers, מסלולים | `tripmap/engine.js` (`window.TripMapEngine`) |
| תצוגת רחוב (overlay, Google embed, fallback) | `tripmap/street.js` (`window.TripMapStreet`) |
| ניווט גוף-ראשון במפה (WASD/חצים/Q/E/R/F) | `tripmap/controls.js` (`window.TripMapControls`) |
| פאנל הטיולים, ייבוא JSON, חיבור המתכנן | `tripmap/trip-layer.js` (`window.TripLayer`) |
| פריסת ה-view, סרגל צף, חיפוש Nominatim | `tripmap/index.js` |
| מאגר ידע הטיולים (אטרקציות/מסעדות/לינה/חו"ל) | `tripmap/planner-data.js` (`window.TripPlannerData`) |
| מנוע התכנון (לוגיקה טהורה, 4 מסלולים) | `tripmap/planner-engine.js` (`window.TripPlannerEngine`) |
| אשף התכנון + מסך התוכנית + הדפסה | `tripmap/planner-ui.js` + `css/features/tripplanner.css` (`window.TripPlannerUI`) |

**מתכנן הטיולים עצמאי לחלוטין — אפס תלות ב-LLM.** האשף (planner-ui) מציג את כל
אפשרויות הסקיל trip-planner-metakhnen-tiyulim כ-UI: 4 מסלולים (בארץ/חו"ל/חופשה
קצרה/הפתע אותי), המנוע (planner-engine) מחולל תוכנית יום-יום אמיתית מתוך מאגר הידע
(planner-data: 122 אטרקציות עם קואורדינטות אמיתיות שאומתו מול Nominatim, 46 מסעדות,
40 לינה, 12 יעדי חו"ל). טיול בארץ נשמר עם עצירות ומוצג על המפה; כל טיול מחזיק `doc`
(מסמך תוכנית מלא: ימים, תקציב, ציוד, צ'קליסט, טיפים) שנפתח מ-📄 בפאנל. הצמדת
surprise→abroad מעבירה הלאה את התשובות שכבר נבחרו (ימים/הרכב/חודש/תקציב). הסכמה
המקובעת של כל המודולים — ב-CONTRACT.md, סעיף "מתכנן הטיולים העצמאי".

הערות מימוש: MapLibre GL v5 מאורז ב-`js/vendor/maplibre/` (טעינה עצלה + fallback CDN);
לוויין Esri (maxzoom 19), גבהים AWS terrarium, מבנים OpenFreeMap fill-extrusion.
⚠️ maplibre-gl.css נטען עצלה אחרי tripmap.css וקובע `.maplibregl-map{position:relative}`
— לכן המפה ממוקמת עם `.tm-view > .tm-map` (ספציפיות גוברת). תצוגת רחוב: Google Maps
embed ללא מפתח (`/maps/embed?pb=!6m7…`) — ה-endpoint היחיד בלי X-Frame-Options.
ייבוא טיול מהסקיל trip-planner-metakhnen-tiyulim: פרומפט מוכן + הדבקת JSON
(סכמה: title/region/days[n,title,stops[name,lat,lng,time?,note?,type?]]).
