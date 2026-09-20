/**
 * The Platform — backend API (Cloudflare Worker + KV)
 *
 * Routes (all require  Authorization: Bearer <APP_TOKEN>):
 *   GET  /state      -> returns John's saved JSON blob (or {})
 *   PUT  /state      -> saves the JSON blob (whole-document)
 *   POST /ai/parse   -> { text } -> parses a spoken/typed food entry into
 *                       structured items via Anthropic (key stays server-side)
 *   POST /ai/today   -> today's run-coach card (headline + why + call) from live data
 *
 * Strava (tokens live ONLY in KV, never on the phone):
 *   POST /strava/connect     -> { url } to send the browser to (state nonce stored in KV)
 *   GET  /strava/callback    -> Strava redirects here (no Bearer; state-checked), stores tokens,
 *                               then bounces back to the app with ?strava=connected|error
 *   GET  /strava/status      -> { connected, athlete, expiresAt }
 *   GET  /strava/activities  -> normalized activities, last N days (?days=70&force=1), 3-min KV cache
 *   POST /strava/disconnect  -> forgets the tokens
 *
 * Secrets (wrangler secret put): ANTHROPIC_API_KEY, APP_TOKEN, STRAVA_CLIENT_SECRET
 * Vars (wrangler.toml): ALLOWED_ORIGIN, AI_MODEL, COACH_MODEL (optional), STRAVA_CLIENT_ID, APP_URL
 */

const STATE_KEY = "state:john";
const HEALTH_KEY = "health:john"; // separate store: Shortcut writes, app only reads
const BRAIN_KEY = "brain:john";   // Rocky's coach-brain (markdown pushed from John's Mac; injected into every coach call, prompt-cached)
const STRAVA_KEY = "strava:john"; // OAuth tokens (access/refresh/expires_at)
const STRAVA_ACTS = "strava:acts"; // short-lived cache of normalized activities
const STRAVA_CACHE_MS = 3 * 60 * 1000;

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

const COACH_SYSTEM = `You are Rocky, John's personal AI, living inside his fitness app "The Platform". You are the same Rocky he talks to on his computer: you know his life, school, career, money habits and training (ROCKY'S BRAIN below), and you carry that into every answer here. Never say you are "just a fitness coach" or that you don't know him.
John is on an aggressive but sustainable cut: from 247 lb toward ~195, roughly 1,900 kcal and ~185g protein on training days (a bit less on rest days), high protein, lifting 3-4x/week (squat/bench/deadlift background, meet bests 485/309/562) plus soccer (usually Wednesday) for conditioning.
His lifting is FREEFORM: there is no fixed weekday split. Each day he picks what he is training (Push, Pull, Legs, Shoulders & Arms, Full body, Soccer, or Rest) and logs exercises with rep ranges as he goes or afterward. CONTEXT.todayWorkout is what he picked and logged today (or "Not chosen yet"); CONTEXT.recentSessions is what he actually trained over the last ~10 days. Never tell him a weekday "should" be a certain day. Instead help him balance the week from recentSessions (e.g. three push days and no pull yet, say so) and fit lifting around the run plan (heavy legs the day before a long run is a bad idea; say so). When he asks what to train today and nothing is chosen, suggest the kind that balances his recent work and the run plan, then let him pick.
You are his coach, food logger, and accountability partner. Be direct, concise, and practical - he likes casual, no fluff, action-first answers. Never lecture.

You are ALSO his running coach. He is a hybrid athlete training for the Invesco QQQ Thanksgiving Half Marathon on Thu Nov 26 2026 (ran it in 2025: 2:40:50, 11:11/mi). His stated goal is to FINISH strong knowing he put in the work, not a PR. Tune-up races: Miche 5K Oct 18, PNC Atlanta 10 Miler Oct 24, Dia de Muertos 5K Oct 31. His 10-week plan runs 3 days a week: Monday easy, Thursday quality (tempo or strides), Saturday long, with Sunday legs and Wednesday soccer kept. CONTEXT.running gives you the plan week, this week's runs with done flags auto-matched from Strava, today's planned run, his recent Strava activities of every type, weekly mileage, consecutive training days, and today's feel check-in.
Running rules you coach by: he tends to OVERTRAIN and UNDER-EAT, so protect rest and food. Six or more consecutive training days means tell him to take a rest or genuinely easy day. On his cut do not add carb fuel for runs under about 75 minutes; electrolytes are fine and encouraged (he cramps at soccer). Only long runs past 90 minutes may take a little fuel. If he says he feels wrecked, slept badly, or is cramping, downgrade the day without guilt. Treat Soccer as its own thing, not a run. Ignore GPS-glitch activities (paces faster than 5:00/mi or slower than 20:00/mi). When his lifting and running collide on a day, tell him which to keep and how to make the other easier.

TIME: CONTEXT.now is the current local date and time in Atlanta. Every user message is prefixed with [the time he sent it]. Use those, never guess what day it is or when he ate, trained, or slept. If a message is from a previous day, treat it as history, not as today.

You are given, each message:
- CONTEXT: his live data. This includes today's chosen workout and logged exercises (CONTEXT.todayWorkout), his last ~10 days of lifting (CONTEXT.recentSessions), his running plan and Strava data (CONTEXT.running), his profile/stats (CONTEXT.profile: start/goal/current weight, meet bests, gym 1RMs, training style), today's calories/protein/fiber and remaining, recent weights, recent lifts, Apple Health workouts, and his logging streak.
- MEMORY: durable facts he's told you before. Treat these as true and use them.

When he asks "what's my workout today": if CONTEXT.todayWorkout has a chosen kind, answer with what he has logged and what would round it out; if it says "Not chosen yet", recommend a kind based on CONTEXT.recentSessions and the run plan, in one or two sentences, and let him choose. Never claim he has a fixed program.
Write plainly in plain text. Do NOT use markdown (no **bold**, no bullets with *). Do NOT use em-dashes or en-dashes; use short sentences or commas instead.

You can take actions with tools:
- log_food: log one or more foods he says he ate (estimate macros; use web_search for specific branded/restaurant items).
- log_weight: record a bodyweight in lb.
- log_lift: record a strength set (lift name, weight lb, reps).
- remember: save a durable fact about John for the future (injuries, preferences, goals, schedule). Use this whenever he tells you something worth remembering long-term.
- log_feel: record how he feels today (wrecked / tired / good / great, plus tags like sore legs, slept bad, cramping) when he tells you. The run coach card uses it.
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
  { name: "log_feel", description: "Record how John feels today for the run coach.", input_schema: { type: "object", properties: { mood:{type:"string", enum:["wrecked","tired","good","great"]}, tags:{type:"array", items:{type:"string"}} }, required:["mood"] } },
];
const CLIENT_TOOLS = { log_food:1, log_weight:1, log_lift:1, remember:1, log_feel:1 };

// Coach-facing calls (chat + today card) can run on a stronger model than food parsing.
function coachModel(env) { return env.COACH_MODEL || env.AI_MODEL || "claude-haiku-4-5-20251001"; }

// `system` may be a string or an array of text blocks (so the big, stable brain block can carry cache_control).
async function anthropic(system, tools, messages, env, opts) {
  const o = opts || {};
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: o.model || env.AI_MODEL || "claude-haiku-4-5-20251001", max_tokens: o.maxTokens || 1024, system, tools, messages }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error("anthropic " + r.status + ": " + t.slice(0, 300)); }
  return r.json();
}

// Rocky's brain: stable across a day, so it goes first and is prompt-cached; the live per-message bits follow uncached.
async function loadBrain(env) { return (await env.PLATFORM_STATE.get(BRAIN_KEY)) || ""; }
function systemWithBrain(base, brain, live) {
  const blocks = [{ type: "text", text: base }];
  if (brain) blocks.push({ type: "text", text: "ROCKY'S BRAIN (what you already know about John; treat as true, current as of its sync):\n\n" + brain, cache_control: { type: "ephemeral" } });
  if (live) blocks.push({ type: "text", text: live });
  return blocks;
}

/* ---------------- Strava ---------------- */
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

function normAct(a) {
  const mi = (a.distance || 0) / 1609.34;
  const secs = a.moving_time || 0;
  return {
    id: a.id,
    name: String(a.name || "").slice(0, 60),
    type: String(a.sport_type || a.type || "Workout"),
    date: String(a.start_date_local || a.start_date || "").slice(0, 10),
    start: a.start_date_local || a.start_date || null,
    mi: Math.round(mi * 100) / 100,
    min: Math.round(secs / 6) / 10,
    paceSec: mi > 0.1 ? Math.round(secs / mi) : null,
    hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    elevFt: Math.round((a.total_elevation_gain || 0) * 3.281),
    suffer: a.suffer_score || null,
    kj: a.kilojoules || null,
    device: a.device_name || null,
  };
}

// Returns the stored token set, refreshing it first if it is (about to be) expired.
async function stravaToken(env) {
  const raw = await env.PLATFORM_STATE.get(STRAVA_KEY);
  if (!raw) return null;
  let t = JSON.parse(raw);
  if (((t.expires_at || 0) * 1000) < Date.now() + 60 * 1000) {
    const r = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: t.refresh_token }),
    });
    if (!r.ok) throw new Error("strava refresh " + r.status + ": " + (await r.text()).slice(0, 200));
    const n = await r.json();
    t = { ...t, access_token: n.access_token, refresh_token: n.refresh_token || t.refresh_token, expires_at: n.expires_at };
    await env.PLATFORM_STATE.put(STRAVA_KEY, JSON.stringify(t));
  }
  return t;
}

function athleteOf(t) {
  const a = (t && t.athlete) || null;
  return a ? { id: a.id, name: [a.firstname, a.lastname].filter(Boolean).join(" ").trim() } : null;
}

async function stravaActivities(env, days, force) {
  if (!force) {
    const raw = await env.PLATFORM_STATE.get(STRAVA_ACTS);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - (c.fetchedAt || 0) < STRAVA_CACHE_MS && (c.days || 0) >= days) return c;
    }
  }
  const t = await stravaToken(env);
  if (!t) return null;
  const after = Math.floor((Date.now() - days * 86400000) / 1000);
  const acts = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch("https://www.strava.com/api/v3/athlete/activities?" + new URLSearchParams({ after: String(after), per_page: "100", page: String(page) }),
      { headers: { Authorization: "Bearer " + t.access_token } });
    if (r.status === 401) { await env.PLATFORM_STATE.delete(STRAVA_KEY); throw new Error("strava token rejected; reconnect"); }
    if (!r.ok) throw new Error("strava " + r.status + ": " + (await r.text()).slice(0, 200));
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    batch.forEach((a) => acts.push(normAct(a)));
    if (batch.length < 100) break;
  }
  acts.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  const out = { connected: true, fetchedAt: Date.now(), days, athlete: athleteOf(t), acts };
  await env.PLATFORM_STATE.put(STRAVA_ACTS, JSON.stringify(out));
  return out;
}

const TODAY_SYSTEM = `You are Rocky, John's personal AI, writing the ONE card he reads before training today inside his app "The Platform". Use everything in ROCKY'S BRAIN (his life, school load, sleep, eating, how he is doing) plus today's DATA.
He is a hybrid athlete on a cut (about 1,900 kcal, high protein). Lifting is freeform 3-4x/week (he picks push / pull / legs / arms / full day by day; DATA.lifting shows today's pick and his recent days), soccer usually Wednesday, and he follows a 10-week run plan (Mon easy, Thu quality, Sat long) toward the Thanksgiving Half Marathon on Thu Nov 26 2026. Goal: finish strong, not a PR (2025: 2:40:50).
He tends to overtrain and under-eat. Protect rest and food. Six or more consecutive training days means prescribe rest or truly easy. If he feels wrecked, slept badly, or is cramping, downgrade the day without guilt. No carb fuel for runs under ~75 min on the cut; electrolytes yes. Treat soccer separately from runs. Ignore GPS glitches.
Use the DATA you are given. Refer to his actual numbers (miles, paces, streak, what he ate) when they matter. Plain text only: no markdown, no dashes, no emoji.
Return ONLY a JSON object shaped exactly:
{"headline": string (max 60 chars, what to do today, e.g. "Easy 3 miles, keep it conversational"), "why": string (1 or 2 short sentences tying it to his data), "call": "go" | "easy" | "rest" | "swap" | "race" | "done"}
"call" meaning: go = do the planned session as written; easy = do it but easier/shorter; rest = skip today, recover; swap = do something different than planned (say what in headline); race = it is a race day; done = today's run is already logged, so the card is a debrief plus what tomorrow needs.`;

async function coachToday(body, env) {
  const brain = await loadBrain(env);
  const data = await anthropic(systemWithBrain(TODAY_SYSTEM, brain, ""), [], [{ role: "user", content: "DATA:\n" + JSON.stringify(body) + "\n\nWrite the card." }], env, { model: coachModel(env), maxTokens: 400 });
  const texts = (data.content || []).filter((x) => x.type === "text" && x.text).map((x) => x.text);
  const raw = (texts.length ? texts[texts.length - 1] : "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  let parsed = null;
  try { parsed = JSON.parse(m ? m[0] : raw); } catch (e) {}
  if (!parsed || !parsed.headline) throw new Error("coach returned no card");
  const calls = { go:1, easy:1, rest:1, swap:1, race:1, done:1 };
  const noDash = (s) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+-\s+/g, ", "); // John: no dashes
  return { headline: noDash(parsed.headline).slice(0, 80), why: noDash(parsed.why).slice(0, 320), call: calls[parsed.call] ? parsed.call : "go" };
}

async function chatCoach(body, env) {
  const ctx = body.context ? ("CONTEXT (live data):\n" + JSON.stringify(body.context)) : "";
  const mem = (body.memory && body.memory.length) ? ("MEMORY (durable facts about John):\n- " + body.memory.join("\n- ")) : "";
  const toneLine = body.tone === "direct"
    ? "\n\nTONE: Direct. Be blunt and concise, no fluff, no cheerleading. Get to the point in as few words as possible."
    : "\n\nTONE: Encouraging. Be warm, supportive and motivating, while still concrete.";
  const brain = await loadBrain(env);
  const system = systemWithBrain(COACH_SYSTEM, brain, [ctx, mem].filter(Boolean).join("\n\n") + toneLine);
  const messages = (Array.isArray(body.messages) ? body.messages.slice(-24) : []).map((m) => ({ role: m.role, content: m.content }));

  const actions = [];
  let replyParts = [];
  // Agent loop: let the model call client tools (log_food/weight/lift/remember),
  // acknowledge each so its turn continues, and capture the final spoken reply.
  for (let step = 0; step < 4; step++) {
    const data = await anthropic(system, CHAT_TOOLS, messages, env, { model: coachModel(env) });
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

    // Strava sends the browser here after Authorize. No Bearer header is possible on a
    // redirect, so the one-time `state` nonce we minted in /strava/connect is the auth.
    if (url.pathname === "/strava/callback" && request.method === "GET") {
      const appUrl = (env.APP_URL || "https://jozuna19.github.io/the-platform/");
      const bounce = (q) => Response.redirect(appUrl + "?strava=" + q, 302);
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      if (url.searchParams.get("error") || !code || !state) return bounce("error");
      const ok = await env.PLATFORM_STATE.get("strava:state:" + state);
      if (!ok) return bounce("error");
      await env.PLATFORM_STATE.delete("strava:state:" + state);
      try {
        const r = await fetch(STRAVA_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, code, grant_type: "authorization_code" }),
        });
        if (!r.ok) return bounce("error");
        const tok = await r.json();
        await env.PLATFORM_STATE.put(STRAVA_KEY, JSON.stringify(tok));
        await env.PLATFORM_STATE.delete(STRAVA_ACTS);
        return bounce("connected");
      } catch (e) { return bounce("error"); }
    }

    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401, env);

    try {
      if (url.pathname === "/strava/connect" && request.method === "POST") {
        if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return json({ error: "strava not configured" }, 500, env);
        const state = crypto.randomUUID();
        await env.PLATFORM_STATE.put("strava:state:" + state, "1", { expirationTtl: 600 });
        const authUrl = "https://www.strava.com/oauth/authorize?" + new URLSearchParams({
          client_id: env.STRAVA_CLIENT_ID, redirect_uri: url.origin + "/strava/callback",
          response_type: "code", approval_prompt: "auto", scope: "read,activity:read_all", state,
        });
        return json({ url: authUrl }, 200, env);
      }
      if (url.pathname === "/strava/status" && request.method === "GET") {
        const raw = await env.PLATFORM_STATE.get(STRAVA_KEY);
        if (!raw) return json({ connected: false }, 200, env);
        const t = JSON.parse(raw);
        return json({ connected: true, athlete: athleteOf(t), expiresAt: t.expires_at || null }, 200, env);
      }
      if (url.pathname === "/strava/activities" && request.method === "GET") {
        const days = Math.min(400, Math.max(7, parseInt(url.searchParams.get("days") || "70", 10) || 70));
        const force = url.searchParams.get("force") === "1";
        const out = await stravaActivities(env, days, force);
        return json(out || { connected: false }, 200, env);
      }
      if (url.pathname === "/strava/disconnect" && request.method === "POST") {
        await env.PLATFORM_STATE.delete(STRAVA_KEY);
        await env.PLATFORM_STATE.delete(STRAVA_ACTS);
        return json({ ok: true }, 200, env);
      }
      if (url.pathname === "/brain" && request.method === "PUT") {
        // Rocky (desktop) pushes the coach-brain markdown. Plain text body; capped so a bad push can't blow up the prompt.
        const text = (await request.text()).slice(0, 60000);
        await env.PLATFORM_STATE.put(BRAIN_KEY, text);
        return json({ ok: true, chars: text.length, savedAt: new Date().toISOString() }, 200, env);
      }
      if (url.pathname === "/brain" && request.method === "GET") {
        const text = await loadBrain(env);
        return json({ chars: text.length, text }, 200, env);
      }
      if (url.pathname === "/ai/today" && request.method === "POST") {
        const body = await request.json();
        const card = await coachToday(body, env);
        return json(card, 200, env);
      }
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
      if (url.pathname === "/ai/digest" && request.method === "POST") {
        const s = await request.json();
        const sys = `You are John's fitness coach. He's on a CUT (247 -> ~195 lb, high protein, ~1900 kcal/186g protein training days). A healthy cut loses about 1-2 lb/week.
Here are his last-7-days stats: ${JSON.stringify(s)}.
Write a weekly check-in in EXACTLY these three labeled sections, plain text, no markdown, no dashes. Restrained coach voice, not hype. Under 140 words total:

TARGETS
State whether to change his calorie/protein targets and by how much, with a one-line reason tied to his weight trend and adherence. If progress is on track, explicitly say to stay the course and keep targets the same (a no-change is a valid, good answer).

WEEK IN REVIEW
His average intake vs his targets and his weight change this week, side by side in words. Note protein consistency and logging adherence (days logged / 7).

FOCUS
One clear, specific thing to focus on next week.

Put each section header on its own line followed by its text.`;
        const data = await anthropic(sys, [], [{ role: "user", content: "Write the recap." }], env);
        const texts = (data.content || []).filter((x) => x.type === "text" && x.text).map((x) => x.text);
        return json({ text: (texts.join("\n") || "").trim() || "No recap available." }, 200, env);
      }
      if (url.pathname === "/ai/suggest" && request.method === "POST") {
        const b = await request.json();
        const sys = `You are a strength coach. The athlete is on a CUT (247->195 lb, high protein), lifting with a squat/bench/deadlift focus.
Today is a ${String(b.dayType || "upper").toUpperCase()} day ("${b.dayName || ""}"). Focus: ${b.focus || ""}.
They have already got these exercises in today's session: ${(b.done || []).join(", ") || "none yet"}.
Suggest 1-2 additional exercises that fit a ${String(b.dayType || "upper")} day and complement (not duplicate) what they've done, biased toward hypertrophy on a cut.
Return ONLY JSON: {"suggestions":[{"name":string,"scheme":"3 × 10","why":"short reason"}]}. No prose.`;
        const data = await anthropic(sys, [], [{ role: "user", content: "Suggest now." }], env);
        const texts = (data.content || []).filter((x) => x.type === "text" && x.text).map((x) => x.text);
        const raw = (texts.length ? texts[texts.length - 1] : "").trim();
        const m = raw.match(/\{[\s\S]*\}/);
        let parsed = { suggestions: [] };
        try { parsed = JSON.parse(m ? m[0] : raw); } catch (e) {}
        return json({ suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 2) : [] }, 200, env);
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
          // HAE sends per-sample points, and incremental syncs send only NEW samples.
          // So we DEDUPE by each sample's own timestamp and SUM the unique ones:
          // - accumulates across delta pushes (fixes "stale/low numbers")
          // - a re-sent sample overwrites the same key, so no double-counting.
          const touchedDays = {};
          (body.data.metrics || []).forEach((m) => {
            const name = String(m.name || "").toLowerCase();
            let key = null;
            if (name === "step_count") key = "steps";
            else if (name === "active_energy") key = "move";
            else if (name === "apple_exercise_time") key = "exerciseMin";
            else if (name === "walking_running_distance") key = "distanceMi";
            if (!key) return;
            (m.data || []).forEach((pt, idx) => {
              const q = num(pt.qty); if (q === null) return;
              const stamp = String(pt.date || pt.start || "");
              const date = (stamp || today).slice(0, 10);
              const day = getDay(date);
              day.samples = day.samples || {};
              day.samples[key] = day.samples[key] || {};
              day.samples[key][stamp || (key + idx)] = q; // upsert by sample timestamp
              touchedDays[date] = true;
            });
          });
          // recompute each touched day's metric totals from its unique samples
          Object.keys(touchedDays).forEach((date) => {
            const day = getDay(date); day.metrics = day.metrics || {};
            Object.keys(day.samples || {}).forEach((key) => {
              let s = 0; const bag = day.samples[key];
              Object.keys(bag).forEach((id) => { s += bag[id]; });
              day.metrics[key] = s;
            });
            day.updated = Date.now();
          });
          // prune sample bags older than 4 days to keep the store small
          const cut = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
          Object.keys(hs).forEach((d) => { if (d < cut && hs[d]) delete hs[d].samples; });
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
