/* ai.js — 騰燁專屬 Prompt 與 Gemini 呼叫（經 Cloudflare Worker） */
(function () {
  const ACTS = [
    { n: 1, name: '背景與性格底色', pct: 15, hint: '家族／求學照＋親友訪談「爆料」主角的缺點（固執、主觀、愛睡覺…）' },
    { n: 2, name: '痛點引爆與轉折', pct: 12, hint: '全黑底字卡直擊心靈：買房不敢出聲、穩定的低薪、創業虧損…' },
    { n: 3, name: '直面反對與破局', pct: 18, hint: '親友誠實說出當初反對 → 黑底字卡轉化偏見 → 主管金句點醒' },
    { n: 4, name: '雙腳展業與晉升', pct: 14, hint: '深夜車內／咖啡廳寫保單、簽約健診實景（遠景！）→ 完成晉升' },
    { n: 5, name: '第三人見證蛻變', pct: 22, hint: '親友見證你的轉變＋父母／另一半心疼叮嚀與健康提醒' },
    { n: 6, name: '深度致謝與下階宣告', pct: 19, hint: '合照逐一感謝引薦人、主管、騰燁大家庭 → 加油快剪 → 宣告' }
  ];

  const QUESTIONS = [
    { k: 'q1', t: '初心：你為什麼做保險？', h: '一件事、一個人或一句話讓你決定進來。' },
    { k: 'q2', t: '經歷：進保險前的你', h: '家庭、求學、上一份工作；也寫你的個性缺點（親友最愛爆料的那種）。' },
    { k: 'q3', t: '痛點：讓你決定轉職的關鍵時刻', h: '例：買房時不敢出聲、穩定但低薪、創業虧損…越具體越好。' },
    { k: 'q4', t: '反對：誰反對過？說了什麼？', h: '例：媽媽說「保險就是拜託人」；你後來怎麼想通的？主管說了哪句話點醒你？' },
    { k: 'q5', t: '展業：最辛苦／最感動的片段', h: '深夜寫建議書、被拒絕、幫客戶理賠的故事（不要寫客戶真名）。' },
    { k: 'q6', t: '轉變：做保險後的你', h: '你自己、家人、朋友看到你哪些改變？' },
    { k: 'q7', t: '感謝：想謝謝誰？為什麼？', h: '引薦人、主管、家人、團隊…各寫一件具體的事。' },
    { k: 'q8', t: '訪談名單：誰可以受訪或喊加油？', h: '寫關係＋稱呼，例：媽媽、老公阿哲、大學室友小美、主管涵潔。' }
  ];

  const EXAMPLE = {
    name: '小萱', goalTitle: '業務襄理', goalDate: '2027-03-31',
    q1: '爸爸住院那年，家裡才發現他只有一張很舊的保單，醫藥費都是我們自己扛。那時候我就想，如果早點有人跟我們說清楚就好了。',
    q2: '台中長大，家裡開早餐店。大學念會計，畢業後在會計事務所做了五年。個性很固執、很主觀，朋友都說我愛睡覺、約我出門永遠遲到。',
    q3: '2022 年想買房，跟老公去看房子，房仲問預算，我一句話都不敢說。穩定的薪水，十年都買不起一間房，那天晚上回家我哭了。',
    q4: '媽媽說「做保險就是拜託親戚朋友，你會沒朋友」。老公也擔心沒底薪。後來想通：哪個行業不用拜託人？差別是我拜託你，是為了保護你。可妮襄理跟我說：「你不是在賣保險，是在幫人把風險說清楚。」',
    q5: '第一年常常晚上十點還在車上改建議書。最感動的是一位客戶確診乳癌，我陪她跑理賠，她握著我的手說還好有你。',
    q6: '以前很急、說話很直，現在會先聽對方說完。媽媽說我變得會撒嬌，老公說我變得有目標，每天早上六點就起床。',
    q7: '謝謝引薦人涵潔主任一路帶我；謝謝可妮襄理在我想放棄時陪我喝咖啡聊到半夜；謝謝老公幫我顧小孩；謝謝騰燁大家庭。',
    q8: '媽媽、老公阿哲、妹妹小琪、大學室友小美、客戶王姐、主管涵潔、可妮襄理'
  };

  function formToText(f) {
    const L = [];
    L.push(`主角：${f.name || '（未填）'}`);
    L.push(`下階目標：${f.goalTitle || '（未填）'}，宣告日期：${f.goalDate || '（未填）'}`);
    QUESTIONS.forEach((q, i) => L.push(`${i + 1}. ${q.t}\n${(f[q.k] || '（未填）').trim()}`));
    return L.join('\n\n');
  }

  const STRUCTURE_TEXT = ACTS.map(a => `第${a.n}幕「${a.name}」（約 ${a.pct}%）：${a.hint}`).join('\n');

  const SCRIPT_SYSTEM = `你是南山人壽「騰燁通訊處」的資深主管兼影片導演，專門協助組員製作「個人晉升／回顧暨下階宣告影片」，觀眾是客戶與同業。

【核心精神】
影片要聚焦：為什麼做保險（初心）、幫助過的人（理賠／價值）、感謝的人（主管／親友），基調溫馨感人。嚴禁炫富、嚴禁業績數字流水帳。客戶個資一律不可出現（客戶只用「王姐」這類稱呼，保單畫面只拍遠景）。

【騰燁 6 幕三明治結構】
${STRUCTURE_TEXT}
第6幕最後：5～9 組親友自拍喊「加油！」快剪 → 壓上「明確日期＋下階職級」的晉升宣告。

【字卡規範】
- 字卡是純黑底大字（手寫／粗圓體），每張 1～3 行，每行不超過 14 個中文字，用 \\n 換行。
- 第2幕、第3幕的轉化句、第6幕的承諾以字卡為主，句子要短、要痛、要真。
- 標色語法：{r:文字} 亮紅＝痛點、反對質疑、核心承諾、晉升宣告；{b:文字} 青藍＝能力累積、聽話照做、主管名字、深層默契；{p:文字} 粉紅＝個人價值、溫暖特質、專業標籤。每張字卡最多標 1～2 處。
- 用主角自己的口吻（第一人稱「我」），白話、真誠，不要口號。

【輸出格式】只輸出 JSON，不要任何其他文字：
{
  "title": "影片主標題（例：小萱的保險路）",
  "subtitle": "小標（例：騰燁通訊處）",
  "acts": [
    {
      "act": 1,
      "name": "背景與性格底色",
      "cards": ["字卡1", "字卡2"],
      "materials": ["要準備的照片或影片（具體描述）"],
      "interviews": [{"who": "受訪者", "question": "要問他的問題", "aim": "希望拍到的內容／情緒"}],
      "tip": "這一幕的拍攝或剪輯小提醒（一句話）"
    }
  ],
  "music": ["開場配樂建議", "中段配樂建議", "高潮配樂建議"],
  "cheers": ["建議喊加油的人"],
  "announcement": {"line1": "YYYY.MM.DD", "line2": "晉升 職級", "line3": "一句承諾或邀請見證"},
  "checklist": ["拍攝前要提醒主角的事（含個資提醒）"]
}
acts 必須剛好 6 個，act 依序 1～6，每幕 2～5 張字卡、2～5 項素材；第1、3、5幕至少各 1 題訪談。`;

  function scriptPrompt(f) {
    return `以下是組員填寫的故事素材，請依規範產出 6 幕分鏡腳本 JSON。素材不足的地方，用合理、溫暖、不誇大的方式補成「建議」，不要捏造具體數字。\n\n${formToText(f)}`;
  }

  const DIMS = [
    { id: 'D1', name: '轉職痛點與破局思維', max: 20, d: '具體痛點呈現與破局信念' },
    { id: 'D2', name: '雙腳展業足跡與空杯成長', max: 20, d: '樸實苦幹畫面、團隊系統借力' },
    { id: 'D3', name: '親友三明治證言與感恩厚度', max: 25, d: '訪談四部曲反差、感恩層級細節' },
    { id: 'D4', name: '配樂節奏、加油陣與下階宣告', max: 20, d: '三段式配樂推進、壓軸親友加油與明確宣告' },
    { id: 'D5', name: '黑底美學與個資合規', max: 15, d: '黑底手寫美學、重點標色、客戶保單個資合規（一票否決）' }
  ];

  const REVIEW_SYSTEM = `你是南山人壽「騰燁通訊處」的主管，正在審查組員的「晉升回顧暨下階宣告影片」初稿。你標準高但說話溫暖，建議要具體到「可以直接照改」。

【騰燁 6 幕三明治結構】
${STRUCTURE_TEXT}
第6幕最後：5～9 組親友自拍喊「加油！」快剪 → 壓上「明確日期＋下階職級」的晉升宣告。

【視覺規範】衝突、痛點、核心承諾用純黑底＋手寫／粗圓體；亮紅＝痛點／反對／承諾／宣告，青藍＝能力累積／主管名字，粉紅＝個人價值／溫暖特質。
【精神】初心、幫助過的人、感謝的人、溫馨感人；嚴禁炫富與業績流水帳。

【5 大評審原則（總分 100）】
${DIMS.map(d => `${d.id} ${d.name}（${d.max} 分）：${d.d}`).join('\n')}
D5 個資一票否決：只要畫面或字卡出現可辨識的客戶姓名、身分證、保單號碼、病歷等，privacy_fail 設為 true，並在 privacy_note 指出時間點與內容。

如果素材是影片影格，影格前會標示時間 [mm:ss]；聲音檔是影片原聲（訪談、旁白、配樂）。看不到或聽不到的部分，請說明「無法判斷」，不要假設。

【輸出格式】只輸出 JSON：
{
  "total": 0,
  "grade": "一句話總評（例：情感真摯，但宣告不夠明確）",
  "dims": [{"id": "D1", "score": 0, "max": 20, "good": "做得好的地方", "fix": "具體怎麼改"}],
  "privacy_fail": false,
  "privacy_note": "",
  "structure": [{"act": 1, "status": "有／偏弱／缺少", "note": "簡短說明"}],
  "timeline": [{"time": "00:35", "issue": "問題", "suggest": "建議"}],
  "rewrites": [{"from": "原字卡或句子", "to": "建議改寫（可用 {r:} {b:} {p:} 標色）", "why": "理由"}],
  "top3": ["最優先要改的三件事"],
  "praise": "給組員的一句鼓勵"
}
dims 必須 5 項依序 D1～D5；total 為各項加總；腳本模式沒有時間軸時 timeline 可為空陣列。`;

  function reviewPromptText(text) {
    return `以下是組員的影片腳本／逐字稿，請依 5 大評審原則審查並輸出 JSON。\n\n${text}`;
  }

  /* ---------- Gemini 呼叫 ---------- */
  function workerUrl() {
    let u = '';
    try { u = localStorage.getItem('tengye.worker') || ''; } catch (e) {}
    return (u || (window.APP_CONFIG && window.APP_CONFIG.WORKER_URL) || '').trim();
  }

  function extractJSON(text) {
    if (!text) throw new Error('AI 沒有回覆內容');
    let t = String(text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('找不到 JSON 內容');
    t = t.slice(a, b + 1);
    try { return JSON.parse(t); }
    catch (e) {
      // 常見問題：尾端多逗號、智慧引號
      const fixed = t.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
      return JSON.parse(fixed);
    }
  }

  async function callGemini({ system, parts, temperature = 0.8, signal }) {
    const url = workerUrl();
    if (!url) throw Object.assign(new Error('尚未設定 AI'), { code: 'NO_AI' });
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature, responseMimeType: 'application/json' }
    };
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('連不上 AI 服務，請檢查網路後再試');
    }
    const raw = await res.text();
    if (!res.ok) {
      const E = m => Object.assign(new Error(m), { status: res.status });
      if (res.status === 429) throw E('AI 目前太忙（免費額度），請 1 分鐘後再試');
      if (res.status === 413) throw E('影片資料太大，請改用較短的影片');
      let msg = raw;
      try { const j = JSON.parse(raw); msg = (j.error && (j.error.message || (j.error.text && JSON.parse(j.error.text).error.message))) || raw; } catch (e) {}
      throw E('AI 服務錯誤（' + res.status + '）：' + String(msg).slice(0, 160));
    }
    let data;
    try { data = JSON.parse(raw); } catch (e) { throw new Error('AI 回覆格式異常'); }
    const cand = data.candidates && data.candidates[0];
    if (!cand) {
      const br = data.promptFeedback && data.promptFeedback.blockReason;
      throw new Error(br ? 'AI 拒絕處理此內容（' + br + '）' : 'AI 沒有回覆內容');
    }
    const text = ((cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || '').join('');
    return { json: extractJSON(text), model: res.headers.get('x-model') || '' };
  }

  async function pingWorker(url) {
    const r = await fetch(url, { method: 'GET' });
    return r.ok;
  }

  window.AI = {
    ACTS, QUESTIONS, EXAMPLE, DIMS, STRUCTURE_TEXT,
    SCRIPT_SYSTEM, REVIEW_SYSTEM,
    scriptPrompt, reviewPromptText, formToText,
    workerUrl, callGemini, extractJSON, pingWorker,
    fullScriptPrompt: f => SCRIPT_SYSTEM + '\n\n' + scriptPrompt(f),
    fullReviewPrompt: t => REVIEW_SYSTEM + '\n\n' + reviewPromptText(t)
  };
})();
