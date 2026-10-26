/* review.js — 從影片擷取影格＋聲音，組成 Gemini 評審請求 */
(function () {
  const MAX_FRAMES = 60, FRAME_W = 512, AUDIO_RATE = 12000, MAX_AUDIO_SEC = 360;

  function mmss(t) { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

  async function extractFrames(file, onProgress, opt) {
    opt = opt || {};
    const MAXF = opt.max || MAX_FRAMES, MINF = opt.min || 8, EVERY = opt.every || 3, FW = opt.width || FRAME_W, Q = opt.quality || 0.62;
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('影片無法讀取，請換成 MP4 / MOV 檔')); });
    // iOS 需要先播一下才能抓畫面
    try { await v.play(); v.pause(); } catch (e) {}
    const dur = isFinite(v.duration) ? v.duration : 0;
    if (!dur) throw new Error('讀不到影片長度');
    const n = Math.min(MAXF, Math.max(MINF, Math.ceil(dur / EVERY)));
    const step = dur / n;
    const c = document.createElement('canvas');
    const vw = v.videoWidth || 1280, vh = v.videoHeight || 720;
    c.width = FW; c.height = Math.round(FW * vh / vw);
    const ctx = c.getContext('2d');
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, (i + 0.5) * step);
      await new Promise(res => { const to = setTimeout(res, 4000); v.onseeked = () => { clearTimeout(to); res(); }; v.currentTime = t; });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      frames.push({ t, data: c.toDataURL('image/jpeg', Q).split(',')[1] });
      onProgress && onProgress(`擷取畫面 ${i + 1}/${n}`, i + 1, n);
    }
    v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url);
    return { frames, duration: dur };
  }

  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), dv = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, samples.length * 2, true);
    let o = 44;
    for (let i = 0; i < samples.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, samples[i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return buf;
  }
  function b64(buf) {
    const bytes = new Uint8Array(buf); let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }

  async function extractAudio(file, onProgress, opt) {
    opt = opt || {};
    const MAXS = opt.maxSec || MAX_AUDIO_SEC;
    if (file.size > 350 * 1024 * 1024) return { skipped: '影片檔太大，略過聲音分析' };
    onProgress && onProgress('擷取聲音…');
    try {
      const raw = await file.arrayBuffer();
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oac = new OAC(1, AUDIO_RATE, AUDIO_RATE);
      const ab = await new Promise((res, rej) => { const p = oac.decodeAudioData(raw, res, rej); if (p && p.then) p.then(res, rej); });
      // 混成單聲道並重新取樣到 12kHz
      const len = Math.min(ab.duration, MAXS);
      const off = new OAC(1, Math.ceil(len * AUDIO_RATE), AUDIO_RATE);
      const src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start(0);
      const out = await new Promise((res, rej) => { off.oncomplete = e => res(e.renderedBuffer); const p = off.startRendering(); if (p && p.then) p.then(res, rej); });
      const wav = encodeWav(out.getChannelData(0), AUDIO_RATE);
      return { data: b64(wav), seconds: len, truncated: ab.duration > MAXS };
    } catch (e) {
      console.warn(e);
      return { skipped: '這支影片的聲音無法在手機上讀取，評審只看畫面' };
    }
  }

  async function buildVideoParts(file, note, onProgress) {
    const { frames, duration } = await extractFrames(file, onProgress);
    const audio = await extractAudio(file, onProgress);
    const parts = [];
    let intro = `以下是組員影片初稿（長度 ${mmss(duration)}），共 ${frames.length} 張依時間排列的影格。`;
    if (audio.data) intro += `最後附上影片原聲${audio.truncated ? '（只含前 6 分鐘）' : ''}。`;
    else intro += `（${audio.skipped}，配樂與訪談內容無法判斷的項目請註明。）`;
    if (note && note.trim()) intro += `\n組員補充說明：${note.trim()}`;
    intro += '\n請依 5 大評審原則審查並輸出 JSON。';
    parts.push({ text: intro });
    frames.forEach(f => { parts.push({ text: `[${mmss(f.t)}]` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: f.data } }); });
    if (audio.data) parts.push({ inlineData: { mimeType: 'audio/wav', data: audio.data } });
    return { parts, duration, audioNote: audio.skipped || '' };
  }

  window.Review = { buildVideoParts, extractFrames, extractAudio, mmss };
})();
