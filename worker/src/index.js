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
- Use standard USDA-style values for generic whole foods (chicken, rice, egg) WITHOUT searching.
- For SPECIFIC branded or restaurant items (e.g. "Chipotle chicken bowl", "Quest bar cookies & cream", "Chick-fil-A nuggets"), use web search to find the real published macros, then convert to the quantity eaten.
- If truly unsure, give your best estimate; never return null.
- After any searching, your FINAL message must be ONLY the JSON object, nothing else.
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
      max_tokens: 1536,
      system: FOOD_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("anthropic " + r.status + ": " + t.slice(0, 300));
  }
  const data = await r.json();
  // With web search there can be several text blocks; the JSON is in the LAST one.
  const texts = (data.content || []).filter((b) => b.type === "text" && b.text).map((b) => b.text);
  const raw = (texts.length ? texts[texts.length - 1] : "").trim();
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

const COACH_SYSTEM = `You are the AI coach built into John's personal fitness app "The Platform".
John is on an aggressive but sustainable cut: from 247 lb toward ~195, roughly 1,900 kcal and ~185g protein on training days (a bit less on rest days), high protein, lifting 3-4x/week (squat/bench/deadlift focus, meet bests 485/309/562) plus Wednesday soccer for conditioning.
You are his coach, food logger, and accountability partner. Be direct, concise, and practical - he likes casual, no fluff, action-first answers. Never lecture.

You are given, each message:
- CONTEXT: his live data. This includes his full weekly training split (CONTEXT.weeklySplit), TODAY'S exact workout with the exercises and sets (CONTEXT.todayWorkout), his profile/stats (CONTEXT.profile: start/goal/current weight, meet bests, gym 1RMs, training style), today's calories/protein/fiber and remaining, recent weights, recent lifts, Apple Health workouts, and his logging streak.
- MEMORY: durable facts he's told you before. Treat these as true and use them.

CRITICAL: You already KNOW his program and today's workout from CONTEXT.todayWorkout and CONTEXT.weeklySplit. When he asks "what's my workout today" or "what am I supposed to do", answer directly with today's actual exercises and sets from CONTEXT.todayWorkout. NEVER say you don't have his split saved - you do, it's in CONTEXT.
Write plainly in plain text. Do NOT use markdown (no **bold**, no bullets with *). Do NOT use em-dashes or en-dashes; use short sentences or commas instead.

You can take actions with tools:
- log_food: log one or more foods he says he ate (estimate macros; use web_search for specific branded/restaurant items).
- log_weight: record a bodyweight in lb.
- log_lift: record a strength set (lift name, weight lb, reps).
- remember: save a durable fact about John for the future (injuries, preferences, goals, schedule). Use this whenever he tells you something worth remembering long-term.
- web_search: look up real nutrition facts / info when useful.

Rules:
- When he clearly states he ate something, LOG it with log_food (don't just describe it). Confirm briefly in your reply.
- Use his real numbers from CONTEXT when he asks "how much protein do I have left" etc.
- Keep replies short. One or two tight paragraphs max unless he asks for detail.`;

const CHAT_TOOLS = [
  { type: "web_search_20250305", name: "web_search", max_uses: 3 },
  { name: "log_food", description: "Log food John ate to today's food log.", input_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { name: {type:"string"}, amt: {type:"string"}, cal:{type:"number"}, protein:{type:"number"}, carbs:{type:"number"}, fat:{type:"number"}, fiber:{type:"number"} }, required:["name","cal","protein"] } } }, required: ["items"] } },
  { name: "log_weight", description: "Record John's bodyweight for today.", input_schema: { type: "object", properties: { lb: {type:"number"} }, required:["lb"] } },
  { name: "log_lift", description: "Record a strength set.", input_schema: { type: "object", properties: { lift:{type:"string"}, wt:{type:"number"}, reps:{type:"number"} }, required:["lift","wt","reps"] } },
  { name: "remember", description: "Save a durable fact about John for future conversations.", input_schema: { type: "object", properties: { note:{type:"string"} }, required:["note"] } },
];
const CLIENT_TOOLS = { log_food:1, log_weight:1, log_lift:1, remember:1 };

async function anthropic(system, tools, messages, env) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env.AI_MODEL || "claude-haiku-4-5-20251001", max_tokens: 1024, system, tools, messages }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error("anthropic " + r.status + ": " + t.slice(0, 300)); }
  return r.json();
}

async function chatCoach(body, env) {
  const ctx = body.context ? ("CONTEXT (live data):\n" + JSON.stringify(body.context)) : "";
  const mem = (body.memory && body.memory.length) ? ("MEMORY (durable facts about John):\n- " + body.memory.join("\n- ")) : "";
  const system = COACH_SYSTEM + (ctx ? "\n\n" + ctx : "") + (mem ? "\n\n" + mem : "");
  const messages = (Array.isArray(body.messages) ? body.messages.slice(-24) : []).map((m) => ({ role: m.role, content: m.content }));

  const actions = [];
  let replyParts = [];
  // Agent loop: let the model call client tools (log_food/weight/lift/remember),
  // acknowledge each so its turn continues, and capture the final spoken reply.
  for (let step = 0; step < 4; step++) {
    const data = await anthropic(system, CHAT_TOOLS, messages, env);
    const blocks = data.content || [];
    const txt = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n").trim();
    if (txt) replyParts.push(txt);
    const clientCalls = blocks.filter((b) => b.type === "tool_use" && CLIENT_TOOLS[b.name]);
    if (data.stop_reason !== "tool_use" || !clientCalls.length) break;
    // record the actions for the client to actually execute
    clientCalls.forEach((b) => actions.push({ tool: b.name, input: b.input }));
    // feed the assistant turn back + acknowledge each client tool so the model can finish talking
    messages.push({ role: "assistant", content: blocks });
    messages.push({ role: "user", content: clientCalls.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "Done." })) });
  }
  return { reply: replyParts.join("\n").trim() || "Done.", actions };
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
      if (url.pathname === "/ai/chat" && request.method === "POST") {
        const body = await request.json();
        const out = await chatCoach(body, env);
        return json(out, 200, env);
      }
      if (url.pathname === "/health" && request.method === "GET") {
        // App reads Apple Health data (never writes it).
        const raw = await env.PLATFORM_STATE.get(HEALTH_KEY);
        return json(raw ? JSON.parse(raw) : {}, 200, env);
      }
      if (url.pathname === "/health" && request.method === "POST") {
        // Apple Health push. Own KV key so the app's /state sync can't overwrite it.
        // Accepts EITHER Health Auto Export's format {data:{workouts:[...],metrics:[...]}}
        // OR a simple {date,kcalToday,workout} shape (iOS Shortcut). Numbers may be strings.
        const body = await request.json();
        const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const raw = await env.PLATFORM_STATE.get(HEALTH_KEY);
        const hs = raw ? JSON.parse(raw) : {};
        const getDay = (d) => hs[d] || (hs[d] = { kcalToday: 0, workouts: [] });
        const today = new Date().toISOString().slice(0, 10);
        let touched = 0;

        if (body.data && (Array.isArray(body.data.workouts) || Array.isArray(body.data.metrics))) {
          // Health Auto Export
          (body.data.workouts || []).forEach((w) => {
            const date = String(w.start || w.end || today).slice(0, 10);
            const day = getDay(date);
            const id = String(w.id || ((w.name || "") + (w.start || "")));
            if (day.workouts.some((x) => x.id === id)) return; // dedupe re-sends
            const ae = w.activeEnergyBurned || w.activeEnergy || {};
            const dist = w.distance || w.totalDistance || w.walkingRunningDistance || null;
            const distMi = dist == null ? null : (num(dist.qty != null ? dist.qty : dist));
            day.workouts.push({
              id: id,
              type: String(w.name || "Workout").slice(0, 40),
              kcal: Math.round(num(ae.qty) || num(w.totalEnergy && w.totalEnergy.qty) || 0),
              min: Math.round((num(w.duration) || 0) / 60),
              mi: distMi != null ? Math.round(distMi * 100) / 100 : null,
              start: String(w.start || w.end || date),
              ts: Date.now()
            });
            touched++;
          });
          // daily metrics (steps, Move cal, exercise min, distance).
          // Sum THIS payload's samples per day at full precision, then SET (replace)
          // — idempotent so repeated 1-min resyncs never double-count.
          const agg = {}; // date -> {key -> sum}
          (body.data.metrics || []).forEach((m) => {
            const name = String(m.name || "").toLowerCase();
            let key = null;
            if (name === "step_count") key = "steps";
            else if (name === "active_energy") key = "move";
            else if (name === "apple_exercise_time") key = "exerciseMin";
            else if (name === "walking_running_distance") key = "distanceMi";
            if (!key) return;
            (m.data || []).forEach((pt) => {
              const q = num(pt.qty); if (q === null) return;
              const date = String(pt.date || today).slice(0, 10);
              agg[date] = agg[date] || {};
              agg[date][key] = (agg[date][key] || 0) + q;
            });
          });
          Object.keys(agg).forEach((date) => {
            const day = getDay(date); day.metrics = day.metrics || {};
            Object.keys(agg[date]).forEach((key) => { day.metrics[key] = agg[date][key]; });
            day.updated = Date.now();
          });
          // exercise calories for the day = sum of that day's workout kcal (MFP-style)
          Object.keys(hs).forEach((d) => {
            hs[d].kcalToday = (hs[d].workouts || []).reduce((a, x) => a + (x.kcal || 0), 0);
          });
        } else {
          // simple Shortcut shape
          const date = (body.date || today).slice(0, 10);
          const day = getDay(date);
          const kt = num(body.kcalToday);
          if (kt !== null) day.kcalToday = Math.round(kt);
          if (body.workout && (body.workout.type || body.workout.kcal != null)) {
            day.workouts.push({
              id: String(body.workout.id || (Date.now())),
              type: String(body.workout.type || "Workout").slice(0, 40),
              kcal: Math.round(num(body.workout.kcal) || 0),
              min: Math.round(num(body.workout.min) || 0),
              ts: Date.now()
            });
          }
          day.updated = Date.now();
          touched = 1;
        }
        await env.PLATFORM_STATE.put(HEALTH_KEY, JSON.stringify(hs));
        return json({ ok: true, imported: touched }, 200, env);
      }
      return json({ error: "not found" }, 404, env);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, env);
    }
  },
};
