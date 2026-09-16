#!/usr/bin/env bash
# Install secrets overlay + official agent-vault-cli into personal Cursor skills.
#
#   bash install.sh --face silas
#   bash install.sh --face cleo
#   bash install.sh --face cian
#   bash install.sh --face silas --also-claude
#   bash install.sh --face cian --prefix silas-   # Cian laptop if sharing dest with Christina copy
#   bash install.sh --list --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FACE=""
ALSO_CLAUDE=0
DRY=0
LIST=0
CUSTOM_DEST=""
PREFIX=""
REFRESH_OFFICIAL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --face) FACE="${2:?}"; shift 2 ;;
    --also-claude) ALSO_CLAUDE=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --list) LIST=1; shift ;;
    --prefix) PREFIX="${2:?}"; shift 2 ;;
    --dest) CUSTOM_DEST="${2:?}"; shift 2 ;;
    --no-refresh-official) REFRESH_OFFICIAL=0; shift ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

case "$FACE" in
  silas) VAULT="silas-spike" ;;
  cleo) VAULT="cleo-spike" ;;
  cian) VAULT="picker" ;;
  "")
    echo "install.sh: --face silas|cleo|cian is required" >&2
    exit 2
    ;;
  *)
    echo "install.sh: unknown --face $FACE (silas|cleo|cian)" >&2
    exit 2
    ;;
esac

expand_tilde() {
  local p="$1"
  if [[ "$p" == ~* ]]; then
    echo "${p/#\~/$HOME}"
  else
    echo "$p"
  fi
}

if [[ "$LIST" -eq 1 ]]; then
  echo "face=$FACE vault=$VAULT prefix=${PREFIX:-(none)}"
  echo "  ${PREFIX}secrets"
  echo "  ${PREFIX}agent-vault-cli"
  echo "Default dest: $(expand_tilde ~/.cursor/skills)"
  exit 0
fi

refresh_official() {
  local dest="$ROOT/skills/agent-vault-cli/SKILL.md"
  local addr code
  for addr in "${AGENT_VAULT_ADDR:-}" "http://cleo:14321" "http://127.0.0.1:14321"; do
    [[ -n "$addr" ]] || continue
    code="$(curl -sS -o /tmp/av-cli-skill.md -w '%{http_code}' --max-time 5 "$addr/v1/skills/cli" || true)"
    if [[ "$code" == "200" ]] && grep -q '^name: agent-vault-cli' /tmp/av-cli-skill.md 2>/dev/null; then
      mkdir -p "$(dirname "$dest")"
      cp /tmp/av-cli-skill.md "$dest"
      echo "refreshed official skill from $addr/v1/skills/cli"
      return 0
    fi
  done
  echo "warn: could not refresh /v1/skills/cli (using vendored copy)" >&2
}

if [[ "$REFRESH_OFFICIAL" -eq 1 && "$DRY" -eq 0 ]]; then
  refresh_official || true
fi

dests=()
if [[ -n "$CUSTOM_DEST" ]]; then
  dests+=("$(expand_tilde "$CUSTOM_DEST")")
else
  dests+=("$(expand_tilde ~/.cursor/skills)")
  if [[ "$ALSO_CLAUDE" -eq 1 ]]; then
    dests+=("$(expand_tilde ~/.claude/skills)")
  fi
fi

SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"

install_skill() {
  local id="$1" dest_root="$2"
  local from="$ROOT/skills/$id"
  local to="$dest_root/${PREFIX}${id}"
  if [[ ! -f "$from/SKILL.md" ]]; then
    echo "skip no SKILL.md: $from" >&2
    return 1
  fi
  echo "→ $to  (face=$FACE vault=$VAULT)"
  if [[ "$DRY" -eq 1 ]]; then
    return 0
  fi
  mkdir -p "$dest_root"
  rm -rf "$to"
  mkdir -p "$to"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude .DS_Store "$from/" "$to/"
  else
    cp -R "$from/." "$to/"
  fi
  if [[ "$id" == "secrets" ]]; then
    local tmp
    tmp="$(mktemp)"
    sed -e "s/{{FACE}}/$FACE/g" -e "s/{{VAULT}}/$VAULT/g" "$to/SKILL.md" >"$tmp"
    mv "$tmp" "$to/SKILL.md"
  fi
  printf '%s\n' \
    "repo=cianwhalley/agent-global-skills" \
    "face=$FACE" \
    "vault=$VAULT" \
    "sha=$SHA" \
    "installed=$(date -u +%Y-%m-%dT%H:%MZ)" \
    "source=$from" \
    >"$to/.agent-global-install"
}

for dest in "${dests[@]}"; do
  echo "Installing agent-global-skills → $dest"
  install_skill secrets "$dest"
  install_skill agent-vault-cli "$dest"
done

echo "Done. face=$FACE vault=$VAULT"
echo "  secrets:         ~/.cursor/skills/${PREFIX}secrets"
echo "  agent-vault-cli: ~/.cursor/skills/${PREFIX}agent-vault-cli"
