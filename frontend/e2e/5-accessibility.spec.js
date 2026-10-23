// Accessibility (TC-66): every page (and the main pop-ups and forms) is scanned with axe-core, the engine behind Chrome Lighthouse's accessibility
// score, against WCAG 2.2 A and AA plus its best-practice rules (contrast, labels, names, landmarks, target size). Any problem fails the test and is listed.
// A tool can't judge everything, so the keyboard is checked too: the main lists open with Tab and Enter, no mouse.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'fs'
import { signIn, STUDENT, EMPLOYER, ADMIN, EVIDENCE } from './helpers'

const found = []                       // every problem, saved to accessibility.json in the evidence folder

async function scan(page, name) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)        // colour fades (0.15-0.2 s) finished, so contrast is measured at the end
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
  for (const v of r.violations) found.push({ page: name, rule: v.id, impact: v.impact, help: v.help,
                                             where: v.nodes.map(n => n.target.join(' ')) })
  return { name, passes: r.passes.length, problems: r.violations.length }
}

test('TC-66 the pages and pop-ups of each role have no accessibility problems that axe-core finds (WCAG 2.2 AA + best practice)', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const pages = []
  await page.goto('/login'); pages.push(await scan(page, 'Sign in'))
  await page.goto('/register'); pages.push(await scan(page, 'Register'))
  await page.goto('/forgot-password'); pages.push(await scan(page, 'Forgot password'))
  await page.goto('/privacy'); pages.push(await scan(page, 'Privacy notice'))

  await signIn(page, STUDENT); pages.push(await scan(page, 'Student Dashboard'))
  for (const [path, name] of [['/profile', 'My Profile'], ['/recommend', 'Job Matches'], ['/applications', 'My Applications'],
                              ['/chatbot', 'AI Assistant'], ['/profile/settings', 'Profile & privacy'],
                              ['/profile/preview', 'Preview as employer'], ['/account', 'Account settings']]) {
    await page.goto(path); pages.push(await scan(page, name))
  }
  await page.goto('/recommend')
  await page.getByRole('link', { name: 'Graduate Software Engineer' }).click(); pages.push(await scan(page, 'Job Detail'))
  await page.getByRole('tab', { name: 'Skill Gap Analysis' }).click(); pages.push(await scan(page, 'Job Detail: skill gap'))
  // pop-ups and forms appear only after a click, so each is opened and scanned too (then closed, nothing saved)
  await page.goto('/profile?tab=projects')
  await page.getByRole('button', { name: '+ Add project' }).first().click(); pages.push(await scan(page, 'Add project form'))
  for (const [tab, button, name] of [['experience', '+ Add work', 'Add work form'], ['certs', '+ Add certificate', 'Add certificate form'],
                                     ['awards', '+ Add award', 'Add award form']]) {
    await page.goto(`/profile?tab=${tab}`)
    await page.getByRole('button', { name: button }).first().click(); pages.push(await scan(page, name))
  }
  await page.goto('/recommend')
  await page.getByRole('link', { name: 'Junior Data Analyst' }).click()
  await page.getByRole('button', { name: 'Apply with my SkillMap profile' }).click(); pages.push(await scan(page, 'Apply pop-up'))
  await page.getByRole('button', { name: "Check what they'll see" }).click(); pages.push(await scan(page, "What the employer will see"))

  const employer = await (await browser.newContext()).newPage()
  await signIn(employer, EMPLOYER); pages.push(await scan(employer, 'Employer Dashboard'))
  await employer.goto('/employer/jobs'); pages.push(await scan(employer, 'My Jobs'))
  await employer.getByRole('row', { name: /Graduate Software Engineer/ }).getByRole('link', { name: 'View applicants' }).click()
  pages.push(await scan(employer, 'Applicants'))
  await employer.getByRole('link', { name: 'Daniel Lim' }).click(); pages.push(await scan(employer, 'Applicant'))
  await employer.goto('/employer/post'); pages.push(await scan(employer, 'Post a Job'))
  await employer.goto('/employer/jobs'); await employer.getByRole('row', { name: /Graduate Software Engineer/ }).getByRole('link', { name: 'View applicants' }).click()
  await employer.getByLabel('Status for Aina Rahman').selectOption('rejected'); pages.push(await scan(employer, 'Not selected: reason pop-up'))
  await employer.keyboard.press('Escape')
  const jobId = employer.url().split('/').pop()
  await employer.goto(`/employer/jobs/${jobId}/edit`); pages.push(await scan(employer, 'Edit job'))

  const admin = await (await browser.newContext()).newPage()
  await signIn(admin, ADMIN); pages.push(await scan(admin, 'Career office Dashboard'))
  await admin.goto('/admin/users'); pages.push(await scan(admin, 'Users'))
  await admin.getByRole('button', { name: /^Actions for / }).first().click(); pages.push(await scan(admin, 'Users: actions menu'))
  await admin.keyboard.press('Escape')
  await admin.goto('/admin/academic'); pages.push(await scan(admin, 'Academics'))
  await admin.getByRole('tab', { name: /Intakes/ }).click(); pages.push(await scan(admin, 'Academics: intakes'))
  await admin.getByRole('button', { name: 'Edit list' }).first().click(); pages.push(await scan(admin, 'Academics: edit a module list'))

  fs.mkdirSync(EVIDENCE, { recursive: true })
  fs.writeFileSync(`${EVIDENCE}/accessibility.json`, JSON.stringify({ standard: 'WCAG 2.0/2.1/2.2 A + AA and best-practice rules (axe-core)', pages, problems: found }, null, 2))
  expect(found, found.map(f => `${f.page}: ${f.help} (${f.where.length})`).join('\n')).toEqual([])
})

test('TC-66 keyboard only: a job opens from Job Matches with Tab and Enter', async ({ page }) => {
  await signIn(page, STUDENT)
  await page.goto('/recommend')
  const title = page.getByRole('link', { name: 'Junior Data Analyst' })
  await expect(title).toBeVisible()
  for (let i = 0; i < 40 && !(await title.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(title).toBeFocused()                     // reached with Tab alone
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/jobs\//)
  await expect(page.getByRole('heading', { name: 'Junior Data Analyst' })).toBeVisible()
})

test('TC-66 keyboard only: an applicant opens from View applicants with Tab and Enter', async ({ page }) => {
  await signIn(page, EMPLOYER)
  await page.goto('/employer/jobs')
  await page.getByRole('row', { name: /Graduate Software Engineer/ }).getByRole('link', { name: 'View applicants' }).click()
  const name = page.getByRole('link', { name: 'Daniel Lim' })
  await expect(name).toBeVisible()
  for (let i = 0; i < 40 && !(await name.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(name).toBeFocused()
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/employer\/applications\//)
  await expect(page.getByRole('heading', { name: 'Daniel Lim' })).toBeVisible()
})
