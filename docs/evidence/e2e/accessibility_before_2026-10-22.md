# Accessibility scan BEFORE the fixes (22 Oct 2026)

axe-core 4.13.0 (via @axe-core/playwright), WCAG 2.1 A + AA rules, on the same 18 pages as
`frontend/e2e/5-accessibility.spec.js`, e2e database (`setup_e2e.py`), run in the development sandbox.
The AFTER result is `accessibility.json` (0 problems) and `run_*.txt` from the Windows run.

| Problem (axe rule) | Impact | Pages (elements) |
|---|---|---|
| Text contrast below 4.5:1 (`color-contrast`) | serious | Register 1, Student Dashboard 4, My Profile 14, Job Matches 24, Job Detail 8, Job Detail: skill gap 8, My Applications 7, AI Assistant 4, Profile & privacy 5, Employer Dashboard 4, My Jobs 2, Applicants 3, Applicant 7, Post a Job 4, Career office Dashboard 2, Users 2, Academics 11 |
| Form field without a label (`label`) | critical | My Profile 2 (elective module tick boxes) |
| Link told apart by colour only (`link-in-text-block`) | serious | Register 1 ("Privacy notice") |

Main cause: grey captions `text-slate-400` / `text-gray-400` on white (2.6:1). Fixed by one step darker (`-500`,
4.8:1); grey text on the grey page or a pale-blue selected row, and chips on `bg-slate-100`, one step more (`-600`);
`rose-600` on `rose-50` to `rose-700`; avatar colours `-600` to `-700`; hints in `-300` to `-500`
(decorative, `aria-hidden` marks left).

Found by hand (no tool flags it): the job cards on Job Matches and the applicant rows on View applicants opened only
with a mouse. Their titles / names are now real links (Tab + Enter); the keyboard tests in `5-accessibility.spec.js`
check both.

## Second round (after her first Lighthouse run, Sign in 93)
Lighthouse also checks WCAG 2.2 and best practices. With those rules added to the scan: `landmark-one-main`
(Sign in, Register), `region` (content outside landmarks: Sign in 7, Register 12, the sidebar logo on every signed-in
page), `target-size` (show-password buttons, 16x16 px). Fixed; after: 0 problems on 18 pages (623 checks).

## Third round (her question: are 4 Lighthouse pages enough?)
The scan was widened from 18 to 30 pages and states: Forgot password, Privacy notice, Account settings, Preview as
employer, What the employer will see, Edit job, and pop-ups opened by a click (Add project form, Apply pop-up,
Not selected reason pop-up, admin actions menu, Academics intakes and the edit-a-module-list window). One problem
found: in-text links on the Privacy notice shown by colour only (`link-in-text-block`); underlined. After: 0 problems,
1,050 checks.

## Fourth round (her "should be all pages")
Lighthouse on every page by script (`frontend/scripts/lighthouse_all.mjs`, 33 pages of all roles; reports in
`docs/evidence/lighthouse/all/`): 32 at 100 and one at 93, the graduate's profile opened without `?job=`, which
crashed the page (a list of field errors printed as text; fixed in `api.js`). The scan added the Add work,
Add certificate and Add award forms: 3 fields without linked labels (month pickers, the Type list); fixed in `Field`.
After: Lighthouse 100 on 33 of 33 pages; axe-core 0 problems on 33 pages and states. Not covered: a chat with
messages (needs the AI; manual test TC-26) and the GitHub import (needs GitHub).
