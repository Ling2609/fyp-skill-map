# Changelog

What changed, when, and in which commit. Newest first. Built from `git log` (full detail: `git log --oneline`).
Planning, reasoning and research behind each decision are in the project roadmap and references.

## 29 Sep 2026 — Project structure for all three roles

Files moved with **names unchanged** and history kept (`git log --follow <file>`).
- (this commit) **ICT title rule tuned on the first generated-query dry run** (494 results, `docs/evidence/generated_queries_dryrun.txt`).
  Now kept: plurals ("System Engineers"), service desk, firewall, ERP spelled out, tech support, agile / scrum / product owner.
  Now skipped: electrical, mechanical, power-systems and similar engineering titles, unless they also name software work.
  11 of 245 titles seen that day changed, all as intended.
- `32b2415` **Live-job queries generated from market data**, replacing the hand-written list.
  `scripts/live_jobs/generate_live_queries.py` reduces each 2024 JobStreet ICT title to its role ("Senior Java Developer
  (KL)" → "java developer"; manager and lead titles, non-ICT and one-word roles left out), takes the top role of every ICT
  subcategory, then fills the budget with the most common remaining roles, skipping roles that only add words to a chosen
  one ("IT support executive" after "IT support"). The list is saved to `data/live_job_queries.json`, which
  `fetch_live_jobs.py` reads. The job level and ICT title rules moved to `app/services/job_titles.py` so the API, the
  fetcher and the generator use the same rules.
- `32b2415` `scripts/tools/remove_non_ict_jobs.py` removes non-ICT live jobs saved before the title check (e.g. a marine
  engineering "Graduate Programme" that the A7 entry-level ranking had lifted to the top). Job level now also reads plural
  titles ("Internships", "Graduate Trainees") as entry level.
- `32b2415` **Live jobs must have an ICT title.** Broad queries such as "IT intern" also returned electrical, HR and
  finance jobs, which would have been saved under an ICT subcategory. `fetch_live_jobs.py` now skips a job whose title has
  no ICT word (software, developer, data, network, IT, …) before Groq sees it, and lists each skipped title. Jobs already
  saved are not affected.
- `b2ca3f5` **Job level on every match** (A7, F10). The level is read from the title, checking the most senior first
  (so "Senior Associate" is senior, not entry level), and "intern", "internship", "fresh graduate" and "graduate programme"
  now count as entry level; "specialist" no longer counts as senior. Job Matches and the Dashboard tag each job as
  Entry level / Senior / Lead / Manager (no tag when the title doesn't say). Senior roles are **ranked lower, never hidden**:
  the level penalty now applies to the whole Best-fit score instead of only its similarity half.
- `b119d65` **Graduate-level job queries** (A7): `fetch_live_jobs.py` adds 10 Malaysian queries (junior developer,
  fresh graduate IT, IT intern, junior data analyst / network engineer / QA tester, technical support graduate, Android iOS
  developer, software engineer in Penang and in Johor), so more live openings suit fresh graduates. "mobile app developer"
  removed (0 usable jobs). 32 queries in total. Superseded by `32b2415`: most of these returned
  non-ICT or duplicate jobs, which led to generating queries from market data.
- `947b39c` **Duplicate live jobs (F9).** One rule for "same job" (title + company + location, ignoring case,
  punctuation and spacing) in `app/services/job_keys.py`. `scripts/tools/remove_duplicate_jobs.py` lists duplicates and deletes
  the extra copies after confirmation, keeping the most recently posted one. `fetch_live_jobs.py` now also skips a posting
  already saved under another id (e.g. from another publisher), and saves each skill only once per job.
- `e0c3423` Small fixes: Gemini AFC warning off, `ModuleSkill.extracted_by` default removed (every script sets
  the real label), unused import, script and migration usage lines updated to the new paths; README and this changelog.
- `536252d` Unused `UserSkillCache` model removed; `migrate_drop_user_skills_cache.py` drops its table.
  A11 run outputs moved to `docs/evidence/` (`a11_run.txt`: all 40 modules old vs new; `dryrun.txt`: the reviewed dry run).
- `8f5a2cd` Backend: scripts grouped by purpose in `backend/scripts/` (`pipeline/`, `live_jobs/`, `tools/`), migrations
  moved to `backend/migrations/`; unused `nlp/recommender.py` and two old test scripts removed. `password_reset_otps`
  kept for the planned forgot-password feature.
- `1f044d7`, `0f1a167` Frontend: pages grouped by role in `src/pages/auth/` and `src/pages/student/` (`employer/` and
  `admin/` to follow); unused `Navbar`, `JobCard`, `SkillBadge`, `Modules` page, `hero.png`, `icons.svg` removed.
- `e4c9912` Module skill prompt keeps the level the description states (A11). Re-extraction run on all 40 modules:
  **468 → 244 skills**; old skills kept in `module_skills_name_only` for comparison.

## 28 Sep 2026 — Phase A: one skill profile, honest module skills

- `c20d8ca` Job description **formatting** (display only) moved from Groq to **Gemini** to save Groq's daily
  limit. All **skill extraction** stays on gpt-oss-120b via Groq, so module and job skills are worded consistently.
- `02fe5cb` **Module skills from the descriptor, not the name** (A11). The old extraction sent only the module
  name, so skills were guessed from the title (e.g. NumPy / Pandas for an intro Python module). New prompt uses
  name + description; `reextract_module_skills.py` added. Dashboard: "Openings you align with" replaces the raw
  skill count. `check_skill_profile.py` diagnostic added.
- `944ddb4` **Dashboard loads its summary from the backend** (A10), same request as Job Matches, so the top 3 always agree.
- `c347a02` **One shared Graduate Skill Profile** (A1, A9): `app/services/skill_profile.py` used by Job Matches,
  Skill Gap and the chatbot; thresholds defined once; profiles with only projects/certifications now work.

## 27 Sep 2026 — Live jobs, audits, embedding cache

- `500bc4e` Second audit fixes (thread-safe embedder, session-expiry handling, input limits).
- `4cee51d` SBERT **embedding cache** saved to disk: restarts no longer re-embed ~2,400 jobs.
- `9df0b1b` First audit fixes F1–F7, F12 (e.g. login required on LLM endpoints, job cache syncs without restart).
- `aff1b5d`, `3aacfe4` Job Matches shows **live jobs only**; one visible score everywhere = **skill coverage**.
- `36c0a7e` **Live jobs via the JSearch API** with trusted-source filtering and real "Apply on …" links
  (migration `migrate_add_live_job_columns.py`).
- `627f2e2`, `0e747bf` Job Detail: evidence source for each matched skill ("Show where these come from").

## 22–26 Sep 2026 — Explainable skill gap, saved grades

- `f6be34b`, `55159a5` Evidence levels on Job Detail (Direct / Related / Partly covered / Missing).
- `f38fb11`, `ec6e8f1` Skill gap reads saved modules from the database; each gap explains why it is missing.
- `91b531f`, `018ba05`, `fdc5f79` Recommendation: pre-computed skill vectors, seniority penalty, subcategory filter, hybrid ranking score.
- `710e02e` Module grades saved per student (`user_modules`), password-reset table (migration `migrate_phase1.py`).
- `78676fd`, `a57184a`, `d811095` Modules tab: grades, unsaved-changes warning.

## 20–21 Sep 2026 — Profile and chatbot

- `0ec012c` **Chatbot** and **Profile** pages (projects and certifications with AI-extracted skills).
- `c64ebb4` 2024 job extraction sample raised from 1,000 to 6,000 jobs.

## 8–18 Sep 2026 — Sprints 1–5: foundation

- Sprint 5 (`3aa1c31` … `7591f39`): Tailwind UI, Dashboard, Job Matches, Job Detail, registration and login polish;
  `3307ca3` job description formatting (migration `migrate_add_formatted_description.py`).
- Sprint 4 (`1ae0d06`): skill gap analysis endpoint with **SBERT** semantic matching.
- Sprint 3 (`37e1124`): recommendation engine and API.
- Sprint 2 — **skill extraction, and why it is an LLM, not spaCy:**
  `05c0530` taxonomy of 463 skills from ESCO v1.2.1 + JobStreet ICT frequency ·
  `efd1958` **spaCy PhraseMatcher** extractor built first · `1dc68de` PhraseMatcher removed ·
  `62ec41d`, `6db6a8b` Gemini extractor (temperature 0) · `d29c4a5` module skills extracted via **Groq** ·
  `f256745` JobStreet cleaning: 8,092 ICT jobs.
- Sprint 1 (`53cf00a`, `e886c37`): FastAPI backend, JWT authentication, PostgreSQL.
