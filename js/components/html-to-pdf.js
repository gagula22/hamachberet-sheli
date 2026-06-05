(function () {
  // ── Shared concern: render arbitrary HTML to a REAL, auto-downloaded PDF.
  // Owned here so every feature that needs "HTML → PDF file" uses ONE proven
  // implementation (notebook export + the Word→PDF tool). → window.HtmlToPdf
  //
  // Why this design (learned the hard way):
  //   • The bundled vendor/html2pdf is BROKEN here (blank pages) — we lazy-load
  //     fresh html2canvas + jsPDF from CDN instead.
  //   • The whole content MUST be rendered in ONE html2canvas pass with explicit
  //     width/windowWidth — otherwise html2canvas clips the off-screen host to the
  //     viewport width, cutting RTL text on the side and overlapping lines.
  //   • The tall canvas is sliced into pages ONLY at top-level block boundaries,
  //     so a page break never cuts through a paragraph or an image.

  let _libsPromise = null;
  function ensureLibs() {
    if (window.html2canvas && window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (_libsPromise) return _libsPromise;
    function load(src) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = res; s.onerror = () => rej(new Error('load ' + src));
        document.head.appendChild(s);
      });
    }
    _libsPromise = (async () => {
      if (!window.html2canvas) await load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      if (!(window.jspdf && window.jspdf.jsPDF)) await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    })();
    return _libsPromise;
  }

  // generate(title, bodyHtml, opts)
  //   title    — shown as the document <h1> (pass '' to omit a heading)
  //   bodyHtml — the content HTML (its top-level children become page-break units)
  //   opts.fileName — download name without extension (defaults to title)
  //   opts.dir      — 'rtl' (default) | 'ltr' | 'auto'
  async function generate(title, bodyHtml, opts) {
    opts = opts || {};
    await ensureLibs();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    const PW = pdf.internal.pageSize.getWidth();
    const PH = pdf.internal.pageSize.getHeight();
    const M = 40;                  // page margin (pt)
    const CW = PW - M * 2;         // usable content width (pt)
    const usableH = PH - M * 2;    // usable content height (pt)
    const HOST_W = 680;            // render width (px) — matches A4 content area
    const SCALE = 2;               // 2× for crisp output
    const dir = opts.dir || 'rtl';

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + HOST_W + 'px;background:#fff;' +
      'direction:' + dir + ';font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#000;' +
      'unicode-bidi:plaintext;';
    // A scoped <style> guarantees no image can ever overflow the page width
    // (Word→PDF source images often carry explicit oversized width attributes).
    const hid = 'h2pdf-host';
    host.id = hid;
    const st = document.createElement('style');
    st.textContent = '#' + hid + ' img{max-width:100% !important;height:auto !important;}' +
                     '#' + hid + ' table{max-width:100% !important;}' +
                     '#' + hid + ' *{word-break:break-word;overflow-wrap:break-word;}';
    document.head.appendChild(st);
    host.innerHTML = (title ? '<h1 style="font-size:26px;margin:0 0 16px;">' + title + '</h1>' : '') + bodyHtml;
    document.body.appendChild(host);

    try {
      // Wait for every image to finish decoding before snapshotting.
      await Promise.all(Array.from(host.querySelectorAll('img')).map(img =>
        (img.complete && img.naturalWidth) ? null
          : new Promise(r => { img.onload = img.onerror = r; })
      ));
      host.querySelectorAll('.nb-img-del,.nb-img-move').forEach(el => el.remove());

      const totalDomH = host.scrollHeight;
      const canvas = await window.html2canvas(host, {
        scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false,
        width: HOST_W, windowWidth: HOST_W, windowHeight: totalDomH
      });

      // Safe page-break positions = the bottom edge of each top-level block (px).
      const bounds = [0];
      Array.from(host.children).forEach(b => {
        const bottom = b.offsetTop + b.offsetHeight;
        if (bottom > 0) bounds.push(bottom);
      });
      bounds.push(totalDomH);
      const stops = Array.from(new Set(bounds)).sort((a, b) => a - b);

      const ptPerPx = CW / HOST_W;
      const pageMaxDomH = Math.floor(usableH / ptPerPx);

      let startY = 0, first = true, guard = 0;
      while (startY < totalDomH - 1 && guard++ < 400) {
        let endY = startY + pageMaxDomH;
        if (endY >= totalDomH) {
          endY = totalDomH;
        } else {
          let snapped = 0;
          for (const b of stops) { if (b > startY && b <= endY) snapped = b; }
          if (snapped > startY) endY = snapped;
          // else: a single block taller than a page → hard cut (unavoidable).
        }
        const srcY = Math.round(startY * SCALE);
        const srcH = Math.min(Math.round((endY - startY) * SCALE), canvas.height - srcY);
        if (srcH <= 0) break;

        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = srcH;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, slice.width, srcH);

        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, CW, (srcH / SCALE) * ptPerPx);
        first = false;
        startY = endY;
      }

      pdf.save((opts.fileName || title || 'document') + '.pdf');
    } finally {
      host.remove();
      st.remove();
    }
  }

  window.HtmlToPdf = { ensureLibs: ensureLibs, generate: generate };
})();
