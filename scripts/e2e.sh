#!/usr/bin/env bash
# Top-level e2e orchestrator.
#
# 1. `docker compose up --build -d`
# 2. wait for healthchecks
# 3. start the healthcheck-loop watchdog in the background
# 4. `npm test` in e2e/
# 5. always tear the stack down + collect logs on failure

set -euo pipefail
cd "$(dirname "$0")/.."

LOG_DIR=${LOG_DIR:-./e2e-logs}
mkdir -p "$LOG_DIR"

cleanup() {
  status=$?
  echo "==> tearing down stack (exit=$status)"
  if [ -n "${WATCHDOG_PID:-}" ]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
  fi
  docker compose logs > "$LOG_DIR/compose.log" 2>&1 || true
  docker compose down -v --remove-orphans
  exit "$status"
}
trap cleanup EXIT INT TERM

echo "==> docker compose up --build -d"
docker compose up --build -d

echo "==> waiting for healthy stack"
scripts/wait-for-stack.sh 300

echo "==> starting healthcheck watchdog"
scripts/healthcheck-loop.sh 10 > "$LOG_DIR/healthcheck.log" 2>&1 &
WATCHDOG_PID=$!
echo "    watchdog pid=$WATCHDOG_PID"

echo "==> installing playwright dependencies"
( cd e2e && npm install --no-audit --no-fund )
# --with-deps would install system packages via apt; require them to already
# be installed (CI images / dev machines handle this once).
( cd e2e && npx playwright install chromium )

echo "==> running e2e suite"
( cd e2e && npm test )
