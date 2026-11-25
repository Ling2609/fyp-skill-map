// A new employer signs up, waits, and the career office approves them; the career office adds an intake.
// System test cases TC-51, TC-48, TC-50 (docs/testing/SkillMap_system_test_cases.xlsx).
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { signIn, shot, PASSWORD, ADMIN } from './helpers'

// 23 Nov (email verification): the backend runs with E2E_OUTBOX=1 on skillmap_e2e, so emails are written to
// backend/.e2e_outbox/ instead of being sent (docs/testing/e2e.md). Reads the newest code sent to `to` and deletes the
// file, so no code is left behind; codes never appear in the evidence screenshots.
const OUTBOX = path.resolve('../backend/.e2e_outbox')
async function codeFor(to) {
  const safe = to.toLowerCase().replace(/[^a-z0-9@._-]+/g, '_')
  for (let i = 0; i < 50; i++) {
    const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter(f => f.endsWith(`_${safe}.txt`)).sort() : []
    if (files.length) {
      const file = path.join(OUTBOX, files.at(-1))
      const code = fs.readFileSync(file, 'utf8').match(/^\s{4}(\d{6})$/m)?.[1]
      fs.unlinkSync(file)
      if (code) return code
    }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`No verification email for ${to} in ${OUTBOX}. Is the backend running with E2E_OUTBOX=1?`)
}

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
    await page.getByRole('button', { name: 'Employer', exact: true }).click()
    await page.getByLabel('Company name').fill(COMPANY)
    await page.getByLabel('Company website').fill('e2e-company.example')
    await page.getByLabel('SSM registration number').fill('202301000002')
    await page.getByRole('checkbox').check()                       // the privacy notice
    await expect(page.getByText('Username is available')).toBeVisible()   // the name check has answered
    await page.getByRole('button', { name: 'Create account' }).click()

    // 23 Nov: the account starts unverified; the code from the email verifies it, then Sign in
    await page.waitForURL('**/verify-email')
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible()                   // employers: then the career office review
    await page.getByLabel('6-digit code').fill(await codeFor(NEW_EMPLOYER))
    await page.getByRole('button', { name: 'Verify email' }).click()
    await page.waitForURL('**/login')
    await expect(page.getByText('Email verified.')).toBeVisible()

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
    // 20 Nov redesign: "+ Add intake" opens a dialog; the intakes are listed as buttons, not table rows
    await page.getByRole('button', { name: '+ Add intake' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add an intake' })
    await dialog.getByLabel('Intake code (Year 1)').fill('APU1F2701SE')
    await dialog.getByLabel('Starts').fill('2027-01-04')
    await dialog.getByRole('button', { name: 'Add intake' }).click()
    await expect(page.getByRole('region', { name: 'Intakes' }).getByRole('button', { name: /APU1F2701SE/ })).toBeVisible()
    await shot(page, 'TC-50_intake_added')
  })
})
