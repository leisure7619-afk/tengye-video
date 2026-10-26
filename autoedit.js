/* autoedit.js — AI 自動剪輯：逐支分析素材 → 排成 6 幕時間軸 */
(function () {
  const ACTS = AI.ACTS;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mmss = t => Review.mmss(t);

  async function retry(fn, onWait) {
    for (let k = 0; ; k++) {
      try { return await fn(); }
      catch (e) {
        if (e.status === 429 && k < 3) { const w = 20 * (k + 1); onWait && onWait(w); await sleep(w * 1000); continue; }
        if ((e.status === 500 || e.status === 503) && k < 2) { await sleep(5000); continue; }
        throw e;
      }
    }
  }

  function people(form) {
    return [form.name ? `主角：${form.name}` : '', form.q8 ? `可能出現的親友：${form.q8}` : ''].filter(Boolean).join('\n');
  }

  /* ---------- 影片分析 ---------- */
  const VIDEO_SYSTEM = `你是南山人壽「騰燁通訊處」回顧影片的剪輯師助理。你會收到一支素材影片的影格（每張前面標示 [mm:ss]）和原聲音檔，請判斷這支素材的用途並挑出最適合放進回顧影片的片段。

影片的 6 幕結構：
${AI.STRUCTURE_TEXT}

素材類型 type：
- interview：有人對著鏡頭談論主角（親友、主管、客戶的訪談或證言）
- cheer：親友自拍喊「加油」之類的短片
- broll：生活或工作畫面（開車、寫建議書、開會、出遊、活動）
- other：無法使用（手震、全黑、與主題無關）

判斷說話者時，依說話內容與稱呼推測（例：「我女兒」→ 媽媽或爸爸；「我老婆」→ 老公），用組員給的親友名單對應；推測不出來就寫「親友」。
個資：畫面中如果有可辨識的客戶姓名、身分證、保單號碼、病歷，privacy 設為 true。

只輸出 JSON：
{
  "type": "interview|cheer|broll|other",
  "speaker": "說話者稱呼（例：媽媽、老公阿哲、涵潔主任；沒有說話者留空）",
  "speaker_sure": false,
  "summary": "這支素材在講什麼（30 字內）",
  "quote": "最有感覺的一句原話（沒有就留空）",
  "best": {"from": 0, "to": 0},
  "act": 1,
  "emotion": 3,
  "quality": 3,
  "privacy": false,
  "privacy_note": ""
}
best 是建議剪用的秒數區間（interview 6～25 秒、抓完整句子；cheer 抓喊加油的 1.5～2.5 秒；broll 4～8 秒）。act 為最適合的幕（1～6）。emotion、quality 為 1～5 分。`;

  async function analyzeVideo(m, form, onMsg) {
    onMsg('擷取畫面…');
    const { frames, duration } = await Review.extractFrames(m.file, null, { max: 10, min: 3, every: 6, width: 384, quality: 0.6 });
    const audio = await Review.extractAudio(m.file, () => onMsg('擷取聲音…'), { maxSec: 240 });
    const parts = [{ text: `素材檔名：${m.name}\n長度：${mmss(duration)}（${Math.round(duration)} 秒）\n${people(form)}\n${audio.data ? '' : '（此素材沒有可用的聲音）'}` }];
    frames.forEach(f => { parts.push({ text: `[${mmss(f.t)}]` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: f.data } }); });
    if (audio.data) parts.push({ inlineData: { mimeType: 'audio/wav', data: audio.data } });
    onMsg('AI 看影片、聽內容中…');
    const { json } = await retry(() => AI.callGemini({ system: VIDEO_SYSTEM, parts, temperature: 0.3 }), w => onMsg(`AI 額度用完，${w} 秒後自動重試…`));
    const best = json.best || {};
    let from = Math.max(0, Number(best.from) || 0), to = Number(best.to) || 0;
    if (!(to > from)) to = Math.min(duration, from + (json.type === 'cheer' ? 2.4 : 10));
    to = Math.min(duration, to);
    return {
      type: ['interview', 'cheer', 'broll', 'other'].includes(json.type) ? json.type : 'broll',
      speaker: String(json.speaker || ''), speakerSure: !!json.speaker_sure,
      summary: String(json.summary || ''), quote: String(json.quote || ''),
      from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10,
      act: Math.min(6, Math.max(1, Number(json.act) || 1)),
      emotion: Number(json.emotion) || 3, quality: Number(json.quality) || 3,
      privacy: !!json.privacy, privacyNote: String(json.privacy_note || ''),
      noAudio: !audio.data
    };
  }

  /* ---------- 照片分析（分批） ---------- */
  const PHOTO_SYSTEM = `你是南山人壽「騰燁通訊處」回顧影片的剪輯師助理。你會收到多張照片，每張前面標示編號 [P#]。請判斷每張照片適合放在哪一幕。

影片的 6 幕結構：
${AI.STRUCTURE_TEXT}

個資：照片中如果有可辨識的客戶姓名、身分證、保單號碼、病歷，privacy 設為 true。
炫富畫面（名車名錶、現金、業績獎金數字特寫）lux 設為 true。
幾乎一樣的連拍照片，dup 填與它重複的編號。

只輸出 JSON：
{"photos": [{"p": "P1", "desc": "畫面描述（20 字內）", "act": 1, "caption": "建議字幕（12 字內，可留空）", "people": "畫面中的人（例：主角與媽媽）", "quality": 3, "privacy": false, "lux": false, "dup": ""}]}`;

  function smallJpeg(m, w) {
    const src = m.img; const s = Math.min(1, w / Math.max(src.width, src.height));
    const c = document.createElement('canvas'); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6).split(',')[1];
  }

  async function analyzePhotos(list, form, onMsg) {
    // list: [{code, m}]
    const out = {};
    const B = 20;
    for (let i = 0; i < list.length; i += B) {
      const batch = list.slice(i, i + B);
      onMsg(`AI 看照片 ${Math.min(i + B, list.length)}/${list.length}…`);
      const parts = [{ text: `${people(form)}\n以下共 ${batch.length} 張照片：` }];
      batch.forEach(x => { parts.push({ text: `[${x.code}]` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: smallJpeg(x.m, 448) } }); });
      const { json } = await retry(() => AI.callGemini({ system: PHOTO_SYSTEM, parts, temperature: 0.3 }), w => onMsg(`AI 額度用完，${w} 秒後自動重試…`));
      (json.photos || []).forEach(p => {
        const x = batch.find(b => b.code === String(p.p).trim()); if (!x) return;
        out[x.m.id] = {
          type: 'photo', desc: String(p.desc || ''), act: Math.min(6, Math.max(1, Number(p.act) || 1)),
          caption: String(p.caption || ''), people: String(p.people || ''), quality: Number(p.quality) || 3,
          privacy: !!p.privacy, lux: !!p.lux, dup: String(p.dup || '')
        };
      });
    }
    return out;
  }

  /* ---------- 排片 ---------- */
  const ASSEMBLE_SYSTEM = `你是南山人壽「騰燁通訊處」的資深主管兼影片導演。組員已經上傳所有素材，素材也都分析好了。請你像專業剪輯師一樣，把它們排成一支「晉升回顧暨下階宣告影片」。

【核心精神】初心、幫助過的人、感謝的人，溫馨感人。嚴禁炫富與業績數字流水帳。客戶個資不可出現。

【騰燁 6 幕三明治結構】（百分比為建議時間比例）
${AI.STRUCTURE_TEXT}
第6幕最後：5～9 組親友喊「加油！」快剪 → 下階宣告字卡（系統會自動接在最後，你只要排 cheers）。

【字卡規範】
- 純黑底大字，每張 1～3 行，每行不超過 14 字，用 \\n 換行；第一人稱「我」、白話、真誠。
- 標色：{r:文字} 亮紅＝痛點／反對／承諾／宣告；{b:文字} 青藍＝能力累積／主管名字；{p:文字} 粉紅＝個人價值／溫暖特質。每張最多 1～2 處。
- 字卡要跟相鄰素材呼應（例：放媽媽訪談前，先放一張「{r:媽媽}當初最反對」）。
- 第2幕以字卡為主；第3幕要有「反對 → 字卡轉化 → 主管金句」的順序。

【剪輯規則】
- 總長度目標 3～5 分鐘。字卡約 4 秒、照片約 3.4 秒，影片用 from/to 秒數。
- 訪談片段 6～25 秒，抓完整句子；同一支訪談如果有兩段很好，可以分兩次用在不同幕（from/to 不重疊）。
- 照片、生活畫面優先挑 quality 高、不重複的；每個素材最多用一次（訪談例外如上）。
- privacy 或 lux 為 true 的素材不可使用，列在 unused 並說明。
- 照片字幕可以留空或 12 字內；訪談字幕填說話者稱呼（例：媽媽）。
- cheers 挑 type 為 cheer 的影片，from/to 抓喊加油的 1.5～2.5 秒；不夠 5 組就在 missing 提醒。
- 素材不足的幕，用字卡撐住故事，並在 missing 說明建議補拍什麼。

只輸出 JSON：
{
  "title": "影片主標題",
  "subtitle": "小標（例：騰燁通訊處）",
  "acts": [
    {"act": 1, "items": [
      {"card": "字卡文字"},
      {"id": "P3", "caption": "字幕"},
      {"id": "V2", "from": 12, "to": 28, "caption": "媽媽"}
    ]}
  ],
  "cheers": [{"id": "V9", "from": 1.0, "to": 3.0, "caption": "大學室友 小美"}],
  "announcement": {"line1": "YYYY.MM.DD", "line2": "晉升 職級", "line3": "一句承諾或邀請見證"},
  "unused": [{"id": "P5", "reason": "與 P4 重複"}],
  "missing": ["建議補拍的內容"],
  "checks": ["需要組員確認的事（例：V2 說話者是否為媽媽）"]
}
acts 必須剛好 6 個（act 1～6）。`;

  function mediaLines(lib) {
    return lib.map(({ code, m }) => {
      const a = m.ai || {};
      if (m.kind === 'video') {
        if (!a.type) return `${code}｜影片 ${Math.round(m.duration)} 秒｜（未分析）檔名 ${m.name}`;
        return `${code}｜影片 ${Math.round(m.duration)} 秒｜${a.type}｜說話者：${m.person || a.speaker || '無'}｜${a.summary}${a.quote ? `｜金句「${a.quote}」` : ''}｜建議片段 ${a.from}-${a.to} 秒｜建議第 ${a.act} 幕｜情緒 ${a.emotion}｜品質 ${a.quality}${a.privacy ? `｜⚠️個資：${a.privacyNote}` : ''}`;
      }
      if (!a.type) return `${code}｜照片｜（未分析）`;
      return `${code}｜照片｜${a.desc}｜人物：${a.people || '－'}｜建議第 ${a.act} 幕｜字幕建議：${a.caption || '－'}｜品質 ${a.quality}${a.dup ? `｜與 ${a.dup} 重複` : ''}${a.privacy ? '｜⚠️個資' : ''}${a.lux ? '｜⚠️炫富' : ''}`;
    }).join('\n');
  }

  async function assemble(form, script, lib, onMsg) {
    let txt = `【組員故事】\n${AI.formToText(form)}\n`;
    if (script && script.acts) {
      txt += '\n【組員已確認的分鏡字卡（請優先採用，可微調以銜接素材）】\n';
      script.acts.forEach(a => { txt += `第${a.act}幕：${a.cards.map(c => c.replace(/\n/g, '\\n')).join('／')}\n`; });
    }
    txt += `\n【素材清單】共 ${lib.length} 個\n${mediaLines(lib)}\n\n請排出完整影片 JSON。`;
    onMsg('AI 導演排片中（約 30～60 秒）…');
    const { json } = await retry(() => AI.callGemini({ system: ASSEMBLE_SYSTEM, parts: [{ text: txt }], temperature: 0.6 }), w => onMsg(`AI 額度用完，${w} 秒後自動重試…`));
    return json;
  }

  window.AutoEdit = { analyzeVideo, analyzePhotos, assemble, mediaLines };
})();
