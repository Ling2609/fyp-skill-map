# Transparency rules (14 Oct 2026)

What students are shown about an employer's job, and exactly how each number is worked out. Code: `backend/app/services/transparency.py`. Tests: `tests/test_transparency.py`, `tests/test_audit_fixes.py`. Research: references.md "Employer replies, ghosting and transparency".

## Decision date

- Every SkillMap job post has a date the employer promises a decision by: 14, 21, 30 (default) or 45 days after posting.
- It can be moved **once**, by 1 or 2 weeks, with a reason applicants see. The first date is kept (`jobs.decide_by_original`) and shown: "Decision date moved from 12 Nov: …".
- After the date, an applicant still waiting sees "No decision by the date". This is **not** a rejection in the employer's name.

## Stopping and closing

- **Stop new applications**: nobody new can apply; applicants keep waiting for a decision.
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
