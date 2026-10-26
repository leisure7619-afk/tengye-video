/* render.js — 在瀏覽器裡把字卡、照片、影片、配樂合成影片（Canvas + Web Audio + MediaRecorder） */
(function () {
  const COLORS = { w: '#F5F2EC', r: '#FF4D3D', b: '#3EC5FF', p: '#FF8FC0' };
  const FONT = { hand: '"LXGW WenKai TC"', round: '"Huninn"' };
  const NO_START = '，。、！？；：」』）》〉…,.!?;:)';

  /* ---------- 文字：{r:xx} 標色解析與排版 ---------- */
  function parseRich(text) {
    const runs = [];
    const re = /\{([rbp])[:：]([^}]*)\}/g;
    let last = 0, m;
    const s = String(text || '');
    while ((m = re.exec(s))) {
      if (m.index > last) runs.push({ t: s.slice(last, m.index), c: 'w' });
      runs.push({ t: m[2], c: m[1] });
      last = re.lastIndex;
    }
    if (last < s.length) runs.push({ t: s.slice(last), c: 'w' });
    return runs;
  }
  function stripRich(text) { return String(text || '').replace(/\{[rbp][:：]([^}]*)\}/g, '$1'); }

  // 回傳 lines: [[{ch,c}...], ...]
  function layoutRich(ctx, text, maxW) {
    const chars = [];
    parseRich(text).forEach(r => { for (const ch of r.t.replace(/\\n/g, '\n')) chars.push({ ch, c: r.c }); });
    const lines = []; let cur = [], w = 0;
    for (const o of chars) {
      if (o.ch === '\n') { lines.push(cur); cur = []; w = 0; continue; }
      const cw = ctx.measureText(o.ch).width;
      if (w + cw > maxW && cur.length) {
        if (NO_START.includes(o.ch)) { cur.push(o); lines.push(cur); cur = []; w = 0; continue; }
        lines.push(cur); cur = []; w = 0;
        if (o.ch === ' ') continue;
      }
      cur.push(o); w += cw;
    }
    if (cur.length) lines.push(cur);
    while (lines.length && !lines[lines.length - 1].length) lines.pop();
    return lines;
  }
  function lineWidth(ctx, line) { let w = 0; for (const o of line) w += ctx.measureText(o.ch).width; return w; }

  function drawLines(ctx, lines, cx, y0, lh, alphaFn, glow) {
    lines.forEach((line, i) => {
      const a = alphaFn ? alphaFn(i) : 1;
      if (a <= 0) return;
      const lw = lineWidth(ctx, line);
      let x = cx - lw / 2;
      const y = y0 + i * lh + (1 - a) * lh * 0.18;
      ctx.globalAlpha = a;
      for (const o of line) {
        ctx.fillStyle = COLORS[o.c] || COLORS.w;
        if (glow && o.c !== 'w') { ctx.shadowColor = COLORS[o.c]; ctx.shadowBlur = glow; } else { ctx.shadowBlur = 0; }
        ctx.fillText(o.ch, x, y);
        x += ctx.measureText(o.ch).width;
      }
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  // 找出能放進框內的最大字級
  function fitText(ctx, text, family, weight, maxW, maxH, startSize, lhRatio) {
    let size = startSize;
    for (let k = 0; k < 30; k++) {
      ctx.font = `${weight} ${size}px ${family}, "Noto Sans TC", sans-serif`;
      const lines = layoutRich(ctx, text, maxW);
      if (lines.length * size * lhRatio <= maxH || size < 18) return { size, lines };
      size = Math.floor(size * 0.92);
    }
    ctx.font = `${weight} ${size}px ${family}, "Noto Sans TC", sans-serif`;
    return { size, lines: layoutRich(ctx, text, maxW) };
  }

  /* ---------- 時間軸 ---------- */
  function cardSecs(text) {
    const n = stripRich(text).replace(/\s/g, '').length;
    return Math.min(7, Math.max(3, 2.2 + n * 0.13));
  }

  function buildTimeline(project, media) {
    const pace = Number(project.pace) || 1;
    const segs = []; let t = 0;
    const push = (o, dur) => { o.start = t; o.dur = dur; o.end = t + dur; segs.push(o); t += dur; };
    if (project.opening && project.opening.on && (project.opening.l2 || project.opening.l1)) {
      push({ kind: 'title', act: 0, l1: project.opening.l1, l2: project.opening.l2 }, 4.2 * pace);
    }
    let photoIdx = 0;
    project.acts.forEach((act, ai) => {
      (act.items || []).forEach(it => {
        if (it.type === 'card') {
          if (!stripRich(it.text).trim()) return;
          push({ kind: 'card', act: ai + 1, text: it.text }, cardSecs(it.text) * pace);
        } else {
          const m = media.get(it.mid); if (!m) return;
          if (m.kind === 'image') push({ kind: 'image', act: ai + 1, mid: it.mid, caption: it.caption, kb: photoIdx++ }, 3.4 * pace);
          else if (m.kind === 'video') {
            const from = Math.max(0, Number(it.from) || 0);
            const avail = Math.max(0.5, (m.duration || 5) - from);
            const cap = Number(it.secs) > 0 ? Number(it.secs) : 15;
            push({ kind: 'video', act: ai + 1, mid: it.mid, caption: it.caption, from, vol: 1 }, Math.min(avail, cap));
          }
        }
      });
    });
    (project.cheers || []).forEach(c => {
      const m = media.get(c.mid); if (!m) return;
      if (m.kind === 'video') {
        const from = Math.max(0, Number(c.from) || 0);
        push({ kind: 'video', act: 6, mid: c.mid, caption: c.caption, from, cheer: true, vol: 1 }, Math.min(Math.max(0.5, (m.duration || 2.4) - from), 2.4));
      } else if (m.kind === 'image') push({ kind: 'image', act: 6, mid: c.mid, caption: c.caption, cheer: true, kb: photoIdx++ }, 1.3);
    });
    const ann = project.ann || {};
    if (ann.l1 || ann.l2 || ann.l3) push({ kind: 'ann', act: 6, l1: ann.l1, l2: ann.l2, l3: ann.l3 }, 6.5);
    if (segs.length) push({ kind: 'black', act: 6 }, 1.2);
    // 每幕秒數
    const perAct = [0, 0, 0, 0, 0, 0, 0];
    segs.forEach(s => { perAct[s.act] += s.dur; });
    return { segs, total: t, perAct };
  }

  /* ---------- 媒體前處理（上傳時呼叫） ---------- */
  function loadImage(url) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('圖片讀取失敗')); im.src = url; });
  }
  function toCanvas(src, w, h, maxSide) {
    const s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  async function prepareMedia(file) {
    const url = URL.createObjectURL(file);
    const type = file.type || '';
    const isVideo = type.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
    const isAudio = !isVideo && (type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name));
    if (isAudio) return { kind: 'audio', file, url, name: file.name };
    if (!isVideo) {
      const im = await loadImage(url);
      const img = toCanvas(im, im.naturalWidth, im.naturalHeight, 1920);
      const thumb = toCanvas(im, im.naturalWidth, im.naturalHeight, 160).toDataURL('image/jpeg', 0.7);
      const small = toCanvas(im, im.naturalWidth, im.naturalHeight, 40);
      return { kind: 'image', file, url, img, small, w: img.width, h: img.height, thumb, name: file.name };
    }
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => {
      v.onloadedmetadata = res; v.onerror = () => rej(new Error('影片讀取失敗：' + file.name));
      setTimeout(res, 8000);
    });
    const duration = isFinite(v.duration) ? v.duration : 5;
    let thumb = '';
    try {
      await new Promise(res => { v.onseeked = res; v.currentTime = Math.min(1, duration / 3); setTimeout(res, 3000); });
      if (v.videoWidth) thumb = toCanvas(v, v.videoWidth, v.videoHeight, 160).toDataURL('image/jpeg', 0.7);
    } catch (e) {}
    const w = v.videoWidth || 1280, h = v.videoHeight || 720;
    v.removeAttribute('src'); v.load();
    return { kind: 'video', file, url, duration, w, h, thumb, name: file.name };
  }

  /* ---------- 繪製 ---------- */
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }

  function drawFill(ctx, src, sw, sh, W, H, scale, dx, dy, mode) {
    const r = mode === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    const w = sw * r * scale, h = sh * r * scale;
    ctx.drawImage(src, (W - w) / 2 + dx, (H - h) / 2 + dy, w, h);
  }

  function drawVisual(ctx, src, sw, sh, small, W, H, kbScale, dx, dy) {
    const ar = sw / sh, car = W / H;
    if (Math.abs(ar - car) / car < 0.22) {
      drawFill(ctx, src, sw, sh, W, H, kbScale, dx, dy, 'cover');
    } else {
      ctx.imageSmoothingEnabled = true;
      drawFill(ctx, small || src, small ? small.width : sw, small ? small.height : sh, W, H, 1.15, 0, 0, 'cover');
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
      drawFill(ctx, src, sw, sh, W, H, Math.min(kbScale, 1.04), dx * 0.3, dy * 0.3, 'contain');
    }
  }

  function drawCaption(ctx, text, W, H, fam) {
    if (!text || !stripRich(text).trim()) return;
    const g = ctx.createLinearGradient(0, H * 0.68, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.68, W, H * 0.32);
    const base = Math.min(W, H) * 0.058;
    const { size, lines } = fitText(ctx, text, fam, 700, W * 0.86, H * 0.2, base, 1.35);
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    const lh = size * 1.35;
    const y0 = H - H * 0.07 - (lines.length - 1) * lh;
    drawLines(ctx, lines, W / 2, y0, lh, null, 0);
  }

  class Renderer {
    constructor(canvas, project, media) {
      this.canvas = canvas; this.project = project; this.media = media;
      const q = project.quality === '1080' ? 1080 : 720;
      const land = project.orient !== 'portrait';
      this.W = land ? Math.round(q * 16 / 9) : q; this.H = land ? q : Math.round(q * 16 / 9);
      canvas.width = this.W; canvas.height = this.H;
      this.ctx = canvas.getContext('2d');
      this.fam = FONT[project.font] || FONT.hand;
      this.tl = buildTimeline(project, media);
      this.vids = new Map();
      this.cancelled = false;
      this.onProgress = () => {};
    }

    async loadFonts() {
      if (!document.fonts || !document.fonts.load) return;
      let all = '';
      this.tl.segs.forEach(s => { all += stripRich([s.text, s.caption, s.l1, s.l2, s.l3].filter(Boolean).join('')); });
      all = Array.from(new Set(all + '0123456789.')).join('');
      const fams = [this.fam, '"Noto Sans TC"'];
      try {
        await Promise.race([
          Promise.all(fams.flatMap(f => [document.fonts.load(`400 40px ${f}`, all), document.fonts.load(`700 40px ${f}`, all)])),
          new Promise(r => setTimeout(r, 6000))
        ]);
      } catch (e) {}
    }

    async setupAudio(withMonitor) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = this.ac = new AC();
      if (ac.state === 'suspended') await ac.resume();
      this.dest = ac.createMediaStreamDestination();
      this.master = ac.createGain();
      this.master.connect(this.dest);
      if (withMonitor) this.master.connect(ac.destination);
      this.musicBus = ac.createGain(); this.duck = ac.createGain();
      this.musicBus.connect(this.duck); this.duck.connect(this.master);
      this.videoBus = ac.createGain(); this.videoBus.connect(this.master);
      // 配樂
      this.tracks = [];
      for (const mid of (this.project.music || [])) {
        if (!mid) continue;
        const m = this.media.get(mid); if (!m) continue;
        try {
          const buf = await m.file.arrayBuffer();
          const ab = await new Promise((res, rej) => { const p = ac.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
          this.tracks.push(ab);
        } catch (e) { console.warn('配樂解碼失敗', e); }
      }
    }

    musicPlan() {
      // 依配樂數決定每段負責的幕
      const n = this.tracks.length; if (!n) return [];
      const groups = n === 1 ? [[0, 6]] : n === 2 ? [[0, 3], [4, 6]] : [[0, 2], [3, 5], [6, 6]];
      const total = this.tl.total;
      return groups.map((g, i) => {
        const segs = this.tl.segs.filter(s => s.act >= g[0] && s.act <= g[1]);
        let st = segs.length ? segs[0].start : 0, en = segs.length ? segs[segs.length - 1].end : 0;
        if (i === 0) st = 0; if (i === groups.length - 1) en = total;
        return { buf: this.tracks[i], st, en };
      }).filter(p => p.en > p.st);
    }

    scheduleAudio(T0) {
      const ac = this.ac, total = this.tl.total, XF = 1.5;
      this.sources = [];
      this.musicPlan().forEach((p, i, arr) => {
        const src = ac.createBufferSource(); src.buffer = p.buf; src.loop = true;
        const g = ac.createGain(); src.connect(g); g.connect(this.musicBus);
        const a = T0 + p.st, b = T0 + p.en + (i < arr.length - 1 ? XF : 0);
        g.gain.setValueAtTime(0, a);
        g.gain.linearRampToValueAtTime(0.9, a + (i === 0 ? 1.2 : XF));
        g.gain.setValueAtTime(0.9, Math.max(a + XF, b - (i < arr.length - 1 ? XF : 2.5)));
        g.gain.linearRampToValueAtTime(0, b);
        src.start(a); src.stop(b + 0.1);
        this.sources.push(src);
      });
      // 訪談時音樂變小聲
      const duckTo = this.project.duck != null ? this.project.duck : 0.22;
      this.duck.gain.setValueAtTime(1, T0);
      this.tl.segs.filter(s => s.kind === 'video').forEach(s => {
        const lvl = s.cheer ? Math.max(duckTo, 0.45) : duckTo;
        this.duck.gain.setTargetAtTime(lvl, T0 + s.start - 0.1, 0.12);
        this.duck.gain.setTargetAtTime(1, T0 + s.end - 0.05, 0.35);
      });
      this.master.gain.setValueAtTime(1, T0 + total - 1.5);
      this.master.gain.linearRampToValueAtTime(0, T0 + total);
    }

    // 影片元素：快到時才建立，避免手機記憶體爆掉
    ensureVideo(i, s) {
      if (this.vids.has(i)) return this.vids.get(i);
      const m = this.media.get(s.mid);
      const v = document.createElement('video');
      v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.crossOrigin = 'anonymous';
      v.src = m.url;
      const rec = { v, started: false, ready: false, node: null };
      try {
        rec.node = this.ac.createMediaElementSource(v);
        rec.gain = this.ac.createGain(); rec.gain.gain.value = s.vol;
        rec.node.connect(rec.gain); rec.gain.connect(this.videoBus);
      } catch (e) { v.muted = true; }
      const seek = () => { try { v.currentTime = s.from || 0; } catch (e) {} };
      v.addEventListener('loadedmetadata', seek, { once: true });
      v.addEventListener('seeked', () => { rec.ready = true; }, { once: true });
      v.load();
      this.vids.set(i, rec);
      return rec;
    }
    releaseVideo(i) {
      const r = this.vids.get(i); if (!r || r.dead) return;
      try { r.v.pause(); } catch (e) {}
      try { r.node && r.node.disconnect(); r.gain && r.gain.disconnect(); } catch (e) {}
      r.v.removeAttribute('src'); try { r.v.load(); } catch (e) {}
      this.vids.set(i, { dead: true });
    }

    drawSeg(s, i, lt) {
      const { ctx, W, H } = this;
      const fadeIn = s.cheer ? 0.05 : s.kind === 'ann' ? 0.8 : 0.45;
      const fadeOut = s.cheer ? 0.05 : 0.35;
      const alpha = Math.min(1, ease(lt / fadeIn), ease((s.dur - lt) / fadeOut));
      ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (s.kind === 'black') return;
      const p = Math.min(1, Math.max(0, lt / s.dur));
      const minS = Math.min(W, H);
      ctx.textBaseline = 'middle';

      if (s.kind === 'image') {
        const m = this.media.get(s.mid); if (!m) return;
        ctx.globalAlpha = alpha;
        const dir = s.kb % 4;
        const sc = 1.03 + 0.07 * (dir < 2 ? p : 1 - p);
        const dx = (dir % 2 ? -1 : 1) * (p - 0.5) * W * 0.035;
        drawVisual(ctx, m.img, m.w, m.h, m.small, W, H, sc, dx, 0);
        drawCaption(ctx, s.caption, W, H, this.fam);
      } else if (s.kind === 'video') {
        const r = this.vids.get(i);
        ctx.globalAlpha = alpha;
        if (r && r.v && r.v.readyState >= 2 && r.v.videoWidth) {
          if (!this.vsmall) { this.vsmall = document.createElement('canvas'); this.vsmall.width = 48; this.vsmall.height = 48; }
          const vs = this.vsmall; vs.width = 48; vs.height = Math.max(1, Math.round(48 * r.v.videoHeight / r.v.videoWidth));
          vs.getContext('2d').drawImage(r.v, 0, 0, vs.width, vs.height);
          drawVisual(ctx, r.v, r.v.videoWidth, r.v.videoHeight, vs, W, H, 1, 0, 0);
          r.lastOk = true;
        }
        drawCaption(ctx, s.caption, W, H, this.fam);
      } else if (s.kind === 'card') {
        const { size, lines } = fitText(ctx, s.text, this.fam, 700, W * 0.8, H * 0.7, minS * 0.088, 1.5);
        const lh = size * 1.5;
        const y0 = H / 2 - (lines.length - 1) * lh / 2 - p * minS * 0.012;
        const stag = Math.min(0.45, (s.dur * 0.4) / Math.max(1, lines.length));
        drawLines(ctx, lines, W / 2, y0, lh, k => Math.min(alpha, ease((lt - 0.2 - k * stag) / 0.5)), minS * 0.02);
      } else if (s.kind === 'title') {
        ctx.globalAlpha = alpha;
        const t1 = s.l1 || '', t2 = s.l2 || '';
        ctx.font = `400 ${Math.round(minS * 0.045)}px ${this.fam}, "Noto Sans TC", sans-serif`;
        const l1 = layoutRich(ctx, t1, W * 0.8);
        const big = fitText(ctx, t2, this.fam, 700, W * 0.84, H * 0.4, minS * 0.11, 1.3);
        const gap = minS * 0.05;
        const h1 = l1.length ? minS * 0.045 * 1.4 : 0;
        const totalH = h1 + (l1.length ? gap : 0) + big.lines.length * big.size * 1.3;
        let y = H / 2 - totalH / 2;
        if (l1.length) {
          ctx.font = `400 ${Math.round(minS * 0.045)}px ${this.fam}, "Noto Sans TC", sans-serif`;
          ctx.fillStyle = 'rgba(245,242,236,.75)';
          drawLines(ctx, l1, W / 2, y + h1 / 2, h1, () => alpha * 0.8, 0);
          y += h1 + gap;
          ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = COLORS.r;
          const lw = W * 0.08 * ease(lt / 1.2);
          ctx.fillRect(W / 2 - lw / 2, y - gap / 2 - 1, lw, 2);
        }
        ctx.font = `700 ${big.size}px ${this.fam}, "Noto Sans TC", sans-serif`;
        drawLines(ctx, big.lines, W / 2, y + big.size * 0.65, big.size * 1.3, k => Math.min(alpha, ease((lt - 0.3 - k * 0.3) / 0.6)), minS * 0.02);
      } else if (s.kind === 'ann') {
        const sizes = [minS * 0.05, minS * 0.115, minS * 0.048];
        const texts = [s.l1, s.l2, s.l3].map(x => x || '');
        const blocks = texts.map((t, k) => {
          if (!t) return null;
          const f = fitText(ctx, k === 1 && !/\{[rbp]/.test(t) ? `{r:${t}}` : t, this.fam, k === 1 ? 700 : 400, W * 0.86, H * 0.3, sizes[k], 1.3);
          return { ...f, k, w: k === 1 ? 700 : 400 };
        }).filter(Boolean);
        const gap = minS * 0.045;
        const totalH = blocks.reduce((a, b) => a + b.lines.length * b.size * 1.3, 0) + gap * (blocks.length - 1);
        let y = H / 2 - totalH / 2;
        blocks.forEach((b, idx) => {
          ctx.font = `${b.w} ${b.size}px ${this.fam}, "Noto Sans TC", sans-serif`;
          const lh = b.size * 1.3;
          const delay = 0.3 + idx * 0.9;
          const a = Math.min(alpha, ease((lt - delay) / 0.7));
          const pulse = b.k === 1 ? minS * (0.025 + 0.012 * Math.sin(lt * 2.4)) : 0;
          drawLines(ctx, b.lines, W / 2, y + lh / 2, lh, () => a, pulse);
          if (b.k === 0) {
            ctx.globalAlpha = a * 0.9; ctx.fillStyle = COLORS.r;
            const lw = W * 0.12 * ease((lt - delay) / 1.2);
            ctx.fillRect(W / 2 - lw / 2, y + b.lines.length * lh + gap / 2 - 1, lw, 2);
          }
          y += b.lines.length * lh + gap;
        });
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 1;
    }

    frame(now) {
      const segs = this.tl.segs;
      // 預載與播放控制
      segs.forEach((s, i) => {
        if (s.kind !== 'video') return;
        const r0 = this.vids.get(i);
        if (r0 && r0.dead) return;
        if (now > s.end + 0.3) { if (r0) this.releaseVideo(i); return; }
        if (s.start - now < 3) {
          const r = this.ensureVideo(i, s);
          if (!r.started && now >= s.start - 0.04) {
            r.started = true;
            const pr = r.v.play(); if (pr && pr.catch) pr.catch(() => {});
          }
        }
      });
      let idx = segs.findIndex(s => now >= s.start && now < s.end);
      if (idx < 0) idx = segs.length - 1;
      const s = segs[idx];
      if (s) this.drawSeg(s, idx, now - s.start);
    }

    pickMime() {
      if (!window.MediaRecorder) return null;
      const list = [
        'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
        'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
      ];
      return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
    }

    // record=true 輸出檔案；false 只預覽
    async run(record) {
      if (!this.tl.segs.length) throw new Error('還沒有任何字卡或素材');
      this.onProgress(0, '載入字體…');
      await this.loadFonts();
      this.onProgress(0, '準備聲音…');
      await this.setupAudio(true);
      let recorder = null, chunks = [], mime = '';
      if (record) {
        mime = this.pickMime();
        if (mime === null) throw new Error('這個瀏覽器不支援錄製影片，請改用最新版 Chrome 或 Safari');
        const vstream = this.canvas.captureStream(30);
        const stream = new MediaStream([...vstream.getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
        const opts = { videoBitsPerSecond: this.H >= 1080 ? 8e6 : 5e6, audioBitsPerSecond: 160000 };
        if (mime) opts.mimeType = mime;
        recorder = new MediaRecorder(stream, opts);
        mime = recorder.mimeType || mime || 'video/webm';
        recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      }
      let wake = null;
      try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) {}
      // 先預載第一段影片
      this.frame(-0.5);
      await new Promise(r => setTimeout(r, 400));
      const T0 = this.ac.currentTime + 0.25;
      this.scheduleAudio(T0);
      if (recorder) recorder.start(1000);
      const total = this.tl.total;
      await new Promise(resolve => {
        const loop = () => {
          if (this.cancelled) return resolve();
          const now = this.ac.currentTime - T0;
          this.frame(Math.max(0, now));
          this.onProgress(Math.min(1, now / total), `${fmt(Math.max(0, now))} / ${fmt(total)}`);
          if (now >= total) return resolve();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      let blob = null;
      if (recorder) {
        await new Promise(r => { recorder.onstop = r; try { recorder.stop(); } catch (e) { r(); } });
        if (!this.cancelled) blob = new Blob(chunks, { type: mime.split(';')[0] });
      }
      this.cleanup();
      try { wake && wake.release(); } catch (e) {}
      return blob;
    }

    cancel() { this.cancelled = true; }
    cleanup() {
      (this.sources || []).forEach(s => { try { s.stop(); } catch (e) {} });
      Array.from(this.vids.keys()).forEach(i => this.releaseVideo(i));
      try { this.ac && this.ac.close(); } catch (e) {}
    }
  }

  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  window.Render = { Renderer, buildTimeline, prepareMedia, parseRich, stripRich, fmt, cardSecs };
})();
