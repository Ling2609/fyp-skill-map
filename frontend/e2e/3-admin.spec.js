// A new employer signs up, waits, and the career office approves them; the career office adds an intake.
// System test cases TC-51, TC-48, TC-50 (docs/testing/SkillMap_system_test_cases.xlsx).
import { test, expect } from '@playwright/test'
import { signIn, shot, PASSWORD, ADMIN } from './helpers'

const NEW_EMPLOYER = 'e2e.newemployer@example.com'
const COMPANY = 'Lantern Labs Sdn Bhd'

test.describe.serial('Career office', () => {
  test('TC-51 a new employer signs up and waits for approval', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Username').fill('e2e_lantern')
    await page.getByLabel('First Name').fill('Hui')
    await page.getByLabel('Last Name').fill('Ng')
    await page.getByLabel('Email').fill(NEW_EMPLOYER)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm Password').fill(PASSWORD)
    await page.getByLabel('Role').selectOption('employer')
    await page.getByLabel('Company name').fill(COMPANY)
    await page.getByRole('checkbox').check()                       // the privacy notice
    await expect(page.getByText('Username is available')).toBeVisible()   // the name check has answered
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/login')

    await signIn(page, NEW_EMPLOYER)
    await expect(page.getByText(`${COMPANY} is waiting for approval`)).toBeVisible()
    await shot(page, 'TC-51_employer_waiting')
  })

  test('TC-48 the career office approves the employer', async ({ page, browser }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/users')
    await page.getByLabel('Search users').fill('Lantern')
    await expect(page.locator('tbody tr')).toHaveCount(1)          // the search waits until typing pauses
    await page.getByRole('button', { name: `Actions for ${COMPANY}` }).click()
    await page.getByRole('menuitem', { name: 'Approve' }).click()
    await expect(page.getByText(`${COMPANY} approved.`)).toBeVisible()
    await shot(page, 'TC-48_employer_approved')

    // the employer, in a separate browser window, now gets the full app instead of the waiting page
    const employer = await browser.newPage()
    await signIn(employer, NEW_EMPLOYER)
    await expect(employer.getByRole('link', { name: 'My Jobs' })).toBeVisible()
    await expect(employer.getByText('is waiting for approval')).toHaveCount(0)
    await employer.close()
  })

  test('TC-50 the career office adds an intake', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/academic')
    await page.getByRole('tab', { name: /Intakes/ }).click()
    await page.getByLabel('Intake code (Year 1)').fill('APU1F2701SE')
    await page.getByLabel('Starts').fill('2027-01-04')
    await page.getByRole('button', { name: 'Add intake' }).click()
    await expect(page.getByRole('cell', { name: 'APU1F2701SE' })).toBeVisible()
    await shot(page, 'TC-50_intake_added')
  })
})
