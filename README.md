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
# optional: emails for Forgot password (Gmail needs 2-Step Verification and an app password)
SMTP_USER=<gmail address>
SMTP_PASSWORD=<16-character app password>
SMTP_HOST=smtp.gmail.com            # default
SMTP_PORT=587                       # default, STARTTLS
```
Without `SMTP_USER` and `SMTP_PASSWORD`, no email is sent: the reset code is printed in the backend console instead, so Forgot password still works on a local machine.
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
| `pipeline/extract_job_skills_v2.py` | Fix plan Stage 1 dry run: job skills with an evidence quote, type (hard/soft) and level (required/preferred/trained); quotes checked against the ad (`app/services/evidence.py`), unsupported skills rejected; compared with the stored skills. Dry run by default; `--save` stores the checked skills (old ones backed up, `--undo` restores them), `--all-live` processes every live job not yet saved and resumes after Groq's daily limit. `--title`, `--company`, `--live N`, `--dataset N`, `--repeat N` | Groq |
| `skill_relations/build_pairs_esco_onet.py` | Training set v1 for the skill relationship model (fix plan Stage 2), without an LLM: skill pairs labelled SAME / NARROWER / BROADER / RELATED / DIFFERENT from ESCO (synonyms, skill hierarchy, skill relations) and O*NET (software tools and their categories) plus A8's verified pairs; split by skill → `data/skill_relations/pairs_esco_onet_v1.csv`. Needs the ESCO CSV in `data/external/esco/` and O*NET "Software Skills" as `data/external/onet_software_skills.csv` | – |
| `skill_relations/train_relation_model.ipynb` | Colab notebook: SBERT-cosine baseline vs a trained cross-encoder (3 classes, 3 seeds), macro-F1, confusion matrix, direction test. Built from `skill_relations/make_notebook.py` | Colab GPU |
| `skill_relations/sample_reference_pairs.py` | Reference set (Stage 2B): ~400 real "module skill → job skill" pairs from the database, picked per SBERT band (0.85+ / 0.75–0.85 / 0.65–0.75 / 0.55–0.65 / < 0.55), skills seen in training and same-A8 pairs left out, ≤ 3 pairs per skill, band sizes saved for weighting → `data/skill_relations/reference_pairs_v1.csv` | – |
| `skill_relations/judge_reference_pairs.py` | LLM judge for the reference pairs with the label guide; blind (names only), saves after every batch and resumes, waits on busy/rate limits. `--judge gpt_oss` or `--judge qwen` (`--limit N` to test) → `data/skill_relations/reference_labels/label_<judge>.csv` `--pairs` / `--out-dir` / `--batch` label any pairs file (used for training set v2); saves safely after every batch | Groq |
| `skill_relations/merge_reference_labels.py` | Merges the three judges' labels into `reference_pairs_v1.csv`, maps them to the 3 classes, marks unanimous / 2-of-3 pairs, prints Fleiss' and Cohen's kappa, draws the author's 50-pair spot-check (`reference_spotcheck.csv`) | – |
| `skill_relations/evaluate_reference.py` | Cosine (the app's rule) vs the trained relationship model on the reference pairs: macro-F1, "has the skill" precision / recall, per band and weighted by band size → `reference_predictions.csv`, `docs/evidence/relation_model/reference_eval.json` | – |
| `skill_relations/build_pairs_skillmap.py` | Training set v2 candidates from SkillMap's own job-skill names (named in ≥ 2 ads): 1,200 pairs (close 0.55–0.95, word-overlap hard negatives, far, abbreviation merges), both orders, reference-set skills left out → `data/skill_relations/pairs_skillmap_v2_candidates.csv` | – |
| `skill_relations/merge_training_labels.py` | Keeps v2 pairs where gpt-oss and Qwen agree in both orders and the orders mirror (NARROWER ↔ BROADER), maps BROADER → RELATED, splits by skill → `data/skill_relations/pairs_skillmap_v2.csv` for the Colab notebook | – |
| `pipeline/find_abbreviations.py` | Abbreviation dictionary: finds "long form (SHORT)" in the job ads and ESCO, groups spellings, auto-accepts single-meaning short forms seen in ≥ 2 ads, gpt-oss judges the rest, Qwen checks all; `--judge`, `--sample N` (author's blind check), `--apply` (→ `skill_merge_overrides.json`) | Groq |
| `pipeline/decide_skill_merges.py` | A8 layer 2: asks the LLM whether close skill names (SBERT ≥ 0.85, after the layer-1 rules) are the same skill; answers saved in `data/skill_merges.json`, resumable, stops at Groq's daily limit. `--dry-run`, `--limit N`, `--verify` (second, stricter check; merge only if both say same) | Groq |
| `live_jobs/generate_live_queries.py` | Builds the search queries from the most common ICT roles per subcategory in the 2024 JobStreet data; writes `data/live_job_queries.json`. Preview by default, `--save`, `--my N --sg N` | – |
| `live_jobs/fetch_live_jobs.py` | Fetches live jobs for those queries (non-ICT titles skipped) and extracts their skills. `--dry-run`, `--use-cache`, `--new-only` | JSearch, Groq |
| `tools/check_skill_profile.py` | Read-only: a student's skill count, sources and near-duplicates. `--no-sbert` | – |
| `tools/compare_scoring.py` | Read-only (step 2): a student's coverage under different rules for which matched skills count, sensitivity table, and a random sample of related pairs for labelling (`docs/evidence/`) | – |
| `tools/compare_match_pages.py` | Read-only debug (A8): for one job, each job skill's best matching student skill (and spelling) and its score, as Job Matches and Job Detail compute it. `<user> "<job title>"` | – |
| `tools/format_all_descriptions.py` | Pre-formats job descriptions in bulk | Gemini |
| `tools/restore_full_descriptions.py` | Puts the full ad text back into `jobs.description` (2024 ads were stored cut at 2,000 characters, live ads at 6,000) from `data/jobstreet_clean.csv` and `data/live_jobs_cache.json`. Preview by default, `--save` | – |
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
| `migrate_add_job_skill_evidence.py` | 1 Oct 2026 | adds `evidence_quote`, `level`, `skill_type`, `match_score`, `alternative_group` to `job_skills` (fix plan Stage 1) and an index on `job_skills.job_id` |

A **new, empty** database doesn't need them: the tables are created from `app/models/` when the API starts. To apply one: `python migrations/<file>.py` from `backend/`. A new database change gets a new `migrate_<what_it_does>.py` and a row in this table.

## Never commit

`backend/.env`, `backend/test_credentials.txt`, `backend/data/live_jobs_cache.json`, `backend/data/embedding_cache.npz` (all in `.gitignore`).
