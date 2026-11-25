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
    // the header's count strip (19 Nov redesign): "Skills found" 0 before, 3 after (Python, Programming, Debugging)
    await expect(page.getByRole('term').filter({ hasText: /^Skills? found$/ }).locator('xpath=..')).toContainText('3')
    await shot(page, 'TC-01_grade_to_skills')
  })

  test('TC-10 the profile checklist counts what was added', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/profile')
    await page.getByRole('button', { name: /Your profile: 1 of 5 done/ }).click()   // 19 Nov redesign: ":" not "·"
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
    // Python matched (from her module); SQL and Git are the gap. 19 Nov redesign: no tabs; the gap sits beside the ad,
    // with a fit bar ("You have 1 of the 3 required skills") and two groups, "You have" (1) and "To learn" (2)
    await expect(page.getByRole('img', { name: /You have 1 of the 3 required skills/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^You have\s*1/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^To learn\s*2/ })).toBeVisible()
    await shot(page, 'TC-16_job_detail_gap')
  })

  test('TC-28 apply, and My Applications shows Applied', async ({ page }) => {
    await signIn(page, STUDENT)
    await page.goto('/recommend')
    await page.getByText('Graduate Software Engineer').first().click()
    await page.getByRole('button', { name: 'Apply with my SkillMap profile' }).click()
    const clicked = Date.now()
    await page.getByRole('button', { name: 'Apply now' }).click()
    // 23 Oct (her WebKit run, then her "how long should it wait?"): leaving at once cancelled the application before it
    // was sent, so the test waits for SkillMap's own confirmation, as a person would. And it must come quickly: Google's
    // RAIL model, beyond 1 s "users lose focus on the task" (web.dev/articles/rail); the button shows "Applying…" at
    // once meanwhile. Measured 0.15 s; slower than 1 s fails the test, so a slow app can't hide behind the wait.
    // 20 Nov: the "Applied · date" chip was removed; once applied, the page offers "View in My Applications"
    await expect(page.getByRole('link', { name: 'View in My Applications' })).toBeVisible()
    const took = Date.now() - clicked
    test.info().annotations.push({ type: 'Apply took', description: `${took} ms (limit 1000 ms)` })
    console.log(`  Apply: click to "Applied" in ${took} ms (limit 1000 ms)`)
    expect(took, 'applying took longer than 1 second (RAIL)').toBeLessThan(1000)
    await page.goto('/applications')
    await expect(page.getByText('Graduate Software Engineer').first()).toBeVisible()
    await expect(page.getByText('Applied').first()).toBeVisible()
    await shot(page, 'TC-28_applied')
  })
})
