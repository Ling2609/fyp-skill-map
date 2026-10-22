# Browser tests (Playwright)

Playwright opens a real Chrome window, clicks through SkillMap like a user, and checks what the page shows.
The tests live in `frontend/e2e/`:

| File                   | Journey                                                                              | Test cases            |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------- |
| `1-student.spec.js`  | Grades become skills, profile checklist, Job Matches, the skill gap, applying        | TC-01, 10, 11, 16, 28 |
| `2-employer.spec.js` | Who applied, contact details only after shortlisting, the student sees "Shortlisted" | TC-31, 42, 38         |
| `3-admin.spec.js`    | A new employer signs up and waits, the career office approves them, adds an intake   | TC-51, 48, 50         |
| `4-access.spec.js`   | Signed out → sign in; a student can't open employer or career office pages          | TC-54                 |
| `5-accessibility.spec.js` | 18 pages scanned for WCAG 2.1 AA problems (axe-core); the job and applicant lists used with the keyboard only | TC-66 |

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
