// Browser (end-to-end) tests, 22 Oct (system testing step 2; how to run: docs/testing/e2e.md).
// They click through the real app: the frontend (npm run dev, port 5173) and the backend on the SEPARATE e2e
// database (backend/scripts/tools/setup_e2e.py fills it), never your own data. Screenshots and a results file go to
// docs/evidence/e2e/ as evidence for the system test cases.
import { defineConfig } from '@playwright/test'

// Which browser (23 Oct, her request for more browser testing), chosen when running, one per run:
//     npx playwright test                    Chromium (the engine of Chrome, Edge, Opera, Brave)
//     BROWSER=firefox npx playwright test    Firefox          BROWSER=webkit   WebKit (Safari's engine)
//     BROWSER=edge / BROWSER=chrome          Microsoft Edge / Google Chrome as installed on the computer
// Kept in this file on purpose: a small module shared by this file and the tests set off a Node 22.17 bug
// ("Unexpected module status 3") on her laptop. e2e/helpers.js works out the same evidence folder.
const BROWSERS = {
  chromium: { browserName: 'chromium' },
  firefox: { browserName: 'firefox' },
  webkit: { browserName: 'webkit' },
  edge: { browserName: 'chromium', channel: 'msedge' },
  chrome: { browserName: 'chromium', channel: 'chrome' },
}
const BROWSER = (process.env.BROWSER || 'chromium').toLowerCase()
if (!BROWSERS[BROWSER]) throw new Error(`BROWSER=${BROWSER}? Use one of: ${Object.keys(BROWSERS).join(', ')}`)
const EVIDENCE = BROWSER === 'chromium' ? '../docs/evidence/e2e' : `../docs/evidence/e2e/${BROWSER}`

export default defineConfig({
  testDir: './e2e',
  workers: 1,                      // one at a time: the journeys share the e2e accounts
  timeout: 60_000,
  expect: { timeout: 15_000 },     // Job Matches can take a few seconds the first time (the model warms up)
  reporter: [['list'], ['json', { outputFile: `${EVIDENCE}/results.json` }]],
  outputDir: `${EVIDENCE}/failures`,
  use: {
    ...BROWSERS[BROWSER],             // which browser: see the top of this file
    baseURL: 'http://localhost:5173',
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
  },
})
