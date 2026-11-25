// Phone / tablet / laptop check on EVERY page of SkillMap (25 Nov; her supervisor asked for phone simulation).
// The same 33 pages as lighthouse_all.mjs, each at three sizes, like Chrome DevTools' device toolbar:
//   phone  = iPhone 12, 390 x 844 (touch, mobile)   tablet = iPad, 768 x 1024 (touch)   laptop = 1366 x 768
// For each page and size it saves a full-page screenshot and checks:
//   1. no sideways scroll (the page is not wider than the screen)
//   2. nothing sticks out past the left or right edge (unless it sits inside its own scroll area)
//   3. signed in on the phone: the bottom tab bar is there
// Text that spills out of its own box is listed as "look" (a person checks the screenshot); it does not fail the page.
//
// Run from frontend/, with the e2e backend and `npm run dev` running, after a Playwright run (it uses that data):
//     node.exe scripts/devices_all.mjs
// Output: docs/evidence/ui/devices/<size>/<page>.png and docs/evidence/ui/devices/summary.md (page x size -> Pass/Fail).
// Exit code 1 if any page fails.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:8000'
const PASSWORD = 'Orchid-Lantern-42'
const OUT = path.resolve('../docs/evidence/ui/devices')
const SIZES = [
  { name: 'phone', label: 'iPhone 12 (390x844)', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'tablet', label: 'iPad (768x1024)', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'laptop', label: 'Laptop (1366x768)', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

async function call(method, url, body, token) {
  const r = await fetch(API + url, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                     body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${await r.text()}`)
  return r.json()
}
const login = async (email) => (await call('POST', '/auth/login', { email, password: PASSWORD })).access_token
// new accounts verify their email first; the backend runs with E2E_OUTBOX=1, so the code is read from the outbox
const OUTBOX = path.resolve(process.env.OUTBOX_DIR || '../backend/.e2e_outbox')
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
async function newAccount(role) {
  const n = Date.now().toString(36)
  const body = { username: `dv_${role}_${n}`, first_name: 'Test', last_name: role === 'student' ? 'Student' : 'Employer',
                 email: `dv.${role}.${n}@example.com`, password: PASSWORD, role, accept_privacy: true }
  if (role === 'employer') {
    body.company_name = 'Waiting Test Sdn Bhd'
    body.company_ssm = '2026' + String(Date.now() % 1e8).padStart(8, '0')
  }
  const { ticket } = await call('POST', '/auth/register', body)
  await call('POST', '/auth/verify-email', { ticket, code: await codeFor(body.email) })
  return login(body.email)
}

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

// runs inside the page: what sticks out sideways, and text that spills out of its box
function inspect(signedIn, phone) {
  const vw = document.documentElement.clientWidth
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') +
    (el.textContent.trim() ? ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}"` : '')
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' }
  const clipped = (el) => {                           // inside a box that scrolls or clips sideways (a table, a chip row)
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox !== 'visible') return true
    }
    return false
  }
  const out = [], spill = []
  for (const el of document.body.querySelectorAll('*')) {
    if (!shown(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue          // screen-reader-only text and empty boxes
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el) && getComputedStyle(el).position !== 'fixed') out.push(name(el))
    const s = getComputedStyle(el)
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    if (ownText && s.display !== 'inline' && s.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 2) spill.push(name(el))
  }
  const tabs = !(signedIn && phone) || [...document.querySelectorAll('nav')].some(n => {
    const r = n.getBoundingClientRect(); return shown(n) && r.height > 0 && r.bottom >= innerHeight - 2 && r.top > innerHeight / 2
  })
  return { sideways: document.documentElement.scrollWidth > vw + 1, out: [...new Set(out)].slice(0, 4),
           spill: [...new Set(spill)].slice(0, 4), tabs }
}

const browser = await chromium.launch()
const rows = []
for (const size of SIZES) {
  fs.mkdirSync(path.join(OUT, size.name), { recursive: true })
  console.log(`\n${size.label}`)
  for (const role of ROLES) {
    const ctx = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.hasTouch,
                                           deviceScaleFactor: size.deviceScaleFactor, reducedMotion: 'reduce' })
    await ctx.addInitScript(t => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token')), role.token)
    const page = await ctx.newPage()
    for (const [name, url] of role.pages) {
      await page.goto(WEB + url)
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(600)                 // fonts and the first paint of charts
      const r = await page.evaluate(inspect, [!!role.token, size.name === 'phone']).catch(e => ({ error: e.message }))
      const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.png'
      await page.screenshot({ path: path.join(OUT, size.name, file), fullPage: true })
      const problems = r.error ? [r.error] : [...(r.sideways ? ['sideways scroll'] : []),
        ...r.out.map(o => `past the edge: ${o}`), ...(r.tabs ? [] : ['no bottom tab bar'])]
      rows.push({ size: size.name, who: role.who, name, file, pass: !problems.length, problems, look: r.spill || [] })
      console.log(`${problems.length ? 'FAIL' : 'pass'}  ${role.who.padEnd(13)} ${name}${problems.length ? '  <- ' + problems.join('; ') : ''}` +
                  `${r.spill?.length ? '  (look: ' + r.spill.join(', ') + ')' : ''}`)
    }
    await ctx.close()
  }
}
await browser.close()

const pages = [...new Map(rows.map(r => [`${r.who}|${r.name}`, r])).values()]
const cell = (r) => r ? `[${r.pass ? 'Pass' : 'Fail'}](${r.size}/${r.file})` : '-'
const lines = [`# Devices: every page at phone, tablet and laptop size (${new Date().toISOString().slice(0, 10)})`, '',
  '`node scripts/devices_all.mjs` on the e2e data, Chromium with device emulation (as Chrome DevTools\' device toolbar). ' +
  'Pass = no sideways scroll, nothing past the screen edge, and (phone, signed in) the bottom tab bar shows. Click a result for its screenshot.', '',
  `| Signed in as | Page | ${SIZES.map(s => s.label).join(' | ')} |`, `|---|---|${SIZES.map(() => '---').join('|')}|`,
  ...pages.map(p => `| ${p.who} | ${p.name} | ${SIZES.map(s => cell(rows.find(r => r.size === s.name && r.who === p.who && r.name === p.name))).join(' | ')} |`),
  '', `${rows.filter(r => r.pass).length} of ${rows.length} checks pass.`, '',
  ...(rows.some(r => !r.pass) ? ['## Problems', '', ...rows.filter(r => !r.pass).map(r => `- ${r.size}, ${r.name}: ${r.problems.join('; ')}`), ''] : []),
  ...(rows.some(r => r.look.length) ? ['## To look at (text wider than its box; often fine, e.g. a cut word with "…")', '',
      ...rows.filter(r => r.look.length).map(r => `- ${r.size}, ${r.name}: ${r.look.join(', ')}`), ''] : [])]
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n')
console.log(`\n${rows.filter(r => r.pass).length} of ${rows.length} checks pass. Table: docs/evidence/ui/devices/summary.md`)
process.exit(rows.every(r => r.pass) ? 0 : 1)
