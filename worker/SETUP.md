# The Platform — backend setup (one-time)

Run these from `~/Claude/the-platform/worker`. Rocky will drive most of it; the
two things only you can do are logging into Cloudflare and pasting your API key.

## 1. Log in to Cloudflare  (YOU — opens a browser)
```bash
cd ~/Claude/the-platform/worker
npx wrangler login
```
Create a free account if you don't have one, then approve access.

## 2. Create the KV store  (Rocky can run after you're logged in)
```bash
npx wrangler kv namespace create PLATFORM_STATE
```
Copy the printed `id` into `wrangler.toml` (replaces `REPLACE_AFTER_KV_CREATE`).

## 3. Set the secrets  (YOU paste values at the prompt — never in a file)
```bash
npx wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key
npx wrangler secret put APP_TOKEN           # paste a long random string (Rocky will generate one)
```
The APP_TOKEN is just a password the app sends so only you can use the backend.

## 4. Deploy
```bash
npx wrangler deploy
```
Gives you a URL like `https://the-platform-api.<subdomain>.workers.dev`.
That URL + the APP_TOKEN get wired into the app.

## 5. Smoke test
```bash
TOK="<your APP_TOKEN>"
API="https://the-platform-api.<subdomain>.workers.dev"
curl -s "$API/healthz"
curl -s -X PUT "$API/state" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"hello":"world"}'
curl -s "$API/state" -H "Authorization: Bearer $TOK"
curl -s -X POST "$API/ai/parse" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"text":"8 oz chicken breast and a cup of white rice"}'
```
The last call should return structured food items with calories + protein.

## Security notes
- Your Anthropic key lives ONLY as a Worker secret. It is never in the repo,
  never in the app's code, never sent to your phone. The phone calls the Worker;
  the Worker calls Anthropic.
- The app stores only the APP_TOKEN + the API URL on your device.
