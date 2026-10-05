# Changelog

What changed, when, and in which commit. Newest first. Built from `git log` (full detail: `git log --oneline`).
Planning, reasoning and research behind each decision are in the project roadmap and references.

## 5 Oct 2026 — Job Detail shows why each skill is asked for (the ad's own words)

- (this commit) Skill Gap Analysis: each missing skill shows the ad's quote under it ("From the ad: "Good
  programming skills in Android Native language Java and Kotlin""), wrapped to 2 lines; skills you have and
  nice-to-have skills show it on hover. Objective 3 (explainable gap): the quotes were saved since Stage 1 but never
  shown. Jobs extracted before Stage 1 have no quote and look as before.
- `/skillgap/` returns `ad_quote` on matched, missing and nice-to-have rows (`job_requirements.unit_quote()`: an
  either-or group shares one quote). Chosen from two layouts side by side (always shown vs a "Why?" toggle): always
  shown, so the reason needs no click.
- Tested: endpoint on a test database (quotes returned, Job Matches unchanged), lint, production build.

## 5 Oct 2026 — Tidy rules for job skills (found in the first bulk run)

- (this commit) New `app/services/job_skill_tidy.py`, run by `job_skill_store.check_job_skills()` (so the bulk run
  and the live-job fetcher both use it). Four rules, all from the quote, level and ad text, no Groq:
  1. a hard skill whose quote does not name it is rejected (Harumio "Redis" quoting the tag line);
  2. "required" from a duty becomes "unspecified" (under "Responsibilities" / "What you'll do", or an unheaded task
     sentence, unless it has requirement words);
  3. skills listed as options in one quote ("A, B or C", "e.g. A, B", "such as A, B") become one either-or group;
     "and" lists and partly extracted lists are left alone;
  4. one skill named with and without describing words at the end ("CI/CD" + "CI/CD pipelines") is merged under
     the plain name, keeping the strongest mention.
  Options dropped because another required skill already meets the choice (F25) are now printed, never silent.
- New `scripts/pipeline/tidy_saved_job_skills.py`: the same rules over jobs already saved (dry run, `--save`,
  `--undo`); running it twice changes nothing.
- `extract_job_skills_v2.py`: shows each tidy change on the job's lines and a tidy total; the summary now divides
  by the ads actually processed (it divided by all 214 when the run stopped at the daily limit).
- `evidence.locate()` factored out of `cue_level()` (same behaviour).
- Tested on 52 real ads with full text (1,537 skills): 4 rejected, 89 duty levels changed, 33 skills grouped,
  11 names merged; every change read by hand. An independent review found 5 bugs (e.g. "What you'll do" headings
  not recognised, siblings merged through a shared base, "Java" accepted for "JavaScript"); all fixed, 46
  test cases pass, second pass changes nothing on all 61 job runs; bulk script and backfill run end to end on a
  test database with a stand-in model.

## 5 Oct 2026 — F25: strongest level per skill; live-job fetcher on the evidence extractor

- (this commit) F25: the evidence extractor kept only the first mention of each skill, so a skill named in the
  duties before the requirements was saved as "unspecified" instead of "required", an either-or group could lose a
  member (the rest became separate requirements = false gaps), and a skill whose first quote failed the check was
  lost even if a later mention was real. Now every mention is quote-checked on its own, groups are checked with all
  mentions present (a group = label + quote), and `evidence.merge_mentions()` keeps one entry per skill: strongest
  level, a group dropped when one of its skills is also asked for on its own. Groups that share a skill are NOT
  joined ("any of Python, Java, C#" would count a Java-only student as meeting both = false "has it"); the shared
  skill stays in its first group, so a false gap is the accepted error (precision first).
- `scripts/tools/count_shared_groups.py` (read-only, no Groq): upper bound on how many ads offer one skill in two
  either-or choices, to report that limitation with a number.
- New `app/services/job_skill_store.py`: check + merge + save, shared by `fetch_live_jobs.py` and
  `extract_job_skills_v2.py`, so both save identical skills.
- `fetch_live_jobs.py` uses the evidence extractor (quotes, type, level, either-or groups; `extracted_by` =
  the prompt version, so `--all-live` skips these jobs), extracts before writing the job, saves job + skills in one
  commit, needs ≥ 3 checked hard skills, and stops cleanly at Groq's daily limit (`--use-cache` resumes).
- Tested without Groq (stand-in model): 8 merge cases (case 5: Java-only student no longer counted as meeting both choices) × 20 shuffled orders; fetcher on a test database (limit hit
  on day 1, resume on day 2, no job without skills); bulk script dry run, `--save`, resume, `--undo`.

## 2 Oct 2026 — Training set v2: candidates and label merge (labelling in progress)

- (this commit) `build_pairs_skillmap.py`: 1,200 candidate pairs from 2,348 SkillMap job skills (close 650, word-overlap
  hard negatives 350, far 100, abbreviation merges 100), each in both orders (2,400 rows); all 511 reference-set skill
  keys left out. Abbreviation pairs have a median SBERT cosine of 0.29, i.e. SBERT does not see "WAF" = "Web
  Application Firewalls".
- `judge_reference_pairs.py`: `--pairs`, `--out-dir`, `--batch`, so the same blind judges label the v2 pairs.
  Training judges are gpt-oss-120b and Qwen3.8-27B; Claude, the third judge of the test set, stays out of training.
- `merge_training_labels.py`: keeps a pair only if both judges give the same label in both orders and the orders
  mirror; BROADER → RELATED; output in the v1 format for the notebook. Labelling runs over several days (free Groq
  tier, 200k tokens per model per day; 678 / 2,400 rows by gpt-oss on day 1).
- Safe save in `judge_reference_pairs.py` (temporary file, then swapped in), so an interruption can never leave a
  cut-off label file. Qwen labels complete (2,400 / 2,400); gpt-oss 838 / 2,400.
  
## 2 Oct 2026 — Abbreviation dictionary (A8 add-on)

- (this commit) `scripts/pipeline/find_abbreviations.py`: short form ↔ long form pairs ("RAG" = "Retrieval-Augmented
  Generation") from 2,660 job ads (Schwartz & Hearst 2003 letter check, word initials first) and ESCO alternative
  labels; spelling variants grouped; only meanings a SkillMap skill uses (270). 66 auto (one meaning, ≥ 2 ads), 204
  judged by gpt-oss-120b (usual meaning in ICT ads?), every proposed pair checked by Qwen3.8-27B; merged only if
  both agree, at most one meaning per short form → 155 merges (models disagreed on 22). Author blind check of 20
  merged pairs: 19 agree (95%). Merges written to `skill_merge_overrides.json`; fixes duplicates such as LLMs /
  Large Language Models within one ad.

## 2 Oct 2026 — Reference-set result: the v1 relationship model does not beat cosine on real pairs

- (this commit) `merge_reference_labels.py`: three judges merged; Fleiss' κ 0.47; 204 unanimous pairs (79 SATISFIES,
  30 RELATED, 95 NOT), 374 with a 2-of-3 majority. Author spot-check of 50 unanimous pairs: 40 agree, 5 disagree,
  5 unsure (89% of decided); all 5 disagreements are general → specific pairs (e.g. project management → IT Project
  Management) that the guide labels BROADER (= NOT) and the author sees as RELATED.
- `evaluate_reference.py` on the 204 unanimous pairs: cosine macro-F1 0.575, "has it" precision 0.58 / recall 0.79,
  45 false "has it"; **model (esco_onet, 10 epochs) macro-F1 0.416, precision 0.49 / recall 0.96, 79 false "has it"**,
  and only 63% right on clearly unrelated pairs (< 0.55). The 374-pair set shows the same. The model is
  overconfident on pairs that share words (Backlog management → Log management 0.99), so a confidence threshold
  does not help (precision 0.52 at 0.9). Cause: trained on ESCO/O*NET phrasing with easy negatives (domain shift).
  Not used in the app; next: training set v2 from SkillMap's own skill names with hard negatives.
- Stage 1 v8 on 10 unseen live ads (seed 7, appended to `stage1_dryrun_evidence-v8.csv`): every sentence answered in
  all 10 ads, 0 quotes rejected, about 31 skills per ad. Seen: duplicates within an ad (LLMs / Large Language Models)
  and over-split lists (projector, speaker, microphone…) → to measure in E1.
  
## 2 Oct 2026 — Reference set of real SkillMap pairs (Stage 2B), three judges

- (this commit) `scripts/skill_relations/sample_reference_pairs.py`: 400 pairs "module skill → job skill" from the
  database, picked per SBERT cosine band instead of at random (real matches are rare among 209 × 7,018 candidate
  pairs), skills seen in training and same-A8 pairs left out, at most 3 pairs per skill, rows shuffled. Band sizes
  saved for weighting (0.85+ 69 · 0.75–0.85 255 · 0.65–0.75 784 · 0.55–0.65 2,292 · < 0.55 1,463,272), so results
  are reported per band and any overall figure is weighted. Output `data/skill_relations/reference_pairs_v1.csv`.
- `scripts/skill_relations/judge_reference_pairs.py`: one LLM judge per run with the label guide (names only).
  Judges: Claude (labelled in the chat, `label_claude.csv`), Qwen3.8-27B on Groq (`label_qwen.csv`) and
  gpt-oss-120b on Groq (`label_gpt_oss.csv`).
  Gemini was planned but dropped as a judge (3.8 Flash overloaded, 2.5 Flash retired for new users, flash-lite too
  small) and stays on job-description formatting only. Agreement: Fleiss' κ 0.47 (moderate; pairwise Cohen's κ
  0.40–0.53); 204 / 400 pairs unanimous on the 3 training classes (high-confidence set), 374 with a 2-of-3 majority.

## 1 Oct 2026 — Small fixes

- d24d998: Job Matches sort hints in plain words ("Most skills matched" no longer says "required", since jobs
  with no required skills are scored on their listed ones). CHANGELOG: v1 pair counts corrected to 6,101
  (4,242 / 901 / 958).
- (this commit) This entry, left out of d24d998.

## 1 Oct 2026 — Skill relationship model: first training run (Colab)

- (this commit) Trained on `pairs_esco_onet_v1.csv`, 3 seeds. Test macro-F1: SBERT cosine (today's method) 0.490;
  model 4 epochs 0.744 ± 0.006; **model 10 epochs 0.770** (seeds 0.770 / 0.770 / 0.769). Epochs chosen on val,
  not test (best val mean 0.763 → 0.780); val plateaus after ~epoch 5, so the limit is the data (noisy ESCO/O*NET
  labels), not training length. SATISFIES precision 0.87 → 0.84, recall 0.52 → 0.78. Direction test (268
  NARROWER/BROADER pairs): model 0.750, cosine 0.500 (cosine scores both orders the same).
- Results in `docs/evidence/relation_model/` (`esco_onet_4epochs.json`, `esco_onet_10epochs.json`). The trained
  model (`backend/data/relation_model_esco_onet/`, ~90 MB) is not in git; rebuild it with the notebook.
- `make_notebook.py`: default 10 epochs (was 4).

## 1 Oct 2026 — Skill relationship model: training set v1 from public data + notebook

- (this commit) **No LLM needed for a first model** ("distant supervision": labels from existing expert data).
  `scripts/skill_relations/build_pairs_esco_onet.py` builds 6,101 pairs from ESCO v1.2.1 (digital skills: synonyms = SAME,
  skill → broader skill = NARROWER, skill relations and siblings = RELATED), O*NET 31.0 Software Skills (hot
  technologies → their software category = NARROWER, tools in the same small IT category = RELATED), A8's
  verified same pairs, and random unrelated pairs (DIFFERENT); BROADER = NARROWER reversed. Split by skill
  (hierarchy pairs follow the parent; negatives drawn within a split): 4,242 train / 901 val / 958 test.
  Ambiguous ESCO "related" pairs where one name contains the other ("perform data mining" / "data mining") are
  dropped. Known noise: some non-ICT ESCO skills, loose synonyms, broad O*NET categories; negatives are easy.
- `scripts/skill_relations/train_relation_model.ipynb` (Colab): SBERT cosine baseline (0.7 / 0.6) vs a cross-encoder
  fine-tuned from the app's all-MiniLM-L6-v2 (3 classes, class weights, best epoch on val, 3 seeds); reports
  macro-F1, confusion matrix and a direction test (NARROWER vs the same pair reversed). Tested end to end on CPU
  with a tiny stand-in model.

- Naming: folders and files named by purpose like the rest of the repo (`scripts/skill_relations/`,
  `data/skill_relations/`), not by the plan's stage numbers; `docs/stage2_label_guide.md` renamed to
  `docs/skill_relation_label_guide.md`. Pairs are now built in a fixed order (Python sets were iterated in a
  different order on every start), so every run gives the same file: 6,101 pairs.

- Fixed: `build_pairs_esco_onet.py` read `skill_merges.json` without `encoding="utf-8"`, so on Windows one
  A8 name came out garbled ("Wiâ€‘Fi management"); found by running the script on Windows and comparing files.

## 1 Oct 2026 — Stage 3A revised: unspecified skills are a fallback

- (this commit) The coverage % now counts **required** hard skills only. Unspecified skills are used only when an
  ad requires none ("of listed skills"), and preferred only when it has neither ("of preferred skills"). Evidence
  (v8 dry run, 6 unseen ads): sentence-by-sentence extraction labels most duty phrases "unspecified" ("URL
  structure", "Escalation management"; ~40 in one ad), which diluted the % for every student; on NEXTDC × 4 the
  required skills were near-identical (18/18/18/22) while the items that changed between runs were all
  unspecified. Old skills without a level still count as before (40-response regression identical); tested on
  seeded jobs with required, unspecified-only and preferred-only skills.

## 1 Oct 2026 — Fix plan, Stage 1: sentence-by-sentence extraction (v7)

- (this commit) The second "what did you miss" pass (v6) did not help: NEXTDC × 3 gave 39, 24 and 12 hard skills
  (mean Jaccard 0.44 vs 0.43 before; `docs/evidence/stage1_dryrun_evidence-v6.csv`). The first pass stops part-way
  through the ad at random, and the second pass repeats that randomness. v7 sends the ad as numbered sentences,
  each with its section heading, and the model must answer for every sentence number; code checks the numbers,
  re-asks only for skipped sentences and prints "sentences answered: X/Y". Long ads go in batches of 45.
  `evidence._segments(include_headings=True)` keeps heading-like lines (a short "Python, SQL, Docker" line was
  being dropped as a heading), and "Desirable: Kafka." with text after the colon is no longer a heading.
- v8, the actual cause: NEXTDC × 3 on v7 gave 2 / 34 / 3 hard skills. The two bad runs were exactly the ones with
  Groq "Failed to validate JSON" errors and answered only 8 and 9 of 34 sentences; the good run answered 34 of 34.
  gpt-oss is a reasoning model whose hidden reasoning shares the output budget (Groq docs: the default "may be
  too low for complex reasoning"), so long reasoning cuts the JSON short. Now `max_completion_tokens=16384` and
  `reasoning_effort="low"` (dropped if Groq refuses it), and each call reports finish reason and output tokens
  ("calls: stop/1234") so a cut-off answer shows up in the dry run.
  Result (NEXTDC × 3): 34 of 34 sentences answered in every run, no cut-off answers; hard skills 33 / 47 / 44,
  mean Jaccard 0.71 (was 0.43), 29 in every run. The remaining differences are granularity (product models such
  as Juniper EX / QFX listed in two runs) and duty-like items (config backup, bulk changes). The stability report
  now also shows the required + unspecified skills alone, the ones the coverage % counts.

## 1 Oct 2026 — Fix plan, Stage 2: label guide

- (this commit) `docs/stage2_label_guide.md`: one written rule set for SAME / NARROWER / BROADER / RELATED /
  DIFFERENT (student skill → job skill: "would a recruiter accept that having A means having B?", asked both
  ways), tie-break rules (cautious label wins), 14 worked examples. Used by the LLM labelling prompt, the three
  judges of the reference set and the author's spot-check, so labels mean the same thing everywhere.

## 1 Oct 2026 — Fix plan, Stage 3A: how job skills count

- (this commit) **Required skills = the shown %; the rest shown apart** (`app/services/job_requirements.py`, used
  by Job Matches and Job Detail). Coverage counts hard skills that are required or unspecified; an either-or
  group ("C# or Java") counts once, met by any member. Preferred skills: a "Nice-to-have skills" box on Job
  Detail (bonus, not in the %) plus a small ranking bonus (at most +0.05, less than one level step). Skills the
  role will teach and soft skills are left out of the % and not listed (her review: "you'll learn on the job"
  reads oddly; soft skills are already in the description). Skill Gap headings say "Required skills you're
  missing / you have". A job with no required skills is scored on its preferred ones ("of preferred skills"). Skills extracted before Stage 1 have no level, so they count as
  before: the 40-response regression (old vs new code, same data) is identical. Tested on seeded jobs with
  levels and in the browser. Research: references.md "Scoring must-have vs nice-to-have".

## 1 Oct 2026 — Fix plan, Stage 1: job skills with evidence

- (this commit) **Saving the new extraction** (`extract_job_skills_v2.py --save`, not run on the real data yet):
  replaces a job's skills with the checked ones (one row per skill by A8 key, strongest level kept), copies
  the old rows once to `job_skills_pre_stage1` so `--undo` can restore them, and keeps the old skills when the
  new extraction has fewer than 3 hard skills. `--all-live` resumes where it stopped and ends cleanly at Groq's
  daily limit. Fixed: the reject loop reused the run counter `r`. Tested on a test database with a stand-in
  extractor (save, too-few-skills, daily limit, resume, undo).
- (this commit) `compare_scoring.py`: output labels follow the thresholds (they still said "sbert >= 0.8" and
  "0.6-0.79" while the code uses 0.7); found by an external review.
- (c0379d5) **Dry run of evidence-based job extraction** (`scripts/pipeline/extract_job_skills_v2.py`, no
  database writes). The LLM must return each skill with a verbatim quote from the ad, its type (hard / soft) and
  level (required / preferred / trained / unspecified), using Groq's strict JSON schema. `app/services/evidence.py`
  checks each quote is in the ad (fuzzy, 85%, because LLMs tidy text when quoting) and rejects skills without one,
  and reads cue words in the quote's sentence and section heading to flag level disagreements. Tested on the Nokia
  ad text: an invented "Troubleshooting" is rejected, reworded quotes still match, headings like "Nice to have:"
  and "What You'll Learn" set the level of the list under them.
- Prompt v2 after the first dry run (10 live ads: 249 skills, 9 rejected, ~2× the old count). v1 listed duties
  ("Escalation", "Research"), work conditions ("Willingness to travel"), generic parents ("Programming language"
  next to Python) and joined quotes with "..." (so Splunk, Docker and others were rejected though they are in
  the ad). v2 adds a rule for each; the quote check now splits on "..." and needs every part in the ad. The dry
  run reads the full live text from `data/live_jobs_cache.json` (the database copy is cut at 6,000 characters).
- Prompt v3 after the Nokia re-run (29 skills, 0 rejected): team and track names ("Customer Engineering",
  "Service Delivery"), personality traits ("Curiosity", "Self-driven") and one idea listed twice ("Automation" +
  "Network automation") are now excluded; what a graduate programme covers counts as "trained". `--print-ad`
  prints the checked ad text.
- Prompt v4 after 20 more ads (seeds 42 and 7: 383 skills, 0 rejected, ~19 per ad; the "..." fix kept Splunk,
  Docker, Kubernetes): ads often accept alternatives ("C#, Python, or equivalent", "OSCP or CREST CRT"), and
  listing each as a separate skill gave a student with one of them a false gap for the other. Each skill now
  has `alternative_group`; a group is kept only if its members quote the same words and those words offer a
  choice ("or", "such as", "e.g."), otherwise each skill counts on its own. Dry-run CSV is now one file per
  prompt version.
- Prompt v5 after the v4 re-run (seed 7: 167 skills, 13.1 hard-skill requirements per ad, 5 either-or groups,
  all correct): recall fell (NEXTDC Network Engineer 22 -> 5 skills; Nokia's programme content dropped). Cause:
  v2 had removed v1's "list every skill the advert asks for or will teach", leaving only "do not list" rules.
  Restored. `--repeat N` extracts the same ad N times and reports stability (Jaccard of hard skills);
  `--company` picks one ad when titles repeat.
- v6, a second "what did you miss" pass (gleaning, Edge et al. 2024). v5 fixed the prompt (Nokia: programme
  content now "trained", no tracks or traits) but `--repeat 3` on the NEXTDC ad gave 14, 8 and 31 hard skills
  (Jaccard 0.43, 8 in every run): runs stop early at random. The second pass shows the model its own list and
  asks only for missing skills; each item records its pass, so the gain is measurable. `--no-glean` for one pass.
- Storage (same commit): `job_skills` gets `evidence_quote`, `level`, `skill_type`, `match_score`
  (`migrations/migrate_add_job_skill_evidence.py`, plus the index on `job_id` from F15). Full ad text:
  `scripts/tools/restore_full_descriptions.py` puts back the text cut at 2,000 / 6,000 characters, and
  `fetch_live_jobs.py` no longer cuts new live ads. Tested on a fresh database with the old table layout:
  migration safe to rerun; only cut-off copies of the same ad are replaced; second run changes nothing.

## 30 Sep – 1 Oct 2026 — Only skills you have count (step 2)

- (this commit) Comments and evidence updated to the 0.7 threshold used since `7aea173` (they still said 0.8).
- `7aea173` **Threshold 0.7, not 0.8**: on the Nokia job (about 7 of 12 skills really held) 0.6 counted 9 (2 wrong),
  0.8 counted 2 (missed 5), 0.7 counts 6 (1 wrong); the labelled 0.70-0.79 band was 15 of 16 at least mostly right.
  Plus the audit fixes: Dashboard message when nothing is missing, full skill name on hover, chatbot stops re-asking
  on an empty profile, dead code removed, script guards.
- `0cb287e` **Coverage counts only skills the student has**: the same skill (A8) or SBERT above the threshold. Before,
  any skill at 0.6 counted, and 52% of all matches were only related (0.6-0.79); in a labelled sample only 9 of 60 related
  pairs were the same skill, while 29 of 30 pairs at >= 0.8 were (`docs/evidence/step2_scoring_summary.txt`,
  `step2_related_sample_labels.csv`). Partial credit (0.25-0.5) was rejected: any value is a judgement that can't be
  measured without manual labels. **Skill Gap is now strict and plain**: skills you have (with the module and grade
  they come from, "via X" when worded differently) and skills to learn, with no "partly covered" / "builds on" reasons
  and no "Also mention in your CV" (weak explanations mislead users, Papenmeier et al. 2019). Related knowledge still
  lifts a job in Best fit via profile similarity. Dashboard: "Openings you align with" replaced by **"Skill to learn
  next"** (the skill missing most often in your top 20 matches; `skills_to_learn` in `/recommend/`). Job Matches no
  longer shows a saved old list (always fetches fresh, keeps the last search); the chatbot fetches its top jobs itself.
- `2108fd3` `scripts/tools/compare_scoring.py`: coverage under different rules for which matches count, sensitivity
  table, random sample of related pairs (`docs/evidence/step2_related_sample.csv`, labelled in `..._labels.csv`).

## 30 Sep 2026 — Skill normalisation (A8)

- `13641f3` **A8 layer 2**: `scripts/pipeline/decide_skill_merges.py` asks gpt-oss-120b (via Groq, temperature 0)
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
