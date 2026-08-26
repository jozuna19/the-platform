/**
 * The Platform — backend API (Cloudflare Worker + KV)
 *
 * Routes (all require  Authorization: Bearer <APP_TOKEN>):
 *   GET  /state      -> returns John's saved JSON blob (or {})
 *   PUT  /state      -> saves the JSON blob (whole-document)
 *   POST /ai/parse   -> { text } -> parses a spoken/typed food entry into
 *                       structured items via Anthropic (key stays server-side)
 *
 * Secrets (wrangler secret put): ANTHROPIC_API_KEY, APP_TOKEN
 * Vars (wrangler.toml): ALLOWED_ORIGIN, AI_MODEL
 */

const STATE_KEY = "state:john";
const HEALTH_KEY = "health:john"; // separate store: Shortcut writes, app only reads

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...cors(env) },
  });
}

function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  const sent = h.replace(/^Bearer\s+/i, "");
  const want = env.APP_TOKEN || "";
  // length-safe compare
  if (!want || sent.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

const FOOD_SYSTEM = `You convert a person's plain-language description of what they ate into structured nutrition data.
Return ONLY a JSON object, no prose, shaped exactly:
{"items":[{"name":string,"qty":number,"unit":string,"cal":number,"protein":number,"carbs":number,"fat":number,"fiber":number}]}
Rules:
- One entry per distinct food. Use the quantity the person states; if they say "a cup", "8 oz", "half of it", estimate grams sensibly and put the human-readable amount in "unit".
- Meat weights are RAW unless they say cooked; rice/pasta are COOKED unless they say dry.
- All macro numbers are for the stated quantity (not per 100g). Round cal to nearest 5, macros to nearest 1.
- Use standard USDA-style values. If truly unsure, give your best estimate; never return null.
- If the text names no food, return {"items":[]}.`;

async function parseFood(text, env) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.AI_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: FOOD_SYSTEM,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("anthropic " + r.status + ": " + t.slice(0, 300));
  }
  const data = await r.json();
  const raw = (data.content || []).map((b) => b.text || "").join("").trim();
  // pull the JSON object out even if the model wraps it
  const m = raw.match(/\{[\s\S]*\}/);
  let parsed;
  try {
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    throw new Error("could not parse model output: " + raw.slice(0, 200));
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname === "/healthz") return json({ ok: true }, 200, env);

    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401, env);

    try {
      if (url.pathname === "/state" && request.method === "GET") {
        const v = await env.PLATFORM_STATE.get(STATE_KEY);
        return json(v ? JSON.parse(v) : {}, 200, env);
      }
      if (url.pathname === "/state" && request.method === "PUT") {
        const body = await request.text();
        JSON.parse(body); // validate
        await env.PLATFORM_STATE.put(STATE_KEY, body);
        return json({ ok: true, savedAt: new Date().toISOString() }, 200, env);
      }
      if (url.pathname === "/ai/parse" && request.method === "POST") {
        const { text } = await request.json();
        if (!text || !text.trim()) return json({ items: [] }, 200, env);
        const items = await parseFood(text.trim(), env);
        return json({ items }, 200, env);
      }
      if (url.pathname === "/health" && request.method === "GET") {
        // App reads Apple Health data (never writes it).
        const raw = await env.PLATFORM_STATE.get(HEALTH_KEY);
        return json(raw ? JSON.parse(raw) : {}, 200, env);
      }
      if (url.pathname === "/health" && request.method === "POST") {
        // Apple Health push from an iOS Shortcut (workout-ends automation).
        // Own KV key so the app's /state sync can never overwrite it.
        // Accepts { date?, kcalToday?, workout?:{type,kcal,min} } — numbers may
        // arrive as strings from Shortcuts, so coerce defensively.
        const body = await request.json();
        const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const raw = await env.PLATFORM_STATE.get(HEALTH_KEY);
        const hs = raw ? JSON.parse(raw) : {};
        const date = (body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const day = hs[date] || (hs[date] = { kcalToday: 0, workouts: [] });
        const kt = num(body.kcalToday);
        if (kt !== null) day.kcalToday = Math.round(kt);
        if (body.workout && (body.workout.type || body.workout.kcal != null)) {
          day.workouts.push({
            type: String(body.workout.type || "Workout").slice(0, 40),
            kcal: Math.round(num(body.workout.kcal) || 0),
            min: Math.round(num(body.workout.min) || 0),
            ts: Date.now()
          });
        }
        day.updated = Date.now();
        await env.PLATFORM_STATE.put(HEALTH_KEY, JSON.stringify(hs));
        return json({ ok: true, date: date, day: day }, 200, env);
      }
      return json({ error: "not found" }, 404, env);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, env);
    }
  },
};
