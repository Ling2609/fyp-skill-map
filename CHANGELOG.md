# Changelog

What changed, when, and in which commit. Newest first. Built from `git log` (full detail: `git log --oneline`).
Planning, reasoning and research behind each decision are in the project roadmap and references.

## 10 Oct 2026 — Clearer descriptions for project, investigations and four intro modules

- (this commit) Her extraction run (158 modules, 818 skills) showed padded skills caused by the descriptions' wording:
  every project module gave "<X> solution design / development / evaluation", every investigations module
  "Literature review; Critical analysis; Research proposal writing" plus a vague "<X> investigation", and four intro
  modules gave "awareness"-type skills (Threat and attack awareness, team role awareness, metaverse applications
  awareness, decision support understanding). 34 descriptions in `data/modules.json` rewritten to name concrete
  content (e.g. Cyber Security project: threat modelling, building a security tool, penetration testing; Data
  Analytics project: data cleaning, predictive models, dashboard). The 40 SE modules are unchanged (A11 evidence).
- New `scripts/pipeline/refresh_module_descriptions.py`: copies the new text into the database for those 34 modules
  only (or `--codes`), finds the skills again with the same prompt, keeps skills an admin added, and skips modules
  already marked Reviewed. `--dry-run` lists old skills and new text. Resumable; a second run changes nothing.
  **Run, from `backend/`: `python scripts/pipeline/refresh_module_descriptions.py`** (34 Groq calls).

## 10 Oct 2026 — All 17 computing programmes

- (this commit) Her request: add every programme in APU's July 2026 Computing brochure, not only Software Engineering.
  `data/programmes.json` holds the 17 programmes (7 IT, SE, 4 CS, 2 Cyber Security, 2 Interactive Media, Game
  Development) with each module's year and kind; `data/modules.json` grows from 40 to 198 modules (158 new, with
  representative descriptions; see `data/README.md` for how names were joined and codes chosen). 620 programme links.
- `programme_modules.kind`: a module's type now belongs to the programme (Mathematical Concepts for Computing is common
  in IT, specialised in SE). `migrations/migrate_all_programmes.py` adds the column, the modules and the programmes;
  running it twice changes nothing; links an admin made are kept.
- Students: `GET /modules/` now needs sign-in and returns the student's own programme's modules, with that
  programme's year and type, in brochure order (whole catalogue before setup, and for other roles).
- Admin > Academic structure: a programme picker (with each programme's "to review" count); year and type show and
  are edited per programme; a shared module says which other programmes teach it (its description, skills and review
  apply to all). Removing takes a module out of the picked programme only; it is deleted when no programme teaches
  it any more. Intakes are added to the picked programme. The dashboard's "Review" link opens the first programme
  with modules to review.
- `scripts/pipeline/extract_module_skills.py` rewritten: finds skills only for modules that have none (same prompt
  and label as Admin "Find skills again"); it no longer re-creates modules from the JSON, which would have deleted
  their programme links. `reextract_module_skills.py` now skips modules an admin reviewed or added skills to.
  **Run, from `backend/`: `python migrations/migrate_all_programmes.py`, then
  `python scripts/pipeline/extract_module_skills.py`** (158 Groq calls; resumable if the daily limit stops it).

## 9 Oct 2026 — Skills-employers-want list: whole names, aligned bars

- (this commit) Her review of ab69b13: names were cut at 9rem. The list is now a table: the name column is as wide as
  the longest name in the list, so every name shows in full and every bar starts at the same point with the same
  length. A name longer than 16rem (9rem on a phone) wraps to a second line instead of squeezing the bars; a bar is
  never shorter than 4rem. Measured with short, long and very long names at 1440px and 390px: one start point, one
  length, nothing cut.

## 9 Oct 2026 — Skills-employers-want bars fill the row

- (this commit) Her review: in "Your skills employers want most" a short bar at the far right left a wide gap after
  the skill name. Each row is now name | bar across the middle | %, so the bars are long enough to compare. The bar
  stays out of 100% of the jobs (a short bar is the honest reading).

## 9 Oct 2026 — Skill-name merges after the re-extraction: 79 added, 6 refused

- (this commit) Results of review_skill_merges.py on her data (evidence for the report):
  - decide_skill_merges.py: 418 new close pairs since the re-extraction; 126 "same", 47 confirmed by --verify.
  - review_skill_merges.py: 600 further pairs in use (78 disputed, 297 near, 225 plus one word); both judges
    (gpt-oss-120b, Qwen) said "same" for 85; they disagreed on 72 (not merged).
  - Blind sample of 20 of the 85: author 16 agree, 4 unsure, 0 disagree. Second reading of the same 20 by Claude
    (a third model, not the author): 18 agree, 2 disagree (ETL / ETL/ELT; Automation / Process automation: one is
    broader, label guide rule 3).
  - Kept apart ("different"), by label guide rules 1, 3 and 4, after reading all 85: ETL / ETL/ELT, Automation /
    Process automation, Software development / Software programming (would also have joined "Software development"
    with "Coding"), Team management / team leadership, Usability evaluation / Usability testing, Inventory management /
    Inventory Control. 79 merges stay, including CI/CD / CI/CD pipelines.
  - Largest merged group: 6 names (the automation-workflow group); no generic skill joins a whole area.
- review_skill_merges.py: "unsure" in the author's sample now stops a merge, like "disagree" (label guide rule 1).

## 9 Oct 2026 — Review script for skill-name duplicates the merge step missed

- (this commit) `scripts/pipeline/review_skill_merges.py`: after the Stage 1 re-extraction students saw the same skill
  under two names ("Docker Containerisation" / "Docker Containers", "CI/CD" / "CI/CD Pipelines"). It lists three kinds
  of pairs, only names used in live jobs or profiles, most used first: (a) disputed: decide_skill_merges.py's first
  check said "same", its stricter second check did not; (b) near: similarity 0.75-0.85, just under its cut-off;
  (c) plus one word: one name is the other plus one word, whatever the similarity. Two judges from different model
  families (gpt-oss-120b and Qwen via Groq) label each pair with the label guide's rules; a pair is merged only if
  both say "same" (as for the abbreviations). The author checks a blind sample; a pair she disagrees with is written
  as "different" and never merged. `--apply` writes into `data/skill_merge_overrides.json`.
  Tested on a copy with fake judges and a fake embedder: 13 checks (all three kinds found, author decisions skipped,
  resume, disagreeing judges = no merge, blind sample, author veto, apply twice = no duplicates, app sees the merge).

## 9 Oct 2026 — "Your skills employers want most" counts each employer skill once

- (this commit) Her review of 1f42ff4: the card listed her own skill names, and every one that covered the same job
  requirement got credit, so "Java Programming", "Advanced Java Programming" and "Enterprise Java Development" all
  showed (17%, 16%, 15%) for mostly the same "Java" ads; "Python Data Analysis" and "Python Programming" likewise.
  Now it counts the employers' skills (canonical key), once per job, under the spelling employers use most
  ("Java", "Python", "SQL"), the same names and rule as the goal card. For a skill she has, its % equals the goal
  card's "asked by" %. The Docker merge stays (it is still the same skill everywhere else).

## 9 Oct 2026 — Student role tidy-up: evidence labels, evidence strength, one Docker skill, phone layout

- (this commit) Small student items before the employer flow:
  - **Where skills come from (A6):** Modules says "Skills set by your programme" (from the module descriptions,
    reviewed by the career office; the student only enters grades). Projects, Certificates and Awards say
    "Self-declared" (read by AI, confirmed by the student). Hover for a one-line explanation. Not "from university":
    students enter their own grades (decided 7 Oct).
  - **Grade as strength of evidence (B4):** in Job Detail's "where these come from", a module shows its grade with
    "strong / good / fair evidence" (A and A- / B+ to B- / below); certificates, projects and awards say
    "Self-declared". The grade never decides a match.
  - **One Docker skill:** "Docker Containerisation", "Docker Containerization" and "Docker Containers" are one skill
    (two human "same" decisions in `data/skill_merge_overrides.json`; the LLM's second check had not confirmed them).
    Plain "Docker" stays separate. Restart the backend to load it.
  - **Phone layout:** 16px side margins below 640px (32px above); AI Assistant: past chats start closed and open
    over the chat, the mode switch wraps under the title, wider message bubbles; Job Matches: the Search button no
    longer runs off the edge; Modules: the grade box drops under the module name.

## 9 Oct 2026 — AI Assistant grounded in the job's skill gap and the career goal (E3)

- (this commit) "Learn →" on a job now passes the job's id (`job_id`), not only its title. The backend reads that
  job's skill gap itself (`analyse_skill_gap`, the same numbers Job Detail shows) and gives the AI: the job and
  company, "has X of N", the skills she already has for it and where from (module + grade, project, certificate),
  the skills still missing, nice-to-haves, and the ad's own words about the skill she wants to learn. Every chat
  also gets her career goal. A job that has gone, or an empty profile, just leaves those lines out.
- The Skill Development prompt now builds on what she already has and suggests a project that covers other missing
  skills too; it says whether the ad requires the skill or only lists it as nice to have.
- A saved chat keeps the job id, so reopening it keeps the same grounding. The unused `&reason=` link part removed
  (the chat page never read it).
- The message box grows with its text (up to about 7 lines, then scrolls), with normal line spacing: the
  counsellor's pre-typed question showed as one cut-off line with its own scroll bar. Send stays at the bottom.

## 9 Oct 2026 — Loading screens in the shape of each page

- (this commit) Her review: an empty box or a lone spinner "doesn't look nice". While a page loads it now shows grey
  bars in the shape of its real layout, so nothing jumps when the content arrives (NN/g, skeleton screens; the pulse
  stops for anyone who turns on reduced motion). New `components/Skeleton.jsx` (Bar, RowSkeleton, LoadingLabel for
  screen readers).
  - Dashboard: goal card, both right-hand cards, Continue a chat; the Top job matches list while it loads.
  - My Profile: header, tabs and list; the Modules tab: year buttons and module rows with a grade box.
  - Job Matches: header, search bar, filter buttons and job cards on first load. A search keeps its step text and %
    (it can take over 10 s, when a progress indicator is the better choice) with job cards underneath.
  - AI Assistant: grey rows in the past-chats list (it used to say "Your chats will be saved here" while loading).
- Removed `frontend/App.jsx`, a stray copy of `frontend/src/App.jsx` added by mistake in 0b08dc1 (never used).

## 9 Oct 2026 — Fuller Dashboard cards; narrower sidebar

- (this commit) Her review of b060ac1 on her own data:
  - No goal: the 5 job categories that fit best (was 3; at most ~6 radio buttons, more go in a drop-down), and the
    goal drop-down lists every category best fit first with its fit ("Testing & Quality Assurance · 5 of 10 skills").
  - "Your skills employers want most" shows up to 10 (the card fills; the rest scroll).
  - Card titles larger on white with a clear line under them (a grey band matched the page; a blue band looked
    "selected"); "View all" on the subtitle line; darker lines between rows.
  - 10 of 10: "You have every skill on this list. Well done!" and "See the N jobs and apply".
  - Under "Still to learn": a skill counts once a project, certificate or grade in My Profile shows it (the ticks
    only choose what to plan).
  - Goal drop-down wider, so long category names aren't cut.
  - Sidebar 224px → 192px (empty space after the labels). The admin link "Academic structure" is now "Academics" so
    it still fits beside its badge (the page title is unchanged).

## 9 Oct 2026 — Career goal; one-screen Dashboard

- (this commit) **Career goal** (`users.target_category`, a JobStreet ICT job category; empty = "Open to all ICT
  roles"). Asked once at first sign-in as an optional step 2 (after programme + intake, before the Modules tab), and
  changeable any time from the Dashboard. `PUT /profile/goal` accepts only a category with current live jobs.
  **Run `python migrations/migrate_career_goal.py` from `backend/`** (the API refuses to start until it has run).
- **Dashboard rebuilt around the goal** (`GET /recommend/goal`), fitting one laptop screen; lists scroll inside their
  cards, and cards stack on narrow screens:
  - Goal set: "8/10 of the top skills these jobs ask for" (core + bonus skills only, same matching rule as Job
    Matches), the skills you have, and "Still to learn" with tick boxes; "Plan how to learn X and Y" opens the AI
    Assistant on those skills and the goal; "See the N jobs" opens Job Matches on the goal.
  - No goal: the 3 job categories your skills fit best, "Set as my goal", and "Not sure? Talk to the counsellor",
    which opens the career counsellor with a question already typed (not sent).
  - Top job matches and "Your skills employers want most" say what they are based on (the goal, or all live jobs).
  - Empty profile: invites modules, projects, certificates and awards, not only grades.
- **Job Matches opens on the goal category** (cleared or changed with the category filter as before); the filter row
  wraps on a phone.
- Below 768px the sidebar starts as the icon rail, so phone-width pages keep most of the width.

## 9 Oct 2026 — Programme in the header; module skills use the full row

- (this commit) Her review of d7f612e, to give the module lists more room:
  - Programme, intake and "Change" moved into the page header, on the skill-count line, right-aligned under
    "Links & visibility" (it describes the student; the space was empty, so no extra height). The Year row is back
    to Year 1-3, the unsaved-changes note and Save Grades. On a small window the programme drops under the count.
  - List hints right-aligned ("14 modules · leave blank…", "Tick the ones you took"), upright (no italics).
  - A module's skills, when opened, run across the whole row width (under the grade box too), so fewer lines.

## 9 Oct 2026 — Roomier module lists

- (this commit) "Compulsory Modules" and "Elective Modules" share one line with their hints, so the lists get more
  room (her review of fc13195); clearer lines between module rows.

## 9 Oct 2026 — My Profile header tidied; each module shows its skills

- (this commit) Her review of 12324ef:
  - **Header**: one line about you (name, LinkedIn / GitHub / portfolio links, visibility) with **"Links & visibility"**
    (was "Edit profile": it only changes links and who can see the profile) at its right end, level with the name.
    The skill count sits below in large type ("178 skills found in your modules, …").
  - "Hidden from employers" now amber, like "Visible to employers" is green (words and colour, not colour alone).
  - **Modules tab**: under each module, "3 skills ▾" opens its skills as small chips (closed by default, so rows keep
    their size). Shows why a grade matters: the module's skills come from it.
  - "Import from GitHub" in the same light-blue style as "Links & visibility", with an import icon.

## 9 Oct 2026 — Modules tab shows the grade grid; centred empty tabs

- (this commit) Her review of 50c72da: the Modules tab IS the year-by-year grade grid (no read-only list and side
  panel: one click fewer), with programme + intake and "Change programme" above it. Leaving the tab or the page with
  grades not saved asks first. `ModulesPanel.jsx` replaced by `ModulesEditor.jsx`. First sign-in and `/modules` open
  `/profile?tab=modules`; the address follows the open tab.
- Empty Projects / Certificates / Awards tabs: message centred in the panel, emoji back (🗂️ 🎓 🏆).
- Header: Edit profile on the skill-count line, styled like "Update profile" on Job Matches (blue, pencil icon); a
  line separates the header from the tabs.

## 9 Oct 2026 — My Profile becomes the input page; sidebar follows the flow

- (this commit) Her redesign after several rounds of mock-ups (references.md "Profile layout with many categories",
  "Dashboard redesign and career goal"): My Profile is where a student puts things in; results move to the Dashboard.
  - **My Profile**: the same header as the other pages (name, green "Visible to employers" / grey "Hidden from
    employers", skill count and links; Edit profile on the far right) and four tabs with counts: **Modules**
    (programme + intake on top with "Change programme", graded modules by year, Edit modules & grades panel),
    **Projects** (Import from GitHub, + Add project), **Certificates**, **Awards**. Each tab is one white panel; only
    its list scrolls on a wide screen; tabs wrap, never scroll sideways.
  - **Edit profile**: "Your other profiles" (LinkedIn, GitHub, portfolio) and "Profile visibility" (two switches).
    Headline, About, the Skills card, the checklist and "See all skills" are gone from the page (the columns stay).
  - **Sidebar**: Dashboard, My Profile, Job Matches, AI Assistant (input before results).
  - Setup: "Pick your programme / intake" can't be chosen.
- No migration needed.

## 8 Oct 2026 — One My Profile page, programme + intake setup, Import from GitHub, faster job matches

- (this commit) Her rethink of c721aad: one page instead of My Profile + Skill Profile (clean A mock-up).
  - **My Profile** (`/profile`; `/my-profile` and `/modules` still work): edit where it is shown. Each card has one
    Edit / + Add; a row's ✎ and ✕ appear on hover. Modules & grades open in a wide side panel (`ModulesPanel.jsx`,
    the old year grid unchanged). Side column: "Finish your profile" checklist (6 items; hides itself when done,
    returns if something is removed) and Profile details (links + the two employer switches, which save at once).
  - **Programme + intake**: `GET / PUT /profile/study`. A student without a programme is sent to `/setup` (one step,
    two drop-downs) before anything else; editable later under Edit intro. Decided 7 Oct (references.md).
  - **Import from GitHub**: `GET /profile/github/repos` lists the account's own public repos (1 GitHub call; forks
    left out; repos already added greyed out). Each repo ticked is added through the normal `POST /profile/projects`,
    so its languages (>= 10% of the code) become skills and it can be edited. "+ Add" stays for other projects.
  - Files: `profileForms.jsx` (all pop-up forms), `profileSections.jsx` (cards), `GithubImport.jsx`,
    `StudySetup.jsx`; `Profile.jsx`, `AwardsTab.jsx`, `AboutLinksTab.jsx` removed. Sidebar: one "My Profile" item.
- (this commit) Faster job matches after sign-in: the relation model loads at start-up in a background thread, and
  all jobs' candidate skill pairs are scored in one batch per request (was one model call per job). The backend
  prints `[recommend] X s: N jobs for user U` for each request.
- No migration needed.

## 8 Oct 2026 — Showcase profile: My Profile, Awards, About & links

- (this commit) Supervisor meeting 8 Oct: one profile, like LinkedIn, that gathers portfolio, LinkedIn,
  certifications and awards to show a student's skills and strong points (references.md "Showcase profile").
  - **My Profile** (`/my-profile`, new sidebar item): read-only page built from what the student already entered
    (`GET /profile/showcase`, `app/services/showcase.py`). Top skills list their evidence (module + grade, project,
    certificate, award), which a LinkedIn skill does not have. Employers will see the same page in the Employer flow;
    grades are then hidden unless the student allows it.
  - **Awards** tab on Skill Profile (`AwardsTab.jsx`, `user_awards` table): title, given by, date, what it was for;
    the AI suggests skills, the student keeps or removes them before saving. Award skills count in matching.
  - **About & links** tab (`AboutLinksTab.jsx`): headline, About, LinkedIn / portfolio / GitHub links (checked),
    "Let employers see my profile" (the existing `is_visible_to_employers`) and "Show my grades to employers".
  - Shared chips, pop-ups and buttons moved from `Profile.jsx` to `profileParts.jsx` and `profileUtils.js`, so the
    new tabs look and behave exactly like Projects and Certifications.
- Run `python migrations/migrate_profile_showcase.py` once (safe to rerun).

## 7 Oct 2026 — Run 6 prep: soft labels, every seed kept and averaged, blind set v4, cut-off chooser

- (this commit) After run 5 failed the pass rule (7e6af09), research-backed changes (references.md "How to improve the
  relation model"): run 4 is over-confident (p 0.99 / 0.001) on pairs that share words, and half the labelled pairs
  were thrown away because the two judges disagreed.
  - **Soft labels:** `merge_training_labels.py --soft` keeps every pair with 3+ of its 4 votes (2 judges x 2
    orders) and writes the vote shares as the target (`p_satisfies`, `p_related`, `p_not`): v2 1,153 pairs
    (was 482 agreed), v3 393; pairs with a skill of any blind set v1-v3 left out (47 + 7). Uma et al. 2021;
    Wu et al. 2023.
  - **Notebook:** trains on the vote shares (class-weighted cross-entropy against a distribution), option
    `DROP_SOURCES=skillmap_extend` (the pairs that made run 5 over-correct), saves **every seed**
    (`relation_model_<run>/seed_<n>/`), reports the seed ensemble; installs sentencepiece for DeBERTa-v3.
  - **Seed ensemble in the app and the evaluation:** a model folder may hold `seed_*/` sub-folders; their
    probabilities are averaged (`app/services/model_folder.py`, `skill_relation.py`, `evaluate_reference.py`).
    One-model folders (run 4) work as before. Xu et al. 2020.
  - **Blind set v4** (`sample_reference_pairs.py --set v4`, seed 13; skills of every training file incl. the
    soft files and pairs of v1-v3 left out); `merge_reference_labels.py --set v4`; `evaluate_reference.py --set v4`
    and `--baseline-cutoff` (run 4 stays at 0.8 while a run-6 model uses its own cut-off).
  - **`choose_cutoff.py`:** picks a model's p_satisfies cut-off on v1-v3 (weighted F1, majority labels) before v4
    exists, so the v4 test stays blind.
- Checked offline with a tiny stand-in model (the sandbox can't download models): the notebook runs end to end
  (soft targets on 2,694 rows, 398 extend rows dropped, seed_13/ and seed_42/ saved, ensemble reported), the app
  loads a seed folder ("2 seeds averaged") and caches scores, evaluation and the cut-off chooser read it.

## 7 Oct 2026 — Academic structure: add, edit and remove modules; darker year headers

- (0ce4c25) Her review: modules were only pre-filled by the migration (from `data/modules.json`), with no way to
  add one. Now (one programme, her decision: no "add programme"):
  - **+ Add module** (code, name, year, type, description): saved into the programme, then its skills are found in
    the description straight away (IR Objective 1) and it starts "To review". If the AI doesn't answer, the module is
    still saved with no skills and a note says to use Find skills again later. Duplicate codes refused.
  - **⋯ → Edit details** (name, year, type; the code stays, students' grades are stored under it).
  - **⋯ → Remove module…** (asks first); refused once a student has entered a grade for it, so no profile loses
    skills it has evidence for.
  - Year headers in the list are dark (white on slate) so Year 1 / 2 / 3 stand out; search on its own row.
  - Endpoints: `POST /admin/modules`, `PUT /admin/modules/{id}`, `DELETE /admin/modules/{id}`.
- Checked in a browser at 1333×680 (12 checks, AI extraction replaced by a stand-in): add with skills, list and badge
  update, duplicate code, AI down, edit, remove, removal blocked with students; earlier 17 checks re-run.

## 7 Oct 2026 — Admin, batch 2: Academic structure (module skills review, intakes)

- (c601701) New admin page **Academic structure** (sidebar, badge = modules still to review; her pick A of two
  mock-ups: list and details side by side, Microsoft list/details pattern, references.md "Admin Academic structure
  layout"). No migration: the tables came with `migrate_admin_structure.py`.
  - **Modules:** list by year with "To review" / "Reviewed" (search, "To review" filter); the chosen module on the
    right: description (edit and save; saving marks it "To review" again), its skills (× removes one, "+ Add skill"
    adds one, shown as a white chip "Added by an admin"), "Find skills again" (one Groq call on the saved description,
    same prompt as `reextract_module_skills.py`; skills an admin added are kept; if the AI doesn't answer, nothing
    changes and a message says so), "Mark as reviewed" (moves on to the next module to review). Shows how many
    students have the module. Students' profiles are built live, so a change shows in their matches at once
    (IR Objective 1 with a human review step).
  - **Intakes:** add (code upper-cased, start date; duplicates refused), list with how many students picked each,
    delete only when no student has picked it. Students choose an intake in the first sign-in setup (next batch).
  - New router `app/routers/admin_academic.py` (`/admin/academic`, `/admin/modules/{id}`…, `/admin/intakes`).
  - Dashboard: "Module skills to review" now has a **Review** button that opens the list filtered to "To review".
  - Users: the search box has a magnifying glass and ✕ to clear, like the Job Matches search.
- Checked in a browser at 1333×680 (17 checks, AI extraction replaced by a stand-in because the sandbox can't
  reach Groq): badge, Review link, filter, remove / add / duplicate skill, save description, find again keeps
  admin skills, mark reviewed moves on and the badge drops, AI failure leaves skills unchanged, intakes add /
  duplicate / delete, no page errors; Users page re-checked (19 checks).

## 7 Oct 2026 — Admin Users: filter buttons, one ⋯ menu per row, decision history

- (3f1b6d8) Her review of an external audit and four mock-ups (her pick: B; references.md "Admin Users table"):
  - Filter buttons with counts replace the Role and Status dropdowns: All · Students · Employers · Waiting ·
    Deactivated (one click; the number says what is there). New `GET /admin/users/counts?q=` (counts for the
    current search). Dashboard links (`?role=student`, `?role=employer`) still open the matching filter.
  - One "⋯" menu per row instead of up to three buttons: waiting employer → Approve, Reject…, View history,
    Deactivate account…; deactivated → Reactivate account…, View history; others → View history, Deactivate
    account…. Keyboard: arrow keys, Esc; opens upwards near the bottom of the screen. One-click Approve / Reject
    stays on the dashboard's "Needs your action".
  - View history: a pop-up listing every decision on the account (approved / rejected / deactivated / reactivated),
    when, by whom and why, from `admin_actions`. The reason line left the rows, so every row is one line high.
  - Full width with the spare space shared between Name, Role, Joined and Status and only the ⋯ column narrow
    (measured at 1333 px: gaps 221 / 157 / 158 / 175 px, was one 400+ px gap). "Active" in green; waiting rows
    tinted amber; status chip "Waiting" (short). "Showing the newest 500 accounts" when the server cap is reached.
  - Example reasons changed: "Graduated and left the university" contradicted the scope (graduates are users) →
    "Duplicate account"; reactivate → "Student asked to keep this account".
  - Removed: the measured Actions column and `Select.jsx` (no dropdowns left).
- Checked in a browser at 1333×680 (18 checks): counts, Waiting filter, menu items per state, approve and reject
  from the menu (counts update), deactivate with the new example, reason not in the row, history pop-up, Esc and
  click-outside, last row's menu stays on screen, dashboard link, titles aligned, no page errors.

## 7 Oct 2026 — Admin Users: Actions column only as wide as its buttons

- (6e1b233) Her review: the Actions column kept room for three buttons (Approve, Reject, Deactivate) even when
  the list had only Deactivate. Its width is now measured from the buttons on screen: one button's width for a
  list of students, three when waiting employers are listed. Name takes the spare width; buttons are right-aligned
  so every Deactivate lines up in a mixed list. (A "Last sign-in" column was tried and dropped: not needed for
  the objectives.)
- `ReasonForm.jsx` removed (replaced by `ReasonDialog.jsx` in cee02d7; unzipping had left it in the repo).
- Checked in a browser at 1333×680: students only → Actions 115 px; all accounts → 259 px; titles line up with
  the columns; pop-up checks still pass.

## 7 Oct 2026 — Admin dashboard fills its space; Users table and decision pop-up

- (cee02d7) Dashboard (her review): the two bottom panels spread their rows over the space they have instead of
  leaving a blank foot; when the to-do list is long they shrink back and the page scrolls. "Needs your action"
  shows 3 waiting employers at most, then "and N more employers waiting →" (opens the filtered Users list), so it
  can't push everything else off the screen. Every count card has a second line now: students joined in the last
  30 days, employers waiting for approval, newest live job, modules whose skills were reviewed. Skill gaps show up
  to 8 skills.
- Users (her review; references.md "Admin Users table and decision pop-up"): column titles in a blue strip above
  the list, so they stand out from the page and the scroll bar starts at the first account (the strip follows
  sideways scrolling; screen readers still get real column headings). Status takes the spare width and Actions is
  just wide enough for its buttons, so there's no wide gap between them. Long names and emails are cut with "…".
  The count sits at the end of the filter row, in line with the table (PatternFly). Dropdowns have their own arrow,
  set in from the edge.
- Deactivate, Reactivate and Reject (here and on the dashboard) open a pop-up instead of the cramped in-row box:
  "Deactivate <name>?", one line on what happens, a Reason box (required to deactivate / reactivate, optional to
  reject), Cancel and "Deactivate account" (Carbon danger modal, Primer). Enter confirms, Esc or a click outside
  cancels; a failed save shows its error inside the pop-up. `ReasonForm.jsx` replaced by `ReasonDialog.jsx`.
- Checked in a browser at 1333×680 and 1440×900 (13 checks): columns line up with the titles, the list scrolls
  under the strip, header colour differs from the page, arrow 14 px in, count in line with the table, pop-ups for
  all three decisions (reason rules, Enter, Esc, click outside), sidebar stays put when the dashboard scrolls.

## 7 Oct 2026 — Admin decisions kept with a reason; greeting; full-height dashboard

- (33b2d93) Run `python migrations/migrate_admin_actions.py` once (safe to rerun): new table `admin_actions`.
  Every approve / reject / deactivate / reactivate is recorded with who, when and why (references.md
  "Deactivating and reactivating accounts": OWASP logging, NIST AC-2, GitHub asks for a reason). A reason is
  required to deactivate and to reactivate, optional to reject (to be shown to the employer later), not asked to
  approve. Repeating a decision ("already deactivated") is refused. `/admin/users/{id}/history` lists them all.
- Users: the reason box opens in the row (Enter confirms, Esc cancels; the button stays off until a reason is
  typed). Under each status: the latest decision, e.g. "Deactivated 7 Oct by Career Office · Graduated". The
  account count moved up next to the filters.
- Dashboard: "Good afternoon, <name> 👋" header like the student one; the two bottom panels stretch to the foot of
  the screen. Reject there asks for an optional reason too.
- Checked in a browser on a database copy (13 checks: greeting, full height, count position, reason required /
  optional, Esc, last-decision line, reasons carried from dashboard to Users, no page errors).

## 7 Oct 2026 — Admin pages full width; only the user list scrolls

- (fd5dd8e) Admin pages use the full width like the student pages (her review). On Users the page itself no
  longer scrolls: only the list does, and its column titles stay on top (checked in a browser with 49 accounts).

## 7 Oct 2026 — Admin pages: dashboard (layout D) and Users

- (7074cf4) Admins now get their own screens (her pick: layout D, references.md "Admin layout"). Sidebar for
  Admin: Dashboard and Users, with a badge counting employers waiting for approval (refreshed on every page and
  right after an approval). `/dashboard` shows each role its own home.
- Dashboard: "Needs your action" first (waiting employers with Approve / Reject; modules whose skills nobody has
  reviewed), then counts (students and employers open a filtered user list), then "Most common skill gaps" and
  "Student profiles". The skill-gap panel is its own call (`/admin/skill-gaps`), so the page opens at once and the
  panel fills in; `/admin/counts` feeds the badge.
- Users: search, role and status filters (kept in the address, so a link opens the same list), Approve / Reject for
  employers, Deactivate (asks "Deactivate? Yes / No" first) and Reactivate. Admins can't be deactivated, nor change
  their own account here.
- A deactivated user who is signed in is sent to the login page with "This account has been deactivated. Please
  contact the career office." Skill Profile and AI Assistant are student-only pages now (an admin is sent home).
- Checked in a browser on a database copy (11 checks: badge, approve, filters, search, deactivate + its message,
  reactivate, students keep the student app and can't open Admin pages). The app's layout is desktop-only on every
  page (the sidebar takes 224 px of a phone screen): not changed here.

## 7 Oct 2026 — Admin, batch 1: academic structure tables, user management, dashboard data

- (d63aae2) Backend only (pages come in a later batch). Run `python migrations/migrate_admin_structure.py`
  once (safe to rerun): new tables programmes, intakes, programme_modules; module descriptions moved into the
  database from data/modules.json; users get programme / intake (students) and company name / approval status
  (employers); jobs get "posted by" and "hidden by admin". The prototype's one programme (BSc (Hons) Software
  Engineering, code SE) is created with its modules by year. Employers who signed up before approvals existed are
  marked approved, so nobody is locked out.
- `/admin` endpoints (admin only): dashboard data for layout D (to-do: employers waiting, modules not reviewed;
  counts; student profiles; most common skill gaps = students' own "skills to learn next" counted over students,
  cached 5 minutes), user list with role / status / search filters, approve / reject employers, deactivate /
  reactivate accounts.
- Deactivation now works: `is_active` existed but was never checked. A deactivated account is signed out on its next
  request and can't sign in (told only after the right password). New employers start as "pending".
- `scripts/tools/create_admin.py`: the only way to make an Admin account (Admin can't be chosen at sign-up).
- Models now load the tables they point at, so scripts that save users or jobs on their own keep working.
- Cut-off comment clarified (audit): 0.8 is run 4's cut-off, chosen on blind set v1; run 5's comes from v1 + v2.

## 6 Oct 2026 — Pass rule in the evaluation script; each skill pair scored once

- (5a21996) `evaluate_reference.py`: "has it" judged as the app decides it (model p_satisfies >= `--cutoff`,
  default 0.8; cosine >= 0.7), population-weighted precision / recall / F1 (each band scaled to its real number of
  candidate pairs; checked against the hand calculation: v1 model 0.63 / 0.44 vs cosine 0.42 / 0.29). `--set v3`
  and `--baseline <run-4 folder>` print both models side by side and the run-5 pass rule verdict (fixed in
  references.md before blind set v3 existed: beat cosine on precision AND recall, beat run 4 on F1).
  `merge_reference_labels.py --set v3`.
- `skill_relation.py`: a pair is scored once whatever its capitals (the run-4 warm-up scored 7,228 pairs for 5,471
  distinct ones).

## 6 Oct 2026 — Relationship model can decide "has it" (off until switched on)

- (9554796) The trained skill relationship model can now replace the cosine >= 0.7 rule in matching
  (`app/services/skill_relation.py`, `skill_profile.match_matrix`). Same skill (A8) is still "has it" first; for
  other pairs SBERT picks the candidates (cosine >= 0.55: no real match on either blind set was below 0.551) and the
  model decides "student skill -> job skill" (p_satisfies >= 0.8, the cut-off chosen on blind set v1). Job Matches
  and Skill Gap use the same function, so they still agree on every job (checked).
- Off by default: only on when `RELATION_MODEL_DIR` is set in `backend/.env`. Off, or the folder missing, = the
  old rule exactly (checked on 200 random cases). Every scored pair is saved in `data/relation_cache.json`
  (not in git), shared by all students and tied to the model folder; `warm_relation_cache.py` fills it before a
  demo so no page waits.

## 6 Oct 2026 — Run 5 prep: targeted training pairs (v3) and blind set v3

- (f8fc5e1) Scripts only, nothing in the app changes. Run 4's errors on both blind sets were of two kinds, so
  `build_pairs_skillmap.py --targeted` picks ~400 SkillMap pairs aimed at them: "extend" (one name plus 1–3
  words, e.g. "ETL" / "ETL pipelines": the model missed these) and "sibling" (same topic, different activity word,
  e.g. "Server Administration" / "Server Migration": the model wrongly said "has it"). Picked by words, not cosine;
  a vague short side ("Systems", "Reporting") is skipped; at most 3 pairs per skill. Skills of both blind sets
  (v1, v2) and pairs already in the v2 candidates are left out. Output: `pairs_skillmap_v3_candidates.csv`
  (800 rows to label, both orders).
- `merge_training_labels.py --set v3` (v3_labels → `pairs_skillmap_v3.csv`); the leak check now covers both blind
  sets. `--set v2` (default) gives the same file as before (checked).
- `sample_reference_pairs.py --set v3`: a third blind set, same bands as v2, leaving out skills of all three
  training files and pairs of v1 and v2. Notebook note: the run-5 file list.

## 6 Oct 2026 — Skill names in Title Case on every page

- (5b2442f) One helper, `frontend/src/skillName.js`, shows skill names the same way everywhere: Dashboard, Job
  Detail (missing skills, skills you have, "via …", nice-to-have chips), Job Matches card chips and Skill Profile
  chips. Display only: saved names, matching and quotes from the ad are unchanged ("From the ad: …" stays word for
  word). Brands written in lower case on purpose are kept ("dbt", "shadcn/ui": the only 2 among 2,611 live job
  skill names).

## 6 Oct 2026 — Dashboard skill names in Title Case, no clipped letters

- (78836a3) Skill names on the Dashboard in Title Case ("Business Process Analysis", her choice): all-lower-case
  words get a capital, small joining words stay lower ("Version Control with Git"), words with capitals already are
  kept ("UI/UX Design", "iOS Development", "ISTQB"). The "Skill to learn next" card clipped the tails of p / y
  (`truncate` hides overflow and `leading-none` left no room below the line): line height is now `leading-snug`.

## 6 Oct 2026 — Chat never blocked by the daily limit; Dashboard "Next steps"

- (d9c884f) Chatbot: Groq's free daily token limit is per model, and the job-ad extraction runs use
  gpt-oss-120b too, so a big extraction day left no tokens for chatting. The chat now tries gpt-oss-120b, then
  gpt-oss-20b (same family, its own daily limit) when 120b's limit is reached (her choice). Only when both are used
  up does the student see "The assistant has reached its daily usage limit. Please try again in about N minutes"
  (time read from Groq's message), not "Something went wrong". Other errors are not retried on the second model.
  Extraction stays on 120b only (the evaluated model).
- Dashboard: the four shortcut cards that repeated the sidebar (one greyed out) are replaced by "Next steps" (her
  choice A of three mock-ups): "Skills to learn next" (the required skills missing most often in your top matches,
  each with "missing in N of your top M matches" and Learn →), counted over the matches the student chooses
  ("Based on: All my matches / a job category", remembered on the browser; Harper et al. 2015: users rate
  recommendations they can steer much more positively), and "Continue a chat" (3 latest chats from MongoDB, opens
  the chat). Skill names start with a capital ("Business process analysis").
- Tests: 24 backend checks (fallback, both models limited, other errors not retried, chat history); 6 browser checks
  on the Dashboard (category choice, remembered, Learn link, opening a chat).

## 6 Oct 2026 — Chat history in MongoDB (hybrid database, IR §2.3.5)

- (b1cff24) MongoDB joins PostgreSQL: `app/mongo.py` (pymongo), collection `chat_sessions`, one document per
  conversation (user, mode, title, the job/skill it is about, messages). Settings `MONGODB_URL` / `MONGODB_DB`
  (defaults: local install, database `skillmap`). Each reply is saved to the student's chat; a chat keeps one mode.
  New endpoints: `GET /chatbot/sessions` (list, newest first), `GET /chatbot/sessions/{id}`, `DELETE ...`. A student
  only ever sees, continues or deletes their own chats (someone else's id -> 404, never written to).
- MongoDB off never breaks the chatbot: the reply still comes back, unsaved; the list says history is off; the
  backend prints a warning at start-up instead of stopping.
- AI Assistant page: past chats on the left (her choice A of three mock-ups), grouped Today / Earlier, "+ New chat",
  delete with an inline confirm; « folds the list to a thin strip (» and + stay), remembered on the browser. Opening a chat restores its mode and what it was about ("Learning ISTQB for
  Software QA Engineer"), so the answers stay personalised; it never re-sends the "I want to learn X" question.
- Groq errors no longer show the raw error to the student (external audit): logged on the server, plain message.
- Tests: 21 backend checks with an in-memory MongoDB (mongomock) and a fake Groq; 14 browser checks with a fake
  backend. Setup: `pip install pymongo==4.18.2` in the backend venv.

## 6 Oct 2026 — Clearer messages when GitHub or the certificate AI can't help

- (782becb) GitHub languages: the note now says why they weren't read. GitHub's hourly limit for calls without
  a key (60 an hour; 403/429 with no calls left) gets its own message; no internet / slow answer another. Saving a
  project again now retries GitHub when it has a link but no languages yet (before, only a changed project or one
  with no skills at all was read again, so "try again later" did not work for a project with skills from its text).
- Certificate: "SkillMap couldn't suggest skills for this certificate. Please add the ones listed on it." →
  "SkillMap doesn't know this certificate well enough to suggest skills. Type the skills shown on your certificate
  (or its Credly badge) in the box above." The AI returns nothing for a certificate it doesn't know, on purpose
  (no guessed skills).

## 6 Oct 2026 — Job Matches shows only the latest search results; company apply links

- (ac1a5e8) New column `jobs.gone_at` (run `migrations/migrate_add_job_gone_at.py`; the backend stops with a
  clear message until it is run). `fetch_live_jobs.py` now syncs saved live jobs with the cache (the latest search
  results) at the end of every saving run, or alone with `--sync-only` (0 credits, no Groq; add `--dry-run` to
  preview): a job the results no longer return is hidden (kept for the report), shown again if a later refresh
  returns it. Every search in the cache counts, also the 26 from 27 Sep that are no longer in the query list, so
  no job is hidden just because the query list changed; a full refresh drops those retired searches first. Nothing
  is hidden while a current query is missing from the cache (a failed search must not hide its jobs). Job Matches,
  categories and locations leave hidden jobs out on the next request, no uvicorn restart.
- Apply link: the company's own site (its careers site or the hiring system it runs: Workday, Greenhouse, Lever,
  SmartRecruiters, SuccessFactors, Eightfold...) is preferred over job boards. Checked on the 918 cached jobs:
  JSearch already lists the company's link first, so the old rule already picked it in all 99 cases; what changes
  is the label ("Apply on Workday" / "Eightfold AI" -> "<company> careers") and 1 more job kept (Ørsted's own
  careers page, not on the trusted list before). The sync updates saved jobs' labels too.
- Tested on a copy of the test database: 7 jobs not in the results hidden, 1 hidden job returned again shown, 1
  label fixed; a second run changes nothing; hidden jobs leave the job cache, locations and categories at once.

## 6 Oct 2026 — Either-or lists read in the whole sentence

- (448b66b) The either-or rule now reads the quote's whole sentence in the ad, not just the quote: Bitdeer
  "Strong programming ability in one or more languages, including Go, Python, C++, Java, Rust, or related
  technologies" was quoted as "including Go, Python, C++, Java, Rust", lost its "one or more" and "or related",
  and became 5 requirements (a Java-only student got Go, Rust, C++ as gaps). "one or more / at least one / any of
  / either ... including A, B, C" is now a choice; "including A, B, C" alone stays all-wanted. Replayed on the 132
  jobs in the evidence CSV with their ads: 2 jobs change (Bitdeer; and Network Engineer LAN/WAN, where "Huawei
  equipment" and "Huawei network devices", both quoted as "Huawei", now count once).
- Level cue: "an added key advantage" (Malaysia Airports) is read as preferred (was only "an added advantage").
- Apply to saved jobs: `python scripts/pipeline/tidy_saved_job_skills.py` (dry run), then `--save`.

## 6 Oct 2026 — Pages load only when something changed; "Back to job" in the context bar

- (5ef303c) One short-lived cache for the slow read-only requests (`frontend/src/pageCache.js`): scoring every
  job (Dashboard, Job Matches and the chatbot all ask for the same default list), one job's skill gap, a job's
  formatted ad, the skill profile, categories and locations. Kept 15 minutes in sessionStorage; dropped at once by
  api.js after any profile change (grades, projects, certificates), so the 30 Sep stale-numbers problem cannot
  come back. The same request asked twice at once runs once. Click-through test with a mocked backend: Dashboard,
  Job Matches, a job, the chatbot, back to the job, back to Job Matches, Dashboard again = 1 scoring request
  (was 6); after a profile save the next page scores again, once. Dashboard takes the name from the signed-in user
  instead of asking /auth/me again.
- Chatbot opened from a job: the context bar reads "Learning ISTQB for Software QA Engineer" with "← Back to job" at
  its right end (her choice of three mock-ups); the top-left link is gone.
- Skill Development prompt: only name courses, providers and universities it is sure exist (else the words to
  search for); never say what a named company requires unless the ad says so ("Hytech requires ISTQB" was made up);
  no made-up statistics.

## 6 Oct 2026 — Chat replies render properly; back links; Job Matches keeps its place

- (19a84cb) Chat replies are rendered as Markdown with react-markdown + remark-gfm (GitHub-flavoured: tables,
  task lists, nested lists, code). The old line-by-line renderer showed tables as "| a | b |", "---" lines, and
  "**FREE**" inside a heading as raw symbols. Raw HTML in a reply is ignored; links open in a new tab.
- Skill Development prompt: no made-up URLs (a reply linked a YouTube playlist ID that cannot be checked); name the
  resource instead, link only official documentation home pages. One small table at most, no emoji numbering,
  under ~350 words. Career Counsellor: no made-up URLs, salaries or company facts.
- Send button: Heroicons v2 paper-airplane, pointing right (v1's pointed up and looked like an arrow).
- "Learn →" on a job opens the chatbot with "← Back to <job>", which returns to the same job on the same tab.
- Job Detail: "Back to Job Matches" / "Back to Dashboard" (where it was opened from), on the same left edge as other
  page headings. A job opened in a new tab goes back to Job Matches.
- Job Matches no longer searches again when going back from a job: results, sort, "show more" and scroll position
  are kept for 15 minutes, and dropped at once after any profile change (grades, projects, certificates).
- Setup: `cd frontend` then `npm install react-markdown remark-gfm`.

## 6 Oct 2026 — Modules tab follows the IR: completed modules only, "Not graded yet"

- (030ded0) Checked against the IR: users are final-year students and recent graduates ("the main user group",
  §3.2.2) and they "confirm completed modules and enter grades" (§1.6.1). Compulsory card subtitle:
  "9 modules · leave blank if not completed yet". The grade list starts with "Not graded yet" (was a disabled
  "Select grade"), so a grade picked by mistake can be cleared; ungraded modules are not saved, as before.

## 5 Oct 2026 — Her review, part 2: inline-label duties, skill-poor ads, nice-to-have chips, formatting

- (73c955c) Duty rule reads inline labels: Motorola "Web Development: Assist in developing robust frontend
  interfaces" (no heading, label then verb) was saved as required; the label is now read like a heading, the verb
  after it is the first word, and "This includes ..." takes the previous sentence's answer. Under a generic heading
  ("Job Description", "Detailed Description") the label decides. On 83 saved jobs: 98 duty changes (was 81); every
  new one read by hand (Motorola fresh graduate: frontend / backend development, AI integration, LLMs, RAG, cloud
  operations... no longer required; Oracle DBA, Software Quality Engineer duties).
- Ads that name almost no skills: a job was kept with its old name-only skills when the new extraction found fewer
  than 3 hard skills, even when every sentence was read (AFED "Petroleum Data Analyst Trainee": degree and CGPA
  only, but showed Python, SQL, Statistical modelling). Now the new result is saved when every sentence was read;
  a job with nothing to score is left out of Job Matches. Old skills are kept only when sentences were skipped.
- Nice-to-have chips: the ones you have first; the others are buttons that open the AI Assistant (like "Learn →").
- Job Description formatting keeps every item in the advert's own section (Motorola's "Understanding of vector
  databases" had been moved to Nice to have); ## Nice to have only for a section the advert itself heads so.
  Clear the cached text again: `UPDATE jobs SET formatted_description = NULL WHERE source = 'live';`
- Tested: duty rule on 83 saved jobs and a heading/label test ad, 46 earlier test cases, lint, production build.

## 5 Oct 2026 — Her review of two re-extracted jobs: display, ranking, job age, level from years

- (this commit) Checked Meta "Software Engineer, Machine Learning" and Hytech "Software QA Engineer" against the
  original ads: the saved skills were right (Meta's "Minimum Qualifications" name one skill, the rest are under
  "Preferred Qualifications"; Hytech's Python / Java are under "Additional Good to Have"). The Job Description tab
  merged those sections into "Requirements", because the formatting prompt allowed only four headings. It now has
  "## Nice to have" and must keep preferred items there. Clear the cached text once:
  `UPDATE jobs SET formatted_description = NULL WHERE source = 'live';`
- Tidy rule 2b (`cue_levels`): an "unspecified" skill under a "Good to Have" / "Preferred" / "What you'll learn"
  heading takes that level. Heading only: on the saved jobs the sentence cue was wrong on mixed sentences
  ("Comfortable with writing database queries ... with an added advantage of ..."); the heading version changed
  6 skills on 83 jobs, all correct.
- Ranking: Best fit and "Most skills matched" use the lower bound of the Wilson score interval of the coverage
  (Evan Miller, "How Not To Sort By Average Rating"), so 1 of 1 (0.21) no longer ranks above 9 of 10 (0.60). The
  card still shows "1/1 skills". Of 83 saved jobs, 7 require only 1–3 skills.
- Job level: when the title names no level, "N+ years ... experience" in the ad decides (5 or more = Senior, from
  LinkedIn's Mid-Senior "5-10+ years"). On 807 live ICT titles: 47 of 464 unstated titles become Senior; 15
  spot-checked, all right. Meta (8+ years) is now Senior and ranked lower.
- Job age (F8): live jobs posted more than 45 days ago are not recommended (most postings stay up about 30 days,
  Indeed); cards show "12 days ago"; Job Detail says "Posted over a month ago · it may have closed" after 30 days.
- Modules tab hint moved next to the grades: Compulsory card subtitle "10 modules · add a grade once you have it".
- Tested: test database (60-day job hidden, 8+ years → Senior, confidence and age returned), 46 earlier test cases,
  every heading-cue change on 83 saved jobs read by hand, lint, production build.

## 5 Oct 2026 — Real module grade on Job Detail; transcript hint on the Modules tab

- (this commit) Job Detail "Show where these come from" showed the grade from its weight, and C+ and C share a
  weight, so a C showed as "C+". `/skillgap/` now returns the grade itself (`grade`) and the page maps it to a letter.
- Modules tab: one grey line "Add a module once you have its grade. Use the grade on your transcript." Decided
  5 Oct: users are final-year students and graduates; grades are entered by the student, completed modules only
  (option B: in-progress modules are not evidence yet, precision first). No honesty checkbox: the study behind
  signing a pledge first was retracted and a large replication found no effect (Kristal et al. 2020); self-reported
  grades are mostly accurate, r ≈ .85 (Sticca et al. 2017); and a grade only sets the evidence strength, never a
  match.
- Tested: endpoint returns the grade (3.7 → "A-"), letter mapping for every grade option, lint, production build.

## 5 Oct 2026 — Job Matches card chips show what the job asks for

- (this commit) The skill chips on each Job Matches card were the job's first skills in stored order, so a card could
  show a duty ("Printers") or a soft skill. Now: the searched skill first (as before), then the skills the % counts
  (required, or the fallback basis), then nice-to-have, then other hard skills; never soft skills
  (`recommend.card_skills()`). Jobs extracted before Stage 1 have no levels and keep their stored order.
- Cards stay general on purpose (no have / missing marks): a list entry gives just enough to decide whether to
  click (NN/g, list entries and information scent), and LinkedIn also keeps "How you match" on the job page; the
  explanation is on Job Detail.
- Tested on a test database: a duty stored first moves to the end; Job Matches responds as before.

## 5 Oct 2026 — A duty mention no longer drops a nice-to-have group

- (this commit) `evidence.merge_mentions()` rule 1: a skill named only in the duties ("unspecified") no longer
  makes a preferred either-or group redundant. Found in bulk run day 2: INSPHERE "Connect semiconductor equipment
  with MES, EAP" (duty) + "MES, EAP, SCADA, SPC or RMS systems" (a plus) dropped SCADA, SPC and RMS, so a student
  with SCADA got no nice-to-have credit. Now SCADA / SPC / RMS stay as one nice-to-have group. A required mention
  still covers a group ("Python" required + "Python or Java" = Python), as before.
- The DROPPED line now names the skill that covers the choice ("MES, EAP is asked for on its own") instead of
  saying "another required skill", which was wrong when that skill was not required.
- Tested: the INSPHERE ad, the F25 edge cases, all earlier tidy test suites (46 cases).

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
