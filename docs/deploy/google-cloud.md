# Putting SkillMap on Google Cloud (always on, free trial)

Decided 26 Nov 2026. One virtual server (VM) runs the same Docker containers that were tested on the laptop
(`docker-compose.prod.yml`), with Caddy in front for HTTPS. The link is fixed (`https://<ip-with-dashes>.sslip.io`) and
works without the laptop. Cost: the Google Cloud free trial ($300 credit, 90 days); the card is only verified and is
**never charged unless you upgrade the account yourself**. When the trial ends, Google stops the VM (back up first).

```
visitor ──https──> Caddy :443 ──> nginx (built app) ──/api──> FastAPI ──> PostgreSQL 18, MongoDB   (all on one VM)
```

Takes about 2 hours, mostly waiting. Do the parts in order. Never paste passwords, keys or tokens into a chat.

## A. In the Google Cloud console (browser)

1. **Project:** top bar → project picker → **New project** → name `skillmap` → Create, and select it.
2. **Budget alert** (a safety net): ☰ → Billing → Budgets & alerts → Create budget → amount **$100** → alerts at 50%, 90%.
3. **The VM:** ☰ → Compute Engine → VM instances (enable the API if asked) → **Create instance**:
   - Name `skillmap` · Region **asia-southeast1 (Singapore)** · Zone `asia-southeast1-b`
   - Machine: **E2 → e2-standard-2** (2 vCPU, 8 GB)
   - OS and storage → Change → **Ubuntu 24.04 LTS (x86/64)**, **Balanced persistent disk, 40 GB**
   - Networking → Firewall: tick **Allow HTTP traffic** and **Allow HTTPS traffic**
   - **Create**. Wait for the green tick.
4. **Fixed address:** ☰ → VPC network → IP addresses → the VM's **External** address → ⋮ → **Promote to static** → name `skillmap-ip`.
   Note the address, e.g. `34.87.12.34`. Your site name is then **`34-87-12-34.sslip.io`** (dots become dashes).
5. **A private storage bucket** (to carry big files to the VM): ☰ → Cloud Storage → Buckets → **Create** → a name like
   `skillmap-transfer-<random>` · Region `asia-southeast1` · Standard · **Enforce public access prevention: on** → Create.

## B. On the laptop: the files GitHub doesn't have

Git Bash, in `fyp-skill-map/`. These hold real accounts: they go only into your private bucket, never into git.

```bash
# the database (your main one; the user and database names are in DATABASE_URL in backend/.env)
pg_dump -U <your db user> -d <your database> -Fc -f skillmap.dump
# MongoDB chat history (needs MongoDB Database Tools; skip if not installed: the site works, past chats start empty)
mongodump --db skillmap --archive=skillmap.archive --gzip
```

Upload to the bucket (Cloud Storage → your bucket → **Upload**):
- **Upload folder:** `backend/data/<the folder RELATION_MODEL_DIR names in backend/.env>` (2.1 GB; keep the tab open)
- **Upload files:** `backend/data/relation_cache.json`, `backend/data/embedding_cache.npz`, `skillmap.dump`, `skillmap.archive`

## C. On the VM (Compute Engine → VM instances → **SSH** button opens a terminal in the browser)

```bash
# 1. Docker (Docker's official install script), then close the SSH window and open it again
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

```bash
# 2. The code. GitHub asks for a username (anything) and a password: paste a NEW fine-grained token
#    (Contents: read-only, only fyp-skill-map, expires in 7 days). Delete the token on GitHub afterwards.
git clone -b ui/redesign https://github.com/Ling2609/fyp-skill-map.git skillmap
cd skillmap
```

```bash
# 3. The files from the bucket (replace BUCKET with your bucket's name)
gcloud storage cp -r gs://BUCKET/<model folder name> backend/data/
gcloud storage cp gs://BUCKET/relation_cache.json gs://BUCKET/embedding_cache.npz backend/data/
gcloud storage cp gs://BUCKET/skillmap.dump docker/db/
mkdir -p docker/mongo && gcloud storage cp gs://BUCKET/skillmap.archive docker/mongo/
```

```bash
# 4. Settings: the server's own .env (site name + a new database password) ...
cp .env.prod.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(24))"    # copy this as POSTGRES_PASSWORD
nano .env                                                          # SITE=34-87-12-34.sslip.io and POSTGRES_PASSWORD=...
# ... and backend/.env: open your laptop's backend/.env in VS Code, copy all of it, paste here (Ctrl+O, Enter, Ctrl+X)
nano backend/.env
```
The compose file overrides the database address, MongoDB, PRODUCTION=1 and the site address, so the laptop values for
those don't matter.

```bash
# 5. Start (the first build takes 10-20 minutes; later starts are quick)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend      # wait for "Application startup complete", then Ctrl+C
```

```bash
# 6. Once: MongoDB's chat history (skip if you had no archive), and tidy every live job ad
docker compose -f docker-compose.prod.yml exec mongo mongorestore --archive=/dump/skillmap.archive --gzip
docker compose -f docker-compose.prod.yml exec backend python scripts/tools/format_all_descriptions.py
```

Open **`https://<your site name>`**. The first visit can take a few seconds while Caddy gets the certificate. Then do
the smoke test (testing guide step 9) on this link and save it in `docs/evidence/deploy/`.

Finally, **delete the files from the bucket** (they hold real data) and the GitHub token.

## Day to day

| Task | Command (in `~/skillmap` on the VM) |
|---|---|
| See what runs | `docker compose -f docker-compose.prod.yml ps` |
| Backend log | `docker compose -f docker-compose.prod.yml logs -f backend` |
| Deploy a code change (pushed to GitHub) | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| Fetch live jobs | `docker compose -f docker-compose.prod.yml exec backend python scripts/live_jobs/fetch_live_jobs.py --use-cache`, then restart: `docker compose -f docker-compose.prod.yml restart backend` |
| Back up the database | `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U skillmap -Fc skillmap > backup-$(date +%F).dump` |

**Before the trial ends** (90 days after sign-up): make a backup, download it (SSH window → ⋮ → Download file), then
delete the project (IAM & Admin → Settings → Shut down) so nothing is left.

## For the report

- Deployment: one Compute Engine VM (e2-standard-2, Singapore), Docker Compose with five containers (Caddy, nginx +
  React build, FastAPI, PostgreSQL 18, MongoDB 9). Only ports 80/443 are open; the API and databases are internal.
- HTTPS by Caddy (Let's Encrypt, renewed automatically); `PRODUCTION=1` (app/services/production.py) refuses unsafe
  settings; per-visitor limits use the forwarded address, trusted only from inside the Docker network.
- Why not a free host: see `docs/deploy/tunnel.md` (Hugging Face Docker Spaces now paid; Render's free 512 MB too small
  and blocks SMTP; APU's Azure denies resource creation). The Cloudflare-tunnel route stays as a fallback.
