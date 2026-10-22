// Lighthouse accessibility on EVERY page of SkillMap (23 Oct; her question "should be all pages"). The same Lighthouse
// version as Chrome's DevTools (13.4.1), desktop, Accessibility only, run by a script so all ~30 pages get a report.
//
// Run from frontend/, with the e2e backend and `npm run dev` running, AFTER `npx playwright test` (it uses the
// applications and the new employer those tests made; docs/testing/e2e.md):
//     node scripts/lighthouse_all.mjs
// Reports: docs/evidence/lighthouse/all/<page>.html, and a table of scores in docs/evidence/lighthouse/all/summary.md.
// Exit code 1 if any page scores below 100, so a problem can't go unnoticed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:8000'
const PASSWORD = 'Orchid-Lantern-42'
const PORT = 9333
const OUT = path.resolve('../docs/evidence/lighthouse/all')

async function call(method, url, body, token) {
  const r = await fetch(API + url, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                     body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${await r.text()}`)
  return r.json()
}
const login = async (email) => (await call('POST', '/auth/login', { email, password: PASSWORD })).access_token
async function newAccount(role) {                    // a fresh account for the pages only a new account sees
  const n = Date.now().toString(36)
  const body = { username: `lh_${role}_${n}`, first_name: 'Test', last_name: role === 'student' ? 'Student' : 'Employer',
                 email: `lh.${role}.${n}@example.com`, password: PASSWORD, role, accept_privacy: true }
  if (role === 'employer') body.company_name = 'Waiting Test Sdn Bhd'
  await call('POST', '/auth/register', body)
  return login(body.email)
}

// The ids the pages need, read from the e2e data
const employerToken = await login('e2e.employer@example.com')
const jobs = await call('GET', '/employer/jobs', null, employerToken)
const gse = jobs.find(j => j.title === 'Graduate Software Engineer')
const applicants = (await call('GET', `/employer/jobs/${gse.id}/applicants`, null, employerToken)).applicants
const graduates = (await call('GET', '/employer/dashboard', null, employerToken)).graduates || []

const ROLES = [
  { who: 'signed out', token: null, pages: [['Sign in', '/login'], ['Register', '/register'], ['Forgot password', '/forgot-password'],
                                            ['Privacy notice', '/privacy']] },
  { who: 'new student', token: await newAccount('student'), pages: [['Study set-up (first sign-in)', '/setup']] },
  { who: 'student', token: await login('e2e.student@example.com'), pages: [
      ['Student Dashboard', '/dashboard'], ['My Profile: Modules', '/profile'], ['My Profile: Projects', '/profile?tab=projects'],
      ['My Profile: Experience', '/profile?tab=experience'], ['My Profile: Certificates', '/profile?tab=certs'],
      ['My Profile: Awards', '/profile?tab=awards'], ['Profile & privacy', '/profile/settings'], ['Preview as employer', '/profile/preview'],
      ['Job Matches', '/recommend'], ['Job Detail', `/jobs/${gse.job_ref}`], ['What the employer will see', `/jobs/${gse.job_ref}/check`],
      ['My Applications', '/applications'], ['AI Assistant', '/chatbot'], ['Account settings (student)', '/account']] },
  { who: 'new employer', token: await newAccount('employer'), pages: [['Employer waiting for approval', '/dashboard']] },
  { who: 'employer', token: employerToken, pages: [
      ['Employer Dashboard', '/dashboard'], ['My Jobs', '/employer/jobs'], ['Post a Job', '/employer/post'],
      ['View applicants', `/employer/jobs/${gse.id}`], ['Applicant', `/employer/applications/${applicants[0].id}`],
      ...(graduates[0] ? [['Graduate who fits', `/employer/graduates/${graduates[0].student_id}?job=${graduates[0].job_id}`]] : []),
      ['Edit job', `/employer/jobs/${gse.id}/edit`], ['Account settings (employer)', '/account']] },
  { who: 'career office', token: await login('e2e.admin@example.com'), pages: [
      ['Career office Dashboard', '/dashboard'], ['Users', '/admin/users'], ['Academics: Modules', '/admin/academic'],
      ['Academics: Intakes', '/admin/academic?tab=intakes'], ['Account settings (admin)', '/account']] },
]

fs.mkdirSync(OUT, { recursive: true })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'skillmap-lh-'))
const browser = await chromium.launchPersistentContext(profile, {
  headless: true, args: [`--remote-debugging-port=${PORT}`],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
})
const page = browser.pages()[0] || await browser.newPage()
const rows = []
for (const role of ROLES) {
  await page.goto(WEB + '/login')                    // the sign-in Lighthouse's tab will share (same browser profile)
  await page.evaluate(t => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token')), role.token)
  for (const [name, url] of role.pages) {
    const r = await lighthouse(WEB + url, { port: PORT, output: 'html', onlyCategories: ['accessibility'],
                                            disableStorageReset: true, logLevel: 'error' }, desktopConfig)
    const score = Math.round(r.lhr.categories.accessibility.score * 100)
    const failed = r.lhr.categories.accessibility.auditRefs
      .filter(a => r.lhr.audits[a.id].score !== null && r.lhr.audits[a.id].score < 1).map(a => r.lhr.audits[a.id].title)
    const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.html'
    fs.writeFileSync(path.join(OUT, file), r.report)
    rows.push({ who: role.who, name, url, score, failed, file, landed: r.lhr.finalDisplayedUrl.replace(WEB, '') })
    console.log(`${String(score).padStart(3)}  ${role.who.padEnd(13)} ${name}${failed.length ? '  <- ' + failed.join('; ') : ''}`)
  }
}
await browser.close()

const lines = [`# Lighthouse accessibility, every page (${new Date().toISOString().slice(0, 10)})`, '',
  `Lighthouse ${'13.4.1'}, desktop, Accessibility only; \`node scripts/lighthouse_all.mjs\` on the e2e data. One report per page in this folder.`, '',
  '| Signed in as | Page | Address | Score | Failed audits |', '|---|---|---|---|---|',
  ...rows.map(r => `| ${r.who} | [${r.name}](${r.file}) | \`${r.landed}\` | ${r.score} | ${r.failed.join('; ') || '-'} |`), '',
  `${rows.filter(r => r.score === 100).length} of ${rows.length} pages score 100.`]
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n')
console.log(`\n${rows.filter(r => r.score === 100).length} of ${rows.length} pages score 100. Table: docs/evidence/lighthouse/all/summary.md`)
process.exit(rows.every(r => r.score === 100) ? 0 : 1)
