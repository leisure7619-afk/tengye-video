/* app.js — 介面與流程 */
(function () {
  const { ACTS, QUESTIONS, EXAMPLE, DIMS } = window.AI;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const KEY = 'tengye.v1';
  const media = new Map();
  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- 狀態 ---------- */
  function blank() {
    return {
      form: { name: '', goalTitle: '', goalDate: '', q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '', q8: '' },
      script: null,
      video: {
        orient: 'landscape', font: 'hand', pace: '1', quality: '720',
        opening: { on: true, l1: '', l2: '' },
        acts: ACTS.map(() => ({ items: [] })),
        cheers: [], ann: { l1: '', l2: '', l3: '' }, music: [null, null, null]
      },
      auto: null
    };
  }
  let S = blank();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      S = Object.assign(blank(), saved);
      S.form = Object.assign(blank().form, saved.form || {});
      S.video = Object.assign(blank().video, saved.video || {});
      S.video.acts = ACTS.map((_, i) => ({ items: (saved.video && saved.video.acts && saved.video.acts[i] && saved.video.acts[i].items) || [] }));
      S.video.cheers = S.video.cheers || []; S.video.music = S.video.music || [null, null, null];
    }
  } catch (e) {}
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    }, 300);
  }

  /* ---------- 小工具 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function richHTML(t) {
    return esc(String(t || '').replace(/\\n/g, '\n')).replace(/\{([rbp])[:：]([^}]*)\}/g, (_, c, x) => `<span class="hl-${c}">${x}</span>`);
  }
  let toastT = 0;
  function toast(msg, ms) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms || 2400);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('已複製'); return; } catch (e) {}
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('已複製'); } catch (e) { toast('複製失敗，請手動選取'); }
    ta.remove();
  }
  function fmtDate(d) { if (!d) return ''; const m = d.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : d; }
  function hasAI() { return !!AI.workerUrl(); }

  /* ---------- 分頁 ---------- */
  function showTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (name === 'video') refreshDur();
    try { localStorage.setItem('tengye.tab', name); } catch (e) {}
  }
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  /* ---------- AI 設定 ---------- */
  function refreshAI() {
    const on = hasAI();
    $('#aiPill').textContent = on ? '● AI 已連線' : 'AI 未設定';
    $('#aiPill').classList.toggle('on', on);
    $('#aiState').textContent = on ? '目前使用：' + AI.workerUrl() : '尚未設定。沒有 AI 也能用：寫故事會改成「複製 Prompt」模式。';
    $('#rvNoAi').classList.toggle('hidden', on);
    $('#btnReview').classList.toggle('hidden', !on && rvMode === 'video');
  }
  $('#aiPill').addEventListener('click', () => { $('#aiUrl').value = AI.workerUrl(); $('#aiSheet').classList.add('show'); });
  $('#aiClose').addEventListener('click', () => $('#aiSheet').classList.remove('show'));
  $('#aiSheet').addEventListener('click', e => { if (e.target.id === 'aiSheet') $('#aiSheet').classList.remove('show'); });
  $('#aiSave').addEventListener('click', () => {
    const v = $('#aiUrl').value.trim();
    try { v ? localStorage.setItem('tengye.worker', v) : localStorage.removeItem('tengye.worker'); } catch (e) {}
    refreshAI(); $('#aiSheet').classList.remove('show'); toast(v ? '已儲存' : '已清除');
  });
  $('#aiTest').addEventListener('click', async () => {
    const v = $('#aiUrl').value.trim(); if (!v) return toast('請先填網址');
    try { toast((await AI.pingWorker(v)) ? '連線成功 ✅' : '連得到，但回應異常'); } catch (e) { toast('連線失敗：' + e.message); }
  });

  /* ---------- ① 寫故事 ---------- */
  $('#qList').innerHTML = QUESTIONS.map((q, i) => `
    <div class="field">
      <label><span class="q">${i + 1}</span>${esc(q.t)}</label>
      <span class="help">${esc(q.h)}</span>
      <textarea data-f="${q.k}"></textarea>
    </div>`).join('');
  function fillForm() { $$('[data-f]').forEach(el => { el.value = S.form[el.dataset.f] || ''; }); }
  $$('[data-f]').forEach(el => el.addEventListener('input', () => { S.form[el.dataset.f] = el.value; save(); }));
  fillForm();
  $('#btnExample').addEventListener('click', () => {
    if (Object.keys(S.form).some(k => S.form[k]) && !confirm('會覆蓋目前填寫的內容，確定載入範例？')) return;
    S.form = Object.assign({}, EXAMPLE); fillForm(); save(); toast('已載入範例');
  });
  $('#btnClear').addEventListener('click', () => {
    if (!confirm('確定清空所有故事內容？')) return;
    S.form = blank().form; fillForm(); save();
  });

  function filledCount() { return QUESTIONS.filter(q => (S.form[q.k] || '').trim().length >= 4).length; }

  $('#btnGenScript').addEventListener('click', async () => {
    if (filledCount() < 3) return toast('至少回答 3 題，AI 才寫得出好故事');
    if (!hasAI()) {
      $('#noAiBox').classList.remove('hidden');
      $('#noAiBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const btn = $('#btnGenScript');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> AI 寫分鏡中（約 20～40 秒）';
    $('#scriptStatus').textContent = '';
    try {
      const { json } = await AI.callGemini({ system: AI.SCRIPT_SYSTEM, parts: [{ text: AI.scriptPrompt(S.form) }], temperature: 0.85 });
      setScript(json);
    } catch (e) {
      $('#scriptStatus').textContent = '⚠️ ' + e.message;
    } finally {
      btn.disabled = false; btn.textContent = '✨ 重新產生拍攝清單與分鏡';
    }
  });
  $('#btnCopyScriptPrompt').addEventListener('click', () => copyText(AI.fullScriptPrompt(S.form)));
  $('#btnParseScript').addEventListener('click', () => {
    try { setScript(AI.extractJSON($('#pasteScript').value)); $('#pasteScript').value = ''; }
    catch (e) { toast('讀不到分鏡內容，請確認有貼完整（含 { }）', 3500); }
  });

  function normScript(j) {
    const acts = ACTS.map((a, i) => {
      const src = (j.acts || []).find(x => Number(x.act) === a.n) || (j.acts || [])[i] || {};
      return {
        act: a.n, name: src.name || a.name,
        cards: (src.cards || []).map(c => String(c).replace(/\\n/g, '\n').trim()).filter(Boolean),
        materials: (src.materials || []).map(String),
        interviews: (src.interviews || []).map(x => typeof x === 'string' ? { who: '', question: x } : x),
        tip: src.tip || ''
      };
    });
    return Object.assign({}, j, { acts });
  }
  function setScript(j) {
    S.script = normScript(j); save(); renderScript();
    $('#scriptStatus').textContent = '';
    $('#noAiBox').classList.add('hidden');
    setTimeout(() => $('#scriptOut').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function renderScript() {
    const sc = S.script, out = $('#scriptOut');
    if (!sc) { out.innerHTML = ''; return; }
    const cardCls = S.video.font === 'round' ? 'mini-card round' : 'mini-card';
    out.innerHTML = `
      <div class="panel">
        <h2>🎬 ${esc(sc.title || '你的分鏡腳本')}</h2>
        <p class="sub">點開每一幕看字卡與要準備的素材。字卡到「做影片」還可以再改。</p>
        ${sc.acts.map((a, i) => `
          <div class="act${i === 0 ? ' open' : ''}">
            <div class="act-h"><div class="num">${a.act}</div><div class="t"><b>${esc(a.name)}</b><span>建議佔 ${ACTS[i].pct}%・${a.cards.length} 張字卡</span></div><div class="chev">›</div></div>
            <div class="act-b">
              <div class="label-s">字卡</div>
              ${a.cards.map(c => `<div class="${cardCls}">${richHTML(c)}</div>`).join('') || '<p class="muted">（無）</p>'}
              ${a.materials.length ? `<div class="label-s">要準備的素材</div><ul class="list">${a.materials.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
              ${a.interviews.length ? `<div class="label-s">訪談題目</div><ul class="list">${a.interviews.map(x => `<li><b>${esc(x.who || '')}</b>${x.who ? '：' : ''}${esc(x.question || '')}${x.aim ? `<br><span class="muted">想拍到：${esc(x.aim)}</span>` : ''}</li>`).join('')}</ul>` : ''}
              ${a.tip ? `<div class="notice green" style="margin:6px 0 0">💡 ${esc(a.tip)}</div>` : ''}
            </div>
          </div>`).join('')}
        ${(sc.music || []).length ? `<div class="label-s">配樂建議</div><ul class="list">${sc.music.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${(sc.cheers || []).length ? `<div class="label-s">加油快剪名單</div><div>${sc.cheers.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div>` : ''}
        ${(sc.checklist || []).length ? `<div class="label-s">拍攝前提醒</div><ul class="list">${sc.checklist.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        <div class="btns" style="margin-top:12px">
          <button class="btn" id="btnCopyScript" type="button">📋 複製腳本文字</button>
          <button class="btn primary" id="btnApply" type="button">套用到影片 →</button>
        </div>
      </div>`;
    $$('#scriptOut .act-h').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    $('#btnApply').addEventListener('click', applyScript);
    $('#btnCopyScript').addEventListener('click', () => copyText(scriptAsText()));
  }
  function scriptAsText() {
    const sc = S.script; const strip = Render.stripRich;
    let t = `【${sc.title || '分鏡腳本'}】\n`;
    sc.acts.forEach(a => {
      t += `\n第${a.act}幕　${a.name}\n`;
      a.cards.forEach(c => { t += `・字卡：${strip(c).replace(/\\n|\n/g, ' / ')}\n`; });
      a.materials.forEach(m => { t += `・素材：${m}\n`; });
      a.interviews.forEach(x => { t += `・訪談 ${x.who || ''}：${x.question || ''}\n`; });
    });
    if (sc.announcement) t += `\n宣告：${[sc.announcement.line1, sc.announcement.line2, sc.announcement.line3].filter(Boolean).join(' ')}\n`;
    return t;
  }

  function applyScript() {
    const sc = S.script; if (!sc) return;
    sc.acts.forEach((a, i) => {
      const old = S.video.acts[i].items;
      const mediaItems = old.filter(it => it.type !== 'card');
      const cards = a.cards.map(c => ({ id: uid(), type: 'card', text: c }));
      const out = []; const per = cards.length ? Math.ceil(mediaItems.length / cards.length) : 0;
      let mi = 0;
      cards.forEach(c => { out.push(c); for (let k = 0; k < per && mi < mediaItems.length; k++) out.push(mediaItems[mi++]); });
      while (mi < mediaItems.length) out.push(mediaItems[mi++]);
      S.video.acts[i].items = out;
    });
    S.video.opening.l1 = sc.subtitle || '騰燁通訊處';
    S.video.opening.l2 = sc.title || (S.form.name ? `${S.form.name}的保險路` : '');
    const an = sc.announcement || {};
    S.video.ann = {
      l1: fmtDate(S.form.goalDate) || an.line1 || '',
      l2: S.form.goalTitle ? `晉升 ${S.form.goalTitle}` : (an.line2 || ''),
      l3: an.line3 || '請大家一起見證'
    };
    save(); renderVideo(); showTab('video'); toast('字卡已放進各幕');
  }

  /* ---------- ② 做影片 ---------- */
  function bindSeg(el, get, set) {
    const btns = Array.from(el.querySelectorAll('button'));
    const paint = () => btns.forEach(b => b.classList.toggle('on', b.dataset.v === String(get())));
    btns.forEach(b => b.addEventListener('click', () => { set(b.dataset.v); paint(); }));
    paint();
  }
  $$('[data-set]').forEach(el => bindSeg(el, () => S.video[el.dataset.set], v => {
    S.video[el.dataset.set] = v; save(); refreshDur();
    if (el.dataset.set === 'font' && S.script) renderScript();
  }));

  const MUSIC = [
    { t: '① 開場・溫馨', d: '第 1～2 幕' },
    { t: '② 轉折・推進', d: '第 3～5 幕' },
    { t: '③ 高潮・感動', d: '第 6 幕＋加油＋宣告' }
  ];
  function renderMusic() {
    $('#musicSlots').innerHTML = MUSIC.map((m, i) => {
      const mm = S.video.music[i] && media.get(S.video.music[i]);
      return `<div class="music-slot">
        <div class="ms-t"><b>${m.t}</b><span>${mm ? '🎵 ' + esc(mm.name) : m.d + '・尚未選擇'}</span></div>
        ${mm ? `<button class="btn small ghost" data-mdel="${i}" type="button">移除</button>` : ''}
        <button class="btn small" data-madd="${i}" type="button">${mm ? '更換' : '選音樂'}</button>
        <input type="file" class="file-hidden" accept="audio/*,.mp3,.m4a,.aac,.wav" data-mfile="${i}">
      </div>`;
    }).join('') + '<p class="muted" style="margin:8px 0 0">請使用有授權的音樂（例如 YouTube 音效庫免版稅音樂）。</p>';
    $$('[data-madd]').forEach(b => b.addEventListener('click', () => $(`[data-mfile="${b.dataset.madd}"]`).click()));
    $$('[data-mdel]').forEach(b => b.addEventListener('click', () => { const id = S.video.music[+b.dataset.mdel]; S.video.music[+b.dataset.mdel] = null; if (id && !S.video.music.includes(id)) removeMedia(id); save(); renderMusic(); }));
    $$('[data-mfile]').forEach(inp => inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      try { const m = await registerFile(f); S.video.music[+inp.dataset.mfile] = m.id; save(); renderMusic(); }
      catch (e) { toast('音樂讀取失敗', 3000); }
    }));
  }

  function project() {
    const v = S.video;
    return {
      orient: v.orient, font: v.font, pace: v.pace, quality: v.quality,
      opening: v.opening, acts: v.acts, cheers: v.cheers, ann: v.ann, music: v.music
    };
  }

  function refreshDur() {
    const tl = Render.buildTimeline(project(), media);
    $('#durTotal').textContent = `目前長度 ${Render.fmt(tl.total)}${tl.total < 90 ? '・建議 3～5 分鐘' : tl.total > 360 ? '・有點長，建議 5 分鐘內' : ''}`;
    const cols = ['#C9B8A6', '#2D2A27', '#E2533B', '#2B9FD9', '#E7609E', '#2E9E6A', '#C9831B'];
    const parts = tl.perAct.map((s, i) => ({ s, i })).filter(x => x.s > 0);
    $('#durBar').innerHTML = tl.total ? parts.map(x => `<i style="width:${(x.s / tl.total * 100).toFixed(2)}%;background:${cols[x.i]}"></i>`).join('') : '';
    const body = tl.total - tl.perAct[0];
    $('#durLegend').innerHTML = ACTS.map((a, i) => {
      const sec = tl.perAct[i + 1]; const pct = body ? Math.round(sec / body * 100) : 0;
      const off = body > 20 && Math.abs(pct - a.pct) > 8;
      return `<span class="${off ? 'off' : ''}"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cols[i + 1]};margin-right:4px"></i>${a.n}幕 <b>${pct}%</b>／${a.pct}%</span>`;
    }).join('');
    $$('[data-actdur]').forEach(el => { el.textContent = Render.fmt(tl.perAct[+el.dataset.actdur + 1]); });
  }

  function itemHTML(it, list, idx) {
    const tools = `<div class="tools">
      <button data-up type="button" aria-label="上移">↑</button>
      <button data-down type="button" aria-label="下移">↓</button>
      <button data-del type="button" aria-label="刪除">✕</button></div>`;
    if (it.type === 'card') {
      return `<div class="item" data-i="${idx}">
        <div class="thumb card">字卡</div>
        <div class="body">
          <textarea data-text>${esc(it.text)}</textarea>
          <div class="mini-card${S.video.font === 'round' ? ' round' : ''}" data-prev style="font-size:14px;padding:8px;margin:0">${richHTML(it.text) || '<span style="opacity:.4">字卡預覽</span>'}</div>
          <div class="colorbtns"><button class="r" data-c="r" type="button">標紅</button><button class="b" data-c="b" type="button">標藍</button><button class="p" data-c="p" type="button">標粉</button><button data-c="x" type="button">清除</button></div>
        </div>${tools}</div>`;
    }
    const m = media.get(it.mid);
    if (!m) return '';
    const isV = m.kind === 'video';
    return `<div class="item" data-i="${idx}">
      <div class="thumb" style="background-image:url('${m.thumb || ''}')">${isV ? `<span class="badge">▶ ${Render.fmt(m.duration)}</span>` : ''}</div>
      <div class="body">
        <input type="text" data-cap value="${esc(it.caption || '')}" placeholder="${list === 'cheers' ? '名字（可不填，例：媽媽）' : '畫面字幕（可不填，例：大學畢業典禮）'}">
        ${isV && list !== 'cheers' ? `<div class="inline">從第 <input type="number" data-from min="0" step="1" value="${it.from || 0}"> 秒，播 <input type="number" data-secs min="1" step="1" value="${it.secs || Math.min(15, Math.round(m.duration))}"> 秒</div>` : ''}
      </div>${tools}</div>`;
  }

  function bindItems(container, arr, rerender) {
    container.querySelectorAll('.item').forEach(row => {
      const i = +row.dataset.i, it = arr[i];
      const ta = row.querySelector('[data-text]');
      if (ta) {
        const pv = row.querySelector('[data-prev]');
        const upd = () => { pv.innerHTML = richHTML(ta.value) || '<span style="opacity:.4">字卡預覽</span>'; };
        ta.addEventListener('input', () => { it.text = ta.value; upd(); save(); refreshDur(); });
        row.querySelectorAll('[data-c]').forEach(b => {
          b.addEventListener('pointerdown', e => e.preventDefault());
          b.addEventListener('click', () => {
            const c = b.dataset.c;
            if (c === 'x') { ta.value = Render.stripRich(ta.value); }
            else {
              const s = ta.selectionStart, e = ta.selectionEnd;
              if (s === e) return toast('先在字卡裡選取要標色的字');
              const sel = Render.stripRich(ta.value.slice(s, e));
              ta.value = ta.value.slice(0, s) + `{${c}:${sel}}` + ta.value.slice(e);
            }
            it.text = ta.value; upd(); save();
          });
        });
      }
      const cap = row.querySelector('[data-cap]'); if (cap) cap.addEventListener('input', () => { it.caption = cap.value; });
      const fr = row.querySelector('[data-from]'); if (fr) fr.addEventListener('change', () => { it.from = Math.max(0, +fr.value || 0); refreshDur(); });
      const se = row.querySelector('[data-secs]'); if (se) se.addEventListener('change', () => { it.secs = Math.max(1, +se.value || 1); refreshDur(); });
      row.querySelector('[data-up]').addEventListener('click', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; save(); rerender(); } });
      row.querySelector('[data-down]').addEventListener('click', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; save(); rerender(); } });
      row.querySelector('[data-del]').addEventListener('click', () => { arr.splice(i, 1); save(); rerender(); });
    });
  }

  /* ---------- 素材保存（手機 IndexedDB） ---------- */
  let persistWarned = false;
  function persistMedia(id) {
    const m = media.get(id); if (!m || !window.Store) return Promise.resolve();
    return Store.put({ id, kind: m.kind, name: m.name, type: m.file.type, blob: m.file, duration: m.duration, w: m.w, h: m.h, thumb: m.thumb, ai: m.ai || null, person: m.person || '', added: m.added || Date.now() })
      .catch(e => { console.warn(e); if (!persistWarned) { persistWarned = true; toast('手機儲存空間不足，素材只保留到關閉網頁為止', 4000); } });
  }
  async function registerFile(f) {
    const m = await Render.prepareMedia(f);
    m.id = uid(); m.added = Date.now() + Math.random();
    media.set(m.id, m); persistMedia(m.id);
    return m;
  }
  async function restoreMedia() {
    let recs = [];
    try { recs = await Store.all(); } catch (e) { return; }
    recs.sort((a, b) => (a.added || 0) - (b.added || 0));
    for (const r of recs) {
      try {
        const file = r.blob instanceof File ? r.blob : new File([r.blob], r.name || 'file', { type: r.type || r.blob.type });
        const m = r.kind === 'image' ? await Render.prepareMedia(file)
          : { kind: r.kind, file, url: URL.createObjectURL(file), duration: r.duration, w: r.w, h: r.h, thumb: r.thumb };
        Object.assign(m, { id: r.id, ai: r.ai || null, person: r.person || '', added: r.added, name: r.name });
        media.set(r.id, m);
      } catch (e) { console.warn('素材還原失敗', e); }
    }
  }
  function removeMedia(id) {
    media.delete(id); if (window.Store) Store.del(id).catch(() => {});
    S.video.acts.forEach(a => { a.items = a.items.filter(it => it.mid !== id); });
    S.video.cheers = S.video.cheers.filter(it => it.mid !== id);
    S.video.music = S.video.music.map(x => x === id ? null : x);
    save();
  }

  async function addFiles(files, arr) {
    const list = Array.from(files || []);
    if (!list.length) return;
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      toast(`讀取素材 ${i + 1}/${list.length}…`, 60000);
      try {
        const m = await registerFile(list[i]);
        if (m.kind === 'audio') continue;
        if (arr) arr.push({ id: uid(), type: 'media', mid: m.id, caption: '', from: 0 });
        ok++;
      } catch (e) { toast(e.message, 3000); }
    }
    toast(`已加入 ${ok} 個素材`);
    save(); renderLibrary();
  }

  function renderAct(i) {
    const box = document.getElementById('act-items-' + i);
    const arr = S.video.acts[i].items;
    box.innerHTML = arr.map((it, k) => itemHTML(it, 'act', k)).join('') || '<p class="muted" style="margin:0">還沒有內容。回到「① 故事素材」讓 AI 剪輯，或直接在這裡加字卡／照片。</p>';
    bindItems(box, arr, () => { renderAct(i); refreshDur(); });
  }

  function renderVideo() {
    const sc = S.script;
    $('#actsEditor').innerHTML = ACTS.map((a, i) => {
      const mats = sc && sc.acts[i] ? sc.acts[i].materials : [];
      return `<div class="panel act open" style="padding:0">
        <div class="act-h"><div class="num">${a.n}</div><div class="t"><b>${a.name}</b><span>建議 ${a.pct}%・目前 <span data-actdur="${i}">0:00</span></span></div><div class="chev">›</div></div>
        <div class="act-b">
          <p class="muted" style="margin:0 0 6px">${esc(a.hint)}</p>
          ${mats.length ? `<details style="margin:0 0 8px"><summary class="muted">要準備的素材（${mats.length}）</summary><ul class="list">${mats.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
          <div class="items" id="act-items-${i}"></div>
          <div class="addrow">
            <button class="btn small" data-addcard="${i}" type="button">＋ 字卡</button>
            <button class="btn small dark" data-addmedia="${i}" type="button">＋ 照片／影片</button>
          </div>
          <input type="file" class="file-hidden" accept="image/*,video/*" multiple data-file="${i}">
        </div></div>`;
    }).join('');
    $$('#actsEditor .act-h').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    ACTS.forEach((_, i) => renderAct(i));
    $$('[data-addcard]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.addcard; S.video.acts[i].items.push({ id: uid(), type: 'card', text: '' }); save(); renderAct(i); refreshDur();
      const tas = document.querySelectorAll(`#act-items-${i} [data-text]`); if (tas.length) tas[tas.length - 1].focus();
    }));
    $$('[data-addmedia]').forEach(b => b.addEventListener('click', () => $(`[data-file="${b.dataset.addmedia}"]`).click()));
    $$('[data-file]').forEach(inp => inp.addEventListener('change', async () => {
      const i = +inp.dataset.file; await addFiles(inp.files, S.video.acts[i].items); inp.value = ''; renderAct(i); refreshDur();
    }));
    // 開場與宣告
    $('#openOn').checked = S.video.opening.on;
    $('#open1').value = S.video.opening.l1 || ''; $('#open2').value = S.video.opening.l2 || '';
    $('#ann1').value = S.video.ann.l1 || ''; $('#ann2').value = S.video.ann.l2 || ''; $('#ann3').value = S.video.ann.l3 || '';
    renderCheers(); renderMusic(); refreshDur();
  }
  $('#openOn').addEventListener('change', e => { S.video.opening.on = e.target.checked; $('#openFields').classList.toggle('hidden', !e.target.checked); save(); refreshDur(); });
  [['#open1', 'opening', 'l1'], ['#open2', 'opening', 'l2'], ['#ann1', 'ann', 'l1'], ['#ann2', 'ann', 'l2'], ['#ann3', 'ann', 'l3']].forEach(([sel, o, k]) => {
    $(sel).addEventListener('input', e => { S.video[o][k] = e.target.value; save(); refreshDur(); });
  });

  function renderCheers() {
    const box = $('#cheerItems'), arr = S.video.cheers;
    box.innerHTML = arr.map((it, k) => itemHTML(it, 'cheers', k)).join('') || '';
    bindItems(box, arr, () => { renderCheers(); refreshDur(); });
  }
  $('#btnAddCheer').addEventListener('click', () => $('#fileCheer').click());
  $('#fileCheer').addEventListener('change', async e => { await addFiles(e.target.files, S.video.cheers); e.target.value = ''; renderCheers(); refreshDur(); });

  /* ---------- 🪄 素材庫與 AI 自動剪輯 ---------- */
  const TYPE_LABEL = { interview: '訪談', cheer: '加油', broll: '生活畫面', other: '不適用', photo: '照片' };
  function library() {
    let v = 0, p = 0;
    return Array.from(media.values()).filter(m => m.kind === 'image' || m.kind === 'video')
      .sort((a, b) => (a.added || 0) - (b.added || 0))
      .map(m => ({ code: m.kind === 'video' ? 'V' + (++v) : 'P' + (++p), m }));
  }

  function renderLibrary() {
    const lib = library();
    const vids = lib.filter(x => x.m.kind === 'video'), pics = lib.filter(x => x.m.kind === 'image');
    const done = lib.filter(x => x.m.ai && x.m.ai.type).length;
    $('#libBox').classList.toggle('hidden', !lib.length);
    $('#libSummary').textContent = `照片 ${pics.length}・影片 ${vids.length}・AI 已分析 ${done}/${lib.length}`;
    $('#libVideos').innerHTML = vids.map(({ code, m }) => {
      const a = m.ai || {};
      const who = a.type === 'interview' || a.type === 'cheer';
      return `<div class="lib-v" data-mid="${m.id}">
        <div class="thumb" style="background-image:url('${m.thumb || ''}')"><span class="badge">${code}・${Render.fmt(m.duration)}</span></div>
        <div class="body">
          <div>${a.type ? `<span class="tag">${TYPE_LABEL[a.type] || a.type}${a.type !== 'cheer' && a.type !== 'other' ? '・第' + a.act + '幕' : ''}</span>` : '<span class="tag">未分析</span>'}${a.privacy ? '<span class="tag warn">⚠️ 疑似個資</span>' : ''}${who && !a.speakerSure ? '<span class="tag warn">請確認是誰</span>' : ''}</div>
          ${who ? `<input type="text" data-person value="${esc(m.person || '')}" placeholder="這是誰？（例：媽媽）">` : ''}
          <div class="muted lib-sum">${esc(a.summary || m.name || '')}</div>
        </div>
        <button class="lib-del" data-ldel type="button" aria-label="刪除">✕</button>
      </div>`;
    }).join('');
    $('#libPhotos').innerHTML = pics.map(({ code, m }) => {
      const a = m.ai || {};
      return `<div class="lib-p" data-mid="${m.id}" style="background-image:url('${m.thumb || ''}')">
        <span class="badge">${code}${a.act ? '・' + a.act + '幕' : ''}</span>${a.privacy || a.lux ? '<span class="badge warn">⚠️</span>' : ''}
        <button data-ldel type="button" aria-label="刪除">✕</button></div>`;
    }).join('');
    $$('#libBox [data-ldel]').forEach(b => b.addEventListener('click', () => {
      const id = b.closest('[data-mid]').dataset.mid;
      if (!confirm('從素材庫刪除這個素材？（影片裡用到的地方也會一起移除）')) return;
      removeMedia(id); renderLibrary(); renderVideo();
    }));
    $$('#libBox [data-person]').forEach(inp => inp.addEventListener('change', () => {
      const m = media.get(inp.closest('[data-mid]').dataset.mid); if (!m) return;
      const old = m.person || '', val = inp.value.trim();
      m.person = val; if (m.ai) m.ai.speakerSure = true;
      persistMedia(m.id);
      const fix = it => { if (it.mid === m.id && (!it.caption || it.caption === old)) it.caption = val; };
      S.video.acts.forEach(a => a.items.forEach(fix)); S.video.cheers.forEach(fix);
      save(); renderVideo(); renderLibrary(); toast('已更新字幕');
    }));
  }
  $('#btnLibAdd').addEventListener('click', () => $('#fileLib').click());
  $('#fileLib').addEventListener('change', async e => { await addFiles(e.target.files, null); e.target.value = ''; });
  $('#btnLibClear').addEventListener('click', async () => {
    if (!confirm('清空所有素材？各幕裡的照片影片也會移除（字卡保留）。')) return;
    Array.from(media.keys()).forEach(id => removeMedia(id));
    try { await Store.clear(); } catch (e) {}
    S.auto = null; save(); renderLibrary(); renderVideo(); renderAuto();
  });

  let autoRunning = false;
  async function runAuto() {
    if (autoRunning) return;
    if (!hasAI()) return toast('需要先接上 AI 才能自動剪輯', 3000);
    if (filledCount() < 3) { toast('請先回答上面的故事至少 3 題，AI 才知道你的故事', 3500); $('#qList').scrollIntoView({ behavior: 'smooth' }); return; }
    const lib = library();
    if (lib.length < 3) return toast('先選取照片和影片（至少 3 個）');
    if (S.video.acts.some(a => a.items.length) && !confirm('AI 會重新安排 6 幕的內容，覆蓋目前的安排，確定？')) return;
    autoRunning = true;
    const btn = $('#btnAuto'); btn.disabled = true;
    const st = msg => { $('#autoStatus').innerHTML = '<span class="spinner"></span> ' + esc(msg); };
    let wake = null; try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    const errs = [];
    try {
      const vids = lib.filter(x => x.m.kind === 'video' && !(x.m.ai && x.m.ai.type));
      for (let i = 0; i < vids.length; i++) {
        const { code, m } = vids[i];
        try {
          m.ai = await AutoEdit.analyzeVideo(m, S.form, msg => st(`分析影片 ${i + 1}/${vids.length}（${code}）：${msg}`));
          if (!m.person && m.ai.speaker) m.person = m.ai.speaker;
          persistMedia(m.id); renderLibrary();
        } catch (e) {
          if (e.status === 429) throw e;
          errs.push(`${code}（${m.name}）分析失敗：${e.message}`);
        }
      }
      const pics = lib.filter(x => x.m.kind === 'image' && !(x.m.ai && x.m.ai.type));
      if (pics.length) {
        const res = await AutoEdit.analyzePhotos(pics, S.form, st);
        pics.forEach(({ m }) => { if (res[m.id]) { m.ai = res[m.id]; persistMedia(m.id); } });
        renderLibrary();
      }
      const plan = await AutoEdit.assemble(S.form, S.script, library(), st);
      applyPlan(plan, errs);
      $('#autoStatus').textContent = '';
    } catch (e) {
      $('#autoStatus').textContent = '⚠️ ' + e.message + '（已分析好的素材會保留，再按一次會接著做）';
    } finally {
      autoRunning = false; btn.disabled = false;
      try { wake && wake.release(); } catch (e) {}
    }
  }
  $('#btnAuto').addEventListener('click', runAuto);

  function applyPlan(plan, errs) {
    const byCode = {}; library().forEach(x => { byCode[x.code] = x.m; });
    const mk = (o, isCheer) => {
      const m = byCode[String(o.id || '').trim().toUpperCase()]; if (!m) return null;
      const it = { id: uid(), type: 'media', mid: m.id, caption: o.caption ? String(o.caption) : '', from: 0 };
      if (m.kind === 'video') {
        let from = Math.max(0, Number(o.from) || 0), to = Number(o.to) || 0;
        if (from >= (m.duration || 0) - 0.3) from = 0;
        if (!(to > from)) to = from + (isCheer ? 2.4 : 10);
        to = Math.min(m.duration || to, to);
        it.from = Math.round(from * 10) / 10;
        it.secs = Math.max(1, Math.round((to - from) * 10) / 10);
        if (!it.caption && m.person && m.ai && (m.ai.type === 'interview' || isCheer)) it.caption = m.person;
      }
      return it;
    };
    S.video.acts = ACTS.map((a, i) => {
      const src = (plan.acts || []).find(x => Number(x.act) === a.n) || (plan.acts || [])[i] || {};
      const items = [];
      (src.items || []).forEach(o => {
        if (o && o.card) items.push({ id: uid(), type: 'card', text: String(o.card).replace(/\\n/g, '\n') });
        else if (o && o.id) { const it = mk(o, false); if (it) items.push(it); }
      });
      return { items };
    });
    S.video.cheers = (plan.cheers || []).map(o => mk(o, true)).filter(Boolean);
    S.video.opening.on = true;
    S.video.opening.l1 = plan.subtitle || '騰燁通訊處';
    S.video.opening.l2 = plan.title || (S.form.name ? `${S.form.name}的保險路` : '');
    const an = plan.announcement || {};
    S.video.ann = {
      l1: fmtDate(S.form.goalDate) || an.line1 || '',
      l2: S.form.goalTitle ? `晉升 ${S.form.goalTitle}` : (an.line2 || ''),
      l3: an.line3 || '請大家一起見證'
    };
    S.auto = { at: Date.now(), missing: plan.missing || [], checks: plan.checks || [], unused: plan.unused || [], errs: errs || [] };
    save(); renderVideo(); renderAuto();
    showTab('video');
    toast('AI 剪好了，確認一下就能輸出', 3000);
  }

  function renderAuto() {
    const a = S.auto, box = $('#autoResult');
    $('#autoResultPanel').classList.toggle('hidden', !a);
    if (!a) { box.innerHTML = ''; return; }
    const tl = Render.buildTimeline(project(), media);
    const needWho = library().some(x => x.m.ai && (x.m.ai.type === 'interview' || x.m.ai.type === 'cheer') && !x.m.ai.speakerSure);
    const strList = arr => arr.map(x => typeof x === 'string' ? x : `${x.id || ''} ${x.reason || ''}`);
    box.innerHTML = `
      <div class="notice green">✅ AI 已排好 <b>${Render.fmt(tl.total)}</b> 的影片，各幕內容在下方，可以直接修改。</div>
      <div class="label-s">剩下需要你做的事</div>
      <ol class="list todo">
        ${needWho ? '<li><b>確認人物</b>：到「① 故事素材」的素材清單，把標「請確認是誰」的影片改成正確稱呼（字幕會自動更新）</li>' : ''}
        <li><b>檢查字卡</b>：年份、事件、人名是否正確</li>
        <li><b>選配樂</b>：在下方「配樂」選 1～3 首</li>
        <li><b>預覽</b>：不喜歡的片段刪掉或換順序，再輸出</li>
      </ol>
      ${a.checks.length ? `<div class="label-s">AI 請你確認</div><ul class="list">${a.checks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.missing.length ? `<div class="label-s">建議補拍</div><ul class="list">${a.missing.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.unused.length ? `<details><summary class="muted">沒用到的素材（${a.unused.length}）</summary><ul class="list">${strList(a.unused).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      ${a.errs.length ? `<div class="notice red" style="margin-top:8px">${a.errs.map(esc).join('<br>')}</div>` : ''}`;
  }

  /* ---------- 輸出 ---------- */
  let renderer = null, lastBlob = null;
  function modal(show) { $('#renderModal').classList.toggle('show', show); document.body.style.overflow = show ? 'hidden' : ''; }

  async function startRender(record) {
    const p = project();
    const tl = Render.buildTimeline(p, media);
    if (!tl.segs.length) return toast('還沒有內容，先產生字卡或放素材');
    if (record && $$('.pv').some(c => !c.checked)) {
      toast('請先勾選「輸出前檢查」三項', 3000);
      $('.pv').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('#resultVideo').classList.add('hidden'); $('#stage').classList.remove('hidden');
    $('#rmBtnsRun').classList.remove('hidden'); $('#rmBtnsDone').classList.add('hidden');
    $('#rmTitle').textContent = record ? '影片輸出中，請保持螢幕開啟' : '預覽中';
    $('#rmBar').style.width = '0%'; $('#rmText').textContent = '準備中…';
    modal(true);
    renderer = new Render.Renderer($('#stage'), p, media);
    renderer.onProgress = (f, txt) => { $('#rmBar').style.width = (f * 100).toFixed(1) + '%'; $('#rmText').textContent = txt; };
    try {
      const blob = await renderer.run(record);
      if (renderer.cancelled) { modal(false); return; }
      if (!record) { modal(false); return; }
      lastBlob = blob;
      const v = $('#resultVideo');
      if (v.src) URL.revokeObjectURL(v.src);
      v.src = URL.createObjectURL(blob);
      $('#stage').classList.add('hidden'); v.classList.remove('hidden');
      $('#rmTitle').textContent = '完成 🎉';
      $('#rmText').textContent = `${Render.fmt(tl.total)}・${(blob.size / 1048576).toFixed(1)} MB・${blob.type.includes('mp4') ? 'MP4' : 'WebM'}`;
      $('#rmBtnsRun').classList.add('hidden'); $('#rmBtnsDone').classList.remove('hidden');
    } catch (e) {
      console.error(e);
      modal(false); toast('⚠️ ' + e.message, 4000);
    }
  }
  $('#btnPreview').addEventListener('click', () => startRender(false));
  $('#btnExport').addEventListener('click', () => startRender(true));
  $('#rmCancel').addEventListener('click', () => { if (renderer) renderer.cancel(); modal(false); });
  $('#rmClose').addEventListener('click', () => { $('#resultVideo').pause(); modal(false); });
  $('#rmSave').addEventListener('click', async () => {
    if (!lastBlob) return;
    const ext = lastBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `${S.form.name || '騰燁'}_回顧影片.${ext}`;
    const file = new File([lastBlob], name, { type: lastBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(lastBlob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#rmReview').addEventListener('click', () => {
    if (!lastBlob) return;
    rvBlob = new File([lastBlob], 'my-video.' + (lastBlob.type.includes('mp4') ? 'mp4' : 'webm'), { type: lastBlob.type });
    $('#rvFileInfo').textContent = '已帶入剛輸出的影片';
    $('#resultVideo').pause(); modal(false); setRvMode('video'); showTab('review');
  });

  /* ---------- ③ 評審 ---------- */
  let rvMode = 'video', rvBlob = null;
  function setRvMode(m) {
    rvMode = m;
    $$('#rvMode button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
    $('#rvVideoBox').classList.toggle('hidden', m !== 'video');
    $('#rvTextBox').classList.toggle('hidden', m !== 'text');
    $('#rvPrivacy').classList.toggle('hidden', m !== 'video');
    $('#btnCopyReviewPrompt').classList.toggle('hidden', m !== 'text');
    refreshAI();
  }
  $$('#rvMode button').forEach(b => b.addEventListener('click', () => setRvMode(b.dataset.v)));
  $('#rvFile').addEventListener('change', e => {
    rvBlob = e.target.files[0] || null;
    $('#rvFileInfo').textContent = rvBlob ? `${rvBlob.name}・${(rvBlob.size / 1048576).toFixed(1)} MB` : '';
  });
  $('#btnCopyReviewPrompt').addEventListener('click', () => {
    const t = $('#rvText').value.trim(); if (!t) return toast('請先貼上腳本文字');
    copyText(AI.fullReviewPrompt(t));
  });

  $('#btnReview').addEventListener('click', async () => {
    const btn = $('#btnReview'), st = $('#rvStatus');
    let parts;
    if (rvMode === 'text') {
      const t = $('#rvText').value.trim();
      if (t.length < 30) return toast('腳本內容太少，請貼完整一點');
      if (!hasAI()) return copyText(AI.fullReviewPrompt(t));
      parts = [{ text: AI.reviewPromptText(t) }];
    } else if (!rvBlob) return toast('請先選擇影片');
    btn.disabled = true; $('#rvOut').innerHTML = '';
    try {
      if (rvMode === 'video') {
        const r = await Review.buildVideoParts(rvBlob, $('#rvNote').value, msg => { st.innerHTML = '<span class="spinner"></span> ' + esc(msg); });
        parts = r.parts;
        if (r.audioNote) toast(r.audioNote, 3500);
      }
      st.innerHTML = '<span class="spinner"></span> AI 主管評審中（約 30～60 秒）…';
      const { json } = await AI.callGemini({ system: AI.REVIEW_SYSTEM, parts, temperature: 0.4 });
      st.textContent = '';
      renderReview(json);
    } catch (e) {
      st.textContent = '⚠️ ' + e.message;
    } finally { btn.disabled = false; }
  });

  function renderReview(j) {
    const dims = DIMS.map(d => {
      const x = (j.dims || []).find(y => y.id === d.id) || {};
      return Object.assign({}, d, { score: Math.max(0, Math.min(d.max, Number(x.score) || 0)), good: x.good || '', fix: x.fix || '' });
    });
    const total = dims.reduce((a, d) => a + d.score, 0);
    const fail = !!j.privacy_fail;
    const color = fail ? '#C0392B' : total >= 85 ? '#2E9E6A' : total >= 70 ? '#C9831B' : '#E2533B';
    const pct = total / 100 * 360;
    const sc = v => v / 1 >= 0.8 ? '#2E9E6A' : v >= 0.6 ? '#C9831B' : '#E2533B';
    const html = `
      <div class="panel">
        <div class="score-wrap">
          <div class="ring" style="background:conic-gradient(${color} ${pct}deg, var(--bg) 0)"><div style="width:88px;height:88px;border-radius:50%;background:var(--paper);display:grid;place-items:center"><div><b style="color:${color}">${fail ? '✕' : total}</b><small>${fail ? '個資否決' : '/ 100'}</small></div></div></div>
          <div><h2 style="margin:0 0 4px">${esc(j.grade || '評審結果')}</h2>${j.praise ? `<p class="muted" style="margin:0">${esc(j.praise)}</p>` : ''}</div>
        </div>
        ${fail ? `<div class="notice red" style="margin:12px 0 0"><b>⚠️ 個資一票否決：</b>${esc(j.privacy_note || '畫面中有可辨識的客戶資料')}</div>` : ''}
        ${(j.top3 || []).length ? `<div class="label-s">最優先改這三件事</div><ol class="list">${j.top3.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      </div>
      <div class="panel">
        <h2>五大原則</h2>
        ${dims.map(d => `<div class="dim">
          <div class="dim-h"><b>${d.id} ${esc(d.name)}</b><span>${d.score}<small class="muted"> / ${d.max}</small></span></div>
          <div class="bar"><i style="width:${d.score / d.max * 100}%;background:${sc(d.score / d.max)}"></i></div>
          ${d.good ? `<p>👍 ${esc(d.good)}</p>` : ''}${d.fix ? `<p class="fix">✏️ ${esc(d.fix)}</p>` : ''}
        </div>`).join('')}
      </div>
      ${(j.structure || []).length ? `<div class="panel"><h2>六幕結構檢查</h2>${j.structure.map(s => `<div class="tl"><b>第${esc(s.act)}幕</b><span><span class="tag">${esc(s.status || '')}</span>${esc(s.note || '')}</span></div>`).join('')}</div>` : ''}
      ${(j.timeline || []).length ? `<div class="panel"><h2>時間軸建議</h2>${j.timeline.map(t => `<div class="tl"><b>${esc(t.time)}</b><span>${esc(t.issue || '')}${t.suggest ? `<br><span class="muted">→ ${esc(t.suggest)}</span>` : ''}</span></div>`).join('')}</div>` : ''}
      ${(j.rewrites || []).length ? `<div class="panel"><h2>字卡改寫對照</h2>${j.rewrites.map(r => `<div class="rw"><div class="from">${esc(Render.stripRich(r.from))}</div><div class="to mini-card${S.video.font === 'round' ? ' round' : ''}" style="margin:6px 0 0">${richHTML(r.to)}</div>${r.why ? `<div class="why">${esc(r.why)}</div>` : ''}</div>`).join('')}</div>` : ''}
      <div class="panel"><button class="btn block" id="btnCopyReview" type="button">📋 複製評審結果（傳給主管）</button></div>`;
    $('#rvOut').innerHTML = html;
    $('#btnCopyReview').addEventListener('click', () => {
      let t = `【影片評審】${fail ? '個資否決' : total + ' / 100'}　${j.grade || ''}\n`;
      dims.forEach(d => { t += `\n${d.id} ${d.name}：${d.score}/${d.max}\n${d.fix ? '改：' + d.fix + '\n' : ''}`; });
      if ((j.top3 || []).length) t += `\n優先修改：\n${j.top3.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n`;
      if (fail) t += `\n⚠️ 個資：${j.privacy_note || ''}\n`;
      copyText(t);
    });
    setTimeout(() => $('#rvOut').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  /* ---------- 啟動 ---------- */
  renderScript(); renderVideo(); setRvMode('video'); refreshAI(); renderAuto();
  try { const t = localStorage.getItem('tengye.tab'); if (t && t !== 'story') showTab(t); } catch (e) {}
  restoreMedia().then(() => {
    // 清掉找不到素材的項目
    const ok = it => it.type === 'card' || media.has(it.mid);
    S.video.acts.forEach(a => { a.items = a.items.filter(ok); });
    S.video.cheers = S.video.cheers.filter(ok);
    S.video.music = S.video.music.map(id => (id && media.has(id)) ? id : null);
    renderVideo(); renderLibrary(); renderAuto();
  });
  window.__app = { S, media, renderReview, setScript, library };
})();
