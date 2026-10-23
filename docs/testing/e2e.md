# Browser tests (Playwright)

Playwright opens a real Chrome window, clicks through SkillMap like a user, and checks what the page shows.
The tests live in `frontend/e2e/`:

| File                   | Journey                                                                              | Test cases            |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------- |
| `1-student.spec.js`  | Grades become skills, profile checklist, Job Matches, the skill gap, applying        | TC-01, 10, 11, 16, 28 |
| `2-employer.spec.js` | Who applied, contact details only after shortlisting, the student sees "Shortlisted" | TC-31, 42, 38         |
| `3-admin.spec.js`    | A new employer signs up and waits, the career office approves them, adds an intake   | TC-51, 48, 50         |
| `4-access.spec.js`   | Signed out → sign in; a student can't open employer or career office pages; a broken link shows a message, not a blank page | TC-54                 |
| `5-accessibility.spec.js` | 33 pages, pop-ups and forms of all roles scanned for accessibility problems (axe-core, WCAG 2.2 AA + best practice); the job and applicant lists used with the keyboard only | TC-66 |

They run in this order and build on each other (the employer shortlists the application made in the student test).

Screenshots and a results file go to `docs/evidence/e2e/` as evidence for the
system test cases (`docs/testing/SkillMap_system_test_cases.xlsx`).

They use a **separate database, `skillmap_e2e`**, which is emptied and refilled before every run. Your own data
is never touched.

Commands are for **Git Bash** on Windows.

## One-time set-up

1. **Make the database.** In pgAdmin, open the Query Tool on any database and run:
   ```sql
   CREATE DATABASE skillmap_e2e;
   ```
2. **Tell SkillMap where it is.** Add this line to `backend/.env`. Use the same user and password as your
   `DATABASE_URL`; only the database name changes:
   ```
   E2E_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/skillmap_e2e
   ```
3. **Install Playwright and its browser** (from `frontend/`):
   ```bash
   npm install
   npx playwright install chromium
   ```

## Every run

You need three terminals.

**Terminal 1, backend** (from `backend/`, with the venv on). Stop your normal backend first (Ctrl+C).

1. Fill the test database:
   ```bash
   python scripts/tools/setup_e2e.py
   ```

   It should end with: `Ready: skillmap_e2e has 4 accounts and 3 open jobs`.
2. Start the backend on that database:
   ```bash
   DATABASE_URL="postgresql://postgres:<password>@localhost:5432/skillmap_e2e" uvicorn app.main:app --port 8000
   ```

**Terminal 2, frontend** (from `frontend/`):

```bash
npm run dev
```

**Terminal 3, the tests** (from `frontend/`):

```bash
npx playwright test --ui     # a window: pick a test, press ▶, watch every step (best while learning)
npx playwright test          # all tests, no window; prints ✓ or ✘ for each one
```

**Before running again:** the tests change the data (a grade is saved, an application is made). So stop the
backend (Ctrl+C in terminal 1), run `setup_e2e.py` again, then start the backend again. Otherwise TC-01 fails,
because the grade is already saved and the "Save grades" button never appears.

## Other browsers

By default the tests run in **Chromium**, the engine of Chrome, Edge, Opera and Brave. They can also run in:

| `BROWSER=` | Browser | Stands for |
|---|---|---|
| `firefox` | Firefox | Firefox |
| `webkit` | WebKit | Safari (Mac, iPhone) |
| `edge` | Microsoft Edge installed on this computer | Edge |
| `chrome` | Google Chrome installed on this computer | Chrome |

Once, from `frontend/`: `npx playwright install firefox webkit` (Edge and Chrome use the copies already installed).

Then **one browser per run**, re-seeding before each (terminal 1: Ctrl+C, `setup_e2e.py`, start the backend again),
because the tests change the data. From `frontend/`, for example Firefox:

```bash
mkdir -p ../docs/evidence/e2e/firefox
BROWSER=firefox npx playwright test 2>&1 | tee ../docs/evidence/e2e/firefox/run_2026-10-23.txt
```

**WebKit and the keyboard:** WebKit, like Safari, leaves links out of the Tab order by default (Safari users switch on
"Press Tab to highlight each item"). So in WebKit the two keyboard tests put the focus on the link directly and check
that Enter opens it; reaching it with Tab is checked in the other browsers.

**All browsers in one go, unattended** (about 15 minutes): stop your own backend, keep `npm run dev` running,
activate the backend's venv in the test window, then from `frontend/`:

```bash
bash scripts/all_browsers.sh                  # chromium, firefox, webkit, edge, chrome
bash scripts/all_browsers.sh firefox webkit   # only these
```

For each browser it re-seeds the database, starts the backend, runs the tests, saves the log in that browser's
folder and stops the backend; at the end it prints a summary (passed / failed and how long applying took).
They can't run side by side: every browser would share the same test data.

Each browser's screenshots, results and accessibility scan go to its own folder (`docs/evidence/e2e/firefox/` and so
on); Chromium's stay in `docs/evidence/e2e/`.

## Lighthouse on every page

Right after `npx playwright test` (it uses the applications those tests made), with the backend and `npm run dev`
still running, from `frontend/`:

```bash
node scripts/lighthouse_all.mjs
```

It signs in as each role and runs Lighthouse (the same version as Chrome's DevTools, desktop, Accessibility only) on
every page: 33 in all, including the study set-up a new student sees and the page an employer sees while waiting
for approval. One report per page and a table of scores go to `docs/evidence/lighthouse/all/`. It ends with
`33 of 33 pages score 100`, and fails if any page scores less.

## Test accounts

All four use the password `Orchid-Lantern-42`.

| Email                     | Who                                                                              |
| ------------------------- | -------------------------------------------------------------------------------- |
| e2e.student@example.com   | Aina Rahman: SE student, no grades yet                                           |
| e2e.applicant@example.com | Daniel Lim: SE student with 4 grades, has applied for Graduate Software Engineer |
| e2e.employer@example.com  | Mei Tan, Kayu Digital Sdn Bhd (approved): 3 open jobs                            |
| e2e.admin@example.com     | Career office                                                                    |

## Writing a new test

1. With the backend and frontend running, start the recorder:
   ```bash
   npx playwright codegen localhost:5173
   ```

   Click through the journey; Playwright writes the code as you click. Copy the steps into a new file in
   `frontend/e2e/`, e.g. `2-employer.spec.js`.
2. Add checks with `expect(...)`: what should be on the page afterwards.
3. Add `await shot(page, 'TC-xx_name')` at the end for the evidence screenshot.
4. Use `signIn(page, EMPLOYER)` from `helpers.js` instead of recording the login each time.

## If a test fails

Playwright saves a screenshot of the moment it failed, plus a page description (`error-context.md`), in
`docs/evidence/e2e/failures/`. Look at the screenshot first. That folder is in `.gitignore`; only passing runs
are evidence.
