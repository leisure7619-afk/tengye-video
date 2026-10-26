/**
 * 騰燁回顧影片小幫手 — Gemini 代理（Cloudflare Worker，免費方案即可）
 *
 * 需要設定：
 *   GEMINI_API_KEY   （Secret）Google AI Studio 申請的金鑰
 *   ALLOWED_ORIGINS  （變數，可不設）允許呼叫的網站，例：https://leisure7619-afk.github.io
 *   MODELS           （變數，可不設）依序嘗試的模型，逗號分隔
 *
 * 網頁送來的是完整的 Gemini generateContent 請求內容，這裡只負責加上金鑰轉送，
 * 不解析內容（免費方案 CPU 時間很短）。模型忙碌或下架時自動換下一個。
 */
const DEFAULT_MODELS = 'gemini-flash-latest,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash';
const MAX_BYTES = 90 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes('*') || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Expose-Headers': 'x-model',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET') return json({ ok: true, service: 'tengye-gemini-proxy', key: !!env.GEMINI_API_KEY }, 200);
    if (request.method !== 'POST') return json({ error: { message: 'Method not allowed' } }, 405);
    if (!okOrigin) return json({ error: { message: 'Origin not allowed' } }, 403);
    if (!env.GEMINI_API_KEY) return json({ error: { message: 'Worker 尚未設定 GEMINI_API_KEY' } }, 500);

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES) return json({ error: { message: '內容太大' } }, 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return json({ error: { message: '內容太大' } }, 413);

    const models = (env.MODELS || DEFAULT_MODELS).split(',').map(s => s.trim()).filter(Boolean);
    let last = null;
    for (const model of models) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body
      });
      if (r.ok) {
        return new Response(r.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'x-model': model } });
      }
      const text = await r.text();
      last = { status: r.status, model, text };
      // 找不到模型、額度用完、伺服器忙 → 換下一個模型
      if (![404, 429, 500, 503].includes(r.status)) break;
    }
    let message = last ? last.text : 'unknown';
    try { message = JSON.parse(last.text).error.message; } catch (e) {}
    return json({ error: { message, model: last && last.model } }, last ? last.status : 500);
  }
};
