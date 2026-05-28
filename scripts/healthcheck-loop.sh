#!/usr/bin/env bash
# Continuously probes the public endpoints + mock-teams and logs a one-line
# heartbeat. Use it to detect a hung/wedged stack during long e2e runs.
#
# Usage: scripts/healthcheck-loop.sh [interval-seconds]
#
# Exits non-zero if 3 consecutive probes fail (treat as "stuck").

set -u
INTERVAL=${1:-10}
FAIL=0
MAX_CONSECUTIVE_FAIL=${MAX_FAIL:-3}

probe() {
  local url="$1"
  local code
  code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 4 "$url" 2>/dev/null || echo "000")
  echo "$code"
}

trap 'echo; echo "[healthcheck-loop] stop"; exit 0' INT TERM

while :; do
  ts=$(date -Iseconds)
  kc=$(probe http://localhost:8080/realms/releaseradar/.well-known/openid-configuration)
  be=$(probe http://localhost:8080/healthz)
  fe=$(probe http://localhost:8080/)
  mt=$(probe http://localhost:4000/healthz)

  if [ "$kc" = "200" ] && [ "$be" = "200" ] && [ "$fe" = "200" ] && [ "$mt" = "200" ]; then
    FAIL=0
    echo "[$ts] OK   kc=$kc backend=$be frontend=$fe mock-teams=$mt"
  else
    FAIL=$((FAIL + 1))
    echo "[$ts] WARN kc=$kc backend=$be frontend=$fe mock-teams=$mt (consec-fail=$FAIL)"
    if [ "$FAIL" -ge "$MAX_CONSECUTIVE_FAIL" ]; then
      echo "[$ts] STUCK — $FAIL consecutive failures, dumping logs"
      docker compose ps
      docker compose logs --tail=40
      exit 2
    fi
  fi
  sleep "$INTERVAL"
done
