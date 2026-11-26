# Devices: every page at phone, tablet and laptop size (2026-11-26)

`node scripts/devices_all.mjs` on the e2e data, Chromium with device emulation (as Chrome DevTools' device toolbar). Pass = no sideways scroll, nothing past the screen edge, and (phone, signed in) the bottom tab bar shows. Click a result for its screenshot.

| Signed in as | Page | iPhone 12 (390x844) | iPad (768x1024) | Laptop (1366x768) |
|---|---|---|---|---|
| signed out | Sign in | [Pass](phone/sign_in.png) | [Pass](tablet/sign_in.png) | [Pass](laptop/sign_in.png) |
| signed out | Register | [Pass](phone/register.png) | [Pass](tablet/register.png) | [Pass](laptop/register.png) |
| signed out | Forgot password | [Pass](phone/forgot_password.png) | [Pass](tablet/forgot_password.png) | [Pass](laptop/forgot_password.png) |
| signed out | Privacy notice | [Pass](phone/privacy_notice.png) | [Pass](tablet/privacy_notice.png) | [Pass](laptop/privacy_notice.png) |
| new student | Study set-up (first sign-in) | [Pass](phone/study_set_up_first_sign_in.png) | [Pass](tablet/study_set_up_first_sign_in.png) | [Pass](laptop/study_set_up_first_sign_in.png) |
| student | Student Dashboard | [Pass](phone/student_dashboard.png) | [Pass](tablet/student_dashboard.png) | [Pass](laptop/student_dashboard.png) |
| student | My Profile: Modules | [Pass](phone/my_profile_modules.png) | [Pass](tablet/my_profile_modules.png) | [Pass](laptop/my_profile_modules.png) |
| student | My Profile: Projects | [Pass](phone/my_profile_projects.png) | [Pass](tablet/my_profile_projects.png) | [Pass](laptop/my_profile_projects.png) |
| student | My Profile: Experience | [Pass](phone/my_profile_experience.png) | [Pass](tablet/my_profile_experience.png) | [Pass](laptop/my_profile_experience.png) |
| student | My Profile: Certificates | [Pass](phone/my_profile_certificates.png) | [Pass](tablet/my_profile_certificates.png) | [Pass](laptop/my_profile_certificates.png) |
| student | My Profile: Awards | [Pass](phone/my_profile_awards.png) | [Pass](tablet/my_profile_awards.png) | [Pass](laptop/my_profile_awards.png) |
| student | Profile & privacy | [Pass](phone/profile_privacy.png) | [Pass](tablet/profile_privacy.png) | [Pass](laptop/profile_privacy.png) |
| student | Preview as employer | [Pass](phone/preview_as_employer.png) | [Pass](tablet/preview_as_employer.png) | [Pass](laptop/preview_as_employer.png) |
| student | Job Matches | [Pass](phone/job_matches.png) | [Pass](tablet/job_matches.png) | [Pass](laptop/job_matches.png) |
| student | Job Detail | [Pass](phone/job_detail.png) | [Pass](tablet/job_detail.png) | [Pass](laptop/job_detail.png) |
| student | What the employer will see | [Pass](phone/what_the_employer_will_see.png) | [Pass](tablet/what_the_employer_will_see.png) | [Pass](laptop/what_the_employer_will_see.png) |
| student | My Applications | [Pass](phone/my_applications.png) | [Pass](tablet/my_applications.png) | [Pass](laptop/my_applications.png) |
| student | AI Assistant | [Pass](phone/ai_assistant.png) | [Pass](tablet/ai_assistant.png) | [Pass](laptop/ai_assistant.png) |
| student | Account settings (student) | [Pass](phone/account_settings_student.png) | [Pass](tablet/account_settings_student.png) | [Pass](laptop/account_settings_student.png) |
| new employer | Employer waiting for approval | [Pass](phone/employer_waiting_for_approval.png) | [Pass](tablet/employer_waiting_for_approval.png) | [Pass](laptop/employer_waiting_for_approval.png) |
| employer | Employer Dashboard | [Pass](phone/employer_dashboard.png) | [Pass](tablet/employer_dashboard.png) | [Pass](laptop/employer_dashboard.png) |
| employer | My Jobs | [Pass](phone/my_jobs.png) | [Pass](tablet/my_jobs.png) | [Pass](laptop/my_jobs.png) |
| employer | Post a Job | [Pass](phone/post_a_job.png) | [Pass](tablet/post_a_job.png) | [Pass](laptop/post_a_job.png) |
| employer | View applicants | [Pass](phone/view_applicants.png) | [Pass](tablet/view_applicants.png) | [Pass](laptop/view_applicants.png) |
| employer | Applicant | [Pass](phone/applicant.png) | [Pass](tablet/applicant.png) | [Pass](laptop/applicant.png) |
| employer | Graduate who fits | [Pass](phone/graduate_who_fits.png) | [Pass](tablet/graduate_who_fits.png) | [Pass](laptop/graduate_who_fits.png) |
| employer | Edit job | [Pass](phone/edit_job.png) | [Pass](tablet/edit_job.png) | [Pass](laptop/edit_job.png) |
| employer | Account settings (employer) | [Pass](phone/account_settings_employer.png) | [Pass](tablet/account_settings_employer.png) | [Pass](laptop/account_settings_employer.png) |
| career office | Career office Dashboard | [Pass](phone/career_office_dashboard.png) | [Pass](tablet/career_office_dashboard.png) | [Pass](laptop/career_office_dashboard.png) |
| career office | Users | [Pass](phone/users.png) | [Pass](tablet/users.png) | [Pass](laptop/users.png) |
| career office | Academics: Modules | [Pass](phone/academics_modules.png) | [Pass](tablet/academics_modules.png) | [Pass](laptop/academics_modules.png) |
| career office | Academics: Intakes | [Pass](phone/academics_intakes.png) | [Pass](tablet/academics_intakes.png) | [Pass](laptop/academics_intakes.png) |
| career office | Account settings (admin) | [Pass](phone/account_settings_admin.png) | [Pass](tablet/account_settings_admin.png) | [Pass](laptop/account_settings_admin.png) |

99 of 99 checks pass.

## To look at (text wider than its box; often fine, e.g. a cut word with "…")

- phone, Academics: Intakes: span.block.font-mono "APU1F2701SE"
- tablet, Academics: Intakes: span.block.font-mono "APU1F2701SE"

