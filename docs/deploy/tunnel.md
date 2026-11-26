# Putting SkillMap online for testers (laptop + Cloudflare Tunnel)

Decided 26 Nov 2026. SkillMap runs on this laptop exactly as tested (e2e 18/18, devices 99/99, Lighthouse 33/33,
load test PASS); a free Cloudflare quick tunnel gives it a public `https://….trycloudflare.com` link.

Why not a cloud host (checked 26 Nov 2026):

| Option | Why not |
|---|---|
| Hugging Face Spaces | Since mid-2026 Docker and Gradio Spaces need the PRO plan; free accounts get static pages only. Spaces also block SMTP (email codes). |
| Render (free) | 0.1 CPU and 512 MB per service: the AI models need about 1 GB; outbound SMTP (465, 587) is blocked; the free PostgreSQL is deleted after 30 days. |
| Azure (APU tenant) | Resource creation is denied by policy ("Deny – All Resources Creation"). |
| AWS Academy sandbox | Sessions stop after about 4 hours and the lab can be reset. |

**Limits to state in the report:** the link works only while the laptop is on and running the three commands below;
the address changes every time the tunnel starts; a quick tunnel has no uptime guarantee (Cloudflare: for testing).

## How it fits together

```
tester's browser ──https──> Cloudflare ──tunnel──> this laptop
                                                    ├─ npm run serve:public   :4173  the built app
                                                    │     └─ /api/* ──────────> uvicorn :8000  FastAPI
                                                    │                              ├─ PostgreSQL (local)
                                                    │                              └─ MongoDB (local)
                                                    └─ cloudflared              (no port opened on the router)
```

- One address: the app is built with `VITE_API_URL=/api` (`frontend/.env.public`), and `vite preview` passes `/api`
  to the backend (`frontend/vite.config.js`, `preview`).
- Per-visitor limits keep working: uvicorn `--proxy-headers --forwarded-allow-ips 127.0.0.1` takes the visitor's
  address from X-Forwarded-For, but only when the request comes from this laptop (cloudflared → vite preview), and
  reads it from the right, so a visitor can't fake it.
- `PRODUCTION=1`: refuses unsafe settings, sends real emails (Gmail works from a laptop), never prints codes.
- The backend listens on 127.0.0.1 only: nothing but the tunnel can reach it from outside.

## Once

1. Install cloudflared (PowerShell): `winget install --id Cloudflare.cloudflared` — then close and reopen the terminal.
   Check: `cloudflared --version`.
2. Laptop power settings: plugged in, **Sleep: Never** while testers use it, and keep the lid open (or set "When I
   close the lid: Do nothing").
3. Tidy every live job ad, so no tester waits for Gemini (backend/, venv on; uses your main database):
   `python scripts/tools/format_all_descriptions.py --dry-run`, then without `--dry-run`.

## Each testing session (three Git Bash terminals)

**Terminal 1 — backend** (`backend/`, venv on; your main database from `.env`):

```bash
PRODUCTION=1 uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1
```

Wait for `Application startup complete`. It must NOT use `E2E_OUTBOX` or `IP_LIMIT_MULTIPLIER` (production refuses them).

**Terminal 2 — website** (`frontend/`):

```bash
npm run build:public
npm run serve:public
```

`serve:public` shows `http://127.0.0.1:4173`. Rebuild (`build:public`) only after code changes.

**Terminal 3 — tunnel** (any folder):

```bash
cloudflared tunnel --url http://127.0.0.1:4173
```

It prints a box with `https://<random-words>.trycloudflare.com`. That is the link for testers. Open it yourself first:
sign in, open Job Matches (the first one after a start waits a few seconds while the model loads).

To stop: Ctrl+C in all three. The next session gets a new link.

## Optional: Connect GitHub during a session

GitHub sends students back to `FRONTEND_URL/github/callback`. Because the quick-tunnel link changes, set
`FRONTEND_URL=https://<this session's link>` in `backend/.env` and the same callback URL in the GitHub OAuth app
(GitHub → Settings → Developer settings → OAuth Apps), then restart terminal 1. Skip it if no task needs GitHub.

## Smoke test (testing guide step 9), on the public link

Register a new student (the code arrives by email) · sign in as each role · Job Matches loads · open a job and apply ·
career office approves an employer · AI Assistant answers · download a learning plan PDF. Note Pass / Fail per item
in `docs/evidence/deploy/smoke_<date>.txt`, with the date and the (then) link.
