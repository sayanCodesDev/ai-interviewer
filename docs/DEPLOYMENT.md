# Deploying AI Interviewer

Three moving parts: a **static website** (Netlify, Cloudflare Pages, nginx), an **API server** (Node, needs Docker and UDP), and **PostgreSQL** (Neon or your own). Two services you rent: a language model (Groq by default) and Deepgram for speech.

Read [Things that trip people up](#things-that-trip-people-up) before you go live. Every one of them has cost someone an afternoon.

## Environment

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.production`. Every variable is documented in those files. In production the API **refuses to start** if a required one is missing or unsafe (a short `JWT_SECRET`, no `ALLOWED_ORIGINS`, `VOICE_MODE=text`, the unsandboxed code runner, no model or speech key), and tells you which.

The ones you must set:

| Where | Variable | Notes |
|---|---|---|
| API | `DATABASE_URL` | Neon: use the pooled (`-pooler`) string |
| API | `JWT_SECRET` | `openssl rand -hex 32` |
| API | `ALLOWED_ORIGINS` | Your website's origin, e.g. `https://app.example.com` |
| API | `GROQ_API_KEY`, `DEEPGRAM_API_KEY` | Free Groq keys are too small for real traffic (see the README) |
| API | `WEBRTC_PUBLIC_IP`, `WEBRTC_PORT_MIN/MAX` | See [WebRTC](#webrtc-and-firewalls) |
| API | `TRUST_PROXY` | `1` behind nginx or a load balancer, so rate limits see real client IPs |
| Site | `VITE_BACKEND_URL` | The API's `https://` origin |
| Site | `VITE_SITE_URL` | The website's public origin. Without it canonicals, the sitemap and link previews point at `ai-interviewer.example.com`. The build warns. |

## Database

`npm start` (and `npm run dev`) run `prisma migrate deploy` before the server starts. It applies only migrations that are missing, in order, and never resets or drops anything. Run it by hand with `npm run db:migrate:deploy`.

If the code is newer than the database, the server **refuses to start** and names the missing migrations, and `/readyz` returns 503 with `database_schema_outdated`. You should never see a raw "table does not exist" error; if a database problem slips through at run time, callers get a plain 503 and the details stay in the server log.

Before the first deploy that lowercases emails (migration `20260926121353`), the migration itself checks for accounts that differ only by letter case and aborts, rolling back, if it finds any. Resolve them and run it again.

Connection budget: `instances × DATABASE_POOL_MAX` must stay under your database's limit (Neon's pooler makes this generous).

## The code sandbox

Every code run starts a throwaway container from `ai-interviewer-runner:latest`. Build it once on the machine that runs the API:

```bash
docker build -t ai-interviewer-runner:latest backend/runner
```

Each run gets `--network none`, memory, CPU and process limits, a read-only root, a small tmpfs, all capabilities dropped, no-new-privileges and an unprivileged user. The payload travels over stdin (nothing is mounted), so it works when the API itself is in a container.

**Giving the API access to Docker is a real trust decision.** Anything that can start containers on a host controls that host. Choose one:

1. **Run the API directly on a VM** (systemd or PM2) that has Docker installed. The API's user needs to be in the `docker` group. Simple; the VM is the trust boundary.
2. **Docker Compose with the socket proxy** in `docker-compose.yml`. The API talks to Docker through `tecnativa/docker-socket-proxy`, which only allows the container calls a sandbox run needs. That guards against accidents, not against a compromised API, which could still ask for a privileged container. Treat the host as sacrificial.
3. **Move the runner off the API host** (a small VM that only runs sandboxes). The runner is written so this is a change to `src/runner/`, not a redesign; it isn't built yet.

`CODE_RUNNER=local` runs candidate code on the machine with no isolation. It exists for development; production refuses it.

## WebRTC and firewalls

The browser connects to the API with WebRTC: signalling over HTTPS, then audio over UDP. On a cloud VM the server sits behind NAT, so it must be told what address browsers can reach:

```
WEBRTC_PUBLIC_IP=<the VM's public IPv4>
WEBRTC_PORT_MIN=10000
WEBRTC_PORT_MAX=10199        # about one port per simultaneous call, plus headroom
```

Open **exactly that UDP range** in the firewall or security group, plus TCP 443 (or your API port) for HTTPS. On AWS, add an inbound rule for custom UDP 10000–10199 from anywhere.

Some corporate networks block UDP entirely. A TURN relay would be needed for those candidates; it isn't included. `STUN_URLS` is available for setups that need STUN.

If people can sign in and start an interview but "can't be heard", look for `Microphone audio is arriving` in the API log for that call. If it never appears, the media path is blocked (UDP range, `WEBRTC_PUBLIC_IP`), not speech recognition.

## HTTPS and cookies

The refresh token lives in an httpOnly cookie scoped to `/api/auth`. Browsers only send it when the site and the API are **the same site**. That decides your layout:

- **Recommended: same site.** Website at `app.example.com`, API at `api.example.com`. Set `COOKIE_SAMESITE=lax`, `COOKIE_DOMAIN=.example.com`, `ALLOWED_ORIGINS=https://app.example.com`, `VITE_BACKEND_URL=https://api.example.com`.
- **Cross-site** (for example `something.netlify.app` calling an API on your own domain) needs `COOKIE_SAMESITE=none` and HTTPS on the API, and Safari's tracking protection may still drop the cookie so people are signed out on every reload. Avoid it. A custom domain on Netlify costs nothing and avoids the problem.

The API must be served over **HTTPS** when the website is: a page on `https://` can't call an `http://` API (mixed content), and cookies marked Secure need it. A bare `http://<ip>:2000` API works only with an `http://` website.

## Route A: EC2 + PM2 + Netlify

This is the route the project started on. What changed from the old guide:

1. **On the instance:** install Node 22, Docker, and PM2.
   ```bash
   sudo apt update && sudo apt install -y docker.io
   sudo usermod -aG docker $USER      # log out and back in
   npm install -g pm2
   ```
2. **Get the code and build the sandbox image:**
   ```bash
   git clone <your repo> && cd ai-interviewer/backend
   docker build -t ai-interviewer-runner:latest runner
   npm ci                              # also generates the Prisma client
   ```
3. **Create `backend/.env`** from `.env.example` (see [Environment](#environment)). Set `NODE_ENV=production`.
4. **Start it.** `npm start` applies migrations first:
   ```bash
   pm2 start npm --name ai-interviewer-api --kill-timeout 65000 -- start
   pm2 save && pm2 startup
   ```
   `--kill-timeout 65000` lets a restart drain live calls (the server waits up to 60 s for them to finish).
5. **HTTPS in front of it.** nginx or Caddy on 443, proxying to `localhost:2000`, with a certificate from Let's Encrypt. Set `TRUST_PROXY=1`. The old guide's nginx block still applies.
6. **Security group:** TCP 443 (and 80 for certificate renewal), UDP for the WebRTC range, and nothing else. Port 2000 does not need to be public any more.
7. **Website:** in `frontend/.env.production` set `VITE_BACKEND_URL` and `VITE_SITE_URL`, then `bun run build` and deploy `dist/`. Netlify reads `dist/_redirects` (real pages are files; app routes get the app shell; anything else is a real 404) and `dist/_headers` (the Content-Security-Policy and caching). Other static hosts need the equivalent rules: `frontend/nginx.conf` states them in nginx syntax, and `dist/404.html` is the not-found page.
8. Add the site's origin to `ALLOWED_ORIGINS` on the API and restart it.

To update: `git pull`, `npm ci`, `pm2 restart ai-interviewer-api`. Migrations run on start.

## Route B: Docker Compose on one machine

```bash
cp backend/.env.example backend/.env       # fill it in; ALLOWED_ORIGINS must include http://localhost:8080
docker build -t ai-interviewer-runner:latest backend/runner
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
docker compose up -d --build
```

This starts PostgreSQL, the socket proxy, the API and an nginx that serves the website (`http://localhost:8080`; put a TLS-terminating proxy in front for real use). The compose file publishes UDP 10000–10039 for media: keep it in step with `WEBRTC_PORT_MIN/MAX` and your firewall, and set `WEBRTC_PUBLIC_IP` in `backend/.env`. On Linux, `network_mode: host` for the API avoids publishing ports one by one; Docker's port publishing is slow for large ranges.

The images were built and smoke-tested: the API image boots, applies migrations, reports ready, runs as an unprivileged user and can start sandbox containers through the proxy; the website image serves every route with the right status codes and headers.

## Scaling beyond one instance

The API is stateless apart from live calls, so run more instances behind a load balancer:

- **Sticky routing for calls.** A live call exists in one process. A reconnect (within 90 seconds of a dropped connection) and the "end interview" fallback must reach the same instance; use source-IP or cookie affinity. If a request lands elsewhere the interview is closed cleanly and its report is generated, so the worst case is a lost reconnect, not lost data.
- **Each instance needs its own public address** for media (`WEBRTC_PUBLIC_IP`) and its own UDP range. Browsers talk to the instance directly for audio; the load balancer only carries HTTPS.
- **Reports** are claimed from the database with `FOR UPDATE SKIP LOCKED`, so every instance can run the worker and no job runs twice. Set `REPORT_WORKER_ENABLED=false` on instances that should not.
- **Rate limits** are counted per instance. For exact global limits put a shared limit at the gateway.
- **Capacity:** `MAX_CONCURRENT_INTERVIEWS` per instance returns a 503 with `Retry-After` beyond it. The README has measured numbers; scale on `ai_interviewer_active_interviews` and CPU.
- **The model provider is the real ceiling.** Watch `ai_interviewer_llm_errors_total`.

## After you deploy

Run the smoke test from any machine that can reach the API. It signs up a throwaway account, exercises sign-in, session refresh and interviews (every table the app writes to), then deletes everything it created:

```bash
cd backend
BASE_URL=https://api.example.com ORIGIN=https://app.example.com ALLOW_REMOTE=1 npx tsx scripts/smoke.ts
```

If it fails, the step name says where. Then open the site, sign in, and start a Quick screen with your microphone to check the parts a script can't: that you can hear the interviewer and it can hear you.

## Operating it

- **Health:** `/healthz` (alive) and `/readyz` (database reachable and schema current). Point the load balancer at `/readyz`.
- **Metrics:** set `METRICS_TOKEN`, then scrape `GET /metrics` with `Authorization: Bearer <token>` (Prometheus text). Without a token the route does not exist. You get active calls, first-sentence and first-audio latency histograms, code runs by outcome, model errors, report outcomes, plus process CPU, memory and event-loop lag.
- **Logs** are JSON, one line per event, with credentials redacted. An unexpected error (a 500, or a 503 for a database problem) answers with a plain message and a `ref` that matches its log line; the details never reach the browser.
- **Shutdown:** on SIGTERM the server stops taking new calls and lets live ones finish for up to `SHUTDOWN_GRACE_MS` (default 60 s).
- **Housekeeping** runs on every instance shortly after start and hourly: it closes interviews whose call died without anyone returning (and generates their report if there was enough conversation), deletes interviews past `DATA_RETENTION_DAYS`, and clears expired sessions.
- **Backups:** use your database's (Neon: point-in-time restore). Transcripts and code are the valuable data; audio is never stored.
- **Upgrades:** migrations are additive. For a change that isn't (dropping a column), ship it in two releases: stop using the column, then drop it.

## Things that trip people up

| Symptom | Cause and fix |
|---|---|
| "The table `public.X` does not exist" | The database is behind the code. `npm run db:migrate:deploy`. The server now refuses to start in this state, so if you see it, something started the code without `npm start`. |
| Sign-in works, then you're signed out on reload | Cookie not sent: site and API aren't the same site, or `COOKIE_DOMAIN` / `COOKIE_SAMESITE` don't match your layout. |
| Every API call fails with a CORS error | The website's exact origin (scheme, host and port, no trailing slash) isn't in `ALLOWED_ORIGINS`. |
| "The AI interviewer has reached its usage limit" | The model provider's daily allowance is used up (a free Groq key). Wait, or use a paid key or another provider (`LLM_BASE_URL`). |
| "Runner image is not built" or "Docker is not running" | Build the sandbox image, and make sure the API's user can run `docker`. |
| Connects, interviewer speaks, never hears you | UDP is blocked. `WEBRTC_PUBLIC_IP`, the port range and the firewall rule must all agree. |
| Interviewer never speaks and the call fails | `VOICE_MODE`, `DEEPGRAM_API_KEY`, or the model key. The API log says which. |
| Reports stay "generating" | The model provider is out of allowance; they wait and finish when it returns. Check `/metrics` and the log line "Report deferred". |
| Blank page after deploy on Netlify | `_redirects`/`_headers` weren't deployed (they're in `dist/`), or a CSP violation: open the browser console. The CSP allows only your own origin and `VITE_BACKEND_URL`. |
