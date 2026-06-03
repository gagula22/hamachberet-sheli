(function () {
  // PDF -> Word. Extracted from stickers.js.
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    const base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }
  // ── Tool 2: PDF → Word ───────────────────────────────────────────────────
  function buildPdfToWord() {
    const status = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const bar    = App.el('div', {
      style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px',
               width: '0', transition: 'width 300ms', marginTop: '10px' }
    });

    // Image extraction is the slow part of the conversion. The user
    // can opt out for a near-instant "text only" run.
    const imgCheckbox = document.createElement('input');
    imgCheckbox.type = 'checkbox';
    imgCheckbox.id = 'pdf2word-images';
    imgCheckbox.checked = true;
    imgCheckbox.style.cssText = 'margin:0;cursor:pointer;width:16px;height:16px;';
    const imgLabel = document.createElement('label');
    imgLabel.htmlFor = 'pdf2word-images';
    imgLabel.style.cssText = 'display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;user-select:none;';
    imgLabel.appendChild(imgCheckbox);
    var imgLabelText = document.createElement('span');
    imgLabelText.innerHTML = 'כלול תמונות מוטמעות <span style="color:var(--ink-mute);font-weight:400;">(איטי יותר ב־PDF גדולים)</span>';
    imgLabel.appendChild(imgLabelText);

    const optsRow = App.el('div', {
      style: {
        display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center',
        marginTop: '12px', padding: '10px 14px',
        background: 'var(--cream)', borderRadius: 'var(--r-sm)',
        border: '1px solid var(--line)'
      }
    }, [imgLabel]);

    // ── Helpers for structure-preserving extraction ────────────────────
    // Escape user text so embedded HTML in the PDF doesn't break the doc.
    function _escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Decide whether a font name implies bold / italic.
    function _fontIsBold(name) {
      if (!name) return false;
      var n = String(name).toLowerCase();
      return /bold|black|heavy|semibold|demi/.test(n);
    }
    function _fontIsItalic(name) {
      if (!name) return false;
      var n = String(name).toLowerCase();
      return /italic|oblique/.test(n);
    }

    // Reconstruct lines from PDF text items by grouping items with
    // similar baseline Y. Within a line, sort items by X. PDF coordinate
    // origin is bottom-left, so we sort lines by Y descending afterwards.
    function _buildLinesFromItems(items) {
      var lines = [];   // [{ y, h, parts: [{str, x, fontSize, bold, italic}] }]
      const Y_TOLERANCE_FACTOR = 0.5;  // items within 0.5×height share a line
      items.forEach(function(it) {
        if (!it.str) return;
        // transform = [a, b, c, d, e, f]; e = x, f = y; height ≈ |a| or |d|
        var t = it.transform || [1,0,0,1,0,0];
        var x = t[4], y = t[5];
        var fontSize = Math.abs(t[0]) || it.height || 10;
        var part = {
          str: it.str,
          x: x,
          y: y,
          fontSize: fontSize,
          bold: _fontIsBold(it.fontName),
          italic: _fontIsItalic(it.fontName),
          width: it.width || 0,
          hasEOL: !!it.hasEOL
        };
        // Find an existing line on the same baseline.
        var match = null;
        for (var j = lines.length - 1; j >= 0 && j >= lines.length - 6; j--) {
          var L = lines[j];
          var avgH = (L.h + fontSize) / 2;
          if (Math.abs(L.y - y) <= avgH * Y_TOLERANCE_FACTOR) { match = L; break; }
        }
        if (match) {
          match.parts.push(part);
          if (fontSize > match.h) match.h = fontSize;
        } else {
          lines.push({ y: y, h: fontSize, parts: [part] });
        }
      });
      // Sort lines top→bottom (PDF y is bottom-up, so descending).
      lines.sort(function(a, b) { return b.y - a.y; });
      // Within a line, sort by X. Hebrew text items may already arrive
      // in visual right-to-left order; sorting by X ascending puts them
      // left-to-right in DOM, which the browser will render RTL because
      // of unicode-bidi:plaintext on the paragraph.
      lines.forEach(function(L) {
        L.parts.sort(function(a, b) { return a.x - b.x; });
      });
      return lines;
    }

    // Heuristic: pick a "body" font size = median of all text heights.
    // Anything 1.25× body becomes h3, 1.55× → h2, 1.85× → h1.
    function _bodyFontSize(lines) {
      var sizes = [];
      lines.forEach(function(L) {
        L.parts.forEach(function(p) { if (p.fontSize > 0) sizes.push(p.fontSize); });
      });
      if (!sizes.length) return 10;
      sizes.sort(function(a, b){ return a - b; });
      return sizes[Math.floor(sizes.length / 2)];
    }

    // Convert a single line's parts to inline HTML, merging adjacent
    // parts with identical formatting and inserting a space when there
    // is a visible X gap between consecutive items.
    function _lineToHtml(parts, bodySize) {
      if (!parts.length) return '';
      var out = '';
      var prev = null;
      parts.forEach(function(p) {
        var text = _escHtml(p.str);
        // Insert a space if there is a real horizontal gap from the
        // previous item that wasn't captured by the embedded space.
        if (prev) {
          var prevEnd = prev.x + (prev.width || 0);
          var gap = p.x - prevEnd;
          // Threshold ≈ 0.25 of font height (a quarter-em) — generous
          // enough to keep words separate without inventing fake spaces.
          if (gap > prev.fontSize * 0.25 && !/\s$/.test(text) && !/\s$/.test(prev.str)) {
            out += ' ';
          }
        }
        var open = '', close = '';
        if (p.bold)   { open += '<strong>'; close = '</strong>' + close; }
        if (p.italic) { open += '<em>';     close = '</em>' + close; }
        out += open + text + close;
        prev = p;
      });
      return out;
    }

    // Decide which heading level (or paragraph) a line belongs to.
    function _lineTag(line, bodySize) {
      // The line's "size" is the largest font in any of its parts.
      var maxSize = 0;
      line.parts.forEach(function(p) { if (p.fontSize > maxSize) maxSize = p.fontSize; });
      var ratio = bodySize > 0 ? maxSize / bodySize : 1;
      if (ratio >= 1.85) return 'h1';
      if (ratio >= 1.55) return 'h2';
      if (ratio >= 1.25) return 'h3';
      return 'p';
    }

    // ── List detection ────────────────────────────────────────────────
    // Returns 'ul' if the line is a bullet, 'ol' if it's a numbered list
    // item, or null otherwise. Patterns recognized for both English and
    // Hebrew documents: bullet glyphs, "1." "2)" "12.", and "א." "ב)".
    var _BULLET_RE = /^\s*([•·◦‣⁃●○▪▫■♦▶►–—\-*])\s+/;
    var _NUMBER_RE = /^\s*(\d{1,3})[.)\]]\s+/;
    var _HEB_NUM_RE = /^\s*([א-ת])[.)\]]\s+/;

    function _detectListType(line) {
      if (!line.parts.length) return null;
      var firstStr = line.parts[0].str || '';
      if (_BULLET_RE.test(firstStr)) return 'ul';
      if (_NUMBER_RE.test(firstStr)) return 'ol';
      if (_HEB_NUM_RE.test(firstStr)) return 'ol';
      return null;
    }

    function _stripListMarker(line) {
      if (!line.parts.length) return line;
      var p0 = line.parts[0];
      var stripped = (p0.str || '').replace(_BULLET_RE, '')
                                   .replace(_NUMBER_RE, '')
                                   .replace(_HEB_NUM_RE, '');
      if (stripped === p0.str) return line;
      var newParts = line.parts.slice();
      newParts[0] = Object.assign({}, p0, { str: stripped });
      return Object.assign({}, line, { parts: newParts });
    }

    // ── Centered-line detection ───────────────────────────────────────
    // True when the midpoint of the line's text rectangle is within ~8%
    // of the page horizontal centerline. Used for centered headings.
    function _isCentered(line, pageWidth) {
      if (!line.parts.length || !pageWidth) return false;
      var minX = Infinity, maxX = -Infinity;
      line.parts.forEach(function(p) {
        if (p.x < minX) minX = p.x;
        var endX = p.x + (p.width || 0);
        if (endX > maxX) maxX = endX;
      });
      if (!isFinite(minX) || !isFinite(maxX)) return false;
      var lineMid = (minX + maxX) / 2;
      var pageMid = pageWidth / 2;
      // Also require the line not to span the full page (long paragraphs
      // tend to be centered around the page center too).
      var lineWidth = maxX - minX;
      if (lineWidth > pageWidth * 0.7) return false;
      return Math.abs(lineMid - pageMid) < pageWidth * 0.08;
    }

    // ── Image extraction via PDF.js operator list ─────────────────────
    // We walk the page's drawing operations, tracking the current
    // transformation matrix (CTM). Whenever we hit paintImageXObject we
    // know the current CTM positions the unit square (0,0)-(1,1) where
    // the image sits, so ctm[4]/ctm[5] is the bottom-left in user space
    // and Math.abs(ctm[0])/Math.abs(ctm[3]) is the rendered size.
    function _matMul(m1, m2) {
      return [
        m1[0]*m2[0] + m1[2]*m2[1],
        m1[1]*m2[0] + m1[3]*m2[1],
        m1[0]*m2[2] + m1[2]*m2[3],
        m1[1]*m2[2] + m1[3]*m2[3],
        m1[0]*m2[4] + m1[2]*m2[5] + m1[4],
        m1[1]*m2[4] + m1[3]*m2[5] + m1[5]
      ];
    }

    function _imgObjToDataUrl(img) {
      if (!img || !img.width || !img.height) return null;
      // Skip decorative tiny images (icons / masks / dots) to save time
      // and to keep the output document small.
      if (img.width < 8 || img.height < 8) return null;
      try {
        // Rasterize into a "natural" canvas first.
        var srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        var srcCtx = srcCanvas.getContext('2d');
        if (img.bitmap) {
          srcCtx.drawImage(img.bitmap, 0, 0);
        } else if (img.data) {
          var imgData = srcCtx.createImageData(img.width, img.height);
          var dst = imgData.data;
          var src = img.data;
          var kind = img.kind;
          if (kind === 1) {
            // Grayscale 8bpp
            for (var i = 0, j = 0; i < src.length; i++, j += 4) {
              dst[j] = dst[j+1] = dst[j+2] = src[i];
              dst[j+3] = 255;
            }
          } else if (kind === 2) {
            // RGB 24bpp
            for (var i2 = 0, j2 = 0; i2 + 2 < src.length; i2 += 3, j2 += 4) {
              dst[j2]   = src[i2];
              dst[j2+1] = src[i2+1];
              dst[j2+2] = src[i2+2];
              dst[j2+3] = 255;
            }
          } else if (kind === 3) {
            // RGBA 32bpp
            var min = Math.min(src.length, dst.length);
            for (var i3 = 0; i3 < min; i3++) dst[i3] = src[i3];
          } else {
            return null;
          }
          srcCtx.putImageData(imgData, 0, 0);
        } else {
          return null;
        }

        // For huge images (often 4K scans), downscale to a max edge of
        // 1280px before serializing — keeps document size sane and
        // toDataURL much faster. Use JPEG for big photos, PNG otherwise.
        var MAX_EDGE = 1280;
        var w = img.width, h = img.height;
        var canvas = srcCanvas;
        if (w > MAX_EDGE || h > MAX_EDGE) {
          var scale = MAX_EDGE / Math.max(w, h);
          var dw = Math.round(w * scale);
          var dh = Math.round(h * scale);
          canvas = document.createElement('canvas');
          canvas.width = dw;
          canvas.height = dh;
          canvas.getContext('2d').drawImage(srcCanvas, 0, 0, dw, dh);
        }
        // Heuristic: photos (>512 on either side) → JPEG saves a lot.
        var useJpeg = (canvas.width > 512 || canvas.height > 512);
        return useJpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('[pdf2word] image decode failed:', e);
        return null;
      }
    }

    function _resolvePageObj(page, objId) {
      return new Promise(function(resolve) {
        try {
          if (page.objs.has && page.objs.has(objId)) {
            resolve(page.objs.get(objId));
            return;
          }
          // Older API style: get(name, callback)
          page.objs.get(objId, function(obj) { resolve(obj); });
        } catch (e) { resolve(null); }
      });
    }

    async function _extractPageImages(page) {
      if (!window.pdfjsLib || !pdfjsLib.OPS) return [];
      var OPS = pdfjsLib.OPS;
      var opList;
      try {
        opList = await page.getOperatorList();
      } catch (e) {
        console.warn('[pdf2word] getOperatorList failed:', e);
        return [];
      }

      // Phase 1: walk operators synchronously to collect every image
      // reference (objId + the CTM that positions it). No awaits here —
      // we only need the worker once for getOperatorList itself.
      var ctm = [1,0,0,1,0,0];
      var stack = [];
      var refs = [];   // [{ objId, ctm }]
      for (var i = 0; i < opList.fnArray.length; i++) {
        var op = opList.fnArray[i];
        var args = opList.argsArray[i];
        if (op === OPS.save) {
          stack.push(ctm.slice());
        } else if (op === OPS.restore) {
          if (stack.length) ctm = stack.pop();
        } else if (op === OPS.transform) {
          ctm = _matMul(ctm, args);
        } else if (op === OPS.paintImageXObject || op === OPS.paintImageMaskXObject) {
          refs.push({ objId: args[0], ctm: ctm.slice() });
        }
      }
      if (!refs.length) return [];

      // Phase 2: resolve every UNIQUE image once, in parallel. Decoding
      // the same logo twice (header on every page, etc.) would be a
      // waste, so we cache the dataURL by objId.
      var uniqueIds = {};
      refs.forEach(function(r) { uniqueIds[r.objId] = true; });
      var idList = Object.keys(uniqueIds);
      var resolvedById = {};
      await Promise.all(idList.map(async function(objId) {
        try {
          var imgObj = await _resolvePageObj(page, objId);
          if (!imgObj) return;
          var dataUrl = _imgObjToDataUrl(imgObj);
          if (dataUrl) resolvedById[objId] = dataUrl;
        } catch (e) {
          // Single-image failures shouldn't kill the whole page.
        }
      }));

      // Phase 3: emit one image record per reference using the cached
      // dataURL.
      var images = [];
      for (var k = 0; k < refs.length; k++) {
        var r = refs[k];
        var url = resolvedById[r.objId];
        if (!url) continue;
        images.push({
          x: r.ctm[4],
          y: r.ctm[5],
          width: Math.abs(r.ctm[0]),
          height: Math.abs(r.ctm[3]),
          dataUrl: url
        });
      }
      return images;
    }

    // Convert the lines and images of a page into HTML, interleaving
    // images with text by Y coordinate so figures appear roughly in the
    // same place as in the source document.
    function _pageToHtml(lines, images, bodySize, pageWidth) {
      var blocks = [];
      images.forEach(function(im) {
        blocks.push({ kind: 'image', y: im.y + im.height, image: im });
      });
      lines.forEach(function(L) {
        blocks.push({ kind: 'line', y: L.y, line: L });
      });
      // PDF Y is bottom-up, so descending Y == top-to-bottom on screen.
      blocks.sort(function(a, b) { return b.y - a.y; });

      var html = '';
      var openTag = null, openParts = [], openCentered = false;
      var listType = null, listItems = [];
      var prevY = null, prevH = bodySize;

      function flushPara() {
        if (!openTag || !openParts.length) { openTag = null; openParts = []; openCentered = false; return; }
        var inner = openParts.join('<br>');
        var style = 'unicode-bidi:plaintext;direction:auto;margin:0 0 8px;';
        if (openTag === 'p') style += 'line-height:1.7;';
        if (openCentered) style += 'text-align:center;';
        html += '<' + openTag + ' style="' + style + '">' + inner + '</' + openTag + '>';
        openTag = null; openParts = []; openCentered = false;
      }
      function flushList() {
        if (!listType || !listItems.length) { listType = null; listItems = []; return; }
        var lis = listItems.map(function(it) {
          return '<li style="unicode-bidi:plaintext;direction:auto;line-height:1.7;margin-bottom:4px;">' + it + '</li>';
        }).join('');
        html += '<' + listType + ' style="margin:8px 0;padding-right:28px;padding-left:0;">' + lis + '</' + listType + '>';
        listType = null; listItems = [];
      }
      function flushAll() { flushPara(); flushList(); }

      blocks.forEach(function(b) {
        if (b.kind === 'image') {
          flushAll();
          var im = b.image;
          // Cap displayed width so giant scans don't blow out the page.
          var aspect = im.width && im.height ? im.height / im.width : null;
          var styleAttr = 'max-width:100%;height:auto;';
          if (aspect) styleAttr += ' aspect-ratio:' + im.width + '/' + im.height + ';';
          html += '<p style="text-align:center;margin:14px 0;"><img src="' + im.dataUrl + '" style="' + styleAttr + '" /></p>';
          prevY = im.y;            // bottom of image
          prevH = im.height;
          return;
        }

        var L = b.line;

        // List handling first — bullet/number prefix on the line.
        var lt = _detectListType(L);
        if (lt) {
          flushPara();
          var stripped = _stripListMarker(L);
          var liHtml = _lineToHtml(stripped.parts, bodySize);
          if (!liHtml.trim()) return;
          if (listType === lt) {
            listItems.push(liHtml);
          } else {
            flushList();
            listType = lt;
            listItems = [liHtml];
          }
          prevY = L.y; prevH = L.h;
          return;
        }

        // Continuation line of an active list (similar indent, no marker)
        // — append to the last list item rather than break the list.
        if (listType && listItems.length) {
          var firstX = L.parts[0] ? L.parts[0].x : 0;
          var prevListLineX = 0;       // approx — we don't track per-item
          // For simplicity, only continue list if the line is within a
          // small Y gap; otherwise close the list and treat as paragraph.
          if (prevY !== null && (prevY - L.y) < prevH * 1.6) {
            var contHtml = _lineToHtml(L.parts, bodySize);
            if (contHtml.trim()) {
              listItems[listItems.length - 1] += ' ' + contHtml;
              prevY = L.y; prevH = L.h;
              return;
            }
          }
          flushList();
        }

        // Regular paragraph / heading block.
        var tag = _lineTag(L, bodySize);
        var centered = _isCentered(L, pageWidth);
        var inlineHtml = _lineToHtml(L.parts, bodySize);
        if (!inlineHtml.trim()) return;

        var gapBreak = false;
        if (prevY !== null) {
          var gap = prevY - L.y;
          if (gap > prevH * 1.4) gapBreak = true;
        }

        if (openTag !== tag || openCentered !== centered || gapBreak) {
          flushPara();
          openTag = tag;
          openCentered = centered;
          openParts = [inlineHtml];
        } else {
          openParts.push(inlineHtml);
        }
        prevY = L.y; prevH = L.h;
      });

      flushAll();
      return html;
    }

    async function processFile(file) {
      if (!file) return;
      if (!window.pdfjsLib) { status.textContent = 'ספריית PDF לא נטענה'; return; }
      initPdfJs();
      status.textContent = 'קורא קובץ PDF…';
      status.style.color = 'var(--ink-mute)';
      bar.style.width = '5%';
      try {
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const n   = pdf.numPages;
        let html  = '';

        // First pass: collect per-page text + images + width in
        // parallel. Each page is independent, but to avoid hammering
        // the PDF.js worker we cap concurrency at 4 simultaneous pages.
        const perPageItems   = new Array(n);
        const perPageImages  = new Array(n);
        const perPageWidth   = new Array(n);
        const CONCURRENCY    = 6;
        let nextPage         = 1;
        let donePages        = 0;

        const includeImages = imgCheckbox.checked;

        async function _processOnePage() {
          while (true) {
            const myIdx = nextPage++;
            if (myIdx > n) return;
            const page = await pdf.getPage(myIdx);
            // Run text + image extraction in parallel within the page.
            // Image extraction is skipped entirely in fast mode.
            const tasks = [page.getTextContent()];
            if (includeImages) {
              tasks.push(_extractPageImages(page).catch(function(e) {
                console.warn('[pdf2word] images for page ' + myIdx + ':', e);
                return [];
              }));
            }
            const results = await Promise.all(tasks);
            const content = results[0];
            const images  = includeImages ? results[1] : [];
            const v = page.view || [0, 0, 612, 792];
            perPageItems[myIdx - 1]  = content.items;
            perPageImages[myIdx - 1] = images;
            perPageWidth[myIdx - 1]  = v[2] - v[0];
            donePages++;
            bar.style.width = (5 + (donePages / n) * 50) + '%';
            status.textContent = 'מנתח עמוד ' + donePages + ' / ' + n + '…';
          }
        }

        const workers = [];
        for (let w = 0; w < Math.min(CONCURRENCY, n); w++) workers.push(_processOnePage());
        await Promise.all(workers);

        const allItems = [].concat.apply([], perPageItems);
        const allLinesForBody = _buildLinesFromItems(allItems);
        const bodySize = _bodyFontSize(allLinesForBody);

        // Second pass: build per-page HTML using the global body size,
        // interleaving text and images by Y coordinate.
        status.textContent = 'בונה את מסמך ה-Word…';
        for (let i = 1; i <= n; i++) {
          bar.style.width = (55 + (i / n) * 40) + '%';
          const lines = _buildLinesFromItems(perPageItems[i - 1]);
          const pageHtml = _pageToHtml(lines, perPageImages[i - 1], bodySize, perPageWidth[i - 1]);
          if (n > 1) {
            html += '<p style="font-size:11px;color:#888;text-align:center;margin:20px 0 10px;direction:ltr;">— page ' + i + ' / ' + n + ' —</p>';
          }
          html += pageHtml;
        }
        bar.style.width = '100%';

        const titleHtml = _escHtml(file.name.replace(/\.pdf$/i, ''));
        const docHtml = [
          "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
          " xmlns:w='urn:schemas-microsoft-com:office:word'",
          " xmlns='http://www.w3.org/TR/REC-html40'>",
          "<head><meta charset='utf-8'><title>" + titleHtml + "</title>",
          "<style>",
          "  body { font-family: Arial, 'David', 'Times New Roman', serif; padding:40px; max-width:820px; margin:0 auto; direction:rtl; }",
          "  h1 { font-size:22pt; font-weight:bold; margin:18px 0 10px; }",
          "  h2 { font-size:16pt; font-weight:bold; margin:14px 0 8px; }",
          "  h3 { font-size:13pt; font-weight:bold; margin:10px 0 6px; }",
          "  p  { font-size:12pt; line-height:1.7; margin:0 0 8px; }",
          "  p, h1, h2, h3, li { unicode-bidi: plaintext; direction: auto; text-align: right; }",
          "  strong { font-weight: bold; }",
          "  em { font-style: italic; }",
          "</style>",
          "</head><body dir='rtl'>",
          "<h1 style='font-size:22pt;text-align:center;margin-bottom:24px;'>" + titleHtml + "</h1>",
          html, "</body></html>"
        ].join('');
        const blob = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = file.name.replace(/\.pdf$/i, '.doc'); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        status.textContent = '✓ חולץ ' + n + ' עמודים תוך שמירה על מבנה — הורד ' + file.name.replace(/\.pdf$/i, '.doc');
        status.style.color = 'var(--sage-deep)';
      } catch (e) {
        console.error('[pdf2word]', e);
        status.textContent = 'שגיאה: ' + (e && e.message ? e.message : 'לא ניתן לקרוא את ה-PDF') + ' (אולי מוגן בסיסמה?)';
        status.style.color = '#c00';
        bar.style.width = '0';
      }
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.pdf'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => processFile(fileInput.files[0]));

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: () => fileInput.click()
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '📄'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ PDF לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, 'או לחץ לבחירה · .pdf')
    ]);
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.style.borderColor = 'var(--butter-deep)'; zone.style.background = 'var(--butter)'; });
    zone.addEventListener('dragleave', ()  => { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '📄  PDF  →  Word'),
        App.el('span', { class: 'chip butter' }, 'חלץ טקסט מ-PDF לקובץ Word')
      ]),
      fileInput, zone, optsRow, status, bar,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '✨ משמר מבנה: שורות, פסקאות, כותרות, רשימות (• / 1.), כותרות ממורכזות, Bold/Italic. תמונות מוטמעות אופציונליות — בטל את הסימון להמרה מהירה של PDF טקסטואלי.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfToWord = buildPdfToWord;
})();