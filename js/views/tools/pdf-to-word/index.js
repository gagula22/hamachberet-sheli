(function () {
  // PDF -> Word (EDITABLE). Builds on the heuristic line-reconstruction +
  // operator-list image extraction, and ADDS two things the old version
  // lacked: (1) text COLOR + HIGHLIGHT (background) colors, extracted by
  // walking the page operator list and correlating filled rectangles with
  // text bounding boxes, and (2) a hardened image decoder that correctly
  // handles 1bpp packed grayscale, RGB/RGBA, ImageBitmap (JPEG/DCT) and
  // stencil masks instead of scrambling them.
  //
  // Output is a self-contained HTML document served as a Blob with MIME
  // 'application/msword' + UTF-8 BOM, downloaded as "<name>.doc". Word opens
  // it as a fully editable RTL document (text stays selectable/editable).
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    const base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }

  // ── Tool: PDF → Word ──────────────────────────────────────────────────────
  function buildPdfToWord() {
    const status = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const bar    = App.el('div', {
      style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px',
               width: '0', transition: 'width 300ms', marginTop: '10px' }
    });

    // Image extraction is the slow part of the conversion. The user can opt
    // out for a near-instant "text only" run.
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

    // ── Helpers for structure-preserving extraction ──────────────────────
    function _escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

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

    // ── Color helpers ────────────────────────────────────────────────────
    function _clamp255(v) { v = Math.round(v); return v < 0 ? 0 : (v > 255 ? 255 : v); }
    function _toHex(c) {
      return '#' + [c.r, c.g, c.b].map(function (v) {
        return _clamp255(v).toString(16).padStart(2, '0');
      }).join('');
    }
    // Perceptual luminance (0–255). Used to reject black text-fill and
    // white/near-white page background when picking highlight colors.
    function _lum(c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
    function _isNearBlack(c) { return _lum(c) < 30; }
    function _isNearWhite(c) { return c.r >= 248 && c.g >= 248 && c.b >= 248; }
    function _cmykToRgb(cc, m, y, k) {
      return {
        r: 255 * (1 - cc) * (1 - k),
        g: 255 * (1 - m) * (1 - k),
        b: 255 * (1 - y) * (1 - k)
      };
    }

    // Reconstruct lines from PDF text items by grouping items with similar
    // baseline Y. Within a line sort by X. PDF origin is bottom-left, so we
    // sort lines by Y descending afterwards. Each part also carries an
    // operator-order index (so we can align it with the color timeline) which
    // is filled in by the caller before calling this.
    function _buildLinesFromItems(items) {
      var lines = [];   // [{ y, h, parts: [...] }]
      const Y_TOLERANCE_FACTOR = 0.5;  // items within 0.5×height share a line
      items.forEach(function(it) {
        if (!it.str) return;
        // transform = [a, b, c, d, e, f]; e = x, f = y; height ≈ |a|
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
          hasEOL: !!it.hasEOL,
          // color/bg are assigned later from the operator-list correlation;
          // default to no color (black text) and no highlight.
          color: it.__color || null,   // {r,g,b} or null (=> black)
          bg: it.__bg || null          // {r,g,b} or null (=> no highlight)
        };
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
      lines.sort(function(a, b) { return b.y - a.y; });
      lines.forEach(function(L) {
        L.parts.sort(function(a, b) { return a.x - b.x; });
      });
      return lines;
    }

    function _bodyFontSize(lines) {
      var sizes = [];
      lines.forEach(function(L) {
        L.parts.forEach(function(p) { if (p.fontSize > 0) sizes.push(p.fontSize); });
      });
      if (!sizes.length) return 10;
      sizes.sort(function(a, b){ return a - b; });
      return sizes[Math.floor(sizes.length / 2)];
    }

    // Convert a line's parts to inline HTML. Adjacent parts with identical
    // {bold,italic,color,bg} are merged into one run to minimize span churn
    // (huge PDFs otherwise explode the .doc and choke Word). A space is
    // inserted when there is a visible X gap between consecutive items.
    function _sameFmt(a, b) {
      function colEq(x, y) {
        if (!x && !y) return true;
        if (!x || !y) return false;
        return x.r === y.r && x.g === y.g && x.b === y.b;
      }
      return !!a.bold === !!b.bold && !!a.italic === !!b.italic &&
             colEq(a.color, b.color) && colEq(a.bg, b.bg);
    }

    function _lineToHtml(parts) {
      if (!parts.length) return '';
      // Merge adjacent same-format runs, tracking gap-spaces between them.
      var runs = [];
      var prev = null;
      parts.forEach(function(p) {
        var text = p.str;
        var leadSpace = '';
        if (prev) {
          var prevEnd = prev.x + (prev.width || 0);
          var gap = p.x - prevEnd;
          if (gap > prev.fontSize * 0.25 && !/\s$/.test(prev.str) && !/^\s/.test(text)) {
            leadSpace = ' ';
          }
        }
        var last = runs.length ? runs[runs.length - 1] : null;
        if (last && _sameFmt(last.fmt, p)) {
          last.text += leadSpace + text;
        } else {
          runs.push({ fmt: { bold: p.bold, italic: p.italic, color: p.color, bg: p.bg },
                      text: (last ? leadSpace : '') + text });
        }
        prev = p;
      });

      var out = '';
      runs.forEach(function(run) {
        var text = _escHtml(run.text);
        var open = '', close = '';
        // Highlight background — wrap outermost so Word renders the fill.
        if (run.fmt.bg) {
          open += '<span style="background-color:' + _toHex(run.fmt.bg) + ';">';
          close = '</span>' + close;
        }
        // Text color — only emit for non-black fills.
        if (run.fmt.color && !_isNearBlack(run.fmt.color)) {
          open += '<span style="color:' + _toHex(run.fmt.color) + ';">';
          close = '</span>' + close;
        }
        if (run.fmt.bold)   { open += '<strong>'; close = '</strong>' + close; }
        if (run.fmt.italic) { open += '<em>';     close = '</em>' + close; }
        out += open + text + close;
      });
      return out;
    }

    function _lineTag(line, bodySize) {
      var maxSize = 0;
      line.parts.forEach(function(p) { if (p.fontSize > maxSize) maxSize = p.fontSize; });
      var ratio = bodySize > 0 ? maxSize / bodySize : 1;
      if (ratio >= 1.85) return 'h1';
      if (ratio >= 1.55) return 'h2';
      if (ratio >= 1.25) return 'h3';
      return 'p';
    }

    // ── List detection (English + Hebrew) ────────────────────────────────
    var _BULLET_RE  = /^\s*([•·◦‣⁃●○▪▫■♦▶►–—\-*])\s+/;
    var _NUMBER_RE  = /^\s*(\d{1,3})[.)\]]\s+/;
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
      var lineWidth = maxX - minX;
      if (lineWidth > pageWidth * 0.7) return false;
      return Math.abs(lineMid - pageMid) < pageWidth * 0.08;
    }

    // ── Matrix multiply (CTM tracking) ───────────────────────────────────
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
    // Apply a CTM to a point in user space → device/page space.
    function _applyMat(m, x, y) {
      return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] };
    }

    // ── Hardened image decoder ───────────────────────────────────────────
    // Fixes the old "broken images" complaint. The old code decoded
    // kind===1 (GRAYSCALE_1BPP) as 8-bit grayscale — but kind 1 is ONE BIT
    // per pixel, packed 8px/byte with each row padded to a whole byte. It
    // also never tried img.bitmap first, so JPEG/DCT images (which arrive as
    // an ImageBitmap, NOT as .data) silently vanished.
    function _imgObjToDataUrl(img) {
      if (!img || !img.width || !img.height) return null;
      // Skip decorative tiny images (icons / masks / dots).
      if (img.width < 8 || img.height < 8) return null;
      try {
        var w = img.width, h = img.height;
        var srcCanvas = document.createElement('canvas');
        srcCanvas.width = w;
        srcCanvas.height = h;
        var srcCtx = srcCanvas.getContext('2d');

        if (img.bitmap) {
          // (1) ImageBitmap / canvas — the common case for JPEG/DCT images
          // decoded by the worker. ALWAYS try this first.
          srcCtx.drawImage(img.bitmap, 0, 0, w, h);
        } else if (img.data) {
          var imgData = srcCtx.createImageData(w, h);
          var dst = imgData.data;
          var src = img.data;
          var kind = img.kind;

          if (kind === 3) {
            // RGBA_32BPP — straight copy.
            var min = Math.min(src.length, dst.length);
            for (var i3 = 0; i3 < min; i3++) dst[i3] = src[i3];
          } else if (kind === 2) {
            // RGB_24BPP. Compute the actual row stride to survive row
            // padding (never assume contiguous width*3).
            var rowBytes2 = w * 3;
            if (src.length > rowBytes2 * h) {
              rowBytes2 = Math.floor(src.length / h);
            }
            for (var y2 = 0; y2 < h; y2++) {
              var sRow = y2 * rowBytes2;
              var dRow = y2 * w * 4;
              for (var x2 = 0; x2 < w; x2++) {
                var so = sRow + x2 * 3;
                var doff = dRow + x2 * 4;
                dst[doff]   = src[so];
                dst[doff+1] = src[so+1];
                dst[doff+2] = src[so+2];
                dst[doff+3] = 255;
              }
            }
          } else if (kind === 1) {
            // GRAYSCALE_1BPP — THE FIX. 1 bit per pixel, packed 8px/byte,
            // each row padded to a whole byte. bit set = white.
            var bytesPerRow = (w + 7) >> 3;
            for (var y1 = 0; y1 < h; y1++) {
              var rowOff = y1 * bytesPerRow;
              for (var x1 = 0; x1 < w; x1++) {
                var byteIdx = rowOff + (x1 >> 3);
                var bit = (src[byteIdx] >> (7 - (x1 & 7))) & 1;
                var v = bit ? 255 : 0;
                var d1 = (y1 * w + x1) * 4;
                dst[d1] = dst[d1+1] = dst[d1+2] = v;
                dst[d1+3] = 255;
              }
            }
          } else {
            // No explicit kind. If the data length matches a 1bpp stencil
            // (ceil(w/8)*h) treat it as a mask: opaque black where bit set.
            var bpr = (w + 7) >> 3;
            if (src.length >= bpr * h) {
              for (var ym = 0; ym < h; ym++) {
                var rOff = ym * bpr;
                for (var xm = 0; xm < w; xm++) {
                  var bI = rOff + (xm >> 3);
                  var b = (src[bI] >> (7 - (xm & 7))) & 1;
                  var dm = (ym * w + xm) * 4;
                  // stencil: bit set => opaque black, else transparent.
                  dst[dm] = dst[dm+1] = dst[dm+2] = 0;
                  dst[dm+3] = b ? 255 : 0;
                }
              }
            } else {
              // Unknown/short data — never emit a scrambled canvas.
              return null;
            }
          }
          srcCtx.putImageData(imgData, 0, 0);
        } else {
          return null;
        }

        // Validate the canvas isn't fully blank/transparent (sample a few
        // pixels). A fully-empty canvas means decoding failed.
        try {
          var sample = srcCtx.getImageData(0, 0, Math.min(w, 4), Math.min(h, 4)).data;
          var anyNonZero = false;
          for (var s = 3; s < sample.length; s += 4) {
            if (sample[s] !== 0) { anyNonZero = true; break; }
          }
          if (!anyNonZero) return null;
        } catch (e) { /* CORS-tainted bitmaps can't be sampled; allow them. */ }

        // Downscale to max edge 1280 before serializing.
        var MAX_EDGE = 1280;
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
        // Photos (>512 either side) → JPEG; line art / text-in-image → PNG.
        var useJpeg = (canvas.width > 512 || canvas.height > 512);
        return useJpeg ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('[pdf2word] image decode failed:', e);
        return null;
      }
    }

    function _resolvePageObj(page, objId) {
      return new Promise(function(resolve) {
        // Safety timeout: if an image object never becomes available (missing /
        // malformed XObject) page.objs.get's callback can hang forever and freeze
        // the whole conversion. Resolve null after 8s so the page still finishes.
        var settled = false;
        var done = function(obj) { if (!settled) { settled = true; resolve(obj); } };
        setTimeout(function () { done(null); }, 8000);
        try {
          if (page.objs.has && page.objs.has(objId)) {
            done(page.objs.get(objId));
            return;
          }
          page.objs.get(objId, function(obj) { done(obj); });
        } catch (e) { done(null); }
      });
    }

    // ── Operator-list pass: images + colors + highlight rectangles ───────
    // This is the load-bearing addition. We walk the page operator list once,
    // tracking the CTM via the save/restore stack and OPS.transform, and the
    // current fill color. We collect:
    //   • image references (objId + CTM), exactly like the old Phase 1;
    //   • FILLED RECTANGLES drawn before text (candidate highlights), in
    //     device space, with their fill color;
    //   • a "color timeline": one fill-color snapshot per showText op, in op
    //     order — getTextContent items map (approximately) 1:1 to these.
    function _walkOperatorList(opList, page) {
      var OPS = pdfjsLib.OPS;
      var ctm = [1,0,0,1,0,0];
      var stack = [];
      var fill = { r: 0, g: 0, b: 0 };   // current fill color, default black

      var refs = [];        // [{ objId, ctm }]
      var rects = [];       // [{ x0,y0,x1,y1, color, order }] filled rects
      var colorTimeline = []; // [{r,g,b}] one per showText, in op order
      // Remember the most recently constructed path so we can recognise a
      // rectangle that is immediately filled.
      var pendingRect = null; // {x0,y0,x1,y1} in device space, or null

      var fnArray = opList.fnArray, argsArray = opList.argsArray;
      for (var i = 0; i < fnArray.length; i++) {
        var op = fnArray[i];
        var args = argsArray[i];

        if (op === OPS.save) {
          stack.push({ ctm: ctm.slice(), fill: { r: fill.r, g: fill.g, b: fill.b } });
        } else if (op === OPS.restore) {
          if (stack.length) { var st = stack.pop(); ctm = st.ctm; fill = st.fill; }
        } else if (op === OPS.transform) {
          ctm = _matMul(ctm, args);

        // ── Fill color tracking ──────────────────────────────────────────
        } else if (op === OPS.setFillRGBColor) {
          // op-list args are already 0–255 integers — do NOT ×255.
          fill = { r: args[0], g: args[1], b: args[2] };
        } else if (op === OPS.setFillGray) {
          var gv = Math.round((args[0] || 0) * 255); // gray is 0–1
          fill = { r: gv, g: gv, b: gv };
        } else if (op === OPS.setFillCMYKColor) {
          fill = _cmykToRgb(args[0] || 0, args[1] || 0, args[2] || 0, args[3] || 0);
        } else if (op === OPS.setFillColor || op === OPS.setFillColorN) {
          // Generic — may carry [r,g,b] (0–1 or 0–255). Guard array shape.
          if (args && args.length >= 3 && typeof args[0] === 'number') {
            var mx = Math.max(args[0], args[1], args[2]);
            var mul = mx <= 1 ? 255 : 1;
            fill = { r: args[0]*mul, g: args[1]*mul, b: args[2]*mul };
          }

        // ── Rectangle path → candidate highlight ─────────────────────────
        } else if (op === OPS.constructPath) {
          // In 3.x args = [subOpsArray, coordsArray(, minMax)]. A rectangle
          // sub-op (OPS.rectangle === 19) carries flat coords [x,y,w,h].
          pendingRect = null;
          try {
            var subOps = args[0], coords = args[1];
            if (subOps && coords && typeof subOps.length === 'number') {
              for (var so = 0, ci = 0; so < subOps.length; so++) {
                var sub = subOps[so];
                if (sub === OPS.rectangle) {
                  var rx = coords[ci], ry = coords[ci+1], rw = coords[ci+2], rh = coords[ci+3];
                  // Transform the 4 corners by the CTM into device space.
                  var c1 = _applyMat(ctm, rx, ry);
                  var c2 = _applyMat(ctm, rx + rw, ry + rh);
                  pendingRect = {
                    x0: Math.min(c1.x, c2.x), y0: Math.min(c1.y, c2.y),
                    x1: Math.max(c1.x, c2.x), y1: Math.max(c1.y, c2.y)
                  };
                  ci += 4;
                } else if (sub === OPS.moveTo || sub === OPS.lineTo) {
                  ci += 2;
                } else if (sub === OPS.curveTo) {
                  ci += 6;
                } else if (sub === OPS.curveTo2 || sub === OPS.curveTo3) {
                  ci += 4;
                }
              }
            }
          } catch (e) { pendingRect = null; }

        } else if (op === OPS.fill || op === OPS.eoFill) {
          // A fill right after a rectangle path = a filled rectangle. Record it
          // as a highlight candidate — but PRE-FILTER hard. Chart PDFs are built
          // from thousands of tiny colored rectangles (every candlestick = a
          // rect); collecting them all and correlating each against every text
          // item is O(items×rects) and freezes the tab. A real text highlight is
          // (a) reasonably wide and tall (spans a word/line), and (b) a non-black,
          // non-white fill. Thin/tiny rects (candles, wicks, rules) and pure
          // black/white fills are dropped at the source. We also cap the total.
          if (pendingRect && rects.length < 2500) {
            var rW = pendingRect.x1 - pendingRect.x0;
            var rH = pendingRect.y1 - pendingRect.y0;
            var rLum = 0.299 * fill.r + 0.587 * fill.g + 0.114 * fill.b;
            if (rW >= 8 && rH >= 4 && rLum >= 30 && rLum <= 245 &&
                !(fill.r >= 248 && fill.g >= 248 && fill.b >= 248)) {
              rects.push({
                x0: pendingRect.x0, y0: pendingRect.y0, x1: pendingRect.x1, y1: pendingRect.y1,
                color: { r: fill.r, g: fill.g, b: fill.b }, order: i
              });
            }
          }
          pendingRect = null;

        // ── Text — snapshot pen color into the timeline ──────────────────
        } else if (op === OPS.showText || op === OPS.showSpacedText) {
          colorTimeline.push({ r: fill.r, g: fill.g, b: fill.b, order: i });

        // ── Images ───────────────────────────────────────────────────────
        } else if (op === OPS.paintImageXObject || op === OPS.paintImageMaskXObject ||
                   op === OPS.paintInlineImageXObject) {
          // paintInlineImageXObject carries the image object inline as args[0]
          // (not an objId string); _resolveImages decodes string ids, and for
          // inline objects we decode directly here.
          if (typeof args[0] === 'string') {
            refs.push({ objId: args[0], ctm: ctm.slice() });
          } else if (args[0] && args[0].width) {
            refs.push({ inlineImg: args[0], ctm: ctm.slice() });
          }
        }
      }
      return { refs: refs, rects: rects, colorTimeline: colorTimeline };
    }

    // Resolve + decode the unique images collected from the operator walk.
    async function _resolveImages(page, refs) {
      if (!refs.length) return [];
      var uniqueIds = {};
      refs.forEach(function(r) { if (typeof r.objId === 'string') uniqueIds[r.objId] = true; });
      var idList = Object.keys(uniqueIds);
      var resolvedById = {};
      await Promise.all(idList.map(async function(objId) {
        try {
          var imgObj = await _resolvePageObj(page, objId);
          if (!imgObj) return;
          var dataUrl = _imgObjToDataUrl(imgObj);
          if (dataUrl) resolvedById[objId] = dataUrl;
        } catch (e) { /* one bad image must not kill the page */ }
      }));
      var images = [];
      for (var k = 0; k < refs.length; k++) {
        var r = refs[k];
        var url = null;
        if (typeof r.objId === 'string') {
          url = resolvedById[r.objId];
        } else if (r.inlineImg) {
          // Inline image object — decode directly (no objs lookup).
          try { url = _imgObjToDataUrl(r.inlineImg); } catch (e) { url = null; }
        }
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

    // ── Correlate colors + highlight rects with text items ───────────────
    // Mutates each item, stamping it with __color (text fill) and __bg
    // (highlight background) which _buildLinesFromItems then reads.
    //
    // TEXT COLOR: PDF.js emits one showText op per getTextContent item (in
    // the same order) for normal content in 3.x, so color[k] = timeline[k].
    // If the counts mismatch (marked content / TJ-vs-Tj splitting), we fall
    // back to the nearest preceding timeline entry by op order — and finally
    // leave it black. Pure/near-black is treated as "no color".
    //
    // HIGHLIGHT: for each text bbox we look for a recorded fill-rect that
    //   (1) was drawn BEFORE the text (rect.order < the run's showText order),
    //   (2) overlaps >55% of the text bbox,
    //   (3) is not too tall (height ≤ 2.2× line height — excludes section /
    //       full-page backgrounds),
    //   (4) has a non-black, non-white color (luminance 30–245),
    //   (5) is not a page background (≤70% page width OR ≤50% page height).
    // If several qualify we pick the smallest-area one (tightest highlight).
    function _correlate(items, walk, pageWidth, pageHeight) {
      var timeline = walk.colorTimeline;
      var rects = walk.rects;
      var sameLen = timeline.length === items.length;

      // Build device-space bbox for a text item from its transform.
      function bboxOf(it) {
        var t = it.transform || [1,0,0,1,0,0];
        var x = t[4], y = t[5];
        var fh = Math.abs(t[0]) || it.height || 10;       // glyph/line height
        var wdt = it.width || (it.str ? it.str.length * fh * 0.5 : fh);
        // baseline at y; expand downward ~0.25h for descenders, up by ~0.8h
        // for the cap height so the box covers the glyph body.
        return { x0: x, y0: y - fh * 0.25, x1: x + wdt, y1: y + fh * 0.8, h: fh, wdt: wdt };
      }

      // Precompute the showText op-order for each item (for the "before"
      // test). When counts line up, item k corresponds to timeline[k].order.
      items.forEach(function(it, k) {
        var bb = bboxOf(it);

        // ── Text color ──
        var col = null;
        if (sameLen) {
          col = timeline[k];
        } else if (timeline.length) {
          // nearest preceding by index proportion as a coarse fallback
          var idx = Math.min(timeline.length - 1, Math.floor(k * timeline.length / Math.max(1, items.length)));
          col = timeline[idx];
        }
        if (col && !_isNearBlack(col)) {
          it.__color = { r: col.r, g: col.g, b: col.b };
        }
        var showOrder = (col && typeof col.order === 'number') ? col.order : Infinity;

        // ── Highlight background ──
        var textArea = Math.max(1, (bb.x1 - bb.x0) * (bb.y1 - bb.y0));
        var best = null, bestArea = Infinity;
        for (var ri = 0; ri < rects.length; ri++) {
          var R = rects[ri];
          // (1) painted before the text
          if (R.order >= showOrder) continue;
          // (4) color must be a real highlight (not black text, not white bg)
          var lum = _lum(R.color);
          if (lum < 30 || lum > 245) continue;
          if (_isNearWhite(R.color)) continue;
          var rw = R.x1 - R.x0, rh = R.y1 - R.y0;
          if (rw <= 0 || rh <= 0) continue;
          // (5) reject page-background-sized rects
          if (pageWidth && pageHeight && rw > pageWidth * 0.7 && rh > pageHeight * 0.5) continue;
          // (3) reject tall section fills
          if (rh > bb.h * 2.2) continue;
          // (2) overlap area > 55% of the text bbox
          var ox = Math.max(0, Math.min(bb.x1, R.x1) - Math.max(bb.x0, R.x0));
          var oy = Math.max(0, Math.min(bb.y1, R.y1) - Math.max(bb.y0, R.y0));
          var overlap = ox * oy;
          if (overlap / textArea < 0.55) continue;
          var area = rw * rh;
          if (area < bestArea) { best = R; bestArea = area; }
        }
        if (best) it.__bg = { r: best.color.r, g: best.color.g, b: best.color.b };
      });
      return items;
    }

    // Page → HTML, interleaving images with text by Y so figures land near
    // their source position. (Structure logic preserved from the heuristic
    // version; runs now also carry color/bg.)
    function _pageToHtml(lines, images, bodySize, pageWidth) {
      var blocks = [];
      images.forEach(function(im) {
        blocks.push({ kind: 'image', y: im.y + im.height, image: im });
      });
      lines.forEach(function(L) {
        blocks.push({ kind: 'line', y: L.y, line: L });
      });
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
          // Word ignores % width on <img> — give it a px width so big scans
          // don't overflow, capped to the content area (~680px).
          var dispW = im.width ? Math.min(680, Math.round(im.width)) : 480;
          html += '<p style="text-align:center;margin:14px 0;"><img width="' + dispW +
                  '" src="' + im.dataUrl + '" style="width:' + dispW + 'px;max-width:100%;height:auto;" /></p>';
          prevY = im.y;
          prevH = im.height;
          return;
        }

        var L = b.line;

        var lt = _detectListType(L);
        if (lt) {
          flushPara();
          var stripped = _stripListMarker(L);
          var liHtml = _lineToHtml(stripped.parts);
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

        if (listType && listItems.length) {
          if (prevY !== null && (prevY - L.y) < prevH * 1.6) {
            var contHtml = _lineToHtml(L.parts);
            if (contHtml.trim()) {
              listItems[listItems.length - 1] += ' ' + contHtml;
              prevY = L.y; prevH = L.h;
              return;
            }
          }
          flushList();
        }

        var tag = _lineTag(L, bodySize);
        var centered = _isCentered(L, pageWidth);
        var inlineHtml = _lineToHtml(L.parts);
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
            const v = page.view || [0, 0, 612, 792];
            const pageW = v[2] - v[0];
            const pageH = v[3] - v[1];

            // getTextContent (geometry+text) and getOperatorList (color +
            // highlight + image graphics state) in parallel.
            let content, walk = null;
            try {
              const res = await Promise.all([
                page.getTextContent({ includeMarkedContent: false }),
                page.getOperatorList().catch(function (e) {
                  console.warn('[pdf2word] getOperatorList failed p' + myIdx + ':', e);
                  return null;
                })
              ]);
              content = res[0];
              const opList = res[1];
              if (opList && pdfjsLib.OPS) {
                walk = _walkOperatorList(opList, page);
              }
            } catch (e) {
              console.warn('[pdf2word] page ' + myIdx + ' analysis failed:', e);
              content = { items: [] };
            }

            let items = content.items || [];
            // Correlate colors + highlights onto the items (best-effort).
            if (walk) {
              try { _correlate(items, walk, pageW, pageH); }
              catch (e) { console.warn('[pdf2word] correlate p' + myIdx + ':', e); }
            }

            // Resolve images from the same operator walk.
            let images = [];
            if (includeImages && walk && walk.refs.length) {
              try { images = await _resolveImages(page, walk.refs); }
              catch (e) { console.warn('[pdf2word] images p' + myIdx + ':', e); }
            }

            perPageItems[myIdx - 1]  = items;
            perPageImages[myIdx - 1] = images;
            perPageWidth[myIdx - 1]  = pageW;
            donePages++;
            bar.style.width = (5 + (donePages / n) * 50) + '%';
            status.textContent = 'מנתח עמוד ' + donePages + ' / ' + n + '…';
            page.cleanup && page.cleanup();
          }
        }

        const workers = [];
        for (let w = 0; w < Math.min(CONCURRENCY, n); w++) workers.push(_processOnePage());
        await Promise.all(workers);

        const allItems = [].concat.apply([], perPageItems);
        const allLinesForBody = _buildLinesFromItems(allItems);
        const bodySize = _bodyFontSize(allLinesForBody);

        // Detect a SCANNED / image-only PDF (no real text layer). Such a PDF
        // cannot become editable text — there is no text in it, only pixels —
        // so we still convert (the page images are embedded) but tell the user
        // clearly instead of producing a near-empty "editable" document.
        const totalTextChars = allItems.reduce(function (s, it) { return s + ((it.str || '').length); }, 0);
        const isImageOnly = totalTextChars < 12;

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
        // MSO HTML-as-.doc. UTF-8 BOM + application/msword keeps Hebrew/RTL
        // intact and Word opens it as a fully editable document.
        const docHtml = [
          "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
          " xmlns:w='urn:schemas-microsoft-com:office:word'",
          " xmlns='http://www.w3.org/TR/REC-html40'>",
          "<head><meta charset='utf-8'><title>" + titleHtml + "</title>",
          "<style>",
          "  @page Section1 { size:595.3pt 841.9pt; margin:2cm 2cm 2cm 2cm; mso-paper-source:0; }",
          "  div.Section1 { page:Section1; }",
          "  body { font-family: Arial, 'David', 'Times New Roman', serif; padding:0; max-width:820px; margin:0 auto; direction:rtl; }",
          "  h1 { font-size:22pt; font-weight:bold; margin:18px 0 10px; }",
          "  h2 { font-size:16pt; font-weight:bold; margin:14px 0 8px; }",
          "  h3 { font-size:13pt; font-weight:bold; margin:10px 0 6px; }",
          "  p  { font-size:12pt; line-height:1.7; margin:0 0 8px; }",
          "  p, h1, h2, h3, li { unicode-bidi: plaintext; direction: auto; text-align: right; }",
          "  strong { font-weight: bold; }",
          "  em { font-style: italic; }",
          "  img { max-width:100%; height:auto; }",
          "</style>",
          "</head><body dir='rtl'><div class='Section1'>",
          "<h1 style='font-size:22pt;text-align:center;margin-bottom:24px;'>" + titleHtml + "</h1>",
          html, "</div></body></html>"
        ].join('');
        const blob = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = file.name.replace(/\.pdf$/i, '.doc'); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (isImageOnly) {
          status.innerHTML = 'ℹ️ ל-PDF זה <strong>אין שכבת טקסט</strong> (הוא מורכב מתמונות סרוקות) — לכן אי אפשר לחלץ ממנו טקסט נערך. ' +
            'הורד קובץ Word עם תמונות העמודים. <strong>לטקסט נערך</strong>: ייצא את המסמך המקורי ל-Word ישירות (למשל מתוך "ייצוא ל-Word" במחברת).';
          status.style.color = 'var(--ink)';
        } else {
          status.textContent = '✓ חולץ ' + n + ' עמודים עם טקסט נערך, צבעים, הדגשות ותמונות — הורד ' + file.name.replace(/\.pdf$/i, '.doc');
          status.style.color = 'var(--sage-deep)';
        }
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
        App.el('span', { class: 'chip butter' }, 'המר PDF ל-Word נערך עם צבעים והדגשות')
      ]),
      fileInput, zone, optsRow, status, bar,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '✨ טקסט נערך לחלוטין עם שמירה על מבנה: כותרות, פסקאות, רשימות (• / 1. / א.), כותרות ממורכזות, Bold/Italic, צבע טקסט, הדגשות רקע (צהוב/ירוק) ותמונות מוטמעות במקומן. בטל את הסימון להמרה מהירה של טקסט בלבד.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfToWord = buildPdfToWord;
})();
