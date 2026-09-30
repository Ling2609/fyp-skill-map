# Changelog

What changed, when, and in which commit. Newest first. Built from `git log` (full detail: `git log --oneline`).
Planning, reasoning and research behind each decision are in the project roadmap and references.

## 30 Sep 2026 — Skill normalisation (A8)

- (this commit) **A8 layer 2**: `scripts/pipeline/decide_skill_merges.py` asks gpt-oss-120b (via Groq, temperature 0)
  whether pairs of close skill names are clearly the same skill ("SQL Server" = "MS SQL Server"; "CSS" ≠ "HTML/CSS").
  Answers are saved in `data/skill_merges.json` so each pair is asked once; resumable; stops at Groq's daily limit.
  All 1,777 pairs asked: 634 judged the same. **Blind test** of the harder pairs (Claude labelled 75 pairs without
  seeing the answers, `docs/evidence/a8_llm_eval.csv`): 41 of 50 "same" answers right (**precision 82%**, target 95%);
  errors were narrower names ("Dart" vs "Flutter Dart"), versions ("HTML5" vs "HTML"), look-alikes ("Flow Control"
  vs "control flow") and different activities. So `--verify` adds a second, stricter check of every "same" pair
  (Chain-of-Verification); a pair is merged only if both checks say "same". After `--verify`: 349 pairs kept. Fresh
  blind test of 50 kept pairs (`docs/evidence/a8_llm_eval_verified.csv`): 49 right (**precision 98%**). Trade-off:
  stricter means some real synonyms stay separate (lower recall), which is the safer error for gap analysis.
  **A8 now used in matching.** `canonical_key()` in `app/services/skill_names.py` = rule key + verified LLM merges
  (groups are never chained across a pair judged different; human decisions in `data/skill_merge_overrides.json`
  win). The graduate profile, job skills (duplicates in one job removed) and the skill gap page all compare by it:
  a job skill with the same canonical key as a graduate skill counts as a direct match, whatever SBERT says.
  A merged skill keeps every spelling (`SkillEvidence.spellings`) and each one is compared, so merging never loses a
  match (keeping only one spelling had dropped a Nokia job from 9/12 to 8/12 on her profile).
  `scripts/tools/compare_match_pages.py` shows, for one job, each skill's best match on both pages.
  Also fixed: "Node.js Development" and "Vue.js framework" now get the same key as "Node.js" and "Vue.js".
- `78b7409` **A8 analysis.** `scripts/tools/check_skill_mapping.py --taxonomy`: mapping the 8,305 skill names onto the
  ESCO-based taxonomy matched only ~15% of skill uses exactly, and SBERT suggestions never reached 95% precision in
  any similarity band (110 labelled rows, `docs/evidence/a8_mapping_sample_labels.csv`, `a8_taxonomy_summary.txt`).
  So A8 groups the database's own skill names instead: rules in `app/services/skill_names.py` ("Power BI" = "PowerBI"
  = "Microsoft Power BI", "React JS" = "React", "Python programming" = "Python"); the default report shows the
  groups and counts the close pairs an LLM check would need.
  First run on her data: 9,483 names → 7,828 skills (1,655 spellings merged). 40 random merges checked: 39 clearly
  the same, 1 arguable ("Linux development" → Linux) (`a8_rule_merge_sample_labels.csv`). Two rule bugs found in the
  top groups and fixed: "Microsoft Teams Collaboration" was merged into "Team Collaboration" (vendor prefix now dropped
  only for listed products such as Excel, Power BI, Kafka) and "Methodologies" ≠ "Methodology" (plural "-ies" added).

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
