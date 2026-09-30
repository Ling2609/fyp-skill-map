# SkillMap

An explainable academic-to-career platform. SkillMap turns a student's academic record (modules + grades) and optional self-declared evidence (projects, certifications) into an industry skill profile, matches it against live Malaysian and Singapore ICT jobs, explains matched skills and gaps with evidence, and guides learning through an AI chatbot.

Final Year Project · Low Wei Ling (TP080089) · BSc (Hons) Software Engineering, Asia Pacific University · Supervisor: Mr Au Yit Wah

## How it works

```
Module descriptors ──► skill extraction (LLM) ──┐
Projects / certifications ──► skill extraction ─┼─► Graduate Skill Profile ──► SBERT matching ──► Job Matches · Skill Gap · Dashboard
Module grades (evidence strength) ──────────────┘                                  ▲
Live jobs (JSearch API) ──► skill extraction (LLM) ────────────────────────────────┘
2024 JobStreet postings ──► market data (career paths, skill demand)
```

| Part | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | FastAPI (Python 3.13), SQLAlchemy, JWT (python-jose), bcrypt |
| Database | PostgreSQL 16 |
| Skill extraction + chatbot | gpt-oss-120b via the Groq API (one model for all skills, so module and job skills are worded the same way) |
| Job description formatting (display only) | Gemini (`gemini-3.1-flash-lite`) |
| Matching | SBERT `all-MiniLM-L6-v2` (pre-trained) + cosine similarity; vectors cached on disk |
| Live jobs | JSearch API (RapidAPI) |

## Roles

- **Student:** academic record, projects and certifications, job matches, skill gap, AI assistant
- **Employer** (university industry partner): post jobs, see matched students who opted in *(planned)*
- **Admin** (career office): import the module catalogue and student records, review extracted module skills *(planned)*

## Folder map

The backend follows a **layered architecture** (FastAPI's "bigger applications" structure): routers receive HTTP requests, services and nlp hold the logic, models define the database. Routers are grouped **by feature**, because features such as login and jobs are shared by several roles. The frontend groups pages **by role**, because each role has its own screens.

```
fyp-skill-map/
├── README.md               this file
├── CHANGELOG.md            what changed, when, in which commit
├── docs/
│   └── evidence/           run outputs kept for the report (e.g. A11 module re-extraction)
├── backend/
│   ├── app/                the API (runs as the web server)
│   │   ├── main.py         start-up, CORS, creates tables
│   │   ├── config.py       settings read from backend/.env
│   │   ├── database.py     PostgreSQL connection
│   │   ├── routers/        HTTP endpoints by feature: auth, modules, jobs, recommend, skillgap, profile, chatbot
│   │   │                   (planned: employer.py, admin.py)
│   │   ├── services/       skill_profile.py: the one Graduate Skill Profile + matching thresholds;
│   │   │                   job_titles.py: job level + ICT title rule; job_keys.py: duplicate-job rule
│   │   ├── nlp/            skill_extractor.py (LLM calls), embedder.py (SBERT + disk cache)
│   │   ├── models/         database tables (SQLAlchemy)
│   │   ├── schemas/        request / response shapes (Pydantic)
│   │   └── auth/           password hashing and JWT helpers
│   ├── scripts/            command-line jobs, never imported by the app (see table below)
│   │   ├── pipeline/       build the data: clean JobStreet, taxonomy, extract job / module skills
│   │   ├── live_jobs/      generate search queries from market data, fetch current jobs from JSearch
│   │   └── tools/          diagnostics and maintenance
│   ├── migrations/         one-off database changes (see below)
│   ├── data/               data files only: modules.json, skill_taxonomy.json, skill_merges.json (+ overrides), caches
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── auth/       Login, Register
        │   ├── student/    Dashboard, Recommend (Job Matches), JobDetail, Profile, Chatbot
        │   ├── employer/   (planned)
        │   └── admin/      (planned)
        ├── components/     shared: Sidebar, PageHeader, LevelTag
        ├── context/        logged-in user (AuthContext)
        ├── api.js          axios client, adds the login token to every request
        └── App.jsx         routes; RoleRoute limits pages by role
```

## Setup

**Backend** (Windows, Git Bash):
```
cd backend
python -m venv venv
source venv/Scripts/activate        # PowerShell: venv\Scripts\activate
pip install -r requirements.txt
```
Create `backend/.env` (never commit it):
```
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database>
SECRET_KEY=<long random string>
GROQ_API_KEY=<key>
GEMINI_API_KEY=<key>
JSEARCH_KEY=<RapidAPI key>
# optional
GEMINI_MODEL=gemini-3.1-flash-lite
ACCESS_TOKEN_EXPIRE_MINUTES=480
```
Start the API: `uvicorn app.main:app --reload` (http://localhost:8000, docs at /docs). On an empty database the tables are created automatically at start-up.

**Frontend:**
```
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

## Scripts

Run every script from `backend/` with the venv active, e.g. `python scripts/tools/check_skill_profile.py low1`.

| Script | What it does | Uses |
|---|---|---|
| `pipeline/clean_jobstreet.py` | Filters the Kaggle JobStreet CSV to ICT jobs | – |
| `pipeline/taxonomy_analysis.py` | Builds `data/skill_taxonomy.json` from ESCO + JobStreet frequency | – |
| `pipeline/extract_job_skills.py` | Extracts skills for the 2024 JobStreet sample (resumable) | Groq |
| `pipeline/extract_module_skills.py` | First-time setup: loads `modules.json` and extracts module skills | Groq |
| `pipeline/reextract_module_skills.py` | Re-extracts module skills from name + description; backs up old skills first. `--dry-run`, `--module CODE` | Groq |
| `pipeline/decide_skill_merges.py` | A8 layer 2: asks the LLM whether close skill names (SBERT ≥ 0.85, after the layer-1 rules) are the same skill; answers saved in `data/skill_merges.json`, resumable, stops at Groq's daily limit. `--dry-run`, `--limit N`, `--verify` (second, stricter check; merge only if both say same) | Groq |
| `live_jobs/generate_live_queries.py` | Builds the search queries from the most common ICT roles per subcategory in the 2024 JobStreet data; writes `data/live_job_queries.json`. Preview by default, `--save`, `--my N --sg N` | – |
| `live_jobs/fetch_live_jobs.py` | Fetches live jobs for those queries (non-ICT titles skipped) and extracts their skills. `--dry-run`, `--use-cache`, `--new-only` | JSearch, Groq |
| `tools/check_skill_profile.py` | Read-only: a student's skill count, sources and near-duplicates. `--no-sbert` | – |
| `tools/compare_scoring.py` | Read-only (step 2): a student's coverage under different rules for which matched skills count, sensitivity table, and a random sample of related pairs for labelling (`docs/evidence/`) | – |
| `tools/compare_match_pages.py` | Read-only debug (A8): for one job, each job skill's best matching student skill (and spelling) and its score, as Job Matches and Job Detail compute it. `<user> "<job title>"` | – |
| `tools/format_all_descriptions.py` | Pre-formats job descriptions in bulk | Gemini |
| `tools/remove_duplicate_jobs.py` | Lists live jobs saved twice (same title, company, location) and deletes the extra copies after you confirm | – |
| `tools/remove_non_ict_jobs.py` | Lists saved live jobs whose title isn't an ICT role (same rule as the fetcher) and deletes them after you confirm | – |
| `tools/check_skill_mapping.py` | Read-only (A8): groups the skill names in the database by rules (`app/services/skill_names.py`) and counts the close pairs an LLM would check; `--taxonomy` for the first analysis against `skill_taxonomy.json`. Writes evidence CSVs to `docs/evidence/` | – |

Groq's free tier allows about 200,000 tokens a day (≈ 100 jobs). Don't run two Groq-heavy scripts on the same day. To save long output: `PYTHONIOENCODING=utf-8 python <script> 2>&1 | tee out.txt`.

## Database migrations

`migrations/` holds one-off scripts that change an **existing** database (add a column, create or drop a table). They were run in this order and each is safe to run again:

| File | Date | Change |
|---|---|---|
| `migrate_add_formatted_description.py` | 14 Sep 2026 | `jobs.formatted_description` |
| `migrate_phase1.py` | 23 Sep 2026 | `user_modules`, `user_skills_cache`, `password_reset_otps`, new `users` columns |
| `migrate_add_live_job_columns.py` | 27 Sep 2026 | live-job columns on `jobs` |
| `migrate_drop_user_skills_cache.py` | 29 Sep 2026 | drops the unused `user_skills_cache` |

A **new, empty** database doesn't need them: the tables are created from `app/models/` when the API starts. To apply one: `python migrations/<file>.py` from `backend/`. A new database change gets a new `migrate_<what_it_does>.py` and a row in this table.

## Never commit

`backend/.env`, `backend/test_credentials.txt`, `backend/data/live_jobs_cache.json`, `backend/data/embedding_cache.npz` (all in `.gitignore`).
