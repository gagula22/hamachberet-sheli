(function () {
  // Generic editable helpers: debounce + image compression. No DOM-feature coupling.
  function debounce(fn, wait = 400) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // דחיסת תמונה לשמירה — איכות קודמת לגודל (תוקן יסודית לפי משוב חוזר).
  // ⚠️ הבאג שהיה: צילום מסך של גרף ב-PNG עובר בקלות 2.8MB → קודד מחדש
  // ל-WebP/JPEG מאבד → קווים דקים וטקסט זעיר הצטטשו.
  // העיקרון החדש:
  //   • אם התמונה לא חורגת ב-מימדים מ-3000px — נשמרת מדויקת בית-בבית,
  //     בכל גודל קובץ. אפס קידוד-מחדש = אפס איבוד (קריטי לגרפים/טקסט).
  //   • רק תמונת-ענק (>3000px) מוקטנת ל-3000px ומקודדת ב-WebP 0.95
  //     (כמעט-lossless) עם נפילה ל-JPEG 0.95. הקטנת-מימדים שומרת חדות.
  //   • לעולם לא מחזירים תוצאה גדולה/גרועה מהמקור.
  // הערה: תמונות-ענק נשמרות מקומית במלואן; firebase-sync._sizeSafeTopic
  // מגן על סנכרון הענן (מסיר base64 ענק מהדוק לפני שליחה, שומר מקומית).
  function compressImage(dataUrl, maxW, quality) {
    maxW = maxW || 3000;
    quality = quality || 0.95;
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        if (img.naturalWidth <= maxW) { resolve(dataUrl); return; }   // ← אין הקטנה = נשמר מדויק, בכל גודל
        const scale = maxW / img.naturalWidth;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/webp', quality);
        if (out.indexOf('data:image/webp') !== 0) out = canvas.toDataURL('image/jpeg', quality);
        resolve(out.length < dataUrl.length ? out : dataUrl);
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  window.EditableUtils = { debounce: debounce, compressImage: compressImage };
})();