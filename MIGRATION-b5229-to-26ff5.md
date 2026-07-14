# מעבר בקאנד: my-notebook-b5229 → my-notebook-26ff5

> מסמך חי למעבר פרויקט Firebase. סוכן ממשיך: קרא אותי במלואי + הרשומה העליונה ב-UPDATES.md.
> נוצר 7.7.2026. סטטוס: **⏳ באמצע — ממתין לקונפיג של 26ff5 מהמשתמש.**
>
> ⚠️ **עדכון 14.7.2026 — המעבר כבר אינו דחוף (אופציונלי):** הסיבה שבגללה נוצר המסמך — הצמדת-קובץ
> לענן נכשלה ב-CORS של Storage — **נפתרה סופית אחרת:** קבצים מצורפים מאוחסנים כעת ב-**Firestore
> מפוצל ל-chunks** (`js/features/cloud-files/`), בלי Storage ובלי CORS, על ה-bucket הנוכחי (b5229).
> ראה ARCHITECTURE §5א + רשומת UPDATES 14.7. **המעבר ל-26ff5 נשאר רלוונטי רק אם המשתמש רוצה
> בעלות/שליטה על פרויקט ה-Firebase** — לא נדרש לתפקוד. אין חוסם פתוח.

---

## 1. הבעיה (מה שגילינו)

צירוף קובץ למחברת **לא נשמר בענן** — נזרקת ההערה "הקובץ גדול (X) ויישמר מקומית בלבד", והמשתמש רוצה בענן, נגיש מכל מקום, עד ≥20MB.

**אבחון סופי (מאומת מהקונסול של המשתמש):** העלאת קבצים ל-Firebase Storage נכשלת ב-**CORS**:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/v0/b/my-notebook-b5229.…/o…'
from origin 'https://gagula22.github.io' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
→ net::ERR_FAILED → storage/retry-limit-exceeded → נפילה מקומית
```

**שורש:** האתר מתארח ב-**GitHub Pages** (`gagula22.github.io`), לא ב-Firebase Hosting. ל-bucket של Storage **אין כלל-CORS** שמתיר את המקור הזה. Firestore לא דורש CORS (endpoint אחר) → **הסנכרון עבד, אבל Storage מעולם לא** → **העלאות-הענן מעולם לא הצליחו** (כל מה ש"נשמר" בעבר היה base64 מקומי בתוך גוף ההערה).

**מה זה *לא* (נשלל):**
- ❌ לא Brave/חוסם-פרסומות (קביעה מוקדמת שגויה — ה-`net::ERR_FAILED` היה הדפדפן מבטל בקשה חסומת-CORS).
- ❌ לא חוסר-התאמת שם-bucket (החלפת `.firebasestorage.app`↔`.appspot.com` נתנה CORS זהה — commits `b4e4965`→`6f16c01`).
- ❌ לא מגבלת-גודל (הענן תומך ב-50MB דרך `HARD_CAP` ב-media.js).

**למה לא פשוט מתקנים CORS על b5229:** הפרויקט `my-notebook-b5229` **לא נמצא בקונסול של המשתמש** — הקונסול שלו מציג רק `my-notebook-26ff5` ו-`notebook-158c2` ("1–2 of 2"). b5229 תחת חשבון Google אחר/לא-נגיש → אי אפשר להגדיר בו CORS/כללים. **לכן: מעבר לפרויקט שבבעלות המשתמש.**

---

## 2. הפתרון: מעבר ל-my-notebook-26ff5

מעבירים את הבקאנד לפרויקט שהמשתמש **בבעלותו ובשליטתו**. הנתונים עוברים דרך גיבוי JSON (ייצוא מ-b5229 → ייבוא ל-26ff5). אין קבצי-ענן להעביר (מעולם לא עלו).

### פרויקטים
| | b5229 (ישן/נוכחי) | 26ff5 (חדש/יעד) |
|---|---|---|
| Project ID | `my-notebook-b5229` | `my-notebook-26ff5` |
| Project number / messagingSenderId | `409339902450` | `65156198394` |
| נגישות למשתמש | ❌ לא בקונסול שלו | ✅ בבעלותו (מסומן בכוכב) |
| Firestore | פעיל (הנתונים כאן) | ⏳ טרם נוצר |
| Storage/CORS | לא הוגדר | ⏳ טרם |
| Auth (Google) | פעיל | ⏳ טרם |

### קונפיג נוכחי (b5229) — ב-`js/firebase-config.js` (לא סודי):
```js
apiKey: "AIzaSyCIYvUtp9eoRAIeyOe9gQHPdgSNfxl8oHs"
authDomain: "my-notebook-b5229.firebaseapp.com"
projectId: "my-notebook-b5229"
storageBucket: "my-notebook-b5229.firebasestorage.app"
messagingSenderId: "409339902450"
appId: "1:409339902450:web:bbdfb6ab2960653403536b"
```
### קונפיג יעד (26ff5) — **חסר, להשיג מהמשתמש** (Project Settings → Your apps → Web `</>`):
```js
apiKey: "???"            // מרישום ה-Web app
authDomain: "my-notebook-26ff5.firebaseapp.com"
projectId: "my-notebook-26ff5"
storageBucket: "???"     // כנראה my-notebook-26ff5.firebasestorage.app או .appspot.com
messagingSenderId: "65156198394"
appId: "1:65156198394:web:???"
```

---

## 3. קבצים מעורבים (לפי אחריות)

| קובץ | אחריות | תפקיד במעבר |
|---|---|---|
| `js/firebase-config.js` | תשתית (P-01/02/03) | **הקובץ היחיד לשנות בקוד** — להחליף ל-6 ערכי 26ff5. להקפיץ `?v=` ב-index.html (כרגע v=18). |
| `js/store.js` | אחסון (P-02) | `exportJSON()` (~שורה 156) = גיבוי מלא; `importJSON()` (~שורה 167) = שחזור + push לענן החדש. |
| `js/components/data-transfer.js` | תשתית | כפתורי **⬇ ייצוא / ⬆ ייבוא** בסרגל-הצד. |
| `js/firebase-sync.js` | סנכרון ענן (P-03) | מבנה Firestore: `users/{uid}/topics/{id}`, `users/{uid}/{key}/{id}`, `users/{uid}/data/main`. |
| `js/features/cloud-files/index.js` | קבצים-ענן (P-12) | העלאה ל-`users/{uid}/attachments/…` (זה מה שנחסם ב-CORS). |
| `js/features/autobackup/index.js` | גיבוי | גיבוי-אוטומטי (רשת-ביטחון נוספת). |

### גיבוי הנתונים
- **קובץ הגיבוי:** `notebook-backup-YYYY-MM-DD.json` — יורד לתיקיית **ההורדות** של המשתמש (לא בריפו — נתוני משתמש). מכיל את כל ה-Store (topics + כל המפתחות).
- ⚠️ **חובה לוודא שהגיבוי ירד לפני החלפת הקונפיג.** בלי זה — סיכון לאובדן נתונים.

---

## 4. צ'ק-ליסט מעבר (מצב נוכחי מסומן)

- [ ] **0. גיבוי:** באתר (עדיין על b5229) ⬇ ייצוא → לוודא שהקובץ ירד. ⏳ *טרם אושר ע"י המשתמש.*
- [~] **1. הקמת 26ff5 בקונסול (המשתמש):**
  - [ ] Authentication → הפעל **Google** + Authorized domains → הוסף `gagula22.github.io`.
  - [ ] Firestore → Create (production) → Rules (ראה §5) → Publish.
  - [ ] Storage → Get started → Rules (ראה §5) → Publish.
  - [ ] CORS על ה-bucket דרך Cloud Shell (ראה §5).
  - [x] המשתמש הגיע ל-Project Settings; **אין עדיין אפליקציית Web** ("There are no apps") → צריך לרשום Web app (`</>`).
- [ ] **2. קונפיג:** המשתמש רושם Web app ומדביק את `firebaseConfig` של 26ff5.
- [ ] **3. החלפת קוד (סוכן):** לערוך `js/firebase-config.js` ל-6 ערכי 26ff5, להקפיץ `firebase-config.js?v=19` ב-index.html, node --check, commit, push, לאמת חי שהקובץ מגיש projectId=my-notebook-26ff5.
- [ ] **4. שחזור (המשתמש):** Ctrl+Shift+R → התחבר עם Google (לתוך 26ff5, ריק) → ⬆ ייבוא את קובץ הגיבוי → הנתונים חוזרים ונדחפים ל-Firestore של 26ff5.
- [ ] **5. אימות סופי:** ההערות מופיעות; צירוף קובץ → **עולה לענן** (האחוז מטפס, אין שגיאת CORS), עד 50MB, נגיש מכל מקום.

---

## 5. חומרים מוכנים (להעתקה)

### כללי Firestore (26ff5 → Firestore → Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
### כללי Storage (26ff5 → Storage → Rules):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
### CORS (Cloud Shell של 26ff5 — החלף שם-bucket לפי מה ש-Storage מציג):
```bash
cat > cors.json <<'EOF'
[{"origin":["https://gagula22.github.io"],"method":["GET","POST","PUT","DELETE","HEAD"],"responseHeader":["Content-Type","Authorization","Content-Length","User-Agent","x-goog-resumable","x-goog-upload-protocol","x-goog-upload-command","x-goog-upload-offset","x-goog-upload-header-content-length","x-goog-upload-content-length","x-goog-upload-content-type","x-goog-upload-status"],"maxAgeSeconds":3600}]
EOF
gsutil cors set cors.json gs://my-notebook-26ff5.firebasestorage.app
gsutil cors get gs://my-notebook-26ff5.firebasestorage.app
```

---

## 6. מלכודות / הערות להמשך
- **אל תחליף את הקונפיג לפני ש-26ff5 מוקם מלא** (Auth+Firestore+Storage+CORS) **ולפני שהגיבוי ירד** — אחרת האפליקציה נשברת / נתונים בסיכון.
- ה-`storageBucket` בקונפיג **חייב** להיות בדיוק ה-bucket שעליו הגדרת CORS (מה ש-Storage מציג).
- אחרי המעבר, קבצים מקומיים ישנים (base64 בגוף ההערות) עוברים בגיבוי וימשיכו לעבוד; קבצים חדשים ילכו לענן.
- b5229 נשאר עם עותק הנתונים הישן (לא נמחק) — לא לגעת בו; הוא לא בשליטת המשתמש ממילא.
- מתועד גם: ARCHITECTURE §5א (שורש ה-CORS), UPDATES.md (רשומת handoff).
