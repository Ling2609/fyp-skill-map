# Where SkillMap keeps data (audit, 14 Oct 2026; updated the same day after the privacy, transparency and audit-fix batches)

Checked in the code before adding anything new to MongoDB. Each store has one purpose; nothing is kept in two places.

## PostgreSQL — the authoritative records

| Data | Tables | Personal? | Kept until |
|---|---|---|---|
| Accounts and roles | `users` (name, username, email, password hash, programme, intake, headline, about, links, visibility, goal; optional phone, city and start month for employers; when and which privacy notice was accepted: `privacy_accepted_at`, `privacy_version`) | Yes | Account deleted (`POST /auth/me/delete`) |
| Academic record | `user_modules` (module code + grade) | Yes | Account deleted |
| Self-declared evidence | `user_projects` (with `repo_check`: is the repo hers; role, team size, outcome, demo link), `user_certifications`, `user_awards`, `user_experiences` (work experience and activities, 21 Oct) (with the skills and quotes) | Yes | Account deleted |
| Languages and CGPA (21 Oct) | `users.languages`, `users.cgpa`, `users.show_cgpa` (employers see the CGPA only when `show_cgpa` is on) | Yes | Account deleted |
| Connected GitHub accounts | `github_accounts` (GitHub id and username only; GitHub's access key is used once and not kept) | Yes | Disconnected, or account deleted |
| Modules, programmes, intakes | `modules`, `module_skills`, `programmes`, `intakes`, `programme_modules`, `intake_modules` | No | Changed by the career office |
| Jobs and their skills | `jobs` (with the employer's decision date, the first date if it was moved, stop/close reasons), `job_skills` (skill, quote from the ad, level, extractor model) | No (company data) | Live jobs: until they expire or go; employer posts: until closed |
| Applications | `applications` (status, reason and note for Not selected, the applicant's skill counts and when they were worked out), `application_events` (viewed, status changes), `job_invitations` | Yes (links a student to a job) | Account deleted |
| Security | `password_reset_otps`, `login_attempts` (username or what was typed, IP) | Yes | Codes expire; attempts reset on success; both removed on account deletion |
| Career-office actions | `admin_actions` | Yes (target user) | Rows about a deleted student are removed |

## MongoDB — documents

| Collection | What | Personal? | Kept until |
|---|---|---|---|
| `chat_sessions` | One AI Assistant conversation per document (messages, mode, context) | Yes | 18 months after its last message (TTL index on `updated_at`, `CHAT_KEEP_DAYS` in `app/mongo.py`), or when the student deletes the chat or the account. MongoDB removes expired documents in a background task about once a minute, so deletion happens shortly after the 18 months, not at the exact second; the index is made the first time the chat collection is used |
| `extraction_records` | One per time the AI read skills (job ads, Post a job, modules, student projects): what it proposed, what the checks kept and rejected with the reason, the model and prompt version, and what a person changed afterwards (employer, career office, student). The text read is not copied | Project records only (a student's skills and short quotes, `user_id`) | Project records: deleted 18 months after they were made (partial TTL index), or with the account; in Download my data. Job and module records: kept for the evaluation (company and university data) |
| `evaluation_runs` | One per evaluation run (15 Oct): name, IR objective, git commit (and whether files had changed), the app setup (relation model, seeds, cut-off, embedder, extractor), method, dataset size, metrics, verdict, and the SHA-256 of every file it read (answer key, labels) | None (no student data) | Kept; exported to `docs/evidence/evaluation_runs.json` for the report |

## Files on the server (not in git)

| File | What | Personal? |
|---|---|---|
| `data/live_jobs_cache.json` | Raw JSearch job ads, so ads can be re-read without spending credits | No |
| `data/embedding_cache.npz` | SBERT vectors of skill names | No (skill names only) |
| `data/relation_cache.json` | Relationship-model scores for skill pairs | No |
| `data/learning_resources.json` | Checked learning links | No |

## Outside services (data leaves the server)

| Service | What is sent | Personal? |
|---|---|---|
| Groq (US) | Project, certificate and award text for skill reading; chat messages with profile context; module descriptions and job ads | Yes (student text). Not kept by default; may be logged up to 30 days for error and abuse checks unless Zero Data Retention is on |
| Gemini | Job ad text, to format it for display | No |
| JSearch (RapidAPI) | Search queries | No |
| GitHub API | Public repository the student names; with Connect GitHub, a one-time sign-in that returns the account's id and username (no scope: public data only) | Public data; the username is kept |
| Email (SMTP) | Address and message for codes and notices | Yes |

## Who sees what

- **Employers** see an applicant's profile, skills and (if the student allows) grades. **Email, phone, city and start month only after shortlisting** (`CONTACT_STATUSES` in `app/routers/employer.py`).
- **Students** see counts about a job (applied, shortlisted, decided) and, from 5 applicants, how many they are ahead of on required skills. Never another applicant's name or profile.
- **The career office (admin)** sees accounts and approves employers.

## Deleting and downloading

- **Download my data** (`GET /auth/me/export`): every column of every row about that user, as JSON: account, grades, projects, certifications, awards, work experience and activities, applications (with reason, note, missing skills, skill counts and history), invitations (including dismissed), the career office's decisions about the account (without which staff member), and every field of each chat. Left out: the password hash, reset codes and sign-in counters (security data) and the ids that only link tables (`EXPORT_SKIP` in `app/routers/auth.py`). A test compares the export with the tables' columns, so a column added later is included or the test fails. If MongoDB can't be reached, the file says chats couldn't be included rather than leaving them out silently.
- **Delete my account**: not one transaction, because two databases are involved. Order: chats in MongoDB first, then every PostgreSQL row in one transaction.
  - MongoDB down: nothing is deleted; the student is told to try later.
  - PostgreSQL fails after the chats went: the PostgreSQL part is rolled back, the student is told the chats were deleted and to try again; trying again finishes it. Worst case: chats gone, account still there, never the other way round.
  - Tested in `tests/test_delete_account.py` and `tests/test_audit_fixes.py`.

## Gaps found, and what happened to them

| # | Gap | Status |
|---|---|---|
| 1 | What the AI proposed is not kept: only accepted skills are stored; skills the quote check rejected, and what the career office changed, are lost | **Done 14 Oct**: MongoDB `extraction_records` (`app/services/extraction_records.py`); `scripts/tools/extraction_report.py` gives rejected rates and correction rates per source and prompt version. If MongoDB is down, extraction carries on and the record isn't saved |
| 2 | No privacy notice and no copy of your data (PDPA 2010 notice and access principles) | **Done 14 Oct**: notice at sign-up and on its own page (English and Bahasa Malaysia, every version kept), accepted version stored, Download my data |
| 3 | Employers got the student's email on application | **Done 14 Oct**: contact details only after shortlisting |
| 4 | Evaluation runs are not stored | Open → MongoDB `evaluation_runs` during the evaluation phase |
| 5 | Chat history had no retention period (a 200-message cap is not one) | **Done 14 Oct**: deleted 18 months after the last message; said in the notice |
| 6 | Raw job ads stay in the file cache | Kept on purpose: it allows re-reading without credits, so a MongoDB copy would add nothing |

## Still true, and to say in the report

- The privacy notice is a **draft for the deploying university**: the data user, its contact address and the Malay text must be checked by that university before real use. The demo address is on the reserved `.example` domain.
- Groq may keep text sent to it for up to 30 days unless Zero Data Retention is turned on for the account.
- Live jobs are "recent", not "confirmed open": they are as fresh as the last JSearch refresh (`fetch_live_jobs.py`). A job not returned by a later refresh is marked gone (`jobs.gone_at`), jobs posted over 45 days ago are not recommended (`MAX_AGE_DAYS`), but a listing can still close on the company's site before the next refresh. Employer posts on SkillMap are the only jobs whose open/closed state is known for certain.
