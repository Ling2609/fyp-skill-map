# SkillMap

An explainable academic-to-career platform. SkillMap turns a student's academic record (modules + grades) and optional self-declared evidence (projects, certifications) into an industry skill profile, matches it against live Malaysian and Singapore ICT jobs, explains matched skills and gaps with evidence, and guides learning through an AI chatbot.

Final Year Project · Low Wei Ling (TP080089) · BSc (Hons) Software Engineering, Asia Pacific University · Supervisor: Mr Au Yit Wah

## How it works

```
Module descriptors ──► skill extraction (LLM, checked by the career office) ──┐
Projects / certificates / awards / GitHub languages ──► skill extraction ─────┼─► Graduate Skill Profile
Module grades (strength of academic evidence, never "has it") ────────────────┘            │
                                                                                         ▼
Live jobs (JSearch) + jobs posted on SkillMap ──► skill extraction with quotes ──► matching: same skill, else
                                                  (employers check theirs)        SBERT + relationship model
                                                                                         │
2024 JobStreet postings ──► build + test the models, pick live-job searches (not shown)  ▼
          Job Matches · Skill Gap · Dashboard (goal, career comparison, "what opens up") · AI Assistant (learning plans)
```

| Part | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 (pages load on first use) |
| Backend | FastAPI (Python 3.13), SQLAlchemy, JWT (python-jose), bcrypt |
| Databases | PostgreSQL 16 (all app data); MongoDB (AI Assistant chat history, and a record of every AI skill reading with what people changed afterwards; SkillMap still works without it) |
| Skill extraction + AI Assistant | gpt-oss-120b via the Groq API (gpt-oss-20b when its daily limit is reached) |
| Job description formatting (display only) | Gemini (`gemini-3.1-flash-lite`) |
| Matching | SBERT `all-MiniLM-L6-v2` (pre-trained) + a fine-tuned DeBERTa relationship model ("does skill A cover job skill B?") when `RELATION_MODEL_DIR` is set; without it, cosine similarity only. The backend prints which one is in use at start-up |
| Learning plan PDF | ReportLab (A4, black and white) |
| Live jobs | JSearch API (RapidAPI) |

## Roles

- **Student:** academic record (modules + grades), projects, certificates, awards, career goal, Job Matches, Skill Gap, applying to jobs posted on SkillMap (with progress), the AI Assistant (career counsellor, learning plans)
- **Employer** (approved by the career office): post and edit jobs (skills read from the ad, checked by the employer), review applicants, invite graduates who fit and chose to be visible
- **Admin** (career office): approve employers, deactivate accounts, keep programmes, intakes and module lists, review the skills found in each module

## Folder map

The backend follows a **layered architecture** (FastAPI's "bigger applications" structure): routers receive HTTP requests, services and nlp hold the logic, models define the database. Routers are grouped **by feature**, because features such as login and jobs are shared by several roles. The frontend groups pages **by role**, because each role has its own screens.

```
fyp-skill-map/
├── README.md               this file
├── CHANGELOG.md            what changed, when, in which commit
├── docs/
│   └── evidence/           run outputs kept for the report (extraction scores, relationship model, test logs)
├── backend/
│   ├── app/                the API (runs as the web server)
│   │   ├── main.py         start-up, CORS, creates tables
│   │   ├── config.py       settings read from backend/.env
│   │   ├── database.py     PostgreSQL connection; mongo.py: MongoDB (chat history; services/extraction_records.py: AI skill readings; services/evaluation_runs.py: evaluation runs)
│   │   ├── routers/        HTTP endpoints by feature: auth, profile, modules, jobs, recommend, skillgap,
│   │   │                   applications, chatbot, employer, admin, admin_academic
│   │   ├── services/       skill_profile.py (the Graduate Skill Profile + matching), skill_relation.py
│   │   │                   (relationship model), job_requirements.py (required / preferred, "fit"),
│   │   │                   evidence.py (quote checks), learning_resources.py + plan_pdf.py (learning plans), ...
│   │   ├── nlp/            skill_extractor.py (LLM calls), embedder.py (SBERT + disk cache)
│   │   ├── models/         database tables (SQLAlchemy)
│   │   ├── schemas/        request / response shapes (Pydantic)
│   │   └── auth/           password hashing and JWT helpers
│   ├── scripts/            command-line jobs, never imported by the app (see table below)
│   │   ├── pipeline/       build the data: clean JobStreet, taxonomy, extract job / module skills, learning resources
│   │   ├── live_jobs/      generate search queries from market data, fetch current jobs from JSearch
│   │   └── tools/          diagnostics and maintenance
│   ├── migrations/         one-off database changes (see below)
│   ├── tests/              the regression suite (see Tests)
│   ├── data/               data files only: modules.json, programmes.json, skill_taxonomy.json, learning
│   │                       resources, caches
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── auth/       Login, Register, Forgot password
        │   ├── student/    Dashboard, My Profile, Job Matches, Job Detail, My applications, AI Assistant, setup
        │   ├── employer/   Dashboard, My jobs, Post / edit a job, Applicants, applicant profile
        │   ├── admin/      Dashboard, Users, Academic structure
        │   └── AccountSettings.jsx (every role)
        ├── components/     shared: Sidebar, PageHeader, Skeleton, LevelTag, ApplicationSteps, ...
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
Copy `backend/.env.example` to `backend/.env` and fill in your values (never commit `.env`; it is in `.gitignore`). The example lists every setting with a comment. The API starts with only `DATABASE_URL` and `SECRET_KEY`; `GROQ_API_KEY` is needed for reading skills and the AI Assistant:
```
cp .env.example .env
```
**Connect GitHub (optional, 5 minutes).** Students prove which GitHub accounts are theirs by signing in to GitHub, so a project's repo can show as their own and Import from GitHub lists only their repos. It needs a free GitHub OAuth app:
1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**.
2. Application name `SkillMap (local)`; Homepage URL `http://localhost:5173`; Authorization callback URL `http://localhost:5173/github/callback`. Register.
3. Copy the **Client ID**; **Generate a new client secret** and copy it (shown once).
4. In `backend/.env`: `GITHUB_CLIENT_ID=...` and `GITHUB_CLIENT_SECRET=...`, then restart the backend.

No permissions are asked for (public information only), and GitHub's access key is used once to read the username, then dropped. For a deployment, register another app with the deployed address and set `FRONTEND_URL` to it. Without the app, everything else works; students see "Not linked to your GitHub" on projects with a repo, and employers see no badge.

Without `SMTP_USER` and `SMTP_PASSWORD`, no email is sent: the reset code is printed in the backend console instead, so Forgot password still works on a local machine.
Start the API: `uvicorn app.main:app --reload` (http://localhost:8000, docs at /docs). On an empty database the tables are created automatically at start-up.

**Frontend:**
```
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Optional `frontend/.env` (copy `frontend/.env.example`): `VITE_API_URL` (default http://localhost:8000) and `VITE_PRIVACY_CONTACT`, the email of the career office that runs SkillMap, shown in the privacy notice for questions and complaints (PDPA). Without it the notice shows the demo address careers@university.example.

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
| `pipeline/build_learning_resources.py` | Builds `data/learning_resources.json` from `data/learning_resources_curated.csv` and the most-asked skills in real ads (`--from-db`: your live jobs); saves the ranking to `docs/evidence/` | – |
| `tools/check_learning_links.py` | Opens every link in `data/learning_resources.json` and marks it ok / not ok; the AI Assistant only gives students links marked ok. `--coverage` lists the most-asked job skills with no resources yet | Internet |
| `tools/count_rows.py` | Prints the number of rows in every table. Run before and after an upgrade and compare, to show nothing was lost | — |
| `tools/extraction_report.py` | From MongoDB `extraction_records`: per source (job ads, modules, student projects) and prompt version, how many skills the AI proposed, how many the checks rejected and why, and how often people removed, added or re-levelled skills afterwards. `--since`, `--csv` | MongoDB |
| `tools/evaluation_runs.py` | MongoDB `evaluation_runs`: `list` every run (date, commit, main numbers), `export` to `docs/evidence/evaluation_runs.json`, `add-reference <summary.json>` for an earlier relation-model check. Scoring an evaluation records its run automatically | MongoDB |
| `tools/compare_profile_extraction.py` | Before/after check for project and certificate skills: old prompts vs the new quote-checked extraction on 6 sample projects (hand-written gold lists) and 4 certificates; precision, recall, unsupported skills → `docs/evidence/profile_extraction_before_after.csv` | Groq |
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
| `migrate_account_security.py` | 4 Oct 2026 | adds `users.password_changed_at` and `purpose`, `new_email` to `password_reset_otps`; drops `login_throttle` (replaced by `login_attempts`); deletes used/expired codes. The API refuses to start until this has run |
| `migrate_profile_skill_evidence.py` | 4 Oct 2026 | adds `user_projects.skill_quotes` (the student's words behind each project skill) and `user_certifications.skills_source` (listed / estimated). The API refuses to start until this has run |
| `migrate_add_job_gone_at.py` | 6 Oct 2026 | adds `jobs.gone_at` (live jobs missing from the latest search are hidden). The API refuses to start until this has run |
| `migrate_admin_structure.py` | 7 Oct 2026 | new tables `programmes`, `intakes`, `programme_modules`; `modules.description` (filled from `data/modules.json`) and `skills_reviewed_at`; `users.programme_id`, `intake_id`, `company_name`, `employer_status`; `jobs.posted_by_user_id`, `hidden_by_admin_at`; creates the SE programme with its modules; marks existing employers approved. The API refuses to start until this has run |
| `migrate_admin_actions.py` | 7 Oct 2026 | new table `admin_actions` (who, when, what, why) for every approve / reject / deactivate / reactivate. The API refuses to start until this has run |
| `migrate_profile_showcase.py` | 8 Oct 2026 | adds `users.headline`, `about`, `linkedin_url`, `portfolio_url`, `github_url`, `show_grades_to_employers`; new table `user_awards` (honours and awards with their skills). The API refuses to start until this has run |
| `migrate_career_goal.py` | 9 Oct 2026 | adds `users.target_category` (the student's career goal, a job category; empty = open to all ICT roles). The API refuses to start until this has run |
| `migrate_all_programmes.py` | 10 Oct 2026 | adds `programme_modules.kind` (a module's type per programme); adds the modules in `data/modules.json` that are missing (198 in all) and the 17 computing programmes in `data/programmes.json` (APU July 2026 brochure) with each module's year and type. Then run `python scripts/pipeline/extract_module_skills.py` to find skills for the new modules (they start "To review"). The API refuses to start until this has run |
| `migrate_intake_modules.py` | 10 Oct 2026 | new table `intake_modules` (each intake's own module list) and `intakes.other_codes`; every programme without intakes gets demo intakes for March, July and September 2023–2025 (Year 1 codes like `APU1F2409CS(DA)`), and every intake gets a copy of its programme's list. The API refuses to start until this has run |
| `migrate_employer_jobs.py` | 11 Oct 2026 | adds `jobs.closed_at` (an employer closes or reopens a post). The API refuses to start until this has run |
| `migrate_applications.py` | 11 Oct 2026 | new table `applications` (one per student per job, with its status). The API refuses to start until this has run |
| `migrate_privacy_contact.py` | 14 Oct 2026 | adds `users.phone`, `city`, `available_from` (optional contact details, shown to an employer only after shortlisting) and `privacy_accepted_at` (when the privacy notice was accepted at sign-up). The API refuses to start until this has run |
| `migrate_transparency.py` | 14 Oct 2026 | adds `jobs.decide_by` (existing posts: 30 days after posting), `decide_extended_reason`, `applications_stopped_at`, `close_reason`; `applications.reason`, `note`, `reason_skills`, `match_have`, `match_total`. The API refuses to start until this has run |
| `migrate_record_keeping.py` | 14 Oct 2026 | audit fixes: adds `jobs.decide_by_original` (the first decision date, kept when it is moved), `applications.match_at` (when the skill counts for "where you stand" were worked out) and `users.privacy_version` (which notice was accepted; existing users get `2026-10-14`, the only version so far). The API refuses to start until this has run |
| `migrate_github_accounts.py` | 14 Oct 2026 | new table `github_accounts` (GitHub accounts a student connected); `user_projects.repo_check`, `repo_check_as` (is the repo hers). The API refuses to start until this has run |

A **new, empty** database gets its tables from `app/models/` when the API starts (the 12 Oct tables `application_events` and `job_invitations` too), but three of these scripts also load **data** a new install needs, so after the first start run, in this order: `migrate_admin_structure.py`, `migrate_all_programmes.py`, `migrate_intake_modules.py` (17 programmes, 198 modules, demo intakes), then `python scripts/pipeline/extract_module_skills.py` (module skills, Groq) and `python scripts/tools/create_admin.py` (the career-office account). Checked by `tests/test_install.py` on a brand-new database. Post a job lists the job categories already in the database, so load the JobStreet data (or fetch live jobs) before employers post. To apply one: `python migrations/<file>.py` from `backend/`.

**Upgrading an existing database** (e.g. after a `git pull`): run the scripts you haven't run yet, **top to bottom in the table** (it is in date order). If unsure which, run them all in that order: every script is safe to run again: `tests/test_install.py` runs them all again on a database in use and checks that no row in any table changes and that modules the career office removed stay removed (until 14 Oct, `migrate_admin_structure.py` and `migrate_all_programmes.py` put them back on a rerun; fixed). The data scripts only fill a programme's module list when it has none yet. If one is missing, the API refuses to start and names the script to run; `tests/test_audit_fixes.py` checks that for the newest one. To prove an upgrade on real data without risking it, try it on a copy first (Git Bash; adjust the PostgreSQL path and database name):
```
PG="/c/Program Files/PostgreSQL/16/bin"
"$PG/pg_dump" -U postgres -Fc -f skillmap_backup.dump <your database>          # 1. back up
"$PG/createdb" -U postgres -O <app user> skillmap_upgrade                      # 2. an empty copy
"$PG/pg_restore" -U postgres -d skillmap_upgrade --no-owner --role=<app user> skillmap_backup.dump
DATABASE_URL=postgresql://<app user>:<password>@localhost:5432/skillmap_upgrade python scripts/tools/count_rows.py > before.txt
DATABASE_URL=...skillmap_upgrade python migrations/<each script not run yet>.py  # 3. upgrade the copy
DATABASE_URL=...skillmap_upgrade python scripts/tools/count_rows.py > after.txt
diff before.txt after.txt                                                       # 4. same rows (new tables may appear)
```
Then start the API on the copy and sign in. The backup file also lets you go back if anything goes wrong. A new database change gets a new `migrate_<what_it_does>.py` and a row in this table.

## Tests

`backend/tests/` (12 Oct 2026) runs the real API on a **throwaway** PostgreSQL database that is dropped and made again on every run, so your own data is never touched. It checks a brand-new install (start-up, data migrations, running every migration twice), sign-up and sign-in, role checks, admin decisions, applying and the student's progress (Viewed, Shortlisted, Undo, the 14- and 30-day notes, closing a job), invitations, editing a posted job, contact details only after shortlisting, decision dates, stopping and closing with a reason, reasons for Not selected (one or many), where a student stands among applicants, the employer's on-time record, the privacy notice at sign-up and the version accepted, Download my data, deleting an account (including retrying after a partial failure), chats expiring after 18 months, a database one migration behind, learning plans (only checked links, the PDF), the Dashboard's "what opens up" counts, accepted grades, and that nobody reaches another person's records by changing an id. Evidence of each run: `docs/evidence/tests/`. Skill extraction and matching quality are not tested here (see `docs/evidence/`): the embedding model is replaced by a small stand-in and the relationship model is off, so the tests are fast and need no API keys.

From `backend/` with the venv active, run `python -m pytest`. It uses the server, user and password of `DATABASE_URL` in `backend/.env` with a separate database called `skillmap_test`, made for the run (your own database is never touched). To use a different throwaway database, set `TEST_DATABASE_URL` first (its name must contain "test"). If your database user may not create databases, make it once as `postgres` (pgAdmin Query Tool or psql): `CREATE DATABASE skillmap_test OWNER <your user>;` — the tests then empty it at the start of each run. Takes about two to three minutes.

## Known limitations

- Job skills and module skills are read by a language model; employers and the career office check them, and a quote from the ad or description backs each one, but a skill can still be missed or misread (scores in `docs/evidence/`).
- "Fit" (half or more of a job's required skills) and the match counts compare skills only, not experience, degree or interview performance.
- Live jobs are recent, not confirmed open: as fresh as the last JSearch fetch (each card shows how long ago the job was posted; jobs over 45 days old are not recommended), and one can close on the company's site before the next fetch; the 2024 JobStreet postings are used to build and test the models and to choose live-job searches, not shown to students (they can't be applied to).
- Learning-plan links are checked to open, not reviewed in full; Coursera / YouTube links are searches.
- The login token is kept in the browser's local storage (common for single-page apps; a cross-site scripting bug could expose it); sessions end after `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Changing an email asks for a code sent to the new address; there is no email check at sign-up.
- Students can delete their account themselves; employers and admins ask the career office (their jobs and decisions involve other people). Deleting spans two databases, so it is not one transaction: chats go first, and a failure after that is safe to retry (`docs/data_flow.md`).
- GitHub ownership is proved by signing in; LinkedIn and portfolio links are typed (LinkedIn's sign-in doesn't return the profile address). A repo counts as the student's if a connected account owns it or is among its first 100 contributors.
- The privacy notice is a draft for the university that deploys SkillMap: its data-user name, contact address and Malay text must be checked by that university.
- Tests use a stand-in embedding model with the relationship model off: they check behaviour, not matching quality (that is the evaluation, `docs/evidence/`).

## Never commit

`backend/.env`, `backend/test_credentials.txt`, `backend/data/live_jobs_cache.json`, `backend/data/embedding_cache.npz` (all in `.gitignore`).
