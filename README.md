# 騰燁・回顧影片小幫手

南山人壽騰燁通訊處組員用的「晉升回顧暨下階宣告影片」網頁工具，手機就能操作。

**網址：** https://leisure7619-afk.github.io/tengye-video/

## 三個步驟

1. **寫故事**：回答 8 題白話文 → AI 依「騰燁 6 幕三明治結構」寫出分鏡、黑底字卡、訪談題目。
2. **做影片**：
   - **🪄 AI 自動剪輯**：所有照片、訪談、加油影片一次選進來 → AI 逐支看畫面、聽訪談，挑出精華片段、猜說話者，排成 6 幕並配字卡。組員只需確認人物、檢查字卡、選配樂、預覽。素材存在手機（IndexedDB），關掉網頁再回來還在。
   - 也可以手動：每一幕放照片／影片、選配樂 → 手機上直接合成 MP4（黑底字卡、重點標色、照片緩慢推移、訪談時配樂自動變小聲、加油快剪、下階宣告）。素材只在手機處理，不會上傳。
3. **評審**：上傳完成影片或貼腳本 → AI 依「5 大評審原則」100 分制打分，給字卡改寫建議（個資一票否決）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` / `style.css` | 頁面 |
| `app.js` | 介面流程 |
| `ai.js` | 騰燁 6 幕結構、5 大評審原則、Prompt |
| `render.js` | 瀏覽器內影片合成（Canvas＋Web Audio＋MediaRecorder） |
| `review.js` | 影片抽影格＋聲音給 AI 評審 |
| `autoedit.js` | AI 自動剪輯：素材分析與排片 |
| `store.js` | 素材保存在手機（IndexedDB） |
| `config.js` | AI 服務網址（`WORKER_URL`） |
| `worker/worker.js` | Cloudflare Worker：保管 Gemini 金鑰並轉送 |

## 接上 AI（免費 Gemini，管理者做一次）

沒接 AI 也能用：寫故事會改成「複製 Prompt 貼到 ChatGPT／Gemini」模式。

1. **拿 Gemini 金鑰**：手機開 https://aistudio.google.com/apikey → Create API key → 複製。
2. **建 Worker**：開 https://dash.cloudflare.com → Workers & Pages → Create → Start with Hello World → 名稱填 `tengye-ai` → Deploy。
3. **貼程式**：Edit code → 全部刪掉，貼上 `worker/worker.js` 的內容 → Deploy。
4. **放金鑰**：Worker 的 Settings → Variables and Secrets → Add → 類型選 **Secret**，名稱 `GEMINI_API_KEY`，值貼金鑰 → Deploy。
5. **（建議）限制來源**：再加一個 Text 變數 `ALLOWED_ORIGINS` = `https://leisure7619-afk.github.io`。
6. 把 Worker 網址（例：`https://tengye-ai.xxx.workers.dev`）填進 `config.js` 的 `WORKER_URL`。

## 注意

- 輸出影片時間約等於影片長度，過程中請保持螢幕開啟、不要切換 App。
- iPhone 輸出 MP4；Android 新版 Chrome 也是 MP4，舊版會是 WebM。
- 免費版 Gemini 的輸入可能被 Google 用於改善模型；評審前請確認畫面中沒有可辨識的客戶資料。
- 配樂請使用有授權的音樂。
