// Each role reaches only its own pages, and signed-out visitors are sent to sign in.
// System test case TC-54 (docs/testing/SkillMap_system_test_cases.xlsx).
import { test, expect } from '@playwright/test'
import { signIn, shot, STUDENT, EMPLOYER } from './helpers'

test('TC-54 signed out: a private page sends you to sign in', async ({ page }) => {
  await page.goto('/profile')
  await page.waitForURL('**/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('TC-54 a student cannot open employer or career office pages', async ({ page }) => {
  await signIn(page, STUDENT)
  for (const [path, who] of [['/employer/jobs', 'employers'], ['/employer/post', 'employers'],
                             ['/admin/users', 'the career office'], ['/admin/academic', 'the career office']]) {
    await page.goto(path)
    await page.waitForURL('**/dashboard')                  // sent back to her own Dashboard, and told why
    await expect(page.getByRole('status').filter({ hasText: `That page is for ${who}` })).toBeVisible()
  }
  await expect(page.getByText('Graduate Software Engineer').first()).toBeVisible()   // her Dashboard has drawn, jobs too
  await shot(page, 'TC-54_student_sent_to_dashboard')
})

test('a slow answer for an older username does not overwrite the newer one', async ({ page }) => {
  // 23 Oct (bug sweep): the check for "aina1" is held back 1.5 s, so it arrives AFTER the check for "aina12". Before the
  // fix the page then said "available" for aina12, which is taken. Both answers are made up here; nothing is saved.
  await page.route('**/auth/check-username/**', async route => {
    const name = decodeURIComponent(route.request().url().split('/').pop())
    if (name === 'aina1') {
      await new Promise(r => setTimeout(r, 1500))
      return route.fulfill({ json: { available: true, message: 'Username is available' } })
    }
    return route.fulfill({ json: { available: false, message: 'Username is already taken' } })
  })
  await page.goto('/register')
  const box = page.getByLabel('Username')
  await box.fill('aina1')
  await page.waitForRequest(r => r.url().endsWith('/check-username/aina1'))   // the slow check is on its way
  await box.fill('aina12')
  await expect(page.getByText('Username is already taken')).toBeVisible()
  await page.waitForTimeout(2000)                                              // the slow answer has arrived by now
  await expect(page.getByText('Username is already taken')).toBeVisible()
  await expect(page.getByText('Username is available')).toHaveCount(0)
})

test('a broken link shows a message, not a blank page', async ({ page }) => {
  // 23 Oct (found by the Lighthouse run over every page): a link missing its ?job= made the backend answer with a list
  // of field errors, which the page tried to print, and the whole app went blank
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await signIn(page, EMPLOYER)
  await page.goto('/employer/graduates/1')          // no ?job=
  await expect(page.getByRole('alert')).toContainText("wasn't valid")
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()   // the app is still there
  expect(errors).toEqual([])
})
