// Student journey: grades become skills, matched jobs, the skill gap explained, then applying.
// System test cases TC-01, TC-10, TC-11, TC-16, TC-28 (docs/testing/SkillMap_system_test_cases.xlsx).
import { test, expect } from '@playwright/test'
import { signIn, shot, STUDENT } from './helpers'

test.describe.serial('Student', () => {
  test('TC-01 a grade turns a module into skills', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/profile')
    await page.getByLabel('Grade for Python Programming').selectOption({ label: 'A (4.0)' })
    await page.getByRole('button', { name: 'Save grades' }).click()
    // the heading's count: 0 before, 3 after (Python, Programming, Debugging from the module)
    await expect(page.locator('p', { hasText: 'found in your modules' })).toContainText('3 skills')
    await shot(page, 'TC-01_grade_to_skills')
  })

  test('TC-10 the profile checklist counts what was added', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/profile')
    await page.getByRole('button', { name: /Your profile · 1 of 5 done/ }).click()
    await expect(page.getByRole('link', { name: /Projects/ })).toBeVisible()
    await shot(page, 'TC-10_profile_checklist')
  })

  test('TC-11 Job Matches lists jobs for her skills', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/recommend')
    await expect(page.getByText('Graduate Software Engineer').first()).toBeVisible()
    await shot(page, 'TC-11_job_matches')
  })

  test('TC-16 Job Detail explains the match and the gap', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/recommend')
    await page.getByText('Graduate Software Engineer').first().click()
    await page.waitForURL(/\/jobs\//)
    // Python matched (from her module); SQL and Git are the gap
    await expect(page.getByText('you have 1 of 3')).toBeVisible()
    await page.getByRole('tab', { name: 'Skill Gap Analysis' }).click()
    await expect(page.getByRole('tab', { name: 'Skill Gap Analysis' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: /Required skills you have \(1 of 3\)/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Required skills you're missing \(2\)/ })).toBeVisible()
    await shot(page, 'TC-16_job_detail_gap')
  })

  test('TC-28 apply, and My Applications shows Applied', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/recommend')
    await page.getByText('Graduate Software Engineer').first().click()
    await page.getByRole('button', { name: 'Apply with my SkillMap profile' }).click()
    await page.getByRole('button', { name: 'Apply now' }).click()
    await page.goto('/applications')
    await expect(page.getByText('Graduate Software Engineer').first()).toBeVisible()
    await expect(page.getByText('Applied').first()).toBeVisible()
    await shot(page, 'TC-28_applied')
  })
})
