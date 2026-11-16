# Transparency rules (updated 16 Nov 2026)

What students are shown about an employer's job, and exactly how each number is worked out. Code: `backend/app/services/transparency.py`. Tests: `tests/test_transparency.py`, `tests/test_audit_fixes.py`, `tests/test_employer_availability.py`, `tests/test_decision_deadline.py`, and the availability/date cases in `tests_unit/`. Research: references.md "Employer replies, ghosting and transparency".

## Decision date

- Every SkillMap job post has a date the employer promises a decision by: 14, 21, 30 (default) or 45 days after posting.
- It can be moved **once before the current deadline**, by 1 or 2 weeks, with a reason applicants see. The first date is kept (`jobs.decide_by_original`) and shown: "Decision date moved from 12 Nov: …".
- After the date, an applicant still waiting sees "No decision by the date". This is **not** a rejection in the employer's name.

## Deadline-driven intake pause

- For the current constrained release, the stored job-wide `decide_by` also acts
  as the boundary for receiving new applications. This is an explicit SkillMap
  policy, not a claim that application and decision deadlines are generally the same.
- A post is eligible strictly **before** the stored timestamp; at or after it,
  new intake is unavailable. Comparisons use UTC; legacy naive values are treated
  as UTC. Old posts without a date keep their existing behaviour.
- Current discovery/recommendations, graduate suggestions, active invitations,
  the fresh job-availability check and direct application writes share this rule.
- Existing applicants remain Applied/Shortlisted until the employer records an
  outcome. Expiry does not run Close job, create a rejection, delete records or
  change the manually stored pause flag. The employer can still review and decide.
- Student message: "New applications paused — decision date passed". Existing
  applicants see the missed promise and that they are still awaiting a decision.
  Employers see: "New applications are paused. Review the applicants still waiting."
- Resume/reopen does not reset the date. Late extensions and after-deadline resets
  remain unavailable. A possible renewal/revised-date workflow is separate scope;
  no general rule forcing a duplicate posting was introduced.
- The browser may retain an already loaded recommendation for up to 15 minutes;
  the fresh check and application API still refuse an expired submission.

## Employer account availability

Employer posts also require an existing, active, approved employer account.
Suspension/rejection blocks new recruitment while preserving existing applications.
Reactivation/reapproval cannot reopen a closed job, clear a manual pause, or bypass
the decision deadline. See `services/employer_availability.py` for the shared rules.

## Stopping and closing

- **Stop new applications (manual)**: nobody new can apply; applicants keep waiting for a decision. Resume is available only before the promised date. The separate automatic deadline guard does not write this manual pause field.
- **Close the job**: needs a reason (filled through SkillMap, filled another way, not filling). Everyone still waiting gets Not selected, with "the job was filled" or "the job was cancelled" as the reason. "Filled through SkillMap" needs an Accepted applicant.

## Employer's on-time record

"[Company] replied to every applicant by its promised date on X of its Y past jobs." Shown on Job Detail before applying (SkillMap posts only) and in My applications, from one component (`frontend/src/components/EmployerRecord.jsx`; wording chosen 18 Oct, references.md "#1 wording research"). The job's own date reads "[Company] promises to reply by [date]".

- **Judged jobs (Y):** jobs with at least one applicant whose decision date has passed, or that were closed. Jobs with no applicants, or still open before their date, are not judged yet.
- **On time (X):** every applicant has an outcome now (Accepted or Not selected, including by closing the job), and got their **first** outcome at or before the decision date in force. If the date was moved, the moved date counts, since applicants were told.
- The first outcome's time comes from the status history (`application_events`). A correction after the date (Not selected → Accepted) doesn't make the job late: the student had an answer in time. An undone decision is removed from the history, so it never counts.
- It measures whether students got an answer by the promised date, not how good the employer's decisions are.
- Edge cases tested (`tests/test_audit_fixes.py`): decided exactly on the date (on time), one second after (late), corrected after the date (on time), undone (late), closed before the date (on time), closed after it (late).
- Closing a job **after** its date counts as late: the applicants still waited past the promise.
- **Shown from 3 judged jobs.** Below that, students see "New on SkillMap: no reply record yet", because one late job would define a new employer. The 3 is a judgement call, in the same spirit as platforms holding back a rating until there are enough reviews.

## Where you stand

- Shown from **5 applicants**, so no one can be singled out. Required skills only, and never another applicant's name.
- Each application stores the applicant's skill counts and when they were worked out (`match_have`, `match_total`, `match_at`). The student's own count is worked out every time; others' counts are worked out again if they are missing or **more than a day old**, because a profile can change after applying.
- The info tip says: compared on skills only, using everyone's profile from the last day; employers also look at experience and interviews.

## Evidence and design limits

The once-only extension lengths and current one-date intake guard are product
choices. Research distinguishes application closing from expected response dates,
supports communicating delays, and shows that renewal need not always duplicate a
posting. It does not demonstrate a universally optimal SkillMap deadline policy.
See the 16 Nov 2026 recruitment-date entry in `planning/references.md`.

The saved local runs have 50 unit passes (1.59 s) and 38 API regression passes
(101.18 s); filenames are recorded in the README and changelog.
The Word and activity-diagram descriptions must distinguish a pause from a final
outcome. No relational field or ERD structure changed for these fixes.
