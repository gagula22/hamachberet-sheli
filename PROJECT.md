# המחברת שלי — תיעוד פרויקט

## קישורים
| | |
|---|---|
| **האתר החי** | https://gagula22.github.io/hamachberet-sheli |
| **קוד מקור** | https://github.com/gagula22/hamachberet-sheli |
| **קבצים מקומיים** | `C:\Users\user\Documents\מחברת\` |
| **Firebase** | gagula22@gmail.com |

---

## Stack
- HTML + CSS + JS טהור — ללא npm/build
- Firebase Firestore — סנכרון real-time
- GitHub Pages — אחסון חינמי

---

## מבנה קבצים

```
מחברת/
├── index.html                  # נקודת כניסה; hash-router outlet
├── PROJECT.md                  # המסמך הזה
├── css/
│   ├── tokens.css              # CSS variables (צבעים, פונטים, spacing)
│   ├── layout.css              # sidebar ימין, topbar, grid ראשי
│   └── components.css          # כרטיסים, עורכים, לוח שנה, כפתורים
├── js/
│   ├── app.js                  # bootstrap + hash-router
│   ├── store.js                # localStorage + Firebase (get/set/export/import)
│   ├── views/
│   │   ├── dashboard.js        # דשבורד עם stats חיים
│   │   ├── notebook.js         # עורך מחברות מלא (toolbar, drag-drop, export)
│   │   ├── notes.js            # פתקים (CRUD, חיפוש, תגיות)
│   │   ├── daily.js            # יומן יומי (ציר זמן, top-3, הערות)
│   │   ├── weekly.js           # יומן שבועי (drag-drop בין ימים)
│   │   ├── monthly.js          # לוח חודשי (קליק על יום)
│   │   ├── wellness.js         # Habit tracker + Mood + מים + שינה
│   │   ├── finance.js          # הכנסות/הוצאות + net חודשי
│   │   └── life.js             # מטרות + bucket list + רפלקציה
│   └── components/
│       ├── sidebar.js          # ניווט RTL (12 חלקים) + ייצוא/ייבוא JSON
│       ├── editable.js         # הדבקת תמונות, snap-to-grid, delete button
│       └── sticker-panel.js    # ספריית סטיקרים
└── assets/
    └── stickers.svg
```

---

## Design System

### צבעי פסטל
| משתנה | ערך | שימוש |
|---|---|---|
| `--blush` | `#FADADD` | אביזרים ורודים |
| `--sage` | `#CDE7C1` | "היום" / "השבוע" chips |
| `--sky` | `#CFE4F7` | אינפו, chips |
| `--butter` | `#FFF3C4` | הדגשה צהובה |
| `--lavender` | `#E6DDF4` | active, chips |
| `--cream` | `#FAF6F0` | רקע כללי |
| `--ink` | `#3B3A3A` | טקסט ראשי |

### פונטים
- **כותרות:** Fraunces (Google Fonts)
- **טקסט:** Inter (Google Fonts)

### Layout
- Grid ראשי: `grid-template-columns: 1fr var(--sidebar-w)`
- DOM order: `<main>` ראשון, `<aside>` אחרון (RTL — sidebar מימין)
- Sidebar רוחב: 260px ברירת מחדל, גרירה לשינוי

---

## Data Model

```json
{
  "topics": [{ "id": "", "name": "", "icon": "", "body": "", "parentId": null,
               "createdAt": 0, "updatedAt": 0, "order": 0, "pageCount": 1 }],
  "notes":  [{ "id": "", "title": "", "body": "", "tags": [], "updatedAt": 0 }],
  "tasks":  [{ "id": "", "text": "", "done": false, "date": "YYYY-MM-DD" }],
  "habits": [{ "id": "", "name": "", "color": "", "log": { "YYYY-MM-DD": true } }],
  "mood":   { "YYYY-MM-DD": 1 },
  "transactions": [{ "id": "", "amount": 0, "type": "income|expense",
                     "category": "", "date": "YYYY-MM-DD", "note": "" }],
  "goals":  [{ "id": "", "text": "", "done": false, "category": "" }],
  "slots":  { "YYYY-MM-DD": { "6": "טקסט", "__top": ["","",""],
                               "__notes": "", "__done_0": false } },
  "settings": { "theme": "", "userName": "" }
}
```

---

## Routing (Hash)

| Hash | תצוגה |
|---|---|
| `#/dashboard` | דשבורד |
| `#/notebook` | מחברות |
| `#/notes` | פתקים |
| `#/planner/daily` | יומן יומי |
| `#/planner/weekly` | יומן שבועי |
| `#/planner/monthly` | לוח חודשי |
| `#/wellness` | בריאות |
| `#/finance` | תקציב |
| `#/life` | חיים |

---

## תיקונים מרכזיים שבוצעו

### Layout
- Sidebar לצד ימין: הזזת `<aside>` אחרי `<main>` ב-DOM (grid auto-placement)

### מחברות (notebook.js)
- **סדר כרונולוגי:** שדות `createdAt` + `order`; `getChildren()` ממיין לפי `order ?? createdAt`
- **Drag-drop:** מחדש `order` רק לאחים של יעד הגרירה (לא כל הנושאים)
- **Toolbar selection:** שמירת `savedRange` ב-`mouseup/keyup`, שחזור לפני `exec()`
- **ייצוא לפי סדר:** `getChildren(null)` במקום `getTopics().filter(!parentId)`
- **שעת עדכון:** `toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' })`

### תמונות (editable.js)
- כפתור ✕ מחיקה: `addDeleteButtonToFig()` + event delegation
- `attachImageBehaviors` מוסיף ✕ גם לתמונות קיימות בטעינה
- **Snap-to-grid (Notes):** `snapFigToGrid()` — `padding-bottom` דינמי שמיישר לגריד 28px; מתעדכן עם ResizeObserver

### יומן (daily/weekly/monthly)
- ניווט קדימה/אחורה: `dayOffset / weekOffset / monthOffset`
- שם יום בתאי לוח חודשי: `.day-name-mini`

### כללי
- Cache-busting: `?v=2` + meta no-cache
- ייבוא נתונים: כפתור "📋 הדבק JSON" ב-sidebar footer

---

## פקודות Git שימושיות

```bash
# לעבוד על הפרויקט
cd "C:\Users\user\Documents\מחברת"

# לדחוף שינוי
git add -A && git commit -m "תיאור" && git push origin main

# לבדוק סטטוס
git status
git log --oneline -10
```

---

*עודכן: אפריל 2026*
