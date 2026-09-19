#!/usr/bin/env bash
# Find CT vault-env (silas-spike), then run linear-router under vault_run.
# Linear is passthrough — MITM cannot pick among orgs on api.linear.app.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_vault_env() {
  local cand
  for cand in \
    "${CT_VAULT_ENV:-}" \
    "${CONNECTED_TUTORING_ROOT:+$CONNECTED_TUTORING_ROOT/scripts/vault-env.sh}" \
    "$PWD/scripts/vault-env.sh" \
    "$HOME/Documents/GitHub/meridian-institute/connected-tutoring/scripts/vault-env.sh" \
    "$HOME/work/silas/connected-tutoring/scripts/vault-env.sh" \
    "$HOME/slack-workspace/silas-agent/scripts/vault-env.sh" \
    "$HOME/workspaces/silas-agent/scripts/vault-env.sh"; do
    [[ -n "$cand" && -f "$cand" ]] || continue
    printf '%s' "$cand"
    return 0
  done
  return 1
}

VE="$(find_vault_env)" || {
  echo "linear: could not find vault-env.sh (open connected-tutoring, or set CT_VAULT_ENV)" >&2
  exit 1
}
# shellcheck disable=SC1090
source "$VE"

if [[ "$(uname -s)" == "Darwin" ]]; then
  case "${AGENT_VAULT_ADDR:-}" in
    http://127.0.0.1:*|http://localhost:*)
      export AGENT_VAULT_ADDR="http://cleo:14321"
      ;;
  esac
fi

if ! declare -F vault_run >/dev/null 2>&1; then
  echo "linear: vault_run missing after sourcing $VE" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- tutor my
fi

vault_run -- bash "$HERE/linear-router.sh" "$@"
