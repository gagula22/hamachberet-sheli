(function () {
  // Generic editable helpers: debounce + image compression. No DOM-feature coupling.
  function debounce(fn, wait = 400) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // דחיסת תמונה לשמירה — מכוונת איכות (תוקן לפי משוב: הדבקות יצאו מטושטשות).
  // עקרונות:
  //   • אין הקטנה מתחת ל-2560px — צילומי מסך רגילים (גם רטינה) נשארים חדים.
  //   • תמונה שלא צריכה הקטנה וקטנה מ-~2MB נשמרת כמו שהיא — אפס איבוד איכות
  //     (קריטי לצילומי מסך עם טקסט: קידוד-מחדש ל-JPEG מטשטש אותם).
  //   • כשכן מקודדים: WebP באיכות 0.92 (חד וקטן; אם הדפדפן לא מקודד WebP —
  //     toDataURL מחזיר PNG וניפול ל-JPEG 0.92).
  //   • לעולם לא מחזירים תוצאה גדולה מהמקור.
  function compressImage(dataUrl, maxW, quality) {
    maxW = maxW || 2560;
    quality = quality || 0.92;
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        const needScale = img.naturalWidth > maxW;
        if (!needScale && dataUrl.length <= 2.8 * 1024 * 1024) { resolve(dataUrl); return; }
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
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