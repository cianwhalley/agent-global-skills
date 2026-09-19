#!/usr/bin/env bash
# linear-router.sh — Thin adapter for multi-org Linear API keys.
#
# Translates per-org env vars (LINEAR_API_KEY_COGNITIVE, etc.) into
# LINEAR_API_KEY + CLAUDE_SKILLS_ORG, then delegates to linear.ts.
# Prefer: source scripts/hub-root.sh && vault_run -- linear-router …
#
# Router-only commands: create-smart, defaults, repo
# Everything else passes through to linear.ts.
set -euo pipefail

_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_SKILLS_ROOT="${SKILLS_ROOT:-${CLEO_SKILLS:-$(cd "$_HERE/../.." && pwd)}}"
_CLAUDE_SCRIPTS="${CLAUDE_SCRIPTS_DIR:-/workspace/extra/claude-scripts}"

if [[ -f "${_HERE}/linear.ts" ]]; then
  LINEAR="node --experimental-strip-types ${_HERE}/linear.ts"
elif [[ -f "${_CLAUDE_SCRIPTS}/linear.ts" ]]; then
  LINEAR="node --experimental-strip-types ${_CLAUDE_SCRIPTS}/linear.ts"
else
  LINEAR="node --experimental-strip-types ${_SKILLS_ROOT}/linear/scripts/linear.ts"
fi

LINEAR_CACHE="${LINEAR_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/silas-agent/linear}"
mkdir -p "$LINEAR_CACHE"
export LINEAR_CACHE_DIR="$LINEAR_CACHE"

usage() {
  cat <<'EOF'
Usage:
  linear-router <org> my
  linear-router <org> team-issues
  linear-router <org> defaults
  linear-router <org> create-smart "Title" ["Description"] [--yes] [--project <name>] [--labels <a,b>] [--priority <level>] [--state <state>] [--assignee <email>] [--no-milestone]
  linear-router <org> <any linear.ts command...>

Org aliases:
  tutor | tutoring | connected-tutors | connected-tutoring | con

Examples:
  linear-router tutor my
  linear-router tutor defaults
  linear-router tutor create-smart "Follow up" "Context..." --yes
  linear-router tutor list --status "In Progress"
  linear-router tutor get CON-42
EOF
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

org_raw="$1"; shift
org_lower="$(echo "$org_raw" | tr '[:upper:]' '[:lower:]')"

# Resolve canonical org key (for linear.ts --org), API key env, credential file, repo
CRED_DIR="${SILAS_CREDENTIALS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/silas-agent/credentials/services}"
WORK_ROOT="${SILAS_WORK_ROOT:-$HOME/work/silas}"

case "$org_lower" in
  tutor|tutoring|connected-tutors|connected-tutoring|con)
    org_key="tutor"
    api_env="LINEAR_API_KEY_TUTORING"
    cred_file="linear-api-key-tutoring"
    repo="${CT_REPO:-$WORK_ROOT/connected-tutoring}"
    if [[ ! -d "$repo/.git" && ! -d "$repo" ]]; then
      for cand in \
        "$HOME/Documents/GitHub/meridian-institute/connected-tutoring" \
        "$HOME/Documents/GitHub/connected-tutoring" \
        "$HOME/work/silas/connected-tutoring"; do
        if [[ -d "$cand/.git" || -d "$cand" ]]; then
          repo="$cand"
          break
        fi
      done
    fi
    profile_project="Administration"
    profile_labels=""
    profile_priority="medium"
    profile_state="todo"
    ;;
  ct|copperteams|copper|cog|ctci|cognitive|cognitive-tech|cognitivetech|gan|ganttsy)
    echo "Silas Linear is tutor/CON only. Use Cleo for org '$org_raw'." >&2
    exit 2
    ;;
  *)
    echo "Unknown org: $org_raw"
    usage
    exit 2
    ;;
esac

# Load key: env (incl. vault spelling GANTASY) → local cred file
load_linear_key() {
  local v="${!api_env:-}"
  if [[ -z "$v" && "$api_env" == "LINEAR_API_KEY_GANTTSY" ]]; then
    v="${LINEAR_API_KEY_GANTASY:-}"
  fi
  if [[ -z "$v" && -f "$CRED_DIR/$cred_file" ]]; then
    v="$(tr -d '[:space:]' < "$CRED_DIR/$cred_file")"
  fi
  if [[ -z "$v" && "$cred_file" == "linear-api-key-ganttsy" && -f "$CRED_DIR/linear-api-key-gantasy" ]]; then
    v="$(tr -d '[:space:]' < "$CRED_DIR/linear-api-key-gantasy")"
  fi
  printf '%s' "$v"
}

export LINEAR_API_KEY="$(load_linear_key)"
export "${api_env}=${LINEAR_API_KEY}"
if [[ "$api_env" == "LINEAR_API_KEY_GANTTSY" ]]; then
  export LINEAR_API_KEY_GANTASY="${LINEAR_API_KEY}"
fi
export CLAUDE_SKILLS_ORG="$org_key"
export LINEAR_ORG="$org_key"

if [[ -z "$LINEAR_API_KEY" ]]; then
  echo "Error: missing Linear key for $org_raw (set $api_env or $CRED_DIR/$cred_file)" >&2
  echo "Note: vault Linear service is passthrough — MITM cannot pick among orgs on api.linear.app." >&2
  exit 1
fi

# Ensure linear.ts sees --org even if callers omit it
LINEAR="$LINEAR --org $org_key"

cmd="${1:-}"

# ── Router-only commands ─────────────────────────────────────────────────────

# repo — print the local repo path for this org
if [[ "$cmd" == "repo" ]]; then
  echo "$repo"
  exit 0
fi

# defaults — show the org's create profile
if [[ "$cmd" == "defaults" ]]; then
  cat <<EOF
Org: $org_raw  →  key: $org_key
Repo: $repo
Default create profile:
  project:  ${profile_project:-(none)}
  labels:   ${profile_labels:-(none)}
  priority: ${profile_priority:-(none)}
  state:    ${profile_state:-(none)}
  assignee: me
EOF
  exit 0
fi

# create-smart — interactive create with org-profile defaults
if [[ "$cmd" == "create-smart" ]]; then
  shift || true
  title="${1:-}"; shift || true
  description="${1:-}"; shift || true

  if [[ -z "$title" ]]; then
    echo "Usage: linear-router <org> create-smart \"Title\" [\"Description\"] [--yes] [overrides...]" >&2
    exit 1
  fi

  confirm="no"
  project="$profile_project"
  labels="$profile_labels"
  priority="$profile_priority"
  state="$profile_state"
  assignee="me"
  no_milestone="no"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes)       confirm="yes"; shift ;;
      --project)   project="${2:-}"; shift 2 ;;
      --labels)    labels="${2:-}"; shift 2 ;;
      --priority)  priority="${2:-}"; shift 2 ;;
      --state)     state="${2:-}"; shift 2 ;;
      --assignee)  assignee="${2:-}"; shift 2 ;;
      --no-milestone) no_milestone="yes"; shift ;;
      *) echo "Unknown create-smart option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ "$confirm" != "yes" ]]; then
    cat <<EOF
Planned create for $org_raw:
  title:    $title
  project:  ${project:-(none)}
  labels:   ${labels:-(none)}
  priority: ${priority:-(none)}
  state:    ${state:-(none)}
  assignee: ${assignee}

Re-run with --yes to create.
EOF
    exit 0
  fi

  args=(create "$title")
  [[ -n "$description" ]]  && args+=(-d "$description")
  [[ -n "$labels" ]]       && args+=(--labels "$labels")
  [[ -n "$priority" ]]     && args+=(-p "$priority")
  [[ -n "$state" ]]        && args+=(-s "$state")
  [[ -n "$project" ]]      && args+=(--project "$project")
  [[ "$no_milestone" == "yes" ]] && args+=(--no-milestone)

  $LINEAR "${args[@]}" --assignee "$assignee"
  exit $?
fi

# ── Pass-through to canonical linear.ts ──────────────────────────────────────

# Map legacy / short command names → linear.ts
if [[ "$cmd" == "my" || "$cmd" == "my-issues" ]]; then
  shift
  $LINEAR my-issues "$@"
elif [[ "$cmd" == "team" ]]; then
  shift
  $LINEAR team-issues "$@"
else
  $LINEAR "$@"
fi
