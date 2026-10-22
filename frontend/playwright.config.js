// Browser (end-to-end) tests, 22 Oct (system testing step 2; how to run: docs/testing/e2e.md).
// They click through the real app: the frontend (npm run dev, port 5173) and the backend on the SEPARATE e2e
// database (backend/scripts/tools/setup_e2e.py fills it), never your own data. Screenshots and a results file go to
// docs/evidence/e2e/ as evidence for the system test cases.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,                      // one at a time: the journeys share the e2e accounts
  timeout: 60_000,
  expect: { timeout: 15_000 },     // Job Matches can take a few seconds the first time (the model warms up)
  reporter: [['list'], ['json', { outputFile: '../docs/evidence/e2e/results.json' }]],
  outputDir: '../docs/evidence/e2e/failures',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
  },
})
