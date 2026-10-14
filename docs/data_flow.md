# Where SkillMap keeps data (audit, 14 Oct 2026)

Checked in the code before adding anything new to MongoDB. Each store has one purpose; nothing is kept in two places.

## PostgreSQL — the authoritative records

| Data | Tables | Personal? | Kept until |
|---|---|---|---|
| Accounts and roles | `users` (name, username, email, password hash, programme, intake, headline, about, links, visibility, goal) | Yes | Account deleted (`POST /auth/me/delete`) |
| Academic record | `user_modules` (module code + grade) | Yes | Account deleted |
| Self-declared evidence | `user_projects`, `user_certifications`, `user_awards` (with the skills and quotes) | Yes | Account deleted |
| Modules, programmes, intakes | `modules`, `module_skills`, `programmes`, `intakes`, `programme_modules`, `intake_modules` | No | Changed by the career office |
| Jobs and their skills | `jobs`, `job_skills` (skill, quote from the ad, level, extractor model) | No (company data) | Live jobs: until they expire or go; employer posts: until closed |
| Applications | `applications`, `application_events` (viewed, status changes), `job_invitations` | Yes (links a student to a job) | Account deleted |
| Security | `password_reset_otps`, `login_attempts` (username or what was typed, IP) | Yes | Codes expire; attempts reset on success; both removed on account deletion |
| Career-office actions | `admin_actions` | Yes (target user) | Rows about a deleted student are removed |

## MongoDB — documents

| Collection | What | Personal? | Kept until |
|---|---|---|---|
| `chat_sessions` | One AI Assistant conversation per document (messages, mode, context) | Yes | The student deletes the chat or the account (deleted first; if MongoDB is down, nothing is deleted) |

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
| GitHub API | Public repository the student names | Public data |
| Email (SMTP) | Address and message for codes and notices | Yes |

## Gaps found

1. **What the AI proposed is not kept.** Only accepted skills are stored; skills the quote check rejected, and what the career office changed, are lost. → MongoDB `extraction_records` (planned).
2. **No privacy notice and no copy of your data.** PDPA 2010 asks for written notice and the right of access. → Notice at registration, Privacy page, Download my data (this batch).
3. **Employers get the email on application.** → Contact details only after shortlisting (this batch).
4. **Evaluation runs are not stored.** → MongoDB `evaluation_runs` during the evaluation phase.
5. Raw job ads stay in the file cache: it already allows re-reading without credits, so a MongoDB copy would add nothing.
