// Each role reaches only its own pages, and signed-out visitors are sent to sign in.
// System test case TC-54 (docs/testing/SkillMap_system_test_cases.xlsx).
import { test, expect } from '@playwright/test'
import { signIn, shot, STUDENT } from './helpers'

test('TC-54 signed out: a private page sends you to sign in', async ({ page }) => {
  await page.goto('/profile')
  await page.waitForURL('**/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('TC-54 a student cannot open employer or career office pages', async ({ page }) => {
  await signIn(page, STUDENT)
  for (const path of ['/employer/jobs', '/employer/post', '/admin/users', '/admin/academic']) {
    await page.goto(path)
    await page.waitForURL('**/dashboard')                  // sent back to her own Dashboard
  }
  await shot(page, 'TC-54_student_sent_to_dashboard')
})
