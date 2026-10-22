// The accounts backend/scripts/tools/setup_e2e.py creates (same password there)
export const PASSWORD = 'Orchid-Lantern-42'
export const STUDENT = 'e2e.student@example.com'
export const APPLICANT = 'e2e.applicant@example.com'
export const EMPLOYER = 'e2e.employer@example.com'
export const ADMIN = 'e2e.admin@example.com'

export async function signIn(page, email) {
  await page.goto('/login')
  await page.getByLabel('Username or Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}

// Evidence: a full-page screenshot named after the system test case it supports
export async function shot(page, name) {
  await page.screenshot({ path: `../docs/evidence/e2e/${name}.png`, fullPage: false, animations: 'disabled' })   // fades finished, so the picture shows the end state
}
