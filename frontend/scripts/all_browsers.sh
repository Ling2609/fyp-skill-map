#!/usr/bin/env bash
# Browser tests in every browser, one after another, unattended (23 Oct; her "really has to be one by one?").
# They can't run side by side: all browsers would share the e2e database, and the tests change it (Aina applies, a new
# employer signs up...). So for each browser this re-seeds the database, starts the backend on it, runs the tests and
# stops the backend again: what you would do by hand between runs.
#
# Run from frontend/ in Git Bash, with the backend's venv ACTIVE (it starts the backend itself, so stop your own
# backend first; `npm run dev` must be running in another window):
#     source ../backend/venv/Scripts/activate      (if it isn't active yet)
#     bash scripts/all_browsers.sh                  (all five)
#     bash scripts/all_browsers.sh firefox webkit   (only these)
# Each run's log goes to that browser's evidence folder; a summary is printed at the end.
set -u
cd "$(dirname "$0")/.." || exit 1                 # frontend/
BROWSERS=("$@"); [ ${#BROWSERS[@]} -eq 0 ] && BROWSERS=(chromium firefox webkit edge chrome)
DAY=$(date +%F)
E2E_URL=$(grep '^E2E_DATABASE_URL=' ../backend/.env | cut -d= -f2- | tr -d '\r')
[ -z "$E2E_URL" ] && { echo "No E2E_DATABASE_URL in backend/.env (docs/testing/e2e.md, one-time set-up)."; exit 2; }
curl -s -o /dev/null http://localhost:5173 || { echo "Start the frontend first: npm run dev (another window)."; exit 2; }
curl -s -o /dev/null http://localhost:8000/docs && { echo "Something is already running on port 8000: stop your backend first (Ctrl+C)."; exit 2; }

SUMMARY=()
for b in "${BROWSERS[@]}"; do
  echo; echo "=== $b ==="
  dir=../docs/evidence/e2e; [ "$b" != chromium ] && dir=../docs/evidence/e2e/$b
  mkdir -p "$dir"
  (cd ../backend && python scripts/tools/setup_e2e.py) | tail -2
  (cd ../backend && DATABASE_URL="$E2E_URL" exec uvicorn app.main:app --port 8000 > "../docs/evidence/e2e/.backend_$b.log" 2>&1) &
  backend=$!
  for i in $(seq 1 180); do curl -s -o /dev/null http://localhost:8000/docs && break; sleep 1; done   # the model loads first
  BROWSER=$b npx playwright test 2>&1 | tee "$dir/run_$DAY.txt"
  result=$(grep -Eo '[0-9]+ (passed|failed)' "$dir/run_$DAY.txt" | tr '\n' ' ')
  apply=$(grep -Eo 'Apply: click to "Applied" in [0-9]+ ms' "$dir/run_$DAY.txt" | grep -Eo '[0-9]+ ms')
  SUMMARY+=("$(printf '%-9s %-22s apply %s' "$b" "$result" "${apply:-?}")")
  kill "$backend" 2>/dev/null; wait "$backend" 2>/dev/null
  for i in $(seq 1 20); do curl -s -o /dev/null http://localhost:8000/docs || break; sleep 1; done
  rm -f "../docs/evidence/e2e/.backend_$b.log"
done
echo; echo "=== Summary ($DAY) ==="; printf '%s\n' "${SUMMARY[@]}"
