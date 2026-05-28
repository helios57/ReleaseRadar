#!/usr/bin/env bash
# Polls each service's healthcheck until they're all reporting healthy, then
# fans out additional HTTP probes from the host.
#
# Usage: scripts/wait-for-stack.sh [timeout-seconds]

set -u
TIMEOUT=${1:-300}
SECONDS_ELAPSED=0
INTERVAL=3

probe_http() {
  local url="$1"
  curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || true
}

compose_state() {
  local svc="$1"
  docker compose ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null \
    | awk -v s="$svc" '$1==s { print $2"/"$3 }'
}

echo "==> waiting up to ${TIMEOUT}s for stack to be healthy"

while [ "$SECONDS_ELAPSED" -lt "$TIMEOUT" ]; do
  pg=$(compose_state postgres)
  ldap=$(compose_state openldap)
  kc=$(compose_state keycloak)
  mt=$(compose_state mock-teams)
  be=$(compose_state backend)
  fe=$(compose_state frontend)

  kc_http=$(probe_http http://localhost:8080/realms/releaseradar/.well-known/openid-configuration)
  be_http=$(probe_http http://localhost:8080/healthz)
  fe_http=$(probe_http http://localhost:8080/)
  mt_http=$(probe_http http://localhost:4000/healthz)

  printf '\r[%3ds] postgres=%s openldap=%s keycloak=%s(%s) mock=%s(%s) backend=%s(%s) frontend=%s(%s)' \
    "$SECONDS_ELAPSED" \
    "$pg" "$ldap" "$kc" "$kc_http" "$mt" "$mt_http" "$be" "$be_http" "$fe" "$fe_http"

  if [ "$kc_http" = "200" ] && [ "$be_http" = "200" ] && [ "$fe_http" = "200" ]; then
    echo
    echo "==> stack ready"
    exit 0
  fi

  sleep "$INTERVAL"
  SECONDS_ELAPSED=$((SECONDS_ELAPSED + INTERVAL))
done

echo
echo "!! stack did not converge within ${TIMEOUT}s — recent logs:"
docker compose ps
docker compose logs --tail=80
exit 1
