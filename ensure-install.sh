#!/usr/bin/env bash
# Clone/pull cianwhalley/agent-global-skills and install if stamp is missing or SHA drifted.
#
#   bash ensure-install.sh --face silas
#   bash ensure-install.sh --face cleo
#   bash ensure-install.sh --face cian
#   FACE=silas bash ensure-install.sh   # also accepts env
#
# Cache: ~/.cache/agent-global-skills (override AGENT_GLOBAL_SKILLS_CACHE).
set -euo pipefail

FACE="${FACE:-}"
PREFIX=""
ALSO_CLAUDE=0
CACHE="${AGENT_GLOBAL_SKILLS_CACHE:-$HOME/.cache/agent-global-skills}"
REPO_URL="${AGENT_GLOBAL_SKILLS_REPO:-https://github.com/cianwhalley/agent-global-skills.git}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --face) FACE="${2:?}"; shift 2 ;;
    --prefix) PREFIX="${2:?}"; shift 2 ;;
    --also-claude) ALSO_CLAUDE=1; shift ;;
    --cache) CACHE="${2:?}"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$FACE" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]] && security find-generic-password -s 'agent-vault.cleo-spike' -a token >/dev/null 2>&1; then
    FACE=cian
  elif [[ -f "$HOME/.config/agent-vault/agent-cleo-spike.token" ]] && [[ ! -f "$HOME/.config/agent-vault/agent-silas-spike.token" ]] && [[ "$(uname -s)" != "Darwin" ]]; then
    FACE=cleo
  else
    FACE=silas
  fi
  echo "ensure-install: inferred --face $FACE"
fi

# Private GitHub: use the host transcript token when present (never print).
_git() {
  local token="" f
  for f in \
    "${SILAS_GITHUB_TOKEN_FILE:-}" \
    "${CLEO_GITHUB_TOKEN_FILE:-}" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/silas-agent/credentials/services/github-transcript-token" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/cleo-agent/credentials/services/github-transcript-token"; do
    [[ -n "$f" && -f "$f" ]] || continue
    token="$(tr -d '\n' <"$f")"
    [[ -n "$token" ]] && break
  done
  if [[ -n "$token" ]]; then
    git -c "url.https://x-access-token:${token}@github.com/.insteadOf=https://github.com/" "$@"
  else
    git "$@"
  fi
}

mkdir -p "$(dirname "$CACHE")"
if [[ ! -d "$CACHE/.git" ]]; then
  _git clone --depth 1 "$REPO_URL" "$CACHE"
else
  _git -C "$CACHE" fetch --depth 1 origin
  _git -C "$CACHE" merge --ff-only origin/HEAD 2>/dev/null \
    || _git -C "$CACHE" pull --ff-only
fi

WANT_SHA="$(git -C "$CACHE" rev-parse --short HEAD)"
STAMP="$HOME/.cursor/skills/${PREFIX}secrets/.agent-global-install"
NEED=1
if [[ -f "$STAMP" ]]; then
  HAVE_SHA="$(awk -F= '/^sha=/{print $2}' "$STAMP")"
  HAVE_FACE="$(awk -F= '/^face=/{print $2}' "$STAMP")"
  if [[ "$HAVE_SHA" == "$WANT_SHA" && "$HAVE_FACE" == "$FACE" ]]; then
    NEED=0
  fi
fi

if [[ "$NEED" -eq 0 ]]; then
  echo "ensure-install: secrets already $WANT_SHA face=$FACE"
  exit 0
fi

args=(--face "$FACE")
[[ -n "$PREFIX" ]] && args+=(--prefix "$PREFIX")
[[ "$ALSO_CLAUDE" -eq 1 ]] && args+=(--also-claude)
bash "$CACHE/install.sh" "${args[@]}"
