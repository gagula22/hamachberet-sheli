(function () {
  // VT MP3 parse/byte-slice. Extracted from index.js.
  var _transcribeViaWorker = window.VT_WORKER._transcribeViaWorker;
  function _skipID3v2(bytes) {
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
                   ((bytes[8] & 0x7f) << 7)  |  (bytes[9] & 0x7f);
      return 10 + size;
    }
    return 0;
  }

  function _findMp3FrameNear(bytes, from, range) {
    range = range || 65536;
    const len = bytes.length - 4;
    const fwdEnd = Math.min(len, from + range);
    for (let i = Math.max(0, from); i < fwdEnd; i++) {
      // Sync 11 bits + non-reserved version + non-reserved layer
      if (bytes[i] === 0xFF &&
          (bytes[i+1] & 0xE0) === 0xE0 &&
          (bytes[i+1] & 0x18) !== 0x08 &&  // not reserved version
          (bytes[i+1] & 0x06) !== 0x00) {  // not reserved layer
        return i;
      }
    }
    const backStart = Math.max(0, from - range);
    for (let i = Math.min(from - 1, len - 1); i >= backStart; i--) {
      if (bytes[i] === 0xFF &&
          (bytes[i+1] & 0xE0) === 0xE0 &&
          (bytes[i+1] & 0x18) !== 0x08 &&
          (bytes[i+1] & 0x06) !== 0x00) {
        return i;
      }
    }
    return -1;
  }

  function _parseMp3FrameHeader(bytes, offset) {
    if (bytes.length < offset + 4) return null;
    if (bytes[offset] !== 0xFF) return null;
    if ((bytes[offset+1] & 0xE0) !== 0xE0) return null;

    const b1 = bytes[offset + 1];
    const b2 = bytes[offset + 2];
    const versionId    = (b1 >> 3) & 0x03;   // 0=2.5, 1=res, 2=2, 3=1
    const layer        = (b1 >> 1) & 0x03;   // 1=L3, 2=L2, 3=L1
    const bitrateIdx   = (b2 >> 4) & 0x0F;
    const samplerateIdx= (b2 >> 2) & 0x03;
    if (versionId === 1 || layer === 0) return null;
    if (bitrateIdx === 0 || bitrateIdx === 0x0F) return null;
    if (samplerateIdx === 3) return null;
    if (layer !== 1) return null;  // Layer III only

    const BR_M1_L3 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
    const BR_M2_L3 = [0, 8,16,24,32,40,48,56, 64, 80, 96,112,128,144,160,0];
    const SR_M1  = [44100, 48000, 32000];
    const SR_M2  = [22050, 24000, 16000];
    const SR_M25 = [11025, 12000,  8000];

    let bitrate, sampleRate;
    if (versionId === 3)      { bitrate = BR_M1_L3[bitrateIdx] * 1000; sampleRate = SR_M1[samplerateIdx]; }
    else if (versionId === 2) { bitrate = BR_M2_L3[bitrateIdx] * 1000; sampleRate = SR_M2[samplerateIdx]; }
    else                      { bitrate = BR_M2_L3[bitrateIdx] * 1000; sampleRate = SR_M25[samplerateIdx]; }
    if (!bitrate || !sampleRate) return null;
    return { bitrate: bitrate, sampleRate: sampleRate, versionId: versionId };
  }

  // Parse Xing/Info VBR header inside the first MP3 frame.
  // Returns { frames, audioBytes } or null. Lets us compute accurate duration
  // for VBR files where bytes/sec varies.
  function _parseXingHeader(bytes, frameOffset, header) {
    const channelMode = (bytes[frameOffset + 3] >> 6) & 0x03;
    const isMono = (channelMode === 3);
    // Side-info length depends on MPEG version + channel mode
    let sideInfoLen;
    if (header.versionId === 3) {            // MPEG1
      sideInfoLen = isMono ? 17 : 32;
    } else {                                  // MPEG2 / 2.5
      sideInfoLen = isMono ? 9 : 17;
    }
    const off = frameOffset + 4 + sideInfoLen;
    if (off + 8 > bytes.length) return null;
    // "Xing" (CBR-padded) or "Info" (true VBR)
    const isXing = bytes[off]   === 0x58 && bytes[off+1] === 0x69 &&
                   bytes[off+2] === 0x6E && bytes[off+3] === 0x67;
    const isInfo = bytes[off]   === 0x49 && bytes[off+1] === 0x6E &&
                   bytes[off+2] === 0x66 && bytes[off+3] === 0x6F;
    if (!isXing && !isInfo) return null;

    const flags = (bytes[off+4] << 24) | (bytes[off+5] << 16) |
                  (bytes[off+6] << 8)  |  bytes[off+7];
    let pos = off + 8;
    let frames = 0, audioBytes = 0;
    if (flags & 0x01) {
      frames = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      pos += 4;
    }
    if (flags & 0x02) {
      audioBytes = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      pos += 4;
    }
    return { frames: frames, audioBytes: audioBytes, kind: isXing ? 'Xing' : 'Info' };
  }

  // Read full MP3 file, parse header, compute duration. Accepts CBR + VBR.
  // Returns { bytes, bitrate, sampleRate, durationSec, dataStart, bytesPerSec, isVbr }
  // or null if file isn't a usable MP3.
  async function _readMp3Metadata(file) {
    const ext = ((file.name || '').match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (ext !== '.mp3') return null;
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const id3End = _skipID3v2(bytes);
    const firstFrame = _findMp3FrameNear(bytes, id3End, 1024 * 1024);
    if (firstFrame < 0) return null;
    const header = _parseMp3FrameHeader(bytes, firstFrame);
    if (!header) return null;

    let bitrate;
    let durationSec;
    let isVbr = false;
    let bytesPerSec;
    let dataStart = firstFrame;

    // Try Xing/Info header first — gives accurate VBR metrics
    const xing = _parseXingHeader(bytes, firstFrame, header);
    if (xing && xing.frames > 0) {
      const samplesPerFrame = (header.versionId === 3) ? 1152 : 576;
      durationSec = (xing.frames * samplesPerFrame) / header.sampleRate;
      const audioBytes = xing.audioBytes > 0 ? xing.audioBytes : (bytes.length - firstFrame);
      bitrate = (audioBytes * 8) / durationSec;
      bytesPerSec = audioBytes / durationSec;
      isVbr = (xing.kind === 'Xing');  // "Info" tag means CBR with header
      // Skip the Xing frame itself when computing time→byte (it's silent)
      // First "real" audio frame is right after the Xing frame.
      const xingFrameEnd = firstFrame + _mp3FrameLen(bytes, firstFrame, header);
      const nextFrame = _findMp3FrameNear(bytes, xingFrameEnd, 65536);
      if (nextFrame > firstFrame) dataStart = nextFrame;
    } else {
      // No Xing header → estimate from sampled bitrates
      const sampleBitrates = [header.bitrate];
      for (let f = 1; f <= 6; f++) {
        const pos = firstFrame + Math.floor((bytes.length - firstFrame) * f / 7);
        const fr = _findMp3FrameNear(bytes, pos, 65536);
        if (fr >= 0) {
          const h = _parseMp3FrameHeader(bytes, fr);
          if (h && h.bitrate) sampleBitrates.push(h.bitrate);
        }
      }
      bitrate = sampleBitrates.reduce(function(a, b){ return a + b; }, 0) / sampleBitrates.length;
      const audioBytes = bytes.length - firstFrame;
      bytesPerSec = bitrate / 8;
      durationSec = audioBytes / bytesPerSec;
      // Mark as VBR if any sample deviates >5% from the average
      isVbr = sampleBitrates.some(function(b){ return Math.abs(b - bitrate) > bitrate * 0.05; });
    }

    return {
      bytes: bytes,
      bitrate: bitrate,
      sampleRate: header.sampleRate,
      durationSec: durationSec,
      dataStart: dataStart,
      bytesPerSec: bytesPerSec,
      isVbr: isVbr
    };
  }

  // Length in bytes of the MP3 frame at `offset`. Used to skip the Xing
  // sentinel frame so it doesn't show up as silence at second 0.
  function _mp3FrameLen(bytes, offset, header) {
    const samplesPerFrame = (header.versionId === 3) ? 1152 : 576;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    return Math.floor((samplesPerFrame * header.bitrate) / (8 * header.sampleRate)) + padding;
  }

  // Slice an MP3 by time range. Returns ArrayBuffer of valid MP3 bytes.
  function _sliceMp3ByTimeBytes(mp3meta, startSec, endSec) {
    const startByte = mp3meta.dataStart + Math.floor(startSec * mp3meta.bytesPerSec);
    const endByte   = mp3meta.dataStart + Math.floor(endSec   * mp3meta.bytesPerSec);
    const realStart = _findMp3FrameNear(mp3meta.bytes, startByte, 65536);
    const realEnd   = _findMp3FrameNear(mp3meta.bytes, endByte,   65536);
    if (realStart < 0 || realEnd < 0 || realEnd <= realStart) {
      throw new Error('לא הצלחתי למצוא גבולות frame תקינים בטווח המבוקש');
    }
    return mp3meta.bytes.buffer.slice(realStart, realEnd);
  }

  // Transcribe an MP3 by byte-slicing (no decode required). Splits the
  // requested range into ≤90MB pieces at frame boundaries, uploads each to
  // the Worker, and stitches the transcripts back with cumulative offsets.
  async function _transcribeMp3ByteSliced(workerUrl, mp3meta, startSec, endSec, language, onProgress) {
    const startByte = mp3meta.dataStart + Math.floor(startSec * mp3meta.bytesPerSec);
    const endByte   = mp3meta.dataStart + Math.floor(endSec   * mp3meta.bytesPerSec);
    const sliceStart = _findMp3FrameNear(mp3meta.bytes, startByte, 65536);
    const sliceEnd   = _findMp3FrameNear(mp3meta.bytes, endByte,   65536);
    if (sliceStart < 0 || sliceEnd <= sliceStart) {
      throw new Error('לא הצלחתי למצוא גבולות frame תקינים');
    }

    // 3MB binary → 4MB base64 string → ~12MB peak browser RAM during encode.
    // Larger chunks (we tried 20MB = ~80MB peak) trigger memory pressure on
    // low-RAM machines and the browser silently aborts fetch with "Failed to
    // fetch" — even though the Worker can handle 30MB+ once the bytes arrive.
    const CHUNK_BYTES = 3 * 1024 * 1024;
    const sliceLen = sliceEnd - sliceStart;
    const boundaries = [];
    if (sliceLen <= CHUNK_BYTES) {
      boundaries.push([sliceStart, sliceEnd]);
    } else {
      let pos = sliceStart;
      while (pos < sliceEnd) {
        const target = Math.min(sliceEnd, pos + CHUNK_BYTES);
        const realEnd = (target >= sliceEnd) ? sliceEnd : _findMp3FrameNear(mp3meta.bytes, target, 65536);
        if (realEnd <= pos) break;
        boundaries.push([pos, realEnd]);
        pos = realEnd;
      }
    }

    const allText = [];
    const allChunks = [];
    let _firstLang = null;
    for (let i = 0; i < boundaries.length; i++) {
      const cs = boundaries[i][0], ce = boundaries[i][1];
      const chunkBytes = mp3meta.bytes.buffer.slice(cs, ce);
      const chunkStartSec = startSec + (cs - sliceStart) / mp3meta.bytesPerSec;
      const chunkSizeMB = (chunkBytes.byteLength / 1024 / 1024).toFixed(1);
      const partTag = boundaries.length === 1
        ? '(' + chunkSizeMB + ' MB)'
        : 'חלק ' + (i + 1) + '/' + boundaries.length + ' (' + chunkSizeMB + ' MB · התקדמות ~' + Math.round(((i) / boundaries.length) * 100) + '%)';

      // Up to 3 attempts per chunk with backoff — Cloudflare's free tier
      // CPU/rate limits sometimes flake under load, but a brief pause and
      // a retry usually clears it.
      let result = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const tryTag = attempt === 1 ? partTag : partTag + ' · ניסיון ' + attempt + '/3';
        if (onProgress) onProgress(tryTag + ' · שולח לענן…');
        try {
          result = await _transcribeViaWorker(workerUrl, chunkBytes, language, function(msg){
            if (onProgress) onProgress(tryTag + ' · ' + msg);
          });
          break;
        } catch (chunkErr) {
          lastErr = chunkErr;
          if (attempt < 3) {
            if (onProgress) onProgress(partTag + ' · ⚠️ נכשל (' + chunkErr.message + ') — ממתין ' + (attempt * 3) + ' שנ׳ ומנסה שוב…');
            await new Promise(function(r){ setTimeout(r, attempt * 3000); });
          }
        }
      }
      if (!result) {
        var hint = (lastErr && lastErr.message === 'Failed to fetch')
          ? ' (3 ניסיונות נכשלו · Cloudflare Worker מגיע ל-CPU limit · עדכון ל-Worker v4 יפתור סופית)'
          : '';
        throw new Error('כשל בחלק ' + (i + 1) + '/' + boundaries.length + ' אחרי 3 ניסיונות: ' + (lastErr ? lastErr.message : 'unknown') + hint);
      }
      allText.push((result.text || '').trim());
      if (Array.isArray(result.chunks)) {
        for (let j = 0; j < result.chunks.length; j++) {
          const c = result.chunks[j];
          allChunks.push({
            timestamp: [c.timestamp[0] + chunkStartSec, c.timestamp[1] + chunkStartSec],
            text: c.text
          });
        }
      }
      // Capture detected language from the first chunk
      if (i === 0 && result.detectedLanguage) {
        _firstLang = result.detectedLanguage;
      }
      // Brief pacing between chunks to avoid edge rate-limit
      if (i < boundaries.length - 1) {
        await new Promise(function(r){ setTimeout(r, 800); });
      }
    }
    return {
      text: allText.filter(Boolean).join(' '),
      chunks: allChunks,
      detectedLanguage: _firstLang
    };
  }

  window.VT_MP3 = { _skipID3v2:_skipID3v2, _findMp3FrameNear:_findMp3FrameNear, _parseMp3FrameHeader:_parseMp3FrameHeader, _parseXingHeader:_parseXingHeader, _readMp3Metadata:_readMp3Metadata, _mp3FrameLen:_mp3FrameLen, _sliceMp3ByTimeBytes:_sliceMp3ByTimeBytes, _transcribeMp3ByteSliced:_transcribeMp3ByteSliced };
})();