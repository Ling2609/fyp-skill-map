// Employer journey: see who applied, open an application, shortlist it, and the student sees the change.
// System test cases TC-31, TC-42, TC-38 (docs/testing/SkillMap_system_test_cases.xlsx).
import { test, expect } from '@playwright/test'
import { signIn, shot, EMPLOYER, APPLICANT } from './helpers'

test.describe.serial('Employer', () => {
  test('TC-31 the employer sees who applied and how well they fit', async ({ page }) => {
    await signIn(page, EMPLOYER)
    await page.goto('/employer/jobs')
    // the first "View applicants" belongs to the newest job; open the one for Graduate Software Engineer
    const row = page.getByRole('row', { name: /Graduate Software Engineer/ })
    await row.getByRole('link', { name: 'View applicants' }).click()
    await expect(page.getByRole('heading', { name: 'Graduate Software Engineer' })).toBeVisible()
    await expect(page.getByText('Daniel Lim')).toBeVisible()
    await shot(page, 'TC-31_applicants')
  })

  test('TC-42 contact details appear only after shortlisting', async ({ page }) => {
    await signIn(page, EMPLOYER)
    await page.goto('/employer/jobs')
    await page.getByRole('row', { name: /Graduate Software Engineer/ }).getByRole('link', { name: 'View applicants' }).click()
    await page.getByText('Daniel Lim').click()
    // before: no email, and the page says why
    await expect(page.getByText('Email and phone appear after you shortlist this applicant.')).toBeVisible()
    await expect(page.getByRole('link', { name: APPLICANT })).toHaveCount(0)
    // shortlist: the email appears
    await page.getByLabel('Status for this job').selectOption('shortlisted')
    await expect(page.getByRole('link', { name: APPLICANT })).toBeVisible()
    await shot(page, 'TC-42_shortlisted_contact')
  })

  test('TC-38 the student sees "Shortlisted" on My Applications', async ({ page }) => {
    await signIn(page, APPLICANT)
    await page.goto('/applications')
    await expect(page.getByText('Graduate Software Engineer').first()).toBeVisible()
    await expect(page.getByText('Shortlisted').first()).toBeVisible()
    await shot(page, 'TC-38_student_sees_shortlisted')
  })
})
